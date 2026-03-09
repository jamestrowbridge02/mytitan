import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type ActivityEventInput = {
  type: string;
  label: string;
  at?: string;
  tenantId?: string | null;
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

  async push(event: ActivityEventInput) {
    return this.prisma.activityEvent.create({
      data: {
        type: event.type,
        label: event.label,
        at: event.at ? new Date(event.at) : new Date(),
        tenantId: event.tenantId ?? null,
        jobId: event.jobId ?? null,
        jobRef: event.jobRef ?? null,
        customerName: event.customerName ?? null,
        status: event.status ?? null,
        vehicleReg: event.vehicleReg ?? null,
        technicianId: event.technicianId ?? null,
        payloadJson: event.payloadJson ?? null,
      },
    });
  }

  async list(limit = 20, tenantId?: string | null, filters?: { jobId?: string | null; customerName?: string | null }) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (filters?.jobId) where.jobId = filters.jobId;
    if (filters?.customerName) where.customerName = { equals: filters.customerName, mode: "insensitive" };
    return this.prisma.activityEvent.findMany({
      where,
      orderBy: { at: "desc" },
      take: Math.max(1, Math.min(limit, 50)),
    });
  }
}
