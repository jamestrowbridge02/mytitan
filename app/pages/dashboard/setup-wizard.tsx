import { useCallback, useEffect, useMemo, useState } from "react";
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
  { key: "trade", title: "Confirm trade" },
  { key: "branding", title: "Business branding" },
  { key: "services", title: "Services" },
  { key: "charging", title: "Charging defaults" },
  { key: "payments", title: "Payments" },
  { key: "ready", title: "Ready" },
] as const;

const normalizeList = (value: unknown) =>
  Array.from(new Set((Array.isArray(value) ? value : []).map((entry) => String(entry || "").trim()).filter(Boolean)));

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

  const [services, setServices] = useState<any[]>([]);
  const [charging, setCharging] = useState<any>({
    pricePerWheel: true,
    vatEnabled: false,
    vatRate: 20,
    defaultTorqueSetting: "",
    defaultTyrePressure: "",
  });
  const [enablePayments, setEnablePayments] = useState(false);

  const loadStatus = useCallback(async () => {
    const data = await apiFetch("/guided-setup/status");
    setStatus(data);
    setCompletedSteps(normalizeList(data?.completedSteps));
    setSkippedSteps(normalizeList(data?.skippedSteps));
    setBranding({
      companyName: data?.branding?.companyName || "",
      logoUrl: data?.branding?.logoUrl || "",
      brandPrimaryColor: data?.branding?.brandPrimaryColor || "#4fd1c5",
      brandSecondaryColor: data?.branding?.brandSecondaryColor || "#1a1f36",
      brandAccentColor: data?.branding?.brandAccentColor || data?.branding?.brandPrimaryColor || "#4fd1c5",
      supportEmail: data?.supportEmail || "",
      supportPhone: data?.supportPhone || "",
    });
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
    setEnablePayments(Boolean(data?.stripeConfigured));

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
    setBranding((prev: any) => ({ ...prev, logoUrl: data?.logoUrl || prev.logoUrl }));
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
          <h1>Guided setup</h1>
          <p className="muted">Guided Setup V2 is not enabled for this environment.</p>
        </div>
      </DashboardShell>
    );
  }

  const renderControls = (stepNumber: number, payload: Record<string, any>) => {
    const isLast = stepNumber === steps.length - 1;
    return (
      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <button
          className="button"
          onClick={() => (isLast ? completeSetup() : persistStep(stepNumber, payload))}
          disabled={saving}
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
          Save & Exit
        </button>
      </div>
    );
  };

  return (
    <DashboardShell>
      <div className="card" style={{ marginBottom: 16 }}>
        <h1>Guided setup</h1>
        <p className="muted">Step {step + 1} of {steps.length}: {steps[step].title}</p>
        <p className="muted">Status: {stepState === "done" ? "Done" : stepState === "skipped" ? "Skipped" : "In progress"}</p>
        {error ? <p style={{ color: "#ff8a8a" }}>{error}</p> : null}
      </div>

      {step === 0 ? (
        <div className="card">
          <h2>Confirm trade</h2>
          <p className="muted">We will set your primary trade to Wheels and install the Wheels trade pack automatically.</p>
          {renderControls(0, { trade: "WHEELS" })}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="card">
          <h2>Business branding</h2>
          <p className="muted">Add your name, logo, and support details so customers recognize you.</p>
          <label>Business name</label>
          <input className="input" value={branding.companyName} onChange={(e) => setBranding({ ...branding, companyName: e.target.value })} />

          <label style={{ marginTop: 12 }}>Logo (upload)</label>
          <input
            type="file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadLogo(file).catch((err) => setError(err.message || "Logo upload failed"));
            }}
          />

          <label style={{ marginTop: 12 }}>Logo URL (optional)</label>
          <input className="input" value={branding.logoUrl} onChange={(e) => setBranding({ ...branding, logoUrl: e.target.value })} />

          <label style={{ marginTop: 12 }}>Primary color</label>
          <input className="input" value={branding.brandPrimaryColor} onChange={(e) => setBranding({ ...branding, brandPrimaryColor: e.target.value })} />

          <label style={{ marginTop: 12 }}>Support email</label>
          <input className="input" value={branding.supportEmail} onChange={(e) => setBranding({ ...branding, supportEmail: e.target.value })} />

          <label style={{ marginTop: 12 }}>Support phone (WhatsApp)</label>
          <input className="input" value={branding.supportPhone} onChange={(e) => setBranding({ ...branding, supportPhone: e.target.value })} />

          {renderControls(1, branding)}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="card">
          <h2>Services</h2>
          <p className="muted">Turn on the services you offer and set prices.</p>
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
          <h2>Charging defaults</h2>
          <p className="muted">Set your default pricing and VAT preferences.</p>
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
          {renderControls(3, charging)}
        </div>
      ) : null}

      {step === 4 ? (
        <div className="card">
          <h2>Payments</h2>
          {status?.stripeConfigured ? (
            <p className="muted">Stripe is connected. Enable payments to allow customers to pay online.</p>
          ) : (
            <p className="muted">Stripe is not configured yet. You can skip for now and continue using MyTitan.</p>
          )}
          <label style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={enablePayments} onChange={(e) => setEnablePayments(e.target.checked)} />
            Enable online payments
          </label>
          {renderControls(4, { enablePayments })}
        </div>
      ) : null}

      {step === 5 ? (
        <div className="card">
          <h2>Ready</h2>
          <p className="muted">You can start creating Wheels jobs now.</p>
          <div style={{ display: "grid", gap: 12 }}>
            <Link className="button" href="/dashboard/jobs/new?guided=1">Create first job (Guided Mode ON)</Link>
            <Link className="button secondary" href="/dashboard">Go to dashboard</Link>
          </div>
          {renderControls(5, {})}
        </div>
      ) : null}
    </DashboardShell>
  );
}
