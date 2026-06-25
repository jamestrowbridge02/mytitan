require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { BillingService } = require('../dist/billing/billing.service');
const { JOB_COMPLETION_PACK_DEFINITIONS, formatJobCompletionPackPrice } = require('../dist/billing/job-completion-products');

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run') || !argv.includes('--confirm'),
    confirm: argv.includes('--confirm'),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const billing = app.get(BillingService);
    const snapshot = await billing.syncJobCompletionPackCatalog({ dryRun: true });
    console.log(`JOB_COMPLETION_PACK_PREPARE dryRun=${options.dryRun ? 'yes' : 'no'} status=${snapshot.status}`);
    for (const pack of snapshot.packs || []) {
      const definition = JOB_COMPLETION_PACK_DEFINITIONS.find((entry) => entry.code === pack.code);
      const action =
        pack.status === 'missing'
          ? 'create_or_map_required'
          : pack.status === 'job_count_mismatch'
            ? 'metadata_fix_required'
            : pack.status === 'currency_mismatch'
              ? 'currency_fix_required'
              : pack.status === 'price_mismatch'
                ? 'price_fix_required'
              : pack.status === 'inactive'
                ? 'activation_required'
                : 'no_change';
      console.log(`${pack.code} jobs=${pack.jobCount} status=${pack.status} action=${action} expected_price="${formatJobCompletionPackPrice(definition?.amountCents || null, snapshot.expectedCurrency)}"`);
    }
    if (options.confirm) {
      if (process.env.MYTITAN_CONFIRM_JOB_PACK_CREATE !== '1') {
        console.log('REFUSED: Job-completion pack creation/update requires MYTITAN_CONFIRM_JOB_PACK_CREATE=1.');
        process.exitCode = 4;
        return;
      }
      const created = await billing.syncJobCompletionPackCatalog({ dryRun: false, allowCreate: true });
      console.log(`APPLIED status=${created.status} checkout=${created.checkoutStatus}`);
      return;
    }
    console.log('SUMMARY Review the actions above. Creation stays dry-run unless MYTITAN_CONFIRM_JOB_PACK_CREATE=1 is present with --confirm.');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
