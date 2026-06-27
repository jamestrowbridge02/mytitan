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

  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { AuthService } = require('../dist/auth/auth.service');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const auth = app.get(AuthService);
    const result = await auth.resetPrincipalAdminPassword({
      password,
      actor: process.env.USER || 'cli',
    });
    console.log(JSON.stringify(result, null, 2));
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
