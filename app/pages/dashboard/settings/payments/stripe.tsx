import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { DashboardShell } from "../../../../components/dashboard-shell";
import { OperatorPageHeader, OperatorStatusBadge } from "../../../../components/ui/operator-page";
import { apiFetch } from "../../../../lib/api";
import {
  emptyPermissionSnapshot,
  hasWorkspacePermission,
  normalizePermissionSnapshot,
} from "../../../../lib/workspace-permissions";
import { useOperationalRefresh } from "../../../../lib/operational-refresh";

type StripeReadiness = {
  readinessState?: "not_connected" | "needs_setup" | "needs_attention" | "ready";
  readinessLabel?: string;
  checkoutEligible?: boolean;
  accountMasked?: string | null;
  webhookConfigured?: boolean;
  webhookVerified?: boolean;
  verificationRequired?: boolean;
  lastCheckedAt?: string | null;
  summary?: string;
  mode?: "test" | "live";
  platformConfigAvailable?: boolean;
  onboardingAvailable?: boolean;
  checks?: {
    accountLinked?: boolean;
    businessVerified?: boolean;
    customerPaymentsEnabled?: boolean;
    payoutsEnabled?: boolean;
    depositCheckoutReady?: boolean;
    paymentEventsVerified?: boolean;
  };
};

type ActionResult = {
  tone: "success" | "warning" | "error";
  title: string;
  detail: string;
};

function readinessTone(state?: StripeReadiness["readinessState"]) {
  if (state === "ready") return "success" as const;
  if (state === "needs_attention") return "warning" as const;
  return "neutral" as const;
}

function checkTone(status: "done" | "setup" | "attention") {
  if (status === "done") return "success" as const;
  if (status === "attention") return "warning" as const;
  return "neutral" as const;
}

export default function StripePaymentSetupPage() {
  const router = useRouter();
  const [permissions, setPermissions] = useState(emptyPermissionSnapshot());
  const [readiness, setReadiness] = useState<StripeReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [onboardingFailed, setOnboardingFailed] = useState(false);
  const [continueSetup, setContinueSetup] = useState(false);
  const handledStripeReturn = useRef(false);
  const canManage = hasWorkspacePermission(permissions, "billing.manage");

  async function load() {
    const [me, payload] = await Promise.all([
      apiFetch("/me"),
      apiFetch("/billing/customer-payment-readiness"),
    ]);
    const stripeReadiness = (Array.isArray(payload?.providers) ? payload.providers : [])
      .find((provider: any) => provider.provider === "stripe-connect") || null;
    setPermissions(normalizePermissionSnapshot(me?.permissions));
    setReadiness(stripeReadiness);
    if (typeof window !== "undefined" && stripeReadiness) {
      window.sessionStorage.setItem("mytitan:stripe-readiness", JSON.stringify(stripeReadiness));
    }
    setLoading(false);
    return stripeReadiness as StripeReadiness | null;
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = JSON.parse(window.sessionStorage.getItem("mytitan:stripe-readiness") || "null");
        if (cached) {
          setReadiness(cached);
          setLoading(false);
        }
      } catch {
        window.sessionStorage.removeItem("mytitan:stripe-readiness");
      }
    }
    void load().catch((nextError: any) => {
      setError(nextError?.message || "Stripe setup could not be loaded.");
      setLoading(false);
    });
  }, []);
  const { refreshNow, lastUpdatedAt, isRefreshing } = useOperationalRefresh(load);

  useEffect(() => {
    if (!router.isReady || handledStripeReturn.current) return;
    const stripeReturn = String(router.query.stripe || "");
    if (stripeReturn !== "return" && stripeReturn !== "refresh") return;
    handledStripeReturn.current = true;
    void router.replace(router.pathname, undefined, { shallow: true });
    if (stripeReturn === "refresh") {
      setOnboardingFailed(true);
      setContinueSetup(true);
      setResult({
        tone: "warning",
        title: "Continue Stripe setup",
        detail: "Your Stripe setup session expired or needs another step. Open a fresh secure Stripe session to continue.",
      });
      return;
    }
    void runAction("verify");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.stripe]);

  async function runAction(action: "onboarding" | "verify" | "test") {
    const endpoint = action;
    setBusy(action);
    setError("");
    setResult(null);
    if (action === "onboarding") {
      setOnboardingFailed(false);
      setContinueSetup(false);
    }
    try {
      const payload = await apiFetch(`/billing/customer-payment-readiness/stripe-connect/${endpoint}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      const actionUrl = String(payload?.actionUrl || "");
      if (actionUrl.startsWith("https://connect.stripe.com/")) {
        setResult({
          tone: "success",
          title: "Stripe setup opened",
          detail: "Continue in Stripe. You will return to this page when the setup step is complete.",
        });
        window.location.assign(actionUrl);
        return;
      }
      const actionTitle = action === "onboarding"
        ? "Stripe setup needs attention"
        : action === "test"
          ? payload?.ok ? "Checkout is ready" : "Checkout needs attention"
          : payload?.ok ? "Stripe setup verified" : "Stripe setup needs attention";
      setResult({
        tone: payload?.ok ? "success" : "warning",
        title: actionTitle,
        detail: action === "onboarding" && !payload?.ok
          ? payload?.summary || "Stripe setup could not open. Retry from this page."
          : payload?.summary || "Review the setup status below.",
      });
      if (action === "onboarding" && !payload?.ok) setOnboardingFailed(true);
      await load();
    } catch (nextError: any) {
      setResult({
        tone: "error",
        title: action === "onboarding" ? "Stripe setup needs attention" : "Stripe action could not finish",
        detail: nextError?.message || (action === "onboarding" ? "Stripe setup could not open. Retry from this page." : "Try again."),
      });
      if (action === "onboarding") setOnboardingFailed(true);
    } finally {
      setBusy("");
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Stripe customer payments from this workspace?")) return;
    setBusy("disconnect");
    setError("");
    setResult(null);
    try {
      const payload = await apiFetch("/billing/customer-payment-readiness/stripe-connect/disconnect", {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (payload?.ok === false) {
        throw new Error(payload?.summary || "Stripe could not be disconnected. Retry the action.");
      }
      const refreshed = await load();
      if (refreshed?.readinessState !== "not_connected") {
        throw new Error("Stripe still appears connected. Retry the disconnect action.");
      }
      setResult({
        tone: "success",
        title: "Stripe disconnected",
        detail: payload?.summary || "Stripe customer payments are no longer connected to this workspace.",
      });
    } catch (nextError: any) {
      setResult({
        tone: "error",
        title: "Stripe could not be disconnected",
        detail: nextError?.message || "Retry the disconnect action.",
      });
    } finally {
      setBusy("");
    }
  }

  const state = readiness?.readinessState || "not_connected";
  const connected = state !== "not_connected";
  const ready = state === "ready" && Boolean(readiness?.checkoutEligible);
  const onboardingAvailable = readiness?.onboardingAvailable !== false;
  const checks = useMemo(() => [
    {
      label: "Stripe account linked",
      status: readiness?.checks?.accountLinked ? "done" as const : "setup" as const,
    },
    {
      label: "Business verification complete",
      status: readiness?.checks?.businessVerified ? "done" as const : connected ? "attention" as const : "setup" as const,
    },
    {
      label: "Customer payments enabled",
      status: readiness?.checks?.customerPaymentsEnabled ? "done" as const : connected ? "attention" as const : "setup" as const,
    },
    {
      label: "Payouts enabled",
      status: readiness?.checks?.payoutsEnabled ? "done" as const : connected ? "attention" as const : "setup" as const,
    },
    {
      label: "Deposit checkout ready",
      status: readiness?.checks?.depositCheckoutReady ? "done" as const : connected ? "attention" as const : "setup" as const,
    },
    {
      label: "Payment updates configured",
      status: readiness?.checks?.paymentEventsVerified
        ? "done" as const
        : connected ? "attention" as const : "setup" as const,
    },
  ], [connected, readiness?.checks]);

  const checkLabel = (status: "done" | "setup" | "attention") => {
    if (status === "done") return "Done";
    if (status === "attention") return "Needs attention";
    return "Needs setup";
  };

  return (
    <DashboardShell>
      <div className="stripe-onboarding-page" data-testid="stripe-onboarding-wizard">
        <OperatorPageHeader
          eyebrow="Payments & Invoices"
          title="Stripe customer payments"
          subtitle="Connect your own Stripe account so customers can pay deposits and invoices directly to your business."
        />

        {error ? <div className="alert error">{error}</div> : null}
        {result ? (
          <div className={`stripe-action-result stripe-action-result--${result.tone}`} data-testid="stripe-action-result" role="status">
            <strong>{result.title}</strong>
            <span>{result.detail}</span>
          </div>
        ) : null}

        <section className="stripe-onboarding-hero">
          <div>
            <h2>{loading ? "Checking Stripe..." : ready ? "Ready for customer payments" : readiness?.readinessLabel || "Not connected"}</h2>
            <p>{ready ? "Customers can pay deposits and invoices online." : "Complete the steps below to accept online customer payments."}</p>
          </div>
          <OperatorStatusBadge
            label={ready ? "Ready for customer payments" : readiness?.readinessLabel || "Not connected"}
            tone={readinessTone(state)}
          />
        </section>
        <div className="operator-inline-actions">
          <span className="muted" data-testid="stripe-last-updated">
            {isRefreshing ? "Refreshing Stripe readiness..." : lastUpdatedAt ? "Updated just now" : readiness ? "Showing last verified state" : "Checking readiness"}
          </span>
          <button className="button secondary operator-compact-button" type="button" disabled={isRefreshing || Boolean(busy)} onClick={() => void refreshNow()}>
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <section className="stripe-readiness-card" data-testid="stripe-setup-flow">
          <div className="stripe-readiness-card__header">
            <div>
              <p className="operator-eyebrow">Setup flow</p>
              <h2>Five simple steps</h2>
            </div>
          </div>
          <div className="stripe-readiness-checks">
            {[
              ["1", "Choose payment method", true],
              ["2", "Connect or enter details", Boolean(readiness?.checks?.accountLinked)],
              ["3", "Verify setup", Boolean(readiness?.checks?.businessVerified && readiness?.checks?.customerPaymentsEnabled)],
              ["4", "Run safe test", Boolean(readiness?.checks?.depositCheckoutReady)],
              ["5", "Ready to take customer payments", ready],
            ].map(([number, label, done]) => (
              <div className="stripe-readiness-check" key={String(label)}>
                <strong>{number}. {label}</strong>
                <OperatorStatusBadge label={done ? "Done" : "Next"} tone={done ? "success" : "neutral"} />
              </div>
            ))}
          </div>
        </section>

        <section className="stripe-readiness-card">
          <div className="stripe-readiness-card__header">
            <div>
              <p className="operator-eyebrow">Readiness checklist</p>
              <h2>Customer payment checks</h2>
            </div>
            <span>{checks.filter((check) => check.status === "done").length}/{checks.length}</span>
          </div>
          <div className="stripe-readiness-checks">
            {checks.map((check) => (
              <div className="stripe-readiness-check" key={check.label}>
                <strong>{check.label}</strong>
                <OperatorStatusBadge label={checkLabel(check.status)} tone={checkTone(check.status)} />
              </div>
            ))}
          </div>
          <details className="stripe-readiness-details">
            <summary>More details</summary>
            <p>{readiness?.summary || "Connect Stripe before customers can pay online."}</p>
            <p>Verification and checkout testing never create a customer payment.</p>
          </details>
        </section>

        <section className="stripe-onboarding-actions" aria-label="Stripe setup actions">
          {!onboardingAvailable ? (
            <button
              className="button"
              type="button"
              data-testid="stripe-wizard-unavailable"
              disabled
            >
              Stripe setup is not available yet.
            </button>
          ) : onboardingFailed ? (
            <button
              className="button"
              type="button"
              data-testid="stripe-wizard-try-again"
              disabled={!canManage || Boolean(busy)}
              onClick={() => void runAction("onboarding")}
            >
              {busy === "onboarding" ? "Opening Stripe..." : continueSetup ? "Continue Stripe setup" : "Try again"}
            </button>
          ) : (
            <button
              className="button"
              type="button"
              data-testid="stripe-wizard-reconnect"
              disabled={!canManage || Boolean(busy)}
              onClick={() => void runAction("onboarding")}
            >
              {busy === "onboarding" ? "Opening Stripe..." : connected ? "Reconnect Stripe" : "Connect Stripe"}
            </button>
          )}
          {!onboardingFailed ? (
            <>
              <button
                className="button secondary"
                type="button"
                data-testid="stripe-wizard-verify"
                disabled={!canManage || Boolean(busy)}
                onClick={() => void runAction("verify")}
              >
                {busy === "verify" ? "Verifying..." : "Verify setup"}
              </button>
              <button
                className="button secondary"
                type="button"
                data-testid="stripe-wizard-test"
                disabled={!canManage || Boolean(busy)}
                onClick={() => void runAction("test")}
              >
                {busy === "test" ? "Testing..." : "Test checkout"}
              </button>
            </>
          ) : null}
          {connected ? (
            <button
              className="button secondary stripe-disconnect-action"
              type="button"
              data-testid="stripe-wizard-disconnect"
              disabled={!canManage || Boolean(busy)}
              onClick={() => void disconnect()}
            >
              {busy === "disconnect" ? "Disconnecting..." : "Disconnect Stripe"}
            </button>
          ) : null}
          <Link className="button secondary" href="/dashboard/settings/payments" data-testid="stripe-review-payments">
            Back to Payments & Invoices
          </Link>
        </section>
      </div>
    </DashboardShell>
  );
}
