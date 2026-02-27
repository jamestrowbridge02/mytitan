import { useMemo, useState } from "react";
import { ApiError, apiFetch } from "../../lib/api";
import { isNotificationsV1Enabled } from "../../lib/feature-flags";

const TEMPLATE_OPTIONS = [
  { key: "job.update", label: "Job update" },
  { key: "job.approval.request", label: "Approval request" },
  { key: "booking.reminder", label: "Booking reminder" },
  { key: "booking.confirmed", label: "Booking confirmed" },
];

const CHANNEL_OPTIONS = [
  { key: "sms", label: "SMS" },
  { key: "email", label: "Email" },
  { key: "in_app", label: "In-app" },
];

type SendUpdatePanelProps = {
  entityType: "job" | "booking";
  entityId: string;
  defaultTemplateKey?: string;
  defaultChannel?: string;
  onSent?: () => void;
};

export default function SendUpdatePanel({
  entityType,
  entityId,
  defaultTemplateKey,
  defaultChannel,
  onSent,
}: SendUpdatePanelProps) {
  const enabled = isNotificationsV1Enabled();
  const [templateKey, setTemplateKey] = useState(defaultTemplateKey || TEMPLATE_OPTIONS[0].key);
  const [channel, setChannel] = useState(defaultChannel || CHANNEL_OPTIONS[0].key);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string | undefined>(undefined);

  const templateOptions = useMemo(() => {
    if (entityType === "job") {
      return TEMPLATE_OPTIONS.filter((opt) => opt.key.startsWith("job."));
    }
    return TEMPLATE_OPTIONS.filter((opt) => opt.key.startsWith("booking."));
  }, [entityType]);

  if (!enabled || !entityId) return null;

  async function sendUpdate() {
    setLoading(true);
    setError("");
    setRequestId(undefined);
    try {
      await apiFetch("/notifications/send", {
        method: "POST",
        body: JSON.stringify({
          entityType,
          entityId,
          templateKey,
          channel,
          note: note.trim() || undefined,
        }),
      });
      setNote("");
      onSent?.();
    } catch (err: any) {
      setError(err?.message || "Failed to send update");
      setRequestId(err instanceof ApiError ? err.requestId : undefined);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Send update</h3>
      <div style={{ display: "grid", gap: 10 }}>
        <label>
          Template
          <select className="input" value={templateKey} onChange={(e) => setTemplateKey(e.target.value)}>
            {templateOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label>
          Channel
          <select className="input" value={channel} onChange={(e) => setChannel(e.target.value)}>
            {CHANNEL_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label>
          Note (optional)
          <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button className="button" type="button" onClick={sendUpdate} disabled={loading}>
          {loading ? "Sending..." : "Send update"}
        </button>
        {error ? (
          <p className="muted" style={{ marginTop: 0 }}>
            {error}{requestId ? ` (Support code: ${requestId})` : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}
