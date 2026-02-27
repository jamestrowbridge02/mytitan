import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AddTradeAccountNoteDto, TradeAccountsQueryDto, UpdateNextActionDto, UpsertTradeAccountDto } from './dto';

@Injectable()
export class TradeAccountsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async upsert(companyId: string, userId: string, dto: UpsertTradeAccountDto) {
    const db = this.prisma as any;
    const payload = {
      name: dto.name,
      contactName: dto.contactName,
      contactEmail: dto.contactEmail,
      contactPhone: dto.contactPhone,
      creditLimit: new Prisma.Decimal(dto.creditLimit),
      outstandingBalance: new Prisma.Decimal(dto.outstandingBalance ?? 0),
      status: dto.status ?? 'ACTIVE',
      nextActionType: dto.nextActionType ?? null,
      nextActionDueAt: dto.nextActionDueAt ? new Date(dto.nextActionDueAt) : null,
      nextActionUserId: dto.nextActionUserId ?? null,
    };

    let account;
    if (dto.id) {
      const existing = await db.tradeAccount.findFirst({ where: { id: dto.id, companyId } });
      if (!existing) {
        throw new NotFoundException('Trade account not found');
      }

      account = await db.tradeAccount.update({
        where: { id: existing.id },
        data: payload,
      });

      await this.audit.log(companyId, 'trade.upsert', `Updated trade account ${account.name}`, userId);
      return account;
    }

    account = await db.tradeAccount.create({
      data: {
        companyId,
        ...payload,
      },
    });

    await this.audit.log(companyId, 'trade.upsert', `Created trade account ${account.name}`, userId);
    return account;
  }

  async list(companyId: string, query?: TradeAccountsQueryDto) {
    const db = this.prisma as any;
    const where: any = { companyId };
    if (query?.status) where.status = query.status;
    if (query?.q) {
      const q = query.q.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { contactName: { contains: q, mode: 'insensitive' } },
        { contactEmail: { contains: q, mode: 'insensitive' } },
        { contactPhone: { contains: q, mode: 'insensitive' } },
      ];
    }

    const accounts = await db.tradeAccount.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const withBalance = await Promise.all(
      accounts.map(async (account: any) => {
        const unpaid = await db.job.findMany({
          where: {
            companyId,
            OR: [{ tradeAccountId: account.id }, { customerEmail: account.contactEmail || undefined }],
            invoiceIssuedAt: { not: null },
            invoicePaidAt: null,
          },
          select: { totalCents: true },
        });
        const computedOutstandingCents = unpaid.reduce((sum: number, row: any) => sum + Number(row.totalCents || 0), 0);
        return { ...account, computedOutstandingCents };
      }),
    );
    return withBalance;
  }

  async get(companyId: string, id: string) {
    const db = this.prisma as any;
    const account = await db.tradeAccount.findFirst({ where: { companyId, id } });
    if (!account) throw new NotFoundException('Trade account not found');
    const recentJobs = await db.job.findMany({
      where: { companyId, tradeAccountId: id },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });
    const recentBookings = await db.booking.findMany({
      where: { companyId, tradeAccountId: id },
      orderBy: { startsAt: 'desc' },
      take: 8,
    });
    const notes = await db.tradeAccountNote.findMany({
      where: { companyId, tradeAccountId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { account, recentJobs, recentBookings, notes };
  }

  async addNote(companyId: string, userId: string, accountId: string, dto: AddTradeAccountNoteDto) {
    const db = this.prisma as any;
    const account = await db.tradeAccount.findFirst({ where: { companyId, id: accountId } });
    if (!account) throw new NotFoundException('Trade account not found');
    const mentionHandles = Array.from(new Set((dto.body.match(/@[a-zA-Z0-9_.-]+/g) || []).map((m) => m.slice(1))));
    const note = await db.tradeAccountNote.create({
      data: {
        companyId,
        tradeAccountId: accountId,
        authorUserId: userId,
        body: dto.body,
        mentionHandles,
        attachmentsJson: dto.attachmentsMeta || null,
      },
    });
    await this.audit.log(companyId, 'trade.note.add', `Added note for ${account.name}`, userId);
    return note;
  }

  async updateNextAction(companyId: string, userId: string, accountId: string, dto: UpdateNextActionDto) {
    const db = this.prisma as any;
    const account = await db.tradeAccount.findFirst({ where: { companyId, id: accountId } });
    if (!account) throw new NotFoundException('Trade account not found');
    const updated = await db.tradeAccount.update({
      where: { id: accountId },
      data: {
        nextActionType: dto.type ?? null,
        nextActionDueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        nextActionUserId: dto.assignedUserId ?? null,
      },
    });
    await this.audit.log(companyId, 'trade.next-action.update', `Updated next action for ${account.name}`, userId);
    return updated;
  }

  async timeline(companyId: string, accountId: string) {
    const db = this.prisma as any;
    const account = await db.tradeAccount.findFirst({ where: { companyId, id: accountId } });
    if (!account) throw new NotFoundException('Trade account not found');
    const [jobs, bookings, notes] = await Promise.all([
      db.job.findMany({ where: { companyId, tradeAccountId: accountId }, orderBy: { createdAt: 'desc' }, take: 30 }),
      db.booking.findMany({ where: { companyId, tradeAccountId: accountId }, orderBy: { createdAt: 'desc' }, take: 30 }),
      db.tradeAccountNote.findMany({ where: { companyId, tradeAccountId: accountId }, orderBy: { createdAt: 'desc' }, take: 30 }),
    ]);
    const timeline = [
      ...jobs.map((j: any) => ({ type: 'job', createdAt: j.createdAt, data: j })),
      ...bookings.map((b: any) => ({ type: 'booking', createdAt: b.createdAt, data: b })),
      ...notes.map((n: any) => ({ type: 'note', createdAt: n.createdAt, data: n })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { account, timeline };
  }
}
