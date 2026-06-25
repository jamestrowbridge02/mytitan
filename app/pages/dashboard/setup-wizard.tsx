import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { DashboardShell } from "../../components/dashboard-shell";
import { apiFetch, getApiBase, getToken } from "../../lib/api";
import { isGuidedSetupV2Enabled } from "../../lib/feature-flags";
import LaunchReadinessControls from "../../components/phase6b/LaunchReadinessControls";
import { UPLOAD_LIMITS, validateUploadFile } from "../../lib/upload-policy";

const API_BASE = getApiBase();

const DEFAULT_SERVICES = [
  { key: "diamond_cut", name: "Diamond Cut", unitPrice: 140, vatEligible: true },
  { key: "painted", name: "Painted", unitPrice: 120, vatEligible: true },
  { key: "smart_repair", name: "Smart Repair", unitPrice: 95, vatEligible: true },
  { key: "powder_coat", name: "Powder Coat", unitPrice: 150, vatEligible: true },
  { key: "welding", name: "Welding", unitPrice: 110, vatEligible: true },
  { key: "straightening", name: "Straightening", unitPrice: 85, vatEligible: true },
  { key: "locking_nut_removal", name: "Locking Nut Removal", unitPrice: 45, vatEligible: true },
];

const steps = [
  { key: "template", title: "Choose your job sheet" },
  { key: "branding", title: "Business details" },
  { key: "services", title: "Services" },
  { key: "operations", title: "Hours and pricing" },
  { key: "payments", title: "Billing and payments" },
  { key: "ready", title: "Ready" },
] as const;

const phase6OnboardingPath = [
  { key: "business", label: "Business profile", href: "/dashboard/setup-wizard?step=branding" },
  { key: "locations", label: "Location", href: "/dashboard/locations" },
  { key: "services", label: "Service folder and service", href: "/dashboard/setup-wizard?step=services" },
  { key: "job_sheet", label: "Job sheet template", href: "/dashboard/setup-wizard?step=template" },
  { key: "booking", label: "Weekly availability", href: "/dashboard/booking/settings" },
  { key: "portal", label: "Portal settings", href: "/dashboard/portal" },
  { key: "payments", label: "Payments", href: "/dashboard/settings/payments/stripe" },
  { key: "team", label: "Team invite", href: "/dashboard/users" },
  { key: "import", label: "Import data", href: "#phase6-import-wizard" },
  { key: "golive", label: "Go-live checklist", href: "/dashboard/settings/launch-control" },
  { key: "branding", label: "Logo and branding", href: "/dashboard/setup-wizard?step=branding" },
  { key: "booking_link", label: "Public booking link", href: "/dashboard/booking/settings" },
  { key: "customer_fields", label: "Customer fields", href: "/dashboard/settings?tab=customers" },
  { key: "invoices", label: "Invoices", href: "/dashboard/settings?tab=finance" },
  { key: "first_booking", label: "First booking", href: "/dashboard/bookings" },
];

const OPERATING_DAYS = [
  { dayOfWeek: 1, shortLabel: "Mon" },
  { dayOfWeek: 2, shortLabel: "Tue" },
  { dayOfWeek: 3, shortLabel: "Wed" },
  { dayOfWeek: 4, shortLabel: "Thu" },
  { dayOfWeek: 5, shortLabel: "Fri" },
  { dayOfWeek: 6, shortLabel: "Sat" },
  { dayOfWeek: 0, shortLabel: "Sun" },
] as const;

const normalizeList = (value: unknown) =>
  Array.from(new Set((Array.isArray(value) ? value : []).map((entry) => String(entry || "").trim()).filter(Boolean)));

const formatMinuteOfDay = (value: number) => {
  const hour = Math.max(0, Math.min(23, Math.floor(value / 60)));
  const minute = Math.max(0, Math.min(59, value % 60));
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const minuteOfDay = (value: string) => {
  const [hour, minute] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return NaN;
  return hour * 60 + minute;
};

export default function SetupWizard() {
  const router = useRouter();
  const guidedEnabled = isGuidedSetupV2Enabled();
  const [status, setStatus] = useState<any>(null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [skippedSteps, setSkippedSteps] = useState<string[]>([]);
  const [templateLibrary, setTemplateLibrary] = useState<any>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState("blank");

  const [branding, setBranding] = useState<any>({
    companyName: "",
    logoUrl: "",
    brandPrimaryColor: "#4fd1c5",
    brandSecondaryColor: "#1a1f36",
    brandAccentColor: "#4fd1c5",
    supportEmail: "",
    supportPhone: "",
  });
  const brandingRef = useRef<any>({
    companyName: "",
    logoUrl: "",
    brandPrimaryColor: "#4fd1c5",
    brandSecondaryColor: "#1a1f36",
    brandAccentColor: "#4fd1c5",
    supportEmail: "",
    supportPhone: "",
  });

  const [services, setServices] = useState<any[]>([]);
  const [charging, setCharging] = useState<any>({
    pricePerWheel: true,
    vatEnabled: false,
    vatRate: 20,
    defaultTorqueSetting: "",
    defaultTyrePressure: "",
  });
  const [bookingPublicEnabled, setBookingPublicEnabled] = useState(false);
  const [operatingDays, setOperatingDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startHour, setStartHour] = useState("09:00");
  const [endHour, setEndHour] = useState("17:00");
  const [enablePayments, setEnablePayments] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [logoUploadState, setLogoUploadState] = useState<"idle" | "uploading" | "saved" | "error">("idle");

  const updateBranding = (next: any) => {
    brandingRef.current = next;
    setBranding(next);
  };

  const loadStatus = useCallback(async () => {
    const data = await apiFetch("/guided-setup/status");
    setStatus(data);
    setCompletedSteps(normalizeList(data?.completedSteps));
    setSkippedSteps(normalizeList(data?.skippedSteps));
    const nextBranding = {
      companyName: data?.branding?.companyName || "",
      logoUrl: data?.branding?.logoUrl || "",
      brandPrimaryColor: data?.branding?.brandPrimaryColor || "#4fd1c5",
      brandSecondaryColor: data?.branding?.brandSecondaryColor || "#1a1f36",
      brandAccentColor: data?.branding?.brandAccentColor || data?.branding?.brandPrimaryColor || "#4fd1c5",
      supportEmail: data?.supportEmail || "",
      supportPhone: data?.supportPhone || "",
    };
    brandingRef.current = nextBranding;
    setBranding(nextBranding);
    setTemplateLibrary(data?.templateLibrary || null);
    setSelectedTemplateId(String(data?.activeJobSheetTemplateId || data?.templateLibrary?.activeTemplate?.id || "blank"));
    setServices(
      Array.isArray(data?.services) && data.services.length > 0
        ? data.services.map((svc: any) => ({
            key: svc.key || svc.name?.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
            name: svc.name,
            unitPrice: Number(svc.unitPrice ?? 0),
            vatEligible: Boolean(svc.vatEligible),
            enabled: Boolean(svc.enabled),
          }))
        : DEFAULT_SERVICES.map((svc) => ({ ...svc, enabled: true })),
    );
    setCharging({
      pricePerWheel: Boolean(data?.chargingDefaults?.pricePerWheel),
      vatEnabled: Boolean(data?.chargingDefaults?.vatEnabled),
      vatRate: Number(data?.chargingDefaults?.vatRateBps ?? 2000) / 100,
      defaultTorqueSetting: data?.chargingDefaults?.defaultTorqueSetting || "",
      defaultTyrePressure: data?.chargingDefaults?.defaultTyrePressure || "",
    });
    const businessHours = Array.isArray(data?.calendar?.businessHours) ? data.calendar.businessHours : [];
    const normalizedDays = normalizeList(businessHours.map((entry: any) => Number(entry?.dayOfWeek)))
      .map((entry) => Number(entry))
      .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 6);
    const weekdayHours = businessHours.find((entry: any) => Number(entry?.dayOfWeek) === 1) || businessHours[0] || null;
    setBookingPublicEnabled(Boolean(data?.calendar?.bookingPublicEnabled));
    setOperatingDays(normalizedDays.length ? normalizedDays : [1, 2, 3, 4, 5]);
    setStartHour(
      weekdayHours && Number.isFinite(Number(weekdayHours.startMinute))
        ? formatMinuteOfDay(Number(weekdayHours.startMinute))
        : "09:00",
    );
    setEndHour(
      weekdayHours && Number.isFinite(Number(weekdayHours.endMinute))
        ? formatMinuteOfDay(Number(weekdayHours.endMinute))
        : "17:00",
    );
    setEnablePayments(Boolean(data?.paymentsEnabled));

    const requestedStepKey = typeof router.query.step === "string" ? router.query.step.trim().toLowerCase() : "";
    const requestedStepIndex = steps.findIndex((entry) => entry.key === requestedStepKey);
    const currentStep = requestedStepIndex >= 0 ? requestedStepIndex : Number(data?.currentStep ?? 0);
    const maxStep = steps.length - 1;
    setStep(Number.isFinite(currentStep) ? Math.max(0, Math.min(currentStep, maxStep)) : 0);
  }, [router.query.step]);

  useEffect(() => {
    if (!guidedEnabled) return;
    loadStatus().catch((err: any) => {
      setError("We could not load setup right now.");
    });
  }, [guidedEnabled, loadStatus]);

  const uploadLogo = async (file: File) => {
    const validationError = validateUploadFile(file, { category: "image", maxBytes: UPLOAD_LIMITS.logo });
    if (validationError) throw new Error(validationError);
    setLogoUploadState("uploading");
    const formData = new FormData();
    formData.append("file", file);
    const token = getToken();
    const res = await fetch(`${API_BASE}/tenant/settings/logo`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setLogoUploadState("error");
      throw new Error(data?.message || "Logo upload failed");
    }
    updateBranding({ ...brandingRef.current, logoUrl: data?.logoUrl || brandingRef.current.logoUrl });
    setLogoUploadState("saved");
  };

  const persistStep = async (
    stepNumber: number,
    payload: Record<string, any>,
    options?: { skipped?: boolean; goBack?: boolean; saveAndExit?: boolean },
  ) => {
    setSaving(true);
    setError("");
    try {
      await apiFetch("/guided-setup/step", {
        method: "POST",
        body: JSON.stringify({ step: stepNumber, data: payload, skipped: Boolean(options?.skipped) }),
      });
      await loadStatus();
      if (options?.goBack) {
        setStep((prev) => Math.max(prev - 1, 0));
      } else if (!options?.saveAndExit) {
        setStep(Math.min(stepNumber + 1, steps.length - 1));
      }
      if (options?.saveAndExit) {
        router.push("/dashboard");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to save step");
    } finally {
      setSaving(false);
    }
  };

  const completeSetup = async () => {
    setSaving(true);
    setError("");
    try {
      const result = await apiFetch("/guided-setup/complete", { method: "POST" });
      const nextUrl = result?.nextUrl || "/dashboard";
      router.push(nextUrl);
    } catch (err: any) {
      setError(err?.message || "Failed to complete setup");
    } finally {
      setSaving(false);
    }
  };

  const stepState = useMemo(() => {
    const key = steps[step]?.key;
    if (!key) return "pending";
    if (completedSteps.includes(key)) return "done";
    if (skippedSteps.includes(key)) return "skipped";
    return "pending";
  }, [step, completedSteps, skippedSteps]);

  if (!guidedEnabled) {
    return (
      <DashboardShell>
        <div className="card">
          <h1>Setup</h1>
          <p className="muted">Setup is not turned on in this workspace.</p>
        </div>
      </DashboardShell>
    );
  }

  const renderControls = (stepNumber: number, payload: Record<string, any>) => {
    const isLast = stepNumber === steps.length - 1;
    const nextDisabled = saving || (stepNumber === 3 && !businessHoursPayload);
    return (
      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <button
          className="button"
          onClick={() => (isLast ? completeSetup() : persistStep(stepNumber, payload))}
          disabled={nextDisabled}
        >
          {isLast ? "Finish setup" : "Save and continue"}
        </button>
        <button
          className="button secondary"
          onClick={() => setStep((prev) => Math.max(prev - 1, 0))}
          disabled={saving || stepNumber === 0}
        >
          Go back
        </button>
        <button className="button secondary" onClick={() => persistStep(stepNumber, {}, { skipped: true })} disabled={saving}>
          Skip this step
        </button>
        <button className="button secondary" onClick={() => persistStep(stepNumber, payload, { saveAndExit: true })} disabled={saving}>
          Save and exit
        </button>
      </div>
    );
  };

  const businessHoursPayload = useMemo(() => {
    const startMinute = minuteOfDay(startHour);
    const endMinute = minuteOfDay(endHour);
    if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute) || endMinute <= startMinute || operatingDays.length === 0) {
      return null;
    }
    return operatingDays
      .slice()
      .sort((left, right) => left - right)
      .map((dayOfWeek) => ({ dayOfWeek, startMinute, endMinute }));
  }, [operatingDays, startHour, endHour]);

  const getCurrentPayload = () => {
    if (step === 0) return { templateId: selectedTemplateId };
    if (step === 1) return brandingRef.current;
    if (step === 2) return { services };
    if (step === 3) return { ...charging, bookingPublicEnabled, businessHours: businessHoursPayload || [] };
    if (step === 4) return { enablePayments };
    return {};
  };

  return (
    <DashboardShell>
      <section className="card" style={{ marginBottom: 16 }} data-testid="phase6-onboarding-wizard">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <p className="operator-eyebrow">Launch onboarding</p>
            <h1 style={{ marginTop: 0 }}>Get operational in 15 minutes</h1>
            <p className="muted">
              Finish the essentials in one path: profile, locations, services, job sheet, bookings, portal, payments, team, import, and go-live.
            </p>
          </div>
          <Link className="button secondary" href="/dashboard/settings/launch-control">Open go-live checklist</Link>
        </div>
        <div className="operator-grid operator-grid--five" style={{ marginTop: 14 }}>
          {phase6OnboardingPath.map((item, index) => (
            <a className="operator-mini-card mt-linkCard" href={item.href} key={item.key} data-testid={`phase6-onboarding-step-${item.key}`}>
              <span className="operator-tag">Step {index + 1}</span>
              <strong>{item.label}</strong>
              <span className="mt-linkCard__action">Open action</span>
              <span className="muted">Saved or complete status appears on the linked setup surface.</span>
            </a>
          ))}
        </div>
      </section>

      <LaunchReadinessControls />

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <h1>Set up your workspace</h1>
            <p className="muted">Step {step + 1} of {steps.length}: {steps[step].title}</p>
            <p className="muted">Follow these steps to set up the workspace, open the booking path, complete the first job, send the result, and get paid.</p>
            <p className="muted">Status: {stepState === "done" ? "Done" : stepState === "skipped" ? "Skipped" : "In progress"}</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link className="button secondary" href="/dashboard/settings" data-testid="guided-setup-rerun-settings">
              Review in settings
            </Link>
            <button
              className="button secondary"
              type="button"
              onClick={() => persistStep(step, getCurrentPayload(), { saveAndExit: true })}
              disabled={saving || (step === 3 && !businessHoursPayload)}
              data-testid="guided-setup-save-exit-header"
            >
              Save and exit
            </button>
          </div>
        </div>
        {error ? <p style={{ color: "#ff8a8a" }}>{error}</p> : null}
      </div>

      {step === 0 ? (
        <div className="card">
          <h2>Choose your starting job sheet</h2>
          <p className="muted">Pick the closest template now, then refine it later in Settings &gt; Work &amp; Job Sheet without losing control of the live authority flow.</p>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginTop: 16 }}>
            {(templateLibrary?.templates || []).map((template: any) => {
              const active = selectedTemplateId === template.id;
              const preview = template?.payload || {};
              return (
                <button
                  key={template.id}
                  type="button"
                  className="tab-button settings-tab-button"
                  style={{ textAlign: "left", borderColor: active ? "#0f766e" : undefined, background: active ? "rgba(15,118,110,0.08)" : undefined }}
                  onClick={() => setSelectedTemplateId(template.id)}
                  data-testid={`guided-setup-template-${String(template.key || template.id)}`}
                >
                  <em style={{ fontStyle: "normal", fontSize: 12, letterSpacing: "0.04em", textTransform: "uppercase", color: "#0f766e" }}>
                    {template.tradeCategory || "GENERAL"}
                  </em>
                  <strong>{template.name}</strong>
                  <span>{template.description || "Start from a safe service record structure."}</span>
                  <span>
                    {(preview.serviceTypes || []).length} service types • {(preview.sections || []).length} sections • {(preview.fields || []).length} fields
                  </span>
                </button>
              );
            })}
          </div>
          <p className="muted" style={{ marginTop: 14, marginBottom: 0 }}>
            Deeper customisation lives in <strong>Settings &gt; Work &amp; Job Sheet</strong> after setup.
          </p>
          {renderControls(0, { templateId: selectedTemplateId })}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="card">
          <h2>Your business</h2>
          <p className="muted">Add the basics customers will recognise first. You can refine branding later.</p>
          <label>Business name</label>
          <input className="input" value={branding.companyName} onChange={(e) => updateBranding({ ...brandingRef.current, companyName: e.target.value })} data-testid="guided-setup-company-name" />

          <label style={{ marginTop: 12 }}>Logo (upload)</label>
          <input
            id="guided-setup-logo-file"
            className="visually-hidden"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              if (!file) return;
              const validationError = validateUploadFile(file, { category: "image", maxBytes: UPLOAD_LIMITS.logo });
              if (validationError) {
                setError(validationError);
                e.currentTarget.value = "";
                return;
              }
              if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
              setLogoFile(file);
              setLogoPreviewUrl(URL.createObjectURL(file));
              setLogoUploadState("idle");
            }}
          />
          <div className="operator-inline-actions" style={{ marginTop: 8 }}>
            <label className="button secondary" htmlFor="guided-setup-logo-file">Choose image</label>
            <span data-testid="guided-setup-logo-file-name">{logoFile?.name || "No image selected"}</span>
          </div>
          {logoFile ? (
            <div style={{ marginTop: 10 }}>
              <img src={logoPreviewUrl} alt="Selected logo preview" style={{ width: 180, height: 90, objectFit: "contain", display: "block" }} />
              <p className="muted">{(logoFile.size / 1024).toFixed(1)} KB selected</p>
              <div className="operator-inline-actions">
                <button className="button secondary" type="button" disabled={logoUploadState === "uploading"} onClick={() => {
                  uploadLogo(logoFile).catch((err) => setError(err.message || "Logo upload failed"));
                }}>{logoUploadState === "uploading" ? "Uploading..." : "Upload logo"}</button>
                <button className="button secondary" type="button" onClick={() => {
                  if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
                  setLogoFile(null);
                  setLogoPreviewUrl("");
                  setLogoUploadState("idle");
                }}>Clear</button>
              </div>
              {logoUploadState === "saved" ? <p role="status">Logo saved.</p> : null}
              {logoUploadState === "error" ? <p role="alert">Logo upload failed. Your selected file is still available to retry.</p> : null}
            </div>
          ) : null}

          <label style={{ marginTop: 12 }}>Logo link (optional)</label>
          <input className="input" value={branding.logoUrl} onChange={(e) => updateBranding({ ...brandingRef.current, logoUrl: e.target.value })} />

          <label style={{ marginTop: 12 }}>Main color</label>
          <input className="input" value={branding.brandPrimaryColor} onChange={(e) => updateBranding({ ...brandingRef.current, brandPrimaryColor: e.target.value })} />

          <label style={{ marginTop: 12 }}>Support email</label>
          <input className="input" value={branding.supportEmail} onChange={(e) => updateBranding({ ...brandingRef.current, supportEmail: e.target.value })} />

          <label style={{ marginTop: 12 }}>Support phone</label>
          <input className="input" value={branding.supportPhone} onChange={(e) => updateBranding({ ...brandingRef.current, supportPhone: e.target.value })} />

          {renderControls(1, branding)}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="card">
          <h2>Your services</h2>
          <p className="muted">Choose what you offer and set starting prices so the first job is fast to create.</p>
          <div style={{ marginBottom: 12 }}>
            <button className="button secondary" onClick={() => setServices(DEFAULT_SERVICES.map((svc) => ({ ...svc, enabled: true })))}>
              Use starter services
            </button>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {services.map((service, idx) => (
              <div key={service.key || service.name} className="integration-card" style={{ padding: 12 }}>
                <div style={{ flex: 1 }}>
                  <strong>{service.name}</strong>
                </div>
                <div style={{ display: "grid", gap: 6, minWidth: 180 }}>
                  <label style={{ margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(service.enabled)}
                      onChange={(e) => {
                        const next = [...services];
                        next[idx] = { ...next[idx], enabled: e.target.checked };
                        setServices(next);
                      }}
                    /> Turn on this service
                  </label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={service.unitPrice}
                    onChange={(e) => {
                      const next = [...services];
                      next[idx] = { ...next[idx], unitPrice: Number(e.target.value || 0) };
                      setServices(next);
                    }}
                  />
                  <label style={{ margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(service.vatEligible)}
                      onChange={(e) => {
                        const next = [...services];
                        next[idx] = { ...next[idx], vatEligible: e.target.checked };
                        setServices(next);
                      }}
                    /> VAT applies
                  </label>
                </div>
              </div>
            ))}
          </div>
          {renderControls(2, { services })}
        </div>
      ) : null}

      {step === 3 ? (
        <div className="card">
          <h2>Working hours and pricing</h2>
          <p className="muted">Set the defaults that make bookings and job creation feel ready on day one.</p>
          <label style={{ marginBottom: 8 }}>
            <input type="checkbox" checked={charging.pricePerWheel} onChange={(e) => setCharging({ ...charging, pricePerWheel: e.target.checked })} />
            Price per wheel by default
          </label>
          <label style={{ marginTop: 12 }}>
            <input type="checkbox" checked={charging.vatEnabled} onChange={(e) => setCharging({ ...charging, vatEnabled: e.target.checked })} />
            Turn VAT on
          </label>
          <label style={{ marginTop: 12 }}>VAT rate (%)</label>
          <input className="input" type="number" min={0} value={charging.vatRate} onChange={(e) => setCharging({ ...charging, vatRate: Number(e.target.value || 0) })} />
          <label style={{ marginTop: 12 }}>Default torque setting (optional)</label>
          <input className="input" value={charging.defaultTorqueSetting} onChange={(e) => setCharging({ ...charging, defaultTorqueSetting: e.target.value })} />
          <label style={{ marginTop: 12 }}>Default tyre pressure (optional)</label>
          <input className="input" value={charging.defaultTyrePressure} onChange={(e) => setCharging({ ...charging, defaultTyrePressure: e.target.value })} />
          <div className="integration-card" style={{ marginTop: 16, padding: 16 }} data-testid="guided-setup-calendar-step">
            <h3 style={{ marginTop: 0 }}>Booking hours</h3>
            <p className="muted">These hours set your first booking calendar. You can change them later without affecting the rest of setup.</p>
            <label style={{ marginBottom: 8 }}>
              <input type="checkbox" checked={bookingPublicEnabled} onChange={(e) => setBookingPublicEnabled(e.target.checked)} />
              Let people request bookings during these hours
            </label>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <div>
                <label>Start time</label>
                <input className="input" type="time" value={startHour} onChange={(e) => setStartHour(e.target.value)} data-testid="guided-setup-start-time" />
              </div>
              <div>
                <label>End time</label>
                <input className="input" type="time" value={endHour} onChange={(e) => setEndHour(e.target.value)} data-testid="guided-setup-end-time" />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={{ display: "block", marginBottom: 8 }}>Working days</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} data-testid="guided-setup-operating-days">
                {OPERATING_DAYS.map((day) => {
                  const active = operatingDays.includes(day.dayOfWeek);
                  return (
                    <button
                      key={day.dayOfWeek}
                      type="button"
                      className={`tab-button ${active ? "active" : ""}`}
                      onClick={() =>
                        setOperatingDays((prev) =>
                          prev.includes(day.dayOfWeek)
                            ? prev.filter((entry) => entry !== day.dayOfWeek)
                            : [...prev, day.dayOfWeek],
                        )
                      }
                      aria-pressed={active}
                    >
                      {day.shortLabel}
                    </button>
                  );
                })}
              </div>
            </div>
            {!businessHoursPayload ? <p style={{ color: "#ff8a8a", marginBottom: 0 }}>Choose at least one working day, and make sure the end time is later than the start time.</p> : null}
          </div>
          {renderControls(3, { ...charging, bookingPublicEnabled, businessHours: businessHoursPayload || [] })}
        </div>
      ) : null}

      {step === 4 ? (
        <div className="card">
          <h2>Payments</h2>
          {status?.stripeConfigured ? (
            <p className="muted">Stripe is connected. Turn on payments here, then fine-tune anything else in billing.</p>
          ) : (
            <p className="muted">Stripe is not connected yet, so online payments are not ready. You can still run jobs and publish service records now.</p>
          )}
          <div className="integration-card" style={{ padding: 16, marginBottom: 12 }} data-testid="guided-setup-billing-step">
              <strong>{status?.stripeConfigured ? "Stripe is ready" : "Stripe is not ready"}</strong>
              <p className="muted" style={{ marginBottom: 12 }}>
              {status?.stripeConfigured
                ? "Customers can pay through Stripe as soon as you turn payments on for this workspace."
                : "Connect Stripe first. Payments will stay off until that is done."}
              </p>
            <p className="muted" style={{ marginBottom: 12 }}>
              Manual follow-up stays available if you want to collect after the booking or after the job is complete.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link className="button secondary" href="/dashboard/billing">Open billing</Link>
              <Link className="button secondary" href="/dashboard/billing/readiness">Check payment readiness</Link>
            </div>
          </div>
          <label style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={enablePayments} onChange={(e) => setEnablePayments(e.target.checked)} disabled={!status?.stripeConfigured} data-testid="guided-setup-enable-payments" />
            Turn on online payments
          </label>
          {!status?.stripeConfigured ? <p className="muted">This stays off until Stripe is connected.</p> : null}
          {renderControls(4, { enablePayments })}
        </div>
      ) : null}

      {step === 5 ? (
        <div className="card">
          <h2>You&apos;re ready</h2>
          <p className="muted">Your workspace basics are ready. Now run the first full path: create or receive the booking, complete the job, send the result, and follow up for payment.</p>
          <div style={{ display: "grid", gap: 12 }}>
            <Link className="button" href="/dashboard/booking/settings">Open booking setup</Link>
            <Link className="button secondary" href="/dashboard/jobs/new?guided=1">Create your first job</Link>
            <Link className="button secondary" href="/dashboard/work">Open work queue</Link>
            <Link className="button secondary" href="/dashboard/jobs">Open jobs workspace</Link>
            <Link className="button secondary" href="/dashboard/calendar">Open calendar</Link>
            <Link className="button secondary" href="/dashboard">Open dashboard</Link>
          </div>
          <div className="integration-card" style={{ marginTop: 16, padding: 16 }}>
            <strong>Suggested first run</strong>
            <p className="muted" style={{ marginBottom: 0 }}>
              1. Share your booking link. 2. Receive or create the first booking or job. 3. Complete the work. 4. Send the result. 5. Collect payment through Stripe or manual follow-up.
            </p>
          </div>
          {renderControls(5, {})}
        </div>
      ) : null}
    </DashboardShell>
  );
}
