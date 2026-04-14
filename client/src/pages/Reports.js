import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Modal, Spinner, EmptyState, ConfirmDialog } from '../components/Shared';
import { format } from 'date-fns';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);
const ORDER_STATUSES = ['ordered', 'shipped', 'delivered', 'cancelled'];

// ── Parts Order Form ──
function OrderForm({ initial, inventory, onSave, onClose }) {
  const [form, setForm] = useState(initial || {
    supplier_name: '', supplier_website: '', order_invoice_number: '',
    order_date: new Date().toISOString().split('T')[0],
    total_cost: '', status: 'ordered', notes: '', tracking_number: '', items: []
  });
  const [newItem, setNewItem] = useState({ part_name: '', quantity: 1, unit_cost: '', inventory_id: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const addItem = () => {
    if (!newItem.part_name && !newItem.inventory_id) return;
    const name = newItem.part_name || inventory.find(i => i.id === newItem.inventory_id)?.name || '';
    setForm(f => ({ ...f, items: [...(f.items||[]), { ...newItem, part_name: name }] }));
    setNewItem({ part_name: '', quantity: 1, unit_cost: '', inventory_id: '', notes: '' });
  };

  const removeItem = i => setForm(f => ({ ...f, items: f.items.filter((_, x) => x !== i) }));

  const calcTotal = (form.items||[]).reduce((s, i) => s + (parseFloat(i.unit_cost)||0) * (parseInt(i.quantity)||1), 0);

  const submit = async e => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = { ...form, total_cost: parseFloat(form.total_cost) || calcTotal };
      if (initial?.id) await axios.put(`/api/reports/parts-orders/${initial.id}`, payload);
      else await axios.post('/api/reports/parts-orders', payload);
      onSave();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
    setSaving(false);
  };

  return (
    <form onSubmit={submit}>
      <div style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10 }}>Supplier</div>
      <div className="grid-2">
        <div className="form-group"><label>Supplier name *</label><input className="form-control" value={form.supplier_name} onChange={set('supplier_name')} required autoFocus placeholder="e.g. iFixit, Amazon, eBay" /></div>
        <div className="form-group"><label>Website / URL</label><input className="form-control" value={form.supplier_website} onChange={set('supplier_website')} placeholder="https://www.ifixit.com" /></div>
        <div className="form-group"><label>Their invoice / order #</label><input className="form-control" value={form.order_invoice_number} onChange={set('order_invoice_number')} placeholder="e.g. ORD-123456" /></div>
        <div className="form-group"><label>Tracking number</label><input className="form-control" value={form.tracking_number} onChange={set('tracking_number')} placeholder="e.g. 1Z999AA10123456784" /></div>
      </div>
      <div className="grid-2">
        <div className="form-group"><label>Order date</label><input className="form-control" type="date" value={form.order_date?.split('T')[0]||''} onChange={set('order_date')} /></div>
        <div className="form-group"><label>Status</label>
          <select className="form-control" value={form.status} onChange={set('status')}>
            {ORDER_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
          </select>
        </div>
      </div>

      {/* Line items */}
      <div style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10, marginTop: 4 }}>Parts ordered</div>
      {(form.items||[]).map((item, i) => (
        <div key={i} className="flex" style={{ marginBottom: 6, background: 'var(--bg3)', padding: '7px 10px', borderRadius: 6 }}>
          <span style={{ flex: 2, fontSize: 13 }}>{item.part_name}</span>
          <span style={{ width: 40, textAlign: 'center', fontSize: 13 }}>× {item.quantity}</span>
          <span style={{ width: 70, textAlign: 'right', fontSize: 13 }}>${parseFloat(item.unit_cost||0).toFixed(2)}</span>
          <span style={{ width: 70, textAlign: 'right', fontWeight: 600, fontSize: 13 }}>${((item.quantity||1)*(item.unit_cost||0)).toFixed(2)}</span>
          <button type="button" className="btn btn-sm btn-danger" onClick={() => removeItem(i)}>✕</button>
        </div>
      ))}
      <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
        <div className="grid-2" style={{ marginBottom: 8 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Link to inventory item (optional)</label>
            <select className="form-control" value={newItem.inventory_id} onChange={e => setNewItem(n => ({ ...n, inventory_id: e.target.value, part_name: inventory.find(i => i.id === e.target.value)?.name || n.part_name }))}>
              <option value="">— Or type part name below —</option>
              {inventory.map(i => <option key={i.id} value={i.id}>{i.name}{i.manufacturer ? ` (${i.manufacturer})` : ''}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Part name</label>
            <input className="form-control" value={newItem.part_name} onChange={e => setNewItem(n => ({ ...n, part_name: e.target.value }))} placeholder="e.g. iPhone 13 screen" />
          </div>
        </div>
        <div className="flex" style={{ gap: 8 }}>
          <input className="form-control" style={{ width: 70 }} type="number" min="1" value={newItem.quantity} onChange={e => setNewItem(n => ({ ...n, quantity: e.target.value }))} placeholder="Qty" />
          <input className="form-control" style={{ width: 100 }} type="number" step="0.01" value={newItem.unit_cost} onChange={e => setNewItem(n => ({ ...n, unit_cost: e.target.value }))} placeholder="Unit cost $" />
          <button type="button" className="btn btn-sm btn-primary" onClick={addItem} disabled={!newItem.part_name && !newItem.inventory_id}>+ Add part</button>
        </div>
      </div>

      <div className="grid-2">
        <div className="form-group">
          <label>Total cost ($)</label>
          <input className="form-control" type="number" step="0.01" value={form.total_cost} onChange={set('total_cost')} placeholder={`Auto: $${calcTotal.toFixed(2)}`} />
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>Leave blank to auto-calculate from items</div>
        </div>
      </div>
      <div className="form-group"><label>Notes</label><textarea className="form-control" value={form.notes} onChange={set('notes')} rows={2} /></div>
      <div className="modal-footer">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : initial?.id ? 'Save changes' : 'Log order'}</button>
      </div>
    </form>
  );
}

// ── Tax summary card ──
function TaxSummary({ summary, loading }) {
  if (loading) return <Spinner />;
  if (!summary) return null;

  const rows = [
    { label: 'Gross revenue (paid invoices)', value: summary.revenue?.total, color: 'var(--success)', bold: true },
    { label: 'Tax collected', value: summary.revenue?.tax_collected, color: 'var(--text2)' },
    { label: 'Revenue before tax', value: summary.revenue?.total - summary.revenue?.tax_collected, color: 'var(--text)' },
    null,
    { label: 'Parts / supplies ordered', value: summary.parts_costs?.from_orders, color: 'var(--danger)' },
    { label: 'Parts cost on repairs', value: summary.parts_costs?.from_repairs, color: 'var(--danger)' },
    { label: 'Tools & equipment', value: summary.tools_costs?.total, color: 'var(--danger)' },
    { label: 'Total expenses', value: summary.total_expenses, color: 'var(--danger)', bold: true },
    null,
    { label: 'Net profit (est.)', value: summary.net_profit, color: summary.net_profit >= 0 ? 'var(--success)' : 'var(--danger)', bold: true, large: true },
  ];

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>📊 Summary</div>
      {rows.map((row, i) => row === null ? (
        <hr key={i} className="divider" />
      ) : (
        <div key={i} className="flex-between" style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text2)', fontWeight: row.bold ? 600 : 400 }}>{row.label}</span>
          <span style={{ fontSize: row.large ? 20 : 13, fontWeight: row.bold ? 700 : 500, color: row.color }}>
            ${(row.value || 0).toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Monthly breakdown ──
function MonthlyBreakdown({ summary }) {
  if (!summary?.monthly) return null;
  const hasData = summary.monthly.some(m => m.revenue > 0 || m.parts_cost > 0 || m.tools_cost > 0);
  if (!hasData) return null;
  const maxVal = Math.max(...summary.monthly.map(m => m.revenue), 1);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>📅 Monthly breakdown</div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Revenue</th><th>Parts cost</th><th>Tools</th><th>Net</th><th></th></tr></thead>
          <tbody>
            {summary.monthly.map(m => (
              <tr key={m.month}>
                <td style={{ fontWeight: 500 }}>{m.month_name}</td>
                <td style={{ color: 'var(--success)', fontWeight: 600 }}>{m.revenue > 0 ? `$${m.revenue.toFixed(2)}` : '—'}</td>
                <td style={{ color: 'var(--danger)' }}>{m.parts_cost > 0 ? `$${m.parts_cost.toFixed(2)}` : '—'}</td>
                <td style={{ color: 'var(--danger)' }}>{m.tools_cost > 0 ? `$${m.tools_cost.toFixed(2)}` : '—'}</td>
                <td style={{ fontWeight: 600, color: m.profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {m.revenue > 0 || m.parts_cost > 0 || m.tools_cost > 0 ? `$${m.profit.toFixed(2)}` : '—'}
                </td>
                <td style={{ width: 100 }}>
                  {m.revenue > 0 && (
                    <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(m.revenue / maxVal) * 100}%`, background: 'var(--success)', borderRadius: 3 }} />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Reports Page ──
export default function Reports() {
  const [tab, setTab] = useState('summary');
  const [year, setYear] = useState(CURRENT_YEAR);
  const [quarter, setQuarter] = useState('');
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [inventory, setInventory] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const r = await axios.get(`/api/reports/tax-summary?year=${year}${quarter ? `&quarter=${quarter}` : ''}`);
      setSummary(r.data);
    } catch(e) {}
    setSummaryLoading(false);
  }, [year, quarter]);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const [ordersRes, invRes] = await Promise.all([
        axios.get(`/api/reports/parts-orders?year=${year}`),
        axios.get('/api/inventory')
      ]);
      setOrders(ordersRes.data);
      setInventory(invRes.data);
    } catch(e) {}
    setOrdersLoading(false);
  }, [year]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { if (tab === 'orders') loadOrders(); }, [tab, loadOrders]);

  const downloadXLS = async () => {
    setDownloading(true);
    try {
      const res = await axios.get(`/api/reports/export-xls?year=${year}${quarter ? `&quarter=${quarter}` : ''}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `repairshop-tax-${year}${quarter ? `-Q${quarter}` : ''}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch(e) { alert('Export failed'); }
    setDownloading(false);
  };

  const STATUS_COLORS = {
    ordered: { bg: 'var(--warning-light)', color: 'var(--warning)' },
    shipped: { bg: 'var(--accent-light)', color: 'var(--accent)' },
    delivered: { bg: 'var(--success-light)', color: 'var(--success)' },
    cancelled: { bg: 'var(--danger-light)', color: 'var(--danger)' },
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>📈 Reports</h1></div>
        <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
          <select className="form-control" style={{ width: 'auto' }} value={year} onChange={e => setYear(parseInt(e.target.value))}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="form-control" style={{ width: 'auto' }} value={quarter} onChange={e => setQuarter(e.target.value)}>
            <option value="">Full year</option>
            <option value="1">Q1 (Jan–Mar)</option>
            <option value="2">Q2 (Apr–Jun)</option>
            <option value="3">Q3 (Jul–Sep)</option>
            <option value="4">Q4 (Oct–Dec)</option>
          </select>
          <button className="btn btn-primary" onClick={downloadXLS} disabled={downloading}>
            {downloading ? (
              <span className="flex" style={{ gap: 8 }}>
                <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                Generating…
              </span>
            ) : '⬇️ Export .xlsx'}
          </button>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>

      <div className="tabs">
        {[['summary','📊 Tax Summary'],['orders','📦 Parts Orders'],['monthly','📅 Monthly']].map(([id,label]) => (
          <button key={id} className={`tab ${tab===id?'active':''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'summary' && (
        <div>
          <div style={{ background: 'var(--accent-light)', border: '1px solid var(--accent)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--accent)' }}>
            💡 <strong>For tax purposes:</strong> Export the .xlsx to share with your accountant. The Summary sheet has all totals. Individual sheets have itemized records.
          </div>
          <TaxSummary summary={summary} loading={summaryLoading} />
          {summary && (
            <div className="grid-3">
              <div className="stat-card">
                <div className="stat-label">Invoices issued</div>
                <div className="stat-value" style={{ fontSize: 22 }}>{summary.revenue?.invoice_count || 0}</div>
                <div className="stat-sub">paid</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Parts orders</div>
                <div className="stat-value" style={{ fontSize: 22 }}>{summary.parts_costs?.order_count || 0}</div>
                <div className="stat-sub">logged</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Tools purchased</div>
                <div className="stat-value" style={{ fontSize: 22 }}>{summary.tools_costs?.purchase_count || 0}</div>
                <div className="stat-sub">items</div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'orders' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>{orders.length} orders in {year} · Total: <strong>${orders.reduce((s,o)=>s+(o.total_cost||0),0).toFixed(2)}</strong></div>
            <button className="btn btn-primary" onClick={() => { setEditing(null); setModal(true); }}>+ Log parts order</button>
          </div>
          {ordersLoading ? <Spinner /> : orders.length === 0 ? (
            <div className="card">
              <EmptyState icon="📦" title="No parts orders logged" body="Track every parts purchase here — supplier, invoice number, website, and what you ordered." action={<button className="btn btn-primary" onClick={() => setModal(true)}>Log first order</button>} />
            </div>
          ) : (
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Supplier</th><th>Invoice #</th><th>Parts</th><th>Total</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {orders.map(order => {
                      const sc = STATUS_COLORS[order.status] || STATUS_COLORS.ordered;
                      return (
                        <tr key={order.id}>
                          <td style={{ fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{format(new Date(order.order_date), 'MMM d, yyyy')}</td>
                          <td>
                            <div style={{ fontWeight: 500 }}>{order.supplier_name}</div>
                            {order.supplier_website && <a href={order.supplier_website} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--accent)' }} onClick={e => e.stopPropagation()}>{order.supplier_website.replace(/^https?:\/\//, '').split('/')[0]}</a>}
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text2)' }}>{order.order_invoice_number || '—'}</td>
                          <td style={{ fontSize: 12, color: 'var(--text3)' }}>{order.item_count} item{order.item_count!==1?'s':''}</td>
                          <td style={{ fontWeight: 700, color: 'var(--danger)' }}>${(order.total_cost||0).toFixed(2)}</td>
                          <td><span className="badge" style={{ background: sc.bg, color: sc.color }}>{order.status}</span></td>
                          <td>
                            <div className="flex">
                              <button className="btn btn-sm btn-icon" onClick={() => { setEditing(order); setModal(true); }}>
                                <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" strokeWidth="2" strokeLinecap="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" strokeWidth="2" strokeLinecap="round"/></svg>
                              </button>
                              <button className="btn btn-sm btn-icon btn-danger" onClick={() => setConfirm(order.id)}>
                                <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" strokeWidth="2" strokeLinecap="round"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" strokeWidth="2" strokeLinecap="round"/></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'monthly' && (
        <div>
          <MonthlyBreakdown summary={summary} />
          {summaryLoading && <Spinner />}
        </div>
      )}

      <Modal open={modal} onClose={() => { setModal(false); setEditing(null); }} title={editing ? 'Edit parts order' : 'Log parts order'} large>
        <OrderForm initial={editing} inventory={inventory} onSave={() => { setModal(false); setEditing(null); loadOrders(); loadSummary(); }} onClose={() => { setModal(false); setEditing(null); }} />
      </Modal>
      <ConfirmDialog open={!!confirm} message="Delete this parts order?" onConfirm={async () => { await axios.delete(`/api/reports/parts-orders/${confirm}`); setConfirm(null); loadOrders(); loadSummary(); }} onCancel={() => setConfirm(null)} />
    </div>
  );
}
