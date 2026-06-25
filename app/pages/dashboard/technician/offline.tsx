import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { OperatorNotice } from "../../../components/feedback/OperatorNotice";
import { useOperatorNotice } from "../../../components/feedback/useOperatorNotice";
import {
  OperatorDataTable,
  OperatorDataTableHeader,
  OperatorDataTableRow,
  OperatorEmptyStateCard,
  OperatorPageHeader,
} from "../../../components/ui/operator-page";
import { apiFetch } from "../../../lib/api";
import {
  clearOfflineBinaryQueue,
  clearOfflineQueue,
  getOfflineBinaryQueue,
  getOfflineQueue,
  getOfflineQueueHealth,
  loadOfflinePacket,
  syncOfflineBinaryQueue,
  syncOfflineQueue,
  type OfflineBinaryQueueItem,
  type OfflineMutation,
} from "../../../lib/offline-mobile";
import { emptyPermissionSnapshot, hasWorkspacePermission, normalizePermissionSnapshot } from "../../../lib/workspace-permissions";

function formatBytes(value: number) {
  if (!value) return "0 B";
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function formatWhen(value?: string | null) {
  if (!value) return "No sync yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "No sync yet" : date.toLocaleString();
}

export default function TechnicianOfflinePage() {
  const [permissions, setPermissions] = useState(() => emptyPermissionSnapshot());
  const [permissionsReady, setPermissionsReady] = useState(false);
  const [packet, setPacket] = useState<any>(null);
  const [metadataQueue, setMetadataQueue] = useState<OfflineMutation[]>([]);
  const [binaryQueue, setBinaryQueue] = useState<OfflineBinaryQueueItem[]>([]);
  const [health, setHealth] = useState(() => getOfflineQueueHealth());
  const [busy, setBusy] = useState(false);
  const { notice, showError, showSuccess, clearNotice } = useOperatorNotice();

  function refreshLocalState() {
    setMetadataQueue(getOfflineQueue());
    setBinaryQueue(getOfflineBinaryQueue());
    setHealth(getOfflineQueueHealth());
  }

  useEffect(() => {
    let cancelled = false;
    async function loadMe() {
      try {
        const me = await apiFetch("/me");
        if (!cancelled) setPermissions(normalizePermissionSnapshot(me?.permissions));
      } catch {
        if (!cancelled) setPermissions(emptyPermissionSnapshot());
      } finally {
        if (!cancelled) setPermissionsReady(true);
      }
    }
    void loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!permissionsReady || !hasWorkspacePermission(permissions, "technician.execute")) return;
    let cancelled = false;
    refreshLocalState();
    async function loadPacket() {
      try {
        const result = await loadOfflinePacket();
        if (!cancelled) setPacket(result);
      } catch (error: any) {
        if (!cancelled) showError(error?.message || "Offline packet is unavailable");
      }
    }
    void loadPacket();
    return () => {
      cancelled = true;
    };
  }, [permissions, permissionsReady]);

  const rows = useMemo(() => [
    ...metadataQueue.map((item) => ({
      id: item.clientMutationId,
      kind: item.type,
      jobId: item.jobId,
      state: item.state,
      queuedAt: item.queuedAt,
      detail: "metadata",
    })),
    ...binaryQueue.map((item) => ({
      id: item.clientMutationId,
      kind: item.kind,
      jobId: item.jobId,
      state: item.state,
      queuedAt: item.queuedAt,
      detail: `${item.filename} · ${formatBytes(item.sizeBytes)}`,
    })),
  ].sort((left, right) => new Date(right.queuedAt).getTime() - new Date(left.queuedAt).getTime()), [metadataQueue, binaryQueue]);

  async function runSync() {
    setBusy(true);
    try {
      await syncOfflineQueue();
      await syncOfflineBinaryQueue();
      refreshLocalState();
      clearNotice();
      showSuccess("Offline queue sync attempted. Conflicts and failures stay visible for review.");
    } catch (error: any) {
      refreshLocalState();
      showError(error?.message || "Offline sync failed. Queued work remains on this device.");
    } finally {
      setBusy(false);
    }
  }

  async function clearQueues() {
    setBusy(true);
    try {
      await clearOfflineBinaryQueue();
      clearOfflineQueue();
      refreshLocalState();
      showSuccess("Local offline queues cleared on this device.");
    } catch (error: any) {
      showError(error?.message || "Failed to clear offline queue");
    } finally {
      setBusy(false);
    }
  }

  if (permissionsReady && !hasWorkspacePermission(permissions, "technician.execute")) {
    return (
      <DashboardShell>
        <div className="operator-stack" data-testid="technician-offline-blocked">
          <OperatorPageHeader
            eyebrow="Field OS"
            title="Offline queue"
            subtitle="Offline field operation is restricted to technician-capable workspace roles."
          />
          <OperatorEmptyStateCard
            title="Technician access restricted"
            description="Your workspace role cannot use offline field execution actions."
          />
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="operator-stack" data-testid="technician-offline-control-room">
        <OperatorPageHeader
          eyebrow="Field OS"
          title="Offline queue"
          subtitle="Review assigned-job offline work, sync safely on reconnect, and resolve conflicts without overwriting server records."
          actions={[
            { label: "Sync now", onClick: () => void runSync(), disabled: busy },
            { label: "Clear local queue", onClick: () => void clearQueues(), variant: "secondary", disabled: busy || !rows.length },
            { label: "Back to technician queue", href: "/dashboard/technician", variant: "secondary" },
          ]}
          stats={[
            { label: "Queued", value: health.queuedItems, hint: `${health.metadataQueued} metadata · ${health.binaryQueued} evidence` },
            { label: "Syncing", value: health.syncingItems, hint: "In-flight local work" },
            { label: "Conflicts", value: health.conflicts, hint: "Review required before retry" },
            { label: "Failures", value: health.failures, hint: "Retry or clear after review" },
            { label: "Last sync", value: formatWhen(health.lastSyncAt), hint: String(health.syncHealth).replaceAll("_", " ") },
          ]}
        />

        <OperatorNotice notice={notice} onDismiss={clearNotice} />

        <section className="card operator-section" data-testid="offline-safety-contract">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Offline safety contract</h2>
              <p className="operator-section__subtitle">The server remains source of truth. Only assigned jobs are packeted for field use.</p>
            </div>
          </div>
          <div className="mt-pulse-grid">
            <article className="mt-surface-note"><strong>Assigned jobs only</strong><p className="muted" style={{ margin: "6px 0 0" }}>{packet?.jobs?.length || 0} active assigned jobs in the current packet.</p></article>
            <article className="mt-surface-note"><strong>No full app cache</strong><p className="muted" style={{ margin: "6px 0 0" }}>Authenticated pages, platform data, and portal access are not cached.</p></article>
            <article className="mt-surface-note"><strong>Local evidence protected</strong><p className="muted" style={{ margin: "6px 0 0" }}>Binary evidence stays local until upload and is not stored in the server packet.</p></article>
            <article className="mt-surface-note"><strong>Recovery ready</strong><p className="muted" style={{ margin: "6px 0 0" }}>Partial sync, retry backoff, and failed upload recovery stay visible.</p></article>
          </div>
        </section>

        <section className="card operator-section" data-testid="offline-queue-review">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Queued field work</h2>
              <p className="operator-section__subtitle">Photos, videos, documents, signatures, materials, completion notes, and manual payment notes stay reviewable until synced or cleared.</p>
            </div>
            <span className={health.syncHealth === "clear" ? "operator-tag" : "badge warn"}>{String(health.syncHealth).replaceAll("_", " ")}</span>
          </div>

          {rows.length ? (
            <OperatorDataTable columns="minmax(160px, 0.9fr) minmax(180px, 1fr) minmax(130px, 0.7fr) minmax(190px, 1fr) minmax(210px, 1.1fr)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Type</div>
                <div className="operator-table__cell">Job</div>
                <div className="operator-table__cell">State</div>
                <div className="operator-table__cell">Queued</div>
                <div className="operator-table__cell">Detail</div>
              </OperatorDataTableHeader>
              {rows.map((row) => (
                <OperatorDataTableRow key={row.id}>
                  <div className="operator-table__cell"><strong>{row.kind.replaceAll("_", " ")}</strong></div>
                  <div className="operator-table__cell">{row.jobId}</div>
                  <div className="operator-table__cell">{row.state.replaceAll("_", " ")}</div>
                  <div className="operator-table__cell">{formatWhen(row.queuedAt)}</div>
                  <div className="operator-table__cell">{row.detail}</div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <OperatorEmptyStateCard
              title="No offline work queued"
              description="Assigned-job updates, evidence, signatures, material usage, completion notes, and manual payment notes will appear here when saved offline."
            />
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
