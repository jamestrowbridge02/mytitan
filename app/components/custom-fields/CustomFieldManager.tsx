import { useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import type { CustomField, CustomFieldEntityType, CustomFieldType } from "../../lib/custom-fields";

type Draft = {
  id?: string | null;
  entityType: CustomFieldEntityType;
  key: string;
  label: string;
  type: CustomFieldType;
  optionsText: string;
  visible: boolean;
};

function createDraft(): Draft {
  return {
    id: null,
    entityType: "job",
    key: "",
    label: "",
    type: "text",
    optionsText: "",
    visible: true,
  };
}

export function CustomFieldManager({
  fields,
  onFieldsChange,
  showSuccess,
  showError,
}: {
  fields: CustomField[];
  onFieldsChange: (fields: CustomField[]) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(createDraft());
  const [saving, setSaving] = useState(false);

  const grouped = useMemo(
    () =>
      ["job", "booking", "customer", "technician"].map((entityType) => ({
        entityType,
        fields: fields.filter((field) => field.entityType === entityType),
      })),
    [fields],
  );

  const loadFields = async () => {
    const next = await apiFetch("/custom-fields");
    onFieldsChange(Array.isArray(next) ? next : []);
  };

  async function save() {
    setSaving(true);
    try {
      const payload = {
        entityType: draft.entityType,
        key: draft.key,
        label: draft.label,
        type: draft.type,
        visible: draft.visible,
        optionsJson: draft.type === "select"
          ? draft.optionsText.split(",").map((value) => value.trim()).filter(Boolean)
          : [],
      };
      if (draft.id) {
        await apiFetch(`/custom-fields/${draft.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            label: payload.label,
            visible: payload.visible,
            optionsJson: payload.optionsJson,
          }),
        });
        showSuccess("Custom field updated");
      } else {
        await apiFetch("/custom-fields", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showSuccess("Custom field created");
      }
      setDraft(createDraft());
      await loadFields();
    } catch (err: any) {
      showError(err?.message || "Failed to save custom field");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await apiFetch(`/custom-fields/${id}`, { method: "DELETE" });
      showSuccess("Custom field removed");
      if (draft.id === id) setDraft(createDraft());
      await loadFields();
    } catch (err: any) {
      showError(err?.message || "Failed to delete custom field");
    }
  }

  return (
    <div className="card settings-premium-card" data-testid="custom-field-list" style={{ marginBottom: 12 }}>
      <div className="operator-section__header">
        <div>
          <h3 style={{ marginTop: 0 }}>Custom fields</h3>
          <p className="muted settings-premium-muted">Add workspace-specific data points without changing the underlying schema.</p>
        </div>
        <button
          className="button secondary settings-premium-button"
          data-testid="custom-field-create"
          type="button"
          onClick={() => setDraft(createDraft())}
        >
          New field
        </button>
      </div>

      <div data-testid="custom-field-editor" style={{ display: "grid", gap: 10, marginBottom: 18 }}>
        <label className="settings-premium-label">Entity</label>
        <select className="input settings-premium-input" data-testid="custom-field-entity" value={draft.entityType} onChange={(e) => setDraft((prev) => ({ ...prev, entityType: e.target.value as CustomFieldEntityType }))}>
          <option value="job">Jobs</option>
          <option value="booking">Bookings</option>
          <option value="customer">Customers</option>
          <option value="technician">Technicians</option>
        </select>

        <label className="settings-premium-label">Field key</label>
        <input className="input settings-premium-input" data-testid="custom-field-key" value={draft.key} disabled={Boolean(draft.id)} onChange={(e) => setDraft((prev) => ({ ...prev, key: e.target.value }))} placeholder="warranty_status" />

        <label className="settings-premium-label">Label</label>
        <input className="input settings-premium-input" data-testid="custom-field-label" value={draft.label} onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))} placeholder="Warranty status" />

        <label className="settings-premium-label">Type</label>
        <select className="input settings-premium-input" data-testid="custom-field-type" value={draft.type} disabled={Boolean(draft.id)} onChange={(e) => setDraft((prev) => ({ ...prev, type: e.target.value as CustomFieldType }))}>
          <option value="text">Text</option>
          <option value="number">Number</option>
          <option value="select">Select</option>
          <option value="boolean">Boolean</option>
          <option value="date">Date</option>
        </select>

        {draft.type === "select" ? (
          <>
            <label className="settings-premium-label">Select options</label>
            <input className="input settings-premium-input" data-testid="custom-field-options" value={draft.optionsText} onChange={(e) => setDraft((prev) => ({ ...prev, optionsText: e.target.value }))} placeholder="active, expired, unknown" />
          </>
        ) : null}

        <label style={{ display: "block" }}>
          <input type="checkbox" checked={draft.visible} onChange={(e) => setDraft((prev) => ({ ...prev, visible: e.target.checked }))} style={{ marginRight: 8 }} />
          Visible on operator surfaces
        </label>

        <button className="button settings-premium-button" data-testid="custom-field-save" type="button" disabled={saving || !draft.key.trim() || !draft.label.trim() || (draft.type === "select" && !draft.optionsText.trim())} onClick={() => void save()}>
          {saving ? "Saving..." : draft.id ? "Update field" : "Save field"}
        </button>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {grouped.map((group) => (
          <div key={group.entityType} className="card settings-premium-card">
            <h4 style={{ marginTop: 0, textTransform: "capitalize" }}>{group.entityType} fields</h4>
            {group.fields.length ? (
              <div style={{ display: "grid", gap: 10 }}>
                {group.fields.map((field) => (
                  <div key={field.id} className="operator-data-card">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                      <div>
                        <strong>{field.label}</strong>
                        <div className="muted">{field.key} · {field.type}{field.visible ? "" : " · hidden"}</div>
                        {field.type === "select" && field.optionsJson?.length ? (
                          <div className="muted">Options: {field.optionsJson.join(", ")}</div>
                        ) : null}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          className="button secondary"
                          type="button"
                          onClick={() => setDraft({
                            id: field.id,
                            entityType: field.entityType,
                            key: field.key,
                            label: field.label,
                            type: field.type,
                            optionsText: Array.isArray(field.optionsJson) ? field.optionsJson.join(", ") : "",
                            visible: field.visible,
                          })}
                        >
                          Edit
                        </button>
                        <button className="button secondary" type="button" onClick={() => void remove(field.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No custom fields configured yet for this entity.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
