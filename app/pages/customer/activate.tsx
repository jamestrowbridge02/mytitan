import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { customerApiFetch, setCustomerToken } from "../../lib/customer-auth";

export default function CustomerActivationPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    if (typeof router.query.token === "string") {
      setToken(router.query.token);
    }
  }, [router.isReady, router.query.token]);

  async function activate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await customerApiFetch("/customer-auth/activate", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setCustomerToken(String(response?.token || ""));
      router.replace("/customer");
    } catch (err: any) {
      setError(err?.message || "Could not activate account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-shell__frame" style={{ gridTemplateColumns: "minmax(0, 0.95fr) minmax(0, 1.05fr)" }}>
        <section className="auth-shell__panel auth-shell__hero">
          <div className="auth-shell__eyebrow">Customer workspace</div>
          <h1 className="auth-shell__title">Activate your service account.</h1>
          <p className="auth-shell__lead">
            Finish account setup to review jobs, approvals, documents, and service plans from a customer-safe workspace.
          </p>
          <ul className="auth-shell__featureList">
            <li className="auth-shell__feature">
              <strong>Scoped to your account</strong>
              Customer access is limited to records intentionally shared with you.
            </li>
            <li className="auth-shell__feature">
              <strong>Approvals and documents in one place</strong>
              No need to chase separate email threads for service decisions.
            </li>
          </ul>
        </section>

        <section className="card auth-shell__panel">
          <h1>Activate customer account</h1>
          <p className="muted">Set your password to move from invitation-only access into the customer workspace.</p>
          {error ? <p className="auth-shell__status auth-shell__status--error">{error}</p> : null}
          <form className="auth-shell__form" onSubmit={activate}>
            <label>Invitation token</label>
            <input className="input" value={token} onChange={(event) => setToken(event.target.value)} />
            <label>Password</label>
            <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            <div className="auth-shell__actions">
              <button className="button" type="submit" disabled={busy || !token || !password}>
                {busy ? "Activating..." : "Activate account"}
              </button>
              <Link href="/customer" className="button secondary">Back to customer login</Link>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
