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
    <div className="container" style={{ maxWidth: 720, paddingTop: 40 }}>
      <div className="card" style={{ padding: 24 }}>
        <h1>Activate customer account</h1>
        <p className="muted">Set your password to move from invitation-only access into the customer workspace.</p>
        {error ? <p style={{ color: "#fca5a5" }}>{error}</p> : null}
        <form onSubmit={activate} style={{ display: "grid", gap: 12 }}>
          <label>Invitation token</label>
          <input className="input" value={token} onChange={(event) => setToken(event.target.value)} />
          <label>Password</label>
          <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="button" type="submit" disabled={busy || !token || !password}>
              {busy ? "Activating..." : "Activate account"}
            </button>
            <Link href="/customer" className="button secondary">Back to customer login</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
