#!/usr/bin/env node
/* eslint-disable no-console */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const ADMIN_EMAIL = "admin@mytitan.co.uk";

function apiBase() {
  return String(process.env.MYTITAN_VERIFY_API_BASE_URL || process.env.API_INTERNAL_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(/\/$/, "");
}

function configuredSystemEmail() {
  const host = process.env.SMTP_HOST || process.env.MAIL_HOST || "";
  const from = process.env.SMTP_FROM_EMAIL || process.env.SMTP_FROM || process.env.MAIL_FROM || process.env.EMAIL_FROM || process.env.FROM_EMAIL || process.env.SYSTEM_EMAIL || "";
  const fromName = process.env.SMTP_FROM_NAME || process.env.MAIL_FROM_NAME || process.env.EMAIL_FROM_NAME || process.env.SYSTEM_EMAIL_NAME || "";
  const user = process.env.SMTP_USER || process.env.MAIL_USER || "";
  const passwordPresent = Boolean(process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.MAIL_PASSWORD);
  return {
    hostConfigured: Boolean(String(host).trim()),
    senderConfigured: Boolean(String(from).trim() && String(fromName || "MyTitan").trim()),
    credentialsBalanced: Boolean(user) === passwordPresent,
    providerConfigured: Boolean(String(host).trim() && String(from).trim() && (Boolean(user) === passwordPresent)),
  };
}

async function postJson(url, body) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function main() {
  const startedAt = new Date();
  const admin = await prisma.user.findFirst({
    where: { email: ADMIN_EMAIL },
    select: { id: true, email: true, companyId: true, isActive: true, emailVerified: true, role: true },
  });
  if (!admin?.id) throw new Error("principal platform admin missing");

  const response = await postJson(`${apiBase()}/auth/forgot-password`, { email: ` ${ADMIN_EMAIL.toUpperCase()} ` });
  const body = await response.json().catch(() => ({}));
  if (response.status !== 202) {
    throw new Error(`forgot-password endpoint failed status=${response.status}`);
  }

  const [freshToken, activeToken, notification, event] = await Promise.all([
    prisma.passwordResetToken.findFirst({
      where: { userId: admin.id, createdAt: { gte: startedAt } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, expiresAt: true, consumedAt: true },
    }),
    prisma.passwordResetToken.findFirst({
      where: { userId: admin.id, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, expiresAt: true, consumedAt: true },
    }),
    prisma.notification.findFirst({
      where: { userId: admin.id, type: "password_reset_email" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, metaJson: true },
    }),
    prisma.outboundEmailEvent.findFirst({
      where: {
        userId: admin.id,
        category: "password_reset",
        templateKey: "password_reset_email",
      },
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        status: true,
        reason: true,
        senderOwnership: true,
        templateKey: true,
        recipientMasked: true,
        recipientDomain: true,
        providerCode: true,
      },
    }),
  ]);

  const token = freshToken || activeToken;
  if (!token?.createdAt) throw new Error("forgot-password did not create or preserve an active reset token");
  if (!notification?.createdAt) throw new Error("forgot-password did not create a reset notification");
  if (!event?.createdAt) throw new Error("forgot-password did not record a password reset email event");

  const emailConfig = configuredSystemEmail();
  const deliveryStatus = String(notification?.metaJson?.context?.deliveryStatus || event.status || "unknown");
  console.log(JSON.stringify({
    ok: true,
    admin: {
      exists: true,
      active: Boolean(admin.isActive),
      emailVerified: Boolean(admin.emailVerified),
      role: admin.role,
      platformAdminEligible: Boolean(admin.isActive && admin.emailVerified && admin.role === "OWNER"),
    },
    resetRoute: {
      endpointStatus: response.status,
      responseOk: Boolean(body?.ok),
      tokenCreated: Boolean(freshToken?.createdAt),
      activeTokenPresent: Boolean(activeToken?.createdAt),
      tokenSingleUse: token.consumedAt === null,
      tokenExpiresAt: token.expiresAt,
    },
    emailRouting: {
      providerConfigured: emailConfig.providerConfigured,
      hostConfigured: emailConfig.hostConfigured,
      senderConfigured: emailConfig.senderConfigured,
      credentialsBalanced: emailConfig.credentialsBalanced,
      latestDeliveryStatus: deliveryStatus,
      latestEventStatus: event.status,
      latestEventReason: event.reason,
      senderOwnership: event.senderOwnership,
      templateKey: event.templateKey,
      recipientMasked: event.recipientMasked,
      recipientDomain: event.recipientDomain,
      providerCode: event.providerCode || null,
    },
    secretsPrinted: false,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(`notifications:verify-password-reset-routing failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
