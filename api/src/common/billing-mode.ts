export type BillingMode = "enforce" | "off";

export function billingMode(): BillingMode {
  const v = (process.env.MYTITAN_BILLING_MODE || "enforce").toLowerCase();
  return v === "off" ? "off" : "enforce";
}

export function isBillingEnforced(): boolean {
  return billingMode() !== "off";
}
