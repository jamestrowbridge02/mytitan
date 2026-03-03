import { useEffect, useMemo, useState } from 'react';

const TOUR_KEY = 'mytitan_demo_tour_seen_v1';

const STEPS = [
  { title: 'Command Centre', text: 'This is your daily control panel for jobs, bookings, and money.' },
  { title: 'Create Job', text: 'Use New Job to start a guided workflow and capture details fast.' },
  { title: 'Upload Photos', text: 'Add before/after images in the evidence step to improve trust.' },
  { title: 'Generate PDF', text: 'Create a clean summary PDF for customers and records.' },
  { title: 'Billing', text: 'Use Billing to manage subscription and payment status.' },
];

export function GuidedTourOverlay({ enabled, isDemoUser }: { enabled: boolean; isDemoUser: boolean }) {
  const [prompt, setPrompt] = useState(false);
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!enabled || !isDemoUser || typeof window === 'undefined') return;
    const seen = window.localStorage.getItem(TOUR_KEY) === '1';
    if (!seen) setPrompt(true);
  }, [enabled, isDemoUser]);

  const current = useMemo(() => STEPS[Math.min(step, STEPS.length - 1)], [step]);

  if (!enabled || !isDemoUser) return null;

  return (
    <>
      {prompt ? (
        <div className="card" style={{ marginBottom: 16, borderColor: '#8cc8ff' }}>
          <h2 style={{ marginTop: 0 }}>Start product tour?</h2>
          <p className="muted">Quick walkthrough: dashboard, jobs, photos, PDF, billing.</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="button" onClick={() => { setPrompt(false); setActive(true); setStep(0); }}>Start tour</button>
            <button className="button secondary" onClick={() => { setPrompt(false); window.localStorage.setItem(TOUR_KEY, '1'); }}>Skip</button>
          </div>
        </div>
      ) : null}

      {active ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div className="card" style={{ maxWidth: 520, width: '100%' }}>
            <p className="muted">Step {step + 1} of {STEPS.length}</p>
            <h2 style={{ marginTop: 4 }}>{current.title}</h2>
            <p>{current.text}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
              <button className="button secondary" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</button>
              {step < STEPS.length - 1 ? (
                <button className="button" onClick={() => setStep((s) => s + 1)}>Next</button>
              ) : (
                <button className="button" onClick={() => { setActive(false); window.localStorage.setItem(TOUR_KEY, '1'); }}>Finish</button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
