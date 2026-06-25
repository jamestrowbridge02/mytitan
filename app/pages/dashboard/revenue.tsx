import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import { OperatorNotice } from "../../components/feedback/OperatorNotice";
import { useOperatorNotice } from "../../components/feedback/useOperatorNotice";
import {
  OperatorDataTable,
  OperatorDataTableHeader,
  OperatorDataTableRow,
  OperatorEmptyStateCard,
  OperatorGuidance,
  OperatorPageHeader,
} from "../../components/ui/operator-page";
import { apiFetch } from "../../lib/api";
import { emptyPermissionSnapshot, hasWorkspacePermission, normalizePermissionSnapshot } from "../../lib/workspace-permissions";

type RevenueTask = {
  id: string;
  kind: string;
  status: "OPEN" | "COMPLETED" | "CANCELLED";
  dueAt: string;
  completedAt?: string | null;
  customerName?: string | null;
  jobRef?: string | null;
  quoteNumber?: string | null;
  notesJson?: Record<string, any> | null;
  overdue: boolean;
};

export default function RevenuePage() {
  const [tasks, setTasks] = useState<RevenueTask[]>([]);
  const [permissions, setPermissions] = useState(() => emptyPermissionSnapshot());
  const [permissionsReady, setPermissionsReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const { notice, showError, showSuccess, clearNotice } = useOperatorNotice();

  const canManage = hasWorkspacePermission(permissions, "billing.manage");

  async function loadTasks() {
    try {
      const rows = await apiFetch("/revenue/tasks");
      setTasks(Array.isArray(rows) ? rows : []);
    } catch (err: any) {
      showError(err?.message || "Failed to load revenue tasks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const me = await apiFetch("/me");
        if (cancelled) return;
        const snapshot = normalizePermissionSnapshot(me?.permissions);
        setPermissions(snapshot);
        if (hasWorkspacePermission(snapshot, "billing.manage")) {
          await loadTasks();
        }
      } catch (err: any) {
        if (!cancelled) {
          showError(err?.message || "Failed to load revenue permissions");
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

  async function updateTask(taskId: string, action: "complete" | "cancel") {
    setBusyTaskId(taskId);
    try {
      await apiFetch(`/revenue/tasks/${taskId}/${action}`, { method: "POST" });
      showSuccess(action === "complete" ? "Revenue task completed" : "Revenue task cancelled");
      await loadTasks();
    } catch (err: any) {
      showError(err?.message || `Failed to ${action} revenue task`);
    } finally {
      setBusyTaskId(null);
    }
  }

  const stats = useMemo(() => [
    { label: "Open", value: String(tasks.filter((task) => task.status === "OPEN").length), hint: "Revenue actions still waiting for an operator" },
    { label: "Overdue", value: String(tasks.filter((task) => task.overdue).length), hint: "Tasks already past their due date" },
    { label: "Quotes", value: String(tasks.filter((task) => Boolean(task.quoteNumber)).length), hint: "Quote follow-up and conversion pressure" },
    { label: "Invoices", value: String(tasks.filter((task) => Boolean(task.jobRef)).length), hint: "Invoice and payment follow-up linked to live jobs" },
  ], [tasks]);

  if (permissionsReady && !canManage) {
    return (
      <DashboardShell>
        <div className="operator-stack">
          <OperatorPageHeader
            eyebrow="Revenue ops"
            title="Revenue tasks"
            subtitle="Collections and quote follow-up actions are restricted to workspace roles trusted with billing operations."
            stats={[]}
          />
          <OperatorEmptyStateCard
            title="Revenue task access restricted"
            description="Your role cannot manage collections, quote follow-ups, or payment operations."
          />
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="Revenue ops"
          title="Revenue tasks"
          subtitle="Operator-driven quote, approval, invoice, and payment follow-up built on real platform state."
          actions={[
            { label: "Quotes", href: "/dashboard/quotes", variant: "secondary" },
            { label: "Finance", href: "/dashboard/finance", variant: "secondary" },
            { label: "Billing readiness", href: "/dashboard/billing/readiness" },
          ]}
          shortcuts={["Tasks are derived from live quote and invoice state", "No fake outbound cadence is implied by this queue"]}
          stats={stats}
        />

        <OperatorGuidance
          title="Collections guidance"
          items={[
            "Sent quotes open follow-up work until the customer approves, declines, or the quote expires.",
            "Approved quotes stay visible until an operator converts them into real execution.",
            "Issued and overdue invoices share the same revenue queue without duplicating the billing lifecycle itself.",
          ]}
        />

        <OperatorNotice notice={notice} onDismiss={clearNotice} />

        <section className="card operator-section" data-testid="revenue-task-list">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Revenue queue</h2>
              <p className="operator-section__subtitle">Quote follow-up, approval follow-up, invoice follow-up, and payment follow-up in one operator surface.</p>
            </div>
          </div>
          {loading ? (
            <p className="muted">Loading revenue tasks...</p>
          ) : tasks.length ? (
            <OperatorDataTable columns="minmax(240px, 1.2fr) minmax(180px, 0.9fr) minmax(160px, 0.8fr) minmax(180px, auto)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Task</div>
                <div className="operator-table__cell">Linked record</div>
                <div className="operator-table__cell">Due</div>
                <div className="operator-table__cell">Actions</div>
              </OperatorDataTableHeader>
              {tasks.map((task) => (
                <OperatorDataTableRow key={task.id}>
                  <div className="operator-table__cell">
                    <div className="operator-cellTitle">{String(task.notesJson?.title || task.kind).replaceAll("_", " ")}</div>
                    <div className="operator-cellSubtle">{task.customerName || "Customer"} · {task.status}{task.overdue ? " · OVERDUE" : ""}</div>
                  </div>
                  <div className="operator-table__cell">
                    <div className="operator-cellMeta">
                      {task.quoteNumber ? <span>Quote {task.quoteNumber}</span> : null}
                      {task.jobRef ? <span>Job {task.jobRef}</span> : null}
                      {task.notesJson?.state ? <span>{String(task.notesJson.state).replaceAll("_", " ")}</span> : null}
                    </div>
                  </div>
                  <div className="operator-table__cell">
                    <div className="operator-cellMeta">
                      <span>{new Date(task.dueAt).toLocaleString()}</span>
                      {task.completedAt ? <span>Closed {new Date(task.completedAt).toLocaleString()}</span> : null}
                    </div>
                  </div>
                  <div className="operator-table__cell operator-table__cell--actions">
                    {task.status === "OPEN" ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button className="button secondary" type="button" onClick={() => void updateTask(task.id, "complete")} disabled={busyTaskId === task.id}>
                          {busyTaskId === task.id ? "Saving..." : "Complete"}
                        </button>
                        <button className="button secondary" type="button" onClick={() => void updateTask(task.id, "cancel")} disabled={busyTaskId === task.id}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <span className="muted">Closed</span>
                    )}
                  </div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <OperatorEmptyStateCard
              title="No revenue tasks open"
              description="When sent quotes, approved quotes, or unpaid invoices need follow-through, they will appear here."
            />
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
