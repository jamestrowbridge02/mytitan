import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { DashboardShell } from "../../components/dashboard-shell";
import { apiFetch, getApiBase, getToken } from "../../lib/api";
import { isGuidedSetupV2Enabled } from "../../lib/feature-flags";

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
  { key: "trade", title: "Confirm your trade" },
  { key: "branding", title: "Business details" },
  { key: "services", title: "Services" },
  { key: "operations", title: "Hours and pricing" },
  { key: "payments", title: "Billing and payments" },
  { key: "ready", title: "Ready" },
] as const;

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

    const currentStep = Number(data?.currentStep ?? 0);
    const maxStep = steps.length - 1;
    setStep(Number.isFinite(currentStep) ? Math.max(0, Math.min(currentStep, maxStep)) : 0);
  }, []);

  useEffect(() => {
    if (!guidedEnabled) return;
    loadStatus().catch((err: any) => {
      setError(err?.message || "Failed to load guided setup");
    });
  }, [guidedEnabled, loadStatus]);

  const uploadLogo = async (file: File) => {
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
      throw new Error(data?.message || "Logo upload failed");
    }
    updateBranding({ ...brandingRef.current, logoUrl: data?.logoUrl || brandingRef.current.logoUrl });
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
          <p className="muted">The guided setup flow is not turned on in this environment.</p>
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
          {isLast ? "Finish setup" : "Next"}
        </button>
        <button
          className="button secondary"
          onClick={() => setStep((prev) => Math.max(prev - 1, 0))}
          disabled={saving || stepNumber === 0}
        >
          Back
        </button>
        <button className="button secondary" onClick={() => persistStep(stepNumber, {}, { skipped: true })} disabled={saving}>
          Skip for now
        </button>
        <button className="button secondary" onClick={() => persistStep(stepNumber, payload, { saveAndExit: true })} disabled={saving}>
          Save & exit for now
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
    if (step === 0) return { trade: "WHEELS" };
    if (step === 1) return brandingRef.current;
    if (step === 2) return { services };
    if (step === 3) return { ...charging, bookingPublicEnabled, businessHours: businessHoursPayload || [] };
    if (step === 4) return { enablePayments };
    return {};
  };

  return (
    <DashboardShell>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <h1>Guided setup</h1>
            <p className="muted">Step {step + 1} of {steps.length}: {steps[step].title}</p>
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
          <h2>Confirm your trade</h2>
          <p className="muted">We will set your main trade to Wheels and load the matching setup for you.</p>
          {renderControls(0, { trade: "WHEELS" })}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="card">
          <h2>Business details</h2>
          <p className="muted">Add your business name, logo, and contact details so customers recognise you right away.</p>
          <label>Business name</label>
          <input className="input" value={branding.companyName} onChange={(e) => updateBranding({ ...brandingRef.current, companyName: e.target.value })} data-testid="guided-setup-company-name" />

          <label style={{ marginTop: 12 }}>Logo (upload)</label>
          <input
            type="file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadLogo(file).catch((err) => setError(err.message || "Logo upload failed"));
            }}
          />

          <label style={{ marginTop: 12 }}>Logo URL (optional)</label>
          <input className="input" value={branding.logoUrl} onChange={(e) => updateBranding({ ...brandingRef.current, logoUrl: e.target.value })} />

          <label style={{ marginTop: 12 }}>Primary color</label>
          <input className="input" value={branding.brandPrimaryColor} onChange={(e) => updateBranding({ ...brandingRef.current, brandPrimaryColor: e.target.value })} />

          <label style={{ marginTop: 12 }}>Support email</label>
          <input className="input" value={branding.supportEmail} onChange={(e) => updateBranding({ ...brandingRef.current, supportEmail: e.target.value })} />

          <label style={{ marginTop: 12 }}>Support phone (WhatsApp)</label>
          <input className="input" value={branding.supportPhone} onChange={(e) => updateBranding({ ...brandingRef.current, supportPhone: e.target.value })} />

          {renderControls(1, branding)}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="card">
          <h2>Services</h2>
          <p className="muted">Choose the services you offer and set your starting prices.</p>
          <div style={{ marginBottom: 12 }}>
            <button className="button secondary" onClick={() => setServices(DEFAULT_SERVICES.map((svc) => ({ ...svc, enabled: true })))}>
              Use Wheels defaults
            </button>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {services.map((service, idx) => (
              <div key={service.key || service.name} className="integration-card" style={{ padding: 12 }}>
                <div style={{ flex: 1 }}>
                  <strong>{service.name}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>Key: {service.key}</div>
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
                    /> Enabled
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
                    /> VAT eligible
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
          <h2>Charging and calendar</h2>
          <p className="muted">Set your default pricing and the hours customers can book against.</p>
          <label style={{ marginBottom: 8 }}>
            <input type="checkbox" checked={charging.pricePerWheel} onChange={(e) => setCharging({ ...charging, pricePerWheel: e.target.checked })} />
            Price per wheel by default
          </label>
          <label style={{ marginTop: 12 }}>
            <input type="checkbox" checked={charging.vatEnabled} onChange={(e) => setCharging({ ...charging, vatEnabled: e.target.checked })} />
            VAT enabled
          </label>
          <label style={{ marginTop: 12 }}>VAT rate (%)</label>
          <input className="input" type="number" min={0} value={charging.vatRate} onChange={(e) => setCharging({ ...charging, vatRate: Number(e.target.value || 0) })} />
          <label style={{ marginTop: 12 }}>Default torque setting (optional)</label>
          <input className="input" value={charging.defaultTorqueSetting} onChange={(e) => setCharging({ ...charging, defaultTorqueSetting: e.target.value })} />
          <label style={{ marginTop: 12 }}>Default tyre pressure (optional)</label>
          <input className="input" value={charging.defaultTyrePressure} onChange={(e) => setCharging({ ...charging, defaultTyrePressure: e.target.value })} />
          <div className="integration-card" style={{ marginTop: 16, padding: 16 }} data-testid="guided-setup-calendar-step">
            <h3 style={{ marginTop: 0 }}>Calendar availability</h3>
            <p className="muted">These hours set your first booking calendar and can be refined later in Scheduling.</p>
            <label style={{ marginBottom: 8 }}>
              <input type="checkbox" checked={bookingPublicEnabled} onChange={(e) => setBookingPublicEnabled(e.target.checked)} />
              Accept booking requests during these hours
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
              <label style={{ display: "block", marginBottom: 8 }}>Operating days</label>
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
            {!businessHoursPayload ? <p style={{ color: "#ff8a8a", marginBottom: 0 }}>Choose at least one operating day, and make sure end time is later than start time.</p> : null}
          </div>
          {renderControls(3, { ...charging, bookingPublicEnabled, businessHours: businessHoursPayload || [] })}
        </div>
      ) : null}

      {step === 4 ? (
        <div className="card">
          <h2>Billing and payments</h2>
          {status?.stripeConfigured ? (
            <p className="muted">Stripe is connected. Turn on customer payments here, then fine-tune anything else in billing.</p>
          ) : (
            <p className="muted">Stripe is not connected yet, so online payments are not ready.</p>
          )}
          <div className="integration-card" style={{ padding: 16, marginBottom: 12 }} data-testid="guided-setup-billing-step">
            <strong>{status?.stripeConfigured ? "Stripe ready" : "Stripe not ready"}</strong>
            <p className="muted" style={{ marginBottom: 12 }}>
              {status?.stripeConfigured
                ? "Customers can pay through Stripe as soon as payments are enabled for this workspace."
                : "Connect Stripe first. MyTitan will not show payments as ready until that is done."}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link className="button secondary" href="/dashboard/billing">Open billing</Link>
              <Link className="button secondary" href="/dashboard/billing/readiness">Check payment readiness</Link>
            </div>
          </div>
          <label style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={enablePayments} onChange={(e) => setEnablePayments(e.target.checked)} disabled={!status?.stripeConfigured} data-testid="guided-setup-enable-payments" />
            Enable online payments
          </label>
          {!status?.stripeConfigured ? <p className="muted">This stays disabled until Stripe is connected correctly.</p> : null}
          {renderControls(4, { enablePayments })}
        </div>
      ) : null}

      {step === 5 ? (
        <div className="card">
          <h2>Ready</h2>
          <p className="muted">Your workspace is ready for day-to-day work.</p>
          <div style={{ display: "grid", gap: 12 }}>
            <Link className="button" href="/dashboard/jobs/new?guided=1">Create your first job</Link>
            <Link className="button secondary" href="/dashboard">Go to dashboard</Link>
          </div>
          {renderControls(5, {})}
        </div>
      ) : null}
    </DashboardShell>
  );
}
