import { useEffect, useMemo, useState } from "react";
import { PlatformShell } from "../../components/platform-shell";
import { apiFetch } from "../../lib/api";

type StatusItem = {
  value: any;
  state: string;
  detail: string;
  source: string;
};

const statusLabels: Record<string, string> = {
  actual: "Actual",
  forecast: "Forecast",
  not_configured: "Not configured",
  not_enough_data: "Not enough data",
  roadmap: "Roadmap",
  attention_needed: "Attention needed",
  ready_for_review: "Ready for review",
};

function fmt(value: any) {
  if (value === null || value === undefined || value === "") return "Not available";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function StatusPill({ state }: { state?: string }) {
  const normalized = String(state || "not_configured");
  const tone = normalized === "actual" || normalized === "ready" || normalized === "healthy" ? "success" : normalized === "roadmap" || normalized === "not_enough_data" ? "neutral" : "warn";
  return <span className={`platform-admin-status-pill platform-admin-status-pill--${tone}`}>{statusLabels[normalized] || normalized.replace(/_/g, " ")}</span>;
}

function Metric({ label, item, testId }: { label: string; item?: StatusItem; testId?: string }) {
  return (
    <article className="platform-admin-kpi-card" data-testid={testId}>
      <div className="platform-admin-kpi-card__head">
        <span className="platform-admin-kpi-card__label">{label}</span>
        <StatusPill state={item?.state} />
      </div>
      <strong className="platform-admin-kpi-card__value">{fmt(item?.value)}</strong>
      <p className="muted platform-admin-kpi-card__detail">{item?.detail || "No detail available."}</p>
    </article>
  );
}

function Row({ label, item, testId }: { label: string; item?: StatusItem; testId?: string }) {
  return (
    <div className="platform-admin-readiness-row" data-testid={testId}>
      <span>{label}</span>
      <strong>{fmt(item?.value)}</strong>
      <StatusPill state={item?.state} />
    </div>
  );
}

function SectionCard({ section }: { section: any }) {
  return (
    <article className="card platform-admin-card-stack" data-testid={`company-os-section-${section.key}`}>
      <div className="platform-admin-card-heading">
        <strong>{section.title}</strong>
        <StatusPill state={section.status} />
      </div>
      <p className="muted">Owner: {section.owner} · Last updated: {fmt(section.lastUpdated)}</p>
      <div className="platform-admin-list">
        <p><strong>Next action:</strong> {section.nextAction}</p>
        <p><strong>Risks:</strong> {(section.risks || []).join("; ") || "No current risk recorded."}</p>
      </div>
      <div className="platform-admin-chip-row">
        {(section.links || []).map((link: any) => <a key={link.href + link.label} className="button secondary" href={link.href}>{link.label}</a>)}
      </div>
    </article>
  );
}

export default function CompanyOsPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [incidentMessage, setIncidentMessage] = useState("");
  const [incident, setIncident] = useState({
    severity: "medium",
    affectedService: "platform",
    owner: "Platform Ops",
    summary: "",
    customerImpact: "No customer impact confirmed yet.",
    preventionAction: "Assign owner and complete prevention action.",
  });

  async function load() {
    const me = await apiFetch("/me");
    if (!me?.platformAdmin) {
      setAllowed(false);
      return;
    }
    setAllowed(true);
    setData(await apiFetch("/admin/platform/company-os"));
  }

  useEffect(() => {
    void load().catch((loadError: any) => {
      setAllowed(false);
      setError(loadError?.message || "Company OS could not be loaded.");
    });
  }, []);

  async function createIncident() {
    setError("");
    setIncidentMessage("");
    try {
      const result = await apiFetch("/admin/platform/company-os/incidents", {
        method: "POST",
        body: JSON.stringify({ ...incident, timelineEvent: incident.summary }),
      });
      setIncidentMessage(`Incident ${result.incident.id} created.`);
      setIncident((current) => ({ ...current, summary: "" }));
      await load();
    } catch (createError: any) {
      setError(createError?.message || "Incident could not be created.");
    }
  }

  const evidenceText = useMemo(() => JSON.stringify(data?.evidenceLibrary || []), [data?.evidenceLibrary]);

  if (allowed === null) return <PlatformShell><div className="card">Loading Company OS...</div></PlatformShell>;
  if (!allowed) {
    return (
      <PlatformShell>
        <section className="card" data-testid="company-os-forbidden">
          <h2>Platform admin access required</h2>
          <p>Company operating evidence, incidents, and commercial actuals are platform-only.</p>
        </section>
      </PlatformShell>
    );
  }

  const commercial = data?.commercial || {};
  const customerSuccess = data?.customerSuccess || {};
  const enterprise = data?.enterprise || {};
  const release = data?.releaseGovernance || {};

  return (
    <PlatformShell>
      <div className="platform-admin-stack" data-testid="company-os-page">
        <section className="platform-admin-section card" data-testid="company-os-overview">
          <div className="platform-admin-section__head">
            <div className="platform-admin-section-copy">
              <div className="platform-admin-section-copy__eyebrow">Company OS</div>
              <h2>MyTitan Ltd operating system</h2>
              <p>Evidence-led governance for engineering, operations, customer success, commercial growth, product quality, enterprise readiness, release control, and incidents.</p>
            </div>
          </div>
          {error ? <div className="alert warning" role="alert">{error}</div> : null}
          <div className="platform-admin-chip-row" data-testid="company-os-taxonomy">
            {(data?.statusTaxonomy || []).map((state: string) => <StatusPill key={state} state={state} />)}
          </div>
          <div className="platform-admin-kpi-grid">
            <Metric label="Actual MRR" item={commercial.actualMrr} testId="company-os-actual-mrr" />
            <Metric label="Actual ARR" item={commercial.actualArr} testId="company-os-actual-arr" />
            <Metric label="Paid customers" item={commercial.paidCustomers} testId="company-os-paid-customers" />
            <Metric label="External uptime" item={data?.operations?.uptimeMonitorState} testId="company-os-uptime-state" />
          </div>
        </section>

        <section className="platform-admin-section card" data-testid="company-os-sections">
          <div className="platform-admin-section-copy"><h2>Operating model</h2></div>
          <div className="platform-admin-detail-grid">
            {(data?.sections || []).map((section: any) => <SectionCard key={section.key} section={section} />)}
          </div>
        </section>

        <section id="engineering" className="platform-admin-section card" data-testid="company-os-engineering-dashboard">
          <div className="platform-admin-section-copy"><h2>Engineering dashboard</h2></div>
          <div className="platform-admin-readiness-card">
            <Row label="Build status" item={data?.engineering?.buildStatus} />
            <Row label="Test suite status" item={data?.engineering?.testSuiteStatus} testId="company-os-test-suite-status" />
            <Row label="Typecheck evidence" item={data?.engineering?.typecheckEvidence} />
            <Row label="Dependency audit status" item={data?.engineering?.dependencyAuditStatus} />
            <Row label="API contract evidence" item={data?.engineering?.apiContractEvidence} />
            <Row label="Migration status" item={data?.engineering?.migrationStatus} />
          </div>
        </section>

        <section id="operations" className="platform-admin-section card" data-testid="company-os-platform-operations">
          <div className="platform-admin-section-copy"><h2>Platform operations</h2></div>
          <div className="platform-admin-readiness-card">
            <Row label="API health" item={data?.operations?.apiHealth} />
            <Row label="App health" item={data?.operations?.appHealth} />
            <Row label="Marketing health" item={data?.operations?.marketingHealth} />
            <Row label="Database health" item={data?.operations?.databaseHealth} />
            <Row label="Redis health" item={data?.operations?.redisHealth} />
            <Row label="Backup freshness" item={data?.operations?.backupFreshness} />
            <Row label="Scheduler status" item={data?.operations?.schedulerStatus} />
            <Row label="Autopilot sentinels" item={data?.operations?.autopilotSentinelStatus} />
            <Row label="External uptime" item={data?.operations?.uptimeMonitorState} />
            <Row label="Alert queue" item={data?.operations?.alertQueue} />
            <Row label="Readiness status" item={data?.operations?.readinessStatus} />
            <Row label="Rollback readiness" item={data?.operations?.rollbackReadiness} />
          </div>
        </section>

        <section id="customer-success" className="platform-admin-section card" data-testid="company-os-customer-success">
          <div className="platform-admin-section-copy"><h2>Customer success</h2></div>
          <div className="platform-admin-kpi-grid">
            <Metric label="Onboarding pipeline" item={customerSuccess.onboardingPipeline} />
            <Metric label="First booking achieved" item={customerSuccess.firstBookingAchieved} />
            <Metric label="First job completed" item={customerSuccess.firstJobCompleted} />
            <Metric label="NPS" item={customerSuccess.nps} testId="company-os-nps" />
            <Metric label="CSAT" item={customerSuccess.csat} testId="company-os-csat" />
          </div>
        </section>

        <section id="commercial-growth" className="platform-admin-section card" data-testid="company-os-commercial-growth">
          <div className="platform-admin-section-copy"><h2>Commercial growth</h2></div>
          <div className="platform-admin-kpi-grid">
            <Metric label="Actual MRR GBP" item={commercial.actualMrr} />
            <Metric label="Actual MRR USD" item={commercial.actualMrrUsd} testId="company-os-actual-mrr-usd" />
            <Metric label="Actual ARR GBP" item={commercial.actualArr} />
            <Metric label="Paid customers" item={commercial.paidCustomers} />
            <Metric label="Trial customers" item={commercial.trialCustomers} />
            <Metric label="Job-pack revenue" item={commercial.jobPackRevenue} />
          </div>
          <p data-testid="company-os-tenant-money-excluded">Tenant deposits and tenant invoices are excluded from MyTitan revenue: {commercial.tenantCustomerMoneyExcluded ? "yes" : "no"}</p>
        </section>

        <section id="product-quality" className="platform-admin-section card" data-testid="company-os-product-quality">
          <div className="platform-admin-section-copy"><h2>Product quality</h2></div>
          <div className="platform-admin-readiness-card">
            {Object.entries(data?.productQuality || {}).map(([key, item]: [string, any]) => <Row key={key} label={key.replace(/([A-Z])/g, " $1")} item={item} />)}
          </div>
        </section>

        <section id="enterprise" className="platform-admin-section card" data-testid="company-os-enterprise-readiness">
          <div className="platform-admin-section-copy"><h2>Enterprise readiness</h2></div>
          <div className="platform-admin-kpi-grid">
            <Metric label="SSO" item={enterprise.sso} testId="company-os-sso-status" />
            <Metric label="SCIM" item={enterprise.scim} testId="company-os-scim-status" />
            <Metric label="Data residency" item={enterprise.dataResidency} />
            <Metric label="Security assessment" item={enterprise.securityAssessment} />
          </div>
        </section>

        <section id="release" className="platform-admin-section card" data-testid="company-os-release-governance">
          <div className="platform-admin-section-copy"><h2>Release governance</h2></div>
          <div className="platform-admin-readiness-card">
            <div className="platform-admin-readiness-row" data-testid="company-os-current-tag"><span>Current tag</span><strong>{release.currentTag}</strong><StatusPill state="actual" /></div>
            <div className="platform-admin-readiness-row" data-testid="company-os-current-commit"><span>Commit hash</span><strong>{release.commitHash}</strong><StatusPill state="actual" /></div>
            <Row label="Release candidate" item={release.releaseCandidateStatus} />
            <Row label="Validation evidence" item={release.validationEvidence} />
            <Row label="Stripe/payment canary" item={release.stripePaymentCanaryStatus} />
          </div>
        </section>

        <section id="incidents" className="platform-admin-section card" data-testid="company-os-incidents">
          <div className="platform-admin-section-copy"><h2>Incident management</h2></div>
          {incidentMessage ? <div className="alert success" role="status">{incidentMessage}</div> : null}
          <div className="platform-admin-filter-grid">
            <select className="input" value={incident.severity} onChange={(event) => setIncident((current) => ({ ...current, severity: event.target.value }))} data-testid="company-os-incident-severity">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <input className="input" value={incident.affectedService} onChange={(event) => setIncident((current) => ({ ...current, affectedService: event.target.value }))} data-testid="company-os-incident-service" />
            <input className="input" value={incident.owner} onChange={(event) => setIncident((current) => ({ ...current, owner: event.target.value }))} data-testid="company-os-incident-owner" />
            <input className="input" value={incident.summary} onChange={(event) => setIncident((current) => ({ ...current, summary: event.target.value }))} placeholder="Incident summary" data-testid="company-os-incident-summary" />
            <button className="button" type="button" onClick={() => void createIncident()} disabled={incident.summary.trim().length < 8} data-testid="company-os-create-incident">Create incident</button>
          </div>
          <div className="platform-admin-list">
            {(data?.incidents || []).map((row: any) => (
              <article className="card platform-admin-card-stack" key={row.id} data-testid={`company-os-incident-${row.id}`}>
                <div className="platform-admin-card-heading"><strong>{row.affectedService}</strong><StatusPill state={row.status} /></div>
                <p>{row.customerImpact}</p>
                <p className="muted">Owner: {row.owner} · Prevention: {row.preventionAction}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="evidence-library" className="platform-admin-section card" data-testid="company-os-evidence-library">
          <div className="platform-admin-section-copy"><h2>Evidence library</h2></div>
          <div className="platform-admin-list">
            {(data?.evidenceLibrary || []).map((item: any, index: number) => (
              <div key={`${item.type}-${index}`} className="platform-admin-readiness-row">
                <span>{item.type}</span>
                <strong>{item.owner}</strong>
                <StatusPill state={item.status} />
              </div>
            ))}
          </div>
          <p className="muted" data-testid="company-os-evidence-secret-scan">Evidence secret scan: {/(sk_live_|whsec_|platformSecretEncrypted|webhookSecretEncrypted)/i.test(evidenceText) ? "failed" : "passed"}</p>
        </section>

        <section id="autopilot-linkage" className="platform-admin-section card" data-testid="company-os-autopilot-linkage">
          <div className="platform-admin-section-copy"><h2>Autopilot linkage</h2><p>{data?.autopilotLinkage?.summary}</p></div>
          <div className="platform-admin-chip-row">
            {(data?.autopilotLinkage?.feeds || []).map((feed: any) => <a key={feed.key} className="button secondary" href={feed.link}>{feed.key.replace(/_/g, " ")} · {feed.state}</a>)}
          </div>
        </section>
      </div>
    </PlatformShell>
  );
}
