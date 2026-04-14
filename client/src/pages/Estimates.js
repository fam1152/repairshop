import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Modal, Spinner, EmptyState, ConfirmDialog } from '../components/Shared';
import { format } from 'date-fns';

const STATUS_COLORS = {
  draft: { bg: 'var(--bg3)', color: 'var(--text2)' },
  sent: { bg: 'var(--warning-light)', color: 'var(--warning)' },
  approved: { bg: 'var(--success-light)', color: 'var(--success)' },
  declined: { bg: 'var(--danger-light)', color: 'var(--danger)' },
  converted: { bg: 'var(--accent-light)', color: 'var(--accent)' },
};

function EstimateBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.draft;
  return <span className="badge" style={{ background: s.bg, color: s.color }}>{status}</span>;
}

function EstimateEditor({ estimateId, customers, onSave, onClose, onConverted }) {
  const [est, setEst] = useState(null);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [newItem, setNewItem] = useState({ description: '', qty: 1, unit_price: '' });

  useEffect(() => {
    if (estimateId === 'new') return;
    axios.get(`/api/estimates/${estimateId}`).then(r => setEst(r.data));
  }, [estimateId]);

  const subtotal = (est?.line_items || []).reduce((s, i) => s + (parseFloat(i.qty) || 1) * (parseFloat(i.unit_price) || 0), 0);

  const addItem = () => {
    if (!newItem.description) return;
    setEst(e => ({ ...e, line_items: [...(e.line_items || []), { ...newItem }] }));
    setNewItem({ description: '', qty: 1, unit_price: '' });
  };

  const removeItem = idx => setEst(e => ({ ...e, line_items: e.line_items.filter((_, i) => i !== idx) }));

  const save = async (status) => {
    setSaving(true);
    try {
      await axios.put(`/api/estimates/${estimateId}`, { ...est, status: status || est.status });
      onSave();
    } catch { alert('Error saving estimate'); }
    setSaving(false);
  };

  const convert = async () => {
    if (!window.confirm('Convert this estimate to an invoice? The estimate will be marked as converted.')) return;
    setConverting(true);
    try {
      const r = await axios.post(`/api/estimates/${estimateId}/convert`);
      onConverted(r.data.invoice_id);
    } catch { alert('Error converting estimate'); }
    setConverting(false);
  };

  if (!est) return <Spinner />;

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 16 }}>
        <div className="flex">
          <span style={{ fontWeight: 700, fontSize: 16 }}>{est.estimate_number}</span>
          <EstimateBadge status={est.status} />
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>Customer: <strong>{est.customer_name}</strong></div>
      </div>

      <div style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>Line items</div>
      {(est.line_items || []).map((item, i) => (
        <div key={i} className="flex" style={{ marginBottom: 6, background: 'var(--bg3)', padding: '7px 10px', borderRadius: 6 }}>
          <span style={{ flex: 2, fontSize: 13 }}>{item.description}</span>
          <span style={{ width: 40, textAlign: 'center', fontSize: 13 }}>× {item.qty}</span>
          <span style={{ width: 70, textAlign: 'right', fontSize: 13 }}>${parseFloat(item.unit_price || 0).toFixed(2)}</span>
          <span style={{ width: 70, textAlign: 'right', fontWeight: 600, fontSize: 13 }}>${((item.qty || 1) * (item.unit_price || 0)).toFixed(2)}</span>
          <button className="btn btn-sm btn-danger" onClick={() => removeItem(i)}>✕</button>
        </div>
      ))}
      <div className="flex" style={{ marginBottom: 16, marginTop: 8 }}>
        <input className="form-control" style={{ flex: 2 }} value={newItem.description} onChange={e => setNewItem(n => ({ ...n, description: e.target.value }))} placeholder="Description" />
        <input className="form-control" style={{ width: 60 }} type="number" min="1" value={newItem.qty} onChange={e => setNewItem(n => ({ ...n, qty: e.target.value }))} placeholder="Qty" />
        <input className="form-control" style={{ width: 90 }} type="number" step="0.01" value={newItem.unit_price} onChange={e => setNewItem(n => ({ ...n, unit_price: e.target.value }))} placeholder="Price $" />
        <button className="btn" onClick={addItem}>Add</button>
      </div>

      <div className="grid-2">
        <div className="form-group"><label>Notes</label><textarea className="form-control" value={est.notes || ''} onChange={e => setEst(v => ({ ...v, notes: e.target.value }))} rows={2} /></div>
        <div className="form-group"><label>Valid until</label><input className="form-control" type="date" value={est.valid_until ? est.valid_until.split('T')[0] : ''} onChange={e => setEst(v => ({ ...v, valid_until: e.target.value }))} /></div>
      </div>

      <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
        <div className="flex-between" style={{ marginBottom: 4 }}><span style={{ fontSize: 13, color: 'var(--text2)' }}>Subtotal</span><span style={{ fontSize: 13 }}>${subtotal.toFixed(2)}</span></div>
        <div className="flex-between" style={{ marginBottom: 4 }}><span style={{ fontSize: 13, color: 'var(--text2)' }}>Tax</span><span style={{ fontSize: 13 }}>${(est.tax_amount || 0).toFixed(2)}</span></div>
        <div className="flex-between"><span style={{ fontWeight: 700 }}>Total</span><span style={{ fontWeight: 700, fontSize: 16 }}>${(subtotal + (est.tax_amount || 0)).toFixed(2)}</span></div>
      </div>

      <div className="modal-footer" style={{ flexWrap: 'wrap', gap: 6 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn" onClick={() => window.open(`/api/estimates/${estimateId}/pdf`, '_blank')}>📄 PDF</button>
        <button className="btn" onClick={() => save('draft')} disabled={saving}>Save draft</button>
        <button className="btn" onClick={() => save('sent')} disabled={saving}>Mark sent</button>
        <button className="btn" onClick={() => save('approved')} disabled={saving}>✓ Approved</button>
        <button className="btn btn-danger btn-sm" onClick={() => save('declined')} disabled={saving}>Declined</button>
        {est.status !== 'converted' && <button className="btn btn-primary" onClick={convert} disabled={converting}>🧾 Convert to invoice</button>}
      </div>
    </div>
  );
}

function NewEstimateForm({ customers, repairId, customerId, onSave, onClose }) {
  const [form, setForm] = useState({ customer_id: customerId || '', repair_id: repairId || '', line_items: [], notes: '', valid_until: '' });
  const [newItem, setNewItem] = useState({ description: '', qty: 1, unit_price: '' });
  const [saving, setSaving] = useState(false);

  const addItem = () => {
    if (!newItem.description) return;
    setForm(f => ({ ...f, line_items: [...f.line_items, { ...newItem }] }));
    setNewItem({ description: '', qty: 1, unit_price: '' });
  };

  const submit = async e => {
    e.preventDefault();
    if (!form.customer_id) { alert('Select a customer'); return; }
    setSaving(true);
    try {
      await axios.post('/api/estimates', form);
      onSave();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
    setSaving(false);
  };

  const subtotal = form.line_items.reduce((s, i) => s + (parseFloat(i.qty) || 1) * (parseFloat(i.unit_price) || 0), 0);

  return (
    <form onSubmit={submit}>
      <div className="grid-2">
        <div className="form-group">
          <label>Customer *</label>
          <select className="form-control" value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))} required>
            <option value="">Select customer…</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Valid until</label><input className="form-control" type="date" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} /></div>
      </div>

      <div style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>Line items</div>
      {form.line_items.map((item, i) => (
        <div key={i} className="flex" style={{ marginBottom: 6, background: 'var(--bg3)', padding: '7px 10px', borderRadius: 6 }}>
          <span style={{ flex: 2, fontSize: 13 }}>{item.description}</span>
          <span style={{ width: 50, textAlign: 'center', fontSize: 13 }}>× {item.qty}</span>
          <span style={{ width: 70, textAlign: 'right', fontSize: 13 }}>${parseFloat(item.unit_price || 0).toFixed(2)}</span>
          <button type="button" className="btn btn-sm btn-danger" onClick={() => setForm(f => ({ ...f, line_items: f.line_items.filter((_, x) => x !== i) }))}>✕</button>
        </div>
      ))}
      <div className="flex" style={{ marginBottom: 16 }}>
        <input className="form-control" style={{ flex: 2 }} value={newItem.description} onChange={e => setNewItem(n => ({ ...n, description: e.target.value }))} placeholder="Description" />
        <input className="form-control" style={{ width: 60 }} type="number" min="1" value={newItem.qty} onChange={e => setNewItem(n => ({ ...n, qty: e.target.value }))} />
        <input className="form-control" style={{ width: 90 }} type="number" step="0.01" value={newItem.unit_price} onChange={e => setNewItem(n => ({ ...n, unit_price: e.target.value }))} placeholder="Price $" />
        <button type="button" className="btn" onClick={addItem}>Add</button>
      </div>
      {subtotal > 0 && <div style={{ textAlign: 'right', fontWeight: 700, marginBottom: 12 }}>Subtotal: ${subtotal.toFixed(2)}</div>}
      <div className="form-group"><label>Notes</label><textarea className="form-control" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
      <div className="modal-footer">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create estimate'}</button>
      </div>
    </form>
  );
}

export default function Estimates({ onNavigate }) {
  const [estimates, setEstimates] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [newModal, setNewModal] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');

  const load = useCallback(async () => {
    const [est, cust] = await Promise.all([
      axios.get(`/api/estimates${filterStatus ? `?status=${filterStatus}` : ''}`),
      axios.get('/api/customers')
    ]);
    setEstimates(est.data);
    setCustomers(cust.data);
    setLoading(false);
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>Estimates</h1><p>{estimates.length} total</p></div>
        <div className="flex" style={{ gap: 8 }}>
          <select className="form-control" style={{ width: 'auto' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All statuses</option>
            {['draft', 'sent', 'approved', 'declined', 'converted'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => setNewModal(true)}>+ New estimate</button>
        </div>
      </div>

      <div className="card">
        {loading ? <Spinner /> : estimates.length === 0 ? (
          <EmptyState icon="📋" title="No estimates yet" body="Create a quote for a customer before starting work." action={<button className="btn btn-primary" onClick={() => setNewModal(true)}>New estimate</button>} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Customer</th><th>Status</th><th>Total</th><th>Valid until</th><th>Date</th><th></th></tr></thead>
              <tbody>
                {estimates.map(est => (
                  <tr key={est.id} className="clickable-row" onClick={() => setSelected(est.id)}>
                    <td style={{ fontWeight: 600 }}>{est.estimate_number}</td>
                    <td>{est.customer_name}</td>
                    <td><EstimateBadge status={est.status} /></td>
                    <td style={{ fontWeight: 600 }}>${(est.total || 0).toFixed(2)}</td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>{est.valid_until ? format(new Date(est.valid_until), 'MMM d, yyyy') : '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>{format(new Date(est.created_at), 'MMM d, yyyy')}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="flex">
                        <button className="btn btn-sm" onClick={() => window.open(`/api/estimates/${est.id}/pdf`, '_blank')}>PDF</button>
                        <button className="btn btn-sm btn-icon btn-danger" onClick={() => setConfirm(est.id)}>
                          <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" strokeWidth="2" strokeLinecap="round" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" strokeWidth="2" strokeLinecap="round" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!selected} onClose={() => { setSelected(null); load(); }} title="Edit estimate" large>
        {selected && <EstimateEditor estimateId={selected} customers={customers}
          onSave={() => { load(); }}
          onClose={() => { setSelected(null); load(); }}
          onConverted={invId => { setSelected(null); load(); onNavigate('invoices', { invoiceId: invId }); }} />}
      </Modal>

      <Modal open={newModal} onClose={() => setNewModal(false)} title="New estimate" large>
        <NewEstimateForm customers={customers} onSave={() => { setNewModal(false); load(); }} onClose={() => setNewModal(false)} />
      </Modal>

      <ConfirmDialog open={!!confirm} message="Delete this estimate?" onConfirm={async () => { await axios.delete(`/api/estimates/${confirm}`); setConfirm(null); load(); }} onCancel={() => setConfirm(null)} />
    </div>
  );
}
