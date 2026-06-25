import { useEffect, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import { EmptyState } from "../../components/states/EmptyState";
import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import { apiFetch } from "../../lib/api";

type Phase2Overview = {
  stage: string;
  truthContract: Record<string, boolean>;
  integrations: { providers: Array<{ provider: string; status: string; liveEnabled: boolean; nextAction: string }> };
  offlineFieldService: { status: string; supportedActions: string[]; syncStates: string[]; storesSecretsOrTokens: boolean };
  reportBuilder: { realDataOnly: boolean; metrics: any; exports: string[]; savedTemplates: string[] };
  accountingPreLaunch: {
    status: string;
    liveSubmissionEnabled: boolean;
    invoiceExportPreview: { count: number };
    paymentExportPreview: { count: number };
    customerContactMappingPreview: { count: number };
    duplicateDetection: { status: string };
    queues: { syncConflict: { status: string; count: number }; failedSyncRetry: { status: string; count: number }; manualReview: { status: string; count: number } };
  };
  technicianMobile: { home: string; primaryActions: string[]; hiddenNoise: string[] };
  aiReadiness: { modelCallsEnabled: boolean; autonomousChanges: boolean; recommendations: Array<{ key: string; label: string; evidenceCount: number; action: string }> };
  multiLocation: { model: string[]; currentLocations: Array<{ id: string; name: string }>; crossBranchDashboard: string };
  whiteLabel: { status: string; tenantLogo: boolean; surfaces: string[]; customDomain: { status: string } };
  customerAcquisition: { safety: Record<string, boolean>; tools: Array<{ key: string; status: string; evidenceCount: number }> };
  accreditation: { backupRestoreEvidence: { status: string; lastBackupAt?: string | null; lastRestoreDrillAt?: string | null }; externalMonitoringVisibleToTenant: boolean; platformMonitorSetup: string; trustPack: string[] };
  designSystemV2: { status: string; tokens: string[]; target: string };
};

type Phase4Overview = {
  stage: string;
  lifecycleAutomation: { mode: string; nextAction: string; transitions: Array<{ key: string; count: number }> };
  recordKeeping: { status: string; completedJobCount: number; coverage: Record<string, number> };
  offlineMode: { status: string; assignedJobCount: number; conflictEvents: number; supportedActions: string[] };
  mapsRouting: { status: string; routePreview: any[]; providers: Record<string, any>; customerLocationCoverage: Record<string, number> };
  customerPortal: { status: string; evidence: Record<string, number>; supportedSurfaces: string[] };
  forecasting: { realDataOnly: boolean; noFabricatedPredictions: boolean; sourceData: Record<string, number>; metrics: Record<string, any>; assumptions: string[] };
  customerAcquisition: { status: string; channels: Array<{ key: string; evidenceCount: number }> };
  productTrust: { status: string; items: Array<{ key: string; issue: string; impact: string; fix: string; action: string }> };
  performance: { status: string; budgets: Record<string, any>; optimisations: string[] };
};

function title(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function StatusPill({ value }: { value: string }) {
  const normalized = String(value || "unknown").toLowerCase();
  const tone = normalized.includes("ready") || normalized === "healthy" || normalized === "connected" ? "success" : normalized.includes("gated") || normalized.includes("configured") ? "warning" : "info";
  return <span className={`operator-statusBadge operator-statusBadge--${tone}`}>{title(normalized)}</span>;
}

function Section({ title: heading, children, testId }: { title: string; children: React.ReactNode; testId: string }) {
  return (
    <section className="card operator-section" data-testid={testId}>
      <div className="operator-section__header">
        <h2>{heading}</h2>
      </div>
      {children}
    </section>
  );
}

const workflowLinks: Record<string, string> = {
  lifecycle: "/dashboard/booking/settings",
  records: "/dashboard/jobs",
  offline: "/dashboard/technician",
  maps: "/dashboard/scheduling",
  portal: "/dashboard/portal",
  forecasting: "/dashboard/analytics",
  growth: "/dashboard/settings/automations",
  open_work: "/dashboard/jobs",
  overdue_invoices: "/dashboard/finance",
  low_stock: "/dashboard/inventory",
  provider_setup: "/dashboard/integrations",
};

const enterpriseTrustPack = [
  { key: "audit_exports", title: "Audit exports", detail: "Finance and activity evidence can be exported from governed tenant records.", href: "/dashboard/audit" },
  { key: "access_reviews", title: "Access reviews", detail: "Owners can review users, roles, support mode, and governed workspace access.", href: "/dashboard/users" },
  { key: "backup_evidence", title: "Backup evidence", detail: "Backup and restore evidence is summarized without exposing infrastructure internals.", href: "/dashboard/settings/operations" },
  { key: "dr_readiness", title: "DR readiness", detail: "Operational recovery evidence stays platform-owned and tenant-safe.", href: "/dashboard/settings/operations" },
  { key: "retention_readiness", title: "Retention readiness", detail: "Media and record retention controls are visible without automatic deletion.", href: "/dashboard/settings/operations#media-governance" },
  { key: "compliance_readiness", title: "Compliance readiness", detail: "Compliance exceptions and SLA evidence link to real workspace records.", href: "/dashboard/compliance" },
];

const phase6BusinessContinuityPack = [
  { key: "backup_restore", title: "Backup restore evidence", detail: "Latest backup and restore proof remains evidence-led and tenant-safe.", href: "/dashboard/settings/operations" },
  { key: "audit_export", title: "Audit export package", detail: "Exportable activity evidence links to the tenant audit log.", href: "/dashboard/audit" },
  { key: "access_review", title: "Access review report", detail: "Role reviews and support-mode evidence stay governed in Team and Audit.", href: "/dashboard/users" },
  { key: "retention", title: "Data retention controls", detail: "Retention readiness is visible without automatic deletion.", href: "/dashboard/settings/operations#media-governance" },
  { key: "dr", title: "Disaster recovery readiness", detail: "Recovery readiness is summarized without exposing hosts or private infrastructure.", href: "/dashboard/settings/operations" },
  { key: "incident_response", title: "Incident response checklist", detail: "Operational response steps link to owner-controlled settings and audit evidence.", href: "/dashboard/settings/operations" },
  { key: "security_register", title: "Security control register", detail: "Security controls are phrased as business evidence, not platform internals.", href: "/dashboard/enterprise" },
  { key: "accreditation_folder", title: "Accreditation evidence folder", detail: "Compliance evidence links to real workspace records and exception queues.", href: "/dashboard/compliance" },
];

const enterpriseReadinessRoadmap = [
  {
    key: "sso",
    title: "SSO",
    status: "Roadmap",
    detail: "Enterprise identity should be provider-led with tenant-owned configuration, tested rollback, and no password-policy shortcuts.",
    href: "/dashboard/users",
  },
  {
    key: "scim",
    title: "SCIM provisioning",
    status: "Roadmap",
    detail: "Automated user lifecycle management needs dedicated ownership, audit evidence, and deprovisioning tests before launch.",
    href: "/dashboard/users",
  },
  {
    key: "audit_exports",
    title: "Audit exports",
    status: "Available evidence",
    detail: "Tenant audit evidence is already reviewable and export paths remain governed by role and workspace boundary.",
    href: "/dashboard/audit",
  },
  {
    key: "retention",
    title: "Retention controls",
    status: "Available evidence",
    detail: "Media governance and retention readiness are visible without automatic deletion or unsafe cleanup.",
    href: "/dashboard/settings/operations#media-governance",
  },
  {
    key: "api",
    title: "API and scoped tokens",
    status: "Available evidence",
    detail: "Developer Tools owns scoped API token and webhook setup, with reveal-once and secret-safe handling.",
    href: "/dashboard/settings/developer-tools",
  },
  {
    key: "rate_limits",
    title: "Rate limits",
    status: "Available evidence",
    detail: "Public booking and sensitive entry points fail closed with friendly throttling and no request identity leakage.",
    href: "/dashboard/settings/operations",
  },
  {
    key: "webhook_replay",
    title: "Webhook replay",
    status: "Available evidence",
    detail: "Webhook delivery, failure queues, signing readiness, and retry paths stay visible from Developer Tools.",
    href: "/dashboard/settings/developer-tools",
  },
  {
    key: "marketplace",
    title: "Marketplace and partners",
    status: "Roadmap",
    detail: "Partner listings should launch only when provider readiness, scopes, review, and tenant-safe support routes are complete.",
    href: "/dashboard/integrations",
  },
];

function WorkflowCard({ title: heading, value, detail, href, testId }: { title: string; value: string; detail: string; href: string; testId: string }) {
  return (
    <a className="operator-mini-card mt-linkCard" href={href} data-testid={testId}>
      <div className="operator-row">
        <strong>{heading}</strong>
        <span className="operator-tag">Open</span>
      </div>
      <p style={{ margin: "8px 0 0" }}><strong>{value}</strong></p>
      <p className="muted">{detail}</p>
      <span className="mt-linkCard__action">Open workflow</span>
    </a>
  );
}

export default function EnterprisePhase2Page() {
  const [data, setData] = useState<Phase2Overview | null>(null);
  const [phase4, setPhase4] = useState<Phase4Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [phase2Response, phase4Response] = await Promise.all([
          apiFetch("/enterprise/phase-2/overview"),
          apiFetch("/enterprise/phase-4/overview"),
        ]);
        if (!cancelled) {
          setData(phase2Response);
          setPhase4(phase4Response);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Enterprise readiness could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DashboardShell>
      <main className="operator-page" data-testid="phase2-enterprise-page">
        <div className="operator-page__header">
          <div>
            <p className="operator-eyebrow">Enterprise OS</p>
            <h1>Category leader readiness</h1>
            <p className="muted">A truthful Phase 2 control room for integrations, offline work, reports, growth, trust, and scale.</p>
          </div>
          {data ? <StatusPill value={data.stage} /> : null}
        </div>

        {loading ? <LoadingState title="Loading enterprise readiness" /> : null}
        {error ? <ErrorState title="Enterprise readiness unavailable" description={error} /> : null}
        {!loading && !error && !data ? <EmptyState title="No Phase 2 readiness yet" description="Run the seeded workspace setup and try again." /> : null}

        {data ? (
          <>
            {phase4 ? (
              <Section title="Phase 4 workflow execution" testId="phase4-overview-ui">
                <div className="operator-grid operator-grid--four">
                  <WorkflowCard title="Lifecycle automation" value={title(phase4.lifecycleAutomation.mode)} detail={phase4.lifecycleAutomation.nextAction} href={workflowLinks.lifecycle} testId="phase4-card-lifecycle" />
                  <WorkflowCard title="Completed-job records" value={`${phase4.recordKeeping.completedJobCount} records`} detail={`${phase4.recordKeeping.coverage.documentArtifacts || 0} documents and ${phase4.recordKeeping.coverage.evidenceItems || 0} evidence items`} href={workflowLinks.records} testId="phase4-card-records" />
                  <WorkflowCard title="Offline technician workflow" value={`${phase4.offlineMode.assignedJobCount} assigned jobs`} detail={`${phase4.offlineMode.conflictEvents} conflicts require review. No full-app cache or secrets.`} href={workflowLinks.offline} testId="phase4-card-offline" />
                  <WorkflowCard title="Maps readiness" value={title(phase4.mapsRouting.status)} detail={`${phase4.mapsRouting.routePreview.length} route previews. Travel estimates stay provider-gated.`} href={workflowLinks.maps} testId="phase4-card-maps" />
                  <WorkflowCard title="Customer portal" value={title(phase4.customerPortal.status)} detail={`${phase4.customerPortal.evidence.portalVisibleDocuments || 0} documents and ${phase4.customerPortal.evidence.paymentRequests || 0} payment requests visible by policy.`} href={workflowLinks.portal} testId="phase4-card-portal" />
                  <WorkflowCard title="Forecast setup" value={phase4.forecasting.realDataOnly ? "Real data only" : "Review required"} detail={`${phase4.forecasting.sourceData.jobs || 0} jobs, ${phase4.forecasting.sourceData.bookings || 0} bookings. ${phase4.forecasting.assumptions[0]}`} href={workflowLinks.forecasting} testId="phase4-card-forecasting" />
                  <WorkflowCard title="Growth automation" value={title(phase4.customerAcquisition.status)} detail={`${phase4.customerAcquisition.channels.length} channels respect opt-out, rate limits, and audit logs.`} href={workflowLinks.growth} testId="phase4-card-growth" />
                  <WorkflowCard title="Trust actions" value={title(phase4.productTrust.status)} detail={`${phase4.productTrust.items.length} action item groups explain issue, impact, fix, and action.`} href={workflowLinks.open_work} testId="phase4-card-trust" />
                </div>
                <div className="operator-grid operator-grid--three" style={{ marginTop: 14 }} data-testid="phase4-trust-action-items">
                  {phase4.productTrust.items.map((item) => (
                    <a key={item.key} className="operator-mini-card mt-linkCard" href={workflowLinks[item.key] || "/dashboard"} data-testid={`phase4-action-${item.key}`}>
                      <strong>{item.action}</strong>
                      <p className="muted">{item.issue} {item.impact} {item.fix}</p>
                      <span className="mt-linkCard__action">Fix now</span>
                    </a>
                  ))}
                </div>
              </Section>
            ) : null}

            <section className="operator-grid operator-grid--four" data-testid="phase2-truth-contract">
              {Object.entries(data.truthContract).map(([key, value]) => (
                <article className="operator-metric-card" key={key}>
                  <span>{title(key)}</span>
                  <strong>{value ? "Protected" : "Blocked"}</strong>
                </article>
              ))}
            </section>

            <Section title="Real integrations" testId="phase2-integrations">
              <div className="operator-grid operator-grid--three">
                {data.integrations.providers.map((provider) => (
                  <article className="operator-mini-card" key={provider.provider}>
                    <div className="operator-row">
                      <strong>{title(provider.provider)}</strong>
                      <StatusPill value={provider.liveEnabled ? "ready" : provider.status} />
                    </div>
                    <p className="muted">{provider.nextAction}</p>
                  </article>
                ))}
              </div>
            </Section>

            <Section title="Offline field service" testId="phase2-offline-field">
              <div className="operator-grid operator-grid--three">
                <article className="operator-mini-card"><strong>Status</strong><p><StatusPill value={data.offlineFieldService.status} /></p></article>
                <article className="operator-mini-card"><strong>No token storage</strong><p>{data.offlineFieldService.storesSecretsOrTokens ? "Needs review" : "Protected"}</p></article>
                <article className="operator-mini-card"><strong>Sync states</strong><p>{data.offlineFieldService.syncStates.join(", ")}</p></article>
              </div>
              <p className="muted">{data.offlineFieldService.supportedActions.map(title).join(" · ")}</p>
            </Section>

            <Section title="Enterprise report builder" testId="phase2-report-builder">
              <div className="operator-grid operator-grid--four">
                <article className="operator-metric-card"><span>Unpaid invoices</span><strong>{data.reportBuilder.metrics.unpaidInvoices.count}</strong></article>
                <article className="operator-metric-card"><span>Low stock</span><strong>{data.reportBuilder.metrics.lowStock.count}</strong></article>
                <article className="operator-metric-card"><span>Completion velocity</span><strong>{data.reportBuilder.metrics.completionVelocity.rate}%</strong></article>
                <article className="operator-metric-card"><span>Real data only</span><strong>{data.reportBuilder.realDataOnly ? "Yes" : "No"}</strong></article>
              </div>
            </Section>

            <Section title="Accounting pre-launch" testId="phase2-accounting-prelaunch">
              <div className="operator-grid operator-grid--four">
                <article className="operator-metric-card"><span>Invoice preview</span><strong>{data.accountingPreLaunch.invoiceExportPreview.count}</strong></article>
                <article className="operator-metric-card"><span>Payment preview</span><strong>{data.accountingPreLaunch.paymentExportPreview.count}</strong></article>
                <article className="operator-metric-card"><span>Contact mappings</span><strong>{data.accountingPreLaunch.customerContactMappingPreview.count}</strong></article>
                <article className="operator-metric-card"><span>Live sync</span><strong>{data.accountingPreLaunch.liveSubmissionEnabled ? "Enabled" : "Blocked"}</strong></article>
              </div>
              <p className="muted">Duplicate detection: {title(data.accountingPreLaunch.duplicateDetection.status)} · Failed sync retry: {title(data.accountingPreLaunch.queues.failedSyncRetry.status)} · Manual review: {title(data.accountingPreLaunch.queues.manualReview.status)}</p>
            </Section>

            <Section title="Technician mobile" testId="phase2-technician-mobile">
              <p><strong>{data.technicianMobile.home}</strong></p>
              <p className="muted">{data.technicianMobile.primaryActions.join(" · ")}</p>
            </Section>

            <Section title="Operational AI readiness" testId="phase2-ai-readiness">
              <p className="muted">Model calls: {data.aiReadiness.modelCallsEnabled ? "enabled" : "off"} · Autonomous changes: {data.aiReadiness.autonomousChanges ? "enabled" : "off"}</p>
              <div className="operator-grid operator-grid--three">
                {data.aiReadiness.recommendations.map((item) => (
                  <article className="operator-mini-card" key={item.key}>
                    <strong>{item.label}</strong>
                    <p>{item.evidenceCount} evidence record{item.evidenceCount === 1 ? "" : "s"}</p>
                    <p className="muted">{item.action}</p>
                  </article>
                ))}
              </div>
            </Section>

            <Section title="Multi-location enterprise" testId="phase2-multi-location">
              <p className="muted">{data.multiLocation.model.map(title).join(" · ")}</p>
              <p>{data.multiLocation.currentLocations.length} configured location{data.multiLocation.currentLocations.length === 1 ? "" : "s"} · {title(data.multiLocation.crossBranchDashboard)}</p>
            </Section>

            <Section title="White label" testId="phase2-white-label">
              <p><StatusPill value={data.whiteLabel.status} /> · Logo {data.whiteLabel.tenantLogo ? "configured" : "not configured"} · Custom domain {title(data.whiteLabel.customDomain.status)}</p>
              <p className="muted">{data.whiteLabel.surfaces.map(title).join(" · ")}</p>
            </Section>

            <Section title="Customer acquisition" testId="phase2-customer-acquisition">
              <div className="operator-grid operator-grid--three">
                {data.customerAcquisition.tools.map((tool) => (
                  <article className="operator-mini-card" key={tool.key}>
                    <strong>{title(tool.key)}</strong>
                    <p><StatusPill value={tool.status} /></p>
                    <p className="muted">{tool.evidenceCount} source record{tool.evidenceCount === 1 ? "" : "s"}</p>
                  </article>
                ))}
              </div>
            </Section>

            <Section title="Accreditation readiness" testId="phase2-accreditation">
              <div className="operator-grid operator-grid--three">
                <article className="operator-mini-card"><strong>Backup restore</strong><p><StatusPill value={data.accreditation.backupRestoreEvidence.status} /></p></article>
                <article className="operator-mini-card"><strong>Platform assurance setup</strong><p>Handled in platform admin</p></article>
                <article className="operator-mini-card"><strong>Evidence pack</strong><p>{data.accreditation.trustPack.length} controls</p></article>
              </div>
              <p className="muted">Tenant trust summary excludes platform diagnostics and infrastructure setup warnings.</p>
            </Section>

            <Section title="Enterprise trust pack" testId="phase5-enterprise-trust-pack">
              <div className="operator-grid operator-grid--three">
                {enterpriseTrustPack.map((item) => (
                  <a key={item.key} className="operator-mini-card mt-linkCard" href={item.href} data-testid={`phase5-trust-${item.key}`}>
                    <strong>{item.title}</strong>
                    <p className="muted">{item.detail}</p>
                    <span className="mt-linkCard__action">Open evidence</span>
                  </a>
                ))}
              </div>
              <p className="muted" style={{ marginBottom: 0 }}>Platform infrastructure setup stays out of the tenant blocker list.</p>
            </Section>

            <Section title="Business continuity and trust pack" testId="phase6-business-continuity-trust-pack">
              <div className="operator-grid operator-grid--four">
                {phase6BusinessContinuityPack.map((item) => (
                  <a key={item.key} className="operator-mini-card mt-linkCard" href={item.href} data-testid={`phase6-trust-${item.key}`}>
                    <strong>{item.title}</strong>
                    <p className="muted">{item.detail}</p>
                    <span className="mt-linkCard__action">Open evidence</span>
                  </a>
                ))}
              </div>
              <p className="muted" style={{ marginBottom: 0 }}>
                Tenant trust summaries stay business-safe. Platform observability and support diagnostics remain on the separate platform surface.
              </p>
            </Section>

            <Section title="Enterprise readiness roadmap" testId="phase16-enterprise-readiness-roadmap">
              <div className="operator-grid operator-grid--four">
                {enterpriseReadinessRoadmap.map((item) => (
                  <a key={item.key} className="operator-mini-card mt-linkCard phase16-roadmap-card" href={item.href} data-testid={`phase16-roadmap-${item.key}`}>
                    <div className="operator-row">
                      <strong>{item.title}</strong>
                      <span className="operator-tag">{item.status}</span>
                    </div>
                    <p className="muted">{item.detail}</p>
                    <span className="mt-linkCard__action">{item.status === "Roadmap" ? "Review dependency" : "Open evidence"}</span>
                  </a>
                ))}
              </div>
              <p className="muted" style={{ marginBottom: 0 }}>
                Roadmap items are intentionally not presented as live. Enterprise readiness stays evidence-led until configuration, provider checks, and tenant-safe support paths exist.
              </p>
            </Section>

            <Section title="Design system V2" testId="phase2-design-system">
              <p><StatusPill value={data.designSystemV2.status} /> · {data.designSystemV2.target}</p>
              <p className="muted">{data.designSystemV2.tokens.map(title).join(" · ")}</p>
            </Section>
          </>
        ) : null}
      </main>
    </DashboardShell>
  );
}
