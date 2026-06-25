export type UploadQueueState = "queued" | "compressing" | "uploading" | "retrying" | "failed" | "uploaded";

export type UploadQueueItem = {
  id: string;
  fileName: string;
  originalBytes: number;
  estimatedUploadBytes: number;
  previewUrl?: string;
  warning?: string | null;
  progress: number;
  state: UploadQueueState;
};

const MAX_SAFE_PREVIEW_BYTES = 12 * 1024 * 1024;
const WARNING_BYTES = 8 * 1024 * 1024;

export function getAttachmentWarning(bytes: number) {
  if (bytes >= MAX_SAFE_PREVIEW_BYTES) return "Large photo: preview is memory-safe and upload will be compressed first.";
  if (bytes >= WARNING_BYTES) return "Large attachment: compression and retry queue will be used before upload.";
  return null;
}

export async function prepareMobileUpload(file: File): Promise<UploadQueueItem> {
  const isImage = file.type.startsWith("image/");
  const estimatedUploadBytes = isImage ? Math.max(Math.round(file.size * 0.62), 120_000) : file.size;
  return {
    id: `upload_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    fileName: file.name,
    originalBytes: file.size,
    estimatedUploadBytes,
    previewUrl: isImage && file.size < MAX_SAFE_PREVIEW_BYTES ? URL.createObjectURL(file) : undefined,
    warning: getAttachmentWarning(file.size),
    progress: 0,
    state: isImage ? "compressing" : "queued",
  };
}

export function nextUploadRetryDelay(attempt: number) {
  return Math.min(30_000, 750 * 2 ** Math.max(0, attempt));
}
