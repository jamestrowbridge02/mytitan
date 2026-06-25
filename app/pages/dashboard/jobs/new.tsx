import { Dispatch, SetStateAction, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { DashboardShell } from "../../../components/dashboard-shell";
import { OperatorPageHeader } from "../../../components/ui/operator-page";
import { apiFetch } from "../../../lib/api";
import { getJobDeclarationText, getActiveWorkspaceServiceTypes, getWorkspaceJobForms } from "../../../lib/business-config";
import { isInventoryV1Enabled, isWheelsAutomationV1Enabled, isWheelsFormV1Enabled } from "../../../lib/feature-flags";
import { resolveGuidedMode, setGuidedMode } from "../../../lib/guided-mode";
import { useTenantSettings } from "../../../lib/tenant-settings";
import { applyPricingPreset, buildWhatsAppMessage, computeTotals, computeWheelCount } from "../../../lib/wheels-automation";
const __mtIsOn = (v: any) => {
  const x = String(v ?? "").trim().toLowerCase();
  return x === "on" || x === "true" || x === "1";
};

type WorkspaceServiceType = {
  id: string;
  name: string;
  description?: string | null;
  enabled?: boolean | null;
  retired?: boolean | null;
  order?: number | null;
};

type WorkspaceJobFormSection = {
  id: string;
  title: string;
  description?: string | null;
  order?: number | null;
  visible?: boolean | null;
  serviceTypeIds?: string[] | null;
};

type WorkspaceJobFormField = {
  id: string;
  key: string;
  sectionId: string;
  label: string;
  helpText?: string | null;
  type: "text" | "textarea" | "select" | "checkbox" | "number" | "date";
  required?: boolean | null;
  visible?: boolean | null;
  order?: number | null;
  options?: string[] | null;
  serviceTypeIds?: string[] | null;
};

type DraftSnapshot = {
  stepIndex: number;
  formData: Record<string, any>;
  torqueEvidenceMeta: { present: boolean; name: string; type: string } | null;
  beforePhotosMeta: Array<{ name: string; type: string }>;
  afterPhotosMeta: Array<{ name: string; type: string }>;
  savedAt: string;
};

type PricingPreset = {
  name: string;
  key: string;
  unitPrice: number | null;
  useCount: number;
};

type SelectedMedia = {
  id: string;
  file: File;
  previewUrl: string | null;
};

const JOB_MEDIA_MAX_BYTES = 8 * 1024 * 1024;
const JOB_TYPE_OPTIONS = ["Standard", "Trade", "Insurance"] as const;
const WHEEL_POSITION_KEYS = [
  { key: "wheel_nsf", label: "NSF" },
  { key: "wheel_nsr", label: "NSR" },
  { key: "wheel_osf", label: "OSF" },
  { key: "wheel_osr", label: "OSR" },
  { key: "wheel_spare", label: "SPARE" },
] as const;
const WHEEL_LAYOUT_ROWS = [
  [
    { key: "wheel_nsf", label: "NSF" },
    { key: "wheel_osf", label: "OSF" },
  ],
  [
    { key: "wheel_nsr", label: "NSR" },
    { key: "wheel_osr", label: "OSR" },
  ],
  [{ key: "wheel_spare", label: "SPARE" }],
] as const;
const LOOSE_WHEEL_OPTIONS = ["x1", "x2", "x3", "x4", "x5"] as const;

function selectedWheelPositions(formData: Record<string, any>) {
  return WHEEL_POSITION_KEYS.filter((item) => Boolean(formData[item.key])).map((item) => item.label);
}

function selectedServiceTypes(formData: Record<string, any>, selectedServiceType?: WorkspaceServiceType | null) {
  const values = Array.isArray(formData.serviceTypes)
    ? formData.serviceTypes
    : typeof formData.serviceTypes === "string"
      ? formData.serviceTypes.split(",")
      : [];
  return Array.from(
    new Set(
      [...values, formData.serviceTypeName, selectedServiceType?.name, formData.serviceName]
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

function formatSingleLineAddress(formData: Record<string, any>) {
  return [
    formData.addressLine1,
    formData.addressLine2,
    formData.city || formData.town,
    formData.postcode,
    formData.country,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(", ");
}

function fieldMatchesServiceType(ids: string[] | null | undefined, serviceTypeId: string) {
  if (!Array.isArray(ids) || ids.length === 0) return true;
  return Boolean(serviceTypeId && ids.includes(serviceTypeId));
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function JobFormInfoHint({
  label,
  hint,
  testId,
}: {
  label: string;
  hint: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const hintId = useId();

  return (
    <span className="jobs-new-hintWrap">
      <button
        type="button"
        className="jobs-new-hintButton"
        aria-label={`${open ? "Hide" : "Show"} help for ${label}`}
        aria-expanded={open}
        aria-controls={hintId}
        data-testid={testId}
        onClick={() => setOpen((current) => !current)}
      >
        i
      </button>
      {open ? (
        <span id={hintId} className="jobs-new-hintDisclosure" role="note">
          {hint}
        </span>
      ) : null}
    </span>
  );
}

function JobFormLabel({
  label,
  hint,
  hintTestId,
}: {
  label: string;
  hint?: string | null;
  hintTestId?: string;
}) {
  return (
    <label className="jobs-new-label">
      <span>{label}</span>
      {hint ? <JobFormInfoHint label={label} hint={hint} testId={hintTestId} /> : null}
    </label>
  );
}

function JobFormDisclosure({
  title,
  summary,
  defaultOpen = false,
  testId,
  children,
}: {
  title: string;
  summary: string;
  defaultOpen?: boolean;
  testId?: string;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  useEffect(() => {
    if (defaultOpen) {
      setIsOpen(true);
    }
  }, [defaultOpen]);

  return (
    <details
      className="jobs-new-disclosure"
      open={isOpen}
      data-testid={testId}
      onToggle={(event) => setIsOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="jobs-new-disclosureSummary">
        <span>
          <strong>{title}</strong>
          <small>{summary}</small>
        </span>
        <span className="jobs-new-disclosureToggle" aria-hidden="true">
          Show
        </span>
      </summary>
      <div className="jobs-new-disclosureBody">{children}</div>
    </details>
  );
}

function sanitizeNumericInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [whole, ...fraction] = cleaned.split(".");
  if (!fraction.length) return cleaned;
  return `${whole}.${fraction.join("")}`;
}

function SignaturePad({
  value,
  onChange,
  label,
  testId,
  showLabel = true,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  testId: string;
  showLabel?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const drawingRef = useRef(false);
  const historyRef = useRef<string[]>([]);
  const pointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const snapshotCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderFrameRef = useRef<number | null>(null);
  const logicalSizeRef = useRef({ width: 0, height: 0 });

  function drawBackground(ctx: CanvasRenderingContext2D) {
    const size = logicalSizeRef.current;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size.width, size.height);
  }

  function resizeCanvas(nextValue?: string) {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper || typeof window === "undefined") return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = Math.max(Math.round(wrapper.clientWidth || 420), 280);
    const height = Math.max(Math.round(width * 0.34), 140);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    logicalSizeRef.current = { width, height };
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.2;
    drawBackground(ctx);

    if (!nextValue) return;

    const img = new Image();
    img.onload = () => {
      drawBackground(ctx);
      ctx.drawImage(img, 0, 0, width, height);
    };
    img.src = nextValue;
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    resizeCanvas(value);
    const onResize = () => resizeCanvas(value);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (renderFrameRef.current != null) {
        window.cancelAnimationFrame(renderFrameRef.current);
        renderFrameRef.current = null;
      }
    };
  }, [value]);

  function pos(e: any) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function redrawStroke(ctx: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>) {
    if (points.length === 0) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    if (points.length === 1) {
      ctx.lineTo(points[0].x + 0.1, points[0].y + 0.1);
      ctx.stroke();
      return;
    }
    for (let index = 1; index < points.length - 1; index += 1) {
      const current = points[index];
      const next = points[index + 1];
      const midX = (current.x + next.x) / 2;
      const midY = (current.y + next.y) / 2;
      ctx.quadraticCurveTo(current.x, current.y, midX, midY);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }

  function renderCurrentStroke() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawBackground(ctx);
    const snapshotCanvas = snapshotCanvasRef.current;
    const { width, height } = logicalSizeRef.current;
    if (snapshotCanvas) {
      ctx.drawImage(snapshotCanvas, 0, 0, width, height);
    }
    redrawStroke(ctx, pointsRef.current);
  }

  function queueStrokeRender() {
    if (typeof window === "undefined" || renderFrameRef.current != null) return;
    renderFrameRef.current = window.requestAnimationFrame(() => {
      renderFrameRef.current = null;
      renderCurrentStroke();
    });
  }

  function start(e: any) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawingRef.current = true;
    historyRef.current.push(canvas.toDataURL("image/png"));
    const snapshot = document.createElement("canvas");
    snapshot.width = canvas.width;
    snapshot.height = canvas.height;
    const snapshotCtx = snapshot.getContext("2d");
    if (snapshotCtx) {
      snapshotCtx.drawImage(canvas, 0, 0);
      snapshotCanvasRef.current = snapshot;
    }
    const p = pos(e);
    pointsRef.current = [p];
    canvas.setPointerCapture(e.pointerId);
  }

  function move(e: any) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const currentPoint = pos(e);
    pointsRef.current = [...pointsRef.current, currentPoint];
    queueStrokeRender();
  }

  function end(e: any) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (typeof window !== "undefined" && renderFrameRef.current != null) {
      window.cancelAnimationFrame(renderFrameRef.current);
      renderFrameRef.current = null;
    }
    renderCurrentStroke();
    pointsRef.current = [];
    snapshotCanvasRef.current = null;
    onChange(canvas.toDataURL("image/png"));
    canvas.releasePointerCapture(e.pointerId);
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground(ctx);
    historyRef.current = [];
    pointsRef.current = [];
    snapshotCanvasRef.current = null;
    onChange("");
  }

  function undo() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const previous = historyRef.current.pop();
    if (!previous) {
      clear();
      return;
    }
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawBackground(ctx);
      ctx.drawImage(img, 0, 0, canvas.clientWidth, canvas.clientHeight);
      onChange(canvas.toDataURL("image/png"));
    };
    img.src = previous;
  }

  return (
    <div>
      {showLabel ? <label className="jobs-new-label">{label}</label> : null}
      <div ref={wrapperRef} className="card jobs-signature-pad" style={{ padding: 8 }}>
        <canvas
          ref={canvasRef}
          data-testid={testId}
          aria-label={label}
          style={{ width: "100%", border: "1px solid #cbd5e1", borderRadius: 10, touchAction: "none", background: "#fff" }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
        />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="button secondary" type="button" onClick={undo}>Undo</button>
        <button className="button secondary" type="button" onClick={clear}>Clear</button>
      </div>
    </div>
  );
}

const __mtDebugTenantSettings = __mtIsOn(process.env.NEXT_PUBLIC_DEBUG_TENANT_SETTINGS);
const wheelKeys = ["wheel_nsf", "wheel_nsr", "wheel_osf", "wheel_osr", "wheel_spare"];
const DRAFT_STORAGE_KEY = "mytitan_wheels_draft_v1";

const guidedSteps = [
  { title: "Start here", subtitle: "Set the job details first." },
  { title: "Who is this for?", subtitle: "Add the customer and where the work happened." },
  { title: "What are you working on?", subtitle: "Add the technician, vehicle, and checks." },
  { title: "What did you do?", subtitle: "Capture the work that belongs with this job." },
  { title: "Photos", subtitle: "Keep any photos and notes with the job." },
  { title: "Finish up", subtitle: "Check totals, sign off, and send it on." },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function generateRef() {
  const d = new Date();
  return `WHEELS-${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function makePreviewURL(file: File) {
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    return null;
  }
  return URL.createObjectURL(file);
}

function revokePreviewURL(media?: SelectedMedia | null) {
  if (media?.previewUrl) {
    URL.revokeObjectURL(media.previewUrl);
  }
}

function fileMeta(file: File) {
  return { name: file.name, type: file.type || "application/octet-stream" };
}

function extensionFor(file: File, fallback = "bin") {
  const fromName = file.name.split(".").pop();
  if (fromName && fromName !== file.name) return fromName.toLowerCase();
  if (file.type.includes("/")) return file.type.split("/")[1].toLowerCase();
  return fallback;
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

async function compressImageFile(file: File, quality = 0.85) {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () => reject(new Error("Failed to load image"));
      next.src = objectUrl;
    });
    const maxDimension = 1800;
    const scale = Math.min(1, maxDimension / Math.max(image.width || 1, image.height || 1));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function readFileAsDataURL(file: File, opts?: { compressImage?: boolean; quality?: number }) {
  if (opts?.compressImage && file.type.startsWith("image/")) {
    const compressed = await compressImageFile(file, opts.quality ?? 0.85);
    if (compressed) return compressed;
  }
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function safeReadDraft(): DraftSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftSnapshot;
    if (!parsed || typeof parsed !== "object" || !parsed.formData) return null;
    return parsed;
  } catch {
    return null;
  }
}

export default function NewJobPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const beforeFileInputRef = useRef<HTMLInputElement>(null);
  const afterFileInputRef = useRef<HTMLInputElement>(null);
  const torqueFileInputRef = useRef<HTMLInputElement>(null);
  const { settings } = useTenantSettings();
  const declarationText = useMemo(() => getJobDeclarationText(settings), [settings]);
  const workspaceJobForms = useMemo(() => getWorkspaceJobForms(settings), [settings]);
  const workspaceServiceTypes = useMemo(() => getActiveWorkspaceServiceTypes(settings), [settings]);
  const [pricingPresets, setPricingPresets] = useState<PricingPreset[]>([]);
  const [formData, setFormData] = useState<Record<string, any>>({
    jobReference: generateRef(),
    jobDate: todayIso(),
    jobStartDate: todayIso(),
    completedDate: todayIso(),
    jobCompletedDate: todayIso(),
    jobType: "Standard",
    paymentStatus: "UNPAID",
    paymentMethod: "CARD",
    vatRate: "20",
    invoiceDate: todayIso(),
    quantity: 1,
    serviceQuantity: 1,
    pricePerWheelMode: false,
    declarationConsent: declarationText,
  });
  const [torqueFile, setTorqueFile] = useState<SelectedMedia | null>(null);
  const [beforeFiles, setBeforeFiles] = useState<SelectedMedia[]>([]);
  const [afterFiles, setAfterFiles] = useState<SelectedMedia[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleReg, setVehicleReg] = useState("");
  const [saving, setSaving] = useState(false);
  const [draftSyncState, setDraftSyncState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const draftRequestSequence = useRef(0);
  const [error, setError] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [guidedMode, setGuidedModeState] = useState(false);
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [guidedSectionError, setGuidedSectionError] = useState("");
  const [resumePrompt, setResumePrompt] = useState<DraftSnapshot | null>(null);
  const [resumeMediaMessages, setResumeMediaMessages] = useState<string[]>([]);
  const [whatsAppNotice, setWhatsAppNotice] = useState<string>("");
  const [emailNotice, setEmailNotice] = useState<string>("");
  const [copyNotice, setCopyNotice] = useState<string>("");
  const [completeAfterSubmit, setCompleteAfterSubmit] = useState(false);
  const [priceMeta, setPriceMeta] = useState({ unitPriceEdited: false, serviceQuantityEdited: false });
  const [success, setSuccess] = useState<{ jobId: string; portalUrl?: string; pdfUrl?: string } | null>(null);
  const [signatureModal, setSignatureModal] = useState<null | "technician" | "customer">(null);
  const [signatureDraft, setSignatureDraft] = useState("");
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [partsQuery, setPartsQuery] = useState('');
  const [partsUsed, setPartsUsed] = useState<Array<{ stockItemId: string; sku: string; name: string; qty: number }>>([]);
  const [tradeAccountLoaded, setTradeAccountLoaded] = useState(false);

  const wheelsFeature = isWheelsFormV1Enabled() && ((settings?.primaryTrade || "").trim().toUpperCase() === "WHEELS");
  
  const debugTenantSettings = ((process.env.NEXT_PUBLIC_DEBUG_TENANT_SETTINGS || "").trim().toLowerCase() === "on" || (process.env.NEXT_PUBLIC_DEBUG_TENANT_SETTINGS || "").trim().toLowerCase() === "true" || (process.env.NEXT_PUBLIC_DEBUG_TENANT_SETTINGS || "").trim().toLowerCase() === "1");
const automationEnabled = wheelsFeature && isWheelsAutomationV1Enabled();
  const inventoryEnabled = isInventoryV1Enabled();
  const selectedServiceTypeId = String(formData.serviceTypeId || "");
  const selectedServiceType = useMemo(
    () => workspaceServiceTypes.find((item) => item.id === selectedServiceTypeId) || null,
    [workspaceServiceTypes, selectedServiceTypeId],
  );
  const runtimeJobFormSections = useMemo(() => {
    const sections = Array.isArray(workspaceJobForms.sections) ? workspaceJobForms.sections : [];
    const fields = Array.isArray(workspaceJobForms.fields) ? workspaceJobForms.fields : [];
    return sections
      .filter(
        (section) =>
          section.visible !== false &&
          String(section.title || "").trim() &&
          fieldMatchesServiceType(section.serviceTypeIds, selectedServiceTypeId),
      )
      .map((section) => ({
        ...section,
        fields: fields.filter(
          (field) =>
            field.sectionId === section.id &&
            String(field.key || "").trim() &&
            String(field.label || "").trim() &&
            field.visible !== false &&
            fieldMatchesServiceType(field.serviceTypeIds, selectedServiceTypeId),
        ),
      }))
      .filter((section) => section.fields.length > 0);
  }, [workspaceJobForms.fields, workspaceJobForms.sections, selectedServiceTypeId]);
  const runtimeHasRequiredFields = useMemo(
    () =>
      runtimeJobFormSections.some((section) =>
        section.fields.some((field: WorkspaceJobFormField) => field.required === true),
      ),
    [runtimeJobFormSections],
  );

  useEffect(() => {
    setFormData((prev) => {
      if (prev.declarationConsent === declarationText) return prev;
      return { ...prev, declarationConsent: declarationText };
    });
  }, [declarationText]);

  useEffect(() => {
    if (workspaceServiceTypes.length === 0) return;
    setFormData((prev) => {
      const currentId = String(prev.serviceTypeId || "").trim();
      if (currentId && workspaceServiceTypes.some((item) => item.id === currentId)) return prev;
      const next = workspaceServiceTypes[0];
      return {
        ...prev,
        serviceTypeId: next.id,
        serviceTypeName: next.name,
        serviceName: String(prev.serviceName || "").trim() || next.name,
      };
    });
  }, [workspaceServiceTypes]);

  useEffect(() => {
    if (!router.isReady) return;
    setGuidedModeState(resolveGuidedMode(router.query.guided));
    if (typeof router.query.customerName === "string") setCustomerName(router.query.customerName);
    if (typeof router.query.customerEmail === "string") setCustomerEmail(router.query.customerEmail);
    if (typeof router.query.customerPhone === "string") setCustomerPhone(router.query.customerPhone);
  }, [router.isReady, router.query.guided]);

  useEffect(() => {
    if (!router.isReady) return;
    const tradeAccountId = typeof router.query.tradeAccountId === "string" ? router.query.tradeAccountId : "";
    if (!tradeAccountId || tradeAccountLoaded) return;
    apiFetch(`/trade-accounts/${tradeAccountId}`)
      .then((payload: any) => {
        const account = payload?.account || payload || {};
        setTradeAccountLoaded(true);
        setFormData((prev) => ({
          ...prev,
          tradeAccountId,
          customerTradeName: prev.customerTradeName || account.name || "",
          customerName: prev.customerName || account.name || "",
          tradeName: prev.tradeName || account.name || "",
          tradeContactName: prev.tradeContactName || account.contactName || "",
          customerEmail: prev.customerEmail || account.contactEmail || account.billingEmail || "",
          customerPhone: prev.customerPhone || account.contactPhone || account.contactMobile || account.billingPhone || account.billingMobile || "",
          contactMobile: prev.contactMobile || account.contactMobile || "",
          vatNumber: prev.vatNumber || account.vatNumber || "",
          companyNumber: prev.companyNumber || account.companyNumber || "",
          addressLine1: prev.addressLine1 || account.businessAddressLine1 || "",
          addressLine2: prev.addressLine2 || account.businessAddressLine2 || "",
          city: prev.city || account.businessCity || "",
          town: prev.town || account.businessCity || "",
          postcode: prev.postcode || account.businessPostcode || "",
          country: prev.country || account.businessCountry || "",
          billingContactName: prev.billingContactName || account.billingContactName || "",
          billingEmail: prev.billingEmail || account.billingEmail || "",
          billingPhone: prev.billingPhone || account.billingPhone || "",
          billingMobile: prev.billingMobile || account.billingMobile || "",
          billingAddressLine1: prev.billingAddressLine1 || account.billingAddressLine1 || "",
          billingAddressLine2: prev.billingAddressLine2 || account.billingAddressLine2 || "",
          billingCity: prev.billingCity || account.billingCity || "",
          billingPostcode: prev.billingPostcode || account.billingPostcode || "",
          billingCountry: prev.billingCountry || account.billingCountry || "",
          secondaryContactName: prev.secondaryContactName || account.secondaryContactName || "",
          secondaryContactEmail: prev.secondaryContactEmail || account.secondaryContactEmail || "",
          secondaryContactPhone: prev.secondaryContactPhone || account.secondaryContactPhone || "",
          secondaryContactMobile: prev.secondaryContactMobile || account.secondaryContactMobile || "",
        }));
        setCustomerName((prev) => prev || account.name || "");
        setCustomerEmail((prev) => prev || account.contactEmail || account.billingEmail || "");
        setCustomerPhone((prev) => prev || account.contactPhone || account.contactMobile || account.billingPhone || account.billingMobile || "");
      })
      .catch(() => setTradeAccountLoaded(true));
  }, [router.isReady, router.query.tradeAccountId, tradeAccountLoaded]);

  useEffect(() => {
    if (!automationEnabled) return;
    apiFetch("/pricing-presets")
      .then((data) => setPricingPresets(Array.isArray(data?.items) ? data.items : []))
      .catch(() => setPricingPresets([]));
  }, [automationEnabled]);

  useEffect(() => {
    if (!inventoryEnabled) return;
    apiFetch(`/inventory/items?locationId=all&q=${encodeURIComponent(partsQuery)}`)
      .then((data) => setStockItems(Array.isArray(data) ? data : []))
      .catch(() => setStockItems([]));
  }, [inventoryEnabled, partsQuery]);

  useEffect(() => {
    const wheelSelections = wheelKeys.filter((key) => Boolean(formData[key]));
    const wheelCount = computeWheelCount(wheelSelections);
    const wheelPositions = selectedWheelPositions(formData);
    setFormData((prev) => ({ ...prev, wheelCount, numberOfWheels: wheelCount, wheelPositions }));
  }, [formData.wheel_nsf, formData.wheel_nsr, formData.wheel_osf, formData.wheel_osr, formData.wheel_spare]);

  useEffect(() => {
    const nextServiceTypes = selectedServiceTypes(formData, selectedServiceType);
    setFormData((prev) => {
      const current = Array.isArray(prev.serviceTypes) ? prev.serviceTypes.map((item: any) => String(item || "").trim()).filter(Boolean) : [];
      if (current.join("|") === nextServiceTypes.join("|")) return prev;
      return { ...prev, serviceTypes: nextServiceTypes, services: nextServiceTypes };
    });
  }, [formData.serviceTypeName, formData.serviceTypes, formData.serviceName, selectedServiceType]);

  useEffect(() => {
    if (!automationEnabled) return;
    const wheelCount = Number(formData.wheelCount || 0);
    if (formData.pricePerWheelMode && wheelCount > 0) {
      setFormData((prev) => ({ ...prev, serviceQuantity: wheelCount, quantity: wheelCount }));
      setPriceMeta((prev) => ({ ...prev, serviceQuantityEdited: false }));
    }
  }, [automationEnabled, formData.pricePerWheelMode, formData.wheelCount]);

  useEffect(() => {
    if (String(formData.jobType || "").toLowerCase() !== "trade" && formData.saveTradeCustomer) {
      setFormData((prev) => ({ ...prev, saveTradeCustomer: false }));
    }
  }, [formData.jobType, formData.saveTradeCustomer]);

  useEffect(() => {
    const technicianName = String(formData.technicianName || "").trim();
    if (!technicianName) return;
    setFormData((prev) => {
      if (String(prev.technicianSignatureName || "").trim()) return prev;
      return { ...prev, technicianSignatureName: technicianName };
    });
  }, [formData.technicianName]);

  useEffect(() => {
    const customerSignatory =
      String(formData.customerSignatureName || "").trim() ||
      String(formData.tradeContactName || "").trim() ||
      String(formData.customerTradeName || formData.customerName || customerName || "").trim();
    if (!customerSignatory) return;
    setFormData((prev) => {
      if (String(prev.customerSignatureName || "").trim()) return prev;
      return { ...prev, customerSignatureName: customerSignatory };
    });
  }, [formData.customerSignatureName, formData.tradeContactName, formData.customerTradeName, formData.customerName, customerName]);

  useEffect(() => {
    const fallbackTemplate = settings?.whatsappTemplateDefault || "Hi {{name}}, your service for {{jobRef}} was completed on {{completedDate}}.";
    const name = String(formData.customerTradeName || formData.customerName || customerName || "Customer");
    const ref = String(formData.jobReference || "job");
    const completedDate = String(formData.jobCompletedDate || formData.completedDate || todayIso());
    const msg = buildWhatsAppMessage({ template: fallbackTemplate, name, jobRef: ref, completedDate });
    setFormData((prev) => ({
      ...prev,
      whatsappMessage: prev.whatsappMessage || msg,
      whatsappCompletionLink: prev.whatsappCompletionLink || "",
    }));
  }, [settings?.whatsappTemplateDefault, formData.customerName, formData.customerTradeName, formData.jobReference, formData.jobCompletedDate, customerName]);

  useEffect(() => {
    if (!automationEnabled) return;
    const serviceName = String(formData.serviceName || "").trim().toLowerCase();
    if (!serviceName || pricingPresets.length === 0) return;

    const preset = pricingPresets.find((entry) => entry.name.trim().toLowerCase() === serviceName || entry.key.trim().toLowerCase() === serviceName);
    if (!preset) return;

    const currentPrice = Number(formData.unitPrice || 0);
    const result = applyPricingPreset(currentPrice, preset.unitPrice, priceMeta.unitPriceEdited);
    if (result.unitPrice !== currentPrice) {
      setFormData((prev) => ({ ...prev, unitPrice: result.unitPrice }));
    }
  }, [automationEnabled, formData.serviceName, formData.unitPrice, pricingPresets, priceMeta.unitPriceEdited]);

  const guidedExperienceEnabled = wheelsFeature && guidedMode;
  const totalSteps = guidedSteps.length;
  const entrySource = typeof router.query.entry === "string" ? router.query.entry : "";
  const currentGuidedStep = guidedSteps[activeSectionIndex] || guidedSteps[0];
  const nextGuidedStep = guidedSteps[Math.min(activeSectionIndex + 1, totalSteps - 1)] || null;
  const workspaceLabel = String(settings?.companyName || customerName || formData.customerTradeName || formData.customerName || "Workspace").trim();
  const workspaceInitials =
    workspaceLabel
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "MT";
  const jobTypeOptions = useMemo(() => {
    const currentType = String(formData.jobType || "").trim();
    if (!currentType || JOB_TYPE_OPTIONS.includes(currentType as (typeof JOB_TYPE_OPTIONS)[number])) {
      return [...JOB_TYPE_OPTIONS];
    }
    return [currentType, ...JOB_TYPE_OPTIONS];
  }, [formData.jobType]);
  const showPartsSection =
    inventoryEnabled &&
    (!guidedExperienceEnabled || activeSectionIndex === totalSteps - 1 || partsUsed.length > 0 || partsQuery.trim().length > 0);

  useEffect(() => {
    if (!guidedExperienceEnabled || typeof window === "undefined") return;
    const draft = safeReadDraft();
    if (draft) {
      setResumePrompt(draft);
    }
  }, [guidedExperienceEnabled]);

  useEffect(() => {
    if (!guidedExperienceEnabled || !router.isReady) return;
    const trade = typeof router.query.resumeTrade === 'string' ? router.query.resumeTrade : 'WHEELS';
    apiFetch(`/drafts/jobs/${encodeURIComponent(String(trade || 'WHEELS').toUpperCase())}`)
      .then((serverDraft: any) => {
        if (serverDraft?.payload) {
          setResumePrompt({
            stepIndex: Number(serverDraft?.payload?.stepIndex || 0),
            formData: serverDraft.payload.formData || serverDraft.payload,
            torqueEvidenceMeta: serverDraft?.payload?.torqueEvidenceMeta || null,
            beforePhotosMeta: Array.isArray(serverDraft?.payload?.beforePhotosMeta) ? serverDraft.payload.beforePhotosMeta : [],
            afterPhotosMeta: Array.isArray(serverDraft?.payload?.afterPhotosMeta) ? serverDraft.payload.afterPhotosMeta : [],
            savedAt: serverDraft.updatedAt || new Date().toISOString(),
          });
        }
      })
      .catch(() => {
        // local fallback remains active
      });
  }, [guidedExperienceEnabled, router.isReady, router.query.resumeTrade]);

  useEffect(() => {
    return () => {
      revokePreviewURL(torqueFile);
      beforeFiles.forEach((item) => revokePreviewURL(item));
      afterFiles.forEach((item) => revokePreviewURL(item));
    };
  }, [torqueFile, beforeFiles, afterFiles]);

  function setField(key: string, value: any, options?: { userEdited?: boolean }) {
    setFormData((prev) => {
      if (key === "serviceTypeId") {
        const nextServiceType = workspaceServiceTypes.find((item) => item.id === value) || null;
        return {
          ...prev,
          serviceTypeId: value,
          serviceTypeName: nextServiceType?.name || "",
          serviceName: nextServiceType?.name || prev.serviceName,
          serviceTypes: nextServiceType?.name ? [nextServiceType.name] : prev.serviceTypes,
          services: nextServiceType?.name ? [nextServiceType.name] : prev.services,
        };
      }
      return { ...prev, [key]: value };
    });

    if (options?.userEdited) {
      if (key === "unitPrice") {
        setPriceMeta((prev) => ({ ...prev, unitPriceEdited: true }));
      }
      if (key === "serviceQuantity" || key === "quantity") {
        setPriceMeta((prev) => ({ ...prev, serviceQuantityEdited: true }));
      }
    }

    if (key === "jobDate") {
      setFormData((prev) => ({ ...prev, jobStartDate: value || "" }));
    }
    if (key === "completedDate") {
      setFormData((prev) => ({ ...prev, jobCompletedDate: value || "" }));
    }

    if (key === "customerName" || key === "customerTradeName") {
      setCustomerName(value || "");
      if (key === "customerTradeName") {
        setFormData((prev) => ({ ...prev, customerName: value || "" }));
      }
    }
    if (key === "customerEmail") setCustomerEmail(value || "");
    if (key === "customerPhone") setCustomerPhone(value || "");

    if (key === "vehicleMake") setVehicleMake(value || "");
    if (key === "vehicleModel") setVehicleModel(value || "");
    if (key === "vehicleReg" || key === "carRegOrChassis") {
      setVehicleReg(value || "");
      if (key === "carRegOrChassis") {
        setFormData((prev) => ({ ...prev, vehicleReg: value || "", registration: value || "" }));
      }
    }
    if (key === "vehicleReg") {
      setFormData((prev) => ({ ...prev, registration: value || "" }));
    }
    if (key === "vehicleColour" || key === "vehicleColor") {
      setFormData((prev) => ({ ...prev, vehicleColour: value || "" }));
    }

    if (key === "city") {
      setFormData((prev) => ({ ...prev, town: value || "" }));
    }
  }

  function buildDraft(stepIndex = activeSectionIndex): DraftSnapshot {
    const draftForm = { ...formData };
    delete draftForm.technicianSignature;
    delete draftForm.customerSignature;
    delete draftForm.beforePhotos;
    delete draftForm.afterPhotos;
    delete draftForm.torqueEvidence;
    delete draftForm.torqueEvidenceLink;

    return {
      stepIndex,
      formData: draftForm,
      torqueEvidenceMeta: torqueFile ? { present: true, ...fileMeta(torqueFile.file) } : null,
      beforePhotosMeta: beforeFiles.map((item) => fileMeta(item.file)),
      afterPhotosMeta: afterFiles.map((item) => fileMeta(item.file)),
      savedAt: new Date().toISOString(),
    };
  }

  async function persistDraft(stepIndex = activeSectionIndex) {
    if (!guidedExperienceEnabled || typeof window === "undefined") return true;
    const payload = buildDraft(stepIndex);
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
    const requestId = draftRequestSequence.current + 1;
    draftRequestSequence.current = requestId;
    setDraftSyncState('saving');
    try {
      await apiFetch('/drafts/jobs', {
        method: 'PUT',
        body: JSON.stringify({
          trade: String(formData.tradeCode || 'WHEELS').toUpperCase(),
          payload,
        }),
      });
      if (draftRequestSequence.current === requestId) {
        setDraftSyncState('saved');
      }
      return true;
    } catch {
      if (draftRequestSequence.current === requestId) {
        setDraftSyncState('error');
      }
      return false;
    }
  }

  function clearDraft() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    apiFetch(`/drafts/job/${encodeURIComponent(String(formData.tradeCode || 'WHEELS').toUpperCase())}`, { method: 'DELETE' }).catch(() => null);
  }

  function clearMediaSelections() {
    revokePreviewURL(torqueFile);
    beforeFiles.forEach((item) => revokePreviewURL(item));
    afterFiles.forEach((item) => revokePreviewURL(item));
    setTorqueFile(null);
    setBeforeFiles([]);
    setAfterFiles([]);
    if (torqueFileInputRef.current) torqueFileInputRef.current.value = "";
    if (beforeFileInputRef.current) beforeFileInputRef.current.value = "";
    if (afterFileInputRef.current) afterFileInputRef.current.value = "";
  }

  function appendMediaFiles(nextFiles: FileList | null, setter: Dispatch<SetStateAction<SelectedMedia[]>>) {
    if (!nextFiles || nextFiles.length === 0) return;
    setMediaError("");
    const parsed = Array.from(nextFiles).map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      previewUrl: makePreviewURL(file),
    }));
    const tooLarge = parsed.find((item) => item.file.size > JOB_MEDIA_MAX_BYTES);
    if (tooLarge) {
      setMediaError(`${tooLarge.file.name} is too large. Keep uploads under ${formatFileSize(JOB_MEDIA_MAX_BYTES)}.`);
      parsed.forEach((item) => revokePreviewURL(item));
      return;
    }
    setter((prev) => [...prev, ...parsed].slice(0, 6));
  }

  function removeBeforeFile(id: string) {
    setBeforeFiles((prev) => {
      const target = prev.find((item) => item.id === id);
      revokePreviewURL(target);
      return prev.filter((item) => item.id !== id);
    });
  }

  function removeAfterFile(id: string) {
    setAfterFiles((prev) => {
      const target = prev.find((item) => item.id === id);
      revokePreviewURL(target);
      return prev.filter((item) => item.id !== id);
    });
  }

  function setTorqueMedia(file: File | null) {
    revokePreviewURL(torqueFile);
    if (!file) {
      setTorqueFile(null);
      setMediaError("");
      return;
    }
    if (file.size > JOB_MEDIA_MAX_BYTES) {
      setMediaError(`${file.name} is too large. Keep uploads under ${formatFileSize(JOB_MEDIA_MAX_BYTES)}.`);
      setTorqueFile(null);
      return;
    }
    setMediaError("");
    setTorqueFile({
      id: `${Date.now()}-${Math.random()}`,
      file,
      previewUrl: makePreviewURL(file),
    });
  }

  function getMissingConfiguredFields() {
    const missing: string[] = [];
    for (const section of runtimeJobFormSections) {
      for (const field of section.fields as WorkspaceJobFormField[]) {
        if (field.required !== true) continue;
        const value = formData[field.key];
        if (field.type === "checkbox") {
          if (!value) missing.push(field.label);
          continue;
        }
        if (Array.isArray(value)) {
          if (value.length === 0) missing.push(field.label);
          continue;
        }
        if (String(value ?? "").trim().length === 0) {
          missing.push(field.label);
        }
      }
    }
    return missing;
  }

  function validateGuidedStep(stepIndex: number) {
    const humanError = (message: string) => {
      setGuidedSectionError(message);
      return false;
    };

    if (stepIndex === 0) {
      if (!String(formData.jobReference || "").trim()) return humanError("Please enter a job reference.");
      if (!String(formData.jobStartDate || formData.jobDate || "").trim()) return humanError("Please choose the job start date.");
      if (!String(formData.jobType || "").trim()) return humanError("Please choose a job type.");
      return true;
    }

    if (stepIndex === 1) {
      if (!String(formData.customerTradeName || formData.customerName || customerName || "").trim()) {
        return humanError("Please enter customer or trade name.");
      }
      if (!String(formData.customerPhone || customerPhone || "").trim()) return humanError("Please enter a phone number.");
      if (!String(formData.customerEmail || customerEmail || "").trim()) return humanError("Please enter an email address.");
      if (!String(formData.addressLine1 || "").trim()) return humanError("Please enter address line 1.");
      if (!String(formData.city || formData.town || "").trim()) return humanError("Please enter a city.");
      if (!String(formData.postcode || "").trim()) return humanError("Please enter a postcode.");
      return true;
    }

    if (stepIndex === 2) {
      if (!String(formData.technicianName || "").trim()) return humanError("Please enter technician name.");
      if (!String(formData.carMakeModel || `${vehicleMake} ${vehicleModel}`.trim() || "").trim()) {
        return humanError("Please enter car make and model.");
      }
      if (!String(formData.carRegOrChassis || formData.vehicleReg || vehicleReg || "").trim()) {
        return humanError("Please enter registration or chassis.");
      }
      if (!String(formData.torqueSetting || "").trim()) return humanError("Please enter torque setting.");
      return true;
    }

    if (stepIndex === 3) {
      const wheelSelected = wheelKeys.some((key) => Boolean(formData[key]));
      const looseSelected = Boolean(formData.looseWheels && formData.looseWheels !== "clear");
      const serviceSelected = Boolean(String(formData.serviceTypeId || formData.serviceName || "").trim());
      if (!wheelSelected && !looseSelected && !serviceSelected) {
        return humanError("Please select at least one wheel, loose wheel option, or service type.");
      }
      return true;
    }

    if (stepIndex === 4) {
      if (torqueFile && !(torqueFile.file.type.startsWith("image/") || torqueFile.file.type.startsWith("video/"))) {
        return humanError("Torque evidence must be an image or video file.");
      }
      if (torqueFile && torqueFile.file.size > JOB_MEDIA_MAX_BYTES) {
        return humanError(`Torque evidence must stay under ${formatFileSize(JOB_MEDIA_MAX_BYTES)}.`);
      }
      return true;
    }

    if (stepIndex === 5) {
      if (!String(formData.technicianSignature || "").trim()) {
        return humanError("Please add technician signature.");
      }
      if (!String(formData.customerSignature || "").trim()) {
        return humanError("Please add customer signature.");
      }
      return true;
    }

    return true;
  }

  function goNextSection() {
    if (guidedExperienceEnabled) {
      if (!validateGuidedStep(activeSectionIndex)) return;
      const nextIndex = Math.min(activeSectionIndex + 1, totalSteps - 1);
      persistDraft(nextIndex);
      setGuidedSectionError("");
      setActiveSectionIndex(nextIndex);
    }
  }

  function goBackSection() {
    const prevIndex = Math.max(activeSectionIndex - 1, 0);
    persistDraft(prevIndex);
    setGuidedSectionError("");
    setActiveSectionIndex(prevIndex);
  }

  function disableGuidedMode() {
    setGuidedMode(false);
    setGuidedModeState(false);
    if (typeof window === "undefined") return;
    const nextQuery = {
      ...router.query,
      guided: "0",
    };
    router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
  }

  function resumeDraft() {
    if (!resumePrompt) return;

    const resumeData = { ...resumePrompt.formData };
    if (!resumeData.jobReference) resumeData.jobReference = generateRef();
    if (!resumeData.jobDate && !resumeData.jobStartDate) {
      resumeData.jobDate = todayIso();
      resumeData.jobStartDate = todayIso();
    }
    if (!resumeData.completedDate && !resumeData.jobCompletedDate) {
      resumeData.completedDate = todayIso();
      resumeData.jobCompletedDate = todayIso();
    }

    setFormData((prev) => ({ ...prev, ...resumeData }));
    setCustomerName(String(resumeData.customerTradeName || resumeData.customerName || ""));
    setCustomerEmail(String(resumeData.customerEmail || ""));
    setCustomerPhone(String(resumeData.customerPhone || ""));
    setVehicleMake(String(resumeData.vehicleMake || resumeData.carMakeModel || ""));
    setVehicleModel(String(resumeData.vehicleModel || ""));
    setVehicleReg(String(resumeData.vehicleReg || resumeData.carRegOrChassis || ""));
    setActiveSectionIndex(Math.max(0, Math.min(totalSteps - 1, Number(resumePrompt.stepIndex || 0))));
    clearMediaSelections();

    const hints: string[] = ["Please re-upload files before submit."];
    if (resumePrompt.torqueEvidenceMeta?.present) {
      hints.push(`Previously selected: ${resumePrompt.torqueEvidenceMeta.name} (re-upload required)`);
    }
    for (const meta of resumePrompt.beforePhotosMeta || []) {
      hints.push(`Previously selected: ${meta.name} (re-upload required)`);
    }
    for (const meta of resumePrompt.afterPhotosMeta || []) {
      hints.push(`Previously selected: ${meta.name} (re-upload required)`);
    }
    setResumeMediaMessages(hints);
    setResumePrompt(null);
  }

  function discardDraft() {
    clearDraft();
    setResumePrompt(null);
    setResumeMediaMessages([]);
  }

  async function saveAndExit() {
    const saved = await persistDraft(activeSectionIndex);
    if (!saved) {
      setGuidedSectionError("Draft save failed. Keep this tab open and try again.");
      return;
    }
    setGuidedSectionError("");
    await router.push("/dashboard");
  }

  useEffect(() => {
    if (!guidedExperienceEnabled) return;
    const timer = setTimeout(() => {
      void persistDraft(activeSectionIndex);
    }, 3000);
    return () => clearTimeout(timer);
  }, [guidedExperienceEnabled, activeSectionIndex, formData, beforeFiles.length, afterFiles.length, torqueFile?.id]);

  function triggerMarkComplete() {
    const completed = String(formData.jobCompletedDate || formData.completedDate || "").trim() || todayIso();
    const message = buildWhatsAppMessage({
      template: settings?.whatsappTemplateDefault || "Hi {{name}}, your service for {{jobRef}} was completed on {{completedDate}}.",
      name: String(formData.customerTradeName || formData.customerName || customerName || "Customer"),
      jobRef: String(formData.jobReference || "job"),
      completedDate: completed,
    });

    setFormData((prev) => ({
      ...prev,
      jobCompletedDate: completed,
      completedDate: completed,
      whatsappMessage: prev.whatsappMessage || message,
    }));

    setCompleteAfterSubmit(true);
    setEmailNotice("");
    setCopyNotice("");
    formRef.current?.requestSubmit();
  }

  function renderConfiguredField(field: WorkspaceJobFormField) {
    const value = formData[field.key] ?? "";

    if (field.type === "textarea") {
      return (
        <div key={field.id}>
          <JobFormLabel label={field.label} hint={field.helpText} hintTestId={`job-form-help-${field.key}`} />
          <textarea data-testid={`job-form-field-${field.key}`} className="input jobs-new-input" rows={3} value={value} onChange={(e) => setField(field.key, e.target.value)} />
        </div>
      );
    }

    if (field.type === "select") {
      return (
        <div key={field.id}>
          <JobFormLabel label={field.label} hint={field.helpText} hintTestId={`job-form-help-${field.key}`} />
          <select data-testid={`job-form-field-${field.key}`} className="input jobs-new-input" value={value} onChange={(e) => setField(field.key, e.target.value)}>
            <option value="">Choose…</option>
            {(field.options || []).map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
      );
    }

    if (field.type === "checkbox") {
      return (
        <label key={field.id} className="toggle-row" style={{ marginBottom: 10 }}>
          <input data-testid={`job-form-field-${field.key}`} type="checkbox" checked={Boolean(value)} onChange={(e) => setField(field.key, e.target.checked)} />
          <span>
            <strong>{field.label}</strong>
            {field.helpText ? <JobFormInfoHint label={field.label} hint={field.helpText} testId={`job-form-help-${field.key}`} /> : null}
          </span>
        </label>
      );
    }

    return (
      <div key={field.id}>
        <JobFormLabel label={field.label} hint={field.helpText} hintTestId={`job-form-help-${field.key}`} />
        <input
          data-testid={`job-form-field-${field.key}`}
          className="input jobs-new-input"
          type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
          value={value}
          onChange={(e) => setField(field.key, e.target.value)}
        />
      </div>
    );
  }

  function renderConfiguredServiceForm() {
    if (runtimeJobFormSections.length === 0) return null;
    return (
      <div className="card jobs-new-section-card jobs-new-section-card--compact" data-testid="job-form-builder-runtime">
        <div className="jobs-new-sectionHeading">
          <h3 style={{ marginTop: 0 }}>Service details</h3>
          <JobFormInfoHint
            label="Service details"
            hint="Owners manage these fields in workspace settings. Operators can fill them in here, but the job structure stays workspace-controlled."
            testId="job-form-help-service-details"
          />
        </div>

        {runtimeJobFormSections.map((section) => (
          <div key={section.id} className="jobs-new-configSection" data-testid={`job-form-section-${section.id}`}>
            <div className="jobs-new-sectionHeading jobs-new-sectionHeading--compact">
              <h4 style={{ marginBottom: 6 }}>{section.title}</h4>
              {section.description ? (
                <JobFormInfoHint
                  label={section.title}
                  hint={section.description}
                  testId={`job-form-help-section-${section.id}`}
                />
              ) : null}
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {section.fields.map((field: WorkspaceJobFormField) => renderConfiguredField(field))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderServiceTypeSelectorCard() {
    if (workspaceServiceTypes.length === 0) return null;
    return (
      <div className="card jobs-new-section-card jobs-new-section-card--compact" data-testid="job-form-service-type-card">
        <div className="jobs-new-sectionHeading">
          <div>
            <h3 style={{ marginTop: 0, marginBottom: 4 }}>Service type</h3>
            <p className="muted" style={{ margin: 0 }}>Keep the active workspace service path visible throughout job entry.</p>
          </div>
        </div>
        <JobFormLabel label="Service type" />
        <select
          className="input jobs-new-input"
          data-testid="job-form-service-type-select"
          value={selectedServiceTypeId}
          onChange={(e) => setField("serviceTypeId", e.target.value)}
        >
          <option value="">Choose…</option>
          {workspaceServiceTypes.map((serviceType) => (
            <option key={serviceType.id} value={serviceType.id}>{serviceType.name}</option>
          ))}
        </select>
        {selectedServiceType?.description ? (
          <div className="jobs-new-inlineNote">{selectedServiceType.description}</div>
        ) : null}
      </div>
    );
  }

  function GuidedSectionNav({ position = "top" }: { position?: "top" | "bottom" }) {
    if (!guidedExperienceEnabled) return null;
    const isFinalStep = activeSectionIndex === totalSteps - 1;
    const isBottomNav = position === "bottom";
    const draftStateLabel =
      draftSyncState === "saving"
        ? "Saving draft..."
        : draftSyncState === "saved"
        ? "Draft saved. You can leave safely."
        : draftSyncState === "error"
        ? "Draft needs another try"
        : "Draft ready";
    const nextStepCopy = isFinalStep
      ? "Next: finish this job, then send it and take payment if needed."
      : `Next: ${nextGuidedStep?.title || "Continue to the next step"}.`;

    return (
      <div className={`jobs-new-guidedNav ${position === "bottom" ? "jobs-new-guidedNav--bottom" : ""}`} data-testid={`jobs-guided-nav-${position}`}>
        {!isBottomNav ? (
          <button className="button secondary" type="button" onClick={goBackSection} disabled={activeSectionIndex === 0}>
            Go back
          </button>
        ) : null}
        {isFinalStep ? (
          <button className="button jobs-new-submit" type="button" onClick={triggerMarkComplete} disabled={saving}>
            {saving && completeAfterSubmit ? "Finishing..." : "Finish and save"}
          </button>
        ) : (
          <button className="button jobs-new-submit" type="button" onClick={goNextSection}>
            {isBottomNav ? "Continue to next step" : "Save and continue"}
          </button>
        )}
        {!isBottomNav ? <button className="button secondary" type="button" onClick={saveAndExit}>Save and exit</button> : null}
        <div className="jobs-new-guidedNavStatus">
          <p className="muted jobs-new-guidedNavMeta">
            Step {activeSectionIndex + 1} of {totalSteps}: {currentGuidedStep.title}
          </p>
          <p className="muted jobs-new-guidedNavMeta">{nextStepCopy}</p>
          <p className="muted jobs-new-guidedNavMeta">{draftStateLabel}</p>
        </div>
        {draftSyncState === 'error' ? (
          <p className="muted jobs-new-guidedNavMeta" style={{ color: "#ffb84d" }}>
            Draft save failed. Keep this tab open and try again.
          </p>
        ) : null}
      </div>
    );
  }

  const totalsPreview = computeTotals({
    unitPrice: Number(formData.unitPrice || 0),
    qty: Number(formData.serviceQuantity || formData.quantity || 1),
    wheelCount: Number(formData.wheelCount || 0),
    pricePerWheel: Number(formData.pricePerWheel || 0),
    additionalServicePrice: Number(formData.additionalServicePrice || 0),
    discount: Number(formData.discount || 0),
    vatEnabled: Boolean(formData.vatEnabled),
    vatRate: Number(formData.vatRate || 0),
  });
  const customerDisplayName = String(formData.customerTradeName || formData.customerName || customerName || "").trim();
  const technicianSignatureName = String(formData.technicianSignatureName || formData.technicianName || "").trim();
  const customerSignatureName = String(
    formData.customerSignatureName ||
      formData.tradeContactName ||
      formData.customerTradeName ||
      formData.customerName ||
      customerName ||
      "",
  ).trim();
  const hasAnyProofMedia = Boolean(torqueFile || beforeFiles.length > 0 || afterFiles.length > 0);
  const hasWhatsAppDraft = String(formData.whatsappMessage || "").trim().length > 0;
  const pricingQuantity = Number(formData.serviceQuantity || formData.quantity || 0);
  const pricingUnitPrice = Number(formData.unitPrice || 0);
  const missingConfiguredFields = getMissingConfiguredFields();
  const readinessReasons: string[] = [];
  if (!String(formData.jobReference || "").trim()) readinessReasons.push("Add a job reference.");
  if (!String(formData.jobDate || formData.jobStartDate || "").trim()) readinessReasons.push("Choose the job date.");
  if (!String(formData.jobType || "").trim()) readinessReasons.push("Choose the job type.");
  if (!customerDisplayName) readinessReasons.push("Add the customer or trade name.");
  if (!String(formData.technicianName || "").trim()) readinessReasons.push("Add the technician name.");
  if (!String(formData.serviceName || formData.serviceTypeName || selectedServiceType?.name || "").trim()) readinessReasons.push("Add the service name.");
  if (!(pricingQuantity > 0)) readinessReasons.push("Set a service quantity above zero.");
  if (!(pricingUnitPrice > 0)) readinessReasons.push("Set a service unit price above zero.");
  if (missingConfiguredFields.length > 0) readinessReasons.push(`Complete required service details: ${missingConfiguredFields.join(", ")}.`);
  if (!technicianSignatureName || !String(formData.technicianSignature || "").trim()) readinessReasons.push("Capture technician sign-off.");
  if (!customerSignatureName || !String(formData.customerSignature || "").trim()) readinessReasons.push("Capture customer sign-off.");
  if (!hasWhatsAppDraft) readinessReasons.push("Add the customer WhatsApp follow-up draft.");
  const readinessState = readinessReasons.length === 0 ? "READY_FOR_HANDOFF" : "NOT_READY";

  async function submitLegacy(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const missingConfiguredFields = getMissingConfiguredFields();
    if (missingConfiguredFields.length > 0) {
      setError(`Please complete the required service fields: ${missingConfiguredFields.join(", ")}.`);
      return;
    }
    try {
      await apiFetch("/jobs", {
        method: "POST",
        body: JSON.stringify({
          customerName,
          customerEmail: customerEmail || undefined,
          customerPhone: customerPhone || undefined,
          vehicleMake: vehicleMake || undefined,
          vehicleModel: vehicleModel || undefined,
          vehicleReg: vehicleReg || undefined,
          jobType: formData.jobType || undefined,
          serviceName: formData.serviceName || formData.serviceTypeName || selectedServiceType?.name || undefined,
          laborCents: Number(formData.laborCents || 0),
          partsCents: Number(formData.partsCents || 0),
          miscCents: Number(formData.miscCents || 0),
          taxRateBps: Number(formData.taxRateBps || 0),
          formData: {
            ...formData,
            serviceTypeId: selectedServiceType?.id || formData.serviceTypeId || undefined,
            serviceTypeName: selectedServiceType?.name || formData.serviceTypeName || undefined,
          },
        }),
      });
      router.push("/dashboard/jobs");
    } catch (err: any) {
      setError(err.message || "Failed to create job");
    }
  }

  async function submitWheels(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMediaError("");

    if (guidedExperienceEnabled && !validateGuidedStep(5)) {
      setSaving(false);
      return;
    }

    const missingConfiguredFields = getMissingConfiguredFields();
    if (missingConfiguredFields.length > 0) {
      setSaving(false);
      setError(`Please complete the required service fields: ${missingConfiguredFields.join(", ")}.`);
      return;
    }

    if (!formData.jobReference || !formData.jobDate || !formData.jobType || !(formData.customerTradeName || formData.customerName || customerName)) {
      setSaving(false);
      setError("Please complete job reference, date, job type, and customer/trade name.");
      return;
    }

    const technicianSignatureName = String(formData.technicianSignatureName || formData.technicianName || "").trim();
    const customerSignatureName = String(
      formData.customerSignatureName ||
      formData.tradeContactName ||
      formData.customerTradeName ||
      formData.customerName ||
      customerName ||
      "",
    ).trim();
    if (!formData.technicianName || !technicianSignatureName || !formData.technicianSignature) {
      setSaving(false);
      setError("Technician name and signature are required.");
      return;
    }
    if (!customerSignatureName || !formData.customerSignature) {
      setSaving(false);
      setError("Customer name and signature are required.");
      return;
    }

    let guidedBeforeMedia: any[] = [];
    let guidedAfterMedia: any[] = [];
    let torqueEvidenceMedia: { data: string; filename: string; mimeType: string } | null = null;

    try {
      if (guidedExperienceEnabled) {
        guidedBeforeMedia = await Promise.all(
          beforeFiles.map(async (item, idx) => ({
            data: await readFileAsDataURL(item.file, { compressImage: item.file.type.startsWith("image/"), quality: 0.85 }),
            filename: `Before_${idx + 1}.${extensionFor(item.file, "jpeg")}`,
            mimeType: item.file.type || "application/octet-stream",
          })),
        );

        guidedAfterMedia = await Promise.all(
          afterFiles.map(async (item, idx) => ({
            data: await readFileAsDataURL(item.file, { compressImage: item.file.type.startsWith("image/"), quality: 0.85 }),
            filename: `After_${idx + 1}.${extensionFor(item.file, "jpeg")}`,
            mimeType: item.file.type || "application/octet-stream",
          })),
        );

        torqueEvidenceMedia = torqueFile
          ? {
              data: await readFileAsDataURL(torqueFile.file, { compressImage: torqueFile.file.type.startsWith("image/"), quality: 0.85 }),
              filename: `TorqueEvidence.${extensionFor(torqueFile.file, "jpeg")}`,
              mimeType: torqueFile.file.type || "application/octet-stream",
            }
          : null;
      }
    } catch (err: any) {
      setSaving(false);
      setMediaError(err?.message || "Unable to prepare media for upload.");
      return;
    }

    const payloadForm = {
      ...formData,
      jobReference: formData.jobReference || generateRef(),
      jobDate: formData.jobDate || formData.jobStartDate || todayIso(),
      siteLocation: String(formData.siteLocation || "").trim(),
      serviceTypeId: selectedServiceType?.id || formData.serviceTypeId || "",
      serviceTypeName: selectedServiceType?.name || formData.serviceTypeName || "",
      serviceTypes: selectedServiceTypes(formData, selectedServiceType),
      services: selectedServiceTypes(formData, selectedServiceType),
      customerName: formData.customerTradeName || formData.customerName || customerName,
      customerEmail,
      customerPhone,
      customerAddress: formatSingleLineAddress(formData),
      tradeAccountId: typeof formData.tradeAccountId === "string" ? formData.tradeAccountId : "",
      vehicleMake: formData.vehicleMake || formData.carMakeModel || vehicleMake,
      vehicleModel: formData.vehicleModel || vehicleModel,
      vehicleColour: formData.vehicleColour || formData.vehicleColor || "",
      vehicleReg: formData.vehicleReg || formData.carRegOrChassis || vehicleReg,
      registration: formData.vehicleReg || formData.carRegOrChassis || vehicleReg,
      beforePhotos: guidedBeforeMedia,
      afterPhotos: guidedAfterMedia,
      beforeMedia: guidedBeforeMedia,
      afterMedia: guidedAfterMedia,
      wheelPositions: selectedWheelPositions(formData),
      torqueEvidenceMedia,
      torqueEvidence: "",
      technicianSignatureName,
      customerSignatureName,
      wheelCount: Number(formData.wheelCount || 0),
      numberOfWheels: Number(formData.numberOfWheels || formData.wheelCount || 0),
      quantity: Number(formData.serviceQuantity || formData.quantity || 1),
      serviceQuantity: Number(formData.serviceQuantity || formData.quantity || 1),
      unitPrice: Number(formData.unitPrice || 0),
      pricePerWheel: Number(formData.pricePerWheel || 0),
      additionalServicesText: String(formData.additionalServicesText || "").trim(),
      additionalServicePrice: Number(formData.additionalServicePrice || 0),
      discount: Number(formData.discount || 0),
      vatEnabled: Boolean(formData.vatEnabled),
      vatRate: Number(formData.vatRate || 0),
      totalPrice: Number(totalsPreview.total.toFixed(2)),
      city: formData.city || formData.town || "",
      jobStartDate: formData.jobStartDate || formData.jobDate || "",
      jobCompletedDate: formData.jobCompletedDate || formData.completedDate || "",
      customerNotes: String(formData.customerNotes || formData.jobNotes || "").trim(),
      jobNotes: String(formData.jobNotes || formData.customerNotes || "").trim(),
      internalNotes: String(formData.internalNotes || "").trim(),
    };

    try {
      const created = await apiFetch("/jobs", {
        method: "POST",
        body: JSON.stringify({
          customerName: payloadForm.customerName,
          customerEmail: customerEmail || undefined,
          customerPhone: customerPhone || undefined,
          vehicleMake: payloadForm.vehicleMake || undefined,
          vehicleModel: payloadForm.vehicleModel || undefined,
          vehicleReg: payloadForm.vehicleReg || undefined,
          serviceName: (payloadForm as any).serviceName || (payloadForm as any).serviceTypeName || "Wheels Job",
          tradeCode: "WHEELS",
          tradeAccountId: typeof payloadForm.tradeAccountId === "string" ? payloadForm.tradeAccountId : undefined,
          jobType: (payloadForm as any).jobType,
          beforeMedia: (payloadForm as any).beforeMedia,
          afterMedia: (payloadForm as any).afterMedia,
          torqueEvidenceMedia: (payloadForm as any).torqueEvidenceMedia,
          completeAfterCreate: completeAfterSubmit,
          partAllocations: partsUsed.map((part) => ({
            stockItemId: part.stockItemId,
            quantity: Number(part.qty || 0),
            reason: "Allocated from submitted job sheet",
          })),
          formData: payloadForm,
        }),
      });

      const pdfUrl = created?.pdf?.pdfUrl || created?.pdf?.url || null;
      const tokenSource = typeof created?.pdf?.url === "string" ? created.pdf.url : "";
      const token = tokenSource.startsWith("/public/job/") ? tokenSource.split("/")[3] : null;
      const portalUrl = created?.pdf?.portalUrl || (token ? `/portal/job/${token}` : undefined);

      clearDraft();
      clearMediaSelections();
      setResumeMediaMessages([]);
      setSuccess({ jobId: created.id, portalUrl, pdfUrl });
      setPartsUsed([]);
      setEmailNotice(Array.isArray(created?.submissionWarnings) && created.submissionWarnings.length ? created.submissionWarnings.join(" ") : "");

      if (completeAfterSubmit) {
        const phone = String(payloadForm.customerPhone || "").replace(/[^\d+]/g, "");
        const completedDate = String((payloadForm as any).jobCompletedDate || (payloadForm as any).completedDate || todayIso()).trim();
        const message = buildWhatsAppMessage({
          template: String((payloadForm as any).whatsappMessage || "").trim() || settings?.whatsappTemplateDefault || undefined,
          name: String((payloadForm as any).customerTradeName || payloadForm.customerName || customerName || "Customer"),
          jobRef: String((payloadForm as any).jobReference || created?.jobRef || created?.id || "job"),
          completedDate,
          completionLink: portalUrl || undefined,
        });
        if (phone && message && typeof window !== "undefined") {
          window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
        }
        setCompleteAfterSubmit(false);
      }
    } catch (err: any) {
      setError(err.message || "Failed to create Wheels job");
      setCompleteAfterSubmit(false);
    } finally {
      setSaving(false);
    }
  }

  function addPart(item: any) {
    setPartsUsed((prev) => {
      if (prev.find((p) => p.stockItemId === item.id)) return prev;
      return [...prev, { stockItemId: item.id, sku: item.sku, name: item.name, qty: 1 }];
    });
  }

  function sendWhatsApp() {
    const phone = String(formData.customerPhone || customerPhone || "").replace(/[^\d+]/g, "");
    const message = String(formData.whatsappMessage || "").trim();
    if (!phone) {
      setWhatsAppNotice("Add a customer phone number first.");
      return;
    }
    if (!message) {
      setWhatsAppNotice("Add a message first.");
      return;
    }
    if (typeof window === "undefined") return;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setWhatsAppNotice("WhatsApp opened with your draft.");
  }

  function skipWhatsApp() {
    setWhatsAppNotice("Skipped for now. You can send it later from the job.");
  }

  async function copyPdfLink() {
    if (!success?.pdfUrl || typeof window === "undefined") return;
    try {
      await window.navigator.clipboard.writeText(success.pdfUrl);
      setCopyNotice("Summary PDF link copied.");
    } catch {
      setCopyNotice("Copy failed. Please copy from your browser address bar.");
    }
  }

  async function copyPortalLink() {
    if (!success?.portalUrl || typeof window === "undefined") return;
    try {
      await window.navigator.clipboard.writeText(success.portalUrl);
      setCopyNotice("Customer link copied.");
    } catch {
      setCopyNotice("Copy failed. Please copy the link from your browser address bar.");
    }
  }

  function sectionCard(title: string, children: React.ReactNode) {
    return (
      <div className="card jobs-new-section-card jobs-new-section-card--compact">
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        {children}
      </div>
    );
  }

  function toggleWheelSelection(key: string) {
    setField(key, !Boolean(formData[key]));
  }

  function toggleLooseWheel(option: typeof LOOSE_WHEEL_OPTIONS[number]) {
    setField("looseWheels", formData.looseWheels === option ? "" : option);
  }

  function readinessSummaryCard() {
    return (
      <div
        className={cx(
          "card",
          "jobs-new-readinessCard",
          readinessState === "READY_FOR_HANDOFF" ? "jobs-new-readinessCard--ready" : "jobs-new-readinessCard--notReady",
        )}
        data-testid="job-form-readiness-card"
      >
        <div className="jobs-new-sectionHeading">
          <div>
            <p className="jobs-new-readinessEyebrow">Ready to send</p>
            <h3 style={{ marginTop: 0, marginBottom: 4 }}>Before you finish</h3>
          </div>
          <span className={cx("badge", readinessState === "READY_FOR_HANDOFF" && "jobs-new-badge-ready", readinessState !== "READY_FOR_HANDOFF" && "warn")}>
            {readinessState === "READY_FOR_HANDOFF" ? "Ready" : "Waiting"}
          </span>
        </div>

        {readinessReasons.length ? (
          <div className="jobs-new-readinessReasons" data-testid="job-form-readiness-reasons">
            <strong>Still needed</strong>
            <ul>
              {readinessReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="jobs-new-readinessReasons jobs-new-readinessReasons--ready" data-testid="job-form-readiness-reasons">
            <strong>Ready to finish</strong>
            <p className="muted" style={{ margin: "6px 0 0 0" }}>Everything you need is in.</p>
          </div>
        )}
      </div>
    );
  }

  function completionLifecycleRows() {
    return [
      {
        label: "Done",
        value: "Work saved",
        detail: "The finished job has been saved from this form.",
      },
      {
        label: "Send",
        value: success?.portalUrl || success?.pdfUrl ? "Ready to send" : "Preparing",
        detail: success?.portalUrl
          ? "Open the customer page and send it when you are ready."
          : success?.pdfUrl
          ? "Open the summary PDF, then send it from the job."
          : "Stay on the job until the customer view is ready.",
      },
      {
        label: "Paid",
        value: "Next step",
        detail: "Payment stays with this job after you send it.",
      },
    ];
  }

  function automationCard() {
    if (!automationEnabled) return null;
    return (
      <div className="card" style={{ marginBottom: 16, padding: 16, border: "1px solid rgba(79, 209, 197, 0.35)" }}>
        <h3 style={{ marginTop: 0 }}>Finish and save</h3>
        <p className="muted">Save the work and keep the next step ready.</p>
        <button className="button" type="button" onClick={triggerMarkComplete} disabled={saving}>
          {saving && completeAfterSubmit ? "Finishing..." : "Finish and save"}
        </button>
      </div>
    );
  }

  function renderEvidenceMediaFields() {
    return (
      <>
        <label className="jobs-new-label">Torque proof</label>
        <input
          ref={torqueFileInputRef}
          data-testid="jobs-torque-upload"
          className="input jobs-new-input"
          type="file"
          accept="image/*,video/*"
          capture="environment"
          onChange={(e) => setTorqueMedia(e.target.files?.[0] || null)}
        />
        {torqueFile ? (
          <div className="card" style={{ padding: 12, marginTop: 8 }}>
            <p style={{ marginTop: 0, marginBottom: 8 }}>{torqueFile.file.name}</p>
            {torqueFile.file.type.startsWith("image/") && torqueFile.previewUrl ? (
              <img src={torqueFile.previewUrl} alt={torqueFile.file.name} style={{ width: 140, height: 100, objectFit: "cover", borderRadius: 8 }} />
            ) : null}
            {torqueFile.file.type.startsWith("video/") && torqueFile.previewUrl ? (
              <video src={torqueFile.previewUrl} controls style={{ width: 180, maxWidth: "100%" }} />
            ) : null}
            {!torqueFile.file.type.startsWith("image/") && !torqueFile.file.type.startsWith("video/") ? (
              <span className="muted">Video selected</span>
            ) : null}
            <div>
              <button
                type="button"
                className="button secondary"
                style={{ marginTop: 8 }}
                onClick={() => {
                  setTorqueMedia(null);
                  if (torqueFileInputRef.current) torqueFileInputRef.current.value = "";
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ) : null}

        <label style={{ marginTop: 12 }}>Before photos (up to 6)</label>
        <input
          ref={beforeFileInputRef}
          data-testid="jobs-before-upload"
          className="input jobs-new-input"
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={(e) => {
            appendMediaFiles(e.target.files, setBeforeFiles);
            e.currentTarget.value = "";
          }}
        />
        <button type="button" className="button secondary" style={{ marginTop: 8 }} onClick={() => beforeFileInputRef.current?.click()}>
          Add More Before Photos
        </button>
        <div className="jobs-new-mediaGrid">
          {beforeFiles.map((item) => (
            <div key={item.id} className="card jobs-new-mediaCard">
              {item.previewUrl ? (
                <img src={item.previewUrl} alt={item.file.name} style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 6 }} />
              ) : null}
              <p className="muted" style={{ margin: "8px 0" }}>{item.file.name}</p>
              <button type="button" className="button secondary" onClick={() => removeBeforeFile(item.id)}>Remove</button>
            </div>
          ))}
        </div>

        <label style={{ marginTop: 12 }}>After photos (up to 6)</label>
        <input
          ref={afterFileInputRef}
          data-testid="jobs-after-upload"
          className="input jobs-new-input"
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={(e) => {
            appendMediaFiles(e.target.files, setAfterFiles);
            e.currentTarget.value = "";
          }}
        />
        <button type="button" className="button secondary" style={{ marginTop: 8 }} onClick={() => afterFileInputRef.current?.click()}>
          Add More After Photos
        </button>
        <div className="jobs-new-mediaGrid">
          {afterFiles.map((item) => (
            <div key={item.id} className="card jobs-new-mediaCard">
              {item.previewUrl ? (
                <img src={item.previewUrl} alt={item.file.name} style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 6 }} />
              ) : null}
              <p className="muted" style={{ margin: "8px 0" }}>{item.file.name}</p>
              <button type="button" className="button secondary" onClick={() => removeAfterFile(item.id)}>Remove</button>
            </div>
          ))}
        </div>

        {resumeMediaMessages.length ? (
          <div style={{ marginTop: 12 }}>
            {resumeMediaMessages.map((message, idx) => (
              <p key={`${message}-${idx}`} className="muted" style={{ margin: 0 }}>{message}</p>
            ))}
          </div>
        ) : null}
      </>
    );
  }

  function renderWheelSelectionCard() {
    const selectedCount = Number(formData.wheelCount || 0);
    const looseWheelValue = String(formData.looseWheels || "").trim();

    return (
      <div className="card jobs-new-section-card jobs-new-section-card--compact" data-testid="job-form-wheel-selector">
        <div className="jobs-new-sectionHeading">
          <div>
            <h3 style={{ marginTop: 0, marginBottom: 4 }}>Wheel selection</h3>
            <p className="muted" style={{ margin: 0 }}>Pick the wheel positions on this job.</p>
          </div>
          <span className="jobs-new-kicker">{selectedCount} selected</span>
        </div>

        <div className="jobs-wheelGrid" role="group" aria-label="Wheel positions">
          {WHEEL_LAYOUT_ROWS.map((row, rowIndex) => (
            <div key={`wheel-row-${rowIndex}`} className={cx("jobs-wheelGridRow", row.length === 1 && "jobs-wheelGridRow--single")}>
              {row.map((wheel) => (
                <button
                  key={wheel.key}
                  type="button"
                  className={cx("jobs-wheelButton", Boolean(formData[wheel.key]) && "jobs-wheelButton--active")}
                  aria-pressed={Boolean(formData[wheel.key])}
                  onClick={() => toggleWheelSelection(wheel.key)}
                >
                  {wheel.label}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14 }}>
          <JobFormLabel label="Loose wheels" hint="Add any loose wheels that came with the job." hintTestId="job-form-help-loose-wheels" />
          <div className="jobs-chipRow" role="group" aria-label="Loose wheels">
            {LOOSE_WHEEL_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={cx("jobs-chipButton", looseWheelValue === option && "jobs-chipButton--active")}
                aria-pressed={looseWheelValue === option}
                onClick={() => toggleLooseWheel(option)}
              >
                {option.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function renderSignatureFields() {
    const technicianSigned = Boolean(String(formData.technicianSignature || "").trim());
    const customerSigned = Boolean(String(formData.customerSignature || "").trim());
    return (
      <>
        <div className="jobs-signatureGrid">
          <div className="jobs-signatureCard">
            <label className="jobs-new-label">Technician sign-off name</label>
            <input
              className="input jobs-new-input"
              value={formData.technicianSignatureName || formData.technicianName || ""}
              onChange={(e) => setField("technicianSignatureName", e.target.value)}
            />
            {technicianSigned ? (
              <img
                src={formData.technicianSignature || ""}
                alt="Technician signature preview"
                data-testid="jobs-signature-preview-technician"
                style={{ width: "100%", minHeight: 120, objectFit: "contain", background: "#fff", borderRadius: 14, border: "1px solid rgba(15, 23, 42, 0.08)" }}
              />
            ) : (
              <div className="jobs-new-readonlyBlock" style={{ minHeight: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
                Signature not captured yet.
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <button
                type="button"
                className="button secondary"
                data-testid="jobs-signature-open-technician"
                onClick={() => {
                  setSignatureDraft(String(formData.technicianSignature || ""));
                  setSignatureModal("technician");
                }}
              >
                {technicianSigned ? "Update technician signature" : "Capture technician signature"}
              </button>
              {technicianSigned ? (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setField("technicianSignature", "")}
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>
          <div className="jobs-signatureCard">
            <label className="jobs-new-label">Customer sign-off name</label>
            <input
              className="input jobs-new-input"
              value={formData.customerSignatureName || ""}
              onChange={(e) => setField("customerSignatureName", e.target.value)}
            />
            {customerSigned ? (
              <img
                src={formData.customerSignature || ""}
                alt="Customer signature preview"
                data-testid="jobs-signature-preview-customer"
                style={{ width: "100%", minHeight: 120, objectFit: "contain", background: "#fff", borderRadius: 14, border: "1px solid rgba(15, 23, 42, 0.08)" }}
              />
            ) : (
              <div className="jobs-new-readonlyBlock" style={{ minHeight: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
                Signature not captured yet.
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <button
                type="button"
                className="button secondary"
                data-testid="jobs-signature-open-customer"
                onClick={() => {
                  setSignatureDraft(String(formData.customerSignature || ""));
                  setSignatureModal("customer");
                }}
              >
                {customerSigned ? "Update customer signature" : "Capture customer signature"}
              </button>
              {customerSigned ? (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setField("customerSignature", "")}
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </>
    );
  }

  function renderSignatureModal() {
    if (!signatureModal) return null;
    const isTechnician = signatureModal === "technician";
    const fieldKey = isTechnician ? "technicianSignature" : "customerSignature";
    const title = isTechnician ? "Technician signature" : "Customer signature";
    return (
      <div
        data-testid="jobs-signature-modal"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 80,
          background: "rgba(15, 23, 42, 0.72)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
      >
        <div
          className="card"
          style={{
            width: "min(100%, 760px)",
            maxHeight: "100%",
            overflow: "auto",
            padding: 20,
            borderRadius: 20,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", marginBottom: 16 }}>
            <div>
              <h3 style={{ marginTop: 0, marginBottom: 6 }}>{title}</h3>
              <p className="muted" style={{ margin: 0 }}>Capture the signature in a larger signing area, then save it back to the job.</p>
            </div>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setSignatureModal(null);
                setSignatureDraft("");
              }}
            >
              Cancel
            </button>
          </div>
          <SignaturePad
            label={title}
            testId={isTechnician ? "jobs-signature-pad-technician" : "jobs-signature-pad-customer"}
            showLabel={false}
            value={signatureDraft}
            onChange={setSignatureDraft}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setSignatureModal(null);
                setSignatureDraft("");
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button"
              data-testid="jobs-signature-save"
              onClick={() => {
                setField(fieldKey, signatureDraft);
                setSignatureModal(null);
                setSignatureDraft("");
              }}
            >
              Save signature
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderDeclarationBlock() {
    return (
      <div className="card jobs-new-section-card jobs-new-section-card--compact">
        <div className="jobs-new-sectionHeading">
          <h3 style={{ marginTop: 0 }}>Declaration</h3>
          <JobFormInfoHint
            label="Declaration"
            hint="This wording is controlled in workspace settings and is stored with the signed record."
            testId="job-form-help-declaration"
          />
        </div>
        <div className="jobs-new-readonlyBlock">
          {formData.declarationConsent || declarationText}
        </div>
      </div>
    );
  }

  function renderNotesCard() {
    return sectionCard("Notes", (
      <JobFormDisclosure
        title="Add notes"
        summary="Customer notes and team notes."
        testId="job-form-disclosure-notes"
      >
        <JobFormLabel label="Customer notes" />
        <textarea className="input jobs-new-input" rows={3} placeholder="Anything the customer should see" value={formData.customerNotes || formData.jobNotes || ""} onChange={(e) => setField("customerNotes", e.target.value)} />

        <JobFormLabel label="Internal notes" />
        <textarea className="input jobs-new-input" rows={3} placeholder="Only for your team" value={formData.internalNotes || ""} onChange={(e) => setField("internalNotes", e.target.value)} />
      </JobFormDisclosure>
    ));
  }

  function renderStandardJobDetailsCard() {
    return sectionCard("Job details", (
      <>
        <JobFormLabel label="Job reference" hint="We created this for you. Change it if needed." hintTestId="job-form-help-job-reference" />
        <input className="input jobs-new-input" placeholder="Job reference" value={formData.jobReference || ""} onChange={(e) => setField("jobReference", e.target.value)} />

        <JobFormLabel label="Job start date" />
        <input className="input jobs-new-input" type="date" value={formData.jobStartDate || formData.jobDate || ""} onChange={(e) => setField("jobDate", e.target.value)} />

        <JobFormLabel label="Job completed date (optional)" />
        <input className="input jobs-new-input" type="date" value={formData.jobCompletedDate || formData.completedDate || ""} onChange={(e) => setField("completedDate", e.target.value)} />

        <JobFormLabel label="Job type" />
        <select className="input jobs-new-input" value={formData.jobType || ""} onChange={(e) => setField("jobType", e.target.value)}>
          <option value="">Choose...</option>
          {jobTypeOptions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>

        <JobFormLabel label="Site location" />
        <input className="input jobs-new-input" placeholder="Site or job address" value={formData.siteLocation || ""} onChange={(e) => setField("siteLocation", e.target.value)} />
      </>
    ));
  }

  function renderStandardCustomerDetailsCard() {
    return sectionCard("Who is this for?", (
      <>
        <input
          className="input jobs-new-input"
          aria-label="Customer or trade name"
          placeholder="Customer or trade name"
          value={formData.customerTradeName || formData.customerName || customerName || ""}
          onChange={(e) => setField("customerTradeName", e.target.value)}
        />

        <input className="input jobs-new-input" aria-label="Phone" placeholder="Phone" value={formData.customerPhone || customerPhone || ""} onChange={(e) => setField("customerPhone", e.target.value)} />

        <input className="input jobs-new-input" aria-label="Email" placeholder="Email" type="email" value={formData.customerEmail || customerEmail || ""} onChange={(e) => setField("customerEmail", e.target.value)} />

        <JobFormDisclosure
          title="More detail"
          summary="Contact name, address, and save for later."
          testId="job-form-disclosure-customer-more"
        >
          <label className="jobs-new-label">Trade contact name</label>
          <input className="input jobs-new-input" value={formData.tradeContactName || ""} onChange={(e) => setField("tradeContactName", e.target.value)} />

          <label className="jobs-new-label">Address line 1</label>
          <input className="input jobs-new-input" value={formData.addressLine1 || ""} onChange={(e) => setField("addressLine1", e.target.value)} />

          <label className="jobs-new-label">Address line 2</label>
          <input className="input jobs-new-input" value={formData.addressLine2 || ""} onChange={(e) => setField("addressLine2", e.target.value)} />

          <label className="jobs-new-label">City</label>
          <input className="input jobs-new-input" value={formData.city || formData.town || ""} onChange={(e) => setField("city", e.target.value)} />

          <label className="jobs-new-label">Postcode</label>
          <input className="input jobs-new-input" value={formData.postcode || ""} onChange={(e) => setField("postcode", e.target.value)} />

          <label className={cx("jobs-new-choice", Boolean(formData.saveTradeCustomer) && "jobs-new-choice--active")} style={{ marginTop: 10 }}>
            <input type="checkbox" checked={Boolean(formData.saveTradeCustomer)} onChange={(e) => setField("saveTradeCustomer", e.target.checked)} />
            <span>
              <strong>Save this customer</strong>
              <small>Use these details again next time.</small>
            </span>
          </label>
        </JobFormDisclosure>
      </>
    ));
  }

  function renderStandardVehicleDetailsCard() {
    return sectionCard("What are you working on?", (
      <>
        <input className="input jobs-new-input" aria-label="Technician name" placeholder="Technician name" value={formData.technicianName || ""} onChange={(e) => setField("technicianName", e.target.value)} />

        <input className="input jobs-new-input" aria-label="Car make and model" placeholder="Make and model" value={formData.carMakeModel || `${vehicleMake} ${vehicleModel}`.trim()} onChange={(e) => setField("carMakeModel", e.target.value)} />

        <input className="input jobs-new-input" aria-label="Vehicle make" placeholder="Make" value={formData.vehicleMake || vehicleMake || ""} onChange={(e) => setField("vehicleMake", e.target.value)} />

        <input className="input jobs-new-input" aria-label="Vehicle model" placeholder="Model" value={formData.vehicleModel || vehicleModel || ""} onChange={(e) => setField("vehicleModel", e.target.value)} />

        <input className="input jobs-new-input" aria-label="Vehicle colour" placeholder="Colour" value={formData.vehicleColour || ""} onChange={(e) => setField("vehicleColour", e.target.value)} />

        <input className="input jobs-new-input" aria-label="Registration or chassis" placeholder="Registration" value={formData.carRegOrChassis || formData.vehicleReg || vehicleReg || ""} onChange={(e) => setField("carRegOrChassis", e.target.value)} />

        <JobFormDisclosure
          title="Checks"
          summary="Torque and tyre pressure when needed."
          testId="job-form-disclosure-vehicle-checks"
        >
          <JobFormLabel label="Torque setting" hint="Numbers only. Example: 130." hintTestId="job-form-help-torque-setting" />
          <input className="input jobs-new-input" type="number" inputMode="decimal" min="0" step="0.1" value={formData.torqueSetting || ""} onChange={(e) => setField("torqueSetting", sanitizeNumericInput(e.target.value))} />

          <JobFormLabel label="Tyre pressure" />
          <input className="input jobs-new-input" type="number" inputMode="decimal" min="0" step="0.1" value={formData.tyrePressure || ""} onChange={(e) => setField("tyrePressure", sanitizeNumericInput(e.target.value))} />
        </JobFormDisclosure>
      </>
    ));
  }

  function renderCommercialCard() {
    return sectionCard("Pricing", (
      <>
        <input className="input jobs-new-input" aria-label="Service name" placeholder="What are you charging for?" value={formData.serviceName || ""} onChange={(e) => setField("serviceName", e.target.value)} />

        <div className="jobs-chipRow" role="group" aria-label="Pricing mode">
          <button
            type="button"
            className={cx("jobs-chipButton", !Boolean(formData.pricePerWheelMode) && "jobs-chipButton--active")}
            aria-pressed={!Boolean(formData.pricePerWheelMode)}
            onClick={() => setField("pricePerWheelMode", false)}
          >
            Total price
          </button>
          <button
            type="button"
            className={cx("jobs-chipButton", Boolean(formData.pricePerWheelMode) && "jobs-chipButton--active")}
            aria-pressed={Boolean(formData.pricePerWheelMode)}
            onClick={() => setField("pricePerWheelMode", true)}
          >
            Price per wheel
          </button>
        </div>

        <div className="jobs-new-inlineGrid jobs-new-inlineGrid--pricing">
          <div>
            <JobFormLabel label={Boolean(formData.pricePerWheelMode) ? "Price per wheel" : "Total job price"} />
            <input
              className="input jobs-new-input"
              aria-label={Boolean(formData.pricePerWheelMode) ? "Price per wheel" : "Service unit price"}
              placeholder={Boolean(formData.pricePerWheelMode) ? "Price per wheel" : "Service unit price"}
              type="number"
              value={Boolean(formData.pricePerWheelMode) ? formData.pricePerWheel || "" : formData.unitPrice || ""}
              onChange={(e) => setField(Boolean(formData.pricePerWheelMode) ? "pricePerWheel" : "unitPrice", e.target.value, { userEdited: true })}
            />
          </div>
          <div>
            <JobFormLabel label={Boolean(formData.pricePerWheelMode) ? "Wheels selected" : "Qty"} />
            <input
              className="input jobs-new-input"
              aria-label={Boolean(formData.pricePerWheelMode) ? "Wheels selected" : "Service quantity"}
              type="number"
              value={Boolean(formData.pricePerWheelMode) ? formData.wheelCount || 0 : formData.serviceQuantity || formData.quantity || 1}
              onChange={(e) => {
                if (Boolean(formData.pricePerWheelMode)) {
                  setField("wheelCount", e.target.value);
                } else {
                  setField("serviceQuantity", e.target.value, { userEdited: true });
                }
              }}
              readOnly={Boolean(formData.pricePerWheelMode)}
            />
          </div>
        </div>

        <p className="muted">Subtotal £{totalsPreview.subtotal.toFixed(2)} • VAT £{totalsPreview.vat.toFixed(2)} • Total £{totalsPreview.total.toFixed(2)}</p>

        <JobFormDisclosure
          title="More pricing"
          summary="Discounts, VAT, payment, invoice, and extra work."
          testId="job-form-disclosure-pricing-advanced"
        >
          <JobFormLabel label="Discount" />
          <input className="input jobs-new-input" type="number" value={formData.discount || ""} onChange={(e) => setField("discount", e.target.value)} />

          <JobFormLabel label="Extra work" />
          <textarea className="input jobs-new-input" rows={2} value={formData.additionalServicesText || ""} onChange={(e) => setField("additionalServicesText", e.target.value)} />

          <JobFormLabel label="Extra work price" />
          <input className="input jobs-new-input" type="number" value={formData.additionalServicePrice || ""} onChange={(e) => setField("additionalServicePrice", e.target.value)} />

          <label className="toggle-row" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={Boolean(formData.vatEnabled)} onChange={(e) => setField("vatEnabled", e.target.checked)} />
            <span>VAT enabled</span>
          </label>

          <JobFormLabel label="VAT rate (%)" />
          <input className="input jobs-new-input" type="number" value={formData.vatRate || ""} onChange={(e) => setField("vatRate", e.target.value)} />

          <JobFormLabel label="Invoice number (optional)" />
          <input className="input jobs-new-input" value={formData.invoiceNumber || ""} onChange={(e) => setField("invoiceNumber", e.target.value)} />

          <JobFormLabel label="Payment" />
          <select className="input jobs-new-input" value={formData.paymentStatus || "UNPAID"} onChange={(e) => setField("paymentStatus", e.target.value)}>
            <option value="UNPAID">UNPAID</option>
            <option value="PART_PAID">PART_PAID</option>
            <option value="PAID">PAID</option>
          </select>

          <JobFormLabel label="Payment method" />
          <select className="input jobs-new-input" value={formData.paymentMethod || "CARD"} onChange={(e) => setField("paymentMethod", e.target.value)}>
            <option value="CASH">CASH</option>
            <option value="CARD">CARD</option>
            <option value="BANK_TRANSFER">BANK_TRANSFER</option>
            <option value="STRIPE_LINK">STRIPE_LINK</option>
          </select>
        </JobFormDisclosure>
      </>
    ));
  }

  function renderSendToCustomerCard() {
    return (
      <div className="card jobs-new-section-card jobs-new-section-card--compact">
        <div className="jobs-new-sectionHeading">
          <div>
            <h3 style={{ marginTop: 0, marginBottom: 4 }}>Send to customer</h3>
            <p className="muted" style={{ margin: 0 }}>Keep the handoff ready while you finish the job.</p>
          </div>
          <JobFormInfoHint
            label="Send to customer"
            hint="Send this job to the customer after finishing."
            testId="job-form-help-send-to-customer"
          />
        </div>

        <JobFormLabel label="WhatsApp number" />
        <input
          className="input jobs-new-input"
          aria-label="WhatsApp number"
          placeholder="Customer phone"
          value={formData.customerPhone || customerPhone || ""}
          onChange={(e) => setField("customerPhone", e.target.value)}
        />

        <JobFormLabel
          label="WhatsApp message"
          hint="Keep this short. The customer link is added after the job is done."
          hintTestId="job-form-help-whatsapp-follow-up"
        />
        <textarea className="input jobs-new-input" rows={3} value={formData.whatsappMessage || ""} onChange={(e) => setField("whatsappMessage", e.target.value)} />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <button type="button" className="button" onClick={sendWhatsApp}>Open WhatsApp</button>
          <button type="button" className="button secondary" onClick={skipWhatsApp}>Skip</button>
        </div>
        {whatsAppNotice ? <p className="muted" style={{ marginBottom: 0 }}>{whatsAppNotice}</p> : null}
      </div>
    );
  }

  function renderGuidedStep() {
    const step = activeSectionIndex;

    if (step === 0) {
      return sectionCard("Job details", (
        <>
          <JobFormLabel label="Job reference" hint="We created this for you. Change it if needed." hintTestId="job-form-help-job-reference" />
          <input className="input jobs-new-input" value={formData.jobReference || ""} onChange={(e) => setField("jobReference", e.target.value)} />

          <JobFormLabel label="Job start date" />
          <input className="input jobs-new-input" type="date" value={formData.jobStartDate || formData.jobDate || ""} onChange={(e) => setField("jobDate", e.target.value)} />

          <JobFormLabel label="Job completed date (optional)" />
          <input className="input jobs-new-input" type="date" value={formData.jobCompletedDate || formData.completedDate || ""} onChange={(e) => setField("completedDate", e.target.value)} />

          <JobFormLabel label="Job type" />
          <select className="input jobs-new-input" value={formData.jobType || ""} onChange={(e) => setField("jobType", e.target.value)}>
            <option value="">Choose...</option>
            {jobTypeOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>

          <JobFormLabel label="Site location" />
          <input className="input jobs-new-input" value={formData.siteLocation || ""} onChange={(e) => setField("siteLocation", e.target.value)} />
        </>
      ));
    }

    if (step === 1) {
      return sectionCard("Who is this for?", (
        <>
          <input
            className="input jobs-new-input"
            aria-label="Customer or trade name"
            placeholder="Customer or trade name"
            value={formData.customerTradeName || formData.customerName || customerName || ""}
            onChange={(e) => setField("customerTradeName", e.target.value)}
          />

          <input className="input jobs-new-input" aria-label="Trade contact name" placeholder="Contact name" value={formData.tradeContactName || ""} onChange={(e) => setField("tradeContactName", e.target.value)} />

          <input className="input jobs-new-input" aria-label="Phone" placeholder="Phone" value={formData.customerPhone || customerPhone || ""} onChange={(e) => setField("customerPhone", e.target.value)} />

          <input className="input jobs-new-input" aria-label="Email" placeholder="Email" type="email" value={formData.customerEmail || customerEmail || ""} onChange={(e) => setField("customerEmail", e.target.value)} />

          <label className="jobs-new-label">Address line 1</label>
          <input className="input jobs-new-input" value={formData.addressLine1 || ""} onChange={(e) => setField("addressLine1", e.target.value)} />

          <label className="jobs-new-label">Address line 2</label>
          <input className="input jobs-new-input" value={formData.addressLine2 || ""} onChange={(e) => setField("addressLine2", e.target.value)} />

          <label className="jobs-new-label">City</label>
          <input className="input jobs-new-input" value={formData.city || formData.town || ""} onChange={(e) => setField("city", e.target.value)} />

          <label className="jobs-new-label">Postcode</label>
          <input className="input jobs-new-input" value={formData.postcode || ""} onChange={(e) => setField("postcode", e.target.value)} />

          <label className={cx("jobs-new-choice", Boolean(formData.saveTradeCustomer) && "jobs-new-choice--active")} style={{ marginTop: 10 }}>
            <input type="checkbox" checked={Boolean(formData.saveTradeCustomer)} onChange={(e) => setField("saveTradeCustomer", e.target.checked)} />
            <span>
              <strong>Save this customer</strong>
              <small>Use these details again next time.</small>
            </span>
          </label>
        </>
      ));
    }

    if (step === 2) {
      return sectionCard("What are you working on?", (
        <>
          <input className="input jobs-new-input" aria-label="Technician name" placeholder="Technician name" value={formData.technicianName || ""} onChange={(e) => setField("technicianName", e.target.value)} />

          <input className="input jobs-new-input" aria-label="Car make and model" placeholder="Make and model" value={formData.carMakeModel || `${vehicleMake} ${vehicleModel}`.trim()} onChange={(e) => setField("carMakeModel", e.target.value)} />

          <input className="input jobs-new-input" aria-label="Vehicle make" placeholder="Make" value={formData.vehicleMake || vehicleMake || ""} onChange={(e) => setField("vehicleMake", e.target.value)} />

          <input className="input jobs-new-input" aria-label="Vehicle model" placeholder="Model" value={formData.vehicleModel || vehicleModel || ""} onChange={(e) => setField("vehicleModel", e.target.value)} />

          <input className="input jobs-new-input" aria-label="Vehicle colour" placeholder="Colour" value={formData.vehicleColour || ""} onChange={(e) => setField("vehicleColour", e.target.value)} />

          <input className="input jobs-new-input" aria-label="Registration or chassis" placeholder="Registration" value={formData.carRegOrChassis || formData.vehicleReg || vehicleReg || ""} onChange={(e) => setField("carRegOrChassis", e.target.value)} />

          <JobFormLabel label="Torque setting" hint="Numbers only. Example: 130." hintTestId="job-form-help-torque-setting" />
          <input className="input jobs-new-input" type="number" inputMode="decimal" min="0" step="0.1" value={formData.torqueSetting || ""} onChange={(e) => setField("torqueSetting", sanitizeNumericInput(e.target.value))} />

          <JobFormLabel label="Tyre pressure" />
          <input className="input jobs-new-input" type="number" inputMode="decimal" min="0" step="0.1" value={formData.tyrePressure || ""} onChange={(e) => setField("tyrePressure", sanitizeNumericInput(e.target.value))} />
        </>
      ));
    }

    if (step === 3) {
      return (
        <>
          {renderWheelSelectionCard()}
          {renderConfiguredServiceForm() || sectionCard("Service details", (
            <p className="muted" style={{ marginTop: 0 }}>No extra job details are set up for this workspace.</p>
          ))}
        </>
      );
    }

    if (step === 4) {
      return (
        <>
          {renderNotesCard()}
          <div className="card jobs-new-section-card jobs-new-section-card--compact">
            <JobFormDisclosure
              title="Photos"
              summary="Photos and torque proof when needed."
              testId="job-form-disclosure-proof"
            >
              {renderEvidenceMediaFields()}
            </JobFormDisclosure>
          </div>
        </>
      );
    }

    return (
      <>
        {readinessSummaryCard()}
        {renderCommercialCard()}
        {renderSendToCustomerCard()}
        <div className="card jobs-new-section-card jobs-new-section-card--compact">
          <div className="jobs-new-sectionHeading">
            <div>
              <h3 style={{ marginTop: 0, marginBottom: 4 }}>Sign-off</h3>
              <p className="muted" style={{ margin: 0 }}>Technician and customer signatures stay with the finished job.</p>
            </div>
          </div>
          {renderSignatureFields()}
        </div>
        <div className="card jobs-new-section-card jobs-new-section-card--compact">
          <JobFormLabel label="Declaration" />
          <div className="jobs-new-readonlyBlock">{formData.declarationConsent || declarationText}</div>
        </div>
      </>
    );
  }
  if (!wheelsFeature) {
    return (
      <DashboardShell>
        <div className="jobs-new-shell">
          {__mtDebugTenantSettings ? (
          <div
            data-debug-tenant-settings="on"
            hidden
          >
            DEBUG_MARKER__TENANT_SETTINGS__ON{" "}
            settingsPrimaryTrade={String((settings as any)?.primaryTrade ?? "")}{" "}
            settingsTenantId={String((settings as any)?.tenantId ?? "")}{" "}
            settingsPlanId={String((settings as any)?.planId ?? "")}
          </div>
          ) : null}
          <OperatorPageHeader
            eyebrow="Create Job"
            title="Capture the job and keep work moving"
            subtitle="Use quick entry when you just need the customer, vehicle, and job basics in place."
            actions={[
              { label: "Start work", href: "/dashboard/work", variant: "secondary" },
            ]}
            stats={[
              { label: "Mode", value: "Standard", hint: "Quick entry form" },
              { label: "Trade", value: settings?.primaryTrade || "General", hint: "Current workspace trade" },
            ]}
          />
          <div className="card jobs-new-card jobs-new-card--legacy">
            <h2 className="jobs-new-title">Quick job entry</h2>
            {error ? <p style={{ color: "#b42318" }}>{error}</p> : null}
            <p className="muted" style={{ marginBottom: 12 }}>
              This workspace is using the simple job form, so you can enter the basics and keep moving.
            </p>
          <form className="jobs-new-form" onSubmit={submitLegacy}>
              {renderServiceTypeSelectorCard()}
              {renderConfiguredServiceForm()}
              <label className="jobs-new-label">Job type</label>
              <select className="input jobs-new-input" value={formData.jobType || ""} onChange={(e) => setField("jobType", e.target.value)}>
                <option value="">Choose...</option>
                {jobTypeOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <label className="jobs-new-label">Customer name</label>
              <input className="input jobs-new-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
              <label className="jobs-new-label">Customer email</label>
              <input className="input jobs-new-input" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
              <label className="jobs-new-label">Customer phone</label>
              <input className="input jobs-new-input" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
              <label className="jobs-new-label">Vehicle make</label>
              <input className="input jobs-new-input" value={vehicleMake} onChange={(e) => setVehicleMake(e.target.value)} />
              <label className="jobs-new-label">Vehicle model</label>
              <input className="input jobs-new-input" value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} />
              <label className="jobs-new-label">Vehicle registration</label>
              <input className="input jobs-new-input" value={vehicleReg} onChange={(e) => setVehicleReg(e.target.value)} />
              <button className="button jobs-new-submit" type="submit">Create job</button>
            </form>
            {renderSignatureModal()}
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="jobs-new-shell">
        <OperatorPageHeader
          eyebrow="Create Job"
          title={entrySource === "work" ? "Create the next job without leaving the work flow" : "Create the next job"}
          subtitle={entrySource === "work"
            ? "Keep customer details, work details, photos, and handoff inside one deliberate operator flow."
            : "Capture the job cleanly so the next step stays obvious for the team."}
          actions={[
            { label: "Start work", href: "/dashboard/work", variant: "secondary" },
          ]}
          stats={[
            { label: "Mode", value: guidedExperienceEnabled ? "Guided" : "Standard", hint: guidedExperienceEnabled ? "Step-by-step entry" : "Full form entry" },
            { label: "Draft", value: resumePrompt ? "Saved" : "New", hint: resumePrompt ? "Resume when you're ready" : "Nothing waiting" },
          ]}
        />
        <div className="card jobs-new-card jobs-new-card--wheels">
          {entrySource === "work" ? (
            <div className="card jobs-new-banner" data-testid="job-entry-workflow-banner">
              <div style={{ display: "grid", gap: 8 }}>
                <strong>Start Work flow</strong>
                <p className="muted" style={{ margin: 0 }}>
                  Fill in what matters, finish the work, then send it on.
                </p>
              </div>
            </div>
          ) : null}
          <div className="jobs-new-brandRow" aria-label={workspaceLabel}>
            {settings?.logoUrl ? (
              <img src={settings.logoUrl} alt={workspaceLabel} className="tenant-logo jobs-new-brandLogo" />
            ) : (
              <span className="tenant-logo fallback jobs-new-brandFallback" aria-hidden="true">
                {workspaceInitials}
              </span>
            )}
          </div>

          {guidedExperienceEnabled ? (
          <div className="card jobs-new-banner">
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                <strong>Step by step</strong>
                <button className="button secondary" type="button" onClick={disableGuidedMode}>Open full form</button>
              </div>
            </div>
          ) : null}

        {resumePrompt && guidedExperienceEnabled ? (
          <div className="card jobs-new-banner jobs-new-banner--resume">
            <p style={{ marginTop: 0, marginBottom: 12 }}><strong>Resume your last saved job?</strong></p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="button" type="button" onClick={resumeDraft}>Resume</button>
              <button className="button secondary" type="button" onClick={discardDraft}>Discard</button>
            </div>
          </div>
        ) : null}

          {error ? <p style={{ color: "#b42318" }}>{error}</p> : null}
          {mediaError ? <p style={{ color: "#b42318" }}>{mediaError}</p> : null}
          {success ? (
          <div className="card jobs-new-success" style={{ border: "1px solid #1f8f5a" }} data-testid="job-form-completion-card">
            <p className="jobs-new-successEyebrow">Done</p>
            <h3>Job finished</h3>
            <p>Your completed work is ready to send.</p>
            <p className="muted" style={{ marginTop: -4 }}>
              {success.portalUrl && success.pdfUrl
                ? "The customer page and summary PDF are ready below."
                : success.portalUrl
                ? "The customer page is ready below."
                : success.pdfUrl
                ? "The summary PDF is ready below."
                : "Everything has been saved successfully."}
            </p>
            <div className="jobs-new-successFlow" data-testid="job-form-completion-flow">
              {completionLifecycleRows().map((row) => (
                <div key={row.label} className="jobs-new-successStep">
                  <span className="jobs-new-successStepLabel">{row.label}</span>
                  <strong>{row.value}</strong>
                  <p className="muted">{row.detail}</p>
                </div>
              ))}
            </div>
            <p className="muted" style={{ marginTop: 0 }}>Next: open the job, send it, then take payment if needed.</p>
            <p>Job ID: {success.jobId}</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href={`/dashboard/jobs/${success.jobId}`} className="button">Open job</Link>
              <Link href="/dashboard/work" className="button secondary">Return to Start Work</Link>
              {success.portalUrl ? <a href={success.portalUrl} className="button secondary" target="_blank" rel="noreferrer">Open customer page</a> : null}
              {success.portalUrl ? <button type="button" className="button secondary" onClick={copyPortalLink}>Copy customer link</button> : null}
              {success.pdfUrl ? <a href={success.pdfUrl} className="button secondary" target="_blank" rel="noreferrer">Open summary PDF</a> : null}
              {success.pdfUrl ? <button type="button" className="button secondary" onClick={copyPdfLink}>Copy PDF link</button> : null}
              <Link href="/dashboard/jobs" className="button secondary">Back to job queue</Link>
            </div>
            {copyNotice ? <p className="muted">{copyNotice}</p> : null}
            {emailNotice ? <p className="muted">Saved with handoff notes: {emailNotice}</p> : null}
          </div>
          ) : null}

          <form ref={formRef} className="jobs-new-form jobs-new-form--wheels" onSubmit={submitWheels}>
          <GuidedSectionNav />
          {guidedSectionError ? <p style={{ color: "#ffb84d" }}>{guidedSectionError}</p> : null}
          {renderServiceTypeSelectorCard()}

          {guidedExperienceEnabled ? (
            renderGuidedStep()
          ) : (
            <>
              {renderStandardJobDetailsCard()}
              {renderStandardCustomerDetailsCard()}
              {renderStandardVehicleDetailsCard()}
              {renderWheelSelectionCard()}
              {renderCommercialCard()}
              {renderConfiguredServiceForm() ? (
                <div className="card jobs-new-section-card jobs-new-section-card--compact">
                  <JobFormDisclosure
                    title="Service details"
                    summary={runtimeHasRequiredFields ? "This section has required details. Open it before you finish." : "Open this when the job needs extra service detail."}
                    defaultOpen
                    testId="job-form-disclosure-worksheet"
                  >
                    {renderConfiguredServiceForm()}
                  </JobFormDisclosure>
                </div>
              ) : null}
              <div className="card jobs-new-section-card jobs-new-section-card--compact">
                <div className="jobs-new-sectionHeading">
                  <h3 style={{ marginTop: 0 }}>Photos</h3>
                  <JobFormInfoHint
                    label="Photos"
                    hint="Upload before and after photos plus torque proof when the job needs it."
                    testId="job-form-help-photos"
                  />
                </div>
                <JobFormDisclosure
                  title="Photos"
                  summary="Photos and torque proof when needed."
                  testId="job-form-disclosure-proof"
                >
                  {renderEvidenceMediaFields()}
                </JobFormDisclosure>
              </div>
              {renderNotesCard()}
              <div className="card jobs-new-section-card jobs-new-section-card--compact">
                <div className="jobs-new-sectionHeading">
                  <h3 style={{ marginTop: 0 }}>Sign-off</h3>
                  <JobFormInfoHint
                    label="Sign-off"
                    hint="These signatures stay with the finished job."
                    testId="job-form-help-sign-off"
                  />
                </div>
                <p className="muted">Technician sign-off is required before you finish.</p>
                {renderSignatureFields()}
              </div>
              {renderSendToCustomerCard()}
              <div className="card jobs-new-section-card jobs-new-section-card--compact">
                <JobFormDisclosure
                  title="Declaration"
                  summary="Expand to review the wording stored with the signed record."
                  testId="job-form-disclosure-declaration"
                >
                  {renderDeclarationBlock()}
                </JobFormDisclosure>
              </div>
            </>
          )}

          {guidedExperienceEnabled ? null : readinessSummaryCard()}
          {guidedExperienceEnabled ? null : automationCard()}

          {showPartsSection ? (
            <div className="card jobs-new-section-card jobs-new-section-card--compact">
              <JobFormDisclosure
                title="Parts / stock used"
                summary="Open this only when you used stock on the job."
                defaultOpen={partsUsed.length > 0 || partsQuery.trim().length > 0}
                testId="job-form-disclosure-parts"
              >
                <p className="muted" style={{ marginTop: 0 }}>Add parts only if you used stock on this job.</p>
                <input
                  className="input jobs-new-input"
                  value={partsQuery}
                  onChange={(e) => setPartsQuery(e.target.value)}
                  placeholder="Search stock by SKU or name"
                />
                <div className="list" style={{ marginBottom: 12 }}>
                  {stockItems.slice(0, 6).map((item) => (
                    <div className="integration-card" key={item.id}>
                      <div>
                        <strong>{item.sku} — {item.name}</strong>
                      </div>
                      <button className="button secondary" type="button" onClick={() => addPart(item)}>Add</button>
                    </div>
                  ))}
                </div>
                <div className="list">
                  {partsUsed.map((part) => (
                    <div className="integration-card" key={part.stockItemId}>
                      <div>
                        <strong>{part.sku} — {part.name}</strong>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          className="input jobs-new-input"
                          style={{ width: 90, margin: 0 }}
                          type="number"
                          min={0}
                          step={1}
                          value={part.qty}
                          onChange={(e) => setPartsUsed((prev) => prev.map((p) => (p.stockItemId === part.stockItemId ? { ...p, qty: Number(e.target.value || 0) } : p)))}
                        />
                        <button className="button secondary" type="button" onClick={() => setPartsUsed((prev) => prev.filter((p) => p.stockItemId !== part.stockItemId))}>Remove</button>
                      </div>
                    </div>
                  ))}
                  {partsUsed.length === 0 ? <p className="muted">No parts selected.</p> : null}
                </div>
              </JobFormDisclosure>
            </div>
          ) : null}

            {guidedExperienceEnabled ? null : (
              <button className="button" type="submit" disabled={saving}>{saving ? "Saving..." : "Create job"}</button>
            )}
            {guidedExperienceEnabled ? <GuidedSectionNav position="bottom" /> : null}
          </form>
          {renderSignatureModal()}
        </div>
      </div>
    </DashboardShell>
  );
}
