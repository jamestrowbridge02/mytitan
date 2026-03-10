import fs from "fs";
import path from "path";

export const authDir = path.join(__dirname, "..", ".playwright");
export const authFile = path.join(authDir, "operator-auth.json");
export const metadataFile = path.join(authDir, "e2e-metadata.json");

export type E2EMetadata = {
  email?: string | null;
  portalUrl?: string | null;
  portalToken?: string | null;
};

export function hasDashboardAuth() {
  return Boolean(process.env.PLAYWRIGHT_TEST_EMAIL && process.env.PLAYWRIGHT_TEST_PASSWORD);
}

export function readMetadata(): E2EMetadata {
  try {
    const raw = fs.readFileSync(metadataFile, "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}
