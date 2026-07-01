#!/usr/bin/env node
/* eslint-disable no-console */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const GUARD_VERSION = "production-boundary-v1";
const VALID_ENVIRONMENTS = new Set(["production", "e2e", "validation", "dev", "development", "test", "local"]);

function argValue(name) {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readMarker() {
  return prisma.databaseEnvironmentMarker.findUnique({ where: { id: "default" } });
}

async function main() {
  const command = process.argv[2] || "status";
  if (command === "status") {
    const marker = await readMarker();
    console.log(JSON.stringify({
      ok: Boolean(marker),
      marker: marker ? {
        environment: marker.environment,
        source: marker.source,
        guardVersion: marker.guardVersion,
        createdAt: marker.createdAt,
        updatedAt: marker.updatedAt,
      } : null,
    }, null, 2));
    if (!marker) process.exitCode = 1;
    return;
  }

  if (command !== "mark") {
    throw new Error("Usage: node scripts/database-environment-marker.js status|mark --environment=<env> --source=<source>");
  }

  const environment = String(argValue("environment") || process.env.MYTITAN_DATABASE_ENVIRONMENT || "").trim().toLowerCase();
  const source = String(argValue("source") || process.env.MYTITAN_DATABASE_ENVIRONMENT_SOURCE || "manual").trim().slice(0, 160);
  if (!VALID_ENVIRONMENTS.has(environment)) {
    throw new Error(`Invalid database environment marker: ${environment || "missing"}`);
  }
  if (environment === "production" && process.env.MYTITAN_CONFIRM_PRODUCTION_MARKER !== "1") {
    throw new Error("Refusing to mark production without MYTITAN_CONFIRM_PRODUCTION_MARKER=1.");
  }

  const marker = await prisma.databaseEnvironmentMarker.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      environment,
      source,
      guardVersion: GUARD_VERSION,
    },
    update: {
      environment,
      source,
      guardVersion: GUARD_VERSION,
    },
  });
  console.log(JSON.stringify({
    ok: true,
    marker: {
      environment: marker.environment,
      source: marker.source,
      guardVersion: marker.guardVersion,
      updatedAt: marker.updatedAt,
    },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "database environment marker operation failed",
    }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
