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

const DEFAULT_PERIOD_FORM = {
  id: "",
  name: "",
  startsAt: "",
  endsAt: "",
  status: "OPEN",
};

export default function PerformancePage() {
  const [permissions, setPermissions] = useState(() => emptyPermissionSnapshot());
  const [periods, setPeriods] = useState<any[]>([]);
  const [scorecards, setScorecards] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [risks, setRisks] = useState<any[]>([]);
  const [activeLocationId, setActiveLocationId] = useState("all");
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [selectedRoleType, setSelectedRoleType] = useState("");
  const [periodForm, setPeriodForm] = useState<any>(DEFAULT_PERIOD_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { notice, showError, showSuccess, clearNotice } = useOperatorNotice();

  const canView = hasWorkspacePermission(permissions, "dashboard.view_intelligence");
  const canManage = hasWorkspacePermission(permissions, "settings.manage");

  async function load(nextPeriodId = selectedPeriodId, nextRoleType = selectedRoleType) {
    setLoading(true);
    try {
      const me = await apiFetch("/me");
      const nextPermissions = normalizePermissionSnapshot(me?.permissions);
      setPermissions(nextPermissions);
      if (!nextPermissions["dashboard.view_intelligence"]) {
        setLoading(false);
        return;
      }
      const periodRows = await apiFetch("/performance/periods");
      const normalizedPeriods = Array.isArray(periodRows) ? periodRows : [];
      const activePeriodId = nextPeriodId || normalizedPeriods[0]?.id || "";
      const query = new URLSearchParams();
      if (activePeriodId) query.set("periodId", activePeriodId);
      if (nextRoleType) query.set("roleType", nextRoleType);
      if (activeLocationId !== "all") query.set("locationId", activeLocationId);
      const suffix = query.toString();
      const [scorecardRows, leaderboardRows, riskRows] = await Promise.all([
        apiFetch(`/performance/scorecards${suffix ? `?${suffix}` : ""}`),
        apiFetch(`/performance/leaderboard${suffix ? `?${suffix}` : ""}`),
        apiFetch(`/performance/risks${suffix ? `?${suffix}` : ""}`),
      ]);
      setPeriods(normalizedPeriods);
      setSelectedPeriodId(activePeriodId);
      setScorecards(Array.isArray(scorecardRows) ? scorecardRows : []);
      setLeaderboard(Array.isArray(leaderboardRows) ? leaderboardRows : []);
      setRisks(Array.isArray(riskRows) ? riskRows : []);
    } catch (error: any) {
      showError(error?.message || "Failed to load performance workspace");
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

  async function savePeriod() {
    setSaving(true);
    clearNotice();
    try {
      await apiFetch(periodForm.id ? `/performance/periods/${periodForm.id}` : "/performance/periods", {
        method: periodForm.id ? "PATCH" : "POST",
        body: JSON.stringify({
          name: String(periodForm.name || "").trim(),
          startsAt: periodForm.startsAt,
          endsAt: periodForm.endsAt,
          status: periodForm.status,
        }),
      });
      showSuccess(periodForm.id ? "Performance period updated" : "Performance period created");
      setPeriodForm(DEFAULT_PERIOD_FORM);
      await load();
    } catch (error: any) {
      showError(error?.message || "Failed to save performance period");
    } finally {
      setSaving(false);
    }
  }

  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === selectedPeriodId) || periods[0] || null,
    [periods, selectedPeriodId],
  );

  if (!canView && !loading) {
    return (
      <DashboardShell>
        <OperatorPageHeader eyebrow="People Ops" title="Performance" subtitle="Performance scorecards are limited to operators with intelligence access." />
        <OperatorEmptyStateCard title="Performance access restricted" description="You do not currently have permission to view scorecards or risk signals." />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="People Ops"
          title="Performance"
          subtitle="Compute deterministic scorecards from real workflow, scheduling, revenue, and compliance data."
          stats={[
            { label: "Periods", value: String(periods.length), hint: "Configured score windows" },
            { label: "Scorecards", value: String(scorecards.length), hint: "Current scoped results" },
            { label: "Leaderboard", value: String(leaderboard.length), hint: "Visible leaders" },
            { label: "Risks", value: String(risks.length), hint: "Needs manager follow-up" },
          ]}
          actions={[
            { label: "Analytics", href: "/dashboard/analytics", variant: "secondary" },
            { label: "Compensation", href: "/dashboard/compensation", variant: "secondary" },
            { label: "Compliance", href: "/dashboard/compliance" },
          ]}
        />

        <OperatorNotice notice={notice} onDismiss={clearNotice} />

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Scope</h2>
              <p className="operator-section__subtitle">Filter performance by period, role, and current location scope.</p>
            </div>
          </div>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
            <select className="input" value={selectedPeriodId} onChange={(event) => { setSelectedPeriodId(event.target.value); void load(event.target.value, selectedRoleType); }}>
              {periods.map((period) => (
                <option key={period.id} value={period.id}>{period.name}</option>
              ))}
            </select>
            <select className="input" value={selectedRoleType} onChange={(event) => { setSelectedRoleType(event.target.value); void load(selectedPeriodId, event.target.value); }}>
              <option value="">All roles</option>
              <option value="TECHNICIAN">Technicians</option>
              <option value="DISPATCHER">Dispatch</option>
              <option value="FINANCE">Finance</option>
              <option value="MANAGER">Managers</option>
            </select>
            <div className="integration-card">
              <strong>Location scope</strong>
              <p className="muted" style={{ margin: "6px 0 0 0" }}>{activeLocationId === "all" ? "All locations" : "Scoped location"}</p>
            </div>
          </div>
        </section>

        {canManage ? (
          <section className="card operator-section">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">{periodForm.id ? "Edit period" : "Create period"}</h2>
                <p className="operator-section__subtitle">Keep scorecards pinned to an explicit operating window.</p>
              </div>
            </div>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
              <input className="input" placeholder="Period name" value={periodForm.name} onChange={(event) => setPeriodForm((prev: any) => ({ ...prev, name: event.target.value }))} />
              <input className="input" type="date" value={periodForm.startsAt} onChange={(event) => setPeriodForm((prev: any) => ({ ...prev, startsAt: event.target.value }))} />
              <input className="input" type="date" value={periodForm.endsAt} onChange={(event) => setPeriodForm((prev: any) => ({ ...prev, endsAt: event.target.value }))} />
              <select className="input" value={periodForm.status} onChange={(event) => setPeriodForm((prev: any) => ({ ...prev, status: event.target.value }))}>
                <option value="OPEN">Open</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button className="button" type="button" onClick={savePeriod} disabled={saving || !periodForm.name || !periodForm.startsAt || !periodForm.endsAt}>
                {saving ? "Saving..." : "Save period"}
              </button>
              {periodForm.id ? <button className="button secondary" type="button" onClick={() => setPeriodForm(DEFAULT_PERIOD_FORM)}>Cancel edit</button> : null}
            </div>
          </section>
        ) : null}

        {canManage ? (
          <section className="card operator-section">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Performance periods</h2>
                <p className="operator-section__subtitle">Edit the currently available operating windows for scorecards.</p>
              </div>
            </div>
            {periods.length ? (
              <OperatorDataTable columns="minmax(220px,1fr) minmax(160px,0.8fr) minmax(160px,0.8fr) minmax(120px,0.6fr) minmax(120px,0.6fr)">
                <OperatorDataTableHeader>
                  <div className="operator-table__cell">Period</div>
                  <div className="operator-table__cell">Starts</div>
                  <div className="operator-table__cell">Ends</div>
                  <div className="operator-table__cell">Status</div>
                  <div className="operator-table__cell">Action</div>
                </OperatorDataTableHeader>
                {periods.map((period) => (
                  <OperatorDataTableRow key={period.id}>
                    <div className="operator-table__cell"><strong>{period.name}</strong></div>
                    <div className="operator-table__cell">{String(period.startsAt || "").slice(0, 10)}</div>
                    <div className="operator-table__cell">{String(period.endsAt || "").slice(0, 10)}</div>
                    <div className="operator-table__cell">{period.status}</div>
                    <div className="operator-table__cell">
                      <button className="button secondary" type="button" onClick={() => setPeriodForm({
                        id: period.id,
                        name: period.name,
                        startsAt: String(period.startsAt || "").slice(0, 10),
                        endsAt: String(period.endsAt || "").slice(0, 10),
                        status: period.status || "OPEN",
                      })}>Edit</button>
                    </div>
                  </OperatorDataTableRow>
                ))}
              </OperatorDataTable>
            ) : (
              <OperatorEmptyStateCard title="No periods configured" description="Create a score window before managers start reviewing performance." />
            )}
          </section>
        ) : null}

        <section className="card operator-section" data-testid="performance-scorecard-list">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Scorecards</h2>
              <p className="operator-section__subtitle">{selectedPeriod ? `${selectedPeriod.name} scorecards` : "Current scoped scorecards"} with explicit metric breakdowns.</p>
            </div>
          </div>
          {scorecards.length ? (
            <OperatorDataTable columns="minmax(220px, 1fr) minmax(140px, 0.7fr) minmax(140px, 0.7fr) minmax(180px, 1fr)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Person</div>
                <div className="operator-table__cell">Role</div>
                <div className="operator-table__cell">Score</div>
                <div className="operator-table__cell">Signals</div>
              </OperatorDataTableHeader>
              {scorecards.map((scorecard) => (
                <OperatorDataTableRow key={scorecard.id}>
                  <div className="operator-table__cell">
                    <strong>{scorecard.user?.email || "Unknown user"}</strong>
                    <div className="muted">{scorecard.location?.name || "All locations"}</div>
                  </div>
                  <div className="operator-table__cell">{scorecard.roleType}</div>
                  <div className="operator-table__cell">{scorecard.scoreJson?.overallScore ?? "-"}</div>
                  <div className="operator-table__cell">
                    {Array.isArray(scorecard.scoreJson?.components) ? scorecard.scoreJson.components.slice(0, 3).map((component: any) => (
                      <div key={component.key} className="muted">{component.key}: {component.value ?? "-"}</div>
                    )) : null}
                  </div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <OperatorEmptyStateCard title="No scorecards yet" description="Seed or create a performance period to compute scorecards for your tenant." />
          )}
        </section>

        <section className="card operator-section" data-testid="performance-leaderboard">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Leaderboard</h2>
              <p className="operator-section__subtitle">Top performers in the current scope, ranked by explicit score components.</p>
            </div>
          </div>
          {leaderboard.length ? (
            <OperatorDataTable columns="80px minmax(220px,1fr) minmax(140px,0.7fr) minmax(120px,0.6fr)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Rank</div>
                <div className="operator-table__cell">Person</div>
                <div className="operator-table__cell">Role</div>
                <div className="operator-table__cell">Score</div>
              </OperatorDataTableHeader>
              {leaderboard.map((entry, index) => (
                <OperatorDataTableRow key={`${entry.userId}-${entry.roleType}`}>
                  <div className="operator-table__cell">#{index + 1}</div>
                  <div className="operator-table__cell"><strong>{entry.userEmail}</strong></div>
                  <div className="operator-table__cell">{entry.roleType}</div>
                  <div className="operator-table__cell">{entry.overallScore}</div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <OperatorEmptyStateCard title="No leaderboard data yet" description="Scorecards need a valid period and tenant activity before leaders can be ranked." />
          )}
        </section>

        <section className="card operator-section" data-testid="performance-risk-list">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Risks</h2>
              <p className="operator-section__subtitle">Low-scoring or high-pressure roles worth direct manager follow-up.</p>
            </div>
          </div>
          {risks.length ? (
            <OperatorDataTable columns="minmax(220px,1fr) minmax(140px,0.7fr) minmax(120px,0.6fr) minmax(220px,1fr)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Person</div>
                <div className="operator-table__cell">Role</div>
                <div className="operator-table__cell">Score</div>
                <div className="operator-table__cell">Why</div>
              </OperatorDataTableHeader>
              {risks.map((risk) => (
                <OperatorDataTableRow key={risk.id}>
                  <div className="operator-table__cell"><strong>{risk.userEmail}</strong></div>
                  <div className="operator-table__cell">{risk.roleType}</div>
                  <div className="operator-table__cell">{risk.overallScore}</div>
                  <div className="operator-table__cell">{risk.summary}</div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <OperatorEmptyStateCard title="No performance risks in scope" description="This slice currently shows no low-scoring or high-pressure scorecards." />
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
