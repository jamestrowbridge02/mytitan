import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

export const DOCUMENT_SEQUENCE_KINDS = ['JOB_SHEET', 'INVOICE', 'QUOTE', 'STATEMENT'] as const;
export type DocumentSequenceKind = (typeof DOCUMENT_SEQUENCE_KINDS)[number];

const DEFAULTS: Record<DocumentSequenceKind, { prefix: string; suffix: string; nextNumber: number; padding: number }> = {
  JOB_SHEET: { prefix: 'JOB-', suffix: '', nextNumber: 1, padding: 5 },
  INVOICE: { prefix: 'INV-', suffix: '', nextNumber: 1, padding: 5 },
  QUOTE: { prefix: 'Q-', suffix: '', nextNumber: 1, padding: 5 },
  STATEMENT: { prefix: 'STM-', suffix: '', nextNumber: 1, padding: 5 },
};

@Injectable()
export class DocumentControlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private normalizeKind(value: string): DocumentSequenceKind {
    const kind = String(value || '').trim().toUpperCase() as DocumentSequenceKind;
    if (!DOCUMENT_SEQUENCE_KINDS.includes(kind)) throw new BadRequestException('Unsupported document sequence.');
    return kind;
  }

  private format(row: { prefix: string; suffix: string; nextNumber: number; padding: number }) {
    return `${row.prefix || ''}${String(row.nextNumber).padStart(Math.max(1, row.padding || 1), '0')}${row.suffix || ''}`;
  }

  private safePart(value?: string | null) {
    const normalized = String(value || '').trim();
    if (normalized.length > 24) throw new BadRequestException('Prefix and suffix must be 24 characters or fewer.');
    if (!/^[A-Za-z0-9 _./-]*$/.test(normalized)) throw new BadRequestException('Prefix and suffix contain unsupported characters.');
    return normalized;
  }

  private async ensure(tenantId: string, kind: DocumentSequenceKind) {
    const defaults = DEFAULTS[kind];
    return (this.prisma as any).documentSequence.upsert({
      where: { tenantId_kind: { tenantId, kind } },
      update: {},
      create: { tenantId, kind, ...defaults },
    });
  }

  async list(tenantId: string) {
    const rows = await Promise.all(DOCUMENT_SEQUENCE_KINDS.map((kind) => this.ensure(tenantId, kind)));
    return rows.map((row) => ({ ...row, preview: this.format(row) }));
  }

  async update(
    tenantId: string,
    userId: string,
    input: { kind: string; prefix?: string; suffix?: string; nextNumber?: number; padding?: number; reason?: string },
  ) {
    const kind = this.normalizeKind(input.kind);
    const existing = await this.ensure(tenantId, kind);
    const nextNumber = Number(input.nextNumber ?? existing.nextNumber);
    const padding = Number(input.padding ?? existing.padding);
    if (!Number.isInteger(nextNumber) || nextNumber < 1 || nextNumber > 999_999_999) {
      throw new BadRequestException('Next number must be a whole number between 1 and 999999999.');
    }
    if (!Number.isInteger(padding) || padding < 1 || padding > 12) {
      throw new BadRequestException('Number padding must be between 1 and 12.');
    }
    const next = {
      prefix: input.prefix === undefined ? existing.prefix : this.safePart(input.prefix),
      suffix: input.suffix === undefined ? existing.suffix : this.safePart(input.suffix),
      nextNumber,
      padding,
    };
    const preview = this.format(next);
    const duplicate = kind === 'JOB_SHEET'
      ? await (this.prisma as any).job.findFirst({ where: { companyId: tenantId, jobRef: preview }, select: { id: true } })
      : kind === 'INVOICE'
        ? await (this.prisma as any).job.findFirst({ where: { companyId: tenantId, invoiceNumber: preview }, select: { id: true } })
        : kind === 'QUOTE'
          ? await (this.prisma as any).quote.findFirst({ where: { tenantId, quoteNumber: preview }, select: { id: true } })
          : await (this.prisma as any).accountStatement.findFirst({ where: { tenantId, reference: preview }, select: { id: true } });
    if (duplicate) throw new BadRequestException(`The next ${kind.toLowerCase().replaceAll('_', ' ')} number already exists.`);

    const updated = await (this.prisma as any).documentSequence.update({
      where: { id: existing.id },
      data: { ...next, updatedByUserId: userId },
    });
    await this.audit.log(
      tenantId,
      'document_sequence.update',
      `Document sequence ${kind} updated. Before=${JSON.stringify({ prefix: existing.prefix, suffix: existing.suffix, nextNumber: existing.nextNumber, padding: existing.padding })} After=${JSON.stringify(next)} Reason=${String(input.reason || '').trim() || 'continued numbering configuration'}`,
      userId,
    );
    return { ...updated, preview: this.format(updated) };
  }

  async allocate(tx: any, tenantId: string, kindValue: string) {
    const kind = this.normalizeKind(kindValue);
    const defaults = DEFAULTS[kind];
    const row = await tx.documentSequence.upsert({
      where: { tenantId_kind: { tenantId, kind } },
      update: { nextNumber: { increment: 1 } },
      create: { tenantId, kind, ...defaults, nextNumber: defaults.nextNumber + 1 },
    });
    return this.format({ ...row, nextNumber: row.nextNumber - 1 });
  }
}
