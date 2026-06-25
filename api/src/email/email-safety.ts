import * as crypto from 'crypto';

export type EmailEnvironmentMode = 'production' | 'staging' | 'development' | 'test' | 'e2e';

export type EmailRecipientClassification = {
  code: string;
  reason: string;
  suppress: boolean;
  captureOnly: boolean;
};

export type ProviderFailureClassification = {
  code: string;
  reason: string;
  temporary: boolean;
  permanent: boolean;
  pauseSending: boolean;
  suppressionCategory?: string;
  providerCode?: string | null;
};

const RESERVED_TLDS = ['.local', '.test', '.example', '.invalid'];

function normalizeEmail(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function extractDomain(email?: string | null) {
  const normalized = normalizeEmail(email);
  const atIndex = normalized.lastIndexOf('@');
  if (atIndex < 0) return '';
  return normalized.slice(atIndex + 1);
}

export function detectEmailEnvironmentMode() {
  if (process.env.MYTITAN_ENABLE_E2E_FIXTURES === '1') return 'e2e' satisfies EmailEnvironmentMode;
  const explicit = String(process.env.MYTITAN_EMAIL_ENVIRONMENT || '').trim().toLowerCase();
  if (explicit === 'production' || explicit === 'staging' || explicit === 'development' || explicit === 'test' || explicit === 'e2e') {
    return explicit satisfies EmailEnvironmentMode;
  }
  const nodeEnv = String(process.env.NODE_ENV || '').trim().toLowerCase();
  if (nodeEnv === 'production') return 'production' satisfies EmailEnvironmentMode;
  if (nodeEnv === 'test') return 'test' satisfies EmailEnvironmentMode;
  return 'development' satisfies EmailEnvironmentMode;
}

export function allowLiveSmtpInCurrentEnvironment(mode = detectEmailEnvironmentMode()) {
  if (mode === 'production') return true;
  return ['1', 'true', 'yes', 'on'].includes(String(process.env.MYTITAN_ALLOW_NON_PROD_SMTP || '').trim().toLowerCase());
}

export function classifyOutboundRecipient(email?: string | null, mode = detectEmailEnvironmentMode()): EmailRecipientClassification | null {
  const normalized = normalizeEmail(email);
  const domain = extractDomain(normalized);
  if (!normalized || !domain) {
    return {
      code: 'invalid_recipient',
      reason: 'Suppressed: recipient email address is invalid.',
      suppress: true,
      captureOnly: false,
    };
  }
  if (domain === 'localhost') {
    return {
      code: 'non_routable_localhost',
      reason: 'Suppressed: localhost addresses are blocked from outbound delivery.',
      suppress: true,
      captureOnly: false,
    };
  }
  if (RESERVED_TLDS.some((suffix) => domain.endsWith(suffix))) {
    return {
      code: 'non_routable_reserved_domain',
      reason: 'Suppressed: reserved test domains are blocked from outbound delivery.',
      suppress: true,
      captureOnly: false,
    };
  }
  if (mode !== 'production' && domain === 'mytitan.co.uk') {
    return {
      code: 'reserved_platform_address_nonprod',
      reason: 'Suppressed: platform-controlled mytitan.co.uk addresses are blocked from non-production outbound delivery.',
      suppress: true,
      captureOnly: false,
    };
  }
  return null;
}

export function maskEmailAddress(email?: string | null) {
  const normalized = normalizeEmail(email);
  const atIndex = normalized.indexOf('@');
  if (atIndex < 1) return '[redacted-email]';
  const local = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);
  const maskedLocal =
    local.length <= 2 ? `${local[0] || '*'}*` : `${local.slice(0, 2)}${'*'.repeat(Math.max(2, local.length - 3))}${local.slice(-1)}`;
  const domainParts = domain.split('.');
  const root = domainParts[0] || '';
  const suffix = domainParts.slice(1).join('.');
  const maskedRoot = root.length <= 2 ? `${root[0] || '*'}*` : `${root.slice(0, 2)}${'*'.repeat(Math.max(2, root.length - 3))}${root.slice(-1)}`;
  return `${maskedLocal}@${maskedRoot}${suffix ? `.${suffix}` : ''}`;
}

export function hashEmailAddress(email?: string | null) {
  return crypto.createHash('sha256').update(normalizeEmail(email)).digest('hex');
}

export function hashContent(value?: string | null) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

export class SmtpResponseError extends Error {
  response: string;
  providerCode: string | null;

  constructor(message: string, response: string) {
    super(message);
    this.name = 'SmtpResponseError';
    this.response = String(response || '').trim();
    const match = this.response.match(/\b(\d{3})\b/);
    this.providerCode = match?.[1] || null;
  }
}

export function classifyProviderFailure(error: unknown): ProviderFailureClassification {
  const response =
    error instanceof SmtpResponseError
      ? error.response
      : error instanceof Error
        ? error.message
        : String(error || '');
  const normalized = response.toLowerCase();
  const codeMatch = response.match(/\b([245]\d{2})\b/);
  const providerCode = codeMatch?.[1] || null;

  if (/suspend|suspicious|spam|abuse|policy|reputation|complaint/.test(normalized)) {
    return {
      code: 'provider_suspended',
      reason: 'The mail provider reported a reputation, policy, or suspension issue.',
      temporary: false,
      permanent: false,
      pauseSending: true,
      providerCode,
    };
  }
  if (/(421|450|451|452)/.test(normalized) || /rate limit|too many|temporar/.test(normalized)) {
    return {
      code: 'provider_backoff',
      reason: 'The mail provider asked for a temporary backoff.',
      temporary: true,
      permanent: false,
      pauseSending: false,
      providerCode,
    };
  }
  if (/(550|551|552|553|554)/.test(normalized) || /user unknown|mailbox unavailable|invalid recipient|recipient rejected/.test(normalized)) {
    return {
      code: 'invalid_recipient',
      reason: 'The mail provider rejected the recipient address.',
      temporary: false,
      permanent: true,
      pauseSending: false,
      suppressionCategory: 'invalid_recipient',
      providerCode,
    };
  }
  if (/auth|credential|535|530/.test(normalized)) {
    return {
      code: 'provider_auth_failed',
      reason: 'The mail provider rejected the SMTP credentials.',
      temporary: false,
      permanent: false,
      pauseSending: false,
      providerCode,
    };
  }
  return {
    code: 'provider_failed',
    reason: 'The mail provider could not accept the message.',
    temporary: false,
    permanent: false,
    pauseSending: false,
    providerCode,
  };
}
