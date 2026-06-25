require('reflect-metadata');
const fs = require('fs');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { BillingService } = require('../dist/billing/billing.service');

function parseArgs(argv) {
  const options = {
    dryRun: true,
    mockFile: '',
  };

  for (const entry of argv) {
    const value = String(entry || '').trim();
    if (!value) continue;
    if (value === '--confirm') {
      options.dryRun = false;
      continue;
    }
    if (value.startsWith('--mock-file=')) {
      options.mockFile = value.slice('--mock-file='.length).trim();
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const mockPrices = options.mockFile ? JSON.parse(fs.readFileSync(options.mockFile, 'utf8')) : null;
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const billing = app.get(BillingService);
    const readiness = await billing.verifySubscriptionPricing({
      mockPrices,
      ignoreCatalogOverrides: Boolean(mockPrices),
    });

    console.log(
      `SUBSCRIPTION_PRICE_SYNC status=${readiness.status} dryRun=${options.dryRun ? 'yes' : 'no'} checkedAt=${readiness.checkedAt}`,
    );
    for (const price of readiness.prices || []) {
      console.log(
        `${price.planCode} interval=${price.interval} status=${price.status} expected="${price.displayExpectedPrice || 'n/a'}" observed="${price.displayObservedPrice || 'n/a'}" active=${price.active ? 'yes' : 'no'}`,
      );
    }
    console.log(`SUMMARY ${String(readiness.message || '').replace(/\s+/g, ' ').trim()}`);

    const nextActions = (readiness.prices || [])
      .filter((price) => price.status !== 'ready')
      .map((price) => `${price.planCode} ${price.interval} ${String(price.action || '').replace(/\s+/g, ' ').trim()}`);
    for (const action of nextActions) {
      console.log(`ACTION ${action}`);
    }

    if (!options.dryRun && process.env.MYTITAN_CONFIRM_STRIPE_PRICE_CREATE !== '1') {
      console.log('REFUSED: Stripe subscription price creation/update requires MYTITAN_CONFIRM_STRIPE_PRICE_CREATE=1 and is not performed by this verification command.');
      process.exitCode = 4;
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
