const crypto = require("crypto");

const PRINCIPAL_ADMIN_EMAIL = "admin@mytitan.co.uk";
const PROTECTED_LOG_CATEGORY = "protected_mutation_guard";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isE2eId(value) {
  return String(value || "").startsWith("e2e-");
}

function isMytitanStaffEmail(email) {
  return normalizeEmail(email).endsWith("@mytitan.co.uk");
}

function assertE2eScope(value, action = "mutation") {
  const values = Array.isArray(value) ? value : [value];
  if (!values.length || values.some((item) => !isE2eId(item))) {
    throw new Error(`Refusing ${action}: automation can only target explicit e2e-* identifiers.`);
  }
}

function assertNotProtectedPrincipalAdmin(input = {}) {
  const email = normalizeEmail(input.email || input.existing?.email);
  const unsafeData = input.data || {};
  if (email !== PRINCIPAL_ADMIN_EMAIL) return;
  const protectedFields = ["passwordHash", "role", "companyId", "email", "isActive", "emailVerified"];
  const touched = protectedFields.filter((field) => Object.prototype.hasOwnProperty.call(unsafeData, field));
  if (touched.length) {
    throw new Error(`Refusing ${input.action || "mutation"}: principal admin protected fields require an audited explicit path.`);
  }
}

function assertNotCommercialRecordDelete(input = {}) {
  const tenantId = input.tenantId || input.companyId || input.id;
  if (tenantId && !isE2eId(tenantId)) {
    throw new Error(`Refusing ${input.action || "delete"}: commercial records outside e2e scope must be archived, not deleted.`);
  }
}

function requireExplicitAuditReason(reason, action = "protected mutation") {
  const value = String(reason || "").trim();
  if (value.length < 8) {
    throw new Error(`Refusing ${action}: an explicit audit reason is required.`);
  }
  return value.slice(0, 240);
}

function safeFingerprint(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 12);
}

async function recordProtectedMutationWarning(prisma, input = {}) {
  const action = String(input.action || "protected mutation").slice(0, 120);
  const area = String(input.area || "protected records").slice(0, 120);
  const target = String(input.target || "protected-record").replace(/[^a-z0-9_.:-]+/gi, "_").slice(0, 80);
  const id = `protected-guard-${safeFingerprint(`${action}:${area}:${target}`)}`;
  await prisma.platformSafeErrorLog.upsert({
    where: { id },
    create: {
      id,
      category: PROTECTED_LOG_CATEGORY,
      area,
      summary: String(input.summary || `${action} guarded`).slice(0, 240),
      severity: input.severity || "warning",
      status: "open",
      clearable: false,
      validationOnly: input.validationOnly === true,
      auditProtected: true,
      sourceKind: "automation",
      sourceRef: String(input.sourceRef || "protected-mutation-policy").slice(0, 120),
      sanitizedDetailsJson: {
        action,
        target,
        reason: String(input.reason || "guarded by protected mutation policy").slice(0, 240),
      },
    },
    update: {
      lastSeenAt: new Date(),
      occurrenceCount: { increment: 1 },
      status: "open",
      clearable: false,
      auditProtected: true,
      sanitizedDetailsJson: {
        action,
        target,
        reason: String(input.reason || "guarded by protected mutation policy").slice(0, 240),
      },
    },
  });
}

async function blockUnsafeMutation(prisma, input = {}) {
  await recordProtectedMutationWarning(prisma, {
    ...input,
    summary: input.summary || "Unsafe protected-record mutation blocked.",
    severity: input.severity || "critical",
  });
  throw new Error(String(input.error || "Unsafe protected-record mutation blocked."));
}

module.exports = {
  PRINCIPAL_ADMIN_EMAIL,
  assertE2eScope,
  assertNotCommercialRecordDelete,
  assertNotProtectedPrincipalAdmin,
  blockUnsafeMutation,
  isE2eId,
  isMytitanStaffEmail,
  normalizeEmail,
  recordProtectedMutationWarning,
  requireExplicitAuditReason,
  safeFingerprint,
};
