import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import { EntityArtifactsCard } from "../../../components/artifacts/EntityArtifactsCard";
import { EntityCustomFieldsCard } from "../../../components/custom-fields/EntityCustomFieldsCard";
import { DashboardShell } from "../../../components/dashboard-shell";
import { OperatorActionTile } from "../../../components/ui/operator-insights";
import { OperatorPageHeader } from "../../../components/ui/operator-page";
import { apiFetch } from "../../../lib/api";
import { emptyPermissionSnapshot, hasWorkspacePermission, normalizePermissionSnapshot } from "../../../lib/workspace-permissions";

export default function CustomerTimelinePage() {
  const router = useRouter();
  const { id, name } = router.query;
  const [customer, setCustomer] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState<"sms" | "email">("sms");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [servicePlans, setServicePlans] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [accountStatus, setAccountStatus] = useState<any>(null);
  const [approvalRequests, setApprovalRequests] = useState<any[]>([]);
  const [customerCommercial, setCustomerCommercial] = useState<any>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [paymentTermsDays, setPaymentTermsDays] = useState<string>("");
  const [permissions, setPermissions] = useState(() => emptyPermissionSnapshot());
  const communicationCardRef = useRef<HTMLDivElement | null>(null);
  const canManagePortal = hasWorkspacePermission(permissions, "portal.manage");
  const recurringActivity = items.filter((item) => {
    const type = String(item?.type || "");
    const label = String(item?.label || "").toLowerCase();
    return type.startsWith("service_plan.") || label.includes("recurring plan");
  }).slice(0, 5);

  async function loadTimeline(activeCustomer?: any) {
    try {
      const customerName =
        String(activeCustomer?.name || "")
        || (typeof name === "string" ? name : "");
      const customerId = String(activeCustomer?.id || "");
      const qs = customerId
        ? `/activity/recent?limit=30&customerId=${encodeURIComponent(customerId)}`
        : `/activity/recent?limit=30&customerName=${encodeURIComponent(customerName)}`;
      const rows = await apiFetch(qs);
      setItems(Array.isArray(rows) ? rows : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadServicePlans(activeCustomer?: any) {
    const customerId = String(activeCustomer?.id || "");
    if (!customerId) {
      setServicePlans([]);
      return;
    }
    try {
      const rows = await apiFetch(`/service-plans?customerId=${encodeURIComponent(customerId)}`);
      setServicePlans(Array.isArray(rows) ? rows : []);
    } catch {
      setServicePlans([]);
    }
  }

  async function loadQuotes(activeCustomer?: any) {
    const customerId = String(activeCustomer?.id || "");
    if (!customerId) {
      setQuotes([]);
      return;
    }
    try {
      const rows = await apiFetch(`/quotes?customerId=${encodeURIComponent(customerId)}`);
      setQuotes(Array.isArray(rows) ? rows : []);
    } catch {
      setQuotes([]);
    }
  }

  async function loadWorkspaceGovernance(activeCustomer?: any) {
    const customerId = String(activeCustomer?.id || "");
    if (!customerId) {
      setAccountStatus(null);
      setApprovalRequests([]);
      return;
    }
    const [accountResult, approvalsResult] = await Promise.allSettled([
      apiFetch(`/customer-accounts/${encodeURIComponent(customerId)}/status`),
      apiFetch(`/customer-approvals?customerId=${encodeURIComponent(customerId)}`),
    ]);

    if (accountResult.status === "fulfilled") {
      setAccountStatus(accountResult.value || null);
    } else {
      setAccountStatus(null);
    }

    if (approvalsResult.status === "fulfilled") {
      setApprovalRequests(Array.isArray(approvalsResult.value) ? approvalsResult.value : []);
    } else {
      setApprovalRequests([]);
    }
  }

  async function loadCustomerCommercial(activeCustomer?: any) {
    const customerId = String(activeCustomer?.id || "");
    if (!customerId) {
      setCustomerCommercial(null);
      return;
    }
    try {
      const analytics = await apiFetch(`/analytics/customers?windowDays=30&customerId=${encodeURIComponent(customerId)}`);
      setCustomerCommercial(analytics?.customerSummary || null);
    } catch {
      setCustomerCommercial(null);
    }
  }

  useEffect(() => {
    if (!router.isReady) return;
    const run = async () => {
      setLoading(true);
      let resolved: any = null;
      try {
        const me = await apiFetch("/me").catch(() => null);
        setPermissions(normalizePermissionSnapshot(me?.permissions));
        if (typeof id === "string" && id) {
          resolved = await apiFetch(`/customers/${encodeURIComponent(id)}`);
          setCustomer(resolved || null);
          setPaymentTermsDays(resolved?.paymentTermsDays == null ? "" : String(resolved.paymentTermsDays));
        }
      } catch {
        setCustomer(null);
      }
      await Promise.all([loadTimeline(resolved), loadServicePlans(resolved), loadWorkspaceGovernance(resolved), loadQuotes(resolved), loadCustomerCommercial(resolved)]);
    };
    void run();
  }, [router.isReady, id, name]);

  useEffect(() => {
    if (!router.isReady) return;
    const focus = router.query.focus;
    if (focus === "communications" && communicationCardRef.current) {
      communicationCardRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [router.isReady, router.query.focus]);

  async function inviteCustomerAccount() {
    const customerKey =
      String(customer?.id || "")
      || (typeof id === "string" ? id : "");
    if (!customerKey) return;
    setActionBusy(true);
    setNotice("");
    try {
      const response = await apiFetch("/customer-accounts/invite", {
        method: "POST",
        body: JSON.stringify({ customerId: customerKey }),
      });
      setNotice(String(response?.message || "Customer account invite processed"));
      if (response?.status === "sent") {
        await loadWorkspaceGovernance({ id: customerKey });
      }
    } catch {
      setNotice("Could not send customer account invite");
    } finally {
      setActionBusy(false);
    }
  }

  async function savePaymentTerms() {
    const customerKey = String(customer?.id || (typeof id === "string" ? id : ""));
    if (!customerKey) return;
    setActionBusy(true);
    setNotice("");
    try {
      const updated = await apiFetch(`/customers/${encodeURIComponent(customerKey)}/payment-terms`, {
        method: "PATCH",
        body: JSON.stringify({ paymentTermsDays: paymentTermsDays === "" ? null : Number(paymentTermsDays) }),
      });
      const readback = await apiFetch(`/customers/${encodeURIComponent(customerKey)}`);
      setCustomer(readback);
      setPaymentTermsDays(readback?.paymentTermsDays == null ? "" : String(readback.paymentTermsDays));
      if ((readback?.paymentTermsDays ?? null) !== (updated?.paymentTermsDays ?? null)) {
        throw new Error("Saved value could not be verified.");
      }
      setNotice("Customer payment terms saved.");
    } catch (nextError: any) {
      setNotice(nextError?.message || "Customer payment terms could not be saved.");
    } finally {
      setActionBusy(false);
    }
  }

  async function sendCommunication() {
    try {
      const customerName = String(customer?.name || "") || (typeof name === "string" ? name : "Customer");
      const res = await apiFetch("/activity/communications/send", {
        method: "POST",
        body: JSON.stringify({
          channel,
          customerId: customer?.id || null,
          customerName,
          subject: channel === "email" ? subject : null,
          message,
        }),
      });
      setNotice(res?.label || "Sent");
      setMessage("");
      setSubject("");
      await loadTimeline(customer);
      window.setTimeout(() => setNotice(""), 1800);
    } catch {
      setNotice("Could not send communication");
      window.setTimeout(() => setNotice(""), 1800);
    }
  }

  const customerName = customer?.name || (typeof name === "string" && name ? name : `Customer ${typeof id === "string" ? id : ""}`);
  const customerStats = useMemo(
    () => [
      {
        label: "Activity",
        value: String(items.length),
        hint: items.length ? "Recent contact stays attached to the record" : "No activity recorded yet",
      },
      {
        label: "Service plans",
        value: String(servicePlans.length),
        hint: servicePlans.length ? "Recurring work already linked" : "No recurring work linked yet",
      },
      {
        label: "Quotes",
        value: String(quotes.length),
        hint: quotes.length ? "Commercial work is active" : "No open quote activity",
      },
      {
        label: "Unpaid invoices",
        value: String(Number(customerCommercial?.unpaidInvoiceCount || 0)),
        hint: Number(customerCommercial?.overdueBalanceCents || 0)
          ? `${new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(Number(customerCommercial?.overdueBalanceCents || 0) / 100)} overdue`
          : "No overdue balance detected",
      },
    ],
    [customerCommercial?.overdueBalanceCents, customerCommercial?.unpaidInvoiceCount, items.length, quotes.length, servicePlans.length],
  );
  const createLinkedJobHref = useMemo(() => {
    const params = new URLSearchParams({
      guided: "1",
      entry: "work",
      customerName,
    });
    if (customer?.email) params.set("customerEmail", customer.email);
    if (customer?.phone) params.set("customerPhone", customer.phone);
    return `/dashboard/jobs/new?${params.toString()}`;
  }, [customer?.email, customer?.phone, customerName]);
  const nextCustomerAction = useMemo(() => {
    if (!accountStatus?.account && canManagePortal) {
      return {
        title: "Invite the customer account",
        detail: "Create the workspace access path before follow-up becomes scattered across channels.",
        actionLabel: actionBusy ? "Sending..." : "Invite account",
        onClick: () => void inviteCustomerAccount(),
      };
    }
    if (Number(customerCommercial?.openQuoteCount || 0) > 0) {
      return {
        title: "Quotes still need follow-through",
        detail: "Commercial work is open, so the next step should stay visible from the customer record.",
        actionLabel: "Open quotes",
        href: "/dashboard/quotes",
      };
    }
    if (Number(customerCommercial?.unpaidInvoiceCount || 0) > 0) {
      return {
        title: "Billing follow-up is waiting",
        detail: "Customer money pressure should resolve through the billing workflow, not by hunting across screens.",
        actionLabel: "Open finance",
        href: "/dashboard/finance",
      };
    }
    if (servicePlans.length > 0) {
      return {
        title: "Recurring work is active",
        detail: "Use this record to keep scheduled work and customer communication in one place.",
        actionLabel: "Open plans",
        href: "/dashboard/service-plans",
      };
    }
    return {
      title: "The next update should stay close to the record",
      detail: "Send the next SMS or email from here so the timeline stays operational instead of CRM-heavy.",
      actionLabel: "Open communications",
      onClick: () => communicationCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    };
  }, [accountStatus?.account, actionBusy, canManagePortal, customerCommercial?.openQuoteCount, customerCommercial?.unpaidInvoiceCount, servicePlans.length]);

  return (
    <DashboardShell>
      <div data-customer-comms-timeline="enabled" hidden>
        CUSTOMER_COMMS_TIMELINE_ENABLED
      </div>
      <div data-customer-timeline="enabled" hidden>
        CUSTOMER_TIMELINE_ENABLED
      </div>

      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="Customer flow"
          title={customerName}
          subtitle="Keep customer context, communication, recurring work, and commercial follow-through moving from one record."
          actions={[
            { label: "Create linked job", href: createLinkedJobHref },
            { label: "Send update", onClick: () => communicationCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }) },
            { label: "Open quotes", href: "/dashboard/quotes", variant: "secondary" },
          ]}
          shortcuts={["Use one record for communication, recurring work, and follow-through", "Keep the next step visible instead of switching between modules"]}
          stats={customerStats}
        />

        <section className="operator-quickRail" data-testid="customer-detail-quick-rail">
          <OperatorActionTile
            title={nextCustomerAction.title}
            description={nextCustomerAction.detail}
            icon="spark"
            tone="info"
            action={
              nextCustomerAction.href ? (
                <Link className="button" href={nextCustomerAction.href}>
                  {nextCustomerAction.actionLabel}
                </Link>
              ) : (
                <button className="button" type="button" onClick={nextCustomerAction.onClick} disabled={actionBusy}>
                  {nextCustomerAction.actionLabel}
                </button>
              )
            }
          />
          <OperatorActionTile
            title={accountStatus?.account ? "Customer access is connected" : "Customer access is not invited yet"}
            description={
              accountStatus?.account
                ? `Status: ${accountStatus.account.status}. Keep account access and approvals visible from the same workflow.`
                : "Invite access only when the customer should see documents or approvals directly."
            }
            icon="customers"
            tone={accountStatus?.account ? "success" : "warning"}
            action={
              canManagePortal ? (
                <button className="button secondary" type="button" onClick={() => void inviteCustomerAccount()} disabled={actionBusy}>
                  {accountStatus?.account ? "Resend invite" : "Invite account"}
                </button>
              ) : (
                <span className="muted">Portal access depends on your role permissions.</span>
              )
            }
          />
          <OperatorActionTile
            title="Commercial pressure"
            description={
              customerCommercial
                ? `${customerCommercial.openQuoteCount || 0} open quotes, ${customerCommercial.unpaidInvoiceCount || 0} unpaid invoices, ${customerCommercial.activeServicePlans || 0} active plans.`
                : "Commercial analytics appear here once the customer has quotes, invoices, or recurring work."
            }
            icon="billing"
            tone={Number(customerCommercial?.unpaidInvoiceCount || 0) > 0 ? "warning" : "neutral"}
            action={
              <Link className="button secondary" href={Number(customerCommercial?.unpaidInvoiceCount || 0) > 0 ? "/dashboard/finance" : "/dashboard/quotes"}>
                {Number(customerCommercial?.unpaidInvoiceCount || 0) > 0 ? "Open finance" : "Open quotes"}
              </Link>
            }
          />
        </section>

        <div className="card customer-timeline-card">
        <div className="customer-timeline-head">
          <div>
            <h1 className="settings-premium-title" style={{ marginTop: 0, marginBottom: 6 }}>Customer timeline</h1>
            <p className="muted settings-premium-muted" style={{ margin: 0 }}>
              {customerName}
            </p>
          </div>
        </div>

        {typeof id === "string" && id ? (
          <EntityCustomFieldsCard
            title="Customer custom fields"
            entityType="customer"
            entityId={id}
          />
        ) : null}

        {typeof id === "string" && id ? (
          <EntityArtifactsCard
            title="Customer artifacts"
            entityType="customer"
            entityId={id}
          />
        ) : null}

        <div className="card customer-comms-card" data-testid="customer-account-status">
          <div className="customer-comms-head">
            <h3 style={{ margin: 0 }}>Customer account</h3>
            {notice ? <div className="ccv2-toast ccv2-toast--info">{notice}</div> : null}
          </div>
          {accountStatus?.account ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div><strong>{accountStatus.account.email}</strong></div>
              <p className="muted" style={{ margin: 0 }}>
                {accountStatus.account.status} • Invited {accountStatus.account.invitedAt ? new Date(accountStatus.account.invitedAt).toLocaleString() : "not yet"}
              </p>
              <p className="muted" style={{ margin: 0 }}>
                Activated {accountStatus.account.activatedAt ? new Date(accountStatus.account.activatedAt).toLocaleString() : "not yet"} • Last login {accountStatus.account.lastLoginAt ? new Date(accountStatus.account.lastLoginAt).toLocaleString() : "never"}
              </p>
            </div>
          ) : (
            <p className="muted">No customer workspace account invited yet.</p>
          )}
          {canManagePortal ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              <button className="button" type="button" onClick={() => void inviteCustomerAccount()} disabled={actionBusy} data-testid="customer-account-invite">
                {actionBusy ? "Sending..." : accountStatus?.account ? "Resend invite" : "Invite customer account"}
              </button>
            </div>
          ) : (
            <p className="muted" style={{ marginTop: 12 }}>Your role cannot manage customer account access.</p>
          )}
        </div>

        <div className="card customer-comms-card" data-testid="approval-request-list">
          <div className="customer-comms-head">
            <h3 style={{ margin: 0 }}>Approval requests</h3>
          </div>
          {approvalRequests.length ? (
            <div style={{ display: "grid", gap: 10 }}>
              {approvalRequests.map((approval) => (
                <div key={approval.id} className="integration-card">
                  <div>
                    <strong>{approval.entityLabel || approval.kind}</strong>
                    <p className="muted" style={{ margin: "4px 0 0 0" }}>
                      {approval.kind.replaceAll("_", " ")} • {approval.status} • Requested {approval.requestedAt ? new Date(approval.requestedAt).toLocaleString() : "now"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No approval requests recorded for this customer.</p>
          )}
        </div>

        <div className="card customer-comms-card" data-testid="customer-service-plans">
          <div className="customer-comms-head">
            <h3 style={{ margin: 0 }}>Service plans</h3>
          </div>
          {servicePlans.length ? (
            <div style={{ display: "grid", gap: 10 }}>
              {servicePlans.slice(0, 5).map((plan) => (
                <div key={plan.id} className="integration-card">
                  <div>
                    <strong>{plan.name}</strong>
                    <p className="muted" style={{ margin: "4px 0 0 0" }}>
                      {plan.status} · Next run {plan.nextRunAt ? new Date(plan.nextRunAt).toLocaleString() : "not scheduled"}
                    </p>
                    {plan.currentRenewal ? (
                      <p className="muted" style={{ margin: "4px 0 0 0" }}>
                        Renewal {plan.currentRenewal.status} · window closes {plan.currentRenewal.renewalWindowEndAt ? new Date(plan.currentRenewal.renewalWindowEndAt).toLocaleString() : "not set"}
                      </p>
                    ) : null}
                    {plan.recentChangeRequests?.length ? (
                      <p className="muted" style={{ margin: "4px 0 0 0" }}>
                        Latest request {String(plan.recentChangeRequests[0].kind || "").replaceAll("_", " ")} · {plan.recentChangeRequests[0].status}
                      </p>
                    ) : null}
                  </div>
                  <a className="button secondary" href="/dashboard/service-plans">Open plans</a>
                </div>
              ))}
            </div>
          ) : recurringActivity.length ? (
            <div style={{ display: "grid", gap: 10 }}>
              {recurringActivity.map((item) => (
                <div key={item.id || `${item.type}-${item.at}`} className="integration-card">
                  <div>
                    <strong>{item.label || item.type}</strong>
                    <p className="muted" style={{ margin: "4px 0 0 0" }}>
                      {item.at ? new Date(item.at).toLocaleString() : "Recent recurring activity"}
                    </p>
                  </div>
                  <a className="button secondary" href="/dashboard/service-plans">Open plans</a>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No linked service plans yet.</p>
          )}
        </div>

        <div className="card customer-comms-card" data-testid="customer-commercial-summary">
          <div className="customer-comms-head">
            <h3 style={{ margin: 0 }}>Commercial summary</h3>
          </div>
          {customerCommercial ? (
            <div style={{ display: "grid", gap: 8 }}>
              <p className="muted" style={{ margin: 0 }}>
                {customerCommercial.quoteCount} quotes total • {customerCommercial.openQuoteCount} still open
              </p>
              <p className="muted" style={{ margin: 0 }}>
                {customerCommercial.activeServicePlans} active service plans • {customerCommercial.unpaidInvoiceCount} unpaid invoices
              </p>
              <p className="muted" style={{ margin: 0 }}>
                Overdue balance {(Number(customerCommercial.overdueBalanceCents || 0) / 100).toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 })}
              </p>
            </div>
          ) : (
            <p className="muted">Commercial analytics will appear once this customer has quotes, invoices, or recurring-plan activity.</p>
          )}
        </div>

        <div className="card customer-comms-card" data-testid="customer-payment-terms">
          <div className="customer-comms-head">
            <h3 style={{ margin: 0 }}>Payment terms</h3>
          </div>
          <p className="muted">Leave blank to use the business default. Invoice-level terms can still override this value.</p>
          <label htmlFor="customer-payment-terms-days">Days after invoice</label>
          <input
            id="customer-payment-terms-days"
            className="input"
            type="number"
            min={0}
            max={365}
            value={paymentTermsDays}
            onChange={(event) => setPaymentTermsDays(event.target.value)}
          />
          <button className="button" type="button" disabled={actionBusy} onClick={() => void savePaymentTerms()}>
            {actionBusy ? "Saving..." : "Save payment terms"}
          </button>
        </div>

        <div className="card customer-comms-card" data-testid="customer-quotes">
          <div className="customer-comms-head">
            <h3 style={{ margin: 0 }}>Quotes</h3>
          </div>
          {quotes.length ? (
            <div style={{ display: "grid", gap: 10 }}>
              {quotes.slice(0, 5).map((quote) => (
                <div key={quote.id} className="integration-card">
                  <div>
                    <strong>{quote.quoteNumber}</strong>
                    <p className="muted" style={{ margin: "4px 0 0 0" }}>
                      {quote.title} • {quote.status} • {quote.totalCents ? new Intl.NumberFormat(undefined, { style: "currency", currency: quote.currency || "GBP" }).format(quote.totalCents / 100) : "No value"}
                    </p>
                  </div>
                  <a className="button secondary" href="/dashboard/quotes">Open quotes</a>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No linked quotes yet.</p>
          )}
        </div>

        <div className="card customer-comms-card" ref={communicationCardRef} data-testid="customer-communication-card">
          <div className="customer-comms-head">
            <h3 style={{ margin: 0 }}>Send communication</h3>
            {notice ? <div className="ccv2-toast ccv2-toast--info">{notice}</div> : null}
          </div>

          <div className="customer-comms-form">
            <label className="settings-premium-label">Channel</label>
            <select className="input settings-premium-input" value={channel} onChange={(e) => setChannel(e.target.value as "sms" | "email")}>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
            </select>

            {channel === "email" ? (
              <>
                <label className="settings-premium-label">Subject</label>
                <input className="input settings-premium-input" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </>
            ) : null}

            <label className="settings-premium-label">Message</label>
            <textarea className="textarea settings-premium-input customer-comms-textarea" value={message} onChange={(e) => setMessage(e.target.value)} />

            <button className="button settings-premium-button" type="button" onClick={() => void sendCommunication()}>
              Send
            </button>
          </div>
        </div>

        <div className="customer-timeline-list">
          {loading ? (
            <div className="muted">Loading customer activity…</div>
          ) : items.length ? (
            items.map((item) => (
              <div key={item.id || `${item.type}-${item.at}`} className="customer-timeline-item">
                <div className="customer-timeline-dot"></div>
                <div className="customer-timeline-content">
                  <div className="customer-timeline-label">{item.label || item.type}</div>
                  <div className="customer-timeline-meta">
                    <span>{item.jobRef || "Customer event"}</span>
                    <span>•</span>
                    <span>{item.at ? new Date(item.at).toLocaleString() : ""}</span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="muted">No customer activity recorded yet.</div>
          )}
        </div>
      </div>
      </div>
    </DashboardShell>
  );
}
