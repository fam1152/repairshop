import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useSettings } from '../context/SettingsContext';
import BackupRestore from '../components/BackupRestore';
import AccountManagement from '../components/AccountManagement';
import UpdateChecker from '../components/UpdateChecker';
import { AISettings } from '../components/AIAssistant';
import Troubleshooting from '../components/Troubleshooting';
import CloudSettings from '../components/CloudSettings';
import { useAuth } from '../context/AuthContext';


function ManufacturersTab() {
  const [manufacturers, setManufacturers] = React.useState([]);
  const [editing, setEditing] = React.useState(null);
  const [form, setForm] = React.useState({ name: '', logo_emoji: '📦', device_types: [] });
  const [saving, setSaving] = React.useState(false);

  const load = () => { axios.get('/api/manufacturers/all').then(r => setManufacturers(r.data)).catch(()=>{}); };
  React.useEffect(() => { load(); }, []);

  const DEVICE_TYPES = ['Phone','Laptop','Desktop','Tablet','Printer','Server','Network Device','Monitor','Other'];
  const EMOJIS = ['🍎','🌀','🔵','〽️','📺','🎮','🔍','1️⃣','💻','🖨️','⚡','💼','🅰️','🎯','💾','📦','🖥️','⌨️','🖱️'];

  const save = async () => {
    setSaving(true);
    try {
      if (editing?.id) await axios.put('/api/manufacturers/' + editing.id, form);
      else await axios.post('/api/manufacturers', form);
      setEditing(null);
      setForm({ name: '', logo_emoji: '📦', device_types: [] });
      load();
    } catch(e) { alert(e.response?.data?.error || 'Error'); }
    setSaving(false);
  };

  const toggleType = (t) => {
    setForm(f => ({ ...f, device_types: f.device_types.includes(t) ? f.device_types.filter(x => x !== t) : [...f.device_types, t] }));
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 14 }}>
          {editing ? 'Edit manufacturer' : 'Add manufacturer'}
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label>Name *</label>
            <input className="form-control" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Razer" autoFocus />
          </div>
          <div className="form-group">
            <label>Emoji logo</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
              {EMOJIS.map(e => (
                <button key={e} type="button" onClick={() => setForm(f => ({...f, logo_emoji: e}))} style={{ fontSize: 18, padding: '4px 6px', borderRadius: 6, border: form.logo_emoji === e ? '2px solid var(--accent)' : '2px solid transparent', background: form.logo_emoji === e ? 'var(--accent-light)' : 'var(--bg3)', cursor: 'pointer' }}>{e}</button>
              ))}
            </div>
            <input className="form-control" value={form.logo_emoji} onChange={e => setForm(f => ({...f, logo_emoji: e.target.value}))} placeholder="Or type any emoji" style={{ width: 100 }} />
          </div>
        </div>
        <div className="form-group">
          <label>Device types this brand covers</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {DEVICE_TYPES.map(t => (
              <button key={t} type="button" onClick={() => toggleType(t)} className="btn btn-sm" style={{ background: form.device_types.includes(t) ? 'var(--accent)' : undefined, color: form.device_types.includes(t) ? '#fff' : undefined, borderColor: form.device_types.includes(t) ? 'var(--accent)' : undefined }}>{t}</button>
            ))}
          </div>
        </div>
        <div className="flex" style={{ gap: 8 }}>
          <button className="btn btn-primary" onClick={save} disabled={saving || !form.name}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add manufacturer'}</button>
          {editing && <button className="btn" onClick={() => { setEditing(null); setForm({ name:'', logo_emoji:'📦', device_types:[] }); }}>Cancel</button>}
        </div>
      </div>

      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>Manufacturers ({manufacturers.length})</div>
        {manufacturers.map(m => {
          const types = JSON.parse(m.device_types || '[]');
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 20 }}>{m.logo_emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
                {types.length > 0 && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{types.join(' · ')}</div>}
              </div>
              <span style={{ fontSize: 11, background: m.active ? 'var(--success-light)' : 'var(--bg3)', color: m.active ? 'var(--success)' : 'var(--text3)', padding: '2px 8px', borderRadius: 10 }}>{m.active ? 'Active' : 'Hidden'}</span>
              <button className="btn btn-sm" onClick={() => { setEditing(m); setForm({ name: m.name, logo_emoji: m.logo_emoji, device_types: JSON.parse(m.device_types || '[]') }); }}>Edit</button>
              <button className="btn btn-sm" onClick={async () => { await axios.put('/api/manufacturers/' + m.id, { ...m, active: !m.active }); load(); }}>{m.active ? 'Hide' : 'Show'}</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Settings() {
  const { settings, update, toggleDarkMode, darkMode: effectiveDarkMode, reload } = useSettings();
  const { user } = useAuth();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [tab, setTab] = useState('company');
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState('');

  useEffect(() => { if (settings) setForm({ ...settings }); }, [settings]);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const setCheck = k => e => setForm(f => ({ ...f, [k]: e.target.checked ? 1 : 0 }));

  const save = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      await update(form);
      if (logoFile) {
        const fd = new FormData();
        fd.append('logo', logoFile);
        await axios.post('/api/settings/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        await reload();
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { alert('Error saving settings'); }
    setSaving(false);
  };

  const changePassword = async e => {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) { setPwMsg('Passwords do not match'); return; }
    if (pwForm.next.length < 6) { setPwMsg('Password must be at least 6 characters'); return; }
    try {
      await axios.post('/api/auth/change-password', { current: pwForm.current, next: pwForm.next });
      setPwMsg('Password changed!');
      setPwForm({ current: '', next: '', confirm: '' });
    } catch (err) { setPwMsg(err.response?.data?.error || 'Error'); }
  };

  if (!form) return null;

  return (
    <div className="page">
      <div className="page-header"><h1>Settings</h1></div>

      <div className="tabs">
        {['company', 'display', 'invoice', 'account', 'backup', 'updates', 'ai', 'troubleshooting', 'cloud', 'manufacturers', 'license'].map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'backup' ? '💾 Backup & Restore' : t === 'license' ? '📄 License' : t === 'updates' ? '🔄 Updates' : t === 'ai' ? '🤖 AI' : t === 'troubleshooting' ? '🔧 Troubleshooting' : t === 'display' ? '🖥️ Display' : t === 'cloud' ? '☁️ Cloud' : t === 'manufacturers' ? '🏭 Manufacturers' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'display' && (
        <form onSubmit={save}>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 16 }}>Theme</div>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 12 }}>
                <input type="checkbox" checked={!!form.dark_mode} onChange={e => { setCheck('dark_mode')(e); }} style={{ width: 18, height: 18 }} />
                <div>
                  <div style={{ fontWeight: 600 }}>Dark mode</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>Applies to your account only — each user has their own preference</div>
                </div>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div onClick={() => { setForm(f => ({ ...f, dark_mode: 0 })); toggleDarkMode(0); }} style={{ flex: 1, padding: '16px', borderRadius: 8, border: `2px solid ${!form.dark_mode ? 'var(--accent)' : 'var(--border)'}`, cursor: 'pointer', background: '#f8fafc', textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>☀️</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>Light</div>
              </div>
              <div onClick={() => { setForm(f => ({ ...f, dark_mode: 1 })); toggleDarkMode(1); }} style={{ flex: 1, padding: '16px', borderRadius: 8, border: `2px solid ${form.dark_mode ? 'var(--accent)' : 'var(--border)'}`, cursor: 'pointer', background: '#0f172a', textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>🌙</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>Dark</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 16 }}>Currency</div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Display currency</label>
              <select className="form-control" value={form.currency || 'USD'} onChange={set('currency')}>
                {['USD','CAD','GBP','EUR','AUD','NZD'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saved ? '✓ Saved!' : saving ? 'Saving…' : 'Save display settings'}
          </button>
        </form>
      )}

      {tab === 'company' && (
        <form onSubmit={save}>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 16 }}>Company information</div>
            <div className="grid-2">
              <div className="form-group"><label>Company name</label><input className="form-control" value={form.company_name || ''} onChange={set('company_name')} /></div>
              <div className="form-group"><label>Phone</label><input className="form-control" value={form.phone || ''} onChange={set('phone')} /></div>
            </div>
            <div className="form-group"><label>Email</label><input className="form-control" type="email" value={form.email || ''} onChange={set('email')} /></div>
            <div className="form-group"><label>Address</label><textarea className="form-control" value={form.address || ''} onChange={set('address')} rows={2} /></div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 16 }}>Tax</div>
            <div className="grid-2">
              <div className="form-group"><label>Tax label (e.g. "GST", "VAT")</label><input className="form-control" value={form.tax_label || ''} onChange={set('tax_label')} /></div>
              <div className="form-group"><label>Tax rate (%)</label><input className="form-control" type="number" step="0.01" min="0" max="100" value={form.tax_rate || 0} onChange={set('tax_rate')} /></div>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saved ? '✓ Saved!' : saving ? 'Saving…' : 'Save settings'}
          </button>
        </form>
      )}

      {tab === 'invoice' && (
        <form onSubmit={save}>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 16 }}>Invoice branding</div>
            <div className="form-group">
              <label>Accent color</label>
              <div className="flex">
                <input type="color" value={form.invoice_color || '#2563eb'} onChange={set('invoice_color')} style={{ width: 44, height: 36, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
                <input className="form-control" value={form.invoice_color || '#2563eb'} onChange={set('invoice_color')} style={{ fontFamily: 'monospace', width: 110 }} />
                <div style={{ width: 36, height: 36, background: form.invoice_color || '#2563eb', borderRadius: 6, border: '1px solid var(--border)' }} />
              </div>
            </div>
            <div className="form-group">
              <label>Footer / thank-you note on invoices</label>
              <textarea className="form-control" value={form.invoice_notes || ''} onChange={set('invoice_notes')} rows={2} />
            </div>
            <div className="form-group">
              <label>Company logo</label>
              {(logoPreview || settings?.logo_url) && (
                <div style={{ marginBottom: 10 }}>
                  <img src={logoPreview || settings.logo_url} alt="Logo" style={{ maxHeight: 60, maxWidth: 200, borderRadius: 4, border: '1px solid var(--border)', padding: 4 }} />
                </div>
              )}
              <input type="file" accept="image/*" onChange={e => { const f = e.target.files[0]; if (f) { setLogoFile(f); setLogoPreview(URL.createObjectURL(f)); } }} className="form-control" />
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>PNG, JPG or SVG. Max 5MB.</div>
            </div>
          </div>

          {user?.role === 'admin' ? (
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saved ? '✓ Saved!' : saving ? 'Saving…' : 'Save invoice settings'}
          </button>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text3)', padding: '10px 0' }}>
            ℹ️ Only admin accounts can edit invoice settings.
          </div>
        )}
        </form>
      )}

      {tab === 'backup' && (
        <BackupRestore />
      )}

      {tab === 'account' && (
        <AccountManagement />
      )}

      {tab === 'ai' && (
        <AISettings />
      )}

      {tab === 'troubleshooting' && (
        <Troubleshooting />
      )}

      {tab === 'updates' && (
        <UpdateChecker />
      )}


      {tab === 'cloud' && (
        <CloudSettings />
      )}

      {tab === 'manufacturers' && (
        <ManufacturersTab />
      )}

      {tab === 'license' && (
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>RepairShop</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16 }}>Proprietary Software — All rights reserved</div>
          <pre style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text2)', whiteSpace: 'pre-wrap', fontFamily: 'monospace', background: 'var(--bg3)', padding: 16, borderRadius: 8, overflow: 'auto' }}>{`REPAIRSHOP — PROPRIETARY SOFTWARE LICENSE

Copyright (c) 2026 fam1152
All rights reserved.

This software and its source code ("Software") are proprietary and confidential.

RESTRICTIONS:
1. You may not copy, reproduce, distribute, publish, or otherwise transfer
   the Software or any portion of it to any third party without prior
   written permission from the copyright holder.

2. You may not modify, adapt, translate, reverse engineer, decompile,
   disassemble, or create derivative works based on the Software.

3. You may not sublicense, rent, lease, or lend the Software to any
   third party.

4. You may not use the Software for any purpose other than the internal
   business operations of the licensed organization.

PERMITTED USE:
This Software is licensed for use solely by the organization that
commissioned its development. Internal use, modification for internal
purposes, and deployment on infrastructure owned or controlled by the
licensed organization is permitted.

DISCLAIMER:
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT. IN NO EVENT SHALL
THE COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM, OUT OF,
OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`}</pre>
          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text3)' }}>
            Built with Node.js, React, SQLite · Self-hosted on TrueNAS SCALE
          </div>
        </div>
      )}
    </div>
  );
}
