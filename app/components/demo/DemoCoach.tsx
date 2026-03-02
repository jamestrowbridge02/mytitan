import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { isDemoPolishV1Enabled } from '../../lib/feature-flags';
import {
  dismissDemoCoach,
  getDemoCoachSteps,
  getDemoProgress,
  getDemoStepActions,
  type DemoCoachAction,
  type DemoCoachProgress,
  type DemoCoachStepKey,
} from '../../lib/-coach';

type DemoCoachProps = {
  actions?: Partial<Record<DemoCoachStepKey, DemoCoachAction[]>>;
};

function isExternal(href: string) {
  return href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:');
}

export default function DemoCoach({ actions = {} }: DemoCoachProps) {
  const demoPolishEnabled = isDemoPolishV1Enabled();
  const [isDemoUser, setIsDemoUser] = useState(false);
  const [progress, setProgress] = useState<DemoCoachProgress | null>(null);

  useEffect(() => {
    if (!demoPolishEnabled) return;
    let active = true;
    apiFetch('/me')
      .then((me) => {
        if (!active) return;
        setIsDemoUser(Boolean(me?.demoUser || me?.email === '@mytitan.co.uk'));
      })
      .catch(() => {
        if (!active) return;
        setIsDemoUser(false);
      });
    return () => {
      active = false;
    };
  }, [demoPolishEnabled]);

  useEffect(() => {
    if (!demoPolishEnabled || !isDemoUser || typeof window === 'undefined') return;
    const load = () => setProgress(getDemoProgress());
    load();
    const handler = () => load();
    window.addEventListener('-coach:update', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('-coach:update', handler);
      window.removeEventListener('storage', handler);
    };
  }, [demoPolishEnabled, isDemoUser]);

  const steps = useMemo(() => getDemoCoachSteps(), []);
  const nextStep = steps.find((step) => !progress?.completed?.[step.key]);

  if (!demoPolishEnabled || !isDemoUser || !progress || progress.dismissed || !nextStep) {
    return null;
  }

  const stepIndex = steps.findIndex((step) => step.key === nextStep.key);
  const stepActions = (actions[nextStep.key] || getDemoStepActions(nextStep.key)).slice(0, 2);

  return (
    <div className="card" style={{ borderColor: '#8cc8ff', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p className="muted" style={{ margin: 0 }}> Coach</p>
          <h3 style={{ marginTop: 4, marginBottom: 6 }}>{nextStep.title}</h3>
          <p className="muted" style={{ marginTop: 0 }}>Step {Math.max(1, stepIndex + 1)} of {steps.length}</p>
          <p style={{ marginTop: 6 }}>{nextStep.description}</p>
        </div>
        <button className="button secondary" type="button" onClick={dismissDemoCoach}>Don&apos;t show again</button>
      </div>
      {stepActions.length ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {stepActions.map((action) => (
            action.href ? (
              isExternal(action.href) ? (
                <a key={`${action.label}-${action.href}`} className="button" href={action.href} target="_blank" rel="noreferrer noopener" onClick={action.onClick}>
                  {action.label}
                </a>
              ) : (
                <Link key={`${action.label}-${action.href}`} className="button" href={action.href} onClick={action.onClick}>
                  {action.label}
                </Link>
              )
            ) : (
              <button key={action.label} className="button" type="button" onClick={action.onClick}>
                {action.label}
              </button>
            )
          ))}
        </div>
      ) : null}
    </div>
  );
}
