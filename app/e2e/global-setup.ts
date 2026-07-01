import path from "path";
import fs from "fs/promises";
import { execSync } from "child_process";
import { request, type FullConfig } from "@playwright/test";
import { authDir, authFile, defaultOperatorEmail, defaultOperatorPassword, metadataFile, type E2EMetadata } from "./utils";

async function safeUnlink(filePath: string) {
  try {
    await fs.unlink(filePath);
  } catch {
    return;
  }
}

function extractPortalToken(portalUrl?: string | null) {
  if (!portalUrl) return null;
  const marker = "/portal/job/";
  const index = portalUrl.indexOf(marker);
  if (index === -1) return null;
  return portalUrl.slice(index + marker.length).split("?")[0] || null;
}

function assertPlaywrightSeedBoundary(apiBase: string) {
  const runtimeEnv = String(process.env.MYTITAN_RUNTIME_ENV || process.env.MYTITAN_ENV || process.env.NODE_ENV || "").trim().toLowerCase();
  if (!["e2e", "test", "validation", "development", "dev", "local"].includes(runtimeEnv)) {
    throw new Error("Playwright fixture seeding refused: MYTITAN_RUNTIME_ENV must be an explicit non-production value.");
  }
  const host = new URL(apiBase).hostname;
  if (!["127.0.0.1", "localhost", "api"].includes(host)) {
    throw new Error(`Playwright fixture seeding refused: API base host must be local/internal, got ${host}.`);
  }
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || String(config.projects[0]?.use?.baseURL || `${process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3001"}`);
  const appOrigin = new URL(baseURL).origin;
  const apiBase = process.env.PLAYWRIGHT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || `${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}`;
  const email = process.env.PLAYWRIGHT_TEST_EMAIL?.trim() || defaultOperatorEmail;
  const password = process.env.PLAYWRIGHT_TEST_PASSWORD || defaultOperatorPassword;
  const shouldSeedDockerFixtures =
    process.env.PLAYWRIGHT_SKIP_DOCKER_SEED !== "1" &&
    /^http:\/\/127\.0\.0\.1:3000\/?$/.test(apiBase);

  await fs.mkdir(authDir, { recursive: true });

  const metadata: E2EMetadata = {
    email: email || null,
    authReady: false,
    portalUrl: null,
    portalToken: null,
  };

  if (!email || !password) {
    await safeUnlink(authFile);
    await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2));
    return;
  }

  if (shouldSeedDockerFixtures) {
    assertPlaywrightSeedBoundary(apiBase);
    execSync("docker compose exec -T api sh -lc 'cd /app && npm run seed:e2e'", {
      cwd: path.resolve(__dirname, "..", ".."),
      stdio: "inherit",
    });
  }

  const loginContext = await request.newContext({
    baseURL: apiBase,
    extraHTTPHeaders: {
      "Content-Type": "application/json",
    },
  });

  try {
    const loginResponse = await loginContext.post("/auth/login", {
      data: { email, password },
    });
    if (!loginResponse.ok()) {
      await safeUnlink(authFile);
      await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2));
      return;
    }

    const loginBody = await loginResponse.json();
    const token = String(loginBody?.token || "");
    if (!token) {
      throw new Error("Auth bootstrap did not return a token");
    }

    const storageState = {
      cookies: [],
      origins: [
        {
          origin: appOrigin,
          localStorage: [{ name: "mytitan_token", value: token }],
        },
      ],
    };
    await fs.writeFile(authFile, JSON.stringify(storageState, null, 2));
    metadata.authReady = true;

    const authedContext = await request.newContext({
      baseURL: apiBase,
      extraHTTPHeaders: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    try {
      const overviewResponse = await authedContext.get("/portal/overview");
      if (overviewResponse.ok()) {
        const overview = await overviewResponse.json();
        const jobs = Array.isArray(overview?.jobs) ? overview.jobs : [];
        const candidate = jobs.find((job: any) => job?.portalUrl) || jobs[0];

        if (candidate?.portalUrl) {
          metadata.portalUrl = String(candidate.portalUrl);
          metadata.portalToken = extractPortalToken(metadata.portalUrl);
        } else if (candidate?.id) {
          const linkResponse = await authedContext.post(`/portal/jobs/${candidate.id}/link`);
          if (linkResponse.ok()) {
            const linkBody = await linkResponse.json();
            metadata.portalUrl = String(linkBody?.portalUrl || "");
            metadata.portalToken = extractPortalToken(metadata.portalUrl);
          }
        }
      }
    } finally {
      await authedContext.dispose();
    }
  } finally {
    await loginContext.dispose();
    await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2));
  }
}
