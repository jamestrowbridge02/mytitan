import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ActivityService } from "../events/activity.service";
import { promises as fs } from "fs";
import { dirname, join, resolve } from "path";
import { AuditService } from "../audit/audit.service";
import { assertUploadAllowed, UPLOAD_LIMITS } from "../common/upload-policy";

type ArtifactEntityType = "JOB" | "CUSTOMER";
type ArtifactKind =
  | "INVOICE"
  | "RECEIPT"
  | "ESTIMATE"
  | "PAYMENT"
  | "COMPLIANCE"
  | "COMPLIANCE_DOC"
  | "BEFORE_PHOTO"
  | "AFTER_PHOTO"
  | "DAMAGE_PHOTO"
  | "TORQUE_EVIDENCE"
  | "PAYMENT_EVIDENCE"
  | "SUPPLIER_DOC"
  | "VIDEO"
  | "EVIDENCE"
  | "EXPORT"
  | "JOB_ATTACHMENT"
  | "CUSTOMER_ATTACHMENT"
  | "PORTAL_DOCUMENT";

type ArtifactRecord = {
  id: string;
  tenantId: string;
  entityType: ArtifactEntityType;
  entityId: string;
  kind: ArtifactKind;
  label: string;
  fileName?: string | null;
  storagePath?: string | null;
  externalUrl?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  portalVisible: boolean;
  createdByUserId?: string | null;
  createdAt: Date;
};

const MEDIA_GOVERNANCE_FOLDERS = [
  "before-photos",
  "after-photos",
  "videos",
  "signatures",
  "compliance",
  "invoices",
  "payment-evidence",
  "torque-evidence",
  "supplier-documents",
  "warranty-documents",
] as const;

function normalizeEntityType(value: string): ArtifactEntityType {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "JOB" || normalized === "CUSTOMER") return normalized;
  throw new BadRequestException("Unsupported artifact entity type");
}

function normalizeArtifactKind(entityType: ArtifactEntityType, value: string): ArtifactKind {
  const normalized = String(value || "").trim().toUpperCase();
  const allowed: Record<ArtifactEntityType, ArtifactKind[]> = {
    JOB: [
      "INVOICE",
      "RECEIPT",
      "ESTIMATE",
      "PAYMENT",
      "COMPLIANCE",
      "COMPLIANCE_DOC",
      "BEFORE_PHOTO",
      "AFTER_PHOTO",
      "DAMAGE_PHOTO",
      "TORQUE_EVIDENCE",
      "PAYMENT_EVIDENCE",
      "SUPPLIER_DOC",
      "VIDEO",
      "EVIDENCE",
      "EXPORT",
      "JOB_ATTACHMENT",
      "PORTAL_DOCUMENT",
    ],
    CUSTOMER: ["CUSTOMER_ATTACHMENT", "COMPLIANCE", "EXPORT"],
  };
  if (allowed[entityType].includes(normalized as ArtifactKind)) {
    return normalized as ArtifactKind;
  }
  throw new BadRequestException("Unsupported artifact kind for entity");
}

@Injectable()
export class ArtifactsService {
  private readonly logger = new Logger(ArtifactsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly audit: AuditService,
  ) {}

  private rootDir() {
    return resolve(process.cwd(), process.env.ARTIFACTS_STORAGE_ROOT || "uploads/artifacts");
  }

  private relativeStoragePath(tenantId: string, entityType: ArtifactEntityType, entityId: string, fileName: string) {
    return join(tenantId, entityType.toLowerCase(), entityId, fileName);
  }

  private absoluteStoragePath(storagePath: string) {
    return resolve(this.rootDir(), storagePath);
  }

  private ensureLocalPath(storagePath: string) {
    const resolved = this.absoluteStoragePath(storagePath);
    const root = this.rootDir();
    if (!resolved.startsWith(root)) {
      throw new BadRequestException("Invalid artifact storage path");
    }
    return resolved;
  }

  private asBoolean(value: any) {
    return value === true || value === "true" || value === "1" || value === 1;
  }

  private formatBytes(value?: number | null) {
    const size = Number(value || 0);
    if (!size) return null;
    if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    if (size >= 1024) return `${Math.round(size / 1024)} KB`;
    return `${size} B`;
  }

  private buildManagedDownloadPath(id: string) {
    return `/artifacts/file/${id}`;
  }

  private folderFor(record: Pick<ArtifactRecord, "entityType" | "kind" | "portalVisible">) {
    const kind = String(record.kind || "");
    if (record.entityType === "CUSTOMER") return record.portalVisible ? "customer/shared" : "customer/private";
    if (kind === "ESTIMATE") return "estimate";
    if (kind === "INVOICE") return "invoices";
    if (kind === "PAYMENT" || kind === "RECEIPT") return "invoice-payment";
    if (kind === "COMPLIANCE" || kind === "COMPLIANCE_DOC") return "compliance";
    if (kind === "BEFORE_PHOTO") return "before-photos";
    if (kind === "AFTER_PHOTO") return "after-photos";
    if (kind === "DAMAGE_PHOTO") return "damage-photos";
    if (kind === "TORQUE_EVIDENCE") return "torque-evidence";
    if (kind === "PAYMENT_EVIDENCE") return "payment-evidence";
    if (kind === "SUPPLIER_DOC") return "supplier-documents";
    if (kind === "VIDEO") return "videos";
    if (kind === "EVIDENCE" || kind === "PORTAL_DOCUMENT") return "evidence";
    if (kind === "EXPORT") return "exports";
    return "job";
  }

  private buildPublicDownloadPath(jobToken: string, artifactId: string) {
    return `/public/job/${jobToken}/artifacts/${artifactId}`;
  }

  private toArtifactView(record: ArtifactRecord, options?: { publicToken?: string | null; publicView?: boolean }) {
    const isManaged = Boolean(record.storagePath);
    const downloadPath = options?.publicView
      ? isManaged && options.publicToken
        ? this.buildPublicDownloadPath(options.publicToken, record.id)
        : null
      : isManaged
      ? this.buildManagedDownloadPath(record.id)
      : null;

    return {
      id: record.id,
      entityType: record.entityType.toLowerCase(),
      entityId: record.entityId,
      kind: record.kind,
      label: record.label,
      fileName: record.fileName || null,
      mimeType: record.mimeType || null,
      sizeBytes: record.sizeBytes ?? null,
      sizeLabel: this.formatBytes(record.sizeBytes),
      portalVisible: Boolean(record.portalVisible),
      folder: this.folderFor(record),
      tags: [record.kind.toLowerCase().replaceAll("_", "-"), this.folderFor(record), record.portalVisible ? "customer-visible" : "private"].filter(Boolean),
      createdAt: record.createdAt,
      source: "managed",
      managed: isManaged,
      downloadPath,
      downloadUrl: record.externalUrl || downloadPath,
      deletable: true,
    };
  }

  private toLegacyArtifactView(params: {
    id: string;
    entityType: ArtifactEntityType;
    entityId: string;
    kind: ArtifactKind;
    label: string;
    url: string;
    portalVisible?: boolean;
    createdAt?: Date | null;
  }) {
    return {
      id: params.id,
      entityType: params.entityType.toLowerCase(),
      entityId: params.entityId,
      kind: params.kind,
      label: params.label,
      fileName: null,
      mimeType: null,
      sizeBytes: null,
      sizeLabel: null,
      portalVisible: Boolean(params.portalVisible),
      folder: this.folderFor({ entityType: params.entityType, kind: params.kind, portalVisible: Boolean(params.portalVisible) }),
      tags: [params.kind.toLowerCase().replaceAll("_", "-"), this.folderFor({ entityType: params.entityType, kind: params.kind, portalVisible: Boolean(params.portalVisible) })],
      createdAt: params.createdAt || null,
      source: "legacy",
      managed: false,
      downloadPath: null,
      downloadUrl: params.url,
      deletable: false,
    };
  }

  private async ensureEntityExists(tenantId: string, entityType: ArtifactEntityType, entityId: string) {
    const db = this.prisma as any;
    if (entityType === "JOB") {
      const job = await db.job.findFirst({
        where: { id: entityId, companyId: tenantId },
        select: {
          id: true,
          jobRef: true,
          customerId: true,
          customerName: true,
          invoicePdfUrl: true,
          paymentReceiptUrl: true,
          createdAt: true,
        },
      });
      if (!job) throw new NotFoundException("Job not found");
      return job;
    }

    const customer = await db.customer.findFirst({
      where: {
        companyId: tenantId,
        OR: [{ id: entityId }, { slug: entityId }],
      },
      select: { id: true, name: true, createdAt: true },
    });
    if (!customer) throw new NotFoundException("Customer not found");
    return customer;
  }

  private async maybePushArtifactActivity(params: {
    tenantId: string;
    userId?: string | null;
    entityType: ArtifactEntityType;
    entityId: string;
    kind: ArtifactKind;
    label: string;
    action: "created" | "deleted";
    customerId?: string | null;
    customerName?: string | null;
    jobRef?: string | null;
  }) {
    const eventType = params.action === "created" ? "artifact.created" : "artifact.deleted";
    const verb = params.action === "created" ? "Added" : "Removed";
    await this.activity.push({
      type: eventType,
      label: `${verb} ${params.label}`,
      tenantId: params.tenantId,
      customerId: params.customerId || null,
      customerName: params.customerName || null,
      jobId: params.entityType === "JOB" ? params.entityId : null,
      jobRef: params.jobRef || null,
      payloadJson: {
        entityType: params.entityType,
        entityId: params.entityId,
        kind: params.kind,
        label: params.label,
        action: params.action,
        actorUserId: params.userId || null,
      },
    });
  }

  async listForEntity(tenantId: string, entityTypeInput: string, entityId: string) {
    const entityType = normalizeEntityType(entityTypeInput);
    const entity = await this.ensureEntityExists(tenantId, entityType, entityId);
    const resolvedEntityId = entity.id;

    const rows = await this.prisma.documentArtifact.findMany({
      where: {
        tenantId,
        entityType,
        entityId: resolvedEntityId,
      },
      orderBy: [{ createdAt: "desc" }],
    });

    const items = rows.map((row) => this.toArtifactView(row as unknown as ArtifactRecord));
    const existingUrls = new Set(items.map((item) => item.downloadUrl).filter(Boolean));

    if (entityType === "JOB") {
      if (entity.invoicePdfUrl && !existingUrls.has(entity.invoicePdfUrl)) {
        items.push(this.toLegacyArtifactView({
          id: `legacy-invoice-${resolvedEntityId}`,
          entityType,
          entityId: resolvedEntityId,
          kind: "INVOICE",
          label: "Issued invoice PDF",
          url: entity.invoicePdfUrl,
          portalVisible: true,
          createdAt: entity.createdAt || null,
        }));
      }
      if (entity.paymentReceiptUrl && !existingUrls.has(entity.paymentReceiptUrl)) {
        items.push(this.toLegacyArtifactView({
          id: `legacy-receipt-${resolvedEntityId}`,
          entityType,
          entityId: resolvedEntityId,
          kind: "RECEIPT",
          label: "Payment receipt",
          url: entity.paymentReceiptUrl,
          portalVisible: true,
          createdAt: entity.createdAt || null,
        }));
      }
    }

    return items.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  }

  async listFoldersForEntity(tenantId: string, entityTypeInput: string, entityId: string) {
    const items = await this.listForEntity(tenantId, entityTypeInput, entityId);
    const folders = new Map<string, any>();
    for (const item of items) {
      const folder = item.folder || "job";
      const current = folders.get(folder) || { key: folder, count: 0, portalVisibleCount: 0, totalBytes: 0, items: [] };
      current.count += 1;
      current.portalVisibleCount += item.portalVisible ? 1 : 0;
      current.totalBytes += Number(item.sizeBytes || 0);
      current.items.push(item);
      folders.set(folder, current);
    }
    return {
      entityType: String(entityTypeInput || "").toLowerCase(),
      entityId,
      folders: Array.from(folders.values()).sort((a, b) => String(a.key).localeCompare(String(b.key))),
      supportedFolders: [
        "customer",
        "job",
        "estimate",
        "invoice-payment",
        "compliance",
        "before-photos",
        "after-photos",
        "videos",
        "signatures",
        "damage-photos",
        "torque-evidence",
        "payment-evidence",
        "supplier-documents",
        "warranty-documents",
        "evidence",
        "exports",
      ],
    };
  }

  async getMediaGovernance(tenantId: string) {
    const db = this.prisma as any;
    const [settings, grouped, visibleCount, jobsMissingEvidence] = await Promise.all([
      db.tenantSetting.findUnique({ where: { tenantId }, select: { businessConfigJson: true } }).catch(() => null),
      db.documentArtifact.groupBy({
        by: ["entityType", "kind", "portalVisible"],
        where: { tenantId },
        _count: { _all: true },
        _sum: { sizeBytes: true },
      }).catch(() => []),
      db.documentArtifact.count({ where: { tenantId, portalVisible: true } }).catch(() => 0),
      db.job.findMany({
        where: { companyId: tenantId, status: "COMPLETED" },
        select: {
          id: true,
          jobRef: true,
          assets: { select: { id: true, kind: true }, take: 20 },
          signatures: { select: { id: true }, take: 5 },
        },
        take: 50,
      }).catch(() => []),
    ]);
    const config = settings?.businessConfigJson && typeof settings.businessConfigJson === "object" ? settings.businessConfigJson : {};
    const mediaGovernance = config.mediaGovernance && typeof config.mediaGovernance === "object" ? config.mediaGovernance : {};
    const rows = grouped.map((row: any) => ({
      entityType: row.entityType,
      kind: row.kind,
      portalVisible: Boolean(row.portalVisible),
      count: row._count?._all || 0,
      totalBytes: Number(row._sum?.sizeBytes || 0),
      folder: this.folderFor({ entityType: row.entityType, kind: row.kind, portalVisible: Boolean(row.portalVisible) } as any),
    }));
    const totalBytes = rows.reduce((sum: number, row: any) => sum + Number(row.totalBytes || 0), 0);
    const folderMap = new Map<string, any>();
    for (const row of rows) {
      const current = folderMap.get(row.folder) || { folder: row.folder, count: 0, totalBytes: 0, portalVisibleCount: 0 };
      current.count += row.count;
      current.totalBytes += row.totalBytes;
      current.portalVisibleCount += row.portalVisible ? row.count : 0;
      folderMap.set(row.folder, current);
    }
    for (const folder of MEDIA_GOVERNANCE_FOLDERS) {
      if (!folderMap.has(folder)) folderMap.set(folder, { folder, count: 0, totalBytes: 0, portalVisibleCount: 0 });
    }
    const completedJobsMissingRequiredEvidence = jobsMissingEvidence
      .filter((job: any) => {
        const hasPhoto = Array.isArray(job.assets) && job.assets.some((asset: any) => ["BEFORE", "AFTER"].includes(asset.kind));
        const hasSignature = Array.isArray(job.signatures) && job.signatures.length > 0;
        return !hasPhoto || !hasSignature;
      })
      .map((job: any) => ({
        id: job.id,
        jobRef: job.jobRef,
        missing: [
          Array.isArray(job.assets) && job.assets.some((asset: any) => ["BEFORE", "AFTER"].includes(asset.kind)) ? null : "photo evidence",
          Array.isArray(job.signatures) && job.signatures.length > 0 ? null : "signature",
        ].filter(Boolean),
        href: `/dashboard/jobs/${job.id}`,
      }));
    const storageLimitBytes = Number(mediaGovernance.storageLimitBytes || process.env.ARTIFACT_STORAGE_WARNING_BYTES || 2 * 1024 * 1024 * 1024);
    const nearLimit = storageLimitBytes > 0 && totalBytes >= storageLimitBytes * 0.8;
    return {
      generatedAt: new Date().toISOString(),
      scope: "tenant_media_governance",
      platformDiagnosticsVisible: false,
      storage: {
        totalBytes,
        totalLabel: this.formatBytes(totalBytes) || "0 B",
        storageLimitBytes,
        storageLimitLabel: this.formatBytes(storageLimitBytes),
        nearLimit,
        oversizedWarningBytes: UPLOAD_LIMITS.video,
      },
      counts: {
        beforePhotos: rows.filter((row: any) => row.kind === "BEFORE_PHOTO").reduce((sum: number, row: any) => sum + row.count, 0),
        afterPhotos: rows.filter((row: any) => row.kind === "AFTER_PHOTO").reduce((sum: number, row: any) => sum + row.count, 0),
        videos: rows.filter((row: any) => row.kind === "VIDEO").reduce((sum: number, row: any) => sum + row.count, 0),
        evidence: rows.filter((row: any) => ["EVIDENCE", "DAMAGE_PHOTO", "TORQUE_EVIDENCE", "PAYMENT_EVIDENCE", "COMPLIANCE_DOC"].includes(row.kind)).reduce((sum: number, row: any) => sum + row.count, 0),
        customerVisible: visibleCount,
      },
      byFolder: Array.from(folderMap.values()).sort((a, b) => String(a.folder).localeCompare(String(b.folder))),
      byType: rows,
      folderTaxonomy: MEDIA_GOVERNANCE_FOLDERS.map((folder) => ({
        folder,
        searchable: true,
        filterable: true,
        taggable: true,
        retentionReady: true,
        exportReady: true,
      })),
      search: {
        enabled: true,
        fields: ["label", "kind", "fileName", "folder", "tags"],
      },
      tagging: {
        enabled: true,
        tagsDerivedFromKindFolderAndVisibility: true,
        customTagStorageReady: false,
      },
      retentionPolicy: {
        configured: Boolean(mediaGovernance.retentionDays || mediaGovernance.archiveAfterDays || mediaGovernance.exportPolicy),
        retentionDays: mediaGovernance.retentionDays || null,
        archiveAfterDays: mediaGovernance.archiveAfterDays || null,
        exportPolicy: mediaGovernance.exportPolicy || "manual_export_before_archive",
        archivePolicyReadiness: mediaGovernance.archiveAfterDays ? "configured_no_automatic_delete" : "needs_owner_review",
      },
      customerVisibilityReview: {
        customerVisibleCount: visibleCount,
        privateByDefault: true,
        reviewHref: "/dashboard/portal#portal-controls",
      },
      warnings: [
        nearLimit ? { key: "media_storage_near_limit", impact: "Uploads may need review before field evidence grows further.", action: "Review media retention policy", href: "/dashboard/settings/operations#media-governance" } : null,
        completedJobsMissingRequiredEvidence.length ? { key: "completed_job_missing_required_evidence", impact: "Some completed records may be weaker for audit or customer handoff.", action: "Review completed job evidence", href: completedJobsMissingRequiredEvidence[0].href } : null,
      ].filter(Boolean),
      completedJobsMissingRequiredEvidence,
      destructiveActions: {
        deleteWithoutExplicitAction: false,
        archiveWithoutExplicitAction: false,
        exportWithoutExplicitAction: false,
        auditRequired: true,
      },
      uploadPolicy: {
        imageMaxBytes: UPLOAD_LIMITS.image,
        videoMaxBytes: UPLOAD_LIMITS.video,
        documentMaxBytes: UPLOAD_LIMITS.document,
        textMaxBytes: UPLOAD_LIMITS.text,
        virusScanning: {
          configured: false,
          status: "not_configured",
          detail: "File type, extension, size, tenant scope, and storage path are validated. Malware scanning is not configured.",
        },
        resumableUploads: {
          supported: false,
          readiness: "client_queue_and_retry_ready",
          detail: "Client queue, compression, and retry states exist; server-side chunk assembly is not enabled.",
        },
      },
    };
  }

  async createFromUpload(params: {
    tenantId: string;
    userId: string;
    entityType: string;
    entityId: string;
    label?: string | null;
    kind: string;
    portalVisible?: boolean | string | number;
    file: any;
  }) {
    if (!params.file) {
      throw new BadRequestException("Artifact file is required");
    }
    try {
      assertUploadAllowed(params.file);
    } catch (error) {
      if (params.file?.path) {
        await fs.unlink(params.file.path).catch(() => undefined);
      }
      await this.audit.log(
        params.tenantId,
        "artifact.upload.rejected",
        `Rejected artifact upload name=${String(params.file?.originalname || "unknown").slice(0, 120)} mime=${String(params.file?.mimetype || "unknown")} bytes=${Number(params.file?.size || 0)}`,
        params.userId,
      );
      throw error;
    }
    const entityType = normalizeEntityType(params.entityType);
    const kind = normalizeArtifactKind(entityType, params.kind);
    const entity = await this.ensureEntityExists(params.tenantId, entityType, params.entityId);
    const resolvedEntityId = entity.id;
    const storagePath = this.relativeStoragePath(params.tenantId, entityType, resolvedEntityId, params.file.filename);
    if (params.file.path) {
      const destination = this.absoluteStoragePath(storagePath);
      await fs.mkdir(dirname(destination), { recursive: true });
      if (resolve(params.file.path) !== destination) {
        await fs.rename(params.file.path, destination);
      }
    }
    const label = String(params.label || params.file.originalname || kind.replaceAll("_", " ")).trim().slice(0, 120);
    if (!label) {
      throw new BadRequestException("Artifact label is required");
    }

    const portalVisible = entityType === "JOB" && this.asBoolean(params.portalVisible);
    const record = await this.prisma.documentArtifact.create({
      data: {
        tenantId: params.tenantId,
        entityType,
        entityId: resolvedEntityId,
        kind,
        label,
        fileName: params.file.originalname || params.file.filename,
        storagePath,
        mimeType: params.file.mimetype || null,
        sizeBytes: params.file.size || null,
        portalVisible,
        createdByUserId: params.userId,
      },
    });
    await this.audit.log(
      params.tenantId,
      "artifact.upload.accepted",
      `Accepted artifact upload id=${record.id} mime=${record.mimeType || "unknown"} bytes=${record.sizeBytes || 0}`,
      params.userId,
    );

    await this.maybePushArtifactActivity({
      tenantId: params.tenantId,
      userId: params.userId,
      entityType,
      entityId: resolvedEntityId,
      kind,
      label,
      action: "created",
      customerId: entityType === "JOB" ? entity.customerId || null : resolvedEntityId,
      customerName: entityType === "JOB" ? entity.customerName || null : entity.name || null,
      jobRef: entityType === "JOB" ? entity.jobRef || null : null,
    });

    return this.toArtifactView(record as unknown as ArtifactRecord);
  }

  async deleteArtifact(tenantId: string, userId: string, artifactId: string) {
    const artifact = await this.prisma.documentArtifact.findFirst({
      where: { id: artifactId, tenantId },
    });
    if (!artifact) throw new NotFoundException("Artifact not found");

    const entity = await this.ensureEntityExists(tenantId, artifact.entityType as ArtifactEntityType, artifact.entityId);

    await this.prisma.documentArtifact.delete({ where: { id: artifact.id } });

    if (artifact.storagePath) {
      try {
        await fs.unlink(this.ensureLocalPath(artifact.storagePath));
      } catch (error: any) {
        this.logger.warn(`artifact_delete_file_missing id=${artifact.id} error=${error instanceof Error ? error.message : String(error)}`);
      }
    }

    await this.maybePushArtifactActivity({
      tenantId,
      userId,
      entityType: artifact.entityType as ArtifactEntityType,
      entityId: artifact.entityId,
      kind: artifact.kind as ArtifactKind,
      label: artifact.label,
      action: "deleted",
      customerId: artifact.entityType === "JOB" ? entity.customerId || null : entity.id,
      customerName: artifact.entityType === "JOB" ? entity.customerName || null : entity.name || null,
      jobRef: artifact.entityType === "JOB" ? entity.jobRef || null : null,
    });

    return { ok: true };
  }

  async moveArtifact(tenantId: string, userId: string, artifactId: string, kindInput: string) {
    const artifact = await this.prisma.documentArtifact.findFirst({
      where: { id: artifactId, tenantId },
    });
    if (!artifact) throw new NotFoundException("Artifact not found");
    const kind = normalizeArtifactKind(artifact.entityType as ArtifactEntityType, kindInput);
    const updated = await this.prisma.documentArtifact.update({
      where: { id: artifact.id },
      data: { kind },
    });
    await this.maybePushArtifactActivity({
      tenantId,
      userId,
      entityType: artifact.entityType as ArtifactEntityType,
      entityId: artifact.entityId,
      kind,
      label: artifact.label,
      action: "created",
    });
    return this.toArtifactView(updated as unknown as ArtifactRecord);
  }

  async updatePortalVisibility(tenantId: string, userId: string, artifactId: string, portalVisibleInput: any) {
    const artifact = await this.prisma.documentArtifact.findFirst({
      where: { id: artifactId, tenantId },
    });
    if (!artifact) throw new NotFoundException("Artifact not found");
    const portalVisible = artifact.entityType === "JOB" && this.asBoolean(portalVisibleInput);
    const updated = await this.prisma.documentArtifact.update({
      where: { id: artifact.id },
      data: { portalVisible },
    });
    await this.maybePushArtifactActivity({
      tenantId,
      userId,
      entityType: artifact.entityType as ArtifactEntityType,
      entityId: artifact.entityId,
      kind: artifact.kind as ArtifactKind,
      label: `${artifact.label} visibility ${portalVisible ? "enabled" : "disabled"}`,
      action: "created",
    });
    return this.toArtifactView(updated as unknown as ArtifactRecord);
  }

  async bulkUpdate(tenantId: string, userId: string, body: Record<string, any>) {
    const ids = Array.isArray(body?.ids) ? body.ids.map((id) => String(id || "").trim()).filter(Boolean).slice(0, 100) : [];
    if (!ids.length) throw new BadRequestException("At least one artifact id is required");
    const rows = await this.prisma.documentArtifact.findMany({ where: { tenantId, id: { in: ids } } });
    const foundIds = rows.map((row) => row.id);
    const data: any = {};
    if (typeof body?.portalVisible !== "undefined") {
      data.portalVisible = this.asBoolean(body.portalVisible);
    }
    if (typeof body?.kind === "string") {
      const first = rows[0];
      data.kind = normalizeArtifactKind(first?.entityType as ArtifactEntityType, body.kind);
    }
    if (!Object.keys(data).length) throw new BadRequestException("No supported bulk update was requested");
    await this.prisma.documentArtifact.updateMany({ where: { tenantId, id: { in: foundIds } }, data });
    await this.activity.push({
      tenantId,
      type: "artifact.bulk_update",
      label: `Bulk updated ${foundIds.length} artifact${foundIds.length === 1 ? "" : "s"}`,
      payloadJson: { ids: foundIds, fields: Object.keys(data), actorUserId: userId },
    });
    return { ok: true, updated: foundIds.length };
  }

  async getManagedArtifactForTenant(tenantId: string, artifactId: string) {
    const artifact = await this.prisma.documentArtifact.findFirst({
      where: { id: artifactId, tenantId },
    });
    if (!artifact?.storagePath) {
      throw new NotFoundException("Artifact file not found");
    }
    return {
      artifact,
      filePath: this.ensureLocalPath(artifact.storagePath),
    };
  }

  async listPortalArtifactsForJob(tenantId: string, jobId: string, jobToken: string, legacy?: { invoicePdfUrl?: string | null; paymentReceiptUrl?: string | null; createdAt?: Date | null }) {
    const rows = await this.prisma.documentArtifact.findMany({
      where: {
        tenantId,
        entityType: "JOB",
        entityId: jobId,
        portalVisible: true,
      },
      orderBy: [{ createdAt: "desc" }],
    });

    const items = rows.map((row) => this.toArtifactView(row as unknown as ArtifactRecord, { publicToken: jobToken, publicView: true }));
    const existingUrls = new Set(items.map((item) => item.downloadUrl).filter(Boolean));
    if (legacy?.invoicePdfUrl && !existingUrls.has(legacy.invoicePdfUrl)) {
      items.push(this.toLegacyArtifactView({
        id: `legacy-invoice-${jobId}`,
        entityType: "JOB",
        entityId: jobId,
        kind: "INVOICE",
        label: "Service record PDF",
        url: legacy.invoicePdfUrl,
        portalVisible: true,
        createdAt: legacy.createdAt || null,
      }));
    }
    if (legacy?.paymentReceiptUrl && !existingUrls.has(legacy.paymentReceiptUrl)) {
      items.push(this.toLegacyArtifactView({
        id: `legacy-receipt-${jobId}`,
        entityType: "JOB",
        entityId: jobId,
        kind: "RECEIPT",
        label: "Payment receipt",
        url: legacy.paymentReceiptUrl,
        portalVisible: true,
        createdAt: legacy.createdAt || null,
      }));
    }

    return items.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  }

  async getPortalArtifactForJob(tenantId: string, jobId: string, artifactId: string) {
    const artifact = await this.prisma.documentArtifact.findFirst({
      where: {
        id: artifactId,
        tenantId,
        entityType: "JOB",
        entityId: jobId,
        portalVisible: true,
      },
    });
    if (!artifact?.storagePath) {
      throw new NotFoundException("Portal artifact not found");
    }
    return {
      artifact,
      filePath: this.ensureLocalPath(artifact.storagePath),
    };
  }
}
