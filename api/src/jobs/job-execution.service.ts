import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ComplianceService } from "../compliance/compliance.service";
import { getTechnicianChecklist } from "../common/business-config";
import { ActivityService } from "../events/activity.service";
import { PrismaService } from "../prisma/prisma.service";

type ChecklistItem = {
  key: string;
  label: string;
  completed: boolean;
  note?: string | null;
};

@Injectable()
export class JobExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly compliance: ComplianceService,
  ) {}

  private async resolveJob(tenantId: string, jobId: string) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({
      where: { id: jobId, companyId: tenantId },
      select: {
        id: true,
        companyId: true,
        customerId: true,
        customerName: true,
        jobRef: true,
        status: true,
        serviceName: true,
        assignedUserId: true,
        vehicleMake: true,
        vehicleModel: true,
        vehicleReg: true,
      },
    });
    if (!job) throw new NotFoundException("Job not found");
    return job;
  }

  private async getDefaultChecklist(tenantId: string) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({
      where: { tenantId },
      select: { businessConfigJson: true },
    });
    const checklist = getTechnicianChecklist(settings);
    return checklist.map((label, index) => ({
      key: `checklist_${index + 1}`,
      label,
      completed: false,
      note: null,
    }));
  }

  private normalizeChecklist(input: any, fallback: ChecklistItem[]) {
    if (!Array.isArray(input) || !input.length) return fallback;
    return input
      .filter((item) => item && typeof item === "object")
      .map((item: any, index: number) => ({
        key: String(item.key || `checklist_${index + 1}`),
        label: String(item.label || "").trim() || `Checklist item ${index + 1}`,
        completed: Boolean(item.completed),
        note: typeof item.note === "string" && item.note.trim() ? item.note.trim() : null,
      }));
  }

  private serializeEvidence(row: any, customerSafe = false) {
    const artifact = row?.artifact || null;
    if (customerSafe && artifact && !artifact.portalVisible) {
      return null;
    }
    if (customerSafe && row.kind === "NOTE" && !artifact) {
      return null;
    }
    return {
      id: row.id,
      kind: row.kind,
      label: row.label,
      artifactId: row.artifactId || null,
      payloadJson: row.payloadJson ?? null,
      createdBy: row.createdBy || null,
      createdAt: row.createdAt,
      artifact: artifact
        ? {
            id: artifact.id,
            label: artifact.label,
            kind: artifact.kind,
            portalVisible: Boolean(artifact.portalVisible),
          }
        : null,
    };
  }

  private serializeRecord(row: any, fallbackChecklist: ChecklistItem[], customerSafe = false) {
    if (!row) return null;
    const checklist = this.normalizeChecklist(row.checklistJson, fallbackChecklist);
    const evidence = (row.evidence || [])
      .map((item: any) => this.serializeEvidence(item, customerSafe))
      .filter(Boolean);

    return {
      id: row.id,
      status: row.status,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      submittedAt: row.submittedAt,
      acknowledgedAt: row.acknowledgedAt,
      summary: row.summary || null,
      checklist,
      notesJson: customerSafe
        ? {
            completionNotes: row.notesJson?.completionNotes || null,
            customerAcknowledgementNote: row.notesJson?.customerAcknowledgementNote || null,
          }
        : (row.notesJson ?? null),
      technician: row.technician
        ? {
            id: row.technician.id,
            email: row.technician.email,
          }
        : null,
      evidence,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async getLatestRecord(tenantId: string, jobId: string) {
    const db = this.prisma as any;
    return db.jobExecutionRecord.findFirst({
      where: { tenantId, jobId },
      include: {
        technician: { select: { id: true, email: true } },
        evidence: {
          include: {
            artifact: {
              select: { id: true, label: true, kind: true, portalVisible: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
  }

  private async createExecutionRecord(tenantId: string, job: any, technicianId: string | null, summary?: string | null) {
    const db = this.prisma as any;
    const latest = await this.getLatestRecord(tenantId, job.id);
    const status = latest && ["SUBMITTED", "ACKNOWLEDGED"].includes(String(latest.status)) ? "REVISED" : "IN_PROGRESS";
    const checklist = await this.getDefaultChecklist(tenantId);

    const created = await db.jobExecutionRecord.create({
      data: {
        tenantId,
        jobId: job.id,
        technicianId: technicianId || job.assignedUserId || null,
        status,
        startedAt: new Date(),
        summary: String(summary || "").trim() || null,
        checklistJson: checklist,
        notesJson: {},
      },
      include: {
        technician: { select: { id: true, email: true } },
        evidence: {
          include: {
            artifact: {
              select: { id: true, label: true, kind: true, portalVisible: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    await this.logExecutionActivity(tenantId, job, technicianId, "job.execution.started", `Started execution record for ${job.jobRef || job.id}`, {
      executionRecordId: created.id,
      status: created.status,
    });
    return created;
  }

  private async resolveEditableRecord(tenantId: string, job: any, technicianId: string | null, summary?: string | null) {
    const latest = await this.getLatestRecord(tenantId, job.id);
    if (latest && ["IN_PROGRESS", "REVISED"].includes(String(latest.status))) {
      return latest;
    }
    return this.createExecutionRecord(tenantId, job, technicianId, summary);
  }

  private async logExecutionActivity(
    tenantId: string,
    job: any,
    actorUserId: string | null,
    type: string,
    label: string,
    payloadJson?: Record<string, any>,
  ) {
    const db = this.prisma as any;
    await db.jobActivity.create({
      data: {
        companyId: tenantId,
        jobId: job.id,
        actorUserId,
        eventType: type,
        message: label,
        payloadJson: payloadJson ?? null,
      },
    });
    await this.activity.push({
      tenantId,
      type,
      label,
      jobId: job.id,
      jobRef: job.jobRef || null,
      customerId: job.customerId || null,
      customerName: job.customerName || null,
      status: job.status || null,
      payloadJson: payloadJson ?? null,
    });
  }

  async getExecutionForJob(tenantId: string, jobId: string) {
    const job = await this.resolveJob(tenantId, jobId);
    const [fallbackChecklist, record] = await Promise.all([
      this.getDefaultChecklist(tenantId),
      this.getLatestRecord(tenantId, jobId),
    ]);
    return {
      jobId: job.id,
      jobRef: job.jobRef,
      jobStatus: job.status,
      assignedUserId: job.assignedUserId || null,
      record: this.serializeRecord(record, fallbackChecklist, false),
    };
  }

  async getCompletionWorkspace(tenantId: string, jobId: string) {
    const job = await this.resolveJob(tenantId, jobId);
    const [fallbackChecklist, record] = await Promise.all([
      this.getDefaultChecklist(tenantId),
      this.getLatestRecord(tenantId, jobId),
    ]);
    return {
      jobId: job.id,
      jobRef: job.jobRef,
      jobStatus: job.status,
      customerName: job.customerName || null,
      serviceName: job.serviceName || null,
      vehicleLabel: [job.vehicleMake, job.vehicleModel, job.vehicleReg].filter(Boolean).join(' ') || null,
      checklistTemplate: fallbackChecklist,
      record: this.serializeRecord(record, fallbackChecklist, false),
    };
  }

  async getCustomerVisibleExecution(tenantId: string, customerId: string, jobId: string) {
    const job = await this.resolveJob(tenantId, jobId);
    if (job.customerId !== customerId) {
      throw new NotFoundException("Job not found");
    }
    const [fallbackChecklist, record] = await Promise.all([
      this.getDefaultChecklist(tenantId),
      this.getLatestRecord(tenantId, jobId),
    ]);
    if (!record || !["SUBMITTED", "ACKNOWLEDGED"].includes(String(record.status))) {
      return null;
    }
    return this.serializeRecord(record, fallbackChecklist, true);
  }

  async startExecution(tenantId: string, technicianId: string, jobId: string, summary?: string | null) {
    const job = await this.resolveJob(tenantId, jobId);
    if (job.assignedUserId !== technicianId) {
      throw new BadRequestException("Job is not assigned to this technician");
    }
    const fallbackChecklist = await this.getDefaultChecklist(tenantId);
    const record = await this.resolveEditableRecord(tenantId, job, technicianId, summary);
    return this.serializeRecord(record, fallbackChecklist, false);
  }

  async updateExecution(
    tenantId: string,
    technicianId: string,
    jobId: string,
    input: { summary?: string | null; checklist?: any[]; notesJson?: Record<string, any> | null },
  ) {
    const db = this.prisma as any;
    const job = await this.resolveJob(tenantId, jobId);
    if (job.assignedUserId !== technicianId) {
      throw new BadRequestException("Job is not assigned to this technician");
    }
    const fallbackChecklist = await this.getDefaultChecklist(tenantId);
    const record = await this.resolveEditableRecord(tenantId, job, technicianId, input.summary);
    const updated = await db.jobExecutionRecord.update({
      where: { id: record.id },
      data: {
        summary: input.summary !== undefined ? String(input.summary || "").trim() || null : record.summary,
        checklistJson: input.checklist !== undefined ? this.normalizeChecklist(input.checklist, fallbackChecklist) : record.checklistJson,
        notesJson: input.notesJson !== undefined ? (input.notesJson ?? {}) : (record.notesJson ?? {}),
        startedAt: record.startedAt || new Date(),
        technicianId,
        status: record.status === "IN_PROGRESS" ? "IN_PROGRESS" : "REVISED",
      },
      include: {
        technician: { select: { id: true, email: true } },
        evidence: {
          include: {
            artifact: {
              select: { id: true, label: true, kind: true, portalVisible: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    await this.logExecutionActivity(tenantId, job, technicianId, "job.execution.updated", `Updated execution record for ${job.jobRef || job.id}`, {
      executionRecordId: updated.id,
      status: updated.status,
    });
    return this.serializeRecord(updated, fallbackChecklist, false);
  }

  async updateExecutionFromCompletionLink(
    tenantId: string,
    jobId: string,
    input: { summary?: string | null; checklist?: any[]; notesJson?: Record<string, any> | null },
  ) {
    const db = this.prisma as any;
    const job = await this.resolveJob(tenantId, jobId);
    const fallbackChecklist = await this.getDefaultChecklist(tenantId);
    const record = await this.resolveEditableRecord(tenantId, job, job.assignedUserId || null, input.summary);
    const updated = await db.jobExecutionRecord.update({
      where: { id: record.id },
      data: {
        summary: input.summary !== undefined ? String(input.summary || '').trim() || null : record.summary,
        checklistJson: input.checklist !== undefined ? this.normalizeChecklist(input.checklist, fallbackChecklist) : record.checklistJson,
        notesJson: input.notesJson !== undefined ? (input.notesJson ?? {}) : (record.notesJson ?? {}),
        startedAt: record.startedAt || new Date(),
        technicianId: record.technicianId || job.assignedUserId || null,
        status: record.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'REVISED',
      },
      include: {
        technician: { select: { id: true, email: true } },
        evidence: {
          include: {
            artifact: {
              select: { id: true, label: true, kind: true, portalVisible: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    await this.logExecutionActivity(tenantId, job, null, 'job.execution.quick_link_updated', `Updated completion record from a device handoff for ${job.jobRef || job.id}`, {
      executionRecordId: updated.id,
      status: updated.status,
    });
    return this.serializeRecord(updated, fallbackChecklist, false);
  }

  async addEvidence(
    tenantId: string,
    technicianId: string,
    jobId: string,
    input: { kind: string; label: string; artifactId?: string | null; payloadJson?: Record<string, any> | null },
  ) {
    const db = this.prisma as any;
    const job = await this.resolveJob(tenantId, jobId);
    if (job.assignedUserId !== technicianId) {
      throw new BadRequestException("Job is not assigned to this technician");
    }
    const fallbackChecklist = await this.getDefaultChecklist(tenantId);
    const record = await this.resolveEditableRecord(tenantId, job, technicianId);

    let artifactId: string | null = null;
    if (input.artifactId) {
      const artifact = await db.documentArtifact.findFirst({
        where: {
          id: input.artifactId,
          tenantId,
          entityType: "JOB",
          entityId: job.id,
        },
        select: { id: true },
      });
      if (!artifact) {
        throw new BadRequestException("Artifact must belong to this job");
      }
      artifactId = artifact.id;
    }

    await db.jobExecutionEvidence.create({
      data: {
        tenantId,
        jobId: job.id,
        executionRecordId: record.id,
        kind: input.kind,
        label: String(input.label || "").trim(),
        artifactId,
        payloadJson: input.payloadJson ?? null,
        createdBy: technicianId,
      },
    });

    const refreshed = await this.getLatestRecord(tenantId, job.id);
    await this.logExecutionActivity(tenantId, job, technicianId, "job.execution.evidence_added", `Added execution evidence for ${job.jobRef || job.id}`, {
      executionRecordId: record.id,
      kind: input.kind,
      artifactId,
    });
    await this.compliance.syncSlaForEntity(tenantId, "JOB", job.id);
    return this.serializeRecord(refreshed, fallbackChecklist, false);
  }

  async addEvidenceFromCompletionLink(
    tenantId: string,
    jobId: string,
    input: { kind: string; label: string; payloadJson?: Record<string, any> | null },
  ) {
    const db = this.prisma as any;
    const job = await this.resolveJob(tenantId, jobId);
    const fallbackChecklist = await this.getDefaultChecklist(tenantId);
    const record = await this.resolveEditableRecord(tenantId, job, job.assignedUserId || null);

    await db.jobExecutionEvidence.create({
      data: {
        tenantId,
        jobId: job.id,
        executionRecordId: record.id,
        kind: input.kind,
        label: String(input.label || '').trim(),
        payloadJson: input.payloadJson ?? null,
        createdBy: job.assignedUserId || null,
      },
    });

    const refreshed = await this.getLatestRecord(tenantId, job.id);
    await this.logExecutionActivity(tenantId, job, null, 'job.execution.quick_link_evidence_added', `Added completion evidence from a device handoff for ${job.jobRef || job.id}`, {
      executionRecordId: record.id,
      kind: input.kind,
    });
    await this.compliance.syncSlaForEntity(tenantId, 'JOB', job.id);
    return this.serializeRecord(refreshed, fallbackChecklist, false);
  }

  async submitExecution(
    tenantId: string,
    technicianId: string,
    jobId: string,
    input: { summary?: string | null; checklist?: any[]; notesJson?: Record<string, any> | null },
  ) {
    const db = this.prisma as any;
    const job = await this.resolveJob(tenantId, jobId);
    if (job.assignedUserId !== technicianId) {
      throw new BadRequestException("Job is not assigned to this technician");
    }
    const fallbackChecklist = await this.getDefaultChecklist(tenantId);
    const record = await this.resolveEditableRecord(tenantId, job, technicianId, input.summary);
    const checklist = input.checklist !== undefined ? this.normalizeChecklist(input.checklist, fallbackChecklist) : this.normalizeChecklist(record.checklistJson, fallbackChecklist);
    if (!checklist.length) {
      throw new BadRequestException("Checklist is required");
    }

    const updated = await db.jobExecutionRecord.update({
      where: { id: record.id },
      data: {
        status: "SUBMITTED",
        summary: input.summary !== undefined ? String(input.summary || "").trim() || null : record.summary,
        checklistJson: checklist,
        notesJson: input.notesJson !== undefined ? (input.notesJson ?? {}) : (record.notesJson ?? {}),
        startedAt: record.startedAt || new Date(),
        completedAt: new Date(),
        submittedAt: new Date(),
      },
      include: {
        technician: { select: { id: true, email: true } },
        evidence: {
          include: {
            artifact: {
              select: { id: true, label: true, kind: true, portalVisible: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    await this.logExecutionActivity(tenantId, job, technicianId, "job.execution.submitted", `Submitted completion record for ${job.jobRef || job.id}`, {
      executionRecordId: updated.id,
      status: updated.status,
    });
    await this.compliance.syncSlaForEntity(tenantId, "JOB", job.id);
    return this.serializeRecord(updated, fallbackChecklist, false);
  }

  async submitExecutionFromCompletionLink(
    tenantId: string,
    jobId: string,
    input: {
      summary?: string | null;
      checklist?: any[];
      notesJson?: Record<string, any> | null;
      evidenceNote?: string | null;
      signatureName?: string | null;
      signatureDataUrl?: string | null;
    },
  ) {
    if (input.signatureDataUrl && !String(input.signatureDataUrl).startsWith('data:image')) {
      throw new BadRequestException('Invalid signature data');
    }
    if (input.signatureDataUrl && String(input.signatureDataUrl).length > 300_000) {
      throw new BadRequestException('Signature data too large');
    }

    if (String(input.evidenceNote || '').trim()) {
      await this.addEvidenceFromCompletionLink(tenantId, jobId, {
        kind: 'NOTE',
        label: String(input.evidenceNote || '').trim(),
        payloadJson: { source: 'job_completion_quick_link' },
      });
    }
    if (String(input.signatureName || '').trim() || String(input.signatureDataUrl || '').trim()) {
      await this.addEvidenceFromCompletionLink(tenantId, jobId, {
        kind: 'SIGNATURE',
        label: String(input.signatureName || '').trim() || 'Technician sign-off',
        payloadJson: {
          source: 'job_completion_quick_link',
          signerName: String(input.signatureName || '').trim() || null,
          dataUrl: input.signatureDataUrl || null,
        },
      });
    }

    const db = this.prisma as any;
    const job = await this.resolveJob(tenantId, jobId);
    const fallbackChecklist = await this.getDefaultChecklist(tenantId);
    const record = await this.resolveEditableRecord(tenantId, job, job.assignedUserId || null, input.summary);
    const checklist = input.checklist !== undefined ? this.normalizeChecklist(input.checklist, fallbackChecklist) : this.normalizeChecklist(record.checklistJson, fallbackChecklist);
    if (!checklist.length) {
      throw new BadRequestException('Checklist is required');
    }

    const updated = await db.jobExecutionRecord.update({
      where: { id: record.id },
      data: {
        status: 'SUBMITTED',
        summary: input.summary !== undefined ? String(input.summary || '').trim() || null : record.summary,
        checklistJson: checklist,
        notesJson: input.notesJson !== undefined ? (input.notesJson ?? {}) : (record.notesJson ?? {}),
        startedAt: record.startedAt || new Date(),
        completedAt: new Date(),
        submittedAt: new Date(),
        technicianId: record.technicianId || job.assignedUserId || null,
      },
      include: {
        technician: { select: { id: true, email: true } },
        evidence: {
          include: {
            artifact: {
              select: { id: true, label: true, kind: true, portalVisible: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    await this.logExecutionActivity(tenantId, job, null, 'job.execution.quick_link_submitted', `Submitted completion record from a device handoff for ${job.jobRef || job.id}`, {
      executionRecordId: updated.id,
      status: updated.status,
    });
    await this.compliance.syncSlaForEntity(tenantId, 'JOB', job.id);
    return this.serializeRecord(updated, fallbackChecklist, false);
  }

  async acknowledgeExecution(tenantId: string, customerId: string, jobId: string, note?: string | null) {
    const db = this.prisma as any;
    const job = await this.resolveJob(tenantId, jobId);
    if (job.customerId !== customerId) {
      throw new NotFoundException("Job not found");
    }
    const fallbackChecklist = await this.getDefaultChecklist(tenantId);
    const record = await this.getLatestRecord(tenantId, job.id);
    if (!record || record.status !== "SUBMITTED") {
      throw new BadRequestException("No submitted completion record is awaiting acknowledgement");
    }

    const updated = await db.jobExecutionRecord.update({
      where: { id: record.id },
      data: {
        status: "ACKNOWLEDGED",
        acknowledgedAt: new Date(),
        notesJson: {
          ...(record.notesJson && typeof record.notesJson === "object" ? record.notesJson : {}),
          customerAcknowledgementNote: String(note || "").trim() || null,
        },
      },
      include: {
        technician: { select: { id: true, email: true } },
        evidence: {
          include: {
            artifact: {
              select: { id: true, label: true, kind: true, portalVisible: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    await db.jobExecutionEvidence.create({
      data: {
        tenantId,
        jobId: job.id,
        executionRecordId: record.id,
        kind: "CUSTOMER_ACKNOWLEDGEMENT",
        label: "Customer acknowledged completion",
        payloadJson: {
          note: String(note || "").trim() || null,
        },
      },
    });

    await this.logExecutionActivity(tenantId, job, null, "job.execution.acknowledged", `Customer acknowledged completion for ${job.jobRef || job.id}`, {
      executionRecordId: updated.id,
      note: String(note || "").trim() || null,
    });

    const refreshed = await this.getLatestRecord(tenantId, job.id);
    await this.compliance.syncSlaForEntity(tenantId, "JOB", job.id);
    return this.serializeRecord(refreshed, fallbackChecklist, true);
  }
}
