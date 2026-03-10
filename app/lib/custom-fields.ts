export type CustomFieldEntityType = "job" | "booking" | "customer" | "technician";
export type CustomFieldType = "text" | "number" | "select" | "boolean" | "date";

export type CustomField = {
  id: string;
  tenantId?: string;
  entityType: CustomFieldEntityType;
  key: string;
  label: string;
  type: CustomFieldType;
  optionsJson?: string[] | null;
  visible: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type CustomFieldValue = {
  id: string;
  fieldId: string;
  entityType: CustomFieldEntityType;
  entityId: string;
  valueJson: unknown;
  field?: CustomField;
  createdAt?: string;
  updatedAt?: string;
};

export function normalizeCustomFieldValue(field: CustomField, value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (field.type === "number") {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (field.type === "boolean") {
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
    return null;
  }
  if (field.type === "date") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return String(value);
}

export function formatCustomFieldValue(field: CustomField, value: unknown) {
  if (value === null || value === undefined || value === "") return "Not set";
  if (field.type === "boolean") return value ? "Yes" : "No";
  if (field.type === "date") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
  }
  return String(value);
}

export function buildCustomFieldValueMap(values: CustomFieldValue[]) {
  return new Map(values.map((value) => [`${value.entityType}:${value.entityId}:${value.field?.key || value.fieldId}`, value.valueJson]));
}

export function getMissingRequiredCustomFieldKeys(
  requiredKeys: string[] | undefined,
  fields: CustomField[],
  values: CustomFieldValue[],
  entityType: CustomFieldEntityType,
  entityId: string,
) {
  if (!requiredKeys?.length) return [];
  const valueMap = buildCustomFieldValueMap(values);
  return requiredKeys.filter((key) => {
    const field = fields.find((item) => item.entityType === entityType && item.key === key);
    if (!field) return true;
    const value = valueMap.get(`${entityType}:${entityId}:${key}`);
    return value === null || value === undefined || value === "";
  });
}
