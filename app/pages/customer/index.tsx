import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ApiError } from "../../lib/api";
import { clearCustomerToken, customerApiFetch, getCustomerToken, setCustomerToken } from "../../lib/customer-auth";

function money(cents: number, currency = "GBP") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format((cents || 0) / 100);
}

function formatDateTime(value?: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString();
}

export default function CustomerWorkspacePage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspace, setWorkspace] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const hasToken = useMemo(() => Boolean(getCustomerToken()), []);

  async function loadWorkspace() {
    setLoading(true);
    setError("");
    try {
      const response = await customerApiFetch("/customer-workspace");
      setWorkspace(response);
    } catch (err: any) {
      setWorkspace(null);
      if (err instanceof ApiError && err.statusCode === 401) {
        clearCustomerToken();
        setError("");
        return;
      }
      setError(err?.message || "Failed to load customer workspace");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!hasToken) {
      setLoading(false);
      return;
    }
    void loadWorkspace();
  }, [hasToken]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setAuthLoading(true);
    setError("");
    try {
      const response = await customerApiFetch("/customer-auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setCustomerToken(String(response?.token || ""));
      setWorkspace(response?.account || null);
      setNotice("Signed in");
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setAuthLoading(false);
    }
  }

  async function respond(approvalId: string, decision: "approve" | "decline") {
    setError("");
    setNotice("");
    try {
      await customerApiFetch(`/customer-workspace/approvals/${approvalId}/${decision}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setNotice(decision === "approve" ? "Approval recorded" : "Decline recorded");
      await loadWorkspace();
    } catch (err: any) {
      setError(err?.message || "Could not update approval");
    }
  }

  function signOut() {
    clearCustomerToken();
    setWorkspace(null);
    setNotice("");
    setError("");
  }

  if (!workspace) {
    return (
      <div className="container customer-workspace" style={{ maxWidth: 1120 }}>
        <div className="card customer-workspace__section" style={{ marginBottom: 16 }}>
          <div className="customer-workspace__hero">
            <div>
              <p className="customer-workspace__eyebrow">Customer workspace</p>
              <h1 style={{ marginTop: 8, marginBottom: 8 }}>Track your service records</h1>
              <p className="muted" style={{ margin: 0 }}>
                Review jobs, documents, plans, and approvals linked to your account. Existing tokenized portal links still work.
              </p>
            </div>
            <Link href="/portal/job/e2e-public-portal-token" className="button secondary">Portal example</Link>
          </div>
        </div>

        <div className="card customer-workspace__section">
          <h2 style={{ marginTop: 0 }}>Sign in</h2>
          {error ? <p className="auth-shell__status auth-shell__status--error">{error}</p> : null}
          <form className="auth-shell__form" onSubmit={login}>
            <label>Email</label>
            <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} data-testid="customer-login-email" />
            <label>Password</label>
            <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} data-testid="customer-login-password" />
            <div className="auth-shell__actions">
              <button className="button" type="submit" disabled={authLoading} data-testid="customer-login-submit">
                {authLoading ? "Signing in..." : "Sign in"}
              </button>
              <Link href="/customer/activate" className="button secondary">Activate invited account</Link>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="container customer-workspace">
      <div className="card customer-workspace__section" style={{ marginBottom: 16 }}>
        <div className="customer-workspace__hero">
          <div>
            <p className="customer-workspace__eyebrow">Customer workspace</p>
            <h1 style={{ marginTop: 8, marginBottom: 6 }}>{workspace.customer?.name || "Customer"}</h1>
            <p className="muted" style={{ margin: 0 }}>
              {workspace.customer?.email || "No email"} {workspace.customer?.phone ? `• ${workspace.customer.phone}` : ""}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link className="button secondary" href="/customer/activate">Activation</Link>
            <button className="button secondary" type="button" onClick={signOut}>Sign out</button>
          </div>
        </div>
        {notice ? <p className="auth-shell__status auth-shell__status--success" style={{ marginTop: 12 }}>{notice}</p> : null}
        {error ? <p className="auth-shell__status auth-shell__status--error" style={{ marginTop: 12 }}>{error}</p> : null}
      </div>

      <div className="customer-workspace__stats">
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ marginTop: 0 }}>Account</h3>
          <p className="muted" style={{ marginBottom: 4 }}>Status</p>
          <p style={{ marginTop: 0 }}>{workspace.account?.status || "Unavailable"}</p>
          <p className="muted" style={{ marginBottom: 4 }}>Last login</p>
          <p style={{ marginTop: 0 }}>{formatDateTime(workspace.account?.lastLoginAt)}</p>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ marginTop: 0 }}>Pending approvals</h3>
          <p style={{ margin: 0 }}>{workspace.approvals?.filter((item: any) => item.status === "PENDING").length || 0}</p>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ marginTop: 0 }}>Visible plans</h3>
          <p style={{ margin: 0 }}>{workspace.servicePlans?.length || 0}</p>
        </div>
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        <section className="card customer-workspace__section">
          <h2 style={{ marginTop: 0 }}>Pending approvals</h2>
          {workspace.approvals?.length ? (
            <div style={{ display: "grid", gap: 12 }}>
              {workspace.approvals.map((approval: any) => (
                <div key={approval.id} className="integration-card" data-testid="customer-approval-row">
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <strong>{approval.entityLabel || approval.kind}</strong>
                      <span className={`badge${approval.status === "DECLINED" ? " warn" : ""}`}>{approval.status}</span>
                    </div>
                    <p className="muted" style={{ margin: "6px 0 0 0" }}>
                      {approval.kind.replaceAll("_", " ")} • Requested {formatDateTime(approval.requestedAt)}
                    </p>
                  </div>
                  {approval.status === "PENDING" ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="button" type="button" onClick={() => void respond(approval.id, "approve")} data-testid="customer-approval-action">
                        Approve
                      </button>
                      <button className="button secondary" type="button" onClick={() => void respond(approval.id, "decline")} data-testid="customer-approval-action">
                        Decline
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No approvals are waiting for your response.</p>
          )}
        </section>

        <section className="card customer-workspace__section">
          <h2 style={{ marginTop: 0 }}>Jobs</h2>
          {workspace.jobs?.length ? (
            <div style={{ display: "grid", gap: 12 }}>
              {workspace.jobs.map((job: any) => (
                <div key={job.id} className="integration-card">
                  <div>
                    <strong>{job.jobRef}</strong>
                    <p className="muted" style={{ margin: "6px 0 0 0" }}>
                      {job.status} • {job.serviceName || "Service"} • {job.vehicleLabel || "Vehicle not supplied"}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div>{money(Number(job.totalCents || 0), job.currency || "GBP")}</div>
                    <div className="muted">{job.invoicePaidAt ? "Paid" : job.invoiceIssuedAt ? "Invoice issued" : "In progress"}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No customer-visible jobs yet.</p>
          )}
        </section>

        <section className="card customer-workspace__section">
          <h2 style={{ marginTop: 0 }}>Documents</h2>
          {workspace.documents?.length ? (
            <div style={{ display: "grid", gap: 12 }}>
              {workspace.documents.map((document: any) => (
                <div key={document.id} className="integration-card">
                  <div>
                    <strong>{document.label}</strong>
                    <p className="muted" style={{ margin: "6px 0 0 0" }}>
                      {document.kind.replaceAll("_", " ")} {document.jobRef ? `• ${document.jobRef}` : ""}
                    </p>
                  </div>
                  <a className="button secondary" href={document.downloadPath || document.downloadUrl} target="_blank" rel="noreferrer noopener">
                    Open
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No documents shared yet.</p>
          )}
        </section>

        <section className="card customer-workspace__section">
          <h2 style={{ marginTop: 0 }}>Service plans</h2>
          {workspace.servicePlans?.length ? (
            <div style={{ display: "grid", gap: 12 }}>
              {workspace.servicePlans.map((plan: any) => (
                <div key={plan.id} className="integration-card">
                  <div>
                    <strong>{plan.name}</strong>
                    <p className="muted" style={{ margin: "6px 0 0 0" }}>
                      {plan.status} • Next run {formatDateTime(plan.nextRunAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No plans are shared to this workspace yet.</p>
          )}
        </section>

        <section className="card" style={{ padding: 24 }}>
          <h2 style={{ marginTop: 0 }}>Recent activity</h2>
          {workspace.recentActivity?.length ? (
            <div style={{ display: "grid", gap: 10 }}>
              {workspace.recentActivity.map((item: any) => (
                <div key={item.id} className="integration-card">
                  <div>
                    <strong>{item.label}</strong>
                    <p className="muted" style={{ margin: "6px 0 0 0" }}>{formatDateTime(item.at)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No recent customer-visible activity yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
