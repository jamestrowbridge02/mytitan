import React from "react";
import { UPLOAD_LIMITS, validateUploadFile } from "../../lib/upload-policy";
import { SafeImage } from "./SafeImage";

type UploadStatus = "idle" | "selected" | "uploading" | "success" | "error";

export type PendingImageUpload = {
  file: File | null;
  previewUrl: string | null;
  status: UploadStatus;
  error: string | null;
  requestId: string | null;
};

type EntityImageUploadProps = {
  inputId: string;
  inputTestId?: string;
  fileNameTestId: string;
  selectionTestId: string;
  previewTestId: string;
  uploadButtonTestId?: string;
  inputAriaLabel: string;
  currentImageUrl?: string | null;
  currentImageLabel?: string;
  previewAlt: string;
  disabled?: boolean;
  maxBytes?: number;
  onUpload: (file: File) => Promise<void>;
  onError?: (message: string) => void;
  onUploaded?: () => void;
};

const EMPTY_UPLOAD: PendingImageUpload = {
  file: null,
  previewUrl: null,
  status: "idle",
  error: null,
  requestId: null,
};

function buildRequestId() {
  return `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function EntityImageUpload({
  inputId,
  inputTestId,
  fileNameTestId,
  selectionTestId,
  previewTestId,
  uploadButtonTestId,
  inputAriaLabel,
  currentImageUrl,
  currentImageLabel = "Current image saved",
  previewAlt,
  disabled = false,
  maxBytes = UPLOAD_LIMITS.image,
  onUpload,
  onError,
  onUploaded,
}: EntityImageUploadProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [pending, setPending] = React.useState<PendingImageUpload>(EMPTY_UPLOAD);

  React.useEffect(() => {
    return () => {
      if (pending.previewUrl) URL.revokeObjectURL(pending.previewUrl);
    };
  }, [pending.previewUrl]);

  function clearSelection() {
    setPending((current) => {
      if (current.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return EMPTY_UPLOAD;
    });
    if (inputRef.current) inputRef.current.value = "";
  }

  function selectFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    if (!file) {
      clearSelection();
      return;
    }
    const validationError = validateUploadFile(file, { category: "image", maxBytes });
    if (validationError) {
      event.currentTarget.value = "";
      setPending((current) => {
        if (current.previewUrl) URL.revokeObjectURL(current.previewUrl);
        return { ...EMPTY_UPLOAD, status: "error", error: validationError, requestId: buildRequestId() };
      });
      onError?.(validationError);
      return;
    }
    setPending((current) => {
      if (current.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return {
        file,
        previewUrl: URL.createObjectURL(file),
        status: "selected",
        error: null,
        requestId: buildRequestId(),
      };
    });
  }

  async function uploadSelected(event?: React.MouseEvent<HTMLButtonElement>) {
    event?.preventDefault();
    if (!pending.file || pending.status === "uploading") return;
    const file = pending.file;
    setPending((current) => ({ ...current, status: "uploading", error: null }));
    try {
      await onUpload(file);
      setPending((current) => {
        if (current.previewUrl) URL.revokeObjectURL(current.previewUrl);
        return { ...EMPTY_UPLOAD, status: "success" };
      });
      if (inputRef.current) inputRef.current.value = "";
      onUploaded?.();
    } catch (err: any) {
      const message = err?.message || "Image upload failed. The image was not changed.";
      setPending((current) => ({ ...current, status: "error", error: message }));
      onError?.(message);
    }
  }

  const previewUrl = pending.previewUrl || currentImageUrl || "";
  const selected = pending.file;
  const hasCurrentImage = Boolean(currentImageUrl);

  return (
    <div className="entity-image-upload" data-upload-status={pending.status}>
      {previewUrl ? (
        <SafeImage
          src={previewUrl}
          alt={previewAlt}
          data-testid={previewTestId}
          style={{ width: 180, height: 110, objectFit: "cover", borderRadius: 14, display: "block" }}
          fallback={<span className="muted">Image preview unavailable</span>}
        />
      ) : (
        <div className="muted" data-testid={previewTestId} style={{ width: 180, minHeight: 72, display: "grid", placeItems: "center", border: "1px dashed var(--border)", borderRadius: 12 }}>
          No image saved
        </div>
      )}
      <div className="integration-actions">
        <input
          ref={inputRef}
          id={inputId}
          className="visually-hidden"
          data-testid={inputTestId}
          aria-label={inputAriaLabel}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={disabled || pending.status === "uploading"}
          onChange={selectFile}
        />
        <label className="button secondary" htmlFor={inputId}>
          Choose image
        </label>
        <div data-testid={selectionTestId} aria-live="polite">
          <span data-testid={fileNameTestId}>{selected ? selected.name : hasCurrentImage ? currentImageLabel : "No image selected"}</span>
          {selected ? (
            <span className="muted" style={{ display: "block" }}>
              {(selected.size / 1024).toFixed(1)} KB selected
            </span>
          ) : null}
        </div>
        <button
          className="button secondary"
          data-testid={uploadButtonTestId}
          type="button"
          disabled={!selected || disabled || pending.status === "uploading"}
          onClick={uploadSelected}
        >
          {pending.status === "uploading" ? "Uploading..." : "Upload image"}
        </button>
        {selected ? (
          <button className="button secondary" type="button" onClick={clearSelection} disabled={pending.status === "uploading"}>
            Clear
          </button>
        ) : null}
        {pending.status === "success" && hasCurrentImage ? <span className="muted">Image saved</span> : null}
        {pending.status === "error" && pending.error ? (
          <span className="muted" role="alert">
            {pending.error}
          </span>
        ) : null}
      </div>
    </div>
  );
}
