#!/usr/bin/env node
/* eslint-disable no-console */

const { BillingService } = require('../dist/billing/billing.service');
const { PrismaService } = require('../dist/prisma/prisma.service');

class AuditStub {
  async log() {
    return;
  }
}

class NotificationsStub {
  async notifyPaymentReceived() {
    return;
  }
  async createForUsers() {
    return;
  }
}

(async () => {
  const prisma = new PrismaService();
  await prisma.$connect();

  const service = new BillingService(prisma, new AuditStub(), new NotificationsStub());
  const eventId = `evt_idempotency_check_${Date.now()}`;
  const event = {
    id: eventId,
    object: 'event',
    api_version: '2023-10-16',
    created: Math.floor(Date.now() / 1000),
    data: { object: {} },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: 'unit.test',
  };

  try {
    const first = await service.handleStripeEvent(event, 'local-check-1');
    const second = await service.handleStripeEvent(event, 'local-check-2');

    const row = await prisma.webhookEvent.findUnique({
      where: { provider_eventId: { provider: 'stripe', eventId } },
    });

    if (!first || first.received !== true) {
      throw new Error('First webhook run did not return received=true');
    }
    if (!second || second.duplicate !== true) {
      throw new Error('Second webhook run did not short-circuit as duplicate');
    }
    if (!row || !row.processedAt || row.status !== 'processed') {
      throw new Error('WebhookEvent row not marked processed');
    }

    console.log('PASS webhook idempotency check');
  } finally {
    await prisma.$disconnect();
  }
})().catch((err) => {
  console.error('FAIL webhook idempotency check');
  console.error(err?.message || String(err));
  process.exitCode = 1;
});
