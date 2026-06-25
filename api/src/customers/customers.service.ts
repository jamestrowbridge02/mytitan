import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(companyId: string, params?: { search?: string; limit?: number; locationId?: string }) {
    const take = Math.max(1, Math.min(Number(params?.limit || 50), 200));
    const search = String(params?.search || "").trim();
    const where: any = { companyId };
    if (params?.locationId && params.locationId !== 'all') {
      where.homeLocationId = params.locationId;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
      ];
    }

    const rows = await this.prisma.customer.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take,
      include: {
        _count: {
          select: {
            jobs: true,
            activityEvents: true,
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      email: row.email,
      phone: row.phone,
      paymentTermsDays: (row as any).paymentTermsDays ?? null,
      homeLocationId: (row as any).homeLocationId || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      jobCount: row._count.jobs,
      activityCount: row._count.activityEvents,
    }));
  }

  async getByIdOrSlug(companyId: string, idOrSlug: string) {
    const key = String(idOrSlug || "").trim();
    const row = await this.prisma.customer.findFirst({
      where: {
        companyId,
        OR: [{ id: key }, { slug: key }],
      },
      include: {
        _count: {
          select: {
            jobs: true,
            activityEvents: true,
          },
        },
      },
    });

    if (!row) throw new NotFoundException("Customer not found");

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      email: row.email,
      phone: row.phone,
      paymentTermsDays: (row as any).paymentTermsDays ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      jobCount: row._count.jobs,
      activityCount: row._count.activityEvents,
    };
  }

  async updatePaymentTerms(companyId: string, userId: string, idOrSlug: string, value?: number | null) {
    const key = String(idOrSlug || "").trim();
    const customer = await this.prisma.customer.findFirst({
      where: { companyId, OR: [{ id: key }, { slug: key }] },
      select: { id: true, name: true },
    });
    if (!customer) throw new NotFoundException("Customer not found");
    const paymentTermsDays = value == null || String(value).trim() === ""
      ? null
      : Math.max(0, Math.min(365, Number(value)));
    if (paymentTermsDays != null && !Number.isFinite(paymentTermsDays)) {
      throw new BadRequestException("Choose valid payment terms");
    }
    const updated = await this.prisma.customer.update({
      where: { id: customer.id },
      data: { paymentTermsDays },
      select: { id: true, paymentTermsDays: true, updatedAt: true },
    });
    await this.audit.log(companyId, "customer.payment_terms.update", `Payment terms updated for ${customer.name}`, userId);
    return updated;
  }
}
