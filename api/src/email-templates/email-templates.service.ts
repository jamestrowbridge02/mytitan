import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertEmailTemplateDto } from './email-templates.dto';

@Injectable()
export class EmailTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(tenantId: string) {
    const db = this.prisma as any;
    return db.emailTemplate.findMany({
      where: { tenantId },
      orderBy: { type: 'asc' },
    });
  }

  async getById(tenantId: string, id: string) {
    const db = this.prisma as any;
    const template = await db.emailTemplate.findFirst({ where: { id, tenantId } });
    if (!template) {
      throw new NotFoundException('Email template not found');
    }
    return template;
  }

  async create(tenantId: string, userId: string, dto: UpsertEmailTemplateDto) {
    const db = this.prisma as any;
    const existing = await db.emailTemplate.findFirst({
      where: { tenantId, type: dto.type },
    });
    if (existing) {
      throw new BadRequestException(`Template for type ${dto.type} already exists. Use update.`);
    }
    const created = await db.emailTemplate.create({
      data: {
        tenantId,
        type: dto.type,
        subject: dto.subject,
        bodyHtml: dto.bodyHtml,
        bodyText: dto.bodyText,
      },
    });
    await this.audit.log(tenantId, 'email-template.create', `Created template ${created.type}`, userId);
    return created;
  }

  async update(tenantId: string, userId: string, id: string, dto: UpsertEmailTemplateDto) {
    const db = this.prisma as any;
    const existing = await db.emailTemplate.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new NotFoundException('Email template not found');
    }
    const updated = await db.emailTemplate.update({
      where: { id },
      data: {
        type: dto.type,
        subject: dto.subject,
        bodyHtml: dto.bodyHtml,
        bodyText: dto.bodyText,
      },
    });
    await this.audit.log(tenantId, 'email-template.update', `Updated template ${updated.type}`, userId);
    return updated;
  }

  async remove(tenantId: string, userId: string, id: string) {
    const db = this.prisma as any;
    const existing = await db.emailTemplate.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new NotFoundException('Email template not found');
    }

    await db.emailTemplate.delete({ where: { id } });
    await this.audit.log(tenantId, 'email-template.delete', `Deleted template ${existing.type}`, userId);

    return { deleted: true };
  }
}
