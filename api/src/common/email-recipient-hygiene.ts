function normalizeEmail(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function extractDomain(email: string) {
  const normalized = normalizeEmail(email);
  const atIndex = normalized.lastIndexOf('@');
  if (atIndex < 0) return '';
  return normalized.slice(atIndex + 1);
}

export function classifyNonRoutableRecipientEmail(email?: string | null) {
  const domain = extractDomain(String(email || ''));
  if (!domain) return null;
  if (domain === 'localhost') {
    return 'localhost addresses are blocked from live outbound delivery';
  }
  if (domain.endsWith('.local')) {
    return '.local addresses are blocked from live outbound delivery';
  }
  if (domain.endsWith('.test')) {
    return '.test addresses are blocked from live outbound delivery';
  }
  return null;
}

export function isNonRoutableRecipientEmail(email?: string | null) {
  return Boolean(classifyNonRoutableRecipientEmail(email));
}
