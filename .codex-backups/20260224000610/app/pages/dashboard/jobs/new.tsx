import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { DashboardShell } from "../../../components/dashboard-shell";
import { apiFetch } from "../../../lib/api";
import { isWheelsAutomationV1Enabled, isWheelsFormV1Enabled } from "../../../lib/feature-flags";
import { resolveGuidedMode, setGuidedMode } from "../../../lib/guided-mode";
import { useTenantSettings } from "../../../lib/tenant-settings";
import { applyPricingPreset, buildWhatsAppMessage, computeTotals, computeWheelCount } from "../../../lib/wheels-automation";

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
  beforePhotoNames: string[];
  afterPhotoNames: string[];
  hasTorqueEvidence: boolean;
  savedAt: string;
};

type PricingPreset = {
  name: string;
  key: string;
  unitPrice: number | null;
  useCount: number;
};

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

function extractFileName(value: string) {
  const clean = value.split("?")[0].split("#")[0];
  const parts = clean.split("/");
  return parts[parts.length - 1] || "attachment";
}

function isAllowedEvidenceValue(value: string) {
  const v = value.trim();
  if (!v) return true;
  if (/^data:(image|video)\//i.test(v)) return true;

  try {
    const url = new URL(v);
    if (!(url.protocol === "http:" || url.protocol === "https:")) {
      return false;
    }
    return /\.(jpe?g|png|gif|webp|bmp|mp4|mov|webm|m4v)$/i.test(url.pathname);
  } catch {
    return false;
  }
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
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleReg, setVehicleReg] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [guidedMode, setGuidedModeState] = useState(false);
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [guidedSectionError, setGuidedSectionError] = useState("");
  const [resumePrompt, setResumePrompt] = useState<DraftSnapshot | null>(null);
  const [resumeMediaHint, setResumeMediaHint] = useState<string>("");
  const [whatsAppNotice, setWhatsAppNotice] = useState<string>("");
  const [emailNotice, setEmailNotice] = useState<string>("");
  const [copyNotice, setCopyNotice] = useState<string>("");
  const [completeAfterSubmit, setCompleteAfterSubmit] = useState(false);
  const [priceMeta, setPriceMeta] = useState({ unitPriceEdited: false, serviceQuantityEdited: false });
  const [success, setSuccess] = useState<{ jobId: string; portalUrl?: string; pdfUrl?: string } | null>(null);

  const wheelsFeature = isWheelsFormV1Enabled() && settings?.primaryTrade === "WHEELS";
  const automationEnabled = wheelsFeature && isWheelsAutomationV1Enabled();

  useEffect(() => {
    if (!router.isReady) return;
    setGuidedModeState(resolveGuidedMode(router.query.guided));
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
      beforePhotoNames: parsePhotoList(beforeInput).map(extractFileName),
      afterPhotoNames: parsePhotoList(afterInput).map(extractFileName),
      hasTorqueEvidence: Boolean(torqueInput || formData.torqueEvidence || formData.torqueEvidenceLink),
      savedAt: new Date().toISOString(),
    };
  }

  function persistDraft(stepIndex = activeSectionIndex) {
    if (!guidedExperienceEnabled || typeof window === "undefined") return;
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(buildDraft(stepIndex)));
  }

  function clearDraft() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
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
      const torqueValue = String(torqueInput || formData.torqueEvidence || "").trim();
      if (torqueValue && !isAllowedEvidenceValue(torqueValue)) {
        return humanError("Torque evidence must be an image or video URL.");
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
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("guided", "0");
    window.location.href = nextUrl.toString();
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

    const hints: string[] = [];
    if (resumePrompt.beforePhotoNames.length || resumePrompt.afterPhotoNames.length || resumePrompt.hasTorqueEvidence) {
      hints.push("Please reselect photos/evidence before submit.");
    }
    setResumeMediaHint(hints.join(" "));
    setResumePrompt(null);
  }

  function discardDraft() {
    clearDraft();
    setResumePrompt(null);
  }

  function saveAndExit() {
    persistDraft(activeSectionIndex);
    router.push("/dashboard");
  }

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
          <label>{field.label} (up to 6 URLs)</label>
          <textarea className="input" rows={3} value={beforeInput} onChange={(e) => setBeforeInput(e.target.value)} />
        </div>
      );
    }
    if (key === "afterPhotos") {
      return (
        <div key={key}>
          <label>{field.label} (up to 6 URLs)</label>
          <textarea className="input" rows={3} value={afterInput} onChange={(e) => setAfterInput(e.target.value)} />
        </div>
      );
    }
    if (key === "torqueEvidence") {
      return (
        <div key={key}>
          <label>{field.label} (image/video URL)</label>
          <input className="input" value={torqueInput} onChange={(e) => setTorqueInput(e.target.value)} />
        </div>
      );
    }

    if (field.type === "checkbox" && Array.isArray(field.optionsJson) && field.optionsJson.length > 0) {
      return (
        <div key={key}>
          <label>{field.label}</label>
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
          <label>{field.label}</label>
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
          <label>{field.label}</label>
          <select className="input" value={value} onChange={(e) => setField(key, e.target.value)}>
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
          <label>{field.label}</label>
          <textarea className="input" rows={3} value={value} onChange={(e) => setField(key, e.target.value)} required={!guidedExperienceEnabled && field.required} />
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
        <label>{field.label}</label>
        <input
          className="input"
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
          <button className="button" type="button" onClick={goNextSection}>Next</button>
        ) : null}
        <button className="button secondary" type="button" onClick={saveAndExit}>Save & Exit</button>
        <p className="muted" style={{ margin: 0, alignSelf: "center" }}>
          Step {activeSectionIndex + 1} of {totalSteps}
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

    const payloadForm = {
      ...formData,
      customerName: formData.customerTradeName || formData.customerName || customerName,
      customerEmail,
      customerPhone,
      vehicleMake: formData.vehicleMake || formData.carMakeModel || vehicleMake,
      vehicleModel: formData.vehicleModel || vehicleModel,
      vehicleReg: formData.vehicleReg || formData.carRegOrChassis || vehicleReg,
      beforePhotos: parsePhotoList(beforeInput),
      afterPhotos: parsePhotoList(afterInput),
      torqueEvidence: torqueInput || formData.torqueEvidence || "",
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
          formData: payloadForm,
        }),
      });

      const pdf = await apiFetch(`/jobs/${created.id}/pdf`, { method: "POST" }).catch(() => null);
      const pdfUrl = pdf?.pdfUrl || pdf?.url || created?.pdf?.url;
      const tokenSource = typeof pdf?.url === "string" ? pdf.url : typeof created?.pdf?.url === "string" ? created.pdf.url : "";
      const token = tokenSource.startsWith("/public/job/") ? tokenSource.split("/")[3] : null;
      const portalUrl = token ? `/portal/job/${token}` : undefined;

      clearDraft();
      setSuccess({ jobId: created.id, portalUrl, pdfUrl });

      if (completeAfterSubmit) {
        const phone = String(payloadForm.customerPhone || "").replace(/[^\d+]/g, "");
        const message = String((payloadForm as any).whatsappMessage || "").trim();
        if (phone && message && typeof window !== "undefined") {
          window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
        }
        setEmailNotice("Email sending not set up yet.");
        setCompleteAfterSubmit(false);
      }
    } catch (err: any) {
      setError(err.message || "Failed to create Wheels job");
      setCompleteAfterSubmit(false);
    } finally {
      setSaving(false);
    }
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
          <label>Job reference</label>
          <input className="input" value={formData.jobReference || ""} onChange={(e) => setField("jobReference", e.target.value)} />
          <p className="muted" style={{ marginTop: -4 }}>Auto-generated — you can change it.</p>

          <label>Job start date</label>
          <input className="input" type="date" value={formData.jobStartDate || formData.jobDate || ""} onChange={(e) => setField("jobDate", e.target.value)} />

          <label>Job completed date (optional)</label>
          <input className="input" type="date" value={formData.jobCompletedDate || formData.completedDate || ""} onChange={(e) => setField("completedDate", e.target.value)} />

          <label>Job type</label>
          <select className="input" value={formData.jobType || ""} onChange={(e) => setField("jobType", e.target.value)}>
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
          <label>Customer / trade name</label>
          <input
            className="input"
            value={formData.customerTradeName || formData.customerName || customerName || ""}
            onChange={(e) => setField("customerTradeName", e.target.value)}
          />

          <label>Trade contact name</label>
          <input className="input" value={formData.tradeContactName || ""} onChange={(e) => setField("tradeContactName", e.target.value)} />

          <label>Phone</label>
          <input className="input" value={formData.customerPhone || customerPhone || ""} onChange={(e) => setField("customerPhone", e.target.value)} />

          <label>Email</label>
          <input className="input" type="email" value={formData.customerEmail || customerEmail || ""} onChange={(e) => setField("customerEmail", e.target.value)} />

          <label>Address line 1</label>
          <input className="input" value={formData.addressLine1 || ""} onChange={(e) => setField("addressLine1", e.target.value)} />

          <label>Address line 2</label>
          <input className="input" value={formData.addressLine2 || ""} onChange={(e) => setField("addressLine2", e.target.value)} />

          <label>City</label>
          <input className="input" value={formData.city || formData.town || ""} onChange={(e) => setField("city", e.target.value)} />

          <label>Postcode</label>
          <input className="input" value={formData.postcode || ""} onChange={(e) => setField("postcode", e.target.value)} />

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
          <label>Technician name</label>
          <input className="input" value={formData.technicianName || ""} onChange={(e) => setField("technicianName", e.target.value)} />

          <label>Car make / model</label>
          <input className="input" value={formData.carMakeModel || `${vehicleMake} ${vehicleModel}`.trim()} onChange={(e) => setField("carMakeModel", e.target.value)} />

          <label>Registration / chassis</label>
          <input className="input" value={formData.carRegOrChassis || formData.vehicleReg || vehicleReg || ""} onChange={(e) => setField("carRegOrChassis", e.target.value)} />

          <label>Torque setting</label>
          <input className="input" value={formData.torqueSetting || ""} onChange={(e) => setField("torqueSetting", e.target.value)} />
          <p className="muted" style={{ marginTop: -4 }}>e.g. 130Nm</p>

          <label>Tyre pressure</label>
          <input className="input" value={formData.tyrePressure || ""} onChange={(e) => setField("tyrePressure", e.target.value)} />

          <label>Notes</label>
          <textarea className="input" rows={3} value={formData.notes || ""} onChange={(e) => setField("notes", e.target.value)} />
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

          <label>Loose wheels</label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            {looseOptions.map((opt) => (
              <label key={opt} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="radio" name="looseWheels" checked={formData.looseWheels === opt} onChange={() => setField("looseWheels", opt)} />
                {opt}
              </label>
            ))}
          </div>

          <label>Service types</label>
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
          <label>Torque evidence (image/video URL)</label>
          <input className="input" value={torqueInput} onChange={(e) => setTorqueInput(e.target.value)} />

          <label>Before photos (up to 6 URLs)</label>
          <textarea className="input" rows={3} value={beforeInput} onChange={(e) => setBeforeInput(e.target.value)} />

          <label>After photos (up to 6 URLs)</label>
          <textarea className="input" rows={3} value={afterInput} onChange={(e) => setAfterInput(e.target.value)} />

          {resumeMediaHint ? <p className="muted">{resumeMediaHint}</p> : null}
        </>
      ));
    }

    return sectionCard("Step 6: Pricing + Invoice + WhatsApp + Signatures", (
      <>
        <p className="muted" style={{ marginTop: 0 }}>Preview only — server recalculates totals.</p>

        <label>Service name</label>
        <input className="input" value={formData.serviceName || ""} onChange={(e) => setField("serviceName", e.target.value)} />

        <label>Service unit price</label>
        <input className="input" type="number" value={formData.unitPrice || ""} onChange={(e) => setField("unitPrice", e.target.value, { userEdited: true })} />

        <label>Service quantity</label>
        <input className="input" type="number" value={formData.serviceQuantity || formData.quantity || 1} onChange={(e) => setField("serviceQuantity", e.target.value, { userEdited: true })} />

        <label>Discount</label>
        <input className="input" type="number" value={formData.discount || ""} onChange={(e) => setField("discount", e.target.value)} />

        <label>Price per wheel</label>
        <input className="input" type="number" value={formData.pricePerWheel || ""} onChange={(e) => setField("pricePerWheel", e.target.value)} />

        <label className="toggle-row" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={Boolean(formData.pricePerWheelMode)} onChange={(e) => setField("pricePerWheelMode", e.target.checked)} />
          <span>Sync service quantity to wheel count</span>
        </label>

        <label>Wheel count</label>
        <input className="input" type="number" value={formData.wheelCount || 0} onChange={(e) => setField("wheelCount", e.target.value)} />

        <label className="toggle-row" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={Boolean(formData.vatEnabled)} onChange={(e) => setField("vatEnabled", e.target.checked)} />
          <span>VAT enabled</span>
        </label>

        <label>VAT rate (%)</label>
        <input className="input" type="number" value={formData.vatRate || ""} onChange={(e) => setField("vatRate", e.target.value)} />

        <p className="muted">Subtotal £{totalsPreview.subtotal.toFixed(2)} • VAT £{totalsPreview.vat.toFixed(2)} • Total £{totalsPreview.total.toFixed(2)}</p>

        <label>Invoice number (optional)</label>
        <input className="input" value={formData.invoiceNumber || ""} onChange={(e) => setField("invoiceNumber", e.target.value)} />

        <label>Payment status</label>
        <select className="input" value={formData.paymentStatus || "UNPAID"} onChange={(e) => setField("paymentStatus", e.target.value)}>
          <option value="UNPAID">UNPAID</option>
          <option value="PART_PAID">PART_PAID</option>
          <option value="PAID">PAID</option>
        </select>

        <label>Payment method</label>
        <select className="input" value={formData.paymentMethod || "CARD"} onChange={(e) => setField("paymentMethod", e.target.value)}>
          <option value="CASH">CASH</option>
          <option value="CARD">CARD</option>
          <option value="BANK_TRANSFER">BANK_TRANSFER</option>
          <option value="STRIPE_LINK">STRIPE_LINK</option>
        </select>

        <label>WhatsApp message</label>
        <textarea className="input" rows={3} value={formData.whatsappMessage || ""} onChange={(e) => setField("whatsappMessage", e.target.value)} />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <button type="button" className="button secondary" onClick={sendWhatsApp}>Send WhatsApp</button>
          <button type="button" className="button secondary" onClick={skipWhatsApp}>Skip</button>
        </div>
        {whatsAppNotice ? <p className="muted">{whatsAppNotice}</p> : null}

        <label>Technician signature name</label>
        <input className="input" value={formData.technicianSignatureName || ""} onChange={(e) => setField("technicianSignatureName", e.target.value)} />

        <label>Technician signature (required)</label>
        <textarea className="input" rows={2} value={formData.technicianSignature || ""} onChange={(e) => setField("technicianSignature", e.target.value)} />

        <label>Customer signature name (optional)</label>
        <input className="input" value={formData.customerSignatureName || ""} onChange={(e) => setField("customerSignatureName", e.target.value)} />

        <label>Customer signature (optional)</label>
        <textarea className="input" rows={2} value={formData.customerSignature || ""} onChange={(e) => setField("customerSignature", e.target.value)} />
      </>
    ));
  }

  if (!wheelsFeature) {
    return (
      <DashboardShell>
        <div className="card">
          <h1>New Job</h1>
          {error && <p style={{ color: "#ff8a8a" }}>{error}</p>}
          <p className="muted" style={{ marginBottom: 12 }}>
            Wheels Form v1 is off or your primary trade is not WHEELS. Using standard quick job form.
          </p>
          <form onSubmit={submitLegacy}>
            <label>Customer name</label>
            <input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
            <label>Customer email</label>
            <input className="input" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
            <label>Customer phone</label>
            <input className="input" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            <label>Vehicle make</label>
            <input className="input" value={vehicleMake} onChange={(e) => setVehicleMake(e.target.value)} />
            <label>Vehicle model</label>
            <input className="input" value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} />
            <label>Vehicle registration</label>
            <input className="input" value={vehicleReg} onChange={(e) => setVehicleReg(e.target.value)} />
            <button className="button" type="submit">Create Job</button>
          </form>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="card">
        <h1>WHEELS Job Form v1</h1>
        <p className="muted">Friendly step-by-step form based on your Wheels template.</p>

        {guidedExperienceEnabled ? (
          <div className="card" style={{ marginBottom: 16, padding: 12, border: "1px solid rgba(79, 209, 197, 0.55)" }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
              <strong>Guided mode is ON</strong>
              <button className="button secondary" type="button" onClick={disableGuidedMode}>Turn off</button>
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

        {error && <p style={{ color: "#ff8a8a" }}>{error}</p>}
        {success ? (
          <div className="card" style={{ padding: 16, border: "1px solid #1f8f5a" }}>
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

        <form ref={formRef} onSubmit={submitWheels}>
          {guidedExperienceEnabled ? (
            <div className="card" style={{ marginBottom: 16, padding: 12 }}>
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
              <div key={group} className="card" style={{ marginBottom: 16, padding: 16 }}>
                <h3 style={{ marginTop: 0 }}>{group}</h3>
                {fields.map(renderField)}
                {group === "Pricing" ? (
                  <p className="muted">Preview total: £{totalsPreview.total.toFixed(2)}</p>
                ) : null}
              </div>
            ))
          )}

          {automationCard()}

          {guidedExperienceEnabled ? null : (
            <button className="button" type="submit" disabled={saving}>{saving ? "Saving..." : "Create Job + Generate PDF"}</button>
          )}

          <GuidedSectionNav />
        </form>
      </div>
    </DashboardShell>
  );
}
