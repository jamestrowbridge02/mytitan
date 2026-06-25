import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../lib/api";

type GuidedSetupStatus = {
  currentStep?: number;
  completedSteps?: string[];
  skippedSteps?: string[];
  completedAt?: string | null;
  guidedSetupCompletedAt?: string | null;
};

type Props = {
  enabled: boolean;
  incomplete: boolean;
  compact?: boolean;
};

const TRACKED_STEPS = ["trade", "branding", "services", "charging", "payments"];
const STEP_LABELS: Record<string, string> = {
  trade: "Choose your job sheet",
  branding: "Add business details",
  services: "Review services and pricing",
  charging: "Set booking hours and defaults",
  payments: "Review billing readiness",
};

const STEP_HREFS: Record<string, string> = {
  trade: "/dashboard/setup-wizard?step=template",
  branding: "/dashboard/setup-wizard?step=branding",
  services: "/dashboard/setup-wizard?step=services",
  charging: "/dashboard/setup-wizard?step=operations",
  payments: "/dashboard/setup-wizard?step=payments",
};

const normalizeSteps = (value: unknown) =>
  Array.from(
    new Set((Array.isArray(value) ? value : []).map((entry) => String(entry || "").trim()).filter(Boolean)),
  );

export function GuidedSetupProgress({ enabled, incomplete, compact = false }: Props) {
  const [status, setStatus] = useState<GuidedSetupStatus | null>(null);

  useEffect(() => {
    if (!enabled || !incomplete) return;
    let mounted = true;
    apiFetch("/guided-setup/status")
      .then((data) => {
        if (!mounted) return;
        setStatus(data || null);
      })
      .catch(() => {
        if (!mounted) return;
        setStatus(null);
      });
    return () => {
      mounted = false;
    };
  }, [enabled, incomplete]);

  const progress = useMemo(() => {
    const completed = normalizeSteps(status?.completedSteps);
    const skipped = normalizeSteps(status?.skippedSteps);
    const done = new Set([...completed, ...skipped]);
    const doneCount = TRACKED_STEPS.filter((step) => done.has(step)).length;
    const total = TRACKED_STEPS.length;
    const remaining = Math.max(total - doneCount, 0);
    const percent = Math.round((doneCount / total) * 100);
    const nextStep = TRACKED_STEPS.find((step) => !done.has(step)) || null;
    return { doneCount, remaining, percent, nextStep };
  }, [status]);

  const completedAt = status?.completedAt || status?.guidedSetupCompletedAt;
  const continueHref = progress.nextStep ? STEP_HREFS[progress.nextStep] || "/dashboard/setup-wizard" : "/dashboard/setup-wizard";
  if (!enabled || !incomplete || completedAt) return null;

  if (compact) {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Setup in progress</h2>
        <p className="muted">
          {progress.percent}% complete • {progress.remaining} step(s) left
          {progress.nextStep ? ` • Next: ${STEP_LABELS[progress.nextStep] || progress.nextStep}` : ''}
        </p>
        <Link className="button secondary" href={continueHref} data-testid="guided-setup-continue">Continue setup</Link>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 16 }} data-testid="guided-setup-progress-card">
      <h2 style={{ marginTop: 0 }}>Finish setup</h2>
      <p className="muted">You can keep using MyTitan now. Resume setup whenever you want to tighten branding, services, booking hours, and billing readiness.</p>
      <p className="muted">
        {progress.percent}% complete • {progress.remaining} step(s) remaining
        {progress.nextStep ? ` • Next: ${STEP_LABELS[progress.nextStep] || progress.nextStep}` : ''}
      </p>
      <Link className="button" href={continueHref} data-testid="guided-setup-continue">Continue setup</Link>
    </div>
  );
}
