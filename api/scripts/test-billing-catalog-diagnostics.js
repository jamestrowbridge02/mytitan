const assert = require('assert');
const { BillingService } = require('../dist/billing/billing.service');

function makeService({ prices = {}, products = {}, priceErrors = {} } = {}) {
  const service = Object.create(BillingService.prototype);
  let mutations = 0;
  service.platformBillingStripeConfig = {
    getRuntimeStatus: () => ({
      mode: 'test',
      billingSecretLoaded: true,
      webhookSecretLoaded: true,
      runtimeLoaded: true,
      lastReloadedAt: new Date('2026-07-02T00:00:00.000Z'),
    }),
  };
  service.isStripeConfigured = () => true;
  service.requireStripe = () => ({
    prices: {
      retrieve: async (id) => {
        if (priceErrors[id]) throw new Error(priceErrors[id]);
        if (!prices[id]) throw new Error(`No such price: '${id}'`);
        return prices[id];
      },
      create: async () => {
        mutations += 1;
        throw new Error('mutation_not_allowed');
      },
      update: async () => {
        mutations += 1;
        throw new Error('mutation_not_allowed');
      },
    },
    products: {
      retrieve: async (id) => {
        if (!products[id]) throw new Error(`No such product: '${id}'`);
        return products[id];
      },
      create: async () => {
        mutations += 1;
        throw new Error('mutation_not_allowed');
      },
      update: async () => {
        mutations += 1;
        throw new Error('mutation_not_allowed');
      },
    },
  });
  service.getMutationCount = () => mutations;
  return service;
}

const enterpriseAnnual = {
  kind: 'subscription_price',
  code: 'ENTERPRISE',
  interval: 'ANNUAL',
  lookupKey: 'ENTERPRISE',
  stripeProductId: null,
  stripePriceId: 'price_enterprise_annual',
  expectedAmountCents: 159000,
  currency: 'GBP',
  active: true,
};

async function main() {
  const product = { id: 'prod_enterprise_annual_verified_1234', name: 'Enterprise annual', active: true };
  const price = {
    id: 'price_enterprise_annual',
    active: true,
    currency: 'gbp',
    unit_amount: 159000,
    lookup_key: 'ENTERPRISE',
    product,
  };

  const service = makeService({ prices: { [price.id]: price }, products: { [product.id]: product } });
  const missingProduct = await service.verifyPlatformBillingCatalogCandidate(enterpriseAnnual);
  assert.equal(missingProduct.status, 'verification_failed');
  assert.match(missingProduct.message, /The Stripe Price exists and belongs to product prod_/);
  assert.match(missingProduct.message, /MyTitan has not stored the Product ID for this mapping yet/);
  assert.equal(missingProduct.safeNextAction, 'Use Product ID from verified Stripe Price');
  assert.equal(missingProduct.checks.localMappingComplete.status, 'fail');
  assert.equal(missingProduct.providerState.canAdoptProductFromVerifiedPrice, true);
  assert.equal(JSON.stringify(missingProduct).includes(product.id), false, 'full product id must stay hidden until reveal');

  const mismatch = await service.verifyPlatformBillingCatalogCandidate({
    ...enterpriseAnnual,
    stripeProductId: 'prod_wrong_local_9999',
  });
  assert.equal(mismatch.status, 'verification_failed');
  assert.match(mismatch.message, /Product mismatch/);
  assert.match(mismatch.message, /prod_/);
  assert.equal(JSON.stringify(mismatch).includes(product.id), false);
  assert.equal(JSON.stringify(mismatch).includes('prod_wrong_local_9999'), false);

  const priceNotFound = await service.verifyPlatformBillingCatalogCandidate({
    ...enterpriseAnnual,
    stripePriceId: 'price_missing_enterprise_annual',
  });
  assert.equal(priceNotFound.status, 'verification_failed');
  assert.match(priceNotFound.message, /Price not found/);
  assert.equal(JSON.stringify(priceNotFound).includes('price_missing_enterprise_annual'), false);

  const currencyMismatch = await service.verifyPlatformBillingCatalogCandidate({
    ...enterpriseAnnual,
    stripeProductId: product.id,
    currency: 'USD',
  });
  assert.equal(currencyMismatch.status, 'currency_mismatch');
  assert.match(currencyMismatch.message, /expected USD, Stripe returned GBP/);

  const amountMismatch = await service.verifyPlatformBillingCatalogCandidate({
    ...enterpriseAnnual,
    stripeProductId: product.id,
    expectedAmountCents: 150000,
  });
  assert.equal(amountMismatch.status, 'amount_mismatch');
  assert.match(amountMismatch.message, /expected/);
  assert.match(amountMismatch.message, /Stripe returned/);

  const ready = await service.verifyPlatformBillingCatalogCandidate({
    ...enterpriseAnnual,
    stripeProductId: product.id,
  });
  assert.equal(ready.status, 'ready');
  assert.equal(ready.canSave, true);

  service.findBillingCatalogOverride = async (kind, code, interval) => {
    if (kind === 'subscription_price' && code === 'ENTERPRISE' && interval === 'ANNUAL') return enterpriseAnnual;
    return null;
  };
  service.priceIdFor = () => null;
  service.formatStripeMoney = BillingService.prototype.formatStripeMoney;
  const subscriptionReadiness = await service.verifySubscriptionPricing();
  const enterpriseAnnualReadiness = subscriptionReadiness.prices.find((row) => row.planCode === 'ENTERPRISE' && row.interval === 'ANNUAL');
  assert.equal(enterpriseAnnualReadiness.status, 'mismatch');
  assert.match(enterpriseAnnualReadiness.detail, /The Stripe Price exists and belongs to product prod_/);
  assert.match(enterpriseAnnualReadiness.detail, /MyTitan has not stored the Product ID for this mapping yet/);
  assert.equal(enterpriseAnnualReadiness.safeNextAction, 'Use Product ID from verified Stripe Price');
  assert.equal(enterpriseAnnualReadiness.canAdoptProductFromVerifiedPrice, true);
  assert.equal(JSON.stringify(enterpriseAnnualReadiness).includes(product.id), false);

  assert.equal(service.getMutationCount(), 0, 'diagnostics must not mutate Stripe products or prices');
  assert.notEqual(ready.message, 'Verification failed');

  console.log('billing_catalog_diagnostics ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
