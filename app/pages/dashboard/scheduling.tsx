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

type CapacityCell = {
  date: string;
  availableMinutes: number;
  scheduledMinutes: number;
  remainingMinutes: number;
  unavailable: boolean;
  overloaded: boolean;
  source: string;
};

type CapacityRow = {
  technicianId: string;
  technicianName: string;
  role: string;
  days: CapacityCell[];
};

type CapacityData = {
  days: string[];
  technicians: Array<{ id: string; name: string; role: string }>;
  rows: CapacityRow[];
  availability: Array<{ id: string; technicianId: string; date: string; startTime: string; endTime: string; capacityMinutes: number; notesJson?: any }>;
  exceptions: Array<{ id: string; technicianId: string; date: string; type: string; startTime: string; endTime: string; capacityMinutes: number; reason?: string | null }>;
};

type PressureData = {
  date: string;
  technicians: Array<{
    technicianId: string;
    technicianName: string;
    role: string;
    availableMinutes: number;
    scheduledMinutes: number;
    remainingMinutes: number;
    overloaded: boolean;
    unavailable: boolean;
    capacityNotes: string[];
  }>;
  overloadedTechnicians: Array<{ technicianId: string }>;
  unassignedDueWork: Array<{
    entityType: string;
    entityId: string;
    label: string;
    scheduledAt: string;
    minutes: number;
    status?: string | null;
  }>;
  dueRecurringPlanCount: number;
  dueRecurringPlanPressureMinutes: number;
};

type RecommendationData = {
  recommendations: Array<{
    technicianId: string;
    technicianName: string;
    role: string;
    score: number;
    remainingMinutesAfterAssign: number;
    reasons: Array<{ code: string; label: string; detail: string }>;
  }>;
};

const todayInput = () => new Date().toISOString().slice(0, 10);

function plusDays(day: string, days: number) {
  const next = new Date(`${day}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function formatMinutes(value: number) {
  const hours = Math.floor(Math.abs(value) / 60);
  const minutes = Math.abs(value) % 60;
  return `${value < 0 ? "-" : ""}${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function capacityTone(cell: CapacityCell) {
  if (cell.unavailable) return { bg: "#e5e7eb", text: "#1f2937", label: "Unavailable" };
  if (cell.overloaded) return { bg: "#fee2e2", text: "#991b1b", label: "Overloaded" };
  if (cell.remainingMinutes <= 60) return { bg: "#fef3c7", text: "#92400e", label: "Tight" };
  return { bg: "#dcfce7", text: "#14532d", label: "Healthy" };
}

export default function SchedulingPage() {
  const [permissions, setPermissions] = useState(() => emptyPermissionSnapshot());
  const [permissionsReady, setPermissionsReady] = useState(false);
  const [date, setDate] = useState(todayInput);
  const [capacity, setCapacity] = useState<CapacityData | null>(null);
  const [pressure, setPressure] = useState<PressureData | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationData | null>(null);
  const [activeLocationId, setActiveLocationId] = useState("all");
  const [selectedWork, setSelectedWork] = useState<{ entityType: string; entityId: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [availabilityForm, setAvailabilityForm] = useState({
    id: "",
    technicianId: "",
    date: todayInput(),
    startTime: "08:00",
    endTime: "16:00",
    capacityMinutes: 480,
    notes: "",
  });
  const [exceptionForm, setExceptionForm] = useState({
    id: "",
    technicianId: "",
    date: todayInput(),
    type: "REDUCED_CAPACITY",
    startTime: "12:00",
    endTime: "16:00",
    capacityMinutes: 120,
    reason: "",
  });
  const { notice, showError, showSuccess, clearNotice } = useOperatorNotice();

  const canView = hasWorkspacePermission(permissions, "jobs.transition")
    || hasWorkspacePermission(permissions, "dashboard.view_intelligence")
    || hasWorkspacePermission(permissions, "technician.execute");
  const canManage = hasWorkspacePermission(permissions, "settings.manage");

  async function loadAll(activeDate = date, activeSelection = selectedWork) {
    setLoading(true);
    try {
      const me = await apiFetch("/me");
      const locationCtx = await apiFetch("/me/location").catch(() => ({ activeLocationId: "all" }));
      const normalizedPermissions = normalizePermissionSnapshot(me?.permissions);
      setPermissions(normalizedPermissions);
      setActiveLocationId(locationCtx?.activeLocationId || "all");
      const allowed = normalizedPermissions["jobs.transition"]
        || normalizedPermissions["dashboard.view_intelligence"]
        || normalizedPermissions["technician.execute"];
      if (!allowed) {
        setCapacity(null);
        setPressure(null);
        setRecommendations(null);
        return;
      }
      const locationSuffix = `&locationId=${encodeURIComponent(locationCtx?.activeLocationId || "all")}`;
      const [capacityRes, pressureRes] = await Promise.all([
        apiFetch(`/schedule/capacity?from=${activeDate}&to=${plusDays(activeDate, 5)}${locationSuffix}`),
        apiFetch(`/schedule/pressure?date=${activeDate}${locationSuffix}`),
      ]);
      setCapacity(capacityRes || null);
      setPressure(pressureRes || null);
      const firstDueWork = Array.isArray(pressureRes?.unassignedDueWork) ? pressureRes.unassignedDueWork[0] : null;
      const nextSelection = activeSelection || (firstDueWork
        ? {
            entityType: firstDueWork.entityType,
            entityId: firstDueWork.entityId,
          }
        : null);
      setSelectedWork(nextSelection);
      if (nextSelection) {
        const recommendationRes = await apiFetch(`/schedule/recommendations?entityType=${encodeURIComponent(nextSelection.entityType)}&entityId=${encodeURIComponent(nextSelection.entityId)}${locationSuffix}`);
        setRecommendations(recommendationRes || null);
      } else {
        setRecommendations(null);
      }
      if (!availabilityForm.technicianId && Array.isArray(capacityRes?.technicians) && capacityRes.technicians[0]?.id) {
        setAvailabilityForm((current) => ({ ...current, technicianId: capacityRes.technicians[0].id }));
        setExceptionForm((current) => ({ ...current, technicianId: capacityRes.technicians[0].id }));
      }
    } catch (error: any) {
      showError(error?.message || "Failed to load scheduling capacity");
    } finally {
      setPermissionsReady(true);
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, [date]);

  async function loadRecommendations(entityType: string, entityId: string) {
    setSelectedWork({ entityType, entityId });
    try {
      const response = await apiFetch(
        `/schedule/recommendations?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}&locationId=${encodeURIComponent(activeLocationId)}`,
      );
      setRecommendations(response || null);
    } catch (error: any) {
      showError(error?.message || "Failed to load recommendations");
    }
  }

  async function saveAvailability() {
    setSaving(true);
    try {
      const payload = {
        technicianId: availabilityForm.technicianId,
        date: availabilityForm.date,
        startTime: availabilityForm.startTime,
        endTime: availabilityForm.endTime,
        capacityMinutes: Number(availabilityForm.capacityMinutes),
        notesJson: availabilityForm.notes.trim() ? { operatorNotes: availabilityForm.notes.trim() } : null,
      };
      if (availabilityForm.id) {
        await apiFetch(`/schedule/availability/${availabilityForm.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        showSuccess("Availability updated");
      } else {
        await apiFetch("/schedule/availability", { method: "POST", body: JSON.stringify(payload) });
        showSuccess("Availability saved");
      }
      setAvailabilityForm((current) => ({ ...current, id: "", notes: "" }));
      await loadAll();
    } catch (error: any) {
      showError(error?.message || "Failed to save availability");
    } finally {
      setSaving(false);
    }
  }

  async function saveException() {
    setSaving(true);
    try {
      const payload = {
        technicianId: exceptionForm.technicianId,
        date: exceptionForm.date,
        type: exceptionForm.type,
        startTime: exceptionForm.startTime,
        endTime: exceptionForm.endTime,
        capacityMinutes: Number(exceptionForm.capacityMinutes),
        reason: exceptionForm.reason.trim() || null,
      };
      if (exceptionForm.id) {
        await apiFetch(`/schedule/exceptions/${exceptionForm.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        showSuccess("Capacity exception updated");
      } else {
        await apiFetch("/schedule/exceptions", { method: "POST", body: JSON.stringify(payload) });
        showSuccess("Capacity exception saved");
      }
      setExceptionForm((current) => ({ ...current, id: "", reason: "" }));
      await loadAll();
    } catch (error: any) {
      showError(error?.message || "Failed to save capacity exception");
    } finally {
      setSaving(false);
    }
  }

  const stats = useMemo(() => {
    const technicians = pressure?.technicians || [];
    const overloaded = technicians.filter((row) => row.overloaded).length;
    const unavailable = technicians.filter((row) => row.unavailable).length;
    return [
      { label: "Overloaded", value: String(overloaded), hint: "Technicians already beyond day capacity" },
      { label: "Unavailable", value: String(unavailable), hint: "Technicians with no usable capacity today" },
      { label: "Unassigned due work", value: String(pressure?.unassignedDueWork?.length || 0), hint: "Upcoming work still needing ownership" },
      { label: "Recurring pressure", value: String(pressure?.dueRecurringPlanCount || 0), hint: "Due service plans adding dispatch pressure" },
    ];
  }, [pressure]);

  if (permissionsReady && !canView) {
    return (
      <DashboardShell>
        <div className="operator-stack">
          <OperatorPageHeader eyebrow="Dispatch OS" title="Scheduling" subtitle="Capacity planning is limited to roles that can manage dispatch, field work, or operational intelligence." stats={[]} />
          <OperatorEmptyStateCard title="Scheduling access restricted" description="Your workspace role cannot view technician capacity planning." />
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="Dispatch OS"
          title="Scheduling"
          subtitle="Daily technician capacity, overload pressure, and explainable assignment recommendations without fake route optimization."
          stats={stats}
          actions={[
            { label: "Calendar", href: "/dashboard/calendar", variant: "secondary" },
            { label: "Technician queue", href: "/dashboard/technician" },
          ]}
        />

        <OperatorGuidance
          title="Planning guidance"
          items={[
            "Capacity is derived from real daily overrides, weekly schedules, bookings, active jobs, and due recurring work pressure.",
            "Recommendations stay deterministic and explainable. There is no hidden dispatch engine and no travel-time theater.",
            "Availability and exceptions are editable only for workspace operators trusted with settings governance.",
          ]}
        />

        <OperatorNotice notice={notice} onDismiss={clearNotice} />

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Planning day</h2>
              <p className="operator-section__subtitle">Switch the active day to review remaining capacity and assignment pressure.</p>
            </div>
          </div>
          <input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </section>

        <section className="card operator-section" data-testid="scheduling-capacity-grid">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Capacity grid</h2>
              <p className="operator-section__subtitle">Per-technician daily remaining minutes over the next five days.</p>
            </div>
          </div>
          {loading ? (
            <p className="muted">Loading capacity...</p>
          ) : capacity?.rows?.length ? (
            <div style={{ display: "grid", gap: 12 }}>
              {capacity.rows.map((row) => (
                <div key={row.technicianId} className="integration-card">
                  <div style={{ marginBottom: 10 }}>
                    <strong>{row.technicianName}</strong>
                    <div className="muted">{row.role}</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, row.days.length)}, minmax(120px, 1fr))`, gap: 10 }}>
                    {row.days.map((cell) => {
                      const tone = capacityTone(cell);
                      return (
                        <div
                          key={cell.date}
                          style={{ borderRadius: 14, padding: 12, background: tone.bg, color: tone.text, border: `1px solid ${tone.text}22` }}
                        >
                          <div style={{ fontSize: 12, opacity: 0.9 }}>{cell.date.slice(0, 10)}</div>
                          <div style={{ fontWeight: 700, marginTop: 6 }}>{tone.label}</div>
                          <div style={{ marginTop: 4 }}>{formatMinutes(cell.remainingMinutes)} left</div>
                          <div style={{ fontSize: 12, marginTop: 4 }}>Load {formatMinutes(cell.scheduledMinutes)} / Cap {formatMinutes(cell.availableMinutes)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <OperatorEmptyStateCard title="No technicians in capacity planning yet" description="Add technician schedules or daily availability to start tracking capacity." />
          )}
        </section>

        <section className="card operator-section" data-testid="scheduling-pressure-list">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Pressure and due work</h2>
              <p className="operator-section__subtitle">Current overload, unavailable technicians, and work still waiting for assignment.</p>
            </div>
          </div>
          {pressure?.technicians?.length ? (
            <OperatorDataTable columns="minmax(220px, 1fr) minmax(140px, 0.7fr) minmax(180px, 0.8fr) minmax(220px, 1fr)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Technician</div>
                <div className="operator-table__cell">Remaining</div>
                <div className="operator-table__cell">Flags</div>
                <div className="operator-table__cell">Why</div>
              </OperatorDataTableHeader>
              {pressure.technicians.map((row) => (
                <OperatorDataTableRow key={row.technicianId}>
                  <div className="operator-table__cell"><strong>{row.technicianName}</strong></div>
                  <div className="operator-table__cell">{formatMinutes(row.remainingMinutes)}</div>
                  <div className="operator-table__cell">{row.unavailable ? "Unavailable" : row.overloaded ? "Overloaded" : "Available"}</div>
                  <div className="operator-table__cell">{row.capacityNotes.join(" • ")}</div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <p className="muted">No technician pressure for the selected day.</p>
          )}

          <div style={{ marginTop: 20 }}>
            <h3 style={{ marginBottom: 10 }}>Unassigned due work</h3>
            {pressure?.unassignedDueWork?.length ? (
              <div style={{ display: "grid", gap: 10 }}>
                {pressure.unassignedDueWork.map((item) => (
                  <button
                    key={`${item.entityType}-${item.entityId}`}
                    type="button"
                    className="integration-card"
                    style={{ textAlign: "left", cursor: "pointer" }}
                    onClick={() => void loadRecommendations(item.entityType, item.entityId)}
                  >
                    <strong>{item.label}</strong>
                    <div className="muted">{item.entityType} · {new Date(item.scheduledAt).toLocaleString()} · {formatMinutes(item.minutes)}</div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">No unassigned due work for the selected day.</p>
            )}
          </div>
        </section>

        <section className="card operator-section" data-testid="scheduling-recommendation-list">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Technician recommendations</h2>
              <p className="operator-section__subtitle">Explainable assignment suggestions for the selected booking, job, or due recurring plan.</p>
            </div>
          </div>
          {recommendations?.recommendations?.length ? (
            <OperatorDataTable columns="minmax(180px, 1fr) minmax(100px, 0.5fr) minmax(160px, 0.8fr) minmax(240px, 1.4fr)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Technician</div>
                <div className="operator-table__cell">Score</div>
                <div className="operator-table__cell">After assign</div>
                <div className="operator-table__cell">Reasons</div>
              </OperatorDataTableHeader>
              {recommendations.recommendations.map((row) => (
                <OperatorDataTableRow key={row.technicianId}>
                  <div className="operator-table__cell"><strong>{row.technicianName}</strong></div>
                  <div className="operator-table__cell">{row.score}</div>
                  <div className="operator-table__cell">{formatMinutes(row.remainingMinutesAfterAssign)}</div>
                  <div className="operator-table__cell">{row.reasons.map((reason) => reason.label).join(" • ")}</div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <p className="muted">Select an unassigned work item to view assignment recommendations.</p>
          )}
        </section>

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Availability and exceptions</h2>
              <p className="operator-section__subtitle">Daily overrides and exception windows for planning adjustments.</p>
            </div>
          </div>
          {!canManage ? (
            <p className="muted">Availability and exception editing is read-only for your workspace role.</p>
          ) : (
            <div className="two-col">
              <div style={{ display: "grid", gap: 10 }}>
                <h3 style={{ margin: 0 }}>Availability</h3>
                <select className="input" value={availabilityForm.technicianId} onChange={(event) => setAvailabilityForm((current) => ({ ...current, technicianId: event.target.value }))}>
                  <option value="">Select technician</option>
                  {capacity?.technicians?.map((technician) => (
                    <option key={technician.id} value={technician.id}>{technician.name}</option>
                  ))}
                </select>
                <input className="input" type="date" value={availabilityForm.date} onChange={(event) => setAvailabilityForm((current) => ({ ...current, date: event.target.value }))} />
                <div className="two-col">
                  <input className="input" type="time" value={availabilityForm.startTime} onChange={(event) => setAvailabilityForm((current) => ({ ...current, startTime: event.target.value }))} />
                  <input className="input" type="time" value={availabilityForm.endTime} onChange={(event) => setAvailabilityForm((current) => ({ ...current, endTime: event.target.value }))} />
                </div>
                <input className="input" type="number" min={1} value={availabilityForm.capacityMinutes} onChange={(event) => setAvailabilityForm((current) => ({ ...current, capacityMinutes: Number(event.target.value || 0) }))} />
                <textarea className="textarea" value={availabilityForm.notes} onChange={(event) => setAvailabilityForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Operator notes" />
                <button className="button" data-testid="scheduling-availability-save" type="button" disabled={saving || !availabilityForm.technicianId} onClick={() => void saveAvailability()}>
                  {saving ? "Saving..." : availabilityForm.id ? "Update availability" : "Save availability"}
                </button>
                {capacity?.availability?.length ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {capacity.availability.slice(0, 6).map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        className="integration-card"
                        style={{ textAlign: "left", cursor: "pointer" }}
                        onClick={() => setAvailabilityForm({
                          id: row.id,
                          technicianId: row.technicianId,
                          date: row.date.slice(0, 10),
                          startTime: row.startTime,
                          endTime: row.endTime,
                          capacityMinutes: row.capacityMinutes,
                          notes: String(row.notesJson?.operatorNotes || ""),
                        })}
                      >
                        <strong>{row.date.slice(0, 10)}</strong>
                        <div className="muted">{row.startTime} - {row.endTime} · {formatMinutes(row.capacityMinutes)}</div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <h3 style={{ margin: 0 }}>Capacity exceptions</h3>
                <select className="input" value={exceptionForm.technicianId} onChange={(event) => setExceptionForm((current) => ({ ...current, technicianId: event.target.value }))}>
                  <option value="">Select technician</option>
                  {capacity?.technicians?.map((technician) => (
                    <option key={technician.id} value={technician.id}>{technician.name}</option>
                  ))}
                </select>
                <input className="input" type="date" value={exceptionForm.date} onChange={(event) => setExceptionForm((current) => ({ ...current, date: event.target.value }))} />
                <select className="input" value={exceptionForm.type} onChange={(event) => setExceptionForm((current) => ({ ...current, type: event.target.value }))}>
                  <option value="UNAVAILABLE">Unavailable</option>
                  <option value="REDUCED_CAPACITY">Reduced capacity</option>
                  <option value="OVERTIME">Overtime</option>
                </select>
                <div className="two-col">
                  <input className="input" type="time" value={exceptionForm.startTime} onChange={(event) => setExceptionForm((current) => ({ ...current, startTime: event.target.value }))} />
                  <input className="input" type="time" value={exceptionForm.endTime} onChange={(event) => setExceptionForm((current) => ({ ...current, endTime: event.target.value }))} />
                </div>
                <input className="input" type="number" min={1} value={exceptionForm.capacityMinutes} onChange={(event) => setExceptionForm((current) => ({ ...current, capacityMinutes: Number(event.target.value || 0) }))} />
                <textarea className="textarea" value={exceptionForm.reason} onChange={(event) => setExceptionForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Reason" />
                <button className="button secondary" type="button" disabled={saving || !exceptionForm.technicianId} onClick={() => void saveException()}>
                  {saving ? "Saving..." : exceptionForm.id ? "Update exception" : "Save exception"}
                </button>
                {capacity?.exceptions?.length ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {capacity.exceptions.slice(0, 6).map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        className="integration-card"
                        style={{ textAlign: "left", cursor: "pointer" }}
                        onClick={() => setExceptionForm({
                          id: row.id,
                          technicianId: row.technicianId,
                          date: row.date.slice(0, 10),
                          type: row.type,
                          startTime: row.startTime,
                          endTime: row.endTime,
                          capacityMinutes: row.capacityMinutes,
                          reason: row.reason || "",
                        })}
                      >
                        <strong>{row.type.replaceAll("_", " ")}</strong>
                        <div className="muted">{row.date.slice(0, 10)} · {row.startTime} - {row.endTime} · {formatMinutes(row.capacityMinutes)}</div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
