require('reflect-metadata');
const fs = require('fs');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { BillingService } = require('../dist/billing/billing.service');

function parseArgs(argv) {
  const options = {
    dryRun: false,
    mockFile: '',
    allowCreate: false,
  };

  for (const entry of argv) {
    const value = String(entry || '').trim();
    if (!value) continue;
    if (value === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (value.startsWith('--mock-file=')) {
      options.mockFile = value.slice('--mock-file='.length).trim();
      continue;
    }
    if (value === '--confirm-create') {
      options.allowCreate = true;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const mockCatalog = options.mockFile ? JSON.parse(fs.readFileSync(options.mockFile, 'utf8')) : null;
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const billing = app.get(BillingService);
    const snapshot = await billing.syncJobCompletionPackCatalog({
      dryRun: options.dryRun,
      allowCreate: options.allowCreate,
      mockCatalog,
    });

    console.log(
      `JOB_COMPLETION_PACK_SYNC status=${snapshot.status} dryRun=${options.dryRun ? 'yes' : 'no'} checkout=${snapshot.checkoutStatus} expected_currency=${snapshot.expectedCurrency} allowCreate=${options.allowCreate ? 'yes' : 'no'}`,
    );
    for (const pack of snapshot.packs || []) {
      console.log(
        `${pack.code} jobs=${pack.jobCount} status=${pack.status} source=${pack.source} active=${pack.active ? 'yes' : 'no'} currency=${pack.currency || 'n/a'} price="${pack.displayPrice || 'n/a'}" product="${String(pack.productName || pack.label).replace(/"/g, "'")}"`,
      );
    }
    console.log(`SUMMARY ${String(snapshot.summary || '').replace(/\s+/g, ' ').trim()}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
