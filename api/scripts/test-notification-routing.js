'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@mytitan.co.uk';

const compiledServicePath = path.resolve(__dirname, '../dist/notifications/notifications.service.js');
if (!fs.existsSync(compiledServicePath)) {
  console.error('notification-routing-verify: compiled notifications service is missing; run npm run build first');
  process.exit(1);
}

const { NotificationsService } = require(compiledServicePath);

const auditMessages = [];
let deliveryMode = 'live_send';

const prisma = {
  user: {
    findFirst: async ({ where }) => {
      if (
        where?.id === 'assigned-active' &&
        where?.companyId === 'tenant-1' &&
        where?.isActive === true &&
        where?.emailVerified === true
      ) {
        return { email: 'assigned@example.com' };
      }
      return null;
    },
    findMany: async ({ where }) => {
      if (where?.companyId !== 'tenant-1') return [];
      return [
        { id: 'owner-1', email: 'owner@example.com', role: 'OWNER' },
        { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN' },
      ];
    },
  },
  tenantSetting: {
    findUnique: async ({ where }) => {
      if (where?.tenantId !== 'tenant-1') return null;
      return {
        companyName: 'Tenant One',
        emailNotificationRecipients: null,
        businessConfigJson: {
          notificationRouting: {
            internalRecipients: [
              {
                email: 'ops@example.com',
                enabled: true,
                categories: ['jobs', 'payments'],
              },
              {
                email: 'ops@example.com',
                enabled: true,
                categories: ['jobs'],
              },
            ],
          },
        },
      };
    },
  },
};

const audit = {
  log: async (_companyId, _event, message) => {
    auditMessages.push(String(message || ''));
  },
};

const automations = {
  getDeliveryMode: async () => deliveryMode,
};

const email = {
  sendOperationalEmail: async (_companyId, _input) => ({
    delivered: false,
    status: 'not_configured',
    reason: 'Workspace sender is unavailable.',
    senderOwnership: 'workspace',
    usedFallback: false,
    notice: null,
  }),
};

async function main() {
  const service = new NotificationsService(prisma, audit, automations, email);

  const bookingCustomerRecipient = service.resolveBookingCustomerRecipient(
    {
      customerEmail: 'support@mytitan.co.uk',
      tradeAccount: { contactEmail: 'trade@example.com', billingEmail: 'accounts@example.com' },
    },
    'general',
  );
  assert.equal(bookingCustomerRecipient.email, 'trade@example.com');
  assert.equal(bookingCustomerRecipient.source, 'trade_primary_contact');

  const billingJobRecipients = service.resolveJobCustomerRecipients(
    {
      customerEmail: 'support@mytitan.co.uk',
      formData: { billingEmail: 'billing@example.com' },
      tradeAccount: { contactEmail: 'trade@example.com', billingEmail: 'accounts@example.com' },
    },
    'billing',
  );
  assert.equal(billingJobRecipients.selected.email, 'billing@example.com');
  assert.equal(billingJobRecipients.selected.source, 'customer_billing_contact');

  const generalJobRecipients = service.resolveJobCustomerRecipients(
    {
      customerEmail: 'customer@example.com',
      formData: { billingEmail: 'billing@example.com' },
      tradeAccount: { contactEmail: 'trade@example.com' },
    },
    'general',
  );
  assert.equal(generalJobRecipients.selected.email, 'customer@example.com');
  assert.equal(generalJobRecipients.selected.source, 'customer_primary_contact');

  const activeAssignedEmail = await service.getActiveAssignedUserEmail('tenant-1', 'assigned-active');
  const inactiveAssignedEmail = await service.getActiveAssignedUserEmail('tenant-1', 'assigned-inactive');
  assert.equal(activeAssignedEmail, 'assigned@example.com');
  assert.equal(inactiveAssignedEmail, null);

  const configuredInternalRecipients = await service.getWorkspaceInternalEmailRecipients('tenant-1', 'jobs');
  assert.equal(configuredInternalRecipients.workspaceName, 'Tenant One');
  assert.deepEqual(configuredInternalRecipients.recipients, ['ops@example.com']);

  prisma.tenantSetting.findUnique = async ({ where }) => {
    if (where?.tenantId !== 'tenant-1') return null;
    return {
      companyName: 'Tenant One',
      emailNotificationRecipients: null,
      businessConfigJson: {
        notificationRouting: {
          internalRecipients: [],
        },
      },
    };
  };

  const fallbackInternalRecipients = await service.getWorkspaceInternalEmailRecipients('tenant-1', 'jobs');
  assert.deepEqual(fallbackInternalRecipients.recipients, ['owner@example.com', 'admin@example.com']);

  const dedupeMap = new Map();
  service.rememberRecipient(dedupeMap, 'duplicate@example.com', 'customer_primary_contact');
  service.rememberRecipient(dedupeMap, 'duplicate@example.com', 'customer_billing_contact');
  const dedupeSummary = service.summarizeRecipients(dedupeMap);
  assert.equal(dedupeSummary, 'recipient_count=1 | sources=customer_billing_contact:1, customer_primary_contact:1');

  deliveryMode = 'metadata_only';
  const queuedResult = await service.sendNotificationEmail(
    'tenant-1',
    'customer@example.com',
    'Subject',
    'Body',
    undefined,
    undefined,
    { suppressFailureAlert: true },
  );
  assert.equal(queuedResult.status, 'queued');

  deliveryMode = 'live_send';
  const missingRecipientResult = await service.sendNotificationEmail(
    'tenant-1',
    'support@mytitan.co.uk',
    'Subject',
    'Body',
    undefined,
    undefined,
    { suppressFailureAlert: true },
  );
  assert.equal(missingRecipientResult.status, 'skipped_no_recipient');

  const unavailableSenderResult = await service.sendNotificationEmail(
    'tenant-1',
    'customer@example.com',
    'Subject',
    'Body',
    undefined,
    undefined,
    { suppressFailureAlert: true },
  );
  assert.equal(unavailableSenderResult.status, 'unavailable_sender');

  assert.ok(auditMessages.length > 0);
  assert.ok(auditMessages.every((message) => !message.includes('@')));

  console.log('notification-routing-verify: ok');
  console.log('customer_general_source=customer_primary_contact recipient_count=1');
  console.log('customer_billing_source=customer_billing_contact recipient_count=1');
  console.log('booking_general_source=trade_primary_contact recipient_count=1');
  console.log('assigned_user_source=active_verified_assigned_user recipient_count=1');
  console.log('internal_route_source=configured_internal recipient_count=1');
  console.log('internal_route_source=owner_admin_fallback recipient_count=2');
  console.log(`dedupe_summary=${dedupeSummary}`);
  console.log('delivery_statuses=queued,skipped_no_recipient,unavailable_sender');
  console.log(`audit_privacy=ok logged_message_count=${auditMessages.length}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
