import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { PrismaService } from '../prisma/prisma.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async list(
    @CurrentUser() user: JwtPayload,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('userId') userId?: string,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const db = this.prisma as any;
    const take = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const skip = Math.max(0, (Number(page) - 1) * take);

    const where: any = { companyId: user.companyId };
    if (userId) where.userId = userId;
    if (type) where.type = type;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [items, total] = await Promise.all([
      db.auditEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      db.auditEvent.count({ where }),
    ]);

    return {
      items,
      page: Number(page) || 1,
      pageSize: take,
      total,
    };
  }
}
