import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type ActivityEventInput = {
  type: string;
  label: string;
  at?: string;
  tenantId?: string | null;
  customerId?: string | null;
  jobId?: string | null;
  jobRef?: string | null;
  customerName?: string | null;
  status?: string | null;
  vehicleReg?: string | null;
  technicianId?: string | null;
  payloadJson?: any;
};

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  private slugify(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

  private async ensureCustomerByName(companyId: string, name: string) {
    const clean = String(name || "").trim();
    if (!clean) return null;

    const existing = await this.prisma.customer.findFirst({
      where: {
        companyId,
        name: { equals: clean, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (existing) return existing.id;

    const base = this.slugify(clean) || "customer";
    let slug = base;
    for (let i = 0; i < 6; i += 1) {
      try {
        const created = await this.prisma.customer.create({
          data: {
            companyId,
            name: clean,
            slug,
          },
          select: { id: true },
        });
        return created.id;
      } catch {
        slug = `${base}-${Date.now().toString(36).slice(-4)}-${i + 1}`;
      }
    }
    return null;
  }

  async push(event: ActivityEventInput) {
    let tenantId = event.tenantId ?? null;
    let customerId = event.customerId ?? null;
    let customerName = event.customerName ?? null;

    if (customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: tenantId ? { id: customerId, companyId: tenantId } : { id: customerId },
        select: { id: true, name: true, companyId: true },
      });
      if (customer) {
        customerId = customer.id;
        customerName = customerName || customer.name;
        tenantId = tenantId || customer.companyId;
      } else {
        customerId = null;
      }
    }

    if (!customerId && tenantId && customerName) {
      customerId = await this.ensureCustomerByName(tenantId, customerName);
    }

    return this.prisma.activityEvent.create({
      data: {
        type: event.type,
        label: event.label,
        at: event.at ? new Date(event.at) : new Date(),
        tenantId,
        customerId,
        jobId: event.jobId ?? null,
        jobRef: event.jobRef ?? null,
        customerName,
        status: event.status ?? null,
        vehicleReg: event.vehicleReg ?? null,
        technicianId: event.technicianId ?? null,
        payloadJson: event.payloadJson ?? null,
      },
    });
  }

  async list(limit = 20, tenantId?: string | null, filters?: { jobId?: string | null; customerId?: string | null; customerName?: string | null }) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (filters?.jobId) where.jobId = filters.jobId;
    if (filters?.customerId) where.customerId = filters.customerId;
    if (filters?.customerName) where.customerName = { equals: filters.customerName, mode: "insensitive" };
    return this.prisma.activityEvent.findMany({
      where,
      orderBy: { at: "desc" },
      take: Math.max(1, Math.min(limit, 50)),
    });
  }
}
