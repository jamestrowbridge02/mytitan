import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { EntityArtifactsCard } from "../../../components/artifacts/EntityArtifactsCard";
import { EntityCustomFieldsCard } from "../../../components/custom-fields/EntityCustomFieldsCard";
import { DashboardShell } from "../../../components/dashboard-shell";
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
  const [accountStatus, setAccountStatus] = useState<any>(null);
  const [approvalRequests, setApprovalRequests] = useState<any[]>([]);
  const [inviteLink, setInviteLink] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [permissions, setPermissions] = useState(() => emptyPermissionSnapshot());
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

  async function loadWorkspaceGovernance(activeCustomer?: any) {
    const customerId = String(activeCustomer?.id || "");
    if (!customerId) {
      setAccountStatus(null);
      setApprovalRequests([]);
      return;
    }
    try {
      const [account, approvals] = await Promise.all([
        apiFetch(`/customer-accounts/${encodeURIComponent(customerId)}/status`),
        apiFetch(`/customer-approvals?customerId=${encodeURIComponent(customerId)}`),
      ]);
      setAccountStatus(account || null);
      setApprovalRequests(Array.isArray(approvals) ? approvals : []);
    } catch {
      setAccountStatus(null);
      setApprovalRequests([]);
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
        }
      } catch {
        setCustomer(null);
      }
      await Promise.all([loadTimeline(resolved), loadServicePlans(resolved), loadWorkspaceGovernance(resolved)]);
    };
    void run();
  }, [router.isReady, id, name]);

  async function inviteCustomerAccount() {
    if (!customer?.id) return;
    setActionBusy(true);
    setNotice("");
    try {
      const response = await apiFetch("/customer-accounts/invite", {
        method: "POST",
        body: JSON.stringify({ customerId: customer.id }),
      });
      setInviteLink(String(response?.activationUrl || ""));
      setNotice("Customer account invite prepared");
      await loadWorkspaceGovernance(customer);
    } catch {
      setNotice("Could not invite customer account");
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

  return (
    <DashboardShell>
      <div data-customer-comms-timeline="enabled" style={{ position: "absolute", left: -99999, top: -99999, width: 1, height: 1, overflow: "hidden" }}>
        CUSTOMER_COMMS_TIMELINE_ENABLED
      </div>
      <div data-customer-timeline="enabled" style={{ position: "absolute", left: -99999, top: -99999, width: 1, height: 1, overflow: "hidden" }}>
        CUSTOMER_TIMELINE_ENABLED
      </div>

      <div className="card customer-timeline-card">
        <div className="customer-timeline-head">
          <div>
            <h1 className="settings-premium-title" style={{ marginTop: 0, marginBottom: 6 }}>Customer timeline</h1>
            <p className="muted settings-premium-muted" style={{ margin: 0 }}>
              {customer?.name || (typeof name === "string" && name ? name : `Customer ${typeof id === "string" ? id : ""}`)}
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
                {actionBusy ? "Preparing..." : accountStatus?.account ? "Resend invite" : "Invite customer account"}
              </button>
              {inviteLink ? (
                <a className="button secondary" href={inviteLink} target="_blank" rel="noreferrer noopener">
                  Open activation link
                </a>
              ) : null}
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

        <div className="card customer-comms-card">
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
    </DashboardShell>
  );
}
