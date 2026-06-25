import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { getSummaryEmailSettings, SUMMARY_EMAIL_CADENCES, type SummaryEmailCadence } from '../src/common/business-config';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PrismaService } from '../src/prisma/prisma.service';

function parseArgs(argv: string[]) {
  const [cadence, ...rest] = argv;
  const options = {
    cadence: String(cadence || '').trim().toLowerCase(),
    dryRun: false,
    tenantId: '',
  };

  for (const entry of rest) {
    const value = String(entry || '').trim();
    if (value === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (value.startsWith('--tenant=')) {
      options.tenantId = value.slice('--tenant='.length).trim();
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!SUMMARY_EMAIL_CADENCES.includes(options.cadence as SummaryEmailCadence)) {
    throw new Error('Usage: npm run summary:dispatch -- <daily|weekly|monthly|quarterly|annual> [--dry-run] [--tenant=<tenantId>]');
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService);
    const email = app.get(EmailService);
    const notifications = app.get(NotificationsService);
    const db = prisma as any;
    const candidateTenants = options.tenantId
      ? await db.company.findMany({
          where: { id: options.tenantId },
          select: { id: true, tenantSetting: { select: { businessConfigJson: true } } },
        })
      : await db.company.findMany({
          select: { id: true, tenantSetting: { select: { businessConfigJson: true } } },
        });
    const tenants = candidateTenants.filter((tenant: any) => {
      const summary = getSummaryEmailSettings(tenant?.tenantSetting || null);
      return summary.enabled && summary.enabledCadences.includes(options.cadence as SummaryEmailCadence);
    });

    if (!tenants.length) {
      console.log(`SUMMARY_DISPATCH no_enabled_tenants cadence=${options.cadence} dryRun=${options.dryRun ? 'yes' : 'no'}`);
      return;
    }

    if (!options.dryRun) {
      const readiness = await email.getReadiness(null, { ownership: 'system', probe: true });
      if (!readiness.canSend) {
        console.error(
          `READINESS_ERROR cadence=${options.cadence} status=${readiness.status} guidance="${String(readiness.guidance || '').replace(/"/g, "'")}"`,
        );
        process.exitCode = 3;
        return;
      }
    }

    let processed = 0;
    let failed = 0;
    let delivered = 0;
    let recipients = 0;

    for (const tenant of tenants) {
      const actor = await db.user.findFirst({
        where: { companyId: tenant.id, role: { in: ['OWNER', 'ADMIN'] } },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (!actor?.id) {
        failed += 1;
        console.error(`${tenant.id} ${options.cadence} status=failed reason="No owner/admin actor available for dispatch."`);
        await notifications.notifyOperationalAlert({
          companyId: tenant.id,
          category: 'workspace_alerts',
          reasonKey: 'summary_dispatch_actor_missing',
          title: 'Summary dispatch needs attention',
          body: 'MyTitan could not dispatch the workspace summary because no owner or admin actor was available.',
          emailSubject: 'MyTitan operational alert: summary dispatch needs attention',
          emailBody: [
            `Cadence: ${options.cadence}`,
            'No owner/admin actor was available for summary dispatch.',
          ].join('\n'),
          entityType: 'tenant',
          entityId: tenant.id,
          metaJson: {
            cadence: options.cadence,
          },
        }).catch(() => undefined);
        continue;
      }
      try {
        const result = await notifications.dispatchWorkspaceSummary({
          companyId: tenant.id,
          actorUserId: actor.id,
          cadence: options.cadence as any,
          dryRun: options.dryRun,
        });
        const deliveredCount = Array.isArray(result?.recipients) ? result.recipients.filter((row: any) => row.delivered).length : 0;
        const recipientCount = Array.isArray(result?.recipients) ? result.recipients.length : 0;
        processed += 1;
        delivered += deliveredCount;
        recipients += recipientCount;
        const failedRecipients = Math.max(0, recipientCount - deliveredCount);
        if (!options.dryRun && failedRecipients > 0) {
          failed += 1;
        }
        console.log(
          `${tenant.id} ${options.cadence} recipients=${recipientCount} delivered=${deliveredCount} failed=${failedRecipients} dryRun=${options.dryRun ? 'yes' : 'no'}`,
        );
      } catch (error) {
        failed += 1;
        console.error(`${tenant.id} ${options.cadence} status=failed reason="${error instanceof Error ? error.message.replace(/"/g, "'") : String(error).replace(/"/g, "'")}"`);
        await notifications.notifyOperationalAlert({
          companyId: tenant.id,
          category: 'workspace_alerts',
          reasonKey: 'summary_dispatch_runtime_failed',
          title: 'Summary dispatch needs attention',
          body: 'MyTitan could not complete the scheduled workspace summary dispatch. Review sender readiness and notification health before the next run.',
          emailSubject: 'MyTitan operational alert: summary dispatch needs attention',
          emailBody: [
            `Cadence: ${options.cadence}`,
            `Reason: ${error instanceof Error ? error.message : String(error)}`,
          ].join('\n'),
          entityType: 'tenant',
          entityId: tenant.id,
          metaJson: {
            cadence: options.cadence,
          },
        }).catch(() => undefined);
      }
    }

    console.log(
      `SUMMARY_DISPATCH cadence=${options.cadence} tenants=${tenants.length} processed=${processed} recipients=${recipients} delivered=${delivered} failed=${failed} dryRun=${options.dryRun ? 'yes' : 'no'}`,
    );
    if (failed > 0) {
      process.exitCode = 10;
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
