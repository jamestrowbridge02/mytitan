export const DEMO_COACH_STORAGE_KEY = 'mytitan_demo_coach_v1';

export type DemoCoachStepKey = 'booking_to_job' | 'start_job' | 'collect_payment';

export type DemoCoachStep = {
  key: DemoCoachStepKey;
  title: string;
  description: string;
};

export type DemoCoachProgress = {
  dismissed: boolean;
  completed: Record<string, boolean>;
};

export type DemoCoachAction = {
  label: string;
  href?: string;
  onClick?: () => void;
};

const STEPS: DemoCoachStep[] = [
  {
    key: 'booking_to_job',
    title: 'Create or review a booking',
    description: 'Open a booking and convert it to a job so work can start.',
  },
  {
    key: 'start_job',
    title: 'Start the job and add an update',
    description: 'Move the job to in progress and record a quick update.',
  },
  {
    key: 'collect_payment',
    title: 'Collect payment or review billing',
    description: 'Send the payment link or confirm the invoice outcome.',
  },
];

function readProgress(): DemoCoachProgress {
  if (typeof window === 'undefined') {
    return { dismissed: false, completed: {} };
  }
  try {
    const raw = window.localStorage.getItem(DEMO_COACH_STORAGE_KEY);
    if (!raw) return { dismissed: false, completed: {} };
    const parsed = JSON.parse(raw);
    return {
      dismissed: Boolean(parsed?.dismissed),
      completed: parsed?.completed && typeof parsed.completed === 'object' ? parsed.completed : {},
    };
  } catch {
    return { dismissed: false, completed: {} };
  }
}

function writeProgress(progress: DemoCoachProgress) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_COACH_STORAGE_KEY, JSON.stringify(progress));
  window.dispatchEvent(new CustomEvent('-coach:update'));
}

export function getDemoCoachSteps(): DemoCoachStep[] {
  return STEPS;
}

export function getDemoProgress(): DemoCoachProgress {
  return readProgress();
}

export function markDemoStepComplete(stepKey: DemoCoachStepKey): DemoCoachProgress {
  const current = readProgress();
  const next = {
    ...current,
    completed: { ...current.completed, [stepKey]: true },
  };
  writeProgress(next);
  return next;
}

export function dismissDemoCoach() {
  const current = readProgress();
  const next = { ...current, dismissed: true };
  writeProgress(next);
}

export function getDemoStepActions(stepKey: DemoCoachStepKey): DemoCoachAction[] {
  if (stepKey === 'booking_to_job') {
    return [{ label: 'Open bookings', href: '/dashboard/bookings' }];
  }
  if (stepKey === 'start_job') {
    return [{ label: 'Open command centre', href: '/dashboard/command-centre' }];
  }
  return [{ label: 'Open jobs', href: '/dashboard/jobs' }];
}
