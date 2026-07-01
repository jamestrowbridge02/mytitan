const crypto = require("crypto");

function runtimeEnvironment() {
  return String(process.env.MYTITAN_RUNTIME_ENV || process.env.MYTITAN_ENV || process.env.NODE_ENV || "").trim().toLowerCase();
}

function isProductionRuntime() {
  const env = runtimeEnvironment();
  return env === "production" || env === "";
}

function requireProductionOperation(input = {}) {
  const operation = String(input.operation || "production operation").slice(0, 120);
  const target = String(input.target || process.env.MYTITAN_OPERATION_TARGET || "").trim().slice(0, 160);
  const operator = String(input.operator || process.env.MYTITAN_OPERATION_OPERATOR || process.env.USER || "").trim().slice(0, 120);
  const reason = String(input.reason || process.env.MYTITAN_OPERATION_REASON || "").trim().slice(0, 240);
  const dryRun = input.dryRun === true || process.env.MYTITAN_OPERATION_DRY_RUN === "1";
  const confirmed = process.env.MYTITAN_CONFIRM_PRODUCTION_OPERATION === "1";
  const evidenceId = `prod-op-${crypto.createHash("sha256").update(`${operation}:${target}:${operator}:${reason}`).digest("hex").slice(0, 16)}`;

  if (isProductionRuntime()) {
    if (!confirmed) {
      throw new Error(`${operation} refused: set MYTITAN_CONFIRM_PRODUCTION_OPERATION=1 for explicit production mutation.`);
    }
    if (operator.length < 3) throw new Error(`${operation} refused: MYTITAN_OPERATION_OPERATOR is required.`);
    if (target.length < 3) throw new Error(`${operation} refused: MYTITAN_OPERATION_TARGET is required.`);
    if (reason.length < 12) throw new Error(`${operation} refused: MYTITAN_OPERATION_REASON is required.`);
  }

  return {
    operation,
    target,
    operator: operator || "automation",
    reason: reason || "non-production operation",
    dryRun,
    evidenceId,
    runtimeEnvironment: runtimeEnvironment() || "production",
  };
}

module.exports = {
  isProductionRuntime,
  requireProductionOperation,
};
