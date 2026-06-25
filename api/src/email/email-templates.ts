import { resolvePublicUrl } from '../common/public-url';
import type { ServiceRecordEmailContent } from '../common/job-completion-output';

export type WorkspaceEmailBranding = {
  workspaceName: string;
  logoUrl?: string | null;
  senderName?: string | null;
  replyToEmail?: string | null;
};

export type EmailTemplate = {
  subject: string;
  text: string;
  html: string;
};

type EmailAction = {
  label: string;
  href: string;
  tone?: 'primary' | 'secondary';
};

function escapeHtml(value: unknown) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function brandLabel(branding: WorkspaceEmailBranding) {
  const workspaceName = String(branding.workspaceName || 'MyTitan').trim();
  return workspaceName || 'MyTitan';
}

function senderLabel(branding: WorkspaceEmailBranding) {
  const senderName = String(branding.senderName || '').trim();
  if (!senderName) return `${brandLabel(branding)} customer communications`;
  return `${senderName} via ${brandLabel(branding)}`;
}

function logoMarkup(branding: WorkspaceEmailBranding) {
  const logoUrl = resolvePublicUrl(branding.logoUrl, { kind: 'api' });
  if (logoUrl) {
    return `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brandLabel(branding))} logo" style="max-width:160px;max-height:44px;display:block" />`;
  }
  return `<div style="display:inline-block;padding:10px 14px;border-radius:14px;background:#0d3b2f;color:#f5f0e6;font:700 20px/1.1 Arial,sans-serif;letter-spacing:0.04em">${escapeHtml(brandLabel(branding))}</div>`;
}

function footerMarkup(branding: WorkspaceEmailBranding, footerNote?: string | null) {
  const lines = [
    senderLabel(branding),
    branding.replyToEmail ? `Reply to: ${branding.replyToEmail}` : null,
    footerNote || `This email was sent from ${brandLabel(branding)}. If you were not expecting it, you can safely ignore it.`,
  ].filter(Boolean);
  return `
    <div style="margin-top:28px;padding-top:18px;border-top:1px solid #d8dfd8;color:#546066;font:13px/1.6 Arial,sans-serif">
      ${lines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
    </div>
  `;
}

function actionsMarkup(actions: EmailAction[]) {
  if (!actions.length) return '';
  return `
    <div style="margin:26px 0 18px 0">
      ${actions
        .map((action, index) => {
          const primary = (action.tone || (index === 0 ? 'primary' : 'secondary')) === 'primary';
          const background = primary ? '#0d3b2f' : '#f5f7f5';
          const color = primary ? '#f7efe3' : '#0d3b2f';
          const border = primary ? '#0d3b2f' : '#c7d2ca';
          return `<a href="${escapeHtml(action.href)}" style="display:inline-block;margin:0 12px 12px 0;padding:12px 18px;border-radius:12px;border:1px solid ${border};background:${background};color:${color};font:700 14px/1 Arial,sans-serif;text-decoration:none">${escapeHtml(action.label)}</a>`;
        })
        .join('')}
    </div>
  `;
}

function detailsMarkup(details: Array<{ label: string; value: string }>) {
  if (!details.length) return '';
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:10px 0 0 0;border-collapse:collapse">
      <tbody>
        ${details
          .map(
            (row) => `
              <tr>
                <td style="padding:8px 0;color:#6b7470;font:600 13px/1.4 Arial,sans-serif;vertical-align:top;width:170px">${escapeHtml(row.label)}</td>
                <td style="padding:8px 0;color:#16201d;font:400 14px/1.5 Arial,sans-serif">${escapeHtml(row.value)}</td>
              </tr>
            `,
          )
          .join('')}
      </tbody>
    </table>
  `;
}

function cardGroupsMarkup(content: ServiceRecordEmailContent) {
  if (!Array.isArray(content.linkGroups) || content.linkGroups.length === 0) return '';
  return content.linkGroups
    .map(
      (group) => `
        <div style="margin-top:24px">
          <div style="margin-bottom:10px;color:#6b7470;font:700 12px/1 Arial,sans-serif;letter-spacing:0.08em;text-transform:uppercase">${escapeHtml(group.title)}</div>
          ${group.cards
            .map(
              (card) => `
                <a href="${escapeHtml(card.href)}" style="display:block;margin-bottom:10px;padding:14px 16px;border:1px solid #d8dfd8;border-radius:16px;background:${card.variant === 'preview' ? '#f6f8f6' : '#ffffff'};text-decoration:none">
                  <div style="display:flex;align-items:center;gap:12px">
                    <div style="width:52px;height:52px;border-radius:12px;background:#e8efe9;color:#0d3b2f;font:700 12px/1.2 Arial,sans-serif;display:grid;place-items:center;text-align:center;padding:6px">${escapeHtml(card.badge || 'VIEW')}</div>
                    <div>
                      <div style="color:#16201d;font:700 15px/1.4 Arial,sans-serif">${escapeHtml(card.label)}</div>
                      <div style="color:#5e6965;font:400 13px/1.5 Arial,sans-serif">${escapeHtml(card.caption)}</div>
                    </div>
                  </div>
                </a>
              `,
            )
            .join('')}
        </div>
      `,
    )
    .join('');
}

function sectionsMarkup(content: ServiceRecordEmailContent) {
  return content.sections
    .map(
      (section) => `
        <div style="margin-top:24px;padding:18px 18px 10px 18px;border:1px solid #d8dfd8;border-radius:18px;background:#ffffff">
          <div style="margin-bottom:8px;color:#6b7470;font:700 12px/1 Arial,sans-serif;letter-spacing:0.08em;text-transform:uppercase">${escapeHtml(section.title)}</div>
          ${detailsMarkup(section.rows)}
        </div>
      `,
    )
    .join('');
}

function renderLayout(input: {
  branding: WorkspaceEmailBranding;
  eyebrow: string;
  title: string;
  intro: string;
  actions?: EmailAction[];
  details?: Array<{ label: string; value: string }>;
  bodyHtml?: string;
  footerNote?: string | null;
}) {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#eef2ee">
    <div style="max-width:680px;margin:0 auto;background:#fbfcfb;border:1px solid #d8dfd8;border-radius:28px;overflow:hidden">
      <div style="padding:28px 28px 24px 28px;background:linear-gradient(180deg,#f7efe3 0%,#fbfcfb 100%)">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px">
          <div>
            ${logoMarkup(input.branding)}
            <div style="margin-top:14px;color:#6b7470;font:700 11px/1 Arial,sans-serif;letter-spacing:0.1em;text-transform:uppercase">${escapeHtml(input.eyebrow)}</div>
            <h1 style="margin:10px 0 8px 0;color:#16201d;font:700 30px/1.15 Georgia, 'Times New Roman', serif">${escapeHtml(input.title)}</h1>
            <p style="margin:0;color:#33403c;font:400 16px/1.65 Arial,sans-serif">${escapeHtml(input.intro)}</p>
          </div>
        </div>
        ${actionsMarkup(input.actions || [])}
        ${detailsMarkup(input.details || [])}
      </div>
      <div style="padding:0 28px 28px 28px">
        ${input.bodyHtml || ''}
        ${footerMarkup(input.branding, input.footerNote)}
      </div>
    </div>
  </body>
</html>`;
}

function joinTextBlocks(blocks: Array<string | null | undefined>) {
  return blocks.filter(Boolean).join('\n\n');
}

function buildTextActionLines(actions: EmailAction[]) {
  if (!actions.length) return '';
  return actions.map((action) => `${action.label}: ${action.href}`).join('\n');
}

export function buildVerificationEmailTemplate(
  branding: WorkspaceEmailBranding,
  verifyUrl: string,
  htmlVerifyUrl?: string,
): EmailTemplate {
  const subject = `Welcome to ${brandLabel(branding)} on MyTitan`;
  return {
    subject,
    text: joinTextBlocks([
      `Welcome to ${brandLabel(branding)} on MyTitan.`,
      'Confirm your email address to finish setting up secure access and unlock the rest of your workspace.',
      buildTextActionLines([{ label: 'Confirm email address', href: verifyUrl }]),
      'This secure link expires in 24 hours.',
      'If you did not create this account, you can ignore this email.',
    ]),
    html: renderLayout({
      branding,
      eyebrow: 'Email verification',
      title: 'Welcome to your workspace',
      intro: `Confirm your email address to finish setting up secure access for ${brandLabel(branding)} and start using MyTitan with confidence.`,
      actions: [{ label: 'Confirm email address', href: htmlVerifyUrl || verifyUrl }],
      details: [
        { label: 'Workspace', value: brandLabel(branding) },
        { label: 'Link validity', value: 'Expires in 24 hours' },
      ],
      footerNote: 'For security, this link only confirms your email address and expires automatically after 24 hours.',
    }),
  };
}

export function buildPasswordResetEmailTemplate(
  branding: WorkspaceEmailBranding,
  resetUrl: string,
  htmlResetUrl?: string,
): EmailTemplate {
  const subject = 'Reset your MyTitan password';
  return {
    subject,
    text: joinTextBlocks([
      `A password reset was requested for your ${brandLabel(branding)} workspace.`,
      'Use the secure link below to choose a new password.',
      buildTextActionLines([{ label: 'Choose a new password', href: resetUrl }]),
      'This secure link expires in 30 minutes.',
      'If you did not request this change, no action is needed and your current password will stay active.',
    ]),
    html: renderLayout({
      branding,
      eyebrow: 'Password reset',
      title: 'Choose a new password',
      intro: `Use the secure reset link below if you asked to change the password for your ${brandLabel(branding)} account.`,
      actions: [{ label: 'Choose a new password', href: htmlResetUrl || resetUrl }],
      details: [
        { label: 'Workspace', value: brandLabel(branding) },
        { label: 'Link validity', value: 'Expires in 30 minutes' },
      ],
      footerNote: 'If you requested more than one reset, use the newest email. If this was not you, ignore this email and your current password stays active.',
    }),
  };
}

export function buildTeamInviteEmailTemplate(
  branding: WorkspaceEmailBranding,
  input: { role: string; acceptUrl: string; htmlAcceptUrl?: string },
): EmailTemplate {
  const subject = `Join ${brandLabel(branding)} on MyTitan`;
  return {
    subject,
    text: joinTextBlocks([
      `You have been invited to join ${brandLabel(branding)} on MyTitan.`,
      'Use the secure link below to set up your access and start working in the workspace.',
      buildTextActionLines([{ label: 'Join workspace', href: input.acceptUrl }]),
      `Role: ${input.role}`,
      'This invite expires in 7 days.',
    ]),
    html: renderLayout({
      branding,
      eyebrow: 'Workspace invite',
      title: 'Join your workspace',
      intro: `You have been invited to join ${brandLabel(branding)} on MyTitan. Use the secure invite below to finish your setup and get into the workspace quickly.`,
      actions: [{ label: 'Join workspace', href: input.htmlAcceptUrl || input.acceptUrl }],
      details: [
        { label: 'Workspace', value: brandLabel(branding) },
        { label: 'Role', value: input.role },
        { label: 'Invite validity', value: 'Expires in 7 days' },
      ],
      footerNote: 'This invite grants access to the workspace named above only. If you were not expecting it, you can ignore this email.',
    }),
  };
}

export function buildCustomerInviteEmailTemplate(
  branding: WorkspaceEmailBranding,
  input: { customerName: string; activationUrl: string; htmlActivationUrl?: string },
): EmailTemplate {
  const subject = `Activate your ${input.customerName} access`;
  return {
    subject,
    text: joinTextBlocks([
      `Your ${input.customerName} access is ready in ${brandLabel(branding)}.`,
      'Activate your account to view completed work, approvals, and shared documents online.',
      buildTextActionLines([{ label: 'Open your account', href: input.activationUrl }]),
      'This invite expires in 14 days.',
    ]),
    html: renderLayout({
      branding,
      eyebrow: 'Customer access',
      title: 'Activate your account',
      intro: `Your ${input.customerName} access is ready. Activate your account to review completed work, approvals, and updates in one secure place.`,
      actions: [{ label: 'Open your account', href: input.htmlActivationUrl || input.activationUrl }],
      details: [
        { label: 'Workspace', value: brandLabel(branding) },
        { label: 'Invite validity', value: 'Expires in 14 days' },
      ],
      footerNote: 'This secure page only shows work shared with you by the workspace above.',
    }),
  };
}

export function buildServiceRecordEmailTemplate(
  branding: WorkspaceEmailBranding,
  content: ServiceRecordEmailContent,
): EmailTemplate {
  const overviewRows = content.sections.find((section) => section.key === 'document_summary')?.rows || [];
  const intro = branding.senderName
    ? `${branding.senderName} from ${brandLabel(branding)} has shared your completed work. Review the finished work, proof, signatures, files, and any remaining payment step below.`
    : `Your completed work from ${brandLabel(branding)} is ready. Review the finished work, proof, signatures, files, and any remaining payment step below.`;
  return {
    subject: content.subject,
    text: content.lines.join('\n'),
    html: renderLayout({
      branding,
      eyebrow: 'Completed work',
      title: 'Your service summary is ready',
      intro,
      actions: content.primaryActions.map((action) => ({ label: action.label, href: action.href })),
      details: overviewRows.slice(0, 4),
      bodyHtml: `${cardGroupsMarkup(content)}${sectionsMarkup(content)}`,
      footerNote: content.footerNote || 'Everything shared with you is grouped here so the completed work is easy to review and keep on file.',
    }),
  };
}

export function buildTrialStartedEmailTemplate(
  branding: WorkspaceEmailBranding,
  input: { startUrl: string; billingUrl: string; endsAtLabel: string; htmlStartUrl?: string; htmlBillingUrl?: string },
): EmailTemplate {
  const subject = `Your MyTitan trial has started`;
  return {
    subject,
    text: joinTextBlocks([
      `Welcome to ${brandLabel(branding)} on MyTitan.`,
      `Your 14-day trial is active through ${input.endsAtLabel}.`,
      'Start with the shortest path to value: create your first job, complete it, and send the result.',
      buildTextActionLines([
        { label: 'Open Start Here', href: input.startUrl },
        { label: 'Review billing', href: input.billingUrl },
      ]),
      'Upgrading later keeps your workspace, customers, completed work, and billing flow in the same place.',
    ]),
    html: renderLayout({
      branding,
      eyebrow: 'Trial started',
      title: 'Your 14-day trial is live',
      intro: `Welcome to ${brandLabel(branding)}. Start with the fastest route to value, then move to a paid plan only when the workspace is already proving itself.`,
      actions: [
        { label: 'Open Start Here', href: input.htmlStartUrl || input.startUrl },
        { label: 'Review billing', href: input.htmlBillingUrl || input.billingUrl, tone: 'secondary' },
      ],
      details: [
        { label: 'Trial access', value: '14-day free trial' },
        { label: 'Trial end', value: input.endsAtLabel },
      ],
      footerNote: 'Upgrading later keeps your workspace, records, and commercial workflow in the same place.',
    }),
  };
}

export function buildTrialEndingSoonEmailTemplate(
  branding: WorkspaceEmailBranding,
  input: { billingUrl: string; daysRemainingLabel: string; endsAtLabel: string; htmlBillingUrl?: string },
): EmailTemplate {
  const subject = `Your MyTitan trial ends soon`;
  return {
    subject,
    text: joinTextBlocks([
      `Your ${brandLabel(branding)} MyTitan trial ends ${input.daysRemainingLabel}.`,
      `Trial end: ${input.endsAtLabel}.`,
      'Choose the paid plan that fits your workload to keep your workspace, completed work, and billing flow moving without interruption.',
      buildTextActionLines([{ label: 'Open billing', href: input.billingUrl }]),
    ]),
    html: renderLayout({
      branding,
      eyebrow: 'Trial ending soon',
      title: 'Your trial is nearly over',
      intro: `Your trial ends ${input.daysRemainingLabel}. Choose the right paid plan now to keep your workspace, completed work, and customer-facing flow moving without interruption.`,
      actions: [{ label: 'Open billing', href: input.htmlBillingUrl || input.billingUrl }],
      details: [
        { label: 'Time remaining', value: input.daysRemainingLabel },
        { label: 'Trial end', value: input.endsAtLabel },
      ],
      footerNote: 'Upgrading preserves the workspace you already set up. No restart, export step, or customer disruption is needed.',
    }),
  };
}

export function buildTrialFinalReminderEmailTemplate(
  branding: WorkspaceEmailBranding,
  input: { billingUrl: string; endsAtLabel: string; htmlBillingUrl?: string },
): EmailTemplate {
  const subject = `Final reminder: your MyTitan trial is almost over`;
  return {
    subject,
    text: joinTextBlocks([
      `Your ${brandLabel(branding)} MyTitan trial ends in about one day.`,
      `Trial end: ${input.endsAtLabel}.`,
      'Choose a paid plan now to keep your workspace, completed work, and billing flow moving without interruption.',
      buildTextActionLines([{ label: 'Open billing', href: input.billingUrl }]),
    ]),
    html: renderLayout({
      branding,
      eyebrow: 'Final reminder',
      title: 'Your trial ends very soon',
      intro: 'This is the final reminder before trial access ends. Choose a paid plan now to keep your workspace and commercial workflow moving without interruption.',
      actions: [{ label: 'Open billing', href: input.htmlBillingUrl || input.billingUrl }],
      details: [
        { label: 'Time remaining', value: 'About 1 day' },
        { label: 'Trial end', value: input.endsAtLabel },
      ],
      footerNote: 'Upgrading now preserves the setup and operating data already in your workspace.',
    }),
  };
}

export function buildTrialExpiredEmailTemplate(
  branding: WorkspaceEmailBranding,
  input: { billingUrl: string; endsAtLabel: string; htmlBillingUrl?: string },
): EmailTemplate {
  const subject = `Your MyTitan trial has ended`;
  return {
    subject,
    text: joinTextBlocks([
      `Your ${brandLabel(branding)} MyTitan trial ended on ${input.endsAtLabel}.`,
      'Choose a paid plan to restore billing-enabled workflows and keep the workspace moving commercially.',
      buildTextActionLines([{ label: 'Open billing', href: input.billingUrl }]),
      'Your existing workspace setup stays in place so you can continue from the same commercial foundation.',
    ]),
    html: renderLayout({
      branding,
      eyebrow: 'Trial ended',
      title: 'Your trial has ended',
      intro: 'Choose a paid plan to restore billing-enabled workflows and keep the workspace moving commercially. Your existing setup stays in place so you can continue from the same foundation.',
      actions: [{ label: 'Open billing', href: input.htmlBillingUrl || input.billingUrl }],
      details: [
        { label: 'Trial status', value: 'Ended' },
        { label: 'Ended on', value: input.endsAtLabel },
      ],
      footerNote: 'Your workspace setup remains in place. Moving to a paid plan restores continuity from the same environment.',
    }),
  };
}

export function buildBookingRequestReceivedEmailTemplate(
  branding: WorkspaceEmailBranding,
  input: {
    workspaceName: string;
    serviceName: string;
    startsAtLabel: string;
    depositLabel: string;
    paymentStatusMessage: string;
    statusUrl?: string | null;
  },
): EmailTemplate {
  const subject = `${input.workspaceName}: booking request received`;
  const actions = input.statusUrl ? [{ label: 'View booking', href: input.statusUrl }] : [];
  return {
    subject,
    text: joinTextBlocks([
      `Your booking request has been received by ${input.workspaceName}.`,
      `Service: ${input.serviceName}`,
      `Requested time: ${input.startsAtLabel}`,
      input.depositLabel,
      input.paymentStatusMessage,
      'The team will confirm the booking shortly.',
      buildTextActionLines(actions),
    ]),
    html: renderLayout({
      branding,
      eyebrow: 'Booking request',
      title: 'We received your booking request',
      intro: `Your request for ${input.serviceName} is now with the team. They will confirm the appointment shortly.`,
      actions,
      details: [
        { label: 'Service', value: input.serviceName },
        { label: 'Requested time', value: input.startsAtLabel },
        { label: 'Deposit', value: input.depositLabel },
      ],
      bodyHtml: `<p style="margin:20px 0 0 0;color:#33403c;font:400 15px/1.7 Arial,sans-serif">${escapeHtml(input.paymentStatusMessage)}</p>`,
      footerNote: 'This message confirms receipt of the request only. The appointment becomes live once the workspace confirms it.',
    }),
  };
}

export function buildBookingInternalNotificationEmailTemplate(
  branding: WorkspaceEmailBranding,
  input: {
    customerName: string;
    customerEmail?: string | null;
    customerPhone?: string | null;
    serviceName: string;
    startsAtLabel: string;
    paymentSummary: string;
  },
): EmailTemplate {
  const subject = `New booking request: ${input.customerName}`;
  return {
    subject,
    text: joinTextBlocks([
      `A new public booking request has been received for ${brandLabel(branding)}.`,
      `Customer: ${input.customerName}`,
      input.customerEmail ? `Email: ${input.customerEmail}` : null,
      input.customerPhone ? `Phone: ${input.customerPhone}` : null,
      `Service: ${input.serviceName}`,
      `Requested time: ${input.startsAtLabel}`,
      input.paymentSummary,
    ]),
    html: renderLayout({
      branding,
      eyebrow: 'Booking ops',
      title: 'New booking request received',
      intro: 'A customer has submitted a new public booking request that needs review and confirmation.',
      details: [
        { label: 'Customer', value: input.customerName },
        { label: 'Email', value: input.customerEmail || 'Not provided' },
        { label: 'Phone', value: input.customerPhone || 'Not provided' },
        { label: 'Service', value: input.serviceName },
        { label: 'Requested time', value: input.startsAtLabel },
        { label: 'Payment', value: input.paymentSummary },
      ],
      footerNote: 'Review the booking queue in MyTitan to confirm, reschedule, or convert the request into work.',
    }),
  };
}

export function buildBookingConfirmedEmailTemplate(
  branding: WorkspaceEmailBranding,
  input: {
    serviceName: string;
    startsAtLabel: string;
    bookingReference?: string | null;
    durationLabel?: string | null;
    locationName?: string | null;
    locationAddress?: string | null;
    locationPhone?: string | null;
    locationEmail?: string | null;
    arrivalInstructions?: string | null;
    parkingInstructions?: string | null;
    openingHoursLabel?: string | null;
    depositLabel: string;
    balanceLabel: string;
    statusUrl?: string | null;
    googleMapsUrl?: string | null;
    appleMapsUrl?: string | null;
    wazeUrl?: string | null;
    googleCalendarUrl?: string | null;
    outlookCalendarUrl?: string | null;
    icsUrl?: string | null;
  },
): EmailTemplate {
  const subject = `${brandLabel(branding)} confirmed your booking`;
  const actions: EmailAction[] = [
    ...(input.statusUrl
      ? [
          { label: 'View booking', href: input.statusUrl },
          { label: 'Reschedule or cancel', href: input.statusUrl, tone: 'secondary' as const },
        ]
      : []),
    ...(input.googleMapsUrl ? [{ label: 'Google Maps', href: input.googleMapsUrl, tone: 'secondary' as const }] : []),
    ...(input.appleMapsUrl ? [{ label: 'Apple Maps', href: input.appleMapsUrl, tone: 'secondary' as const }] : []),
    ...(input.wazeUrl ? [{ label: 'Waze', href: input.wazeUrl, tone: 'secondary' as const }] : []),
    ...(input.googleCalendarUrl ? [{ label: 'Google Calendar', href: input.googleCalendarUrl, tone: 'secondary' as const }] : []),
    ...(input.outlookCalendarUrl ? [{ label: 'Outlook Calendar', href: input.outlookCalendarUrl, tone: 'secondary' as const }] : []),
    ...(input.icsUrl ? [{ label: 'Apple Calendar / .ics', href: input.icsUrl, tone: 'secondary' as const }] : []),
  ];
  return {
    subject,
    text: joinTextBlocks([
      `Your booking with ${brandLabel(branding)} is now confirmed.`,
      `Service: ${input.serviceName}`,
      input.bookingReference ? `Booking reference: ${input.bookingReference}` : null,
      `Scheduled time: ${input.startsAtLabel}`,
      input.durationLabel ? `Duration: ${input.durationLabel}` : null,
      input.locationName ? `Location: ${input.locationName}` : null,
      input.locationAddress ? `Address: ${input.locationAddress}` : null,
      input.locationPhone ? `Phone: ${input.locationPhone}` : null,
      input.locationEmail ? `Email: ${input.locationEmail}` : null,
      input.arrivalInstructions ? `Arrival: ${input.arrivalInstructions}` : null,
      input.parkingInstructions ? `Parking: ${input.parkingInstructions}` : null,
      input.openingHoursLabel ? `Opening hours: ${input.openingHoursLabel}` : null,
      input.depositLabel,
      input.balanceLabel,
      buildTextActionLines(actions),
    ]),
    html: renderLayout({
      branding,
      eyebrow: 'Booking confirmed',
      title: 'Your booking is confirmed',
      intro: `Your ${input.serviceName} booking has been confirmed and moved into the live work schedule.`,
      actions,
      details: [
        { label: 'Service', value: input.serviceName },
        ...(input.bookingReference ? [{ label: 'Booking reference', value: input.bookingReference }] : []),
        { label: 'Scheduled time', value: input.startsAtLabel },
        ...(input.durationLabel ? [{ label: 'Duration', value: input.durationLabel }] : []),
        ...(input.locationName ? [{ label: 'Location', value: input.locationName }] : []),
        ...(input.locationAddress ? [{ label: 'Address', value: input.locationAddress }] : []),
        ...(input.locationPhone ? [{ label: 'Phone', value: input.locationPhone }] : []),
        ...(input.locationEmail ? [{ label: 'Email', value: input.locationEmail }] : []),
        ...(input.arrivalInstructions ? [{ label: 'Arrival', value: input.arrivalInstructions }] : []),
        ...(input.parkingInstructions ? [{ label: 'Parking', value: input.parkingInstructions }] : []),
        ...(input.openingHoursLabel ? [{ label: 'Opening hours', value: input.openingHoursLabel }] : []),
        { label: 'Deposit', value: input.depositLabel },
        { label: 'Balance', value: input.balanceLabel },
      ],
      footerNote: 'If the schedule needs to change, contact the workspace directly using the details already shared with you.',
    }),
  };
}

export function buildBookingRescheduledEmailTemplate(
  branding: WorkspaceEmailBranding,
  input: {
    serviceName: string;
    startsAtLabel: string;
    previousStartsAtLabel?: string | null;
    depositLabel: string;
    balanceLabel: string;
    customerNote?: string | null;
    statusUrl?: string | null;
  },
): EmailTemplate {
  const subject = `${brandLabel(branding)} updated your booking`;
  const actions = input.statusUrl ? [{ label: 'View booking', href: input.statusUrl }] : [];
  return {
    subject,
    text: joinTextBlocks([
      `Your booking with ${brandLabel(branding)} has been moved.`,
      `Service: ${input.serviceName}`,
      input.previousStartsAtLabel ? `Previous time: ${input.previousStartsAtLabel}` : null,
      `New time: ${input.startsAtLabel}`,
      input.depositLabel,
      input.balanceLabel,
      input.customerNote ? `Note from the team: ${input.customerNote}` : null,
      buildTextActionLines(actions),
    ]),
    html: renderLayout({
      branding,
      eyebrow: 'Booking moved',
      title: 'Your booking time has changed',
      intro: `Your ${input.serviceName} booking has been moved to a new time.`,
      actions,
      details: [
        { label: 'Service', value: input.serviceName },
        ...(input.previousStartsAtLabel ? [{ label: 'Previous time', value: input.previousStartsAtLabel }] : []),
        { label: 'New time', value: input.startsAtLabel },
        { label: 'Deposit', value: input.depositLabel },
        { label: 'Balance', value: input.balanceLabel },
      ],
      bodyHtml: input.customerNote
        ? `<p style="margin:20px 0 0 0;color:#33403c;font:400 15px/1.7 Arial,sans-serif"><strong>Note from the team:</strong> ${escapeHtml(input.customerNote)}</p>`
        : '',
      footerNote: 'If this new time does not work for you, use your booking page or contact the workspace directly.',
    }),
  };
}

export function buildBookingCancelledEmailTemplate(
  branding: WorkspaceEmailBranding,
  input: {
    serviceName: string;
    startsAtLabel: string;
    customerNote?: string | null;
    statusUrl?: string | null;
  },
): EmailTemplate {
  const subject = `${brandLabel(branding)} cancelled your booking`;
  const actions = input.statusUrl ? [{ label: 'View booking', href: input.statusUrl }] : [];
  return {
    subject,
    text: joinTextBlocks([
      `Your booking with ${brandLabel(branding)} has been cancelled.`,
      `Service: ${input.serviceName}`,
      `Scheduled time: ${input.startsAtLabel}`,
      input.customerNote ? `Note from the team: ${input.customerNote}` : null,
      buildTextActionLines(actions),
    ]),
    html: renderLayout({
      branding,
      eyebrow: 'Booking cancelled',
      title: 'Your booking has been cancelled',
      intro: `The team has cancelled your ${input.serviceName} booking.`,
      actions,
      details: [
        { label: 'Service', value: input.serviceName },
        { label: 'Scheduled time', value: input.startsAtLabel },
      ],
      bodyHtml: input.customerNote
        ? `<p style="margin:20px 0 0 0;color:#33403c;font:400 15px/1.7 Arial,sans-serif"><strong>Note from the team:</strong> ${escapeHtml(input.customerNote)}</p>`
        : '',
      footerNote: 'If you still need help, contact the workspace to arrange a new visit.',
    }),
  };
}

export function buildBookingStatusInternalEmailTemplate(
  branding: WorkspaceEmailBranding,
  input: {
    stateLabel: string;
    customerName: string;
    customerEmail?: string | null;
    serviceName: string;
    startsAtLabel: string;
    previousStartsAtLabel?: string | null;
    note?: string | null;
    operatorUrl?: string | null;
  },
): EmailTemplate {
  const subject = `${input.stateLabel}: ${input.customerName}`;
  const actions = input.operatorUrl ? [{ label: 'Open booking', href: input.operatorUrl }] : [];
  return {
    subject,
    text: joinTextBlocks([
      `${input.stateLabel} in ${brandLabel(branding)}.`,
      `Customer: ${input.customerName}`,
      input.customerEmail ? `Email: ${input.customerEmail}` : null,
      `Service: ${input.serviceName}`,
      input.previousStartsAtLabel ? `Previous time: ${input.previousStartsAtLabel}` : null,
      `Current time: ${input.startsAtLabel}`,
      input.note ? `Note: ${input.note}` : null,
      buildTextActionLines(actions),
    ]),
    html: renderLayout({
      branding,
      eyebrow: 'Booking ops',
      title: input.stateLabel,
      intro: 'A booking lifecycle update was recorded in MyTitan.',
      actions,
      details: [
        { label: 'Customer', value: input.customerName },
        { label: 'Email', value: input.customerEmail || 'Not provided' },
        { label: 'Service', value: input.serviceName },
        ...(input.previousStartsAtLabel ? [{ label: 'Previous time', value: input.previousStartsAtLabel }] : []),
        { label: 'Current time', value: input.startsAtLabel },
      ],
      bodyHtml: input.note
        ? `<p style="margin:20px 0 0 0;color:#33403c;font:400 15px/1.7 Arial,sans-serif"><strong>Note:</strong> ${escapeHtml(input.note)}</p>`
        : '',
      footerNote: 'Use the booking queue to keep customer updates and linked work in sync.',
    }),
  };
}
