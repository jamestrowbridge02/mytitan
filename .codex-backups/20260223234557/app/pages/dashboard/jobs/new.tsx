import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { DashboardShell } from "../../../components/dashboard-shell";
import { apiFetch } from "../../../lib/api";
import { isWheelsFormV1Enabled } from "../../../lib/feature-flags";
import { resolveGuidedMode, setGuidedMode } from "../../../lib/guided-mode";
import { useTenantSettings } from "../../../lib/tenant-settings";

type TemplateField = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  group: string;
  optionsJson?: string[];
};

const wheelKeys = ["wheel_nsf", "wheel_nsr", "wheel_osf", "wheel_osr", "wheel_spare"];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function generateRef() {
  const d = new Date();
  return `WHEELS-${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export default function NewJobPage() {
  const router = useRouter();
  const { settings } = useTenantSettings();
  const [templateFields, setTemplateFields] = useState<TemplateField[]>([]);
  const [formData, setFormData] = useState<Record<string, any>>({
    jobReference: generateRef(),
    jobDate: todayIso(),
    completedDate: todayIso(),
    jobType: "Tyre Service",
    paymentStatus: "UNPAID",
    paymentMethod: "CARD",
    vatRate: "20",
    invoiceDate: todayIso(),
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
  const [success, setSuccess] = useState<{ jobId: string; portalUrl?: string; pdfUrl?: string } | null>(null);

  const wheelsFeature = isWheelsFormV1Enabled() && settings?.primaryTrade === "WHEELS";

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
    const wheelCount = wheelKeys.reduce((count, key) => count + (formData[key] ? 1 : 0), 0);
    setFormData((prev) => ({ ...prev, wheelCount }));
  }, [formData.wheel_nsf, formData.wheel_nsr, formData.wheel_osf, formData.wheel_osr, formData.wheel_spare]);

  useEffect(() => {
    const name = (formData.customerName || customerName || "Customer").toString();
    const ref = (formData.jobReference || "job").toString();
    const date = (formData.completedDate || todayIso()).toString();
    const msg = `Hi ${name}, your wheels service ${ref} was completed on ${date}.`;
    setFormData((prev) => ({
      ...prev,
      whatsappMessage: prev.whatsappMessage || msg,
      whatsappCompletionLink:
        prev.whatsappCompletionLink || `${window?.location?.origin || "https://app.mytitan.co.uk"}/portal/job/pending`,
    }));
  }, [formData.customerName, formData.jobReference, formData.completedDate, customerName]);

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

  const guidedExperienceEnabled = wheelsFeature && guidedMode && sections.length > 0;

  function setField(key: string, value: any) {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (key === "customerName") setCustomerName(value || "");
    if (key === "customerEmail") setCustomerEmail(value || "");
    if (key === "customerPhone") setCustomerPhone(value || "");
    if (key === "vehicleMake") setVehicleMake(value || "");
    if (key === "vehicleModel") setVehicleModel(value || "");
    if (key === "vehicleReg") setVehicleReg(value || "");
  }

  function parsePhotoList(input: string) {
    return input
      .split(/\n|,/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 6);
  }

  function getMissingRequiredLabels(fields: TemplateField[]) {
    const missing: string[] = [];
    for (const field of fields) {
      if (!field.required) continue;
      const key = field.key;
      const value = formData[key];

      if (key === "beforePhotos") {
        if (parsePhotoList(beforeInput).length === 0) missing.push(field.label);
        continue;
      }

      if (key === "afterPhotos") {
        if (parsePhotoList(afterInput).length === 0) missing.push(field.label);
        continue;
      }

      if (key === "torqueEvidence") {
        if (!(torqueInput || formData.torqueEvidence)) missing.push(field.label);
        continue;
      }

      if (field.type === "checkbox" && Array.isArray(field.optionsJson) && field.optionsJson.length > 0) {
        if (!Array.isArray(value) || value.length === 0) missing.push(field.label);
        continue;
      }

      if (field.type === "checkbox") {
        if (!Boolean(value)) missing.push(field.label);
        continue;
      }

      if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
        missing.push(field.label);
      }
    }
    return missing;
  }

  function goNextSection() {
    const currentFields = sections[activeSectionIndex]?.[1] || [];
    const missing = getMissingRequiredLabels(currentFields);
    if (missing.length > 0) {
      setGuidedSectionError(`Please complete: ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? ", ..." : ""}.`);
      return;
    }

    setGuidedSectionError("");
    setActiveSectionIndex((prev) => Math.min(prev + 1, sections.length - 1));
  }

  function goBackSection() {
    setGuidedSectionError("");
    setActiveSectionIndex((prev) => Math.max(prev - 1, 0));
  }

  function disableGuidedMode() {
    setGuidedMode(false);
    setGuidedModeState(false);
    if (typeof window === "undefined") return;
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("guided");
    window.location.href = nextUrl.toString();
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
          <label>{field.label} (image URL or data URL)</label>
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
          onChange={(e) => setField(key, e.target.value)}
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
        {activeSectionIndex < sections.length - 1 ? (
          <button className="button" type="button" onClick={goNextSection}>Next</button>
        ) : null}
        <p className="muted" style={{ margin: 0, alignSelf: "center" }}>
          Section {activeSectionIndex + 1} of {sections.length}
        </p>
      </div>
    );
  }

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

    if (!formData.jobReference || !formData.jobDate || !formData.jobType || !customerName) {
      setSaving(false);
      setError("Please complete job reference, date, job type, and customer name.");
      return;
    }

    if (!formData.technicianName || !formData.technicianSignatureName || !formData.technicianSignature) {
      setSaving(false);
      setError("Technician name and signature are required.");
      return;
    }

    const payloadForm = {
      ...formData,
      customerName,
      customerEmail,
      customerPhone,
      vehicleMake,
      vehicleModel,
      vehicleReg,
      beforePhotos: parsePhotoList(beforeInput),
      afterPhotos: parsePhotoList(afterInput),
      torqueEvidence: torqueInput || formData.torqueEvidence || "",
      wheelCount: Number(formData.wheelCount || 0),
      quantity: Number(formData.quantity || 1),
      unitPrice: Number(formData.unitPrice || 0),
      pricePerWheel: Number(formData.pricePerWheel || 0),
      discount: Number(formData.discount || 0),
      vatEnabled: Boolean(formData.vatEnabled),
      vatRate: Number(formData.vatRate || 0),
    };

    try {
      const created = await apiFetch("/jobs", {
        method: "POST",
        body: JSON.stringify({
          customerName,
          customerEmail: customerEmail || undefined,
          customerPhone: customerPhone || undefined,
          vehicleMake: vehicleMake || undefined,
          vehicleModel: vehicleModel || undefined,
          vehicleReg: vehicleReg || undefined,
          serviceName: (payloadForm as any).serviceName || "Wheels Job",
          tradeCode: "WHEELS",
          jobType: (payloadForm as any).jobType,
          formData: payloadForm,
        }),
      });

      const pdf = await apiFetch(`/jobs/${created.id}/pdf`, { method: "POST" }).catch(() => null);
      const pdfUrl = pdf?.url || created?.pdf?.url;
      const token = typeof pdfUrl === "string" && pdfUrl.startsWith("/public/job/") ? pdfUrl.split("/")[3] : null;
      const portalUrl = token ? `/portal/job/${token}` : undefined;
      setSuccess({ jobId: created.id, portalUrl, pdfUrl });
    } catch (err: any) {
      setError(err.message || "Failed to create Wheels job");
    } finally {
      setSaving(false);
    }
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

        {error && <p style={{ color: "#ff8a8a" }}>{error}</p>}
        {success ? (
          <div className="card" style={{ padding: 16, border: "1px solid #1f8f5a" }}>
            <h3>Job created</h3>
            <p>Job ID: {success.jobId}</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/dashboard/jobs" className="button">Back to Jobs</Link>
              {success.portalUrl ? <Link href={success.portalUrl} className="button secondary">Open customer portal</Link> : null}
              {success.pdfUrl ? <a href={success.pdfUrl} className="button secondary" target="_blank" rel="noreferrer">Open PDF</a> : null}
            </div>
          </div>
        ) : null}

        <form onSubmit={submitWheels}>
          <GuidedSectionNav />
          {guidedExperienceEnabled && guidedSectionError ? <p style={{ color: "#ffb84d" }}>{guidedSectionError}</p> : null}

          {sections.map(([group, fields], index) => {
            const isOpen = !guidedExperienceEnabled || index === activeSectionIndex;

            return (
              <div key={group} className="card" style={{ marginBottom: 16, padding: 16 }}>
                {guidedExperienceEnabled ? (
                  <button
                    type="button"
                    className="button secondary"
                    style={{ width: "100%", textAlign: "left", marginBottom: isOpen ? 12 : 0 }}
                    aria-expanded={isOpen}
                    onClick={() => {
                      setGuidedSectionError("");
                      setActiveSectionIndex(index);
                    }}
                  >
                    {group}
                  </button>
                ) : (
                  <h3 style={{ marginTop: 0 }}>{group}</h3>
                )}

                {isOpen ? (
                  <>
                    {fields.map(renderField)}
                    {group === "Pricing" ? (
                      <p className="muted">
                        Preview total: £{(
                          Math.max(0, ((Number(formData.unitPrice || 0) * Number(formData.quantity || 1)) +
                          (Number(formData.pricePerWheel || 0) * Number(formData.wheelCount || 0)) -
                          Number(formData.discount || 0))) *
                          (Boolean(formData.vatEnabled) ? 1 + Number(formData.vatRate || 0) / 100 : 1)
                        ).toFixed(2)}
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>
            );
          })}

          <GuidedSectionNav />
          <button className="button" type="submit" disabled={saving}>{saving ? "Saving..." : "Create Job + Generate PDF"}</button>
        </form>
      </div>
    </DashboardShell>
  );
}
