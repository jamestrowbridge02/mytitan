import { apiFetch } from "./api";

export type OfflineSyncState = "saved_offline" | "queued" | "syncing" | "conflict" | "uploaded" | "synced" | "failed";

export type OfflineMutation = {
  clientMutationId: string;
  jobId: string;
  type: "status_change" | "photo_metadata" | "signature_metadata" | "completion_notes" | "material_usage" | "payment_note" | "binary_attachment";
  baseVersion?: string | null;
  payload: Record<string, unknown>;
  state: OfflineSyncState;
  queuedAt: string;
};

export type OfflineBinaryKind =
  | "before_photo"
  | "after_photo"
  | "video"
  | "document"
  | "signature"
  | "supporting_document"
  | "payment_evidence"
  | "compliance_document";

export type OfflineBinaryQueueItem = {
  clientMutationId: string;
  jobId: string;
  kind: OfflineBinaryKind;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  state: OfflineSyncState;
  queuedAt: string;
  retryCount: number;
  nextRetryAt?: string | null;
  previewUrl?: string | null;
  sha256?: string | null;
  baseVersion?: string | null;
};

const OFFLINE_QUEUE_KEY = "mytitan_phase1k_offline_queue";
const OFFLINE_DB_NAME = "mytitan_offline_field_queue_v1";
const OFFLINE_BINARY_STORE = "binaryQueue";
const OFFLINE_BINARY_META_KEY = "mytitan_phase1n_offline_binary_queue_meta";
const OFFLINE_LAST_SYNC_KEY = "mytitan_phase4f_offline_last_sync";
const MAX_BINARY_BYTES = 10 * 1024 * 1024;
const ACCEPTED_BINARY_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime", "application/pdf", "text/plain"]);

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function readQueue(): OfflineMutation[] {
  if (!canUseStorage()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: OfflineMutation[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue.slice(-100)));
}

export function getOfflineQueue() {
  return readQueue();
}

export function clearOfflineQueue() {
  const items = readQueue();
  writeQueue([]);
  return { cleared: items.length };
}

function readBinaryMeta(): OfflineBinaryQueueItem[] {
  if (!canUseStorage()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(OFFLINE_BINARY_META_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeBinaryMeta(items: OfflineBinaryQueueItem[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(OFFLINE_BINARY_META_KEY, JSON.stringify(items.slice(-100)));
}

function canUseIndexedDb() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openOfflineDb(): Promise<IDBDatabase | null> {
  if (!canUseIndexedDb()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = window.indexedDB.open(OFFLINE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OFFLINE_BINARY_STORE)) {
        db.createObjectStore(OFFLINE_BINARY_STORE, { keyPath: "clientMutationId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function putBinaryRecord(record: OfflineBinaryQueueItem & { blob: Blob }) {
  const db = await openOfflineDb();
  if (!db) return false;
  return new Promise<boolean>((resolve) => {
    const tx = db.transaction(OFFLINE_BINARY_STORE, "readwrite");
    tx.objectStore(OFFLINE_BINARY_STORE).put(record);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

async function deleteBinaryRecord(clientMutationId: string) {
  const db = await openOfflineDb();
  if (!db) return false;
  return new Promise<boolean>((resolve) => {
    const tx = db.transaction(OFFLINE_BINARY_STORE, "readwrite");
    tx.objectStore(OFFLINE_BINARY_STORE).delete(clientMutationId);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

async function sha256File(file: File) {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

export async function registerOfflineBinaryServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return { registered: false, reason: "unsupported" };
  try {
    const registration = await navigator.serviceWorker.register("/offline-field-sync-worker.js", { scope: "/" });
    return { registered: true, scope: registration.scope, cachingAuthenticatedPages: false };
  } catch (error: any) {
    return { registered: false, reason: error?.message || "registration_failed" };
  }
}

export function getOfflineBinaryQueue() {
  return readBinaryMeta();
}

export function getOfflineQueueHealth() {
  const metadata = readQueue();
  const binary = readBinaryMeta();
  const allItems = [...metadata, ...binary];
  const countState = (state: OfflineSyncState) => allItems.filter((item) => item.state === state).length;
  const failures = countState("failed");
  const conflicts = countState("conflict");
  const syncingItems = countState("syncing");
  const queuedItems = allItems.filter((item) => ["saved_offline", "queued"].includes(item.state)).length;
  const totalBytes = binary.reduce((sum, item) => sum + Number(item.sizeBytes || 0), 0);
  const lastSyncAt = canUseStorage() ? window.localStorage.getItem(OFFLINE_LAST_SYNC_KEY) : null;
  const syncHealth = failures > 0 ? "failure_review" : conflicts > 0 ? "conflict_review" : syncingItems > 0 ? "syncing" : queuedItems > 0 ? "queued" : "clear";
  return {
    metadataQueued: metadata.length,
    binaryQueued: binary.length,
    queuedItems,
    syncingItems,
    conflicts,
    failures,
    totalBytes,
    lastSyncAt,
    syncHealth,
    maxItems: 100,
    maxItemBytes: MAX_BINARY_BYTES,
    retryStrategy: { available: true, backoffSeconds: [30, 60, 120, 300], userCanRetry: true },
    partialSyncRecovery: { available: true, syncedItemsAreRemovedIndividually: true, conflictsStayQueued: true },
    failedUploadRecovery: { available: true, userCanRetry: true, userCanClearFailedItems: true },
    safety: {
      assignedJobsOnly: true,
      fullAuthenticatedAppCache: false,
      storesSecrets: false,
      storesCredentialMaterial: false,
      storesCustomerPortalAccess: false,
      platformDataIncluded: false,
    },
  };
}

export async function queueOfflineBinaryAttachment(input: {
  jobId: string;
  kind: OfflineBinaryKind;
  file: File;
  baseVersion?: string | null;
}) {
  const file = input.file;
  if (!input.jobId) throw new Error("Assigned job is required before queueing offline evidence");
  if (!ACCEPTED_BINARY_TYPES.has(file.type || "application/octet-stream")) throw new Error("File type is not supported for offline queueing");
  if (file.size > MAX_BINARY_BYTES) throw new Error("File is too large for the offline queue");
  const sha256 = await sha256File(file);
  const duplicate = sha256 ? readBinaryMeta().find((item) => item.jobId === input.jobId && item.kind === input.kind && item.sha256 === sha256 && item.state !== "uploaded") : null;
  if (duplicate) return duplicate;
  const item: OfflineBinaryQueueItem = {
    clientMutationId: `offline_binary_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    jobId: input.jobId,
    kind: input.kind,
    filename: file.name || `${input.kind}.${(file.type || "application/octet-stream").split("/").pop() || "bin"}`,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    state: "saved_offline",
    queuedAt: new Date().toISOString(),
    retryCount: 0,
    nextRetryAt: null,
    previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    sha256,
    baseVersion: input.baseVersion || null,
  };
  await putBinaryRecord({ ...item, blob: file });
  writeBinaryMeta([...readBinaryMeta(), item]);
  return item;
}

export function queueOfflineMutation(input: Omit<OfflineMutation, "clientMutationId" | "state" | "queuedAt">) {
  const mutation: OfflineMutation = {
    ...input,
    clientMutationId: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    state: "queued",
    queuedAt: new Date().toISOString(),
  };
  writeQueue([...readQueue(), mutation]);
  return mutation;
}

export async function syncOfflineQueue() {
  const queue = readQueue();
  const pending = queue.filter((item) => item.state === "queued" || item.state === "conflict");
  if (!pending.length) return { processed: 0, results: [] as any[] };
  writeQueue(queue.map((item) => pending.some((pendingItem) => pendingItem.clientMutationId === item.clientMutationId) ? { ...item, state: "syncing" } : item));
  const response = await apiFetch("/enterprise/phase-1k/offline/sync", {
    method: "POST",
    body: JSON.stringify({ mutations: pending }),
  });
  const results = Array.isArray(response?.results) ? response.results : [];
  const next: OfflineMutation[] = readQueue().map((item) => {
    const result = results.find((row: any) => row.clientMutationId === item.clientMutationId);
    if (!result) return item;
    if (result.state === "failed") return { ...item, state: "failed" };
    const state: OfflineSyncState = result.state === "conflict" ? "conflict" : "synced";
    return { ...item, state };
  });
  writeQueue(next.filter((item) => item.state !== "synced"));
  if (canUseStorage()) window.localStorage.setItem(OFFLINE_LAST_SYNC_KEY, new Date().toISOString());
  return response;
}

export async function syncOfflineBinaryQueue() {
  const queue = readBinaryMeta();
  const pending = queue.filter((item) => item.state === "saved_offline" || item.state === "queued" || item.state === "conflict");
  if (!pending.length) return { processed: 0, results: [] as any[] };
  writeBinaryMeta(queue.map((item) => pending.some((pendingItem) => pendingItem.clientMutationId === item.clientMutationId) ? { ...item, state: "syncing" } : item));
  const response = await apiFetch("/enterprise/phase-1k/offline/sync", {
    method: "POST",
    body: JSON.stringify({
      mutations: pending.map((item) => ({
        clientMutationId: item.clientMutationId,
        jobId: item.jobId,
        type: "binary_attachment",
        baseVersion: item.baseVersion || null,
        payload: {
          kind: item.kind,
          filename: item.filename,
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
          sha256: item.sha256,
          source: "indexeddb_binary_queue",
          storesTokens: false,
          storesSecrets: false,
        },
      })),
    }),
  });
  const results = Array.isArray(response?.results) ? response.results : [];
  const next = readBinaryMeta().map((item) => {
    const result = results.find((row: any) => row.clientMutationId === item.clientMutationId);
    if (!result) return item;
    if (result.state === "conflict") return { ...item, state: "conflict" as OfflineSyncState };
    if (result.state === "failed") return { ...item, state: "failed" as OfflineSyncState, retryCount: item.retryCount + 1, nextRetryAt: new Date(Date.now() + Math.min(300000, 30000 * Math.max(1, item.retryCount + 1))).toISOString() };
    return { ...item, state: "uploaded" as OfflineSyncState };
  });
  writeBinaryMeta(next.filter((item) => item.state !== "uploaded"));
  await Promise.all(next.filter((item) => item.state === "uploaded").map((item) => deleteBinaryRecord(item.clientMutationId)));
  if (typeof navigator !== "undefined" && navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "MYTITAN_OFFLINE_BINARY_SYNCED", processed: results.length });
  }
  if (canUseStorage()) window.localStorage.setItem(OFFLINE_LAST_SYNC_KEY, new Date().toISOString());
  return response;
}

export async function clearOfflineBinaryQueue() {
  const items = readBinaryMeta();
  await Promise.all(items.map((item) => deleteBinaryRecord(item.clientMutationId)));
  writeBinaryMeta([]);
  return { cleared: items.length };
}

export async function loadOfflinePacket() {
  return apiFetch("/enterprise/phase-1k/offline/packet");
}
