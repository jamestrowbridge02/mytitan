import { BadRequestException, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { buildAppUrl } from '../common/public-url';
import { PrismaService } from '../prisma/prisma.service';
import { UPLOAD_LIMITS } from '../common/upload-policy';

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;
const ENTITY_TYPES = ['customers', 'services', 'locations', 'inventory', 'suppliers', 'team_members', 'jobs', 'invoices'] as const;
const DEFAULT_COLOURS = {
  service: '#2563EB',
  supplier: '#7C3AED',
  user: '#0F766E',
  location: '#C2410C',
};
const STATUS_COLOURS = {
  DRAFT: '#64748B',
  OPEN: '#2563EB',
  SCHEDULED: '#7C3AED',
  IN_PROGRESS: '#C2410C',
  COMPLETED: '#15803D',
  INVOICED: '#0F766E',
  CANCELLED: '#B91C1C',
};

type EntityType = (typeof ENTITY_TYPES)[number];
type ValidationRow = {
  rowNumber: number;
  status: 'ready' | 'skipped' | 'failed';
  errors: string[];
  duplicate?: string;
  values: Record<string, string>;
};

@Injectable()
export class Phase6BService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private db() {
    return this.prisma as any;
  }

  private normalizeColour(value: unknown) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const colour = String(value).trim().toUpperCase();
    if (!HEX_COLOUR.test(colour)) {
      throw new BadRequestException('Colour must use the #RRGGBB format.');
    }
    return colour;
  }

  async getColours(companyId: string) {
    const db = this.db();
    const [services, suppliers, users, locations] = await Promise.all([
      db.service.findMany({ where: { companyId }, select: { id: true, name: true, color: true, isActive: true }, orderBy: { name: 'asc' } }),
      db.stockSupplier.findMany({ where: { tenantId: companyId }, select: { id: true, name: true, color: true }, orderBy: { name: 'asc' } }),
      db.user.findMany({ where: { companyId }, select: { id: true, email: true, role: true, color: true, isActive: true }, orderBy: { email: 'asc' } }),
      db.location.findMany({ where: { companyId }, select: { id: true, name: true, color: true, isActive: true }, orderBy: { name: 'asc' } }),
    ]);
    return { defaults: DEFAULT_COLOURS, statuses: STATUS_COLOURS, services, suppliers, users, locations };
  }

  async updateColour(companyId: string, userId: string, rawEntity: string, id: string, rawColour: unknown) {
    const entity = String(rawEntity || '').trim().toLowerCase();
    const color = this.normalizeColour(rawColour);
    const db = this.db();
    const config: Record<string, { model: string; tenantKey: string; labelKey: string }> = {
      service: { model: 'service', tenantKey: 'companyId', labelKey: 'name' },
      supplier: { model: 'stockSupplier', tenantKey: 'tenantId', labelKey: 'name' },
      user: { model: 'user', tenantKey: 'companyId', labelKey: 'email' },
      location: { model: 'location', tenantKey: 'companyId', labelKey: 'name' },
    };
    const target = config[entity];
    if (!target) throw new BadRequestException('Unsupported colour entity.');
    const row = await db[target.model].findFirst({ where: { id, [target.tenantKey]: companyId } });
    if (!row) throw new NotFoundException('Colour entity not found.');
    const updated = await db[target.model].update({ where: { id }, data: { color } });
    await this.audit.log(
      companyId,
      `phase6b.colour.${color ? 'update' : 'reset'}`,
      `${entity} ${String(row[target.labelKey] || id)} colour ${color ? `set to ${color}` : 'reset to default'}`,
      userId,
    );
    return { id: updated.id, color: updated.color, effectiveColor: updated.color || DEFAULT_COLOURS[entity as keyof typeof DEFAULT_COLOURS] };
  }

  private requiredFields(entityType: EntityType) {
    const fields: Record<EntityType, string[]> = {
      customers: ['name'],
      services: ['name'],
      locations: ['name'],
      inventory: ['sku', 'name'],
      suppliers: ['name'],
      team_members: ['email', 'role'],
      jobs: ['jobRef', 'customerName'],
      invoices: ['jobRef', 'customerName', 'invoiceNumber'],
    };
    return fields[entityType];
  }

  private mapRow(row: Record<string, unknown>, mapping: Record<string, string>) {
    return Object.fromEntries(
      Object.entries(mapping).map(([target, source]) => [target, String(row?.[source] ?? '').trim()]),
    );
  }

  private async duplicateReason(companyId: string, entityType: EntityType, values: Record<string, string>) {
    const db = this.db();
    if (entityType === 'customers' && values.email) {
      return (await db.customer.findFirst({ where: { companyId, email: values.email } })) ? `Customer email ${values.email} already exists` : '';
    }
    if (entityType === 'services') {
      return (await db.service.findFirst({ where: { companyId, name: { equals: values.name, mode: 'insensitive' } } })) ? `Service ${values.name} already exists` : '';
    }
    if (entityType === 'locations') {
      return (await db.location.findFirst({ where: { companyId, name: { equals: values.name, mode: 'insensitive' } } })) ? `Location ${values.name} already exists` : '';
    }
    if (entityType === 'inventory') {
      return (await db.stockItem.findFirst({ where: { tenantId: companyId, sku: values.sku } })) ? `Inventory SKU ${values.sku} already exists` : '';
    }
    if (entityType === 'suppliers') {
      return (await db.stockSupplier.findFirst({ where: { tenantId: companyId, name: { equals: values.name, mode: 'insensitive' } } })) ? `Supplier ${values.name} already exists` : '';
    }
    if (entityType === 'team_members') {
      const email = values.email.toLowerCase();
      const existing = await db.user.findFirst({ where: { companyId, email } });
      const pending = await db.inviteToken.findFirst({ where: { tenantId: companyId, email, acceptedAt: null } });
      return existing || pending ? `Team member ${email} already exists or has a pending invite` : '';
    }
    if (entityType === 'jobs' || entityType === 'invoices') {
      return (await db.job.findFirst({ where: { companyId, jobRef: values.jobRef } })) ? `Job reference ${values.jobRef} already exists` : '';
    }
    return '';
  }

  async previewImport(companyId: string, userId: string, input: any) {
    const payloadBytes = Buffer.byteLength(JSON.stringify(input || {}), 'utf8');
    if (payloadBytes > UPLOAD_LIMITS.csv) {
      await this.audit.log(companyId, 'phase6b.import.rejected', `Rejected CSV preview payload bytes=${payloadBytes}`, userId);
      throw new PayloadTooLargeException({
        statusCode: 413,
        code: 'UPLOAD_TOO_LARGE',
        maxBytes: UPLOAD_LIMITS.csv,
        maxSize: '5 MB',
        message: 'This file is too large. Maximum allowed is 5 MB for CSV imports.',
      });
    }
    const entityType = String(input?.entityType || '').trim().toLowerCase() as EntityType;
    if (!ENTITY_TYPES.includes(entityType)) throw new BadRequestException('Unsupported import type.');
    const mode = String(input?.mode || 'CREATE').trim().toUpperCase();
    if (mode !== 'CREATE') {
      throw new BadRequestException('Update imports are a separate mode and are not enabled until explicit overwrite mappings are implemented.');
    }
    const headers = Array.isArray(input?.headers) ? input.headers.map((value: unknown) => String(value)) : [];
    const rows = Array.isArray(input?.rows) ? input.rows.slice(0, 2000) : [];
    const mapping = input?.mapping && typeof input.mapping === 'object' ? input.mapping : {};
    if (!headers.length || !rows.length) throw new BadRequestException('Upload a CSV with a header and at least one data row.');
    for (const field of this.requiredFields(entityType)) {
      if (!mapping[field] || !headers.includes(mapping[field])) {
        throw new BadRequestException(`Map the required ${field} column before preview.`);
      }
    }

    const validation: ValidationRow[] = [];
    const batchSeen = new Set<string>();
    for (let index = 0; index < rows.length; index += 1) {
      const values = this.mapRow(rows[index], mapping);
      const errors = this.requiredFields(entityType).filter((field) => !values[field]).map((field) => `${field} is required`);
      if (values.color && !HEX_COLOUR.test(values.color)) errors.push('color must use #RRGGBB');
      if (entityType === 'team_members' && !['ADMIN', 'DISPATCHER', 'FINANCE', 'TECHNICIAN', 'VIEWER', 'STAFF', 'READ_ONLY'].includes(values.role?.toUpperCase())) {
        errors.push('role is not importable');
      }
      const duplicateKey = entityType === 'inventory'
        ? values.sku.toLowerCase()
        : entityType === 'team_members' || entityType === 'customers'
          ? (values.email || `${values.name}|${values.phone}`).toLowerCase()
          : (values.jobRef || values.name).toLowerCase();
      let duplicate = '';
      if (batchSeen.has(duplicateKey)) duplicate = 'Duplicate row in this CSV';
      else {
        batchSeen.add(duplicateKey);
        duplicate = await this.duplicateReason(companyId, entityType, values);
      }
      validation.push({
        rowNumber: index + 2,
        status: errors.length ? 'failed' : duplicate ? 'skipped' : 'ready',
        errors,
        duplicate: duplicate || undefined,
        values,
      });
    }

    const counts = {
      ready: validation.filter((row) => row.status === 'ready').length,
      failed: validation.filter((row) => row.status === 'failed').length,
      skipped: validation.filter((row) => row.status === 'skipped').length,
    };
    const batch = await this.db().importBatch.create({
      data: {
        companyId,
        userId,
        entityType,
        mode,
        status: counts.ready > 0 ? 'VALIDATED' : 'BLOCKED',
        headersJson: headers,
        mappingJson: mapping,
        rowsJson: rows,
        validationJson: validation,
        failedCount: counts.failed,
        skippedCount: counts.skipped,
      },
    });
    await this.audit.log(companyId, 'phase6b.import.preview', `${entityType} import ${batch.id} previewed: ${counts.ready} ready, ${counts.failed} failed, ${counts.skipped} skipped`, userId);
    return { id: batch.id, entityType, mode, status: batch.status, counts, validation };
  }

  private money(value: string) {
    const amount = Number(value || 0);
    return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
  }

  private async createRow(tx: any, companyId: string, userId: string, entityType: EntityType, values: Record<string, string>) {
    const color = values.color ? this.normalizeColour(values.color) : null;
    if (entityType === 'customers') {
      const row = await tx.customer.create({ data: { companyId, name: values.name, email: values.email || null, phone: values.phone || null } });
      return { model: 'customer', id: row.id };
    }
    if (entityType === 'services') {
      const row = await tx.service.create({
        data: {
          companyId,
          name: values.name,
          description: values.description || null,
          durationMinutes: Math.max(5, Number(values.durationMinutes || 60)),
          priceCents: this.money(values.price),
          isActive: true,
          color,
        },
      });
      return { model: 'service', id: row.id };
    }
    if (entityType === 'locations') {
      const row = await tx.location.create({
        data: {
          companyId,
          name: values.name,
          code: values.code || null,
          addressLine1: values.addressLine1 || '-',
          city: values.city || '-',
          country: values.country || 'United Kingdom',
          kind: 'BRANCH',
          color,
        },
      });
      return { model: 'location', id: row.id };
    }
    if (entityType === 'inventory') {
      const row = await tx.stockItem.create({
        data: {
          tenantId: companyId,
          sku: values.sku,
          name: values.name,
          unit: values.unit || 'each',
          category: values.category || null,
          minLevel: Number(values.minLevel || 0),
          avgUnitCost: Number(values.unitCost || 0),
          unitPriceCents: this.money(values.price),
        },
      });
      return { model: 'stockItem', id: row.id };
    }
    if (entityType === 'suppliers') {
      const row = await tx.stockSupplier.create({
        data: { tenantId: companyId, name: values.name, email: values.email || null, phone: values.phone || null, color, internalOnly: true },
      });
      return { model: 'stockSupplier', id: row.id };
    }
    if (entityType === 'team_members') {
      const rawToken = `invite_${randomBytes(24).toString('hex')}`;
      const row = await tx.inviteToken.create({
        data: {
          tenantId: companyId,
          email: values.email.toLowerCase(),
          role: values.role.toUpperCase(),
          token: createHash('sha256').update(rawToken).digest('hex'),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      return { model: 'inviteToken', id: row.id, activationUrl: buildAppUrl(`/accept-invite?token=${encodeURIComponent(rawToken)}`) };
    }
    const invoiced = entityType === 'invoices';
    const row = await tx.job.create({
      data: {
        companyId,
        jobRef: values.jobRef,
        customerName: values.customerName,
        customerEmail: values.customerEmail || null,
        serviceName: values.serviceName || (invoiced ? 'Imported invoice' : null),
        status: invoiced ? 'INVOICED' : (['DRAFT', 'OPEN', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(values.status?.toUpperCase()) ? values.status.toUpperCase() : 'OPEN'),
        currency: values.currency || 'GBP',
        totalCents: this.money(values.total),
        subtotalCents: this.money(values.total),
        invoiceNumber: invoiced ? values.invoiceNumber : null,
        invoiceIssuedAt: invoiced ? new Date(values.invoiceIssuedAt || Date.now()) : null,
        createdByUserId: userId,
      },
    });
    return { model: 'job', id: row.id };
  }

  async commitImport(companyId: string, userId: string, id: string) {
    const db = this.db();
    const batch = await db.importBatch.findFirst({ where: { id, companyId } });
    if (!batch) throw new NotFoundException('Import batch not found.');
    if (batch.status !== 'VALIDATED') throw new BadRequestException('Only a validated preview can be committed.');
    const validation = Array.isArray(batch.validationJson) ? batch.validationJson as ValidationRow[] : [];
    const ready = validation.filter((row) => row.status === 'ready');
    if (!ready.length) throw new BadRequestException('This batch has no valid rows to commit.');

    const created = await db.$transaction(async (tx: any) => {
      const refs = [];
      for (const row of ready) refs.push(await this.createRow(tx, companyId, userId, batch.entityType as EntityType, row.values));
      await tx.importBatch.update({
        where: { id },
        data: { status: 'COMMITTED', committedAt: new Date(), importedCount: refs.length, createdRefsJson: refs },
      });
      return refs;
    });
    await this.audit.log(companyId, 'phase6b.import.commit', `${batch.entityType} import ${id} committed ${created.length} created records`, userId);
    return {
      id,
      status: 'COMMITTED',
      importedCount: created.length,
      failedCount: batch.failedCount,
      skippedCount: batch.skippedCount,
      activationLinks: created.filter((row: any) => row.activationUrl).map((row: any) => row.activationUrl),
    };
  }

  async rollbackImport(companyId: string, userId: string, id: string) {
    const db = this.db();
    const batch = await db.importBatch.findFirst({ where: { id, companyId } });
    if (!batch) throw new NotFoundException('Import batch not found.');
    if (batch.status !== 'COMMITTED') throw new BadRequestException('Only a committed batch can be rolled back.');
    const refs = Array.isArray(batch.createdRefsJson) ? batch.createdRefsJson : [];
    const grouped = refs.reduce((result: Record<string, string[]>, ref: any) => {
      if (ref?.model && ref?.id) (result[ref.model] ||= []).push(ref.id);
      return result;
    }, {});
    await db.$transaction(async (tx: any) => {
      if (grouped.job?.length) await tx.job.deleteMany({ where: { companyId, id: { in: grouped.job } } });
      if (grouped.customer?.length) await tx.customer.deleteMany({ where: { companyId, id: { in: grouped.customer } } });
      if (grouped.service?.length) await tx.service.deleteMany({ where: { companyId, id: { in: grouped.service } } });
      if (grouped.location?.length) await tx.location.deleteMany({ where: { companyId, id: { in: grouped.location } } });
      if (grouped.stockItem?.length) await tx.stockItem.deleteMany({ where: { tenantId: companyId, id: { in: grouped.stockItem } } });
      if (grouped.stockSupplier?.length) await tx.stockSupplier.deleteMany({ where: { tenantId: companyId, id: { in: grouped.stockSupplier } } });
      if (grouped.inviteToken?.length) await tx.inviteToken.deleteMany({ where: { tenantId: companyId, id: { in: grouped.inviteToken } } });
      await tx.importBatch.update({ where: { id }, data: { status: 'ROLLED_BACK', rolledBackAt: new Date() } });
    });
    await this.audit.log(companyId, 'phase6b.import.rollback', `${batch.entityType} import ${id} rolled back ${refs.length} created records`, userId);
    return { id, status: 'ROLLED_BACK', rolledBackCount: refs.length };
  }

  async listImports(companyId: string) {
    return this.db().importBatch.findMany({
      where: { companyId },
      select: {
        id: true,
        entityType: true,
        mode: true,
        status: true,
        importedCount: true,
        failedCount: true,
        skippedCount: true,
        committedAt: true,
        rolledBackAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  private csv(value: unknown) {
    const raw = String(value ?? '');
    const spreadsheetSafe = /^[=+\-@]/.test(raw.trimStart()) ? `'${raw}` : raw;
    return `"${spreadsheetSafe.replace(/"/g, '""')}"`;
  }

  async getErrorReport(companyId: string, id: string) {
    const batch = await this.db().importBatch.findFirst({ where: { id, companyId } });
    if (!batch) throw new NotFoundException('Import batch not found.');
    const rows = (Array.isArray(batch.validationJson) ? batch.validationJson : [])
      .filter((row: ValidationRow) => row.status !== 'ready')
      .map((row: ValidationRow) => [row.rowNumber, row.status, row.duplicate || '', row.errors.join('; ')]);
    return [['row', 'status', 'duplicate', 'errors'], ...rows].map((row) => row.map((value) => this.csv(value)).join(',')).join('\n') + '\n';
  }
}
