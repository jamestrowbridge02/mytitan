type SignupHygieneInput = {
  email?: string | null;
  companyName?: string | null;
};

import { classifyNonRoutableRecipientEmail } from '../common/email-recipient-hygiene';

function normalizeHost(value?: string | string[] | null) {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw || '')
    .trim()
    .toLowerCase()
    .split(',')[0]
    .trim()
    .replace(/:\d+$/, '');
}

function isPublicMyTitanHost(host: string) {
  return host === 'mytitan.co.uk' || host.endsWith('.mytitan.co.uk');
}

export function isPublicSignupHost(value?: string | string[] | null) {
  if (process.env.MYTITAN_ENABLE_E2E_FIXTURES === '1') {
    return false;
  }
  return isPublicMyTitanHost(normalizeHost(value));
}

export function classifyGeneratedSignupArtifact(input: SignupHygieneInput) {
  const email = String(input.email || '').trim().toLowerCase();
  const companyName = String(input.companyName || '').trim().toLowerCase();

  if (!email && !companyName) {
    return null;
  }

  const nonRoutableReason = classifyNonRoutableRecipientEmail(email);
  if (nonRoutableReason) {
    return 'non-routable test email domains are blocked on the public signup surface';
  }
  if (email.startsWith('verify-')) {
    return 'verify-* signup emails are reserved for generated test artifacts';
  }
  if (email.startsWith('trial-') && email.includes('@')) {
    return 'trial-* signup emails are reserved for generated test artifacts';
  }
  if (email.includes('playwright')) {
    return 'playwright-labelled signup emails are reserved for generated test artifacts';
  }
  if (companyName.startsWith('playwright verify ')) {
    return 'Playwright Verify workspaces are reserved for generated test artifacts';
  }
  if (companyName.startsWith('trial workspace ')) {
    return 'Trial Workspace names are reserved for generated test artifacts';
  }

  return null;
}

export function isGeneratedWorkspaceIdentity(input: SignupHygieneInput) {
  return Boolean(classifyGeneratedSignupArtifact(input));
}
