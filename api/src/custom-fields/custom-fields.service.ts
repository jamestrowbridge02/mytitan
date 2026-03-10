import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { JwtPayload } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { CUSTOM_FIELD_ENTITY_TYPES, CUSTOM_FIELD_TYPES, CreateCustomFieldDto, UpdateCustomFieldDto, UpsertCustomFieldValuesDto } from "./custom-fields.dto";

type CustomFieldEntityType = (typeof CUSTOM_FIELD_ENTITY_TYPES)[number];
type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

const ENTITY_TYPE_MAP: Record<CustomFieldEntityType, "JOB" | "BOOKING" | "CUSTOMER" | "TECHNICIAN"> = {
  job: "JOB",
  booking: "BOOKING",
  customer: "CUSTOMER",
  technician: "TECHNICIAN",
};

const FIELD_TYPE_MAP: Record<CustomFieldType, "TEXT" | "NUMBER" | "SELECT" | "BOOLEAN" | "DATE"> = {
  text: "TEXT",
  number: "NUMBER",
  select: "SELECT",
  boolean: "BOOLEAN",
  date: "DATE",
};

@Injectable()
export class CustomFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeKey(input: string) {
    return String(input || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  private serializeField(field: any) {
    return {
      id: field.id,
      tenantId: field.tenantId,
      entityType: String(field.entityType || "").toLowerCase(),
      key: field.key,
      label: field.label,
      type: String(field.type || "").toLowerCase(),
      optionsJson: Array.isArray(field.optionsJson) ? field.optionsJson.map((item: unknown) => String(item || "")) : [],
      visible: Boolean(field.visible),
      createdAt: field.createdAt,
      updatedAt: field.updatedAt,
    };
  }

  private serializeValue(value: any) {
    return {
      id: value.id,
      fieldId: value.fieldId,
      entityType: String(value.entityType || "").toLowerCase(),
      entityId: value.entityId,
      valueJson: value.valueJson ?? null,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    };
  }

  private async ensureEntityExists(tenantId: string, entityType: CustomFieldEntityType, entityId: string) {
    const db = this.prisma as any;
    if (!entityId) throw new BadRequestException("entityId is required");
    const where = { id: entityId, companyId: tenantId };
    const exists =
      entityType === "job"
        ? await db.job.findFirst({ where, select: { id: true } })
        : entityType === "booking"
          ? await db.booking.findFirst({ where, select: { id: true } })
          : entityType === "customer"
            ? await db.customer.findFirst({ where, select: { id: true } })
            : await db.user.findFirst({ where, select: { id: true } });
    if (!exists) {
      throw new NotFoundException(`${entityType} not found`);
    }
  }

  private assertTechnicianAccess(user: JwtPayload, entityType: CustomFieldEntityType, entityId: string) {
    if (entityType !== "technician") return;
    if (user.role === "OWNER" || user.role === "ADMIN") return;
    if (user.sub !== entityId) {
      throw new ForbiddenException("Technician custom fields can only be edited for the current user");
    }
  }

  private normalizeOptions(type: CustomFieldType, optionsJson?: string[]) {
    if (type !== "select") return null;
    const options = Array.isArray(optionsJson)
      ? optionsJson.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    if (!options.length) {
      throw new BadRequestException("Select fields require at least one option");
    }
    return Array.from(new Set(options));
  }

  private normalizeValue(field: any, rawValue: unknown) {
    if (rawValue === null || rawValue === undefined || rawValue === "") return null;
    const fieldType = String(field.type || "").toUpperCase();
    if (fieldType === "TEXT") {
      return String(rawValue);
    }
    if (fieldType === "NUMBER") {
      const value = typeof rawValue === "number" ? rawValue : Number(rawValue);
      if (!Number.isFinite(value)) throw new BadRequestException(`${field.label} must be a number`);
      return value;
    }
    if (fieldType === "BOOLEAN") {
      if (typeof rawValue === "boolean") return rawValue;
      if (rawValue === "true") return true;
      if (rawValue === "false") return false;
      throw new BadRequestException(`${field.label} must be true or false`);
    }
    if (fieldType === "DATE") {
      const value = new Date(String(rawValue));
      if (Number.isNaN(value.getTime())) throw new BadRequestException(`${field.label} must be a valid date`);
      return value.toISOString();
    }
    if (fieldType === "SELECT") {
      const normalized = String(rawValue);
      const options = Array.isArray(field.optionsJson) ? field.optionsJson.map((item: unknown) => String(item)) : [];
      if (!options.includes(normalized)) throw new BadRequestException(`${field.label} must match one of the configured options`);
      return normalized;
    }
    return rawValue;
  }

  async listFields(tenantId: string, entityType?: CustomFieldEntityType, includeHidden = true) {
    const rows = await this.prisma.customField.findMany({
      where: {
        tenantId,
        ...(entityType ? { entityType: ENTITY_TYPE_MAP[entityType] } : {}),
        ...(includeHidden ? {} : { visible: true }),
      },
      orderBy: [{ entityType: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((row) => this.serializeField(row));
  }

  async createField(user: JwtPayload, dto: CreateCustomFieldDto) {
    const key = this.normalizeKey(dto.key);
    if (!key) throw new BadRequestException("Field key is required");
    const label = String(dto.label || "").trim();
    if (!label) throw new BadRequestException("Field label is required");
    const existing = await this.prisma.customField.findFirst({
      where: {
        tenantId: user.companyId,
        entityType: ENTITY_TYPE_MAP[dto.entityType],
        key,
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException("A custom field with this key already exists for the selected entity");
    }

    const row = await this.prisma.customField.create({
      data: {
        tenantId: user.companyId,
        entityType: ENTITY_TYPE_MAP[dto.entityType],
        key,
        label,
        type: FIELD_TYPE_MAP[dto.type],
        optionsJson: this.normalizeOptions(dto.type, dto.optionsJson) as any,
        visible: dto.visible !== false,
      },
    });
    return this.serializeField(row);
  }

  async updateField(user: JwtPayload, id: string, dto: UpdateCustomFieldDto) {
    const existing = await this.prisma.customField.findFirst({ where: { id, tenantId: user.companyId } });
    if (!existing) throw new NotFoundException("Custom field not found");
    const nextType = String(existing.type || "").toLowerCase() as CustomFieldType;
    const row = await this.prisma.customField.update({
      where: { id: existing.id },
      data: {
        ...(dto.label !== undefined ? { label: String(dto.label || "").trim() || existing.label } : {}),
        ...(dto.visible !== undefined ? { visible: dto.visible } : {}),
        ...(dto.optionsJson !== undefined ? { optionsJson: this.normalizeOptions(nextType, dto.optionsJson) as any } : {}),
      },
    });
    return this.serializeField(row);
  }

  async deleteField(user: JwtPayload, id: string) {
    const existing = await this.prisma.customField.findFirst({ where: { id, tenantId: user.companyId } });
    if (!existing) throw new NotFoundException("Custom field not found");
    await this.prisma.customField.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  async listValues(user: JwtPayload, entityType: CustomFieldEntityType, entityId?: string, entityIds?: string[]) {
    if (!entityId && (!entityIds || !entityIds.length)) {
      throw new BadRequestException("entityId or entityIds is required");
    }
    const ids = entityId ? [entityId] : Array.from(new Set((entityIds || []).map((value) => String(value || "").trim()).filter(Boolean)));
    if (entityType === "technician" && user.role !== "OWNER" && user.role !== "ADMIN") {
      for (const id of ids) {
        if (id !== user.sub) throw new ForbiddenException("Technician custom fields can only be viewed for the current user");
      }
    }

    const rows = await this.prisma.customFieldValue.findMany({
      where: {
        tenantId: user.companyId,
        entityType: ENTITY_TYPE_MAP[entityType],
        entityId: { in: ids },
      },
      include: {
        field: true,
      },
      orderBy: [{ updatedAt: "desc" }],
    });
    return {
      entityType,
      values: rows.map((row) => ({
        ...this.serializeValue(row),
        field: this.serializeField(row.field),
      })),
    };
  }

  async upsertValues(user: JwtPayload, dto: UpsertCustomFieldValuesDto) {
    await this.ensureEntityExists(user.companyId, dto.entityType, dto.entityId);
    this.assertTechnicianAccess(user, dto.entityType, dto.entityId);
    const values = Array.isArray(dto.values) ? dto.values : [];
    if (!values.length) throw new BadRequestException("values are required");

    const fieldIds = Array.from(new Set(values.map((item) => String(item?.fieldId || "")).filter(Boolean)));
    const fields = await this.prisma.customField.findMany({
      where: {
        tenantId: user.companyId,
        entityType: ENTITY_TYPE_MAP[dto.entityType],
        id: { in: fieldIds },
      },
    });
    if (fields.length !== fieldIds.length) {
      throw new BadRequestException("One or more custom fields do not belong to this tenant or entity type");
    }
    const fieldMap = new Map(fields.map((field) => [field.id, field]));

    const updated = [];
    for (const entry of values) {
      const field = fieldMap.get(String(entry.fieldId));
      if (!field) continue;
      const valueJson = this.normalizeValue(field, entry.valueJson);
      const row = await this.prisma.customFieldValue.upsert({
        where: {
          fieldId_entityId: {
            fieldId: field.id,
            entityId: dto.entityId,
          },
        },
        create: {
          tenantId: user.companyId,
          fieldId: field.id,
          entityType: ENTITY_TYPE_MAP[dto.entityType],
          entityId: dto.entityId,
          valueJson: valueJson as any,
        },
        update: {
          valueJson: valueJson as any,
        },
        include: {
          field: true,
        },
      });
      updated.push({
        ...this.serializeValue(row),
        field: this.serializeField(row.field),
      });
    }
    return {
      entityType: dto.entityType,
      entityId: dto.entityId,
      values: updated,
    };
  }
}
