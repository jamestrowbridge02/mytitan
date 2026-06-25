export type PaymentProviderCanaryStatus =
  | "ready"
  | "needs_setup"
  | "requested"
  | "blocked"
  | "not_enabled";

export type PaymentProviderCanaryRow = {
  provider: "MANUAL" | "STRIPE" | "SUMUP" | "WORLDPAY";
  label: string;
  status: PaymentProviderCanaryStatus;
  message: string;
  liveCollection: boolean;
  liveCanaryAllowed: boolean;
};

export type PaymentProviderCanaryFramework = {
  automatedLiveCanariesEnabled: boolean;
  summary: string;
  providers: PaymentProviderCanaryRow[];
};

type BillingPaymentCollectionLike = {
  customerCollection?: {
    preferredProvider?: string | null;
    requestedProviders?: string[] | null;
    providers?: Array<{
      provider?: string | null;
      live?: boolean | null;
      status?: string | null;
    }> | null;
  } | null;
};

function findProvider(
  collection: BillingPaymentCollectionLike["customerCollection"],
  provider: string,
) {
  return (collection?.providers || []).find((entry) => String(entry?.provider || "").toUpperCase() === provider) || null;
}

export function buildPaymentProviderCanaryFramework(
  paymentCollection: BillingPaymentCollectionLike | null | undefined,
) {
  const automatedLiveCanariesEnabled =
    String(process.env.MYTITAN_CONFIRM_TENANT_PROVIDER_CANARY || "").trim() === "1";
  const customerCollection = paymentCollection?.customerCollection || null;
  const preferredProvider = String(customerCollection?.preferredProvider || "MANUAL").trim().toUpperCase();
  const requestedProviders = new Set(
    Array.isArray(customerCollection?.requestedProviders)
      ? customerCollection?.requestedProviders.map((value) => String(value || "").trim().toUpperCase())
      : [],
  );
  const stripeProvider = findProvider(customerCollection, "STRIPE");

  const providers: PaymentProviderCanaryRow[] = [
    {
      provider: "MANUAL",
      label: "Manual collection",
      status: preferredProvider === "MANUAL" ? "ready" : "not_enabled",
      message:
        preferredProvider === "MANUAL"
          ? "Manual collection is the active customer payment path, so no live payment canary is required."
          : "Manual collection is not the active customer payment path for this workspace.",
      liveCollection: preferredProvider === "MANUAL",
      liveCanaryAllowed: false,
    },
    {
      provider: "STRIPE",
      label: "Business Stripe setup",
      status:
        stripeProvider?.live && automatedLiveCanariesEnabled
          ? "ready"
          : stripeProvider?.live
            ? "blocked"
            : preferredProvider === "STRIPE"
              ? "needs_setup"
              : "not_enabled",
      message:
        stripeProvider?.live && automatedLiveCanariesEnabled
          ? "A tenant-owned Stripe collection path is marked live and explicit canary approval is present."
          : stripeProvider?.live
            ? "A tenant-owned Stripe collection path is marked live, but live canaries stay blocked until MYTITAN_CONFIRM_TENANT_PROVIDER_CANARY=1."
            : preferredProvider === "STRIPE"
              ? "The workspace prefers a tenant-owned Stripe path, but it is not verified live yet."
              : "Business Stripe collection is not the active customer payment path here.",
      liveCollection: Boolean(stripeProvider?.live),
      liveCanaryAllowed: Boolean(stripeProvider?.live) && automatedLiveCanariesEnabled,
    },
    {
      provider: "SUMUP",
      label: "SumUp",
      status: requestedProviders.has("SUMUP") ? "requested" : "not_enabled",
      message: requestedProviders.has("SUMUP")
        ? "SumUp has been requested for this workspace, but no live canary should run until provider wiring exists and an operator approves it."
        : "SumUp is not enabled for this workspace.",
      liveCollection: false,
      liveCanaryAllowed: false,
    },
    {
      provider: "WORLDPAY",
      label: "Worldpay",
      status: requestedProviders.has("WORLDPAY") ? "requested" : "not_enabled",
      message: requestedProviders.has("WORLDPAY")
        ? "Worldpay has been requested for this workspace, but no live canary should run until provider wiring exists and an operator approves it."
        : "Worldpay is not enabled for this workspace.",
      liveCollection: false,
      liveCanaryAllowed: false,
    },
  ];

  const liveProvider = providers.find((provider) => provider.liveCollection && provider.provider !== "MANUAL") || null;
  const summary = liveProvider
    ? liveProvider.liveCanaryAllowed
      ? "A tenant-owned customer payment path is live and approved for monitored canaries."
      : "A tenant-owned customer payment path appears live, but automated live canaries remain blocked until explicit operator approval."
    : preferredProvider === "MANUAL"
      ? "Customer payments still rely on manual or offline collection, so only non-live readiness checks apply."
      : "No tenant-owned live customer payment provider is verified yet.";

  return {
    automatedLiveCanariesEnabled,
    summary,
    providers,
  } satisfies PaymentProviderCanaryFramework;
}
