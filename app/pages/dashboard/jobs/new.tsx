import { Dispatch, SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { DashboardShell } from "../../../components/dashboard-shell";
import { OperatorPageHeader } from "../../../components/ui/operator-page";
import { apiFetch } from "../../../lib/api";
import { isInventoryV1Enabled, isMediaSignatureV1Enabled, isWheelsAutomationV1Enabled, isWheelsFormV1Enabled } from "../../../lib/feature-flags";
import { resolveGuidedMode, setGuidedMode } from "../../../lib/guided-mode";
import { useTenantSettings } from "../../../lib/tenant-settings";
import { applyPricingPreset, buildWhatsAppMessage, computeTotals, computeWheelCount } from "../../../lib/wheels-automation";
const __mtIsOn = (v: any) => {
  const x = String(v ?? "").trim().toLowerCase();
  return x === "on" || x === "true" || x === "1";
};


type TemplateField = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  group: string;
  optionsJson?: string[];
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

function SignaturePad({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const historyRef = useRef<ImageData[]>([]);
  const dirtyRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!value) return;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      historyRef.current = [ctx.getImageData(0, 0, canvas.width, canvas.height)];
      dirtyRef.current = true;
    };
    img.src = value;
  }, [value]);

  function pos(e: any) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: any) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawingRef.current = true;
    historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    const p = pos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    dirtyRef.current = true;
    canvas.setPointerCapture(e.pointerId);
  }

  function move(e: any) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function end(e: any) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    onChange(canvas.toDataURL("image/png"));
    canvas.releasePointerCapture(e.pointerId);
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    historyRef.current = [];
    dirtyRef.current = false;
    onChange("");
  }

  function undo() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    historyRef.current.pop();
    const last = historyRef.current[historyRef.current.length - 1];
    if (!last) {
      clear();
      return;
    }
    ctx.putImageData(last, 0, 0);
    dirtyRef.current = historyRef.current.length > 1;
    onChange(canvas.toDataURL("image/png"));
  }

  return (
    <div>
      <label className="jobs-new-label">{label}</label>
      <div className="card" style={{ padding: 8 }}>
        <canvas
          ref={canvasRef}
          width={420}
          height={140}
          data-testid={`jobs-signature-pad-${label.toLowerCase().includes("customer") ? "customer" : "technician"}`}
          style={{ width: "100%", border: "1px solid #2a3348", borderRadius: 8, touchAction: "none", background: "#fff" }}
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
  { title: "Job Details", subtitle: "Start with the basics for this job." },
  { title: "Customer / Trade Details", subtitle: "Who is this job for and where was it completed?" },
  { title: "Technician & Vehicle", subtitle: "Capture who did the work and on what vehicle." },
  { title: "Wheel / Service Details", subtitle: "Select wheels and services completed." },
  { title: "Evidence & Photos", subtitle: "Add evidence photos or links if available." },
  { title: "Pricing, Invoice & Sign-off", subtitle: "Preview pricing, payment details, and signatures before submit." },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function generateRef() {
  const d = new Date();
  return `WHEELS-${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function parsePhotoList(input: string) {
  return input
    .split(/\n|,/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 6);
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
  const [templateFields, setTemplateFields] = useState<TemplateField[]>([]);
  const [pricingPresets, setPricingPresets] = useState<PricingPreset[]>([]);
  const [formData, setFormData] = useState<Record<string, any>>({
    jobReference: generateRef(),
    jobDate: todayIso(),
    jobStartDate: todayIso(),
    completedDate: todayIso(),
    jobCompletedDate: todayIso(),
    jobType: "Retail",
    paymentStatus: "UNPAID",
    paymentMethod: "CARD",
    vatRate: "20",
    invoiceDate: todayIso(),
    quantity: 1,
    serviceQuantity: 1,
    pricePerWheelMode: false,
    declarationConsent:
      "I confirm the details above are correct and consent to this service record being stored and shared for completion.",
  });
  const [beforeInput, setBeforeInput] = useState("");
  const [afterInput, setAfterInput] = useState("");
  const [torqueInput, setTorqueInput] = useState("");
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
  const [draftSyncState, setDraftSyncState] = useState<'idle' | 'saving' | 'saved'>('idle');
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
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [partsQuery, setPartsQuery] = useState('');
  const [partsUsed, setPartsUsed] = useState<Array<{ stockItemId: string; sku: string; name: string; qty: number }>>([]);

  const wheelsFeature = isWheelsFormV1Enabled() && ((settings?.primaryTrade || "").trim().toUpperCase() === "WHEELS");
  
  const debugTenantSettings = ((process.env.NEXT_PUBLIC_DEBUG_TENANT_SETTINGS || "").trim().toLowerCase() === "on" || (process.env.NEXT_PUBLIC_DEBUG_TENANT_SETTINGS || "").trim().toLowerCase() === "true" || (process.env.NEXT_PUBLIC_DEBUG_TENANT_SETTINGS || "").trim().toLowerCase() === "1");
const automationEnabled = wheelsFeature && isWheelsAutomationV1Enabled();
  const mediaSignatureEnabled = isMediaSignatureV1Enabled();
  const inventoryEnabled = isInventoryV1Enabled();

  useEffect(() => {
    if (!router.isReady) return;
    setGuidedModeState(resolveGuidedMode(router.query.guided));
    if (typeof router.query.customerName === "string") setCustomerName(router.query.customerName);
    if (typeof router.query.customerEmail === "string") setCustomerEmail(router.query.customerEmail);
    if (typeof router.query.customerPhone === "string") setCustomerPhone(router.query.customerPhone);
  }, [router.isReady, router.query.guided]);

  useEffect(() => {
    if (!wheelsFeature) return;
    apiFetch("/templates/default?trade=WHEELS")
      .then((data) => {
        setTemplateFields((data?.fields || []) as TemplateField[]);
      })
      .catch(() => {
        setTemplateFields([]);
      });
  }, [wheelsFeature]);

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
    setFormData((prev) => ({ ...prev, wheelCount }));
  }, [formData.wheel_nsf, formData.wheel_nsr, formData.wheel_osf, formData.wheel_osr, formData.wheel_spare]);

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
    const fallbackTemplate = settings?.whatsappTemplateDefault || "Hi {{name}}, your wheels service {{jobRef}} was completed on {{completedDate}}.";
    const name = String(formData.customerTradeName || formData.customerName || customerName || "Customer");
    const ref = String(formData.jobReference || "job");
    const completedDate = String(formData.jobCompletedDate || formData.completedDate || todayIso());
    const msg = buildWhatsAppMessage({ template: fallbackTemplate, name, jobRef: ref, completedDate });
    const origin = typeof window !== "undefined" ? window.location.origin : "https://app.mytitan.co.uk";
    setFormData((prev) => ({
      ...prev,
      whatsappMessage: prev.whatsappMessage || msg,
      whatsappCompletionLink: prev.whatsappCompletionLink || `${origin}/portal/job/pending`,
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

  const grouped = useMemo(() => {
    const source = templateFields.length > 0 ? templateFields : [];
    const groups: Record<string, TemplateField[]> = {};
    for (const f of source) {
      if (!groups[f.group]) groups[f.group] = [];
      groups[f.group].push(f);
    }
    return groups;
  }, [templateFields]);

  const sections = useMemo(() => Object.entries(grouped), [grouped]);

  useEffect(() => {
    if (!sections.length) {
      setActiveSectionIndex(0);
      return;
    }
    setActiveSectionIndex((prev) => Math.min(prev, sections.length - 1));
  }, [sections]);

  const guidedExperienceEnabled = wheelsFeature && guidedMode;
  const totalSteps = guidedSteps.length;

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
    setFormData((prev) => ({ ...prev, [key]: value }));

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
        setFormData((prev) => ({ ...prev, vehicleReg: value || "" }));
      }
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

  function persistDraft(stepIndex = activeSectionIndex) {
    if (!guidedExperienceEnabled || typeof window === "undefined") return;
    const payload = buildDraft(stepIndex);
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
    setDraftSyncState('saving');
    apiFetch('/drafts/jobs', {
      method: 'PUT',
      body: JSON.stringify({
        trade: String(formData.tradeCode || 'WHEELS').toUpperCase(),
        payload,
      }),
    })
      .then(() => setDraftSyncState('saved'))
      .catch(() => setDraftSyncState('saved'));
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
      const serviceSelected = Array.isArray(formData.serviceTypes) && formData.serviceTypes.length > 0;
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
      return;
    }

    setActiveSectionIndex((prev) => Math.min(prev + 1, Math.max(0, sections.length - 1)));
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

  function saveAndExit() {
    persistDraft(activeSectionIndex);
    router.push("/dashboard");
  }

  useEffect(() => {
    if (!guidedExperienceEnabled) return;
    const timer = setTimeout(() => {
      persistDraft(activeSectionIndex);
    }, 3000);
    return () => clearTimeout(timer);
  }, [guidedExperienceEnabled, activeSectionIndex, formData, beforeFiles.length, afterFiles.length, torqueFile?.id]);

  function triggerMarkComplete() {
    const completed = String(formData.jobCompletedDate || formData.completedDate || "").trim() || todayIso();
    const message = buildWhatsAppMessage({
      template: settings?.whatsappTemplateDefault || "Hi {{name}}, your wheels service {{jobRef}} was completed on {{completedDate}}.",
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

  function renderField(field: TemplateField) {
    const key = field.key;
    const value = formData[key] ?? "";

    if (key === "beforePhotos") {
      return (
        <div key={key}>
          <label className="jobs-new-label">{field.label} (up to 6 URLs)</label>
          <textarea className="input jobs-new-input" rows={3} value={beforeInput} onChange={(e) => setBeforeInput(e.target.value)} />
        </div>
      );
    }
    if (key === "afterPhotos") {
      return (
        <div key={key}>
          <label className="jobs-new-label">{field.label} (up to 6 URLs)</label>
          <textarea className="input jobs-new-input" rows={3} value={afterInput} onChange={(e) => setAfterInput(e.target.value)} />
        </div>
      );
    }
    if (key === "torqueEvidence") {
      return (
        <div key={key}>
          <label className="jobs-new-label">{field.label} (image/video URL)</label>
          <input className="input jobs-new-input" value={torqueInput} onChange={(e) => setTorqueInput(e.target.value)} />
        </div>
      );
    }

    if (field.type === "checkbox" && Array.isArray(field.optionsJson) && field.optionsJson.length > 0) {
      return (
        <div key={key}>
          <label className="jobs-new-label">{field.label}</label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            {field.optionsJson.map((opt) => {
              const arr = Array.isArray(value) ? value : [];
              const checked = arr.includes(opt);
              return (
                <label key={opt} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked ? [...arr, opt] : arr.filter((x: string) => x !== opt);
                      setField(key, next);
                    }}
                  />
                  {opt}
                </label>
              );
            })}
          </div>
        </div>
      );
    }

    if (field.type === "radio" && Array.isArray(field.optionsJson) && field.optionsJson.length > 0) {
      return (
        <div key={key}>
          <label className="jobs-new-label">{field.label}</label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            {field.optionsJson.map((opt) => (
              <label key={opt} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="radio" name={key} checked={value === opt} onChange={() => setField(key, opt)} />
                {opt}
              </label>
            ))}
          </div>
        </div>
      );
    }

    if (field.type === "select" && Array.isArray(field.optionsJson) && field.optionsJson.length > 0) {
      return (
        <div key={key}>
          <label className="jobs-new-label">{field.label}</label>
          <select className="input jobs-new-input" value={value} onChange={(e) => setField(key, e.target.value)}>
            <option value="">Choose...</option>
            {field.optionsJson.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      );
    }

    if (field.type === "textarea") {
      return (
        <div key={key}>
          <label className="jobs-new-label">{field.label}</label>
          <textarea className="input jobs-new-input" rows={3} value={value} onChange={(e) => setField(key, e.target.value)} required={!guidedExperienceEnabled && field.required} />
        </div>
      );
    }

    if (field.type === "checkbox") {
      return (
        <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => setField(key, e.target.checked)} />
          {field.label}
        </label>
      );
    }

    return (
      <div key={key}>
        <label className="jobs-new-label">{field.label}</label>
        <input
          className="input jobs-new-input"
          type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
          value={value}
          onChange={(e) => setField(key, e.target.value, { userEdited: key === "unitPrice" || key === "quantity" })}
          required={!guidedExperienceEnabled && field.required}
        />
      </div>
    );
  }

  function GuidedSectionNav() {
    if (!guidedExperienceEnabled) return null;

    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <button className="button secondary" type="button" onClick={goBackSection} disabled={activeSectionIndex === 0}>
          Back
        </button>
        {activeSectionIndex < totalSteps - 1 ? (
          <button className="button jobs-new-submit" type="button" onClick={goNextSection}>Next</button>
        ) : null}
        <button className="button secondary" type="button" onClick={saveAndExit}>Save & Exit</button>
        <p className="muted" style={{ margin: 0, alignSelf: "center" }}>
          Step {activeSectionIndex + 1} of {totalSteps}
        </p>
        <p className="muted" style={{ margin: 0, alignSelf: "center" }}>
          Draft: {draftSyncState === 'saving' ? 'Saving...' : draftSyncState === 'saved' ? 'Saved' : 'Idle'}
        </p>
      </div>
    );
  }

  const totalsPreview = computeTotals({
    unitPrice: Number(formData.unitPrice || 0),
    qty: Number(formData.serviceQuantity || formData.quantity || 1),
    wheelCount: Number(formData.wheelCount || 0),
    pricePerWheel: Number(formData.pricePerWheel || 0),
    discount: Number(formData.discount || 0),
    vatEnabled: Boolean(formData.vatEnabled),
    vatRate: Number(formData.vatRate || 0),
  });

  async function submitLegacy(e: React.FormEvent) {
    e.preventDefault();
    setError("");
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
          serviceName: formData.serviceName || undefined,
          laborCents: Number(formData.laborCents || 0),
          partsCents: Number(formData.partsCents || 0),
          miscCents: Number(formData.miscCents || 0),
          taxRateBps: Number(formData.taxRateBps || 0),
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

    if (!formData.jobReference || !formData.jobDate || !formData.jobType || !(formData.customerTradeName || formData.customerName || customerName)) {
      setSaving(false);
      setError("Please complete job reference, date, job type, and customer/trade name.");
      return;
    }

    if (!formData.technicianName || !formData.technicianSignatureName || !formData.technicianSignature) {
      setSaving(false);
      setError("Technician name and signature are required.");
      return;
    }

    let guidedBeforeMedia: any[] = parsePhotoList(beforeInput);
    let guidedAfterMedia: any[] = parsePhotoList(afterInput);
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
      customerName: formData.customerTradeName || formData.customerName || customerName,
      customerEmail,
      customerPhone,
      vehicleMake: formData.vehicleMake || formData.carMakeModel || vehicleMake,
      vehicleModel: formData.vehicleModel || vehicleModel,
      vehicleReg: formData.vehicleReg || formData.carRegOrChassis || vehicleReg,
      beforePhotos: guidedBeforeMedia,
      afterPhotos: guidedAfterMedia,
      beforeMedia: guidedBeforeMedia,
      afterMedia: guidedAfterMedia,
      torqueEvidenceMedia,
      torqueEvidence: guidedExperienceEnabled ? "" : torqueInput || formData.torqueEvidence || "",
      wheelCount: Number(formData.wheelCount || 0),
      quantity: Number(formData.serviceQuantity || formData.quantity || 1),
      serviceQuantity: Number(formData.serviceQuantity || formData.quantity || 1),
      unitPrice: Number(formData.unitPrice || 0),
      pricePerWheel: Number(formData.pricePerWheel || 0),
      discount: Number(formData.discount || 0),
      vatEnabled: Boolean(formData.vatEnabled),
      vatRate: Number(formData.vatRate || 0),
      city: formData.city || formData.town || "",
      jobStartDate: formData.jobStartDate || formData.jobDate || "",
      jobCompletedDate: formData.jobCompletedDate || formData.completedDate || "",
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
          serviceName: (payloadForm as any).serviceName || "Wheels Job",
          tradeCode: "WHEELS",
          jobType: (payloadForm as any).jobType,
          beforeMedia: (payloadForm as any).beforeMedia,
          afterMedia: (payloadForm as any).afterMedia,
          torqueEvidenceMedia: (payloadForm as any).torqueEvidenceMedia,
          formData: payloadForm,
        }),
      });

      const pdf = await apiFetch(`/jobs/${created.id}/pdf`, { method: "POST" }).catch(() => null);
      const pdfUrl = pdf?.pdfUrl || pdf?.url || created?.pdf?.url;
      const tokenSource = typeof pdf?.url === "string" ? pdf.url : typeof created?.pdf?.url === "string" ? created.pdf.url : "";
      const token = tokenSource.startsWith("/public/job/") ? tokenSource.split("/")[3] : null;
      const portalUrl = token ? `/portal/job/${token}` : undefined;

      if (inventoryEnabled && partsUsed.length > 0) {
        await Promise.all(
          partsUsed.map((part) =>
            apiFetch(`/inventory/items/${part.stockItemId}/allocate-to-job`, {
              method: "POST",
              body: JSON.stringify({ jobId: created.id, qty: Number(part.qty || 0), reason: "Allocated from job form" }),
            }).catch(() => null),
          ),
        );
      }

      clearDraft();
      clearMediaSelections();
      setResumeMediaMessages([]);
      setSuccess({ jobId: created.id, portalUrl, pdfUrl });
      setPartsUsed([]);

      if (completeAfterSubmit) {
        const phone = String(payloadForm.customerPhone || "").replace(/[^\d+]/g, "");
        const message = String((payloadForm as any).whatsappMessage || "").trim();
        if (phone && message && typeof window !== "undefined") {
          window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
        }
        setEmailNotice("Email not configured");
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
    if (!message) {
      setWhatsAppNotice("Add a WhatsApp message first.");
      return;
    }
    if (typeof window === "undefined") return;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setWhatsAppNotice("WhatsApp opened in a new tab.");
  }

  function skipWhatsApp() {
    setWhatsAppNotice("Skipped WhatsApp send. You can still submit this job.");
  }

  async function copyPdfLink() {
    if (!success?.pdfUrl || typeof window === "undefined") return;
    try {
      await window.navigator.clipboard.writeText(success.pdfUrl);
      setCopyNotice("PDF link copied.");
    } catch {
      setCopyNotice("Copy failed. Please copy from your browser address bar.");
    }
  }

  function sectionCard(title: string, children: React.ReactNode) {
    return (
      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        {children}
      </div>
    );
  }

  function automationCard() {
    if (!automationEnabled) return null;
    return (
      <div className="card" style={{ marginBottom: 16, padding: 16, border: "1px solid rgba(79, 209, 197, 0.35)" }}>
        <h3 style={{ marginTop: 0 }}>Automation</h3>
        <p className="muted">One click will set completion date, keep WhatsApp message ready, create PDF, and open WhatsApp after save.</p>
        <button className="button" type="button" onClick={triggerMarkComplete} disabled={saving}>
          {saving && completeAfterSubmit ? "Completing..." : "Mark Job Complete"}
        </button>
      </div>
    );
  }

  function renderGuidedStep() {
    const step = activeSectionIndex;

    if (step === 0) {
      return sectionCard("Step 1: Job Details", (
        <>
          <label className="jobs-new-label">Job reference</label>
          <input className="input jobs-new-input" value={formData.jobReference || ""} onChange={(e) => setField("jobReference", e.target.value)} />
          <p className="muted" style={{ marginTop: -4 }}>Auto-generated — you can change it.</p>

          <label className="jobs-new-label">Job start date</label>
          <input className="input jobs-new-input" type="date" value={formData.jobStartDate || formData.jobDate || ""} onChange={(e) => setField("jobDate", e.target.value)} />

          <label className="jobs-new-label">Job completed date (optional)</label>
          <input className="input jobs-new-input" type="date" value={formData.jobCompletedDate || formData.completedDate || ""} onChange={(e) => setField("completedDate", e.target.value)} />

          <label className="jobs-new-label">Job type</label>
          <select className="input jobs-new-input" value={formData.jobType || ""} onChange={(e) => setField("jobType", e.target.value)}>
            <option value="">Choose...</option>
            <option value="Retail">Retail</option>
            <option value="Trade">Trade</option>
            <option value="Insurance">Insurance</option>
          </select>
        </>
      ));
    }

    if (step === 1) {
      return sectionCard("Step 2: Customer / Trade Details", (
        <>
          <label className="jobs-new-label">Customer / trade name</label>
          <input
            className="input jobs-new-input"
            value={formData.customerTradeName || formData.customerName || customerName || ""}
            onChange={(e) => setField("customerTradeName", e.target.value)}
          />

          <label className="jobs-new-label">Trade contact name</label>
          <input className="input jobs-new-input" value={formData.tradeContactName || ""} onChange={(e) => setField("tradeContactName", e.target.value)} />

          <label className="jobs-new-label">Phone</label>
          <input className="input jobs-new-input" value={formData.customerPhone || customerPhone || ""} onChange={(e) => setField("customerPhone", e.target.value)} />

          <label className="jobs-new-label">Email</label>
          <input className="input jobs-new-input" type="email" value={formData.customerEmail || customerEmail || ""} onChange={(e) => setField("customerEmail", e.target.value)} />

          <label className="jobs-new-label">Address line 1</label>
          <input className="input jobs-new-input" value={formData.addressLine1 || ""} onChange={(e) => setField("addressLine1", e.target.value)} />

          <label className="jobs-new-label">Address line 2</label>
          <input className="input jobs-new-input" value={formData.addressLine2 || ""} onChange={(e) => setField("addressLine2", e.target.value)} />

          <label className="jobs-new-label">City</label>
          <input className="input jobs-new-input" value={formData.city || formData.town || ""} onChange={(e) => setField("city", e.target.value)} />

          <label className="jobs-new-label">Postcode</label>
          <input className="input jobs-new-input" value={formData.postcode || ""} onChange={(e) => setField("postcode", e.target.value)} />

          <label className="toggle-row" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={Boolean(formData.saveTradeCustomer)} onChange={(e) => setField("saveTradeCustomer", e.target.checked)} />
            <span>Save this customer/trade for next time</span>
          </label>
        </>
      ));
    }

    if (step === 2) {
      return sectionCard("Step 3: Technician & Vehicle", (
        <>
          <label className="jobs-new-label">Technician name</label>
          <input className="input jobs-new-input" value={formData.technicianName || ""} onChange={(e) => setField("technicianName", e.target.value)} />

          <label className="jobs-new-label">Car make / model</label>
          <input className="input jobs-new-input" value={formData.carMakeModel || `${vehicleMake} ${vehicleModel}`.trim()} onChange={(e) => setField("carMakeModel", e.target.value)} />

          <label className="jobs-new-label">Registration / chassis</label>
          <input className="input jobs-new-input" value={formData.carRegOrChassis || formData.vehicleReg || vehicleReg || ""} onChange={(e) => setField("carRegOrChassis", e.target.value)} />

          <label className="jobs-new-label">Torque setting</label>
          <input className="input jobs-new-input" value={formData.torqueSetting || ""} onChange={(e) => setField("torqueSetting", e.target.value)} />
          <p className="muted" style={{ marginTop: -4 }}>e.g. 130Nm</p>

          <label className="jobs-new-label">Tyre pressure</label>
          <input className="input jobs-new-input" value={formData.tyrePressure || ""} onChange={(e) => setField("tyrePressure", e.target.value)} />

          <label className="jobs-new-label">Notes</label>
          <textarea className="input jobs-new-input" rows={3} value={formData.notes || ""} onChange={(e) => setField("notes", e.target.value)} />
        </>
      ));
    }

    if (step === 3) {
      const looseOptions = ["x1", "x2", "x3", "x4", "x5", "clear"];
      const serviceOptions = ["Tyre Change", "Puncture Repair", "Wheel Swap", "Balancing", "TPMS"];
      const serviceTypes = Array.isArray(formData.serviceTypes) ? formData.serviceTypes : [];

      return sectionCard("Step 4: Wheel / Service Details", (
        <>
          <p className="muted" style={{ marginTop: 0 }}>Select the wheels worked on.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, marginBottom: 12 }}>
            {wheelKeys.map((key) => (
              <label key={key} className="toggle-row" style={{ margin: 0 }}>
                <input type="checkbox" checked={Boolean(formData[key])} onChange={(e) => setField(key, e.target.checked)} />
                <span>{key.replace("wheel_", "").toUpperCase()}</span>
              </label>
            ))}
          </div>

          <label className="jobs-new-label">Loose wheels</label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            {looseOptions.map((opt) => (
              <label key={opt} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="radio" name="looseWheels" checked={formData.looseWheels === opt} onChange={() => setField("looseWheels", opt)} />
                {opt}
              </label>
            ))}
          </div>

          <label className="jobs-new-label">Service types</label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            {serviceOptions.map((opt) => (
              <label key={opt} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={serviceTypes.includes(opt)}
                  onChange={(e) => {
                    const next = e.target.checked ? [...serviceTypes, opt] : serviceTypes.filter((s: string) => s !== opt);
                    setField("serviceTypes", next);
                  }}
                />
                {opt}
              </label>
            ))}
          </div>
        </>
      ));
    }

    if (step === 4) {
      return sectionCard("Step 5: Evidence & Photos", (
        <>
          <label className="jobs-new-label">Torque evidence (image/video)</label>
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
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", marginTop: 10 }}>
            {beforeFiles.map((item) => (
              <div key={item.id} className="card" style={{ padding: 10 }}>
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
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", marginTop: 10 }}>
            {afterFiles.map((item) => (
              <div key={item.id} className="card" style={{ padding: 10 }}>
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
      ));
    }

    return sectionCard("Step 6: Pricing + Invoice + WhatsApp + Signatures", (
      <>
        <p className="muted" style={{ marginTop: 0 }}>Preview only. Server-side billing and workflow rules still apply when the job is created.</p>

        <label className="jobs-new-label">Service name</label>
        <input className="input jobs-new-input" value={formData.serviceName || ""} onChange={(e) => setField("serviceName", e.target.value)} />

        <label className="jobs-new-label">Service unit price</label>
        <input className="input jobs-new-input" type="number" value={formData.unitPrice || ""} onChange={(e) => setField("unitPrice", e.target.value, { userEdited: true })} />

        <label className="jobs-new-label">Service quantity</label>
        <input className="input jobs-new-input" type="number" value={formData.serviceQuantity || formData.quantity || 1} onChange={(e) => setField("serviceQuantity", e.target.value, { userEdited: true })} />

        <label className="jobs-new-label">Discount</label>
        <input className="input jobs-new-input" type="number" value={formData.discount || ""} onChange={(e) => setField("discount", e.target.value)} />

        <label className="jobs-new-label">Price per wheel</label>
        <input className="input jobs-new-input" type="number" value={formData.pricePerWheel || ""} onChange={(e) => setField("pricePerWheel", e.target.value)} />

        <label className="toggle-row" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={Boolean(formData.pricePerWheelMode)} onChange={(e) => setField("pricePerWheelMode", e.target.checked)} />
          <span>Sync service quantity to wheel count</span>
        </label>

        <label className="jobs-new-label">Wheel count</label>
        <input className="input jobs-new-input" type="number" value={formData.wheelCount || 0} onChange={(e) => setField("wheelCount", e.target.value)} />

        <label className="toggle-row" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={Boolean(formData.vatEnabled)} onChange={(e) => setField("vatEnabled", e.target.checked)} />
          <span>VAT enabled</span>
        </label>

        <label className="jobs-new-label">VAT rate (%)</label>
        <input className="input jobs-new-input" type="number" value={formData.vatRate || ""} onChange={(e) => setField("vatRate", e.target.value)} />

        <p className="muted">Subtotal £{totalsPreview.subtotal.toFixed(2)} • VAT £{totalsPreview.vat.toFixed(2)} • Total £{totalsPreview.total.toFixed(2)}</p>

        <label className="jobs-new-label">Invoice number (optional)</label>
        <input className="input jobs-new-input" value={formData.invoiceNumber || ""} onChange={(e) => setField("invoiceNumber", e.target.value)} />

        <label className="jobs-new-label">Payment status</label>
        <select className="input jobs-new-input" value={formData.paymentStatus || "UNPAID"} onChange={(e) => setField("paymentStatus", e.target.value)}>
          <option value="UNPAID">UNPAID</option>
          <option value="PART_PAID">PART_PAID</option>
          <option value="PAID">PAID</option>
        </select>

        <label className="jobs-new-label">Payment method</label>
        <select className="input jobs-new-input" value={formData.paymentMethod || "CARD"} onChange={(e) => setField("paymentMethod", e.target.value)}>
          <option value="CASH">CASH</option>
          <option value="CARD">CARD</option>
          <option value="BANK_TRANSFER">BANK_TRANSFER</option>
          <option value="STRIPE_LINK">STRIPE_LINK</option>
        </select>

        <label className="jobs-new-label">WhatsApp message</label>
        <textarea className="input jobs-new-input" rows={3} value={formData.whatsappMessage || ""} onChange={(e) => setField("whatsappMessage", e.target.value)} />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <button type="button" className="button secondary" onClick={sendWhatsApp}>Send WhatsApp</button>
          <button type="button" className="button secondary" onClick={skipWhatsApp}>Skip</button>
        </div>
        {whatsAppNotice ? <p className="muted">{whatsAppNotice}</p> : null}

        <label className="jobs-new-label">Technician signature name</label>
        <input className="input jobs-new-input" value={formData.technicianSignatureName || ""} onChange={(e) => setField("technicianSignatureName", e.target.value)} />

        <SignaturePad
          label="Technician signature (required)"
          value={formData.technicianSignature || ""}
          onChange={(next) => setField("technicianSignature", next)}
        />

        <label className="jobs-new-label">Customer signature name (optional)</label>
        <input className="input jobs-new-input" value={formData.customerSignatureName || ""} onChange={(e) => setField("customerSignatureName", e.target.value)} />

        <SignaturePad
          label="Customer signature (optional)"
          value={formData.customerSignature || ""}
          onChange={(next) => setField("customerSignature", next)}
        />
      </>
    ));
  }
  if (!wheelsFeature) {
    return (
      <DashboardShell>
        <div className="jobs-new-shell">
          {__mtDebugTenantSettings ? (
          <div
            data-debug-tenant-settings="on"
            style={{ position: "absolute", left: -99999, top: -99999, width: 1, height: 1, overflow: "hidden" }}
          >
            DEBUG_MARKER__TENANT_SETTINGS__ON{" "}
            settingsPrimaryTrade={String((settings as any)?.primaryTrade ?? "")}{" "}
            settingsTenantId={String((settings as any)?.tenantId ?? "")}{" "}
            settingsPlanId={String((settings as any)?.planId ?? "")}
          </div>
          ) : null}
          <OperatorPageHeader
            eyebrow="Operations"
            title="New job"
            subtitle="Create a service record with the core customer and vehicle details your team needs."
            stats={[
              { label: "Mode", value: "Standard", hint: "Quick entry form" },
              { label: "Trade", value: settings?.primaryTrade || "General", hint: "Current workspace configuration" },
            ]}
          />
          <div className="card jobs-new-card jobs-new-card--legacy">
            <h2 className="jobs-new-title">Quick job entry</h2>
            {error ? <p style={{ color: "#b42318" }}>{error}</p> : null}
            <p className="muted" style={{ marginBottom: 12 }}>
              Wheels Form v1 is off or your primary trade is not WHEELS, so MyTitan is using the standard quick job form.
            </p>
            <form className="jobs-new-form" onSubmit={submitLegacy}>
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
        </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="jobs-new-shell">
        <OperatorPageHeader
          eyebrow="Operations"
          title="New job"
          subtitle="Create a complete service record with customer details, evidence, pricing, and sign-off in one operator-ready workflow."
          shortcuts={guidedExperienceEnabled ? ["Guided mode saves your draft as you move", "Save and exit any time"] : ["Use guided mode for field capture", "PDF is generated after submit"]}
          stats={[
            { label: "Trade", value: "Wheels", hint: "Template-driven service workflow" },
            { label: "Evidence", value: mediaSignatureEnabled ? "Media + signatures" : "Links + notes", hint: "Depends on current tenant flags" },
            { label: "Billing", value: "Server checked", hint: "Totals are recalculated on submit" },
          ]}
        />
        <div className="card jobs-new-card jobs-new-card--wheels">
          <h2 className="jobs-new-title">Wheels service record</h2>
          <p className="muted">Capture the job once, keep the workflow clear, and hand off a customer-safe record without duplicating the same details across separate tools.</p>

          {guidedExperienceEnabled ? (
            <div className="card" style={{ marginBottom: 16, padding: 12, border: "1px solid rgba(17, 122, 120, 0.22)" }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                <strong>Guided mode is on</strong>
                <button className="button secondary" type="button" onClick={disableGuidedMode}>Switch to standard entry</button>
              </div>
            </div>
          ) : null}

        {resumePrompt && guidedExperienceEnabled ? (
          <div className="card" style={{ marginBottom: 16, padding: 12, border: "1px solid rgba(111, 175, 255, 0.55)" }}>
            <p style={{ marginTop: 0, marginBottom: 12 }}><strong>Resume your last Wheels job draft?</strong></p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="button" type="button" onClick={resumeDraft}>Resume</button>
              <button className="button secondary" type="button" onClick={discardDraft}>Discard</button>
            </div>
          </div>
        ) : null}

          {error ? <p style={{ color: "#b42318" }}>{error}</p> : null}
          {mediaError ? <p style={{ color: "#b42318" }}>{mediaError}</p> : null}
          {success ? (
          <div className="card jobs-new-success" style={{ padding: 16, border: "1px solid #1f8f5a" }}>
            <h3>Job created</h3>
            <p>Job ID: {success.jobId}</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/dashboard/jobs" className="button">Back to Jobs</Link>
              {success.portalUrl ? <Link href={success.portalUrl} className="button secondary">Open customer portal</Link> : null}
              {success.pdfUrl ? <a href={success.pdfUrl} className="button secondary" target="_blank" rel="noreferrer">Open PDF</a> : null}
              {success.pdfUrl ? <button type="button" className="button secondary" onClick={copyPdfLink}>Copy PDF link</button> : null}
            </div>
            {copyNotice ? <p className="muted">{copyNotice}</p> : null}
            {emailNotice ? <p className="muted">{emailNotice}</p> : null}
          </div>
          ) : null}

          <form ref={formRef} className="jobs-new-form jobs-new-form--wheels" onSubmit={submitWheels}>
          {guidedExperienceEnabled ? (
            <div className="card jobs-new-step-card" style={{ marginBottom: 16, padding: 12 }}>
              <p className="muted" style={{ marginTop: 0 }}>Step {activeSectionIndex + 1} of {totalSteps}</p>
              <h3 style={{ margin: "0 0 4px 0" }}>{guidedSteps[activeSectionIndex].title}</h3>
              <p className="muted" style={{ margin: 0 }}>{guidedSteps[activeSectionIndex].subtitle}</p>
            </div>
          ) : null}

          <GuidedSectionNav />
          {guidedSectionError ? <p style={{ color: "#ffb84d" }}>{guidedSectionError}</p> : null}

          {guidedExperienceEnabled ? (
            renderGuidedStep()
          ) : (
            sections.map(([group, fields]) => (
              <div key={group} className="card jobs-new-section-card" style={{ marginBottom: 16, padding: 16 }}>
                <h3 style={{ marginTop: 0 }}>{group}</h3>
                {fields.map(renderField)}
                {group === "Pricing" ? (
                  <p className="muted">Preview total: £{totalsPreview.total.toFixed(2)}</p>
                ) : null}
              </div>
            ))
          )}

          {automationCard()}

          {inventoryEnabled ? (
            <div className="card" style={{ marginBottom: 16, padding: 16 }}>
              <h3 style={{ marginTop: 0 }}>Parts / Stock used (optional)</h3>
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
            </div>
          ) : null}

            {guidedExperienceEnabled ? null : (
              <button className="button" type="submit" disabled={saving}>{saving ? "Saving..." : "Create job and generate PDF"}</button>
            )}

            <GuidedSectionNav />
          </form>
        </div>
      </div>
    </DashboardShell>
  );
}
