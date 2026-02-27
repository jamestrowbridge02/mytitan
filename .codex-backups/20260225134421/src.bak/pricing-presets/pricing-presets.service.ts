import { Injectable } from '@nestjs/common';
import { requireWheelsAutomationV1Enabled } from '../common/feature-flags';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PricingPresetsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    requireWheelsAutomationV1Enabled();

    const db = this.prisma as any;
    const presets = await db.templatePreset.findMany({
      where: {
        tenantId,
        type: 'PRICING_PRESET',
        isActive: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 25,
    });

    const grouped = await db.job.groupBy({
      by: ['serviceName'],
      where: {
        companyId: tenantId,
        serviceName: { not: null },
      },
      _count: { _all: true },
    });

    const usageByName = new Map<string, number>();
    for (const row of grouped as Array<{ serviceName: string | null; _count: { _all: number } }>) {
      const key = (row.serviceName || '').trim().toLowerCase();
      if (!key) continue;
      usageByName.set(key, Number(row._count?._all || 0));
    }

    const items = presets.map((preset: any) => {
      const data = (preset.dataJson || {}) as Record<string, any>;
      const rawPrice = data.unitPrice ?? data.price ?? null;
      const parsedPrice = rawPrice === null || rawPrice === undefined ? null : Number(rawPrice);
      const unitPrice = Number.isFinite(parsedPrice) ? parsedPrice : null;
      const candidates = [preset.name, data.label, preset.key]
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean);
      const useCount = candidates.reduce((max, candidate) => Math.max(max, usageByName.get(candidate) || 0), 0);

      return {
        name: preset.name,
        key: preset.key,
        unitPrice,
        useCount,
      };
    });

    return { items };
  }
}
