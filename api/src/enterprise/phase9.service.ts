import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { IntegrationClientFactory } from '../integrations/integration-client.factory';
import { PrismaService } from '../prisma/prisma.service';

const APPROVAL_KINDS = ['DISCOUNT', 'PARTS_ADJUSTMENT', 'QUOTE', 'VARIATION', 'REFUND', 'CREDIT'];

@Injectable()
export class Phase9Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly integrationClients: IntegrationClientFactory,
  ) {}

  private cleanText(value: unknown, label: string, max = 160) {
    const clean = String(value || '').trim();
    if (!clean) throw new BadRequestException(`${label} is required`);
    return clean.slice(0, max);
  }

  async listAssets(tenantId: string) {
    return (this.prisma as any).asset.findMany({ where: { tenantId }, orderBy: [{ status: 'asc' }, { name: 'asc' }] });
  }

  async createAsset(tenantId: string, userId: string, body: any) {
    const row = await (this.prisma as any).asset.create({
      data: {
        tenantId,
        name: this.cleanText(body?.name, 'Asset name'),
        equipmentType: this.cleanText(body?.equipmentType, 'Equipment type'),
        serialNumber: String(body?.serialNumber || '').trim().slice(0, 120) || null,
        locationId: String(body?.locationId || '').trim() || null,
        maintenanceDueAt: body?.maintenanceDueAt ? new Date(body.maintenanceDueAt) : null,
        requiredForTemplate: String(body?.requiredForTemplate || '').trim().slice(0, 160) || null,
        createdByUserId: userId,
        updatedByUserId: userId,
      },
    });
    await this.audit.log(tenantId, 'assets.create', `Created asset ${row.name}`, userId);
    return row;
  }

  async updateAssetState(tenantId: string, userId: string, assetId: string, action: string, body: any) {
    const db = this.prisma as any;
    const asset = await db.asset.findFirst({ where: { id: assetId, tenantId } });
    if (!asset) throw new NotFoundException('Asset not found');
    const normalized = String(action || '').trim().toLowerCase();
    let data: Record<string, any>;
    if (normalized === 'checkout') {
      if (asset.status === 'OUT_OF_SERVICE') throw new BadRequestException('Out-of-service assets cannot be checked out');
      const operatorId = this.cleanText(body?.operatorId, 'Assigned operator');
      if (body?.jobId) {
        const job = await db.job.findFirst({ where: { id: String(body.jobId), companyId: tenantId }, select: { id: true } });
        if (!job) throw new BadRequestException('Assigned job is not in this workspace');
      }
      data = {
        status: 'CHECKED_OUT',
        assignedOperatorId: operatorId,
        assignedJobId: String(body?.jobId || '').trim() || null,
        checkedOutAt: new Date(),
        checkedInAt: null,
      };
    } else if (normalized === 'checkin') {
      data = { status: 'AVAILABLE', assignedOperatorId: null, assignedJobId: null, checkedInAt: new Date() };
    } else if (normalized === 'out-of-service') {
      data = { status: 'OUT_OF_SERVICE', assignedOperatorId: null, assignedJobId: null };
    } else if (normalized === 'maintenance-due') {
      data = { status: 'MAINTENANCE_DUE' };
    } else if (normalized === 'inspect') {
      const history = Array.isArray(asset.inspectionHistory) ? asset.inspectionHistory : [];
      data = {
        lastInspectionAt: new Date(),
        inspectionHistory: [...history, {
          at: new Date().toISOString(),
          result: String(body?.result || 'passed').slice(0, 40),
          note: String(body?.note || '').slice(0, 500),
          userId,
        }].slice(-50),
      };
    } else {
      throw new BadRequestException('Unsupported asset action');
    }
    const updated = await db.asset.update({ where: { id: asset.id }, data: { ...data, updatedByUserId: userId } });
    await this.audit.log(tenantId, `assets.${normalized}`, `${normalized} asset ${asset.name}`, userId);
    return updated;
  }

  async assetAvailability(tenantId: string, template?: string | null) {
    const requiredForTemplate = String(template || '').trim();
    const assets = await (this.prisma as any).asset.findMany({
      where: { tenantId, ...(requiredForTemplate ? { requiredForTemplate } : {}) },
      orderBy: { name: 'asc' },
    });
    return {
      requiredForTemplate: requiredForTemplate || null,
      available: assets.filter((asset: any) => asset.status === 'AVAILABLE'),
      unavailable: assets.filter((asset: any) => asset.status !== 'AVAILABLE'),
      warning: assets.some((asset: any) => asset.status !== 'AVAILABLE'),
    };
  }

  async listApprovalPolicies(tenantId: string) {
    const db = this.prisma as any;
    const [policies, requests] = await Promise.all([
      db.financialApprovalPolicy.findMany({ where: { tenantId }, orderBy: [{ kind: 'asc' }, { limitCents: 'asc' }] }),
      db.financialApprovalRequest.findMany({ where: { tenantId, status: 'PENDING' }, orderBy: { createdAt: 'asc' } }),
    ]);
    return { policies, managerQueue: requests };
  }

  async saveApprovalPolicy(tenantId: string, userId: string, body: any) {
    const kind = String(body?.kind || '').toUpperCase();
    if (!APPROVAL_KINDS.includes(kind)) throw new BadRequestException('Unknown approval kind');
    const limitCents = Math.max(0, Math.round(Number(body?.limitCents)));
    if (!Number.isFinite(limitCents)) throw new BadRequestException('A valid approval limit is required');
    const role = String(body?.role || '').trim().toUpperCase() || null;
    const locationId = String(body?.locationId || '').trim() || null;
    const db = this.prisma as any;
    const existing = await db.financialApprovalPolicy.findFirst({ where: { tenantId, kind, role, locationId } });
    const row = existing
      ? await db.financialApprovalPolicy.update({ where: { id: existing.id }, data: { limitCents, active: body?.active !== false, updatedByUserId: userId } })
      : await db.financialApprovalPolicy.create({ data: { tenantId, kind, role, locationId, limitCents, active: body?.active !== false, createdByUserId: userId, updatedByUserId: userId } });
    await this.audit.log(tenantId, 'approvals.policy.save', `Saved ${kind} approval limit ${limitCents}`, userId);
    return row;
  }

  async requestFinancialApproval(tenantId: string, userId: string, role: string, body: any) {
    const kind = String(body?.kind || '').toUpperCase();
    if (!APPROVAL_KINDS.includes(kind)) throw new BadRequestException('Unknown approval kind');
    const amountCents = Math.max(0, Math.round(Number(body?.amountCents)));
    if (!Number.isFinite(amountCents)) throw new BadRequestException('A valid amount is required');
    const locationId = String(body?.locationId || '').trim() || null;
    const db = this.prisma as any;
    const policies = await db.financialApprovalPolicy.findMany({
      where: { tenantId, kind, active: true, OR: [{ role }, { role: null }], AND: [{ OR: [{ locationId }, { locationId: null }] }] },
      orderBy: { limitCents: 'desc' },
    });
    const limit = policies[0]?.limitCents ?? 0;
    const requiresManager = amountCents > limit;
    const request = await db.financialApprovalRequest.create({
      data: {
        tenantId, kind, amountCents, locationId,
        jobId: String(body?.jobId || '').trim() || null,
        requestedByUserId: userId,
        reason: String(body?.reason || '').trim().slice(0, 500) || null,
        status: requiresManager ? 'PENDING' : 'APPROVED',
        decidedByUserId: requiresManager ? null : userId,
        decidedAt: requiresManager ? null : new Date(),
        decisionNote: requiresManager ? null : 'Within configured approval limit',
        customerApprovalRequired: body?.customerApprovalRequired === true,
      },
    });
    await this.audit.log(tenantId, 'approvals.request', `${kind} ${amountCents} ${requiresManager ? 'queued' : 'approved within limit'}`, userId);
    return { ...request, requiresManager, appliedLimitCents: limit };
  }

  async decideFinancialApproval(tenantId: string, userId: string, requestId: string, decision: string, note?: string) {
    const db = this.prisma as any;
    const request = await db.financialApprovalRequest.findFirst({ where: { id: requestId, tenantId, status: 'PENDING' } });
    if (!request) throw new NotFoundException('Pending approval request not found');
    const status = decision === 'approve' ? 'APPROVED' : decision === 'reject' ? 'REJECTED' : null;
    if (!status) throw new BadRequestException('Decision must be approve or reject');
    const updated = await db.financialApprovalRequest.update({
      where: { id: request.id },
      data: { status, decidedByUserId: userId, decidedAt: new Date(), decisionNote: String(note || '').trim().slice(0, 500) || null },
    });
    await this.audit.log(tenantId, 'approvals.decision', `${status} ${request.kind} request ${request.id}`, userId);
    return updated;
  }

  async lookupVehicle(tenantId: string, userId: string, registrationInput: unknown) {
    const registration = String(registrationInput || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (registration.length < 2) throw new BadRequestException('Registration is required');
    const db = this.prisma as any;
    const client = await this.integrationClients.resolveScopedClient({ tenantId, provider: 'DVLA_VES', scope: 'WORKSPACE' });
    if (!client.ok) {
      const failed = client as Extract<typeof client, { ok: false }>;
      await db.vehicleLookupAudit.create({
        data: { tenantId, registration, provider: 'MANUAL', result: 'manual_fallback', safeCategory: failed.category, requestedByUserId: userId },
      });
      await this.audit.log(tenantId, 'vehicle.lookup.manual_fallback', `Manual vehicle lookup fallback for ${registration}`, userId);
      return { registration, provider: 'manual', status: 'manual_fallback', vehicle: null, fakeData: false };
    }
    const apiKey = String(client.payload.apiKey || client.secretMaterial || '').trim();
    if (!apiKey) throw new BadRequestException('DVLA provider setup is missing an API key');
    try {
      const response = await fetch('https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ registrationNumber: registration }),
      });
      if (!response.ok) throw new Error(`dvla_http_${response.status}`);
      const payload = await response.json() as Record<string, any>;
      const vehicle = {
        registration,
        make: payload.make || null,
        colour: payload.colour || null,
        yearOfManufacture: payload.yearOfManufacture || null,
        motStatus: payload.motStatus || null,
        motExpiryDate: payload.motExpiryDate || null,
        taxStatus: payload.taxStatus || null,
      };
      await db.vehicleLookupAudit.create({
        data: { tenantId, registration, provider: 'DVLA_VES', result: 'success', safeCategory: 'vehicle_found', requestedByUserId: userId, responseJson: vehicle },
      });
      await this.audit.log(tenantId, 'vehicle.lookup.success', `DVLA lookup completed for ${registration}`, userId);
      return { registration, provider: 'dvla_ves', status: 'found', vehicle, fakeData: false };
    } catch {
      await db.vehicleLookupAudit.create({
        data: { tenantId, registration, provider: 'DVLA_VES', result: 'failed', safeCategory: 'provider_error', requestedByUserId: userId },
      });
      await this.audit.log(tenantId, 'vehicle.lookup.failed', `DVLA lookup failed for ${registration}`, userId);
      return { registration, provider: 'dvla_ves', status: 'provider_error', vehicle: null, fakeData: false };
    }
  }
}
