import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module';
import { NotificationsService } from '../dist/notifications/notifications.service';
import { PrismaService } from '../dist/prisma/prisma.service';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const tenantId = String(process.argv[2] || 'e2e-company').trim();
  const suffix = Date.now().toString(36);
  const passwordHash = 'test_password_hash';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });

  const notifications = app.get(NotificationsService) as any;
  const prisma = app.get(PrismaService) as any;
  const originalPlatformRecipients = process.env.MYTITAN_OPS_ALERT_RECIPIENTS;
  const originalCriticalCopiesFlag = process.env.MYTITAN_OPS_ALERT_INCLUDE_PLATFORM_CRITICAL_COPIES;
  const createdUserIds: string[] = [];
  const originalSettings = await prisma.tenantSetting.findUnique({
    where: { tenantId },
    select: { businessConfigJson: true },
  });

  const ownerEmail = `ops-owner-${suffix}@example.com`;
  const adminEmail = `ops-admin-${suffix}@example.com`;
  const extraEmail = `ops-extra-${suffix}@example.com`;
  const disabledEmail = `ops-disabled-${suffix}@example.com`;
  const unverifiedEmail = `ops-unverified-${suffix}@example.com`;
  const removedRoleEmail = `ops-role-${suffix}@example.com`;
  const newAdminEmail = `ops-new-admin-${suffix}@example.com`;
  const suppressedExtraEmail = `ops-suppressed-${suffix}@example.test`;
  const platformEmail = `support-copy-${suffix}@example.com`;

  try {
    const createUser = async (input: {
      email: string;
      role: string;
      emailVerified?: boolean;
      isActive?: boolean;
    }) => {
      const user = await prisma.user.create({
        data: {
          companyId: tenantId,
          email: input.email,
          passwordHash,
          role: input.role,
          emailVerified: input.emailVerified !== false,
          isActive: input.isActive !== false,
        },
      });
      createdUserIds.push(user.id);
      return user;
    };

    const owner = await createUser({ email: ownerEmail, role: 'OWNER' });
    const admin = await createUser({ email: adminEmail, role: 'ADMIN' });
    const disabled = await createUser({ email: disabledEmail, role: 'ADMIN', isActive: false });
    const unverified = await createUser({ email: unverifiedEmail, role: 'ADMIN', emailVerified: false });
    const roleChangeCandidate = await createUser({ email: removedRoleEmail, role: 'ADMIN' });
    await createUser({ email: newAdminEmail, role: 'VIEWER' });

    await prisma.tenantSetting.upsert({
      where: { tenantId },
      update: {
        businessConfigJson: {
          ...((originalSettings?.businessConfigJson && typeof originalSettings.businessConfigJson === 'object')
            ? originalSettings.businessConfigJson
            : {}),
          operationalAlerts: {
            externalEmailRecipients: [extraEmail, ownerEmail, extraEmail, suppressedExtraEmail],
            enabledCategories: ['failed_payment'],
          },
        },
      },
      create: {
        tenantId,
        businessConfigJson: {
          operationalAlerts: {
            externalEmailRecipients: [extraEmail, ownerEmail, extraEmail, suppressedExtraEmail],
            enabledCategories: ['failed_payment'],
          },
        },
      },
    });

    process.env.MYTITAN_OPS_ALERT_RECIPIENTS = platformEmail;
    process.env.MYTITAN_OPS_ALERT_INCLUDE_PLATFORM_CRITICAL_COPIES = 'true';

    const failedPaymentInitial = await notifications.resolveOperationalAlertRecipients(tenantId, 'failed_payment', 'warning');
    assert(failedPaymentInitial.ownerAdminRecipients.includes(ownerEmail), 'owner/admin auto recipients should include active verified owner');
    assert(failedPaymentInitial.ownerAdminRecipients.includes(adminEmail), 'owner/admin auto recipients should include active verified admin');
    assert(!failedPaymentInitial.ownerAdminRecipients.includes(disabledEmail), 'disabled users must be excluded');
    assert(!failedPaymentInitial.ownerAdminRecipients.includes(unverifiedEmail), 'unverified users must be excluded');
    assert(failedPaymentInitial.extraRecipients.includes(extraEmail), 'extra recipients should remain optional and included when configured');
    assert(!failedPaymentInitial.extraRecipients.includes(suppressedExtraEmail), 'non-routable extra recipients must be suppressed');
    assert(failedPaymentInitial.recipients.filter((recipient: any) => recipient.email === ownerEmail).length === 1, 'deduplication must collapse owner/admin plus extra overlap');
    assert(!failedPaymentInitial.platformRecipients.includes(platformEmail), 'tenant business alerts must not route to platform support copies');

    await prisma.user.update({
      where: { id: roleChangeCandidate.id },
      data: { role: 'VIEWER' },
    });
    const afterRoleChange = await notifications.resolveOperationalAlertRecipients(tenantId, 'failed_payment', 'warning');
    assert(!afterRoleChange.ownerAdminRecipients.includes(removedRoleEmail), 'role-changed users must be excluded automatically');

    await prisma.user.updateMany({
      where: { companyId: tenantId, email: newAdminEmail },
      data: { role: 'ADMIN', emailVerified: true, isActive: true },
    });
    const afterNewAdmin = await notifications.resolveOperationalAlertRecipients(tenantId, 'failed_payment', 'warning');
    assert(afterNewAdmin.ownerAdminRecipients.includes(newAdminEmail), 'new admins must be included automatically');

    const healthCritical = await notifications.resolveOperationalAlertRecipients(tenantId, 'health_degraded', 'critical');
    assert(healthCritical.platformRecipients.includes(platformEmail), 'critical platform copies should only appear for opted-in critical health alerts');

    console.log('TEST_RESULTS_BEFORE_VS_AFTER');
    console.log(`initial_owner_admin=${failedPaymentInitial.ownerAdminRecipients.length}`);
    console.log(`initial_extra=${failedPaymentInitial.extraRecipients.length}`);
    console.log(`after_role_change_owner_admin=${afterRoleChange.ownerAdminRecipients.length}`);
    console.log(`after_new_admin_owner_admin=${afterNewAdmin.ownerAdminRecipients.length}`);
    console.log(`health_critical_platform_copies=${healthCritical.platformRecipients.length}`);
    console.log('RESULT=PASS');
  } finally {
    process.env.MYTITAN_OPS_ALERT_RECIPIENTS = originalPlatformRecipients;
    process.env.MYTITAN_OPS_ALERT_INCLUDE_PLATFORM_CRITICAL_COPIES = originalCriticalCopiesFlag;

    await prisma.tenantSetting.updateMany({
      where: { tenantId },
      data: {
        businessConfigJson: originalSettings?.businessConfigJson ?? null,
      },
    });

    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }

    await app.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
