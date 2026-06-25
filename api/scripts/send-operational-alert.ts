import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { NotificationsService } from '../src/notifications/notifications.service';

function parseArgs(argv: string[]) {
  const [tenantId, reasonKey, ...rest] = argv;
  const options = {
    tenantId: String(tenantId || '').trim(),
    reasonKey: String(reasonKey || '').trim() || 'health_degraded',
    severity: 'critical',
    title: 'Health degraded',
    body: 'MyTitan health monitoring detected a degraded state. Review infrastructure and recent delivery failures before confirming availability.',
    recommendedAction: 'Check API health, webhook delivery, and summary/email schedulers.',
  };

  for (const entry of rest) {
    const value = String(entry || '').trim();
    if (value.startsWith('--severity=')) options.severity = value.slice('--severity='.length).trim() || options.severity;
    if (value.startsWith('--title=')) options.title = value.slice('--title='.length).trim() || options.title;
    if (value.startsWith('--body=')) options.body = value.slice('--body='.length).trim() || options.body;
    if (value.startsWith('--recommended-action=')) options.recommendedAction = value.slice('--recommended-action='.length).trim() || options.recommendedAction;
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.tenantId) {
    throw new Error('Usage: ts-node scripts/send-operational-alert.ts <tenantId> <reasonKey> [--severity=critical] [--title=...] [--body=...] [--recommended-action=...]');
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const notifications = app.get(NotificationsService);
    const result = await notifications.notifyOperationalAlert({
      companyId: options.tenantId,
      category: 'workspace_alerts',
      reasonKey: options.reasonKey,
      title: options.title,
      body: options.body,
      recommendedAction: options.recommendedAction,
      severity: options.severity === 'info' || options.severity === 'warning' ? options.severity : 'critical',
      emailSubject: `MyTitan operational alert: ${options.title}`,
      emailBody: `${options.title}\n${options.body}`,
      entityType: 'tenant',
      entityId: options.tenantId,
      metaJson: {
        source: 'ops_script',
      },
    });
    console.log(
      `OPS_ALERT_SENT tenant=${options.tenantId} reason=${options.reasonKey} severity=${options.severity} owner_admin=${result.recipientCounts?.ownerAdminCount ?? 0} extras=${result.recipientCounts?.extraRecipientCount ?? 0} platform_critical=${result.recipientCounts?.platformCriticalCopyCount ?? 0} resolved=${result.recipientCounts?.resolvedExternalRecipientCount ?? 0}`,
    );
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
