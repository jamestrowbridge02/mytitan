import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import { OperatorNotice } from "../../components/feedback/OperatorNotice";
import {
  OperatorDataTable,
  OperatorDataTableHeader,
  OperatorDataTableRow,
  OperatorEmptyStateCard,
  OperatorGuidance,
  OperatorPageHeader,
} from "../../components/ui/operator-page";
import { useOperatorNotice } from "../../components/feedback/useOperatorNotice";
import { apiFetch } from "../../lib/api";
import { emptyPermissionSnapshot, hasWorkspacePermission, normalizePermissionSnapshot } from "../../lib/workspace-permissions";

type CustomerOption = {
  id: string;
  name: string;
  email?: string | null;
};

type ServicePlan = {
  id: string;
  customerId: string;
  customerName?: string | null;
  name: string;
  description?: string | null;
  status: "ACTIVE" | "PAUSED" | "CANCELLED";
  cadenceUnit: "WEEK" | "MONTH" | "QUARTER" | "YEAR";
  cadenceInterval: number;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  autoCreateBooking: boolean;
  autoCreateJob: boolean;
  portalVisible: boolean;
  notesJson?: Record<string, any> | null;
  tasks: Array<{ title: string }>;
  recentRuns?: Array<{ id: string; status: string; scheduledFor?: string | null; bookingId?: string | null; jobId?: string | null }>;
};

type ServicePlanRun = {
  id: string;
  status: string;
  scheduledFor?: string | null;
  executedAt?: string | null;
  bookingId?: string | null;
  jobId?: string | null;
  resultJson?: any;
};

type FormState = {
  id: string | null;
  customerId: string;
  name: string;
  description: string;
  cadenceUnit: "WEEK" | "MONTH" | "QUARTER" | "YEAR";
  cadenceInterval: number;
  nextRunAt: string;
  mode: "booking" | "job";
  portalVisible: boolean;
  status: "ACTIVE" | "PAUSED" | "CANCELLED";
  notes: string;
  taskLines: string;
};

const EMPTY_FORM: FormState = {
  id: null,
  customerId: "",
  name: "",
  description: "",
  cadenceUnit: "MONTH",
  cadenceInterval: 1,
  nextRunAt: "",
  mode: "booking",
  portalVisible: false,
  status: "ACTIVE",
  notes: "",
  taskLines: "",
};

function formatDateTime(value?: string | null) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return date.toLocaleString();
}

function toLocalInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const shifted = new Date(date.getTime() - offset * 60 * 1000);
  return shifted.toISOString().slice(0, 16);
}

export default function ServicePlansPage() {
  const [plans, setPlans] = useState<ServicePlan[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [runs, setRuns] = useState<ServicePlanRun[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState(() => emptyPermissionSnapshot());
  const [permissionsReady, setPermissionsReady] = useState(false);
  const { notice, showError, showSuccess, clearNotice } = useOperatorNotice();

  const canManage = hasWorkspacePermission(permissions, "settings.manage");

  async function loadPlans(keepSelection = true) {
    const response = await apiFetch("/service-plans");
    const nextPlans = Array.isArray(response) ? response : [];
    setPlans(nextPlans);
    if (!keepSelection) {
      setSelectedPlanId(nextPlans[0]?.id || null);
      return;
    }
    if (!selectedPlanId && nextPlans[0]?.id) {
      setSelectedPlanId(nextPlans[0].id);
    }
    if (selectedPlanId && !nextPlans.some((plan: ServicePlan) => plan.id === selectedPlanId)) {
      setSelectedPlanId(nextPlans[0]?.id || null);
    }
  }

  async function loadRuns(planId: string) {
    try {
      const response = await apiFetch(`/service-plans/${planId}/runs`);
      setRuns(Array.isArray(response) ? response : []);
    } catch {
      setRuns([]);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [me, customerRows, planRows] = await Promise.all([
          apiFetch("/me"),
          apiFetch("/customers?limit=200"),
          apiFetch("/service-plans"),
        ]);
        if (cancelled) return;
        setPermissions(normalizePermissionSnapshot(me?.permissions));
        setCustomers(Array.isArray(customerRows) ? customerRows : []);
        const nextPlans = Array.isArray(planRows) ? planRows : [];
        setPlans(nextPlans);
        setSelectedPlanId(nextPlans[0]?.id || null);
      } catch (error: any) {
        if (!cancelled) {
          showError(error?.message || "Failed to load service plans");
        }
      } finally {
        if (!cancelled) {
          setPermissionsReady(true);
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const selected = plans.find((plan) => plan.id === selectedPlanId);
    if (!selected) {
      setForm(EMPTY_FORM);
      setRuns([]);
      return;
    }
    setForm({
      id: selected.id,
      customerId: selected.customerId,
      name: selected.name,
      description: selected.description || "",
      cadenceUnit: selected.cadenceUnit,
      cadenceInterval: selected.cadenceInterval,
      nextRunAt: toLocalInputValue(selected.nextRunAt),
      mode: selected.autoCreateJob ? "job" : "booking",
      portalVisible: selected.portalVisible,
      status: selected.status,
      notes: String(selected.notesJson?.operatorNotes || ""),
      taskLines: (selected.tasks || []).map((task) => task.title).join("\n"),
    });
    void loadRuns(selected.id);
  }, [plans, selectedPlanId]);

  const stats = useMemo(() => {
    const active = plans.filter((plan) => plan.status === "ACTIVE").length;
    const paused = plans.filter((plan) => plan.status === "PAUSED").length;
    const due = plans.filter((plan) => plan.status === "ACTIVE" && plan.nextRunAt && new Date(plan.nextRunAt).getTime() <= Date.now()).length;
    const bookingPlans = plans.filter((plan) => plan.autoCreateBooking).length;
    const jobPlans = plans.filter((plan) => plan.autoCreateJob).length;
    return [
      { label: "Active", value: String(active), hint: "Recurring plans currently live" },
      { label: "Paused", value: String(paused), hint: "Plans not currently generating work" },
      { label: "Due now", value: String(due), hint: "Plans whose next run is already due" },
      { label: "Booking mode", value: String(bookingPlans), hint: "Plans that generate bookings" },
      { label: "Job mode", value: String(jobPlans), hint: "Plans that generate jobs" },
    ];
  }, [plans]);

  async function savePlan() {
    setSaving(true);
    try {
      const payload = {
        customerId: form.customerId,
        name: form.name,
        description: form.description || undefined,
        cadenceUnit: form.cadenceUnit,
        cadenceInterval: Number(form.cadenceInterval),
        nextRunAt: form.nextRunAt ? new Date(form.nextRunAt).toISOString() : undefined,
        autoCreateBooking: form.mode === "booking",
        autoCreateJob: form.mode === "job",
        portalVisible: form.portalVisible,
        status: form.status,
        notesJson: form.notes.trim() ? { operatorNotes: form.notes.trim() } : null,
        tasks: form.taskLines
          .split("\n")
          .map((line, index) => ({ title: line.trim(), sortOrder: index }))
          .filter((task) => task.title),
      };
      if (form.id) {
        await apiFetch(`/service-plans/${form.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        showSuccess("Service plan updated");
      } else {
        await apiFetch("/service-plans", { method: "POST", body: JSON.stringify(payload) });
        showSuccess("Service plan created");
      }
      await loadPlans();
    } catch (error: any) {
      showError(error?.message || "Failed to save service plan");
    } finally {
      setSaving(false);
    }
  }

  async function runPlan(planId: string) {
    setBusyPlanId(planId);
    try {
      await apiFetch(`/service-plans/${planId}/run-now`, { method: "POST" });
      showSuccess("Recurring run executed");
      await loadPlans();
      await loadRuns(planId);
    } catch (error: any) {
      showError(error?.message || "Failed to run service plan");
    } finally {
      setBusyPlanId(null);
    }
  }

  async function changePlanState(planId: string, action: "pause" | "resume") {
    setBusyPlanId(planId);
    try {
      await apiFetch(`/service-plans/${planId}/${action}`, { method: "POST" });
      showSuccess(action === "pause" ? "Service plan paused" : "Service plan resumed");
      await loadPlans();
      await loadRuns(planId);
    } catch (error: any) {
      showError(error?.message || `Failed to ${action} service plan`);
    } finally {
      setBusyPlanId(null);
    }
  }

  function startCreate() {
    setSelectedPlanId(null);
    setForm(EMPTY_FORM);
    setRuns([]);
  }

  if (permissionsReady && !canManage && !plans.length && !loading) {
    return (
      <DashboardShell>
        <div className="operator-stack">
          <OperatorPageHeader
            eyebrow="Business OS"
            title="Service plans"
            subtitle="Recurring work configuration is limited to workspace operators trusted with settings and operational policy."
            stats={[]}
          />
          <OperatorEmptyStateCard
            title="Service plan management restricted"
            description="Your workspace role can review operational work, but recurring service plan changes are limited to owners, admins, and legacy staff operators."
          />
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="Business OS"
          title="Service plans"
          subtitle="Recurring service work that creates bookings or jobs without introducing fake scheduler infrastructure."
          actions={canManage ? [{ label: "Create plan", onClick: startCreate, testId: "service-plan-create" }] : undefined}
          shortcuts={["Recurring work remains tenant-scoped and idempotent", "Run now creates real bookings/jobs using current platform seams"]}
          stats={stats}
        />

        <OperatorGuidance
          title="Recurring work guidance"
          items={[
            "Use booking mode when the next step should still pass through scheduling and conversion.",
            "Use job mode when the recurring work should enter the operational queue immediately.",
            "Portal-visible plans can be surfaced in customer-facing status views, but only as read-safe plan metadata.",
          ]}
        />

        <OperatorNotice notice={notice} onDismiss={clearNotice} />

        <section className="card operator-section" data-testid="service-plan-list">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Plan list</h2>
              <p className="operator-section__subtitle">Active, paused, and cancelled recurring plans linked to current customers.</p>
            </div>
          </div>
          {loading ? (
            <p className="muted">Loading service plans...</p>
          ) : plans.length ? (
            <OperatorDataTable columns="minmax(220px, 1.3fr) minmax(180px, 0.8fr) minmax(200px, 0.9fr) minmax(180px, auto)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Plan</div>
                <div className="operator-table__cell">Cadence</div>
                <div className="operator-table__cell">Next run</div>
                <div className="operator-table__cell">Actions</div>
              </OperatorDataTableHeader>
              {plans.map((plan) => (
                <OperatorDataTableRow
                  key={plan.id}
                  data-testid={`service-plan-row-${plan.id}`}
                  selected={selectedPlanId === plan.id}
                  onClick={() => setSelectedPlanId(plan.id)}
                  style={{ cursor: "pointer" }}
                >
                  <div className="operator-table__cell">
                    <div className="operator-cellTitle">{plan.name}</div>
                    <div className="operator-cellSubtle">{plan.customerName || "Customer"} · {plan.status}</div>
                  </div>
                  <div className="operator-table__cell">
                    Every {plan.cadenceInterval} {plan.cadenceUnit.toLowerCase()}
                    {plan.cadenceInterval > 1 ? "s" : ""}
                    <div className="operator-cellSubtle">{plan.autoCreateJob ? "Creates jobs" : "Creates bookings"}</div>
                  </div>
                  <div className="operator-table__cell">
                    <div className="operator-cellMeta">
                      <span><strong>{formatDateTime(plan.nextRunAt)}</strong></span>
                      <span>{plan.lastRunAt ? `Last run ${formatDateTime(plan.lastRunAt)}` : "No runs yet"}</span>
                    </div>
                  </div>
                  <div className="operator-table__cell">
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {canManage ? (
                        <button
                          className="button secondary"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void runPlan(plan.id);
                          }}
                          data-testid={selectedPlanId === plan.id ? "service-plan-run-now" : undefined}
                          disabled={busyPlanId === plan.id || plan.status !== "ACTIVE"}
                        >
                          {busyPlanId === plan.id ? "Running..." : "Run now"}
                        </button>
                      ) : null}
                      {canManage && plan.status === "ACTIVE" ? (
                        <button
                          className="button secondary"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void changePlanState(plan.id, "pause");
                          }}
                          disabled={busyPlanId === plan.id}
                        >
                          Pause
                        </button>
                      ) : null}
                      {canManage && plan.status === "PAUSED" ? (
                        <button
                          className="button secondary"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void changePlanState(plan.id, "resume");
                          }}
                          disabled={busyPlanId === plan.id}
                        >
                          Resume
                        </button>
                      ) : null}
                    </div>
                  </div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <OperatorEmptyStateCard
              title="No service plans yet"
              description="Create the first recurring service plan to turn repeat customer work into managed operational runs."
            />
          )}
        </section>

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">{form.id ? "Edit plan" : "Create plan"}</h2>
              <p className="operator-section__subtitle">Recurring customer work with cadence, mode, and task definitions.</p>
            </div>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            <select className="input" data-testid="service-plan-customer" value={form.customerId} onChange={(event) => setForm((current) => ({ ...current, customerId: event.target.value }))}>
              <option value="">Select customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
            <input className="input" data-testid="service-plan-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Plan name" />
            <textarea className="textarea" data-testid="service-plan-description" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Description" />
            <div className="two-col">
              <select className="input" data-testid="service-plan-cadence-unit" value={form.cadenceUnit} onChange={(event) => setForm((current) => ({ ...current, cadenceUnit: event.target.value as FormState["cadenceUnit"] }))}>
                <option value="WEEK">Week</option>
                <option value="MONTH">Month</option>
                <option value="QUARTER">Quarter</option>
                <option value="YEAR">Year</option>
              </select>
              <input
                className="input"
                data-testid="service-plan-cadence-interval"
                type="number"
                min={1}
                value={form.cadenceInterval}
                onChange={(event) => setForm((current) => ({ ...current, cadenceInterval: Number(event.target.value || 1) }))}
              />
            </div>
            <input className="input" data-testid="service-plan-next-run" type="datetime-local" value={form.nextRunAt} onChange={(event) => setForm((current) => ({ ...current, nextRunAt: event.target.value }))} />
            <div className="two-col">
              <select className="input" data-testid="service-plan-mode" value={form.mode} onChange={(event) => setForm((current) => ({ ...current, mode: event.target.value as "booking" | "job" }))}>
                <option value="booking">Create booking</option>
                <option value="job">Create job</option>
              </select>
              <select className="input" data-testid="service-plan-status" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as FormState["status"] }))}>
                <option value="ACTIVE">Active</option>
                <option value="PAUSED">Paused</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            <label className="muted" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input data-testid="service-plan-portal-visible" type="checkbox" checked={form.portalVisible} onChange={(event) => setForm((current) => ({ ...current, portalVisible: event.target.checked }))} />
              Portal visible
            </label>
            <textarea className="textarea" data-testid="service-plan-tasks" value={form.taskLines} onChange={(event) => setForm((current) => ({ ...current, taskLines: event.target.value }))} placeholder="One task per line" />
            <textarea className="textarea" data-testid="service-plan-notes" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Operator notes" />
            {canManage ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="button" type="button" onClick={() => void savePlan()} data-testid="service-plan-save" disabled={saving}>
                  {saving ? "Saving..." : "Save plan"}
                </button>
                <button className="button secondary" type="button" onClick={startCreate}>
                  Reset
                </button>
              </div>
            ) : (
              <p className="muted">This form is read-only for your workspace role.</p>
            )}
          </div>
        </section>

        <section className="card operator-section" data-testid="service-plan-history">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Run history</h2>
              <p className="operator-section__subtitle">Executed, skipped, and failed recurring runs for the selected plan.</p>
            </div>
          </div>
          {selectedPlanId && runs.length ? (
            <OperatorDataTable columns="minmax(180px, 1fr) minmax(140px, 0.7fr) minmax(180px, 0.8fr) minmax(220px, 1fr)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Scheduled</div>
                <div className="operator-table__cell">Status</div>
                <div className="operator-table__cell">Executed</div>
                <div className="operator-table__cell">Result</div>
              </OperatorDataTableHeader>
              {runs.map((run) => (
                <OperatorDataTableRow key={run.id}>
                  <div className="operator-table__cell">{formatDateTime(run.scheduledFor)}</div>
                  <div className="operator-table__cell">{run.status}</div>
                  <div className="operator-table__cell">{formatDateTime(run.executedAt)}</div>
                  <div className="operator-table__cell">
                    {run.jobId ? `Job ${run.jobId}` : run.bookingId ? `Booking ${run.bookingId}` : run.resultJson?.error || "No linked result"}
                  </div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <p className="muted">{selectedPlanId ? "No run history yet." : "Select a plan to inspect history."}</p>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
