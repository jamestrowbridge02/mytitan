import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import { OperatorNotice } from "../../components/feedback/OperatorNotice";
import { useOperatorNotice } from "../../components/feedback/useOperatorNotice";
import {
  OperatorDataTable,
  OperatorDataTableHeader,
  OperatorDataTableRow,
  OperatorEmptyStateCard,
  OperatorPageHeader,
} from "../../components/ui/operator-page";
import { apiFetch } from "../../lib/api";
import { readActiveLocationId, subscribeActiveLocationId } from "../../lib/location-context";
import { emptyPermissionSnapshot, hasWorkspacePermission, normalizePermissionSnapshot } from "../../lib/workspace-permissions";

const DEFAULT_RULE = {
  id: "",
  name: "",
  roleType: "TECHNICIAN",
  active: true,
  metricType: "JOBS_COMPLETED",
  calculationType: "THRESHOLD_BONUS",
  minimum: 1,
  amountCents: 5000,
  percentBps: 0,
  basisCents: 0,
};

export default function CompensationPage() {
  const [permissions, setPermissions] = useState(() => emptyPermissionSnapshot());
  const [periods, setPeriods] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [activeLocationId, setActiveLocationId] = useState("all");
  const [ruleForm, setRuleForm] = useState<any>(DEFAULT_RULE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const { notice, showError, showSuccess, clearNotice } = useOperatorNotice();

  const canManage = hasWorkspacePermission(permissions, "billing.manage");

  async function load(nextPeriodId = selectedPeriodId) {
    setLoading(true);
    try {
      const me = await apiFetch("/me");
      const nextPermissions = normalizePermissionSnapshot(me?.permissions);
      setPermissions(nextPermissions);
      if (!nextPermissions["billing.manage"]) {
        setLoading(false);
        return;
      }
      const [periodRows, ruleRows] = await Promise.all([
        apiFetch("/performance/periods"),
        apiFetch("/compensation/rules"),
      ]);
      const normalizedPeriods = Array.isArray(periodRows) ? periodRows : [];
      const activePeriod = nextPeriodId || normalizedPeriods[0]?.id || "";
      const runRows = activePeriod ? await apiFetch(`/compensation/runs?periodId=${encodeURIComponent(activePeriod)}`) : [];
      setPeriods(normalizedPeriods);
      setSelectedPeriodId(activePeriod);
      setRules(Array.isArray(ruleRows) ? ruleRows : []);
      setRuns(Array.isArray(runRows) ? runRows : []);
    } catch (error: any) {
      showError(error?.message || "Failed to load compensation workspace");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setActiveLocationId(readActiveLocationId());
    return subscribeActiveLocationId(setActiveLocationId);
  }, []);

  useEffect(() => {
    void load();
  }, [activeLocationId]);

  async function saveRule() {
    setSaving(true);
    clearNotice();
    try {
      await apiFetch(ruleForm.id ? `/compensation/rules/${ruleForm.id}` : "/compensation/rules", {
        method: ruleForm.id ? "PATCH" : "POST",
        body: JSON.stringify({
          name: String(ruleForm.name || "").trim(),
          roleType: ruleForm.roleType,
          active: Boolean(ruleForm.active),
          metricType: ruleForm.metricType,
          calculationType: ruleForm.calculationType,
          thresholdJson: { minimum: Number(ruleForm.minimum || 0) },
          payoutJson: {
            amountCents: Number(ruleForm.amountCents || 0),
            percentBps: Number(ruleForm.percentBps || 0),
            basisCents: Number(ruleForm.basisCents || 0),
            stepAmountCents: Number(ruleForm.amountCents || 0),
          },
        }),
      });
      showSuccess(ruleForm.id ? "Compensation rule updated" : "Compensation rule created");
      setRuleForm(DEFAULT_RULE);
      await load();
    } catch (error: any) {
      showError(error?.message || "Failed to save compensation rule");
    } finally {
      setSaving(false);
    }
  }

  async function previewRuns() {
    if (!selectedPeriodId) return;
    setPreviewing(true);
    try {
      await apiFetch("/compensation/runs/preview", {
        method: "POST",
        body: JSON.stringify({
          periodId: selectedPeriodId,
          locationId: activeLocationId !== "all" ? activeLocationId : undefined,
        }),
      });
      showSuccess("Compensation preview refreshed");
      await load(selectedPeriodId);
    } catch (error: any) {
      showError(error?.message || "Failed to preview compensation runs");
    } finally {
      setPreviewing(false);
    }
  }

  async function mutateRun(id: string, action: "approve" | "cancel") {
    try {
      await apiFetch(`/compensation/runs/${id}/${action}`, { method: "POST" });
      showSuccess(action === "approve" ? "Compensation run approved" : "Compensation run cancelled");
      await load(selectedPeriodId);
    } catch (error: any) {
      showError(error?.message || "Failed to update compensation run");
    }
  }

  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === selectedPeriodId) || periods[0] || null,
    [periods, selectedPeriodId],
  );

  if (!canManage && !loading) {
    return (
      <DashboardShell>
        <OperatorPageHeader eyebrow="People Ops" title="Compensation" subtitle="Compensation previews are restricted to finance and management operators." />
        <OperatorEmptyStateCard title="Compensation access restricted" description="You do not currently have permission to view or manage compensation previews." />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="People Ops"
          title="Compensation"
          subtitle="Preview rule-based payouts grounded in scorecards and durable metrics, without pretending to be a payroll engine."
          stats={[
            { label: "Rules", value: String(rules.length), hint: "Active and draft rule set" },
            { label: "Runs", value: String(runs.length), hint: "Current period previews" },
            { label: "Draft", value: String(runs.filter((run) => run.status === "DRAFT").length), hint: "Needs finance decision" },
            { label: "Approved", value: String(runs.filter((run) => run.status === "APPROVED").length), hint: "Ready for off-platform payout" },
          ]}
          actions={[
            { label: "Performance", href: "/dashboard/performance", variant: "secondary" },
            { label: "Revenue", href: "/dashboard/revenue", variant: "secondary" },
            { label: "Analytics", href: "/dashboard/analytics" },
          ]}
        />

        <OperatorNotice notice={notice} onDismiss={clearNotice} />

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Preview scope</h2>
              <p className="operator-section__subtitle">Choose a period and refresh draft runs from the current scorecards.</p>
            </div>
          </div>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
            <select className="input" value={selectedPeriodId} onChange={(event) => { setSelectedPeriodId(event.target.value); void load(event.target.value); }}>
              {periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
            </select>
            <div className="integration-card">
              <strong>Location scope</strong>
              <p className="muted" style={{ margin: "6px 0 0 0" }}>{activeLocationId === "all" ? "All locations" : "Scoped location"}</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="button" type="button" data-testid="compensation-preview" onClick={previewRuns} disabled={previewing || !selectedPeriodId}>
              {previewing ? "Previewing..." : "Preview runs"}
            </button>
          </div>
        </section>

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">{ruleForm.id ? "Edit rule" : "Create rule"}</h2>
              <p className="operator-section__subtitle">Rules translate one explicit metric into a draft payout preview.</p>
            </div>
          </div>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
            <input className="input" placeholder="Rule name" value={ruleForm.name} onChange={(event) => setRuleForm((prev: any) => ({ ...prev, name: event.target.value }))} />
            <select className="input" value={ruleForm.roleType} onChange={(event) => setRuleForm((prev: any) => ({ ...prev, roleType: event.target.value }))}>
              <option value="TECHNICIAN">Technician</option>
              <option value="DISPATCHER">Dispatcher</option>
              <option value="FINANCE">Finance</option>
              <option value="MANAGER">Manager</option>
            </select>
            <select className="input" value={ruleForm.metricType} onChange={(event) => setRuleForm((prev: any) => ({ ...prev, metricType: event.target.value }))}>
              <option value="JOBS_COMPLETED">Jobs completed</option>
              <option value="SLA_MET_RATE">SLA met rate</option>
              <option value="QUOTE_CONVERSION_RATE">Quote conversion rate</option>
              <option value="COLLECTIONS_COMPLETED">Collections completed</option>
              <option value="UTILIZATION_RATE">Utilization rate</option>
              <option value="ACKNOWLEDGEMENT_RATE">Acknowledgement rate</option>
              <option value="EXECUTION_SUBMITTED_RATE">Execution submitted rate</option>
            </select>
            <select className="input" value={ruleForm.calculationType} onChange={(event) => setRuleForm((prev: any) => ({ ...prev, calculationType: event.target.value }))}>
              <option value="THRESHOLD_BONUS">Threshold bonus</option>
              <option value="FLAT_BONUS">Flat bonus</option>
              <option value="PERCENTAGE_BONUS">Percentage bonus</option>
            </select>
            <input className="input" type="number" placeholder="Minimum metric" value={ruleForm.minimum} onChange={(event) => setRuleForm((prev: any) => ({ ...prev, minimum: Number(event.target.value || 0) }))} />
            <input className="input" type="number" placeholder="Amount (cents)" value={ruleForm.amountCents} onChange={(event) => setRuleForm((prev: any) => ({ ...prev, amountCents: Number(event.target.value || 0) }))} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="button" type="button" onClick={saveRule} disabled={saving || !ruleForm.name}>
              {saving ? "Saving..." : "Save rule"}
            </button>
            {ruleForm.id ? <button className="button secondary" type="button" onClick={() => setRuleForm(DEFAULT_RULE)}>Cancel edit</button> : null}
          </div>
        </section>

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Rule library</h2>
              <p className="operator-section__subtitle">Existing rules stay explicit about the metric, threshold, and payout basis.</p>
            </div>
          </div>
          <div data-testid="compensation-rule-list">
            {rules.length ? (
              <OperatorDataTable columns="minmax(220px,1fr) minmax(140px,0.7fr) minmax(180px,0.9fr) minmax(140px,0.7fr) minmax(120px,0.6fr)">
                <OperatorDataTableHeader>
                  <div className="operator-table__cell">Rule</div>
                  <div className="operator-table__cell">Role</div>
                  <div className="operator-table__cell">Metric</div>
                  <div className="operator-table__cell">Threshold</div>
                  <div className="operator-table__cell">Action</div>
                </OperatorDataTableHeader>
                {rules.map((rule) => (
                  <OperatorDataTableRow key={rule.id}>
                    <div className="operator-table__cell"><strong>{rule.name}</strong><div className="muted">{rule.active ? "Active" : "Paused"}</div></div>
                    <div className="operator-table__cell">{rule.roleType}</div>
                    <div className="operator-table__cell">{rule.metricType}</div>
                    <div className="operator-table__cell">{rule.thresholdJson?.minimum ?? 0}</div>
                    <div className="operator-table__cell">
                      <button className="button secondary" type="button" onClick={() => setRuleForm({
                        id: rule.id,
                        name: rule.name,
                        roleType: rule.roleType,
                        active: rule.active,
                        metricType: rule.metricType,
                        calculationType: rule.calculationType,
                        minimum: rule.thresholdJson?.minimum ?? 0,
                        amountCents: rule.payoutJson?.amountCents ?? rule.payoutJson?.stepAmountCents ?? 0,
                        percentBps: rule.payoutJson?.percentBps ?? 0,
                        basisCents: rule.payoutJson?.basisCents ?? 0,
                      })}>Edit</button>
                    </div>
                  </OperatorDataTableRow>
                ))}
              </OperatorDataTable>
            ) : (
              <OperatorEmptyStateCard title="No rules yet" description="Create one rule to turn a deterministic metric into a draft payout preview." />
            )}
          </div>
        </section>

        <section className="card operator-section" data-testid="compensation-run-list">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Compensation runs</h2>
              <p className="operator-section__subtitle">{selectedPeriod ? `${selectedPeriod.name} draft and approved payout previews.` : "Current period compensation previews."}</p>
            </div>
          </div>
          {runs.length ? (
            <OperatorDataTable columns="minmax(220px,1fr) minmax(200px,1fr) minmax(120px,0.7fr) minmax(140px,0.7fr) minmax(180px,1fr)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Person</div>
                <div className="operator-table__cell">Rule</div>
                <div className="operator-table__cell">Amount</div>
                <div className="operator-table__cell">Status</div>
                <div className="operator-table__cell">Action</div>
              </OperatorDataTableHeader>
              {runs.map((run) => (
                <OperatorDataTableRow key={run.id}>
                  <div className="operator-table__cell">
                    <strong>{run.user?.email || "Unknown user"}</strong>
                    <div className="muted">score {run.calculationJson?.score ?? "-"}</div>
                  </div>
                  <div className="operator-table__cell">
                    <strong>{run.rule?.name || "Unknown rule"}</strong>
                    <div className="muted">{run.rule?.metricType}</div>
                  </div>
                  <div className="operator-table__cell">£{((run.amountCents || 0) / 100).toFixed(2)}</div>
                  <div className="operator-table__cell">{run.status}</div>
                  <div className="operator-table__cell">
                    {run.status === "DRAFT" ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="button" type="button" data-testid="compensation-approve" onClick={() => mutateRun(run.id, "approve")}>Approve</button>
                        <button className="button secondary" type="button" onClick={() => mutateRun(run.id, "cancel")}>Cancel</button>
                      </div>
                    ) : (
                      <span className="muted">{run.status}</span>
                    )}
                  </div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <OperatorEmptyStateCard title="No compensation runs yet" description="Preview the current period to generate draft compensation runs from existing scorecards." />
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
