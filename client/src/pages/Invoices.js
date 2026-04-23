import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Modal, StatusBadge, Spinner, EmptyState, ConfirmDialog } from '../components/Shared';
import { MagicWandButton } from '../components/AIAssistant';
import { format } from 'date-fns';

function InvoiceEditor({ invoiceId, onSave, onClose, onUpdated }) {
  const [inv, setInv] = useState(null);
  const [saving, setSaving] = useState(false);
  const [newItem, setNewItem] = useState({ description: '', qty: 1, unit_price: '', type: 'part' });
  const [priceBook, setPriceBook] = useState([]);
  const [pbOpen, setPbOpen] = useState(false);
  const [applyPayment, setApplyPayment] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payNotes, setPayNotes] = useState('');

  useEffect(() => { axios.get(`/api/invoices/${invoiceId}`).then(r => setInv(r.data)); }, [invoiceId]);
  useEffect(() => { axios.get('/api/pricebook').then(r => setPriceBook(r.data)).catch(()=>{}); }, []);

  const addItem = () => {
    if (!newItem.description) return;
    setInv(i => ({ ...i, line_items: [...(i.line_items || []), { ...newItem }] }));
    setNewItem({ description: '', qty: 1, unit_price: '', type: 'part' });
  };

  const removeItem = idx => setInv(i => ({ ...i, line_items: (i.line_items || []).filter((_, x) => x !== idx) }));

  const subtotal = (inv?.line_items || []).reduce((s, i) => s + (parseFloat(i.qty) || 1) * (parseFloat(i.unit_price) || 0), 0);

  const markPaid = async () => {
    setSaving(true);
    try { const r = await axios.post(`/api/invoices/${invoiceId}/mark-paid`); setInv(r.data); onUpdated && onUpdated(); }
    catch(e) { alert(e.response?.data?.error || 'Error'); }
    setSaving(false);
  };

  const submitPayment = async () => {
    setSaving(true);
    try {
      const r = await axios.post(`/api/invoices/${invoiceId}/payment`, { amount: payAmount, method: payMethod, notes: payNotes });
      setInv(r.data); setApplyPayment(false); setPayAmount(''); setPayNotes('');
      onUpdated && onUpdated();
    } catch(e) { alert(e.response?.data?.error || 'Error'); }
    setSaving(false);
  };

  const applyToAccount = async () => {
    setSaving(true);
    try { const r = await axios.post(`/api/invoices/${invoiceId}/apply-to-account`); setInv(r.data); onUpdated && onUpdated(); }
    catch(e) { alert(e.response?.data?.error || 'Error'); }
    setSaving(false);
  };

  const save = async (status) => {
    setSaving(true);
    try {
      await axios.put(`/api/invoices/${invoiceId}`, { ...inv, status: status || inv.status });
      onSave();
    } catch { alert('Error saving invoice'); }
    setSaving(false);
  };

  const emailInvoice = async () => {
    const email = window.prompt('Enter customer email address:', inv.customer_email || '');
    if (!email) return;
    setSaving(true);
    try {
      await axios.post('/api/email/send-invoice', { invoice_id: invoiceId, email });
      alert('Invoice emailed successfully!');
    } catch(e) { alert('Error: ' + (e.response?.data?.error || e.message)); }
    setSaving(false);
  };

  if (!inv) return <Spinner />;

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 16 }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{inv.invoice_number}</span>
          <span style={{ marginLeft: 10 }}><StatusBadge status={inv.status} /></span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>Customer: <strong>{inv.customer_name}</strong></div>
      </div>

      <div style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>Line items</div>
      {(inv.line_items || []).map((item, i) => (
        <div key={i} className="flex" style={{ marginBottom: 6, background: 'var(--bg3)', padding: '7px 10px', borderRadius: 6 }}>
          <span style={{ flex: 2, fontSize: 13 }}>{item.description}</span>
          <span style={{ width: 40, textAlign: 'center', fontSize: 13 }}>× {item.qty}</span>
          <span style={{ width: 70, textAlign: 'right', fontSize: 13 }}>${parseFloat(item.unit_price || 0).toFixed(2)}</span>
          <span style={{ width: 70, textAlign: 'right', fontWeight: 600, fontSize: 13 }}>${((item.qty || 1) * (item.unit_price || 0)).toFixed(2)}</span>
          <button className="btn btn-sm btn-danger" onClick={() => removeItem(i)}>✕</button>
        </div>
      ))}

      <div className="flex" style={{ marginBottom: 16, marginTop: 8 }}>
        <div style={{ flex: 2, position: 'relative' }}>
          <input className="form-control" value={newItem.description}
            onChange={e => { setNewItem(n => ({...n, description: e.target.value})); setPbOpen(!!e.target.value); }}
            onFocus={() => setPbOpen(!!newItem.description)}
            placeholder="Description or search price book…" />
          {pbOpen && newItem.description && (
            <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:8, zIndex:200, maxHeight:180, overflowY:'auto', boxShadow:'0 4px 16px rgba(0,0,0,.15)' }}>
              {priceBook.filter(p => p.name.toLowerCase().includes(newItem.description.toLowerCase())).slice(0,6).map(p => (
                <div key={p.id} onClick={() => { setNewItem(n => ({...n, description: p.name, unit_price: p.sell_price, type: p.category==='Labor'?'labor':'part'})); setPbOpen(false); }}
                  style={{ padding:'8px 12px', cursor:'pointer', display:'flex', justifyContent:'space-between', fontSize:13, borderBottom:'1px solid var(--border)' }}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--bg3)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <span>{p.name} <span style={{ fontSize:11, color:'var(--text3)' }}>{p.category}</span></span>
                  <span style={{ fontWeight:600, color:'var(--success)' }}>${p.sell_price.toFixed(2)}</span>
                </div>
              ))}
              {priceBook.filter(p => p.name.toLowerCase().includes(newItem.description.toLowerCase())).length===0 && (
                <div style={{ padding:'10px 12px', fontSize:13, color:'var(--text3)' }}>No matches — type description manually</div>
              )}
            </div>
          )}
        </div>
        <input className="form-control" style={{ width: 60 }} type="number" min="1" value={newItem.qty} onChange={e => setNewItem(n => ({ ...n, qty: e.target.value }))} placeholder="Qty" />
        <select className="form-control" style={{ width: 90 }} value={newItem.type || 'part'} onChange={e => setNewItem(n => ({...n, type: e.target.value}))}>
          <option value="part">Part</option>
          <option value="labor">Labor</option>
          <option value="service">Service</option>
          <option value="fee">Fee</option>
        </select>
        <input className="form-control" style={{ width: 80 }} type="number" step="0.01" value={newItem.unit_price} onChange={e => setNewItem(n => ({ ...n, unit_price: e.target.value }))} placeholder="Price $" />
        <button className="btn" onClick={addItem}>Add</button>
      </div>

      <div className="form-group">
        <div className="flex-between">
          <label>Notes on invoice</label>
          <MagicWandButton value={inv.notes} onExpanded={t => setInv(i => ({...i, notes: t}))} />
        </div>
        <textarea className="form-control" value={inv.notes || ''} onChange={e => setInv(i => ({ ...i, notes: e.target.value }))} />
      </div>
      <div className="form-group">
        <label>Due date</label>
        <input className="form-control" type="date" value={inv.due_date ? inv.due_date.split('T')[0] : ''} onChange={e => setInv(i => ({ ...i, due_date: e.target.value }))} />
      </div>

      <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
        <div className="flex-between" style={{ marginBottom: 4 }}><span style={{ fontSize: 13, color: 'var(--text2)' }}>Subtotal</span><span style={{ fontSize: 13 }}>${subtotal.toFixed(2)}</span></div>
        <div className="flex-between" style={{ marginBottom: 4 }}><span style={{ fontSize: 13, color: 'var(--text2)' }}>Tax</span><span style={{ fontSize: 13 }}>${(inv.tax_amount || 0).toFixed(2)}</span></div>
        <div className="flex-between" style={{ marginBottom: 4 }}><span style={{ fontWeight: 700 }}>Total</span><span style={{ fontWeight: 700, fontSize: 16 }}>${(subtotal + (inv.tax_amount || 0)).toFixed(2)}</span></div>
        {(inv.amount_paid > 0) && <div className="flex-between" style={{ marginBottom: 4 }}><span style={{ fontSize: 13, color: 'var(--success)' }}>Paid</span><span style={{ fontSize: 13, color: 'var(--success)' }}>-${(inv.amount_paid || 0).toFixed(2)}</span></div>}
        {(inv.balance_due > 0) && <div className="flex-between" style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}><span style={{ fontWeight: 700, color: 'var(--danger)' }}>Balance due</span><span style={{ fontWeight: 700, fontSize: 18, color: 'var(--danger)' }}>${(inv.balance_due || 0).toFixed(2)}</span></div>}
      </div>

      {/* Authorized pickup */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', marginBottom: 8 }}>Authorized pickup person (optional)</div>
        <div className="grid-2">
          <div className="form-group" style={{ marginBottom: 0 }}><label>Name</label><input className="form-control" value={inv.authorized_name || ''} onChange={e => setInv(i => ({...i, authorized_name: e.target.value}))} placeholder="Authorized person's name" /></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label>Phone</label><input className="form-control" value={inv.authorized_phone || ''} onChange={e => setInv(i => ({...i, authorized_phone: e.target.value}))} placeholder="Their phone number" /></div>
        </div>
      </div>

      {/* Apply payment panel */}
      {applyPayment && (
        <div style={{ background: 'var(--accent-light)', border: '1px solid var(--accent)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>Apply payment</div>
          <div className="grid-2">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Amount ($)</label>
              <input className="form-control" type="number" step="0.01" min="0" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder={`Max: $${((subtotal + (inv.tax_amount||0)) - (inv.amount_paid||0)).toFixed(2)}`} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Method</label>
              <select className="form-control" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                {['cash','card','check','bank transfer','other'].map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase()+m.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <input className="form-control" style={{ marginTop: 8 }} value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Payment notes (optional)" />
          <div className="flex" style={{ marginTop: 10, gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={submitPayment} disabled={saving || !payAmount}>Apply payment</button>
            <button className="btn btn-sm" onClick={() => setApplyPayment(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="modal-footer" style={{ flexWrap: 'wrap', gap: 6 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn" onClick={() => save('draft')} disabled={saving}>Save draft</button>
        <button className="btn" onClick={() => save('sent')} disabled={saving}>Mark sent</button>
        <button className="btn btn-sm" style={{ background: 'var(--accent-light)', color: 'var(--accent)', borderColor: 'var(--accent)' }} onClick={emailInvoice} disabled={saving}>📧 Email</button>
        <button className="btn btn-sm" style={{ background: 'var(--accent-light)', color: 'var(--accent)', borderColor: 'var(--accent)' }} onClick={() => setApplyPayment(p => !p)} disabled={saving}>💵 Apply payment</button>
        <button className="btn btn-sm" style={{ background: 'var(--warning-light)', color: 'var(--warning)', borderColor: 'var(--warning)' }} onClick={applyToAccount} disabled={saving}>📋 Apply to account</button>
        <button className="btn btn-primary" onClick={markPaid} disabled={saving}>✓ Mark paid</button>
      </div>
    </div>
  );
}

export default function Invoices({ initialState }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(initialState?.invoiceId || null);
  const [confirm, setConfirm] = useState(null);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    const params = filter ? `?status=${filter}` : '';
    const r = await axios.get(`/api/invoices${params}`);
    setInvoices(r.data);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (initialState?.invoiceId) setSelected(initialState.invoiceId); }, [initialState]);

  const openPdf = (id) => window.open(`/api/invoices/${id}/pdf`, '_blank');

  if (selected) {
    return (
      <div className="page">
        <button className="btn btn-sm" style={{ marginBottom: 16 }} onClick={() => { setSelected(null); load(); }}>← Back to invoices</button>
        <div className="card">
          <div className="flex" style={{ marginBottom: 4 }}>
            <button className="btn btn-sm" onClick={() => openPdf(selected)}>
              <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeWidth="2"/><polyline points="14 2 14 8 20 8" strokeWidth="2"/></svg>
              View PDF
            </button>
          </div>
          <InvoiceEditor invoiceId={selected} onSave={() => { load(); }} onClose={() => { setSelected(null); load(); }} />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>Invoices</h1><p>{invoices.length} total</p></div>
        <select className="form-control" style={{ width: 'auto' }} value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
        </select>
      </div>

      <div className="card">
        {loading ? <Spinner /> : invoices.length === 0 ? (
          <EmptyState icon="🧾" title="No invoices yet" body="Invoices are created from repair tickets." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Customer</th><th>Status</th><th>Total</th><th>Date</th><th></th></tr></thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id} className="clickable-row" onClick={() => setSelected(inv.id)}>
                    <td style={{ fontWeight: 600 }}>{inv.invoice_number}</td>
                    <td>{inv.customer_name}</td>
                    <td><StatusBadge status={inv.status} /></td>
                    <td style={{ fontWeight: 600 }}>${(inv.total || 0).toFixed(2)}</td>
                    <td style={{ color: 'var(--text3)', fontSize: 12 }}>{inv.issued_date ? format(new Date(inv.issued_date), 'MMM d, yyyy') : 'N/A'}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="flex">
                        <button className="btn btn-sm" onClick={() => openPdf(inv.id)}>PDF</button>
                        <button className="btn btn-sm btn-icon btn-danger" onClick={() => setConfirm(inv.id)}><svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" strokeWidth="2" strokeLinecap="round"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" strokeWidth="2" strokeLinecap="round"/></svg></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ConfirmDialog open={!!confirm} message="Delete this invoice?" onConfirm={async () => { await axios.delete(`/api/invoices/${confirm}`); setConfirm(null); load(); }} onCancel={() => setConfirm(null)} />
    </div>
  );
}
