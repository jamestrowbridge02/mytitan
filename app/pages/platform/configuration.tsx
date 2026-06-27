import { useEffect, useState } from "react";
import { PlatformShell } from "../../components/platform-shell";
import { apiFetch } from "../../lib/api";

type SecretStatus = {
  present: boolean;
  lastFour: string | null;
  source: string;
  verificationStatus: string;
  lastVerifiedAt: string | null;
  failureReason: string | null;
};

type ProviderStatus = {
  mode: "test" | "live";
  readiness: string;
  platformSecret: SecretStatus;
  webhookSecret: SecretStatus;
  updatedAt: string | null;
  updatedByUserId: string | null;
  lastSavedAt?: string | null;
  lastVerifiedAt?: string | null;
  runtime?: {
    mode: "test" | "live";
    platformSecretLoaded: boolean;
    webhookSecretLoaded: boolean;
    runtimeLoaded: boolean;
    lastReloadedAt: string | null;
  };
  lastOnboardingAttempt?: {
    tenant: { id: string; name: string } | null;
    result: string;
    actionUrlReturned: boolean;
    stripeAccountCreated: boolean;
    accountLinkCreated: boolean;
    failureReason: string | null;
    attemptedAt: string;
  } | null;
};

type EmailControlResponse = {
  control?: {
    paused?: boolean;
    providerSuspended?: boolean;
    pausedReason?: string | null;
    providerSuspensionReason?: string | null;
  };
  environment?: {
    mode?: string;
    liveSmtpAllowed?: boolean;
    captureOnly?: boolean;
  };
  sender?: {
    readiness?: {
      status?: string;
      transport?: string;
      source?: string;
      canSend?: boolean;
      fromEmail?: string | null;
      fromName?: string | null;
      guidance?: string;
      dnsRecords?: string[];
    };
    senderIdentityVerified?: boolean;
  };
  domainAlignment?: {
    spf?: string;
    dkim?: string;
    dmarc?: string;
    warmup?: string;
  };
  health?: {
    sentLast24h?: number;
    deferredLast24h?: number;
    failedLast24h?: number;
    blockedLast24h?: number;
    activeSuppressions?: number;
    recentProviderResponses?: Array<{
      id: string;
      createdAt: string;
      status: string;
      category: string;
      recipientMasked: string;
      responseSummary: string;
      providerCode: string | null;
    }>;
  };
};

export default function PlatformConfigurationPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [billing, setBilling] = useState<any>(null);
  const [connect, setConnect] = useState<ProviderStatus | null>(null);
  const [emailControl, setEmailControl] = useState<EmailControlResponse | null>(null);
  const [testEmailTo, setTestEmailTo] = useState("");
  const [platformSecret, setPlatformSecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [mode, setMode] = useState<"test" | "live">("test");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [preflight, setPreflight] = useState<any>(null);

  async function load() {
    const me = await apiFetch("/me");
    if (!me?.platformAdmin) {
      setAllowed(false);
      return;
    }
    setAllowed(true);
    const response = await apiFetch("/admin/platform/platform-configuration/payment-providers");
    const emailResponse = await apiFetch("/admin/platform/email-control");
    setBilling(response?.myTitanBillingStripe || null);
    setConnect(response?.stripeConnect || null);
    setEmailControl(emailResponse || null);
    setMode(response?.stripeConnect?.mode === "live" ? "live" : "test");
  }

  useEffect(() => {
    void load().catch((loadError: any) => {
      setAllowed(false);
      setError(loadError?.message || "Platform configuration could not be loaded.");
    });
  }, []);

  async function save() {
    setBusy("save");
    setError("");
    setMessage("");
    try {
      await apiFetch("/admin/platform/platform-configuration/payment-providers/stripe-connect", {
        method: "PATCH",
        body: JSON.stringify({
          platformSecret: platformSecret || undefined,
          webhookSecret: webhookSecret || undefined,
          mode,
          confirmation: confirmed,
        }),
      });
      setPlatformSecret("");
      setWebhookSecret("");
      setConfirmed(false);
      setMessage("Stripe Connect configuration saved. Full secret values will not be shown again.");
      await load();
    } catch (saveError: any) {
      setError(saveError?.message || "Stripe Connect configuration could not be saved.");
    } finally {
      setBusy("");
    }
  }

  async function verify() {
    setBusy("verify");
    setError("");
    setMessage("");
    try {
      await apiFetch("/admin/platform/platform-configuration/payment-providers/stripe-connect/verify", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setMessage("Stripe Connect verification completed.");
      await load();
    } catch (verifyError: any) {
      setError(verifyError?.message || "Stripe Connect verification failed.");
      await load().catch(() => undefined);
    } finally {
      setBusy("");
    }
  }

  async function reloadRuntime() {
    setBusy("reload");
    setError("");
    setMessage("");
    try {
      const response = await apiFetch("/admin/platform/platform-configuration/payment-providers/stripe-connect/reload", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setConnect(response?.stripeConnect || null);
      setMessage("Stripe Connect runtime configuration reloaded.");
    } catch (reloadError: any) {
      setError(reloadError?.message || "Stripe Connect runtime configuration could not be reloaded.");
    } finally {
      setBusy("");
    }
  }

  async function runPreflight() {
    setBusy("preflight");
    setError("");
    setMessage("");
    try {
      const response = await apiFetch("/admin/platform/platform-configuration/payment-providers/stripe-connect/preflight", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setPreflight(response);
      setMessage(response?.ok ? "Onboarding preflight passed without creating a connected account." : "Onboarding preflight found missing setup.");
      await load();
    } catch (preflightError: any) {
      setError(preflightError?.message || "Stripe Connect onboarding preflight could not run.");
    } finally {
      setBusy("");
    }
  }

  async function sendTestEmail() {
    setBusy("email-test");
    setError("");
    setMessage("");
    try {
      const response = await apiFetch("/admin/platform/email-control/test-email", {
        method: "POST",
        body: JSON.stringify({ to: testEmailTo }),
      });
      if (!response?.ok) {
        setError(response?.readiness?.guidance || `Email test did not pass: ${response?.status || "not_ready"}`);
      } else {
        setMessage(`Email provider test sent to ${response.recipientMasked || "the configured recipient"}.`);
        setTestEmailTo("");
      }
      await load();
    } catch (sendError: any) {
      setError(sendError?.message || "Email provider test could not run.");
    } finally {
      setBusy("");
    }
  }

  if (allowed === null) return <PlatformShell><div className="card">Loading protected platform configuration…</div></PlatformShell>;
  if (!allowed) {
    return (
      <PlatformShell>
        <div className="card" data-testid="platform-configuration-forbidden">
          <h2>Platform admin access required</h2>
          <p>This configuration is not available to tenant or support-mode users.</p>
        </div>
      </PlatformShell>
    );
  }

  return (
    <PlatformShell>
      <div className="platform-admin-stack" data-testid="platform-payment-provider-vault">
        <section className="platform-admin-section card">
          <div className="platform-admin-section-copy">
            <div className="platform-admin-section-copy__eyebrow">Platform configuration</div>
            <h2>Payment providers</h2>
            <p>Server-side provider readiness. Secret values are encrypted at rest and never returned after save.</p>
          </div>
          {message ? <div className="alert success" role="status">{message}</div> : null}
          {error ? <div className="alert warning" role="alert">{error}</div> : null}
        </section>

        <section className="platform-admin-section card" data-testid="platform-email-provider-config">
          <div className="platform-admin-section-copy">
            <div className="platform-admin-section-copy__eyebrow">Email Provider</div>
            <h2>System email delivery</h2>
            <p>Platform-owned auth, staff setup, invite, booking, invoice, and operational mail must use a verified system sender.</p>
          </div>
          <div className="platform-admin-kpi-grid">
            <StatusCard label="Readiness" value={emailControl?.sender?.readiness?.status || "not_configured"} />
            <StatusCard label="Transport" value={emailControl?.sender?.readiness?.transport || "none"} />
            <StatusCard label="Environment" value={emailControl?.environment?.captureOnly ? "capture only" : emailControl?.environment?.liveSmtpAllowed ? "live SMTP allowed" : "unknown"} />
            <StatusCard label="Sender identity" value={emailControl?.sender?.senderIdentityVerified ? "verified" : "not verified"} />
            <StatusCard label="Paused" value={emailControl?.control?.paused || emailControl?.control?.providerSuspended ? "yes" : "no"} />
            <StatusCard label="Sent 24h" value={String(emailControl?.health?.sentLast24h ?? 0)} />
          </div>
          <div className="platform-admin-detail-grid">
            <div className="platform-admin-list">
              <p><strong>Sender</strong></p>
              <p>From: {emailControl?.sender?.readiness?.fromEmail || "missing"}</p>
              <p>Name: {emailControl?.sender?.readiness?.fromName || "missing"}</p>
              <p>Source: {emailControl?.sender?.readiness?.source || "missing"}</p>
              <p>{emailControl?.sender?.readiness?.guidance || "Configure the real provider before launch certification."}</p>
            </div>
            <div className="platform-admin-list" data-testid="platform-email-dns-checklist">
              <p><strong>SPF / DKIM / DMARC checklist</strong></p>
              <p>SPF: {emailControl?.domainAlignment?.spf || "unknown"}</p>
              <p>DKIM: {emailControl?.domainAlignment?.dkim || "unknown"}</p>
              <p>DMARC: {emailControl?.domainAlignment?.dmarc || "unknown"}</p>
              <p>Warmup: {emailControl?.domainAlignment?.warmup || "unknown"}</p>
            </div>
          </div>
          <div className="platform-admin-detail-grid" data-testid="platform-email-test-action">
            <label>
              <span className="muted">Operator-controlled test recipient</span>
              <input className="input" type="email" value={testEmailTo} onChange={(event) => setTestEmailTo(event.target.value)} placeholder="ops@example.com" data-testid="platform-email-test-recipient" />
            </label>
            <div style={{ display: "flex", alignItems: "end" }}>
              <button className="button secondary" type="button" disabled={busy !== "" || !testEmailTo.trim()} onClick={() => void sendTestEmail()} data-testid="platform-email-send-test">
                {busy === "email-test" ? "Sending…" : "Send test email"}
              </button>
            </div>
          </div>
          <div className="platform-admin-list" data-testid="platform-email-delivery-log">
            <p><strong>Recent delivery issues</strong></p>
            {(emailControl?.health?.recentProviderResponses || []).slice(0, 5).length ? (
              (emailControl?.health?.recentProviderResponses || []).slice(0, 5).map((event) => (
                <p key={event.id}>{formatTimestamp(event.createdAt)} · {event.status} · {event.recipientMasked} · {event.responseSummary || "redacted provider response"}</p>
              ))
            ) : <p>No recent provider failures recorded.</p>}
          </div>
        </section>

        <section className="platform-admin-section card" data-testid="platform-mytitan-billing-stripe-status">
          <div className="platform-admin-section-copy">
            <div className="platform-admin-section-copy__eyebrow">MyTitan Billing Stripe</div>
            <h2>Status only</h2>
            <p>Used only for MyTitan subscriptions, job packs, and platform billing.</p>
          </div>
          <div className="platform-admin-list">
            <p>Backend: {billing?.configured ? "configured" : "missing"}</p>
            <p>Key type: {billing?.backendKeyType || "missing"}</p>
            <p>Webhook: {billing?.webhookConfigured ? "configured" : "missing"}</p>
          </div>
        </section>

        <section className="platform-admin-section card" data-testid="platform-stripe-connect-config">
          <div className="platform-admin-section-copy">
            <div className="platform-admin-section-copy__eyebrow">Stripe Connect</div>
            <h2>Tenant customer payments</h2>
            <p>Used only for tenant customer deposits, invoices, final balances, and refunds.</p>
          </div>
          <div className="platform-admin-kpi-grid">
            <StatusCard label="Readiness" value={connect?.readiness || "missing_config"} />
            <StatusCard label="Platform credential" value={describeSecret(connect?.platformSecret)} />
            <StatusCard label="Webhook credential" value={describeSecret(connect?.webhookSecret)} />
            <StatusCard label="Mode" value={connect?.mode || "test"} />
            <StatusCard label="Runtime loaded" value={connect?.runtime?.runtimeLoaded ? "Yes" : "No"} />
            <StatusCard label="Last saved" value={formatTimestamp(connect?.lastSavedAt || connect?.updatedAt)} />
            <StatusCard label="Last verified" value={formatTimestamp(connect?.lastVerifiedAt)} />
          </div>
          <div className="platform-admin-detail-grid">
            <label>
              <span className="muted">Mode</span>
              <select className="input" value={mode} onChange={(event) => setMode(event.target.value === "live" ? "live" : "test")} data-testid="platform-connect-mode">
                <option value="test">Test</option>
                <option value="live">Live</option>
              </select>
            </label>
            <label>
              <span className="muted">Stripe Connect platform secret</span>
              <input className="input" type="password" autoComplete="new-password" value={platformSecret} onChange={(event) => setPlatformSecret(event.target.value)} placeholder={connect?.platformSecret.present ? `Stored ••••${connect.platformSecret.lastFour || ""}` : "sk_test_… or sk_live_…"} data-testid="platform-connect-secret" />
            </label>
            <label>
              <span className="muted">Stripe Connect webhook secret</span>
              <input className="input" type="password" autoComplete="new-password" value={webhookSecret} onChange={(event) => setWebhookSecret(event.target.value)} placeholder={connect?.webhookSecret.present ? `Stored ••••${connect.webhookSecret.lastFour || ""}` : "whsec_…"} data-testid="platform-connect-webhook-secret" />
            </label>
          </div>
          <label className="toggle-row">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} data-testid="platform-connect-confirm" />
            Confirm this platform-only credential change or rotation.
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="button" type="button" disabled={!confirmed || busy !== ""} onClick={() => void save()} data-testid="platform-connect-save">
              {busy === "save" ? "Saving…" : connect?.platformSecret.present || connect?.webhookSecret.present ? "Save / rotate" : "Save credentials"}
            </button>
            <button className="button secondary" type="button" disabled={busy !== "" || !connect?.platformSecret.present || !connect?.webhookSecret.present} onClick={() => void verify()} data-testid="platform-connect-verify">
              {busy === "verify" ? "Verifying…" : "Verify readiness"}
            </button>
            <button className="button secondary" type="button" disabled={busy !== ""} onClick={() => void reloadRuntime()} data-testid="platform-connect-reload">
              {busy === "reload" ? "Reloading…" : "Reload payment provider config"}
            </button>
            <button className="button secondary" type="button" disabled={busy !== ""} onClick={() => void runPreflight()} data-testid="platform-connect-preflight">
              {busy === "preflight" ? "Checking…" : "Run onboarding preflight"}
            </button>
          </div>
          {preflight ? (
            <div className="platform-admin-list" data-testid="platform-connect-preflight-result">
              <p>Mode: {preflight.mode}</p>
              <p>Platform secret loaded: {preflight.checks?.platformSecretLoaded ? "yes" : "no"}</p>
              <p>Webhook secret loaded: {preflight.checks?.webhookSecretLoaded ? "yes" : "no"}</p>
              <p>Stripe client initialised: {preflight.checks?.stripeClientInitialised ? "yes" : "no"}</p>
              <p>Connect platform access: {preflight.checks?.platformConnectAccess ? "yes" : "no"}</p>
              <p>Connect access diagnostic: {preflight.checks?.platformConnectFailureReason || "none"}</p>
              <p>Can reach account creation step: {preflight.checks?.canReachAccountCreationStep ? "yes" : "no"}</p>
            </div>
          ) : null}
          <div className="platform-admin-list" data-testid="platform-connect-last-onboarding-attempt">
            <p><strong>Last onboarding attempt</strong></p>
            {connect?.lastOnboardingAttempt ? (
              <>
                <p>Tenant: {connect.lastOnboardingAttempt.tenant?.name || connect.lastOnboardingAttempt.tenant?.id || "Unknown"}</p>
                <p>Result: {connect.lastOnboardingAttempt.result}</p>
                <p>Action URL returned: {connect.lastOnboardingAttempt.actionUrlReturned ? "yes" : "no"}</p>
                <p>Stripe account created: {connect.lastOnboardingAttempt.stripeAccountCreated ? "yes" : "no"}</p>
                <p>Account Link created: {connect.lastOnboardingAttempt.accountLinkCreated ? "yes" : "no"}</p>
                <p>Failure reason: {connect.lastOnboardingAttempt.failureReason || "none"}</p>
                <p>Attempted: {formatTimestamp(connect.lastOnboardingAttempt.attemptedAt)}</p>
              </>
            ) : <p>No onboarding attempt recorded.</p>}
          </div>
          <p className="muted">Last updated: {connect?.updatedAt ? new Date(connect.updatedAt).toLocaleString() : "never"} · Updated by: {connect?.updatedByUserId || "runtime environment"}</p>
        </section>
      </div>
    </PlatformShell>
  );
}

function describeSecret(secret?: SecretStatus | null) {
  if (!secret?.present) return "Missing";
  return `${secret.verificationStatus} · ••••${secret.lastFour || "stored"}`;
}

function formatTimestamp(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "Never";
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return <article className="platform-admin-kpi-card"><span className="platform-admin-kpi-card__label">{label}</span><strong className="platform-admin-kpi-card__value">{value}</strong></article>;
}
