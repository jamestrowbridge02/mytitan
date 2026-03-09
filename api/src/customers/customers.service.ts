import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string, params?: { search?: string; limit?: number }) {
    const take = Math.max(1, Math.min(Number(params?.limit || 50), 200));
    const search = String(params?.search || "").trim();
    const where: any = { companyId };
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
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      jobCount: row._count.jobs,
      activityCount: row._count.activityEvents,
    };
  }
}
