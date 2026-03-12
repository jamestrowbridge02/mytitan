import { useEffect, useState } from "react";
import Link from "next/link";
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

const DEFAULT_POLICY = {
  id: "",
  name: "",
  entityType: "JOB",
  triggerStatus: "OPEN",
  targetStatus: "COMPLETED",
  targetMinutes: 240,
  severity: "WARNING",
  active: true,
};

export default function CompliancePage() {
  const [permissions, setPermissions] = useState(() => emptyPermissionSnapshot());
  const [policies, setPolicies] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({ totals: {}, pressure: [] });
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeLocationId, setActiveLocationId] = useState("all");
  const [filters, setFilters] = useState({ entityType: "", severity: "", status: "" });
  const [policyForm, setPolicyForm] = useState<any>(DEFAULT_POLICY);
  const { notice, showError, showSuccess, clearNotice } = useOperatorNotice();

  const canView = hasWorkspacePermission(permissions, "dashboard.view_intelligence");
  const canManage = hasWorkspacePermission(permissions, "settings.manage");

  async function load() {
    setLoading(true);
    try {
      const me = await apiFetch("/me");
      setPermissions(normalizePermissionSnapshot(me?.permissions));
      const locationId = activeLocationId || "all";
      const query = new URLSearchParams();
      if (filters.entityType) query.set("entityType", filters.entityType);
      if (filters.severity) query.set("severity", filters.severity);
      if (filters.status) query.set("status", filters.status);
      if (locationId && locationId !== "all") query.set("locationId", locationId);
      const suffix = query.toString();
      const [policyRows, eventRows, exceptionRows, summaryPayload, locationRows] = await Promise.all([
        apiFetch("/compliance/sla-policies"),
        apiFetch(`/compliance/sla-events${suffix ? `?${suffix}` : ""}`),
        apiFetch(`/compliance/exceptions${suffix ? `?${suffix}` : ""}`),
        apiFetch(`/compliance/summary${locationId && locationId !== "all" ? `?locationId=${encodeURIComponent(locationId)}` : ""}`),
        apiFetch("/locations").catch(() => []),
      ]);
      setPolicies(Array.isArray(policyRows) ? policyRows : []);
      setEvents(Array.isArray(eventRows) ? eventRows : []);
      setExceptions(Array.isArray(exceptionRows) ? exceptionRows : []);
      setSummary(summaryPayload || { totals: {}, pressure: [] });
      setLocations(Array.isArray(locationRows) ? locationRows : []);
    } catch (error: any) {
      showError(error?.message || "Failed to load compliance workspace");
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
  }, [activeLocationId, filters.entityType, filters.severity, filters.status]);

  async function savePolicy() {
    setSaving(true);
    clearNotice();
    try {
      const payload = {
        name: String(policyForm.name || "").trim(),
        entityType: policyForm.entityType,
        triggerStatus: String(policyForm.triggerStatus || "").trim().toUpperCase(),
        targetStatus: String(policyForm.targetStatus || "").trim().toUpperCase(),
        targetMinutes: Number(policyForm.targetMinutes || 0),
        severity: policyForm.severity,
        active: Boolean(policyForm.active),
      };
      await apiFetch(policyForm.id ? `/compliance/sla-policies/${policyForm.id}` : "/compliance/sla-policies", {
        method: policyForm.id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setPolicyForm(DEFAULT_POLICY);
      showSuccess(policyForm.id ? "SLA policy updated" : "SLA policy created");
      await load();
    } catch (error: any) {
      showError(error?.message || "Failed to save SLA policy");
    } finally {
      setSaving(false);
    }
  }

  async function updateException(id: string, action: "resolve" | "dismiss") {
    try {
      await apiFetch(`/compliance/exceptions/${id}/${action}`, { method: "POST", body: JSON.stringify({}) });
      showSuccess(action === "resolve" ? "Compliance exception resolved" : "Compliance exception dismissed");
      await load();
    } catch (error: any) {
      showError(error?.message || "Failed to update compliance exception");
    }
  }

  if (!canView && !loading) {
    return (
      <DashboardShell>
        <OperatorPageHeader eyebrow="Governance" title="Compliance" subtitle="Workflow SLA and exception controls are restricted to operators with intelligence access." />
        <OperatorEmptyStateCard title="Compliance access restricted" description="You do not currently have permission to view SLA and compliance controls." />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="Governance"
          title="Compliance"
          subtitle="Track workflow SLAs, audit exceptions, and resolve operational control debt without inventing a fake enterprise compliance program."
          stats={[
            { label: "Active policies", value: String(summary?.totals?.activePolicies || 0), hint: "Enabled SLA rules" },
            { label: "Open events", value: String(summary?.totals?.openEvents || 0), hint: "SLA timers still running" },
            { label: "Breached", value: String(summary?.totals?.breachedEvents || 0), hint: "Configured SLAs past due time" },
            { label: "Open exceptions", value: String(summary?.totals?.openExceptions || 0), hint: "Workflow or evidence issues unresolved" },
          ]}
          actions={[
            { label: "Intelligence", href: "/dashboard/intelligence", variant: "secondary" },
            { label: "Analytics", href: "/dashboard/analytics", variant: "secondary" },
            { label: "Command Centre", href: "/dashboard/command-centre-v2" },
          ]}
        />

        <OperatorNotice notice={notice} onDismiss={clearNotice} />

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Filters</h2>
              <p className="operator-section__subtitle">Apply the current location scope and narrow the active queue by entity, severity, or state.</p>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
            <select data-testid="compliance-filter-entity" className="input" value={filters.entityType} onChange={(event) => setFilters((prev) => ({ ...prev, entityType: event.target.value }))}>
              <option value="">All entity types</option>
              <option value="JOB">Jobs</option>
              <option value="BOOKING">Bookings</option>
              <option value="QUOTE">Quotes</option>
              <option value="APPROVAL">Approvals</option>
              <option value="SERVICE_PLAN">Service plans</option>
            </select>
            <select data-testid="compliance-filter-severity" className="input" value={filters.severity} onChange={(event) => setFilters((prev) => ({ ...prev, severity: event.target.value }))}>
              <option value="">All severities</option>
              <option value="WARNING">Warning</option>
              <option value="CRITICAL">Critical</option>
            </select>
            <select data-testid="compliance-filter-status" className="input" value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}>
              <option value="">All statuses</option>
              <option value="OPEN">Open</option>
              <option value="BREACHED">Breached</option>
              <option value="MET">Met</option>
              <option value="RESOLVED">Resolved</option>
              <option value="DISMISSED">Dismissed</option>
            </select>
            <div className="integration-card">
              <strong>Scoped location</strong>
              <p className="muted" style={{ margin: "6px 0 0 0" }}>
                {activeLocationId === "all" ? "All locations" : locations.find((row) => row.id === activeLocationId)?.name || "Scoped"}
              </p>
            </div>
          </div>
        </section>

        {canManage ? (
          <section className="card operator-section">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">{policyForm.id ? "Edit SLA policy" : "Create SLA policy"}</h2>
                <p className="operator-section__subtitle">Start a timer from a workflow state and resolve it when the target state is reached.</p>
              </div>
            </div>
            <div data-testid="compliance-policy-save" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
              <input className="input" placeholder="Policy name" value={policyForm.name} onChange={(event) => setPolicyForm((prev: any) => ({ ...prev, name: event.target.value }))} />
              <select className="input" value={policyForm.entityType} onChange={(event) => setPolicyForm((prev: any) => ({ ...prev, entityType: event.target.value }))}>
                <option value="JOB">Job</option>
                <option value="BOOKING">Booking</option>
                <option value="QUOTE">Quote</option>
                <option value="APPROVAL">Approval</option>
                <option value="SERVICE_PLAN">Service plan</option>
              </select>
              <input className="input" placeholder="Trigger status" value={policyForm.triggerStatus} onChange={(event) => setPolicyForm((prev: any) => ({ ...prev, triggerStatus: event.target.value }))} />
              <input className="input" placeholder="Target status" value={policyForm.targetStatus} onChange={(event) => setPolicyForm((prev: any) => ({ ...prev, targetStatus: event.target.value }))} />
              <input className="input" type="number" min={1} value={policyForm.targetMinutes} onChange={(event) => setPolicyForm((prev: any) => ({ ...prev, targetMinutes: Number(event.target.value || 0) }))} />
              <select className="input" value={policyForm.severity} onChange={(event) => setPolicyForm((prev: any) => ({ ...prev, severity: event.target.value }))}>
                <option value="INFO">Info</option>
                <option value="WARNING">Warning</option>
                <option value="CRITICAL">Critical</option>
              </select>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={policyForm.active} onChange={(event) => setPolicyForm((prev: any) => ({ ...prev, active: Boolean(event.target.checked) }))} />
                Active
              </label>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="button" type="button" onClick={savePolicy} disabled={saving || !String(policyForm.name || "").trim()}>{saving ? "Saving..." : "Save policy"}</button>
              {policyForm.id ? <button className="button secondary" type="button" onClick={() => setPolicyForm(DEFAULT_POLICY)}>Cancel edit</button> : null}
            </div>
          </section>
        ) : null}

        <section className="card operator-section" data-testid="compliance-policy-list">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">SLA policies</h2>
              <p className="operator-section__subtitle">Configured workflow timers that can open, meet, breach, or cancel against real entity states.</p>
            </div>
          </div>
          {policies.length ? (
            <OperatorDataTable columns="minmax(220px, 1.2fr) minmax(140px, 0.8fr) minmax(200px, 1fr) minmax(140px, 0.7fr) minmax(140px, auto)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Policy</div>
                <div className="operator-table__cell">Entity</div>
                <div className="operator-table__cell">Transition</div>
                <div className="operator-table__cell">Target</div>
                <div className="operator-table__cell">Action</div>
              </OperatorDataTableHeader>
              {policies.map((policy) => (
                <OperatorDataTableRow key={policy.id}>
                  <div className="operator-table__cell"><strong>{policy.name}</strong><div className="muted">{policy.active ? "Active" : "Paused"} · {policy.severity}</div></div>
                  <div className="operator-table__cell">{policy.entityType}</div>
                  <div className="operator-table__cell">{policy.triggerStatus} to {policy.targetStatus}</div>
                  <div className="operator-table__cell">{policy.targetMinutes} mins</div>
                  <div className="operator-table__cell">
                    {canManage ? <button className="button secondary" type="button" onClick={() => setPolicyForm({ ...policy })}>Edit</button> : <span className="muted">Read only</span>}
                  </div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <OperatorEmptyStateCard title="No SLA policies yet" description="Create one policy to start tracking workflow targets against real entity status transitions." />
          )}
        </section>

        <section className="card operator-section" data-testid="compliance-event-list">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">SLA events</h2>
              <p className="operator-section__subtitle">Open and breached workflow timers. Each row links back to the affected operational entity.</p>
            </div>
          </div>
          {events.length ? (
            <OperatorDataTable columns="minmax(220px, 1.2fr) minmax(120px, 0.7fr) minmax(120px, 0.7fr) minmax(220px, 1fr) minmax(120px, auto)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Event</div>
                <div className="operator-table__cell">Status</div>
                <div className="operator-table__cell">Severity</div>
                <div className="operator-table__cell">Due</div>
                <div className="operator-table__cell">Entity</div>
              </OperatorDataTableHeader>
              {events.map((event) => (
                <OperatorDataTableRow key={event.id}>
                  <div className="operator-table__cell"><strong>{event.policyName}</strong><div className="muted">{event.entityType} · {event.contextJson?.label || event.entityId}</div></div>
                  <div className="operator-table__cell">{event.status}</div>
                  <div className="operator-table__cell">{event.severity}</div>
                  <div className="operator-table__cell">{event.dueAt ? new Date(event.dueAt).toLocaleString() : "-"}</div>
                  <div className="operator-table__cell"><Link href={event.href}>Open</Link></div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <OperatorEmptyStateCard title="No SLA events in scope" description="Events appear when active policies encounter entities in their trigger states." />
          )}
        </section>

        <section className="card operator-section" data-testid="compliance-exception-list">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Compliance exceptions</h2>
              <p className="operator-section__subtitle">Open workflow, evidence, approval, and SLA issues that still need an operator decision.</p>
            </div>
          </div>
          {exceptions.length ? (
            <OperatorDataTable columns="minmax(260px, 1.4fr) minmax(140px, 0.7fr) minmax(140px, 0.7fr) minmax(200px, 1fr) minmax(180px, auto)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Exception</div>
                <div className="operator-table__cell">Severity</div>
                <div className="operator-table__cell">Status</div>
                <div className="operator-table__cell">Entity</div>
                <div className="operator-table__cell">Action</div>
              </OperatorDataTableHeader>
              {exceptions.map((exception) => (
                <OperatorDataTableRow key={exception.id}>
                  <div className="operator-table__cell"><strong>{exception.summary}</strong><div className="muted">{exception.kind} · {exception.locationName || "Tenant-wide"}</div></div>
                  <div className="operator-table__cell">{exception.severity}</div>
                  <div className="operator-table__cell">{exception.status}</div>
                  <div className="operator-table__cell"><Link href={exception.href}>{exception.entityType} {exception.entityId.slice(0, 8)}</Link></div>
                  <div className="operator-table__cell">
                    {exception.status === "OPEN" && canManage ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="button secondary" data-testid="compliance-exception-resolve" type="button" onClick={() => updateException(exception.id, "resolve")}>Resolve</button>
                        <button className="button secondary" type="button" onClick={() => updateException(exception.id, "dismiss")}>Dismiss</button>
                      </div>
                    ) : (
                      <span className="muted">Closed</span>
                    )}
                  </div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <OperatorEmptyStateCard title="No compliance exceptions in scope" description="Open exceptions will show up here as SLA breaches, missing approvals, or missing evidence are detected." />
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
