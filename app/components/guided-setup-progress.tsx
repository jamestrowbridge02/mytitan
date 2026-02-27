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
    return { doneCount, remaining, percent };
  }, [status]);

  const completedAt = status?.completedAt || status?.guidedSetupCompletedAt;
  if (!enabled || !incomplete || completedAt) return null;

  if (compact) {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Setup in progress</h2>
        <p className="muted">{progress.percent}% complete • {progress.remaining} step(s) left</p>
        <Link className="button secondary" href="/dashboard/setup-wizard">Continue setup</Link>
      </div>
    );
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Finish setup</h2>
        <p className="muted">You can keep using MyTitan now. Finish the setup when ready.</p>
        <Link className="button secondary" href="/dashboard/setup-wizard">Continue setup</Link>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Setup Progress</h2>
        <p className="muted">{progress.percent}% complete</p>
        <p className="muted">{progress.remaining} step(s) remaining</p>
        <Link className="button" href="/dashboard/setup-wizard">Continue Setup</Link>
      </div>
    </>
  );
}
