import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(companyId: string, type: string, message: string, userId?: string) {
    const db = this.prisma as any;

    try {
      await db.auditEvent.create({
        data: {
          companyId,
          userId,
          type,
          message,
        },
      });
      return;
    } catch {
      await db.auditEvent.create({
        data: {
          companyId,
          actorUserId: userId,
          action: type,
          metadata: { message },
        },
      });
    }
  }
}
