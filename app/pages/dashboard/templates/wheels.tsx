import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { apiFetch } from "../../../lib/api";
import { isWheelsFormV1Enabled } from "../../../lib/feature-flags";
import { useTenantSettings } from "../../../lib/tenant-settings";

type Field = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  group: string;
};

export default function WheelsTemplatePreview() {
  const { settings } = useTenantSettings();
  const [fields, setFields] = useState<Field[]>([]);
  const [error, setError] = useState("");

  const enabled = isWheelsFormV1Enabled() && settings?.primaryTrade === "WHEELS";

  useEffect(() => {
    if (!enabled) return;
    apiFetch("/templates/default?trade=WHEELS")
      .then((data) => setFields((data?.fields || []) as Field[]))
      .catch((err) => setError(err.message || "Failed to load template"));
  }, [enabled]);

  const grouped = useMemo(() => {
    const map: Record<string, Field[]> = {};
    for (const field of fields) {
      if (!map[field.group]) map[field.group] = [];
      map[field.group].push(field);
    }
    return map;
  }, [fields]);

  return (
    <DashboardShell>
      <div className="card">
        <h1>Wheels Template Preview</h1>
        <p className="muted">Read-only preview of the WHEELS Job Form v1 fields.</p>
        {!enabled ? <p>Feature is off or your primary trade is not WHEELS.</p> : null}
        {error ? <p style={{ color: "#ff8a8a" }}>{error}</p> : null}
        {enabled
          ? Object.entries(grouped).map(([group, list]) => (
              <div key={group} className="card" style={{ marginBottom: 14, padding: 14 }}>
                <h3 style={{ marginTop: 0 }}>{group}</h3>
                <table style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Label</th>
                      <th style={{ textAlign: "left" }}>Key</th>
                      <th style={{ textAlign: "left" }}>Type</th>
                      <th style={{ textAlign: "left" }}>Required</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((field) => (
                      <tr key={field.key}>
                        <td>{field.label}</td>
                        <td><code>{field.key}</code></td>
                        <td>{field.type}</td>
                        <td>{field.required ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          : null}
      </div>
    </DashboardShell>
  );
}
