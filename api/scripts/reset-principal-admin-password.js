#!/usr/bin/env node
/* eslint-disable no-console */

function safeFailure(message) {
  console.log(JSON.stringify({
    ok: false,
    email: 'admin@mytitan.co.uk',
    passwordUpdated: false,
    active: null,
    emailVerified: null,
    role: null,
    platformAdminEligible: false,
    auditRecorded: false,
    error: message,
  }, null, 2));
}

async function main() {
  const password = String(process.env.MYTITAN_PRINCIPAL_ADMIN_NEW_PASSWORD || '');
  if (!password) {
    safeFailure('MYTITAN_PRINCIPAL_ADMIN_NEW_PASSWORD is required.');
    process.exitCode = 1;
    return;
  }
  const { requireProductionOperation } = require('./production-operation');
  const operation = requireProductionOperation({
    operation: 'principal_admin_password_reset',
    target: 'admin@mytitan.co.uk',
    operator: process.env.MYTITAN_OPERATION_OPERATOR || process.env.USER || 'cli',
    reason: process.env.MYTITAN_OPERATION_REASON || '',
  });
  if (operation.dryRun) {
    console.log(JSON.stringify({
      ok: true,
      email: 'admin@mytitan.co.uk',
      passwordUpdated: false,
      dryRun: true,
      auditRecorded: false,
      evidenceId: operation.evidenceId,
    }, null, 2));
    return;
  }

  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { AuthService } = require('../dist/auth/auth.service');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const auth = app.get(AuthService);
    const result = await auth.resetPrincipalAdminPassword({
      password,
      actor: operation.operator,
    });
    console.log(JSON.stringify({ ...result, evidenceId: operation.evidenceId }, null, 2));
  } catch (error) {
    safeFailure(error instanceof Error ? error.message : 'Principal admin password reset failed.');
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  safeFailure(error instanceof Error ? error.message : 'Principal admin password reset failed.');
  process.exitCode = 1;
});
