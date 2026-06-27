#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const appModulePath = path.resolve(__dirname, '../dist/app.module.js');
const emailServicePath = path.resolve(__dirname, '../dist/email/email.service.js');

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function maskEmail(email) {
  const normalized = normalizeEmail(email);
  const [local, domain] = normalized.split('@');
  if (!local || !domain) return 'invalid';
  return `${local.slice(0, 2)}**@${domain.slice(0, 2)}****${domain.slice(-2)}`;
}

function recipientDomain(email) {
  return normalizeEmail(email).split('@')[1] || null;
}

function assertRoutableRecipient(email) {
  const normalized = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('MYTITAN_TEST_EMAIL_TO must be a valid operator-controlled email address');
  }
  if (/\.(test|example|invalid|localhost)$/i.test(normalized) || normalized.endsWith('@mytitan.local')) {
    throw new Error('MYTITAN_TEST_EMAIL_TO must be a real routable inbox, not a test or local domain');
  }
  return normalized;
}

async function main() {
  if (!fs.existsSync(appModulePath) || !fs.existsSync(emailServicePath)) {
    throw new Error('compiled API is missing; run npm run build before notifications:send-test-email');
  }

  const recipient = assertRoutableRecipient(process.env.MYTITAN_TEST_EMAIL_TO || process.env.EMAIL_TEST_TO);
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require(appModulePath);
  const { EmailService } = require(emailServicePath);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const email = app.get(EmailService);
    const readiness = await email.getReadiness(null, { ownership: 'system', probe: true });
    if (readiness.status !== 'ready' || readiness.transport !== 'smtp' || !readiness.canSend) {
      throw new Error(`system email provider is not ready for live SMTP delivery status=${readiness.status}`);
    }
    const result = await email.sendSystemOperationalEmail(
      {
        to: recipient,
        subject: 'MyTitan public launch email delivery test',
        text: [
          'MyTitan public launch email delivery test.',
          'This message verifies the configured system email provider can send real mail.',
        ].join('\n'),
      },
      {
        category: 'public_launch_email_test',
        templateKey: 'public_launch_email_test',
        dedupeWindowMinutes: 0,
        bypassDuplicateSuppression: true,
      },
    );

    if (!result.delivered || result.status !== 'sent') {
      throw new Error(`test email was not delivered status=${result.status}`);
    }

    console.log(JSON.stringify({
      ok: true,
      recipientMasked: maskEmail(recipient),
      recipientDomain: recipientDomain(recipient),
      readiness: {
        status: readiness.status,
        transport: readiness.transport,
        source: readiness.source,
        canSend: readiness.canSend,
      },
      delivery: {
        status: result.status,
        delivered: Boolean(result.delivered),
        senderOwnership: result.senderOwnership || 'system',
      },
      secretsPrinted: false,
    }, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(`notifications:send-test-email failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
