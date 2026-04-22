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
import { formatPhoneNumber } from '../components/Shared';


function ManufacturersTab() {
  const { settings, update } = useSettings();
  const [manufacturers, setManufacturers] = React.useState([]);
  const [editing, setEditing] = React.useState(null);
  const [form, setForm] = React.useState({ name: '', logo_emoji: '📦', device_types: [] });
  const [saving, setSaving] = React.useState(false);
  const [newDeviceType, setNewDeviceType] = React.useState('');

  const load = () => { axios.get('/api/manufacturers/all').then(r => setManufacturers(r.data)).catch(()=>{}); };
  React.useEffect(() => { load(); }, []);

  // Parse device types from global settings
  const DEVICE_TYPES = React.useMemo(() => {
    try { return JSON.parse(settings?.device_types || '["Phone","Laptop","Desktop","Tablet","Printer","Server","Network Device","Monitor","Other"]'); }
    catch(e) { return ['Phone','Laptop','Desktop','Tablet','Printer','Server','Network Device','Monitor','Other']; }
  }, [settings?.device_types]);

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

  const addGlobalDeviceType = async () => {
    if (!newDeviceType.trim()) return;
    if (DEVICE_TYPES.includes(newDeviceType.trim())) return alert('Type already exists');
    const newList = [...DEVICE_TYPES, newDeviceType.trim()];
    try {
      await update({ device_types: JSON.stringify(newList) });
      setNewDeviceType('');
    } catch(e) { alert('Failed to add device type'); }
  };

  const deleteGlobalDeviceType = async (t) => {
    if (!window.confirm(`Delete device type "${t}"? This will not affect existing repairs but will remove it from this list.`)) return;
    const newList = DEVICE_TYPES.filter(x => x !== t);
    try {
      await update({ device_types: JSON.stringify(newList) });
    } catch(e) { alert('Failed to delete device type'); }
  };

  return (
    <div>
      {/* ── Device Type Library ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 14 }}>🔧 Manage Device Types</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {DEVICE_TYPES.map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', background: 'var(--bg3)', borderRadius: 20, padding: '4px 4px 4px 12px', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{t}</span>
              <button onClick={() => deleteGlobalDeviceType(t)} style={{ border: 'none', background: 'none', color: 'var(--text3)', cursor: 'pointer', padding: '0 8px', fontSize: 14 }}>✕</button>
            </div>
          ))}
        </div>
        <div className="flex" style={{ gap: 8 }}>
          <input className="form-control" style={{ maxWidth: 300 }} value={newDeviceType} onChange={e => setNewDeviceType(e.target.value)} placeholder="Add new device type (e.g. Console)" />
          <button className="btn btn-sm btn-primary" onClick={addGlobalDeviceType}>+ Add Type</button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>This list determines what options appear when creating new repairs and selecting manufacturer coverage.</div>
      </div>

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

export default function Settings({ onNavigate }) {
  const { settings, update, toggleDarkMode, darkMode: effectiveDarkMode, reload } = useSettings();
  const { user } = useAuth();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [tab, setTab] = useState('shop');
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState('');

  useEffect(() => { if (settings) setForm({ ...settings }); }, [settings]);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const setCheck = k => e => setForm(f => ({ ...f, [k]: e.target.checked ? 1 : 0 }));

  const save = async e => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form };
      if (payload.phone) payload.phone = formatPhoneNumber(payload.phone);
      await update(payload);
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

  const TABS = [
    { id: 'shop', label: '🏪 Shop', desc: 'Company info, branding & manufacturers' },
    { id: 'profile', label: '👤 User Profile', desc: 'Account security & personal display' },
    { id: 'ops', label: '⚙️ Operations', desc: 'Print queue & file browser' },
    { id: 'intel', label: '🤖 Intelligence', desc: 'AI assistant & cloud sync' },
    { id: 'system', label: '🖥️ System', desc: 'Backups, updates & troubleshooting' },
    { id: 'about', label: '📄 About', desc: 'License & version info' },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>V1.0.0-Beta-Build-04-20-2026</div>
        </div>
        {saved && <div style={{ color: 'var(--success)', fontWeight: 700, animation: 'fade 2s forwards' }}>✓ Settings Saved</div>}
      </div>

      <div className="tabs">
        {TABS.map(t => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)} title={t.desc}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'shop' && (
        <form onSubmit={save}>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 16 }}>Company Information</div>
            <div className="grid-2">
              <div className="form-group"><label>Company name</label><input className="form-control" value={form.company_name || ''} onChange={set('company_name')} /></div>
              <div className="form-group"><label>Phone</label><input className="form-control" value={form.phone || ''} onChange={set('phone')} /></div>
            </div>
            <div className="form-group"><label>Email</label><input className="form-control" type="email" value={form.email || ''} onChange={set('email')} /></div>
            <div className="form-group"><label>Address</label><textarea className="form-control" value={form.address || ''} onChange={set('address')} rows={2} /></div>
            
            <div className="grid-2" style={{ marginTop: 16 }}>
              <div className="form-group"><label>Tax label (e.g. "GST", "VAT")</label><input className="form-control" value={form.tax_label || ''} onChange={set('tax_label')} /></div>
              <div className="form-group"><label>Tax rate (%)</label><input className="form-control" type="number" step="0.01" min="0" max="100" value={form.tax_rate || 0} onChange={set('tax_rate')} /></div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 16 }}>Invoice & Document Branding</div>
            <div className="form-group">
              <label>Accent color</label>
              <div className="flex">
                <input type="color" value={form.invoice_color || '#2563eb'} onChange={set('invoice_color')} style={{ width: 44, height: 36, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
                <input className="form-control" value={form.invoice_color || '#2563eb'} onChange={set('invoice_color')} style={{ fontFamily: 'monospace', width: 110 }} />
                <div style={{ width: 36, height: 36, background: form.invoice_color || '#2563eb', borderRadius: 6, border: '1px solid var(--border)' }} />
              </div>
            </div>
            <div className="form-group">
              <label>Footer / thank-you note</label>
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
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 16 }}>Manufacturers & Device Types</div>
            <ManufacturersTab />
          </div>

          <div style={{ position: 'sticky', bottom: 16, zIndex: 10 }}>
            <button type="submit" className="btn btn-primary btn-lg w-full shadow" disabled={saving}>
              {saving ? 'Saving…' : 'Save Shop Settings'}
            </button>
          </div>
        </form>
      )}

      {tab === 'profile' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 16 }}>Display Preferences</div>
            <div className="grid-2">
              <div onClick={() => toggleDarkMode(0)} style={{ padding: '20px', borderRadius: 12, border: `2px solid ${!effectiveDarkMode ? 'var(--accent)' : 'var(--border)'}`, cursor: 'pointer', background: '#f8fafc', textAlign: 'center', transition: 'all 0.2s' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>☀️</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Light Mode</div>
              </div>
              <div onClick={() => toggleDarkMode(1)} style={{ padding: '20px', borderRadius: 12, border: `2px solid ${effectiveDarkMode ? 'var(--accent)' : 'var(--border)'}`, cursor: 'pointer', background: '#0f172a', textAlign: 'center', transition: 'all 0.2s' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🌙</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Dark Mode</div>
              </div>
            </div>
            
            <div className="form-group" style={{ marginTop: 24 }}>
              <label>UI & Font Scale: <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{form.ui_scale || '1.0'}x</span></label>
              <input type="range" min="0.8" max="2.0" step="0.1" className="form-control" value={form.ui_scale || '1.0'} onChange={e => { set('ui_scale')(e); save(); }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                <span>Small</span>
                <span>Normal</span>
                <span>Large Monitor</span>
                <span>TV / Kiosk</span>
              </div>
            </div>

            <div className="form-group" style={{ marginTop: 20, marginBottom: 0 }}>
              <label>Preferred Currency</label>
              <select className="form-control" value={form.currency || 'USD'} onChange={e => { set('currency')(e); save(); }}>
                {['USD','CAD','GBP','EUR','AUD','NZD'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 16 }}>Account Security</div>
            <AccountManagement />
          </div>
        </div>
      )}

      {tab === 'ops' && (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 20 }}>⚙️</div>
          <h2 style={{ marginBottom: 10 }}>Operations has moved</h2>
          <p style={{ color: 'var(--text3)', marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
            The Print Queue and File Browser are now located in their own dedicated section in the main sidebar for easier access.
          </p>
          <button className="btn btn-primary btn-lg" onClick={() => onNavigate('ops')}>
            Go to Operations →
          </button>
        </div>
      )}

      {tab === 'intel' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 16 }}>AI Technician Assistant</div>
            <AISettings />
          </div>
          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 16 }}>Cloud Synchronization</div>
            <CloudSettings />
          </div>
        </div>
      )}

      {tab === 'system' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 16 }}>Backup & Restore</div>
            <BackupRestore />
          </div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 16 }}>Software Updates</div>
            <UpdateChecker />
          </div>
          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 16 }}>Troubleshooting & Diagnostics</div>
            <Troubleshooting />
          </div>
        </div>
      )}

      {tab === 'about' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{ width: 64, height: 64, background: 'var(--accent)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>🔧</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 24 }}>RepairShop</div>
                <div style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 700 }}>V1.0.0-Beta-Build-04-20-2026</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>IT Repair Management & CRM Suite</div>
              </div>
            </div>
            
            <div style={{ background: 'var(--bg3)', padding: 16, borderRadius: 12, marginBottom: 20 }}>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>Support & Feedback</div>
              <div className="form-group">
                <label>Feedback Email</label>
                <div className="flex" style={{ gap: 8 }}>
                  <input className="form-control" value={form.support_email || ''} onChange={set('support_email')} placeholder="e.g. support@yourshop.com" />
                  <button className="btn btn-primary" onClick={() => save()}>Save</button>
                </div>
              </div>
              <div style={{ marginTop: 20, textAlign: 'center', padding: '10px', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text2)' }}>
                  If you like what i do, Buy me a cup of coffee, Helps keep me going!
                </div>
                <a 
                  href="https://www.paypal.com/donate/?business=25L2SPLZ9J9U4&no_recurring=0&item_name=Helping+small+repair+shops+break+free+from+costly+CRM+and+IT+management+subscriptions.&currency_code=USD" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: 8, 
                    background: '#ffc439', 
                    color: '#111', 
                    padding: '8px 20px', 
                    borderRadius: 20, 
                    fontWeight: 700, 
                    textDecoration: 'none',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    transition: 'transform 0.1s'
                  }}
                  onMouseOver={e => e.currentTarget.style.transform = 'scale(1.02)'}
                  onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  <span style={{ fontSize: 16 }}>💙</span> Donate with PayPal
                </a>
              </div>
            </div>

            <pre style={{ fontSize: 11, lineHeight: 1.6, color: 'var(--text2)', whiteSpace: 'pre-wrap', fontFamily: 'monospace', background: 'var(--bg2)', padding: 16, borderRadius: 8, overflow: 'auto', border: '1px solid var(--border)' }}>{`REPAIRSHOP — PROPRIETARY SOFTWARE LICENSE
Copyright (c) 2026 fam1152. All rights reserved.`}</pre>
          </div>

          <div style={{ textAlign: 'center', padding: 20, color: 'var(--text3)', fontSize: 12, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, color: 'var(--text2)', marginBottom: 4 }}>"Measure twice, cut once."</div>
        <div>Built with Node.js, React, SQLite · Self-hosted for Docker</div>
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes fade {
          0% { opacity: 0; transform: translateY(-10px); }
          10% { opacity: 1; transform: translateY(0); }
          90% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-10px); }
        }
        .w-full { width: 100%; }
        .shadow { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
      `}</style>
    </div>
  );
}

