#!/usr/bin/env node
/* eslint-disable no-console */

async function main() {
  const { NestFactory } = require("@nestjs/core");
  const { AppModule } = require("../dist/app.module");
  const { AuthService } = require("../dist/auth/auth.service");

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const auth = app.get(AuthService);
    const allowLocalResetUrl = process.env.MYTITAN_ALLOW_LOCAL_RESET_URL === "1";
    const result = await auth.issuePrincipalAdminReset({
      allowLocalResetUrl,
      actor: process.env.USER || "cli",
    });
    const output = {
      ok: true,
      email: result.email,
      delivered: result.delivered,
      deliveryStatus: result.deliveryStatus,
      localResetUrlAvailable: Boolean(result.localResetUrl),
      localResetUrl: result.localResetUrl || undefined,
    };
    console.log(JSON.stringify(output, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(`auth:issue-principal-admin-reset failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
