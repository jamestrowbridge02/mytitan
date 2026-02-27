import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { isWheelsFormV1Enabled } from "../common/feature-flags";
import { WHEELS_TEMPLATE_FIELDS, WHEELS_TEMPLATE_META, WHEELS_TEMPLATE_TRADE } from "./wheels-template.data";

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  private requireFeature() {
    if (!isWheelsFormV1Enabled()) {
      throw new ServiceUnavailableException("Wheels form v1 is not enabled");
    }
  }

  async ensureWheelsDefaultTemplate() {
    const db = this.prisma as any;
    const template = await db.formTemplate.upsert({
      where: {
        tradeCode_version: {
          tradeCode: WHEELS_TEMPLATE_META.tradeCode,
          version: WHEELS_TEMPLATE_META.version,
        },
      },
      update: {
        name: WHEELS_TEMPLATE_META.name,
        isDefault: true,
      },
      create: {
        tradeCode: WHEELS_TEMPLATE_META.tradeCode,
        version: WHEELS_TEMPLATE_META.version,
        name: WHEELS_TEMPLATE_META.name,
        isDefault: true,
      },
    });

    await Promise.all(
      WHEELS_TEMPLATE_FIELDS.map((field, index) =>
        db.formField.upsert({
          where: {
            templateId_key: {
              templateId: template.id,
              key: field.key,
            },
          },
          update: {
            label: field.label,
            type: field.type,
            required: Boolean(field.required),
            optionsJson: field.options ?? null,
            fieldOrder: index,
            group: field.group,
          },
          create: {
            templateId: template.id,
            key: field.key,
            label: field.label,
            type: field.type,
            required: Boolean(field.required),
            optionsJson: field.options ?? null,
            fieldOrder: index,
            group: field.group,
          },
        }),
      ),
    );

    return template;
  }

  async getDefaultTemplate(tenantId: string, trade = WHEELS_TEMPLATE_TRADE) {
    this.requireFeature();
    const db = this.prisma as any;

    if (trade !== WHEELS_TEMPLATE_TRADE) {
      return { template: null, fields: [] };
    }

    const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
    if (settings?.primaryTrade !== WHEELS_TEMPLATE_TRADE) {
      return { template: null, fields: [], reason: "Primary trade is not WHEELS" };
    }

    const template = await this.ensureWheelsDefaultTemplate();
    const fields = await db.formField.findMany({
      where: { templateId: template.id },
      orderBy: { fieldOrder: "asc" },
    });

    return {
      template,
      fields,
    };
  }
}
