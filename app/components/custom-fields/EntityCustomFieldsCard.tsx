import { useEffect, useMemo, useState } from "react";
import { OperatorNotice } from "../feedback/OperatorNotice";
import { useOperatorNotice } from "../feedback/useOperatorNotice";
import { apiFetch } from "../../lib/api";
import { formatCustomFieldValue, normalizeCustomFieldValue, type CustomField, type CustomFieldEntityType, type CustomFieldValue } from "../../lib/custom-fields";

export function EntityCustomFieldsCard({
  title,
  entityType,
  entityId,
  onSaved,
}: {
  title: string;
  entityType: CustomFieldEntityType;
  entityId: string;
  onSaved?: (values: CustomFieldValue[]) => void;
}) {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const { notice, showSuccess, showError, clearNotice } = useOperatorNotice();

  const visibleFields = useMemo(() => fields.filter((field) => field.visible !== false), [fields]);

  async function load() {
    const [fieldRows, valueRows] = await Promise.all([
      apiFetch(`/custom-fields?entityType=${entityType}&visible=true`),
      apiFetch(`/custom-fields/values?entityType=${entityType}&entityId=${encodeURIComponent(entityId)}`),
    ]);
    const nextFields = Array.isArray(fieldRows) ? fieldRows : [];
    const nextValues = Array.isArray(valueRows?.values) ? valueRows.values : [];
    setFields(nextFields);
    setValues(
      Object.fromEntries(
        nextValues.map((item: CustomFieldValue) => [item.fieldId, item.valueJson]),
      ),
    );
  }

  useEffect(() => {
    if (!entityId) return;
    void load();
  }, [entityId, entityType]);

  async function save() {
    setSaving(true);
    try {
      const payload = visibleFields.map((field) => ({
        fieldId: field.id,
        valueJson: normalizeCustomFieldValue(field, values[field.id]),
      }));
      const res = await apiFetch("/custom-fields/values", {
        method: "POST",
        body: JSON.stringify({
          entityType,
          entityId,
          values: payload,
        }),
      });
      if (Array.isArray(res?.values)) {
        onSaved?.(res.values);
      }
      showSuccess("Custom field values saved");
      await load();
    } catch (err: any) {
      showError(err?.message || "Failed to save custom fields");
    } finally {
      setSaving(false);
    }
  }

  if (!visibleFields.length) return null;

  return (
    <section className="card operator-section" data-testid={`custom-fields-card-${entityType}`}>
      <OperatorNotice notice={notice} onDismiss={clearNotice} />
      <div className="operator-section__header">
        <div>
          <h2 className="operator-section__title">{title}</h2>
          <p className="operator-section__subtitle">Workspace-specific fields stay tenant-scoped and validate by field type.</p>
        </div>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {visibleFields.map((field) => (
          <label key={field.id} style={{ display: "grid", gap: 6 }}>
            <span className="settings-premium-label">{field.label}</span>
            {field.type === "select" ? (
              <select
                className="input"
                data-testid={`custom-field-input-${field.key}`}
                value={String(values[field.id] ?? "")}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
              >
                <option value="">Not set</option>
                {(field.optionsJson || []).map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            ) : field.type === "boolean" ? (
              <select
                className="input"
                data-testid={`custom-field-input-${field.key}`}
                value={values[field.id] === true ? "true" : values[field.id] === false ? "false" : ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
              >
                <option value="">Not set</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            ) : (
              <input
                className="input"
                data-testid={`custom-field-input-${field.key}`}
                type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                value={field.type === "date" && values[field.id] ? String(values[field.id]).slice(0, 10) : String(values[field.id] ?? "")}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
              />
            )}
            <span className="muted" data-testid={`custom-field-display-${field.key}`}>{formatCustomFieldValue(field, values[field.id])}</span>
          </label>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <button className="button" type="button" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving..." : "Save custom fields"}
        </button>
      </div>
    </section>
  );
}
