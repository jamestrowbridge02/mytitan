type RawTerminology = Record<string, any> | null | undefined;

function cleanLabel(value: unknown, fallback: string) {
  const label = typeof value === 'string' ? value.trim() : '';
  return label ? label.slice(0, 40) : fallback;
}

export function resolveWorkforceTerminology(config?: { businessConfigJson?: unknown } | RawTerminology) {
  const root = config && typeof config === 'object' && 'businessConfigJson' in config
    ? (config as any).businessConfigJson
    : config;
  const businessConfig = root && typeof root === 'object' && !Array.isArray(root) ? root as any : {};
  const workforce = businessConfig.workforceTerminology && typeof businessConfig.workforceTerminology === 'object'
    ? businessConfig.workforceTerminology
    : {};
  const legacy = businessConfig.terminology && typeof businessConfig.terminology === 'object'
    ? businessConfig.terminology
    : {};
  const singular = cleanLabel(workforce.singular || workforce.defaultFieldWorkerLabel || legacy.technicianSingular, 'Team member');
  const plural = cleanLabel(workforce.plural || legacy.technicians, singular === 'Team member' ? 'Team' : `${singular}s`);
  const defaultFieldWorker = cleanLabel(workforce.defaultFieldWorkerLabel || singular, singular);
  const publicBooking = cleanLabel(workforce.publicBookingLabel || defaultFieldWorker, defaultFieldWorker);
  return { singular, plural, defaultFieldWorker, publicBooking };
}
