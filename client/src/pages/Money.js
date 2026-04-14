import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Modal, Spinner, EmptyState, ConfirmDialog } from '../components/Shared';
import { format } from 'date-fns';

function StatCard({ label, value, sub, color }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color: color || 'var(--text)', fontSize: 24 }}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function MiniBar({ data, field, color }) {
  if (!data?.length) return null;
  const max = Math.max(...data.map(d => d[field]), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80, marginTop: 8 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div style={{ width: '100%', height: Math.max(4, (d[field] / max) * 60), background: color || 'var(--accent)', borderRadius: '3px 3px 0 0', transition: 'height .3s' }} />
          <div style={{ fontSize: 9, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{d.month}</div>
        </div>
      ))}
    </div>
  );
}

function ToolForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || {
    name: '', description: '', cost: '', supplier: '',
    purchased_date: new Date().toISOString().split('T')[0],
    category: 'Tool', notes: ''
  });
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async e => {
    e.preventDefault(); setSaving(true);
    try {
      if (initial?.id) await axios.put(`/api/money/tools/${initial.id}`, form);
      else await axios.post('/api/money/tools', form);
      onSave();
    } catch(err) { alert(err.response?.data?.error || 'Error'); }
    setSaving(false);
  };

  return (
    <form onSubmit={submit}>
      <div className="grid-2">
        <div className="form-group"><label>Name *</label><input className="form-control" value={form.name} onChange={set('name')} required autoFocus /></div>
        <div className="form-group">
          <label>Category</label>
          <select className="form-control" value={form.category} onChange={set('category')}>
            {['Tool','Equipment','Software','Consumable','Other'].map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Cost ($)</label><input className="form-control" type="number" step="0.01" min="0" value={form.cost} onChange={set('cost')} /></div>
        <div className="form-group"><label>Purchase date</label><input className="form-control" type="date" value={form.purchased_date?.split('T')[0] || ''} onChange={set('purchased_date')} /></div>
        <div className="form-group"><label>Supplier</label><input className="form-control" value={form.supplier} onChange={set('supplier')} /></div>
      </div>
      <div className="form-group"><label>Description</label><textarea className="form-control" value={form.description} onChange={set('description')} rows={2} /></div>
      <div className="form-group"><label>Notes</label><textarea className="form-control" value={form.notes} onChange={set('notes')} rows={2} /></div>
      <div className="modal-footer">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  );
}

export default function Money() {
  const [stats, setStats] = useState(null);
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [tab, setTab] = useState('overview');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, t] = await Promise.all([
      axios.get(`/api/money/stats?period=${period}`),
      axios.get('/api/money/tools')
    ]);
    setStats(s.data);
    setTools(t.data);
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const totalToolsAllTime = tools.reduce((s, t) => s + (t.cost || 0), 0);

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>💰 Money</h1></div>
        <div className="flex" style={{ gap: 8 }}>
          {[['week','Week'],['month','Month'],['year','Year']].map(([v,l]) => (
            <button key={v} className={`btn btn-sm ${period===v ? 'btn-primary' : ''}`} onClick={() => setPeriod(v)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="tabs">
        {[['overview','📊 Overview'],['invoices','🧾 Invoices'],['tools','🔧 Tools & Equipment']].map(([id,label]) => (
          <button key={id} className={`tab ${tab===id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {loading ? <Spinner /> : (
        <>
          {tab === 'overview' && (
            <div>
              <div className="grid-stat" style={{ marginBottom: 16 }}>
                <StatCard label="Revenue collected" value={`$${(stats?.revenue || 0).toFixed(2)}`} sub={`vs $${(stats?.prevRevenue || 0).toFixed(2)} last ${period}`} color={stats?.revenue >= stats?.prevRevenue ? 'var(--success)' : 'var(--danger)'} />
                <StatCard label="Outstanding" value={`$${(stats?.outstanding || 0).toFixed(2)}`} sub="unpaid invoices" color="var(--warning)" />
                <StatCard label="Tools spent" value={`$${(stats?.toolsSpent || 0).toFixed(2)}`} sub="this period" color="var(--danger)" />
                <StatCard label="Net profit est." value={`$${(stats?.profit || 0).toFixed(2)}`} sub="revenue minus costs" color={(stats?.profit || 0) >= 0 ? 'var(--success)' : 'var(--danger)'} />
              </div>

              <div className="grid-2" style={{ marginBottom: 16 }}>
                <div className="card">
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>📈 Revenue (6 months)</div>
                  <MiniBar data={stats?.monthly} field="revenue" color="var(--success)" />
                </div>
                <div className="card">
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>🔧 Tools spend (6 months)</div>
                  <MiniBar data={stats?.monthly} field="tools" color="var(--danger)" />
                </div>
              </div>

              {stats?.topCustomers?.length > 0 && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>🏆 Top customers this period</div>
                  {stats.topCustomers.map((c, i) => (
                    <div key={i} className="flex-between" style={{ marginBottom: 8 }}>
                      <div className="flex" style={{ gap: 8 }}>
                        <span style={{ fontSize: 12, color: 'var(--text3)', width: 16 }}>{i+1}</span>
                        <span style={{ fontSize: 13 }}>{c.name}</span>
                      </div>
                      <span style={{ fontWeight: 600, color: 'var(--success)' }}>${c.total.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="card">
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>📦 All-time tools investment</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--danger)', marginBottom: 4 }}>${totalToolsAllTime.toFixed(2)}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>{tools.length} tools and equipment items</div>
              </div>
            </div>
          )}

          {tab === 'invoices' && (
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Invoice breakdown</div>
              {(stats?.invoiceBreakdown || []).map(row => (
                <div key={row.status} className="flex-between" style={{ marginBottom: 10, padding: '10px 12px', background: 'var(--bg3)', borderRadius: 8 }}>
                  <div>
                    <span className={`badge badge-${row.status}`}>{row.status}</span>
                    <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 8 }}>{row.count} invoice{row.count !== 1 ? 's' : ''}</span>
                  </div>
                  <span style={{ fontWeight: 700 }}>${row.total.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          {tab === 'tools' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--text2)' }}>Total spent all time: <strong style={{ color: 'var(--danger)' }}>${totalToolsAllTime.toFixed(2)}</strong></div>
                <button className="btn btn-primary" onClick={() => { setEditing(null); setModal(true); }}>+ Add tool / equipment</button>
              </div>
              {tools.length === 0 ? (
                <div className="card"><EmptyState icon="🔧" title="No tools logged yet" body="Track tools and equipment purchases here." action={<button className="btn btn-primary" onClick={() => setModal(true)}>Add first item</button>} /></div>
              ) : (
                <div className="card">
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Name</th><th>Category</th><th>Cost</th><th>Supplier</th><th>Date</th><th></th></tr></thead>
                      <tbody>
                        {tools.map(t => (
                          <tr key={t.id}>
                            <td style={{ fontWeight: 500 }}>{t.name}</td>
                            <td style={{ fontSize: 12, color: 'var(--text2)' }}>{t.category}</td>
                            <td style={{ fontWeight: 600, color: 'var(--danger)' }}>${(t.cost || 0).toFixed(2)}</td>
                            <td style={{ fontSize: 12, color: 'var(--text3)' }}>{t.supplier || '—'}</td>
                            <td style={{ fontSize: 12, color: 'var(--text3)' }}>{format(new Date(t.purchased_date), 'MMM d, yyyy')}</td>
                            <td>
                              <div className="flex">
                                <button className="btn btn-sm btn-icon" onClick={() => { setEditing(t); setModal(true); }}>✏️</button>
                                <button className="btn btn-sm btn-icon btn-danger" onClick={() => setConfirm(t.id)}>🗑️</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <Modal open={modal} onClose={() => { setModal(false); setEditing(null); }} title={editing ? 'Edit item' : 'Add tool / equipment'}>
        <ToolForm initial={editing} onSave={() => { setModal(false); setEditing(null); load(); }} onClose={() => { setModal(false); setEditing(null); }} />
      </Modal>
      <ConfirmDialog open={!!confirm} message="Delete this item?" onConfirm={async () => { await axios.delete(`/api/money/tools/${confirm}`); setConfirm(null); load(); }} onCancel={() => setConfirm(null)} />
    </div>
  );
}
