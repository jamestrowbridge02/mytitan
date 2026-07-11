import { useEffect, useMemo, useState } from "react";
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
  title?: string;
  description?: string;
  buttonLabel?: string;
  testId?: string;
  allowedChannels?: string[];
};

export default function SendUpdatePanel({
  entityType,
  entityId,
  defaultTemplateKey,
  defaultChannel,
  onSent,
  title,
  description,
  buttonLabel,
  testId,
  allowedChannels,
}: SendUpdatePanelProps) {
  const enabled = isNotificationsV1Enabled();
  const [templateKey, setTemplateKey] = useState(defaultTemplateKey || TEMPLATE_OPTIONS[0].key);
  const [channel, setChannel] = useState(defaultChannel || CHANNEL_OPTIONS[0].key);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string | undefined>(undefined);
  const [successMessage, setSuccessMessage] = useState("");
  const [emailReadiness, setEmailReadiness] = useState<any>(null);

  useEffect(() => {
    void apiFetch("/tenant/settings/email-readiness")
      .then((response) => setEmailReadiness(response || null))
      .catch(() => setEmailReadiness(null));
  }, []);

  const templateOptions = useMemo(() => {
    if (entityType === "job") {
      return TEMPLATE_OPTIONS.filter((opt) => opt.key.startsWith("job."));
    }
    return TEMPLATE_OPTIONS.filter((opt) => opt.key.startsWith("booking."));
  }, [entityType]);
  const channelOptions = useMemo(() => {
    if (!allowedChannels?.length) return CHANNEL_OPTIONS;
    const allowed = new Set(allowedChannels.map((item) => String(item).toLowerCase()));
    return CHANNEL_OPTIONS.filter((opt) => allowed.has(opt.key));
  }, [allowedChannels]);
  const channelLabel = useMemo(
    () => channelOptions.find((opt) => opt.key === channel)?.label || "Update",
    [channel, channelOptions],
  );
  const sendButtonLabel = loading
    ? `Sending ${channelLabel}...`
    : buttonLabel || `Send ${channelLabel.toLowerCase()} update`;

  if (!enabled || !entityId) return null;

  async function sendUpdate() {
    setLoading(true);
    setError("");
    setRequestId(undefined);
    setSuccessMessage("");
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
      setSuccessMessage(`${channelLabel} update sent. Stay on this record to track delivery and the next step.`);
      onSent?.();
    } catch (err: any) {
      setError(err?.message || `Could not send the ${channelLabel.toLowerCase()} update. Try again from this record.`);
      setRequestId(err instanceof ApiError ? err.requestId : undefined);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }} data-testid={testId}>
      <h3 style={{ marginTop: 0 }}>{title || "Manual customer update"}</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        {description || "Use this only when you need an extra customer touchpoint beyond the main service-record and payment handoff."}
      </p>
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
            {channelOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
        </label>
        {channel === "email" ? (
          emailReadiness?.effective?.canSend ? (
            <p className="muted" style={{ marginTop: 0, color: emailReadiness?.effective?.usingFallback ? "#9a3412" : "#0f766e" }}>
              {emailReadiness?.effective?.notice || "Customer email uses your business name through the MyTitan email service."}
            </p>
          ) : (
            <p className="muted" style={{ marginTop: 0 }}>
              {emailReadiness?.effective?.guidance || "Customer email is unavailable right now. Finish setup in Settings."}
            </p>
          )
        ) : null}
        <label>
          Note (optional)
          <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button className="button secondary" type="button" onClick={sendUpdate} disabled={loading}>
          {sendButtonLabel}
        </button>
        {successMessage ? (
          <p className="muted" style={{ marginTop: 0, color: "#0f766e" }}>
            {successMessage}
          </p>
        ) : null}
        {error ? (
          <p className="muted" style={{ marginTop: 0 }}>
            {error}{requestId ? ` (Support code: ${requestId})` : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}
