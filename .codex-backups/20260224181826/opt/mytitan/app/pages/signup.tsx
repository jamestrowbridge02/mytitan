import { useState } from 'react';
import { apiFetch, setToken } from '../lib/api';

export default function Signup() {
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const res = await apiFetch('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ companyName, email, password }),
      });
      setToken(res.token);
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err.message || 'Signup failed');
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Create your MyTitan account</h1>
        <p className="muted">Start with your company and admin user.</p>
        {error && <p style={{ color: '#ff8a8a' }}>{error}</p>}
        <form onSubmit={handleSubmit}>
          <label>Company name</label>
          <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          <label>Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label>Password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="button" type="submit">Create account</button>
        </form>
        <p style={{ marginTop: 16 }}>
          Already have an account? <a href="/login">Log in</a>
        </p>
      </div>
    </div>
  );
}
