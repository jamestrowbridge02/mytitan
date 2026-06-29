import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { PlatformShell } from "../../components/platform-shell";
import { apiFetch } from "../../lib/api";

const providers = ["smtp", "resend", "postmark", "ses", "sendgrid", "mailgun", "env_runtime"];

export default function PlatformInfrastructurePage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [billing, setBilling] = useState<any>(null);
  const [connect, setConnect] = useState<any>(null);
  const [email, setEmail] = useState<any>(null);
  const [monitor, setMonitor] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [testEmailTo, setTestEmailTo] = useState("");
  const [connectForm, setConnectForm] = useState({ mode: "test", platformSecret: "", webhookSecret: "", confirmation: false });
  const [emailForm, setEmailForm] = useState<any>({ provider: "smtp", host: "", port: 587, tlsMode: "starttls", username: "", secret: "", fromEmail: "", fromName: "MyTitan", replyToEmail: "", operatorTestRecipient: "", spfStatus: "unknown", dkimStatus: "unknown", dmarcStatus: "unknown", evidence: "" });
  const [monitorForm, setMonitorForm] = useState<any>({ provider: "", name: "", marketingUrl: "", appUrl: "", apiHealthUrl: "", alertRecipient: "", evidence: "", manualReason: "" });

  async function load() {
    const me = await apiFetch("/me");
    if (!me?.platformAdmin) {
      setAllowed(false);
      return;
    }
    setAllowed(true);
    const [paymentResponse, emailResponse, monitorResponse] = await Promise.all([
      apiFetch("/admin/platform/platform-configuration/payment-providers"),
      apiFetch("/admin/platform/email-control"),
      apiFetch("/admin/platform/infrastructure/external-monitor"),
    ]);
    setBilling(paymentResponse?.myTitanBillingStripe || null);
    setConnect(paymentResponse?.stripeConnect || null);
    setEmail(emailResponse || null);
    setMonitor(monitorResponse?.monitor || null);
    setConnectForm((current) => ({ ...current, mode: paymentResponse?.stripeConnect?.mode === "live" ? "live" : "test" }));
    if (emailResponse?.config) {
      setEmailForm((current: any) => ({
        ...current,
        provider: emailResponse.config.provider || "smtp",
        host: emailResponse.config.host || "",
        port: emailResponse.config.port || 587,
        tlsMode: emailResponse.config.tlsMode || "starttls",
        fromEmail: emailResponse.config.fromEmail || "",
        fromName: emailResponse.config.fromName || "MyTitan",
        replyToEmail: emailResponse.config.replyToEmail || "",
        operatorTestRecipient: emailResponse.config.operatorTestRecipient || "",
        spfStatus: emailResponse.config.spfStatus || "unknown",
        dkimStatus: emailResponse.config.dkimStatus || "unknown",
        dmarcStatus: emailResponse.config.dmarcStatus || "unknown",
        evidence: emailResponse.config.evidence || "",
      }));
      setTestEmailTo(emailResponse.config.operatorTestRecipient || "");
    }
    if (monitorResponse?.monitor) {
      setMonitorForm((current: any) => ({ ...current, ...monitorResponse.monitor, manualReason: "" }));
    }
  }

  useEffect(() => {
    void load().catch((loadError: any) => {
      setAllowed(false);
      setError(loadError?.message || "Platform Infrastructure could not be loaded.");
    });
  }, []);

  async function runAction(name: string, action: () => Promise<string | void>) {
    setBusy(name);
    setError("");
    setMessage("");
    try {
      const nextMessage = await action();
      setMessage(nextMessage || "Action completed.");
      await load();
    } catch (actionError: any) {
      setError(actionError?.message || "Action failed.");
      await load().catch(() => undefined);
    } finally {
      setBusy("");
    }
  }

  if (allowed === null) return <PlatformShell><div className="card">Loading protected Platform Infrastructure...</div></PlatformShell>;
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

  const emailReadiness = email?.sender?.readiness;
  const emailConfig = email?.config || {};

  return (
    <PlatformShell>
      <div className="platform-admin-stack" data-testid="platform-infrastructure">
        <div data-testid="platform-payment-provider-vault" style={{ display: "contents" }}>
        <section className="platform-admin-section card">
          <div className="platform-admin-section-copy">
            <div className="platform-admin-section-copy__eyebrow">Platform Admin</div>
            <h2>Infrastructure</h2>
            <p>One authoritative home for platform dependency configuration, verification, diagnostics, and operational history.</p>
          </div>
          {message ? <div className="alert success" role="status">{message}</div> : null}
          {error ? <div className="alert warning" role="alert">{error}</div> : null}
        </section>

        <InfrastructureCard
          title="Email"
          testId="platform-email-provider-config"
          status={emailReadiness?.status || "not_configured"}
          source={emailConfig.source || emailReadiness?.source || "missing"}
          requiredConfig="Provider, host/port/TLS or API key, From Email, From Name, Reply-To, DNS evidence."
          owner="Platform operations"
          nextAction={emailConfig.nextAction || "Configure Email Provider."}
          lastChecked={emailConfig.lastChecked || emailReadiness?.environment || null}
          diagnostics={`transport=${emailReadiness?.transport || "none"} secret=${emailConfig.secret?.present ? `present ••••${emailConfig.secret?.lastFour || "stored"}` : "missing"}`}
        >
          <div className="platform-admin-detail-grid">
            <label><span className="muted">Provider</span><select className="input" value={emailForm.provider} disabled={emailConfig.source === "runtime_environment"} onChange={(event) => setEmailForm({ ...emailForm, provider: event.target.value })} data-testid="platform-email-provider-select">{providers.map((provider) => <option key={provider} value={provider}>{provider}</option>)}</select></label>
            <label><span className="muted">Host</span><input className="input" value={emailForm.host} disabled={emailConfig.source === "runtime_environment"} onChange={(event) => setEmailForm({ ...emailForm, host: event.target.value })} data-testid="platform-email-host" /></label>
            <label><span className="muted">Port</span><input className="input" type="number" value={emailForm.port} disabled={emailConfig.source === "runtime_environment"} onChange={(event) => setEmailForm({ ...emailForm, port: Number(event.target.value || 0) })} data-testid="platform-email-port" /></label>
            <label><span className="muted">TLS</span><select className="input" value={emailForm.tlsMode} disabled={emailConfig.source === "runtime_environment"} onChange={(event) => setEmailForm({ ...emailForm, tlsMode: event.target.value })} data-testid="platform-email-tls"><option value="starttls">STARTTLS</option><option value="ssl">SSL</option><option value="none">None</option></select></label>
            <label><span className="muted">Username</span><input className="input" value={emailForm.username} disabled={emailConfig.source === "runtime_environment"} onChange={(event) => setEmailForm({ ...emailForm, username: event.target.value })} data-testid="platform-email-username" /></label>
            <label><span className="muted">Password / API key</span><input className="input" type="password" autoComplete="new-password" placeholder={emailConfig.secret?.present ? `Stored ••••${emailConfig.secret?.lastFour || ""}` : "Stored encrypted after save"} disabled={emailConfig.source === "runtime_environment"} value={emailForm.secret} onChange={(event) => setEmailForm({ ...emailForm, secret: event.target.value })} data-testid="platform-email-secret" /></label>
            <label><span className="muted">From Email</span><input className="input" type="email" value={emailForm.fromEmail} disabled={emailConfig.source === "runtime_environment"} onChange={(event) => setEmailForm({ ...emailForm, fromEmail: event.target.value })} data-testid="platform-email-from" /></label>
            <label><span className="muted">From Name</span><input className="input" value={emailForm.fromName} disabled={emailConfig.source === "runtime_environment"} onChange={(event) => setEmailForm({ ...emailForm, fromName: event.target.value })} data-testid="platform-email-from-name" /></label>
            <label><span className="muted">Reply-To</span><input className="input" type="email" value={emailForm.replyToEmail} disabled={emailConfig.source === "runtime_environment"} onChange={(event) => setEmailForm({ ...emailForm, replyToEmail: event.target.value })} data-testid="platform-email-reply-to" /></label>
            <label><span className="muted">Operator test recipient</span><input className="input" type="email" value={emailForm.operatorTestRecipient} disabled={emailConfig.source === "runtime_environment"} onChange={(event) => { setEmailForm({ ...emailForm, operatorTestRecipient: event.target.value }); setTestEmailTo(event.target.value); }} data-testid="platform-email-test-recipient" /></label>
          </div>
          <div className="platform-admin-detail-grid" data-testid="platform-email-dns-checklist">
            <label><span className="muted">SPF</span><input className="input" value={emailForm.spfStatus} disabled={emailConfig.source === "runtime_environment"} onChange={(event) => setEmailForm({ ...emailForm, spfStatus: event.target.value })} /></label>
            <label><span className="muted">DKIM</span><input className="input" value={emailForm.dkimStatus} disabled={emailConfig.source === "runtime_environment"} onChange={(event) => setEmailForm({ ...emailForm, dkimStatus: event.target.value })} /></label>
            <label><span className="muted">DMARC</span><input className="input" value={emailForm.dmarcStatus} disabled={emailConfig.source === "runtime_environment"} onChange={(event) => setEmailForm({ ...emailForm, dmarcStatus: event.target.value })} /></label>
            <label><span className="muted">Evidence</span><input className="input" value={emailForm.evidence} disabled={emailConfig.source === "runtime_environment"} onChange={(event) => setEmailForm({ ...emailForm, evidence: event.target.value })} /></label>
          </div>
          <ActionRow>
            <button className="button" type="button" disabled={busy !== "" || emailConfig.source === "runtime_environment"} onClick={() => runAction("email-save", async () => { await apiFetch("/admin/platform/email-control/provider", { method: "PATCH", body: JSON.stringify(emailForm) }); setEmailForm({ ...emailForm, secret: "" }); return "Email provider saved encrypted. Stored secret values are not shown."; })} data-testid="platform-email-save">{busy === "email-save" ? "Saving..." : "Configure Email Provider"}</button>
            <button className="button secondary" type="button" disabled={busy !== ""} onClick={() => runAction("email-verify", async () => { await apiFetch("/admin/platform/email-control/provider/verify", { method: "POST", body: JSON.stringify({}) }); return "Email provider verification completed truthfully."; })} data-testid="platform-email-verify">Verify provider</button>
            <button className="button secondary" type="button" disabled={busy !== "" || !testEmailTo.trim()} onClick={() => runAction("email-test", async () => { const response = await apiFetch("/admin/platform/email-control/test-email", { method: "POST", body: JSON.stringify({ to: testEmailTo }) }); return response?.ok ? `Test email sent to ${response.recipientMasked}.` : response?.readiness?.guidance || "Email test returned a truthful provider error."; })} data-testid="platform-email-send-test">Send test email</button>
            <button className="button secondary" type="button" disabled={busy !== ""} onClick={() => runAction("email-pause", async () => { await apiFetch("/admin/platform/email-control", { method: "PATCH", body: JSON.stringify({ action: email?.control?.paused ? "resume" : "pause", reason: "Platform admin infrastructure control" }) }); return email?.control?.paused ? "Email sending resumed." : "Email sending paused."; })} data-testid="platform-email-pause">{email?.control?.paused ? "Resume sending" : "Pause sending"}</button>
          </ActionRow>
          <HistoryList testId="platform-email-delivery-log" rows={(email?.health?.recentProviderResponses || []).map((event: any) => `${formatTimestamp(event.createdAt)} - ${event.status} - ${event.recipientMasked} - ${event.responseSummary || "redacted provider response"}`)} empty="No recent provider failures recorded." />
        </InfrastructureCard>

        <InfrastructureCard title="Tenant Customer Payment Providers" testId="platform-stripe-connect-config" status={connect?.readiness || "missing_config"} source={connect?.platformSecret?.source || "missing"} requiredConfig="Provider-owned or tenant-owned setup only: Stripe Connect platform secret, webhook secret, webhook URL, tenant onboarding canary evidence, bank transfer details, or manual card terminal recording." owner="Platform operations" nextAction={connect?.readiness === "ready" ? "Run onboarding preflight before enabling tenant payments." : "Configure Stripe Connect credentials."} lastChecked={connect?.lastVerifiedAt || connect?.updatedAt} diagnostics={`mode=${connect?.mode || "test"} platform_secret=${describeSecret(connect?.platformSecret)} webhook_secret=${describeSecret(connect?.webhookSecret)} Runtime loaded=${connect?.runtime?.runtimeLoaded ? "yes" : "no"}`}>
          <BoundaryNotice
            testId="tenant-customer-money-boundary"
            eyebrow="Tenant customer money"
            copy="Used by each business to receive money from its own customers. Customer deposits, invoice payments, refunds, and trade payments go directly through the provider owned or connected by that business."
          />
          <div className="platform-admin-detail-grid" data-testid="tenant-payment-provider-categories">
            <ProviderOption name="Stripe Connect" category="Connected account" copy="Connect each business's own Stripe account so customers can pay that business directly." />
            <ProviderOption name="Bank transfer" category="Manual transfer" copy="Show business-owned bank details and record payment only after the business confirms receipt." />
            <ProviderOption name="Manual card terminal" category="External terminal" copy="Record payments taken on a card terminal owned or contracted by the business." />
          </div>
          <div className="platform-admin-list" data-testid="payment-boundary-never-mixed">
            <p><strong>Platform money</strong></p>
            <p>MyTitan subscriptions, plans, job packs, and platform invoices use MyTitan Billing Stripe.</p>
            <p><strong>Tenant customer money</strong></p>
            <p>Deposits, invoice payments, refunds, and trade payments use the tenant customer payment provider owned or connected by that business.</p>
            <p><strong>Never mixed</strong></p>
            <p>Tenant customer money must never be routed through MyTitan Billing Stripe.</p>
          </div>
          <div className="platform-admin-detail-grid">
            <label><span className="muted">Mode</span><select className="input" value={connectForm.mode} onChange={(event) => setConnectForm({ ...connectForm, mode: event.target.value })} data-testid="platform-connect-mode"><option value="test">Test</option><option value="live">Live</option></select></label>
            <label><span className="muted">Platform secret</span><input className="input" type="password" value={connectForm.platformSecret} autoComplete="new-password" placeholder={connect?.platformSecret?.present ? `Stored ••••${connect.platformSecret.lastFour || ""}` : "sk_test_... or sk_live_..."} onChange={(event) => setConnectForm({ ...connectForm, platformSecret: event.target.value })} data-testid="platform-connect-secret" /></label>
            <label><span className="muted">Webhook secret</span><input className="input" type="password" value={connectForm.webhookSecret} autoComplete="new-password" placeholder={connect?.webhookSecret?.present ? `Stored ••••${connect.webhookSecret.lastFour || ""}` : "whsec_..."} onChange={(event) => setConnectForm({ ...connectForm, webhookSecret: event.target.value })} data-testid="platform-connect-webhook-secret" /></label>
          </div>
          <label className="toggle-row"><input type="checkbox" checked={connectForm.confirmation} onChange={(event) => setConnectForm({ ...connectForm, confirmation: event.target.checked })} data-testid="platform-connect-confirm" /> Confirm this platform-only credential change or rotation.</label>
          <ActionRow>
            <button className="button" disabled={!connectForm.confirmation || busy !== ""} onClick={() => runAction("connect-save", async () => { await apiFetch("/admin/platform/platform-configuration/payment-providers/stripe-connect", { method: "PATCH", body: JSON.stringify(connectForm) }); setConnectForm({ ...connectForm, platformSecret: "", webhookSecret: "", confirmation: false }); return "Stripe Connect credentials saved encrypted."; })} data-testid="platform-connect-save">Configure secrets</button>
            <button className="button secondary" disabled={busy !== ""} onClick={() => runAction("connect-verify", async () => { await apiFetch("/admin/platform/platform-configuration/payment-providers/stripe-connect/verify", { method: "POST", body: JSON.stringify({}) }); return "Stripe Connect readiness verification completed."; })} data-testid="platform-connect-verify">Verify readiness</button>
            <button className="button secondary" disabled={busy !== ""} onClick={() => runAction("connect-preflight", async () => { await apiFetch("/admin/platform/platform-configuration/payment-providers/stripe-connect/preflight", { method: "POST", body: JSON.stringify({}) }); return "Tenant onboarding preflight completed without creating a connected account."; })} data-testid="platform-connect-preflight">Generate onboarding test</button>
          </ActionRow>
          <HistoryList testId="platform-connect-last-onboarding-attempt" rows={connect?.lastOnboardingAttempt ? [`${formatTimestamp(connect.lastOnboardingAttempt.attemptedAt)} - ${connect.lastOnboardingAttempt.result} - ${connect.lastOnboardingAttempt.failureReason || "no redacted error"}`] : []} empty="No onboarding attempt recorded." />
        </InfrastructureCard>

        <InfrastructureCard title="MyTitan Billing Stripe" testId="platform-mytitan-billing-stripe-status" status={billing?.configured ? "configured" : "missing_config"} source="runtime_environment" requiredConfig="Platform subscription prices, job-pack products, billing webhook, restricted billing key." owner="Platform finance operations" nextAction="Run subscription price verification and job-pack sync during release validation." lastChecked={null} diagnostics={`backend=${billing?.backendKeyType || "missing"} webhook=${billing?.webhookConfigured ? "present" : "missing"} purpose=platform_subscriptions_only`}>
          <BoundaryNotice
            testId="platform-money-boundary"
            eyebrow="Platform money"
            copy="Used only for MyTitan subscriptions, plans, job packs, and platform billing. It must never receive customer deposit or invoice money for tenant businesses."
          />
          <div className="platform-admin-list" data-testid="mytitan-billing-validation-notes">
            <p><strong>Validation only</strong></p>
            <p>Verify subscription prices and sync the job-pack catalog during release validation. Do not mutate Stripe products or prices from this infrastructure page.</p>
          </div>
        </InfrastructureCard>

        <InfrastructureCard title="Monitoring" testId="platform-external-monitor-config" status={monitor?.status || "not_configured"} source={monitor?.sourceOfTruth || "missing"} requiredConfig="Provider, marketing URL, app URL, API health URL, alert recipient, external evidence." owner="Platform operations" nextAction={monitor?.nextAction || "Configure External Uptime Monitor."} lastChecked={monitor?.lastCheckedAt} diagnostics={monitor?.failureReason || "No redacted provider error recorded."}>
          <div className="platform-admin-detail-grid">
            <label><span className="muted">Provider</span><input className="input" value={monitorForm.provider || ""} onChange={(event) => setMonitorForm({ ...monitorForm, provider: event.target.value })} data-testid="platform-monitor-provider" /></label>
            <label><span className="muted">Name</span><input className="input" value={monitorForm.name || ""} onChange={(event) => setMonitorForm({ ...monitorForm, name: event.target.value })} /></label>
            <label><span className="muted">Marketing URL</span><input className="input" value={monitorForm.marketingUrl || ""} onChange={(event) => setMonitorForm({ ...monitorForm, marketingUrl: event.target.value })} /></label>
            <label><span className="muted">App URL</span><input className="input" value={monitorForm.appUrl || ""} onChange={(event) => setMonitorForm({ ...monitorForm, appUrl: event.target.value })} /></label>
            <label><span className="muted">API health URL</span><input className="input" value={monitorForm.apiHealthUrl || ""} onChange={(event) => setMonitorForm({ ...monitorForm, apiHealthUrl: event.target.value })} /></label>
            <label><span className="muted">Alert recipient</span><input className="input" value={monitorForm.alertRecipient || ""} onChange={(event) => setMonitorForm({ ...monitorForm, alertRecipient: event.target.value })} /></label>
            <label><span className="muted">Manual verifying reason</span><input className="input" value={monitorForm.manualReason || ""} onChange={(event) => setMonitorForm({ ...monitorForm, manualReason: event.target.value })} /></label>
            <label><span className="muted">Evidence reference</span><input className="input" value={monitorForm.evidence || ""} onChange={(event) => setMonitorForm({ ...monitorForm, evidence: event.target.value })} /></label>
          </div>
          <ActionRow>
            <button className="button" disabled={busy !== ""} onClick={() => runAction("monitor-save", async () => { await apiFetch("/admin/platform/infrastructure/external-monitor", { method: "PATCH", body: JSON.stringify(monitorForm) }); return "External monitor configuration saved as verifying."; })} data-testid="platform-monitor-save">Configure monitor</button>
            <button className="button secondary" disabled={busy !== ""} onClick={() => runAction("monitor-verify", async () => { await apiFetch("/admin/platform/infrastructure/external-monitor/verify", { method: "POST", body: JSON.stringify({ reason: monitorForm.manualReason }) }); return "External monitor verification checked without faking healthy state."; })} data-testid="platform-monitor-verify">Verify monitor</button>
          </ActionRow>
          <HistoryList testId="platform-monitor-history" rows={[monitor?.evidence, monitor?.manualReason, monitor?.failureReason].filter(Boolean)} empty="No external monitor history recorded." />
        </InfrastructureCard>

        {[
          ["Backups", "scripts/backup-readiness-status.sh", "Run backup readiness and restore drill evidence."],
          ["Storage", "upload policy and artifact store", "Verify upload limits and artifact retention evidence."],
          ["DNS / Sender Identity", "email provider DNS evidence", "Attach SPF, DKIM, DMARC, and sender identity status."],
          ["Security", "production-readiness-check.sh", "Run production readiness and review security blockers."],
          ["Runtime", "internal monitoring / healthcheck", "Run healthcheck and Autopilot sentinel refresh."],
          ["Database / Redis / Scheduler", "internal monitoring snapshots", "Verify migrate deploy, Redis health, and summary scheduler status."],
          ["Integrations", "integration rollout monitoring", "Review failed provider setup and webhook delivery attempts."],
          ["Vault / Secrets", "encrypted platform config tables and runtime env", "Rotate secrets through provider-specific configure actions."],
        ].map(([title, source, nextAction]) => (
          <InfrastructureCard key={title} title={title} testId={`platform-infra-${slug(title)}`} status="action_required" source={source} requiredConfig="Operational evidence and owner-reviewed configuration." owner="Platform operations" nextAction={nextAction} lastChecked={null} diagnostics="No secret values displayed. Use release validation and provider logs for detailed evidence." />
        ))}
        </div>
      </div>
    </PlatformShell>
  );
}

function InfrastructureCard({ title, testId, status, source, requiredConfig, owner, nextAction, lastChecked, diagnostics, children }: any) {
  return (
    <section className="platform-admin-section card" data-testid={testId}>
      <div className="platform-admin-section-copy">
        <div className="platform-admin-section-copy__eyebrow">Infrastructure</div>
        <h2>{title}</h2>
      </div>
      <div className="platform-admin-kpi-grid">
        <StatusCard label="Status" value={status} />
        <StatusCard label="Source of truth" value={source} />
        <StatusCard label="Owner" value={owner} />
        <StatusCard label="Last checked" value={formatTimestamp(lastChecked)} />
      </div>
      <div className="platform-admin-list">
        <p><strong>Required config</strong></p>
        <p>{requiredConfig}</p>
        <p><strong>Next action</strong></p>
        <p>{nextAction}</p>
        <p><strong>Redacted diagnostics</strong></p>
        <p>{diagnostics}</p>
      </div>
      {children}
    </section>
  );
}

function BoundaryNotice({ testId, eyebrow, copy }: { testId: string; eyebrow: string; copy: string }) {
  return (
    <div className="platform-admin-list" data-testid={testId}>
      <p><strong>{eyebrow}</strong></p>
      <p>{copy}</p>
    </div>
  );
}

function ProviderOption({ name, category, copy }: { name: string; category: string; copy: string }) {
  return (
    <div className="settings-premium-subcard">
      <p className="muted" style={{ margin: "0 0 6px 0" }}>{category}</p>
      <strong>{name}</strong>
      <p className="muted" style={{ margin: "6px 0 0 0" }}>{copy}</p>
    </div>
  );
}

function ActionRow({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>{children}</div>;
}

function HistoryList({ testId, rows, empty }: { testId: string; rows: string[]; empty: string }) {
  return <div className="platform-admin-list" data-testid={testId}><p><strong>Delivery / log / history</strong></p>{rows.length ? rows.slice(0, 6).map((row) => <p key={row}>{row}</p>) : <p>{empty}</p>}</div>;
}

function describeSecret(secret?: any) {
  if (!secret?.present) return "missing";
  return `${secret.verificationStatus || "present"} ••••${secret.lastFour || "stored"}`;
}

function formatTimestamp(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return <article className="platform-admin-kpi-card"><span className="platform-admin-kpi-card__label">{label}</span><strong className="platform-admin-kpi-card__value">{value}</strong></article>;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
