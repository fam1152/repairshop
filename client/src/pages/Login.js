import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.username, form.password);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, background: 'var(--accent)', borderRadius: 16, marginBottom: 16 }}>
            <svg width="28" height="28" fill="none" stroke="#fff" viewBox="0 0 24 24"><path d="M11 4a7 7 0 1 0 7 7" strokeWidth="2" strokeLinecap="round"/><path d="M14 2v6h6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>RepairShop</h1>
          <p style={{ color: 'var(--text3)', fontSize: 14 }}>Sign in to your shop dashboard</p>
        </div>
        <div className="card">
          <form onSubmit={submit}>
            <div className="form-group">
              <label>Username</label>
              <input className="form-control" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="admin" autoFocus />
            </div>
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label>Password</label>
              <input className="form-control" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
            </div>
            {error && <div style={{ background: 'var(--danger-light)', color: 'var(--danger)', padding: '10px 12px', borderRadius: 6, marginBottom: 16, fontSize: 13 }}>{error}</div>}
            <button className="btn btn-primary w-full" style={{ justifyContent: 'center', width: '100%', padding: '10px 14px' }} disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text3)', marginTop: 16 }}>Default: admin / admin — change in Settings after first login</p>
      </div>
    </div>
  );
}
