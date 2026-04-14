import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import PhotoDocs from '../components/PhotoDocs';
import { RepairDiagnosis, NoteFormatter, CustomerMessage } from '../components/AIAssistant';
import { Modal, StatusBadge, SearchBar, Spinner, EmptyState, ConfirmDialog, REPAIR_STATUSES, STATUS_LABELS } from '../components/Shared';
import { format } from 'date-fns';

const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const DEVICE_TYPES = ['Desktop', 'Laptop', 'Phone', 'Tablet', 'Server', 'Printer', 'Network Device', 'Other'];

function RepairForm({ initial, customers, onSave, onClose }) {
  const [priceBook, setPriceBook] = React.useState([]);
  const [showPriceBook, setShowPriceBook] = React.useState(false);

  React.useEffect(() => {
    axios.get('/api/pricebook').then(r => setPriceBook(r.data)).catch(() => {});
  }, []);
  const [form, setForm] = useState(initial || {
    customer_id: customers?.[0]?.id || '', title: '', description: '', status: 'intake', priority: 'normal',
    device_type: '', device_brand: '', device_model: '', serial_number: '', password: '',
    repair_notes: '', parts_used: [], labor_cost: '', parts_cost: '', warranty_months: '0',
    os_name: '', os_version: '', custom_created_at: ''
  });
  const [saving, setSaving] = useState(false);
  const [newPart, setNewPart] = useState({ name: '', qty: 1, cost: '' });

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const addPart = () => {
    if (!newPart.name) return;
    setForm(f => ({ ...f, parts_used: [...(f.parts_used || []), { ...newPart }] }));
    setNewPart({ name: '', qty: 1, cost: '' });
  };

  const removePart = i => setForm(f => ({ ...f, parts_used: f.parts_used.filter((_, idx) => idx !== i) }));

  const submit = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, labor_cost: parseFloat(form.labor_cost) || 0, parts_cost: parseFloat(form.parts_cost) || 0, warranty_months: parseInt(form.warranty_months) || 0 };
      if (initial?.id) await axios.put(`/api/repairs/${initial.id}`, payload);
      else await axios.post('/api/repairs', payload);
      onSave();
    } catch (err) { alert(err.response?.data?.error || 'Error saving repair'); }
    setSaving(false);
  };

  return (
    <form onSubmit={submit}>
      <div className="grid-2">
        <div className="form-group">
          <label>Customer <span style={{color:'var(--danger)'}}>*</span></label>
          <select className="form-control" value={form.customer_id} onChange={set('customer_id')} required>
            <option value="">Select customer…</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Title <span style={{color:'var(--danger)'}}>*</span></label>
          <input className="form-control" value={form.title} onChange={set('title')} placeholder="e.g. Screen replacement" required />
        </div>
      </div>

      <div className="grid-2">
        <div className="form-group">
          <label>Status</label>
          <select className="form-control" value={form.status} onChange={set('status')}>
            {REPAIR_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Priority</label>
          <select className="form-control" value={form.priority} onChange={set('priority')}>
            {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>
        </div>
      </div>

      <div style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', marginBottom: 10, marginTop: 4 }}>Device Info</div>
      <div className="grid-2">
        <div className="form-group">
          <label>Device Type</label>
          <select className="form-control" value={form.device_type} onChange={set('device_type')}>
            <option value="">Select…</option>
            {DEVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Brand</label><input className="form-control" value={form.device_brand} onChange={set('device_brand')} placeholder="Dell, Apple, HP…" /></div>
        <div className="form-group"><label>Model</label><input className="form-control" value={form.device_model} onChange={set('device_model')} /></div>
        <div className="form-group"><label>Serial #</label><input className="form-control" value={form.serial_number} onChange={set('serial_number')} /></div>
      </div>
      <div className="form-group"><label>Device password / PIN</label><input className="form-control" value={form.password} onChange={set('password')} placeholder="Customer-provided password" /></div>

      {/* OS info - shown for PC/Laptop/Desktop */}
      {(form.device_type === 'Laptop' || form.device_type === 'Desktop' || form.device_type === 'Server') && (
        <div>
          <div style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', marginBottom: 10, marginTop: 4 }}>Operating System</div>
          <div className="grid-2">
            <div className="form-group">
              <label>OS</label>
              <select className="form-control" value={form.os_name} onChange={set('os_name')}>
                <option value="">— Select —</option>
                {['Windows','macOS','Linux','ChromeOS','Other'].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Version / Build</label><input className="form-control" value={form.os_version} onChange={set('os_version')} placeholder="e.g. Windows 11 23H2, macOS 14 Sonoma" /></div>
          </div>
        </div>
      )}

      {/* Historical data — custom intake date */}
      <div style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', marginBottom: 10, marginTop: 4 }}>Date (optional — for historical records)</div>
      <div className="form-group">
        <label>Custom intake date</label>
        <input className="form-control" type="datetime-local" value={form.custom_created_at} onChange={set('custom_created_at')} />
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>Leave blank to use today. Set this for entering historical repair records.</div>
      </div>

      <div style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', marginBottom: 10, marginTop: 4 }}>Repair Notes</div>
      <div className="form-group"><label>Description / problem</label><textarea className="form-control" value={form.description} onChange={set('description')} /></div>
      <div className="form-group"><label>Technician notes</label><textarea className="form-control" value={form.repair_notes} onChange={set('repair_notes')} /></div>

      <div style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', marginBottom: 10, marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Parts used</span>
        <button type="button" className="btn btn-sm" style={{ fontSize: 11 }} onClick={() => setShowPriceBook(s => !s)}>📋 Price book</button>
      </div>
      {showPriceBook && (
        <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 12px', marginBottom: 10, maxHeight: 200, overflowY: 'auto' }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>Click to add from price book:</div>
          {priceBook.map(item => (
            <div key={item.id} onClick={() => {
              setForm(f => ({ ...f, parts_used: [...(f.parts_used||[]), { name: item.name, qty: 1, cost: item.sell_price }] }));
              setShowPriceBook(false);
            }} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', borderRadius: 6, cursor: 'pointer', marginBottom: 2 }}
              onMouseEnter={e => e.currentTarget.style.background='var(--bg2)'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
              <span style={{ fontSize: 12 }}>{item.name}</span>
              <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>${item.sell_price}</span>
            </div>
          ))}
        </div>
      )}
      {(form.parts_used || []).map((p, i) => (
        <div key={i} className="flex" style={{ marginBottom: 6, background: 'var(--bg3)', padding: '6px 10px', borderRadius: 6 }}>
          <span style={{ flex: 1, fontSize: 13 }}>{p.name} × {p.qty}{p.cost ? ` — $${p.cost}` : ''}</span>
          <button type="button" className="btn btn-sm btn-danger" onClick={() => removePart(i)}>Remove</button>
        </div>
      ))}
      <div className="flex" style={{ marginBottom: 16 }}>
        <input className="form-control" style={{ flex: 2 }} value={newPart.name} onChange={e => setNewPart(p => ({ ...p, name: e.target.value }))} placeholder="Part name" />
        <input className="form-control" style={{ width: 60 }} type="number" min="1" value={newPart.qty} onChange={e => setNewPart(p => ({ ...p, qty: e.target.value }))} placeholder="Qty" />
        <input className="form-control" style={{ width: 80 }} type="number" step="0.01" value={newPart.cost} onChange={e => setNewPart(p => ({ ...p, cost: e.target.value }))} placeholder="Cost $" />
        <button type="button" className="btn" onClick={addPart}>Add</button>
      </div>

      <div style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', marginBottom: 10 }}>Pricing &amp; Warranty</div>
      <div className="grid-2">
        <div className="form-group"><label>Labor cost ($)</label><input className="form-control" type="number" step="0.01" value={form.labor_cost} onChange={set('labor_cost')} /></div>
        <div className="form-group"><label>Parts cost ($)</label><input className="form-control" type="number" step="0.01" value={form.parts_cost} onChange={set('parts_cost')} /></div>
        <div className="form-group">
          <label>Warranty (months)</label>
          <select className="form-control" value={form.warranty_months} onChange={set('warranty_months')}>
            {[0,1,3,6,12,24].map(m => <option key={m} value={m}>{m === 0 ? 'No warranty' : `${m} month${m>1?'s':''}`}</option>)}
          </select>
        </div>
      </div>

      <div className="modal-footer">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : initial?.id ? 'Save changes' : 'Create repair'}</button>
      </div>
    </form>
  );
}

function ReminderForm({ repairId, customerId, onSave, onClose }) {
  const [form, setForm] = useState({ days_from_now: 2, message: '', type: 'followup' });
  const [saving, setSaving] = useState(false);
  const submit = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post('/api/reminders', { ...form, repair_id: repairId, customer_id: customerId });
      onSave();
    } catch { alert('Error saving reminder'); }
    setSaving(false);
  };
  return (
    <form onSubmit={submit}>
      <div className="form-group">
        <label>Remind me in</label>
        <select className="form-control" value={form.days_from_now} onChange={e => setForm(f => ({ ...f, days_from_now: e.target.value }))}>
          {[1,2,3,4,5,6,7,10,14].map(d => <option key={d} value={d}>{d} day{d>1?'s':''}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label>Type</label>
        <select className="form-control" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
          <option value="followup">Follow-up call</option>
          <option value="parts">Parts arrived</option>
          <option value="pickup">Ready for pickup</option>
          <option value="warranty">Warranty check</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="form-group"><label>Message (optional)</label><textarea className="form-control" value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="Remind me to…" /></div>
      <div className="modal-footer">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Set reminder'}</button>
      </div>
    </form>
  );
}

function RepairDetail({ repairId, onEdit, onNavigate }) {
  const [repair, setRepair] = useState(null);
  const [reminderModal, setReminderModal] = useState(false);
  const [aiTab, setAiTab] = useState(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  useEffect(() => { axios.get(`/api/repairs/${repairId}`).then(r => setRepair(r.data)); }, [repairId]);

  const createInvoice = async () => {
    setInvoiceLoading(true);
    try {
      const items = [];
      if (repair.labor_cost > 0) items.push({ description: 'Labor', qty: 1, unit_price: repair.labor_cost });
      if (repair.parts_cost > 0) items.push({ description: 'Parts', qty: 1, unit_price: repair.parts_cost });
      (repair.parts_used || []).forEach(p => { if (p.cost) items.push({ description: p.name, qty: p.qty || 1, unit_price: parseFloat(p.cost) || 0 }); });
      const r = await axios.post('/api/invoices', { repair_id: repair.id, customer_id: repair.customer_id, line_items: items });
      onNavigate('invoices', { invoiceId: r.data.id });
    } catch { alert('Error creating invoice'); }
    setInvoiceLoading(false);
  };

  if (!repair) return <Spinner />;
  const warrantyOk = repair.warranty_expires && new Date(repair.warranty_expires) > new Date();

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 20 }}>
        <div>
          <div className="flex" style={{ marginBottom: 6 }}>
            <StatusBadge status={repair.status} />
            {repair.priority !== 'normal' && <span className={`badge`} style={{ background: repair.priority === 'urgent' ? 'var(--danger-light)' : 'var(--warning-light)', color: repair.priority === 'urgent' ? 'var(--danger)' : 'var(--warning)' }}>{repair.priority}</span>}
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>{repair.title}</h2>
          <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>
            <span style={{ cursor: 'pointer', color: 'var(--accent)' }} onClick={() => onNavigate('customers', { customerId: repair.customer_id })}>{repair.customer_name}</span>
            {repair.customer_phone && <span style={{ marginLeft: 12 }}>📞 {repair.customer_phone}</span>}
          </div>
        </div>
        <div className="flex" style={{ flexWrap: 'wrap', gap: 6 }}>
          <button className="btn btn-sm" onClick={() => setReminderModal(true)}>⏰ Reminder</button>
          <button className="btn btn-sm" style={{ background: aiTab ? 'var(--purple-light)' : undefined, color: aiTab ? 'var(--purple)' : undefined, borderColor: aiTab ? 'var(--purple)' : undefined }} onClick={() => setAiTab(a => a ? null : 'diagnose')}>🤖 AI</button>
          <button className="btn btn-sm" onClick={() => window.open(`/api/repairs/${repair.id}/intake-pdf`, '_blank')}>🖨️ Intake form</button>
          <button className="btn btn-sm" onClick={() => onNavigate('scanner')}>🏷️ Label</button>
          <button className="btn btn-sm" onClick={async () => {
            const r = await axios.post('/api/estimates', { customer_id: repair.customer_id, repair_id: repair.id, line_items: [], notes: '' });
            onNavigate('estimates');
          }}>📋 Estimate</button>
          <button className="btn btn-sm btn-primary" onClick={createInvoice} disabled={invoiceLoading}>{invoiceLoading ? '…' : '🧾 Invoice'}</button>
          <button className="btn btn-sm" onClick={() => onEdit(repair)}>Edit</button>
        </div>
      </div>

      {/* Quick status changer */}
      <div className="card" style={{ marginBottom: 16, padding: '14px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)', marginBottom: 10 }}>Change status</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {REPAIR_STATUSES.map(s => {
            const isActive = repair.status === s;
            const colors = { intake: 'var(--text3)', diagnosing: 'var(--accent)', waiting_parts: 'var(--warning)', in_repair: 'var(--purple)', ready: 'var(--success)', completed: 'var(--success)', cancelled: 'var(--danger)' };
            const bgColors = { intake: 'var(--bg3)', diagnosing: 'var(--accent-light)', waiting_parts: 'var(--warning-light)', in_repair: 'var(--purple-light)', ready: 'var(--success-light)', completed: 'var(--success-light)', cancelled: 'var(--danger-light)' };
            return (
              <button key={s} onClick={async () => {
                if (isActive) return;
                await axios.patch(`/api/repairs/${repair.id}/status`, { status: s });
                setRepair(r => ({ ...r, status: s }));
              }} style={{
                padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: isActive ? 'default' : 'pointer',
                border: `2px solid ${isActive ? colors[s] || 'var(--accent)' : 'var(--border)'}`,
                background: isActive ? bgColors[s] || 'var(--bg3)' : 'var(--bg2)',
                color: isActive ? colors[s] || 'var(--accent)' : 'var(--text3)',
                transform: isActive ? 'none' : undefined,
              }}>{STATUS_LABELS[s] || s}{isActive && ' ✓'}</button>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>Click any status to update instantly. All staff can change status.</div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card card-sm">
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', marginBottom: 10 }}>Device</div>
          {[['Type', repair.device_type], ['Brand', repair.device_brand], ['Model', repair.device_model], ['Serial #', repair.serial_number], ['Password', repair.password]].map(([l, v]) => v ? (
            <div key={l} className="flex-between" style={{ marginBottom: 6 }}>
              <span style={{ color: 'var(--text3)', fontSize: 12 }}>{l}</span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{v}</span>
            </div>
          ) : null)}
        </div>
        <div className="card card-sm">
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', marginBottom: 10 }}>Pricing</div>
          {[['Labor', `$${repair.labor_cost?.toFixed(2)||'0.00'}`], ['Parts', `$${repair.parts_cost?.toFixed(2)||'0.00'}`], ['Total', `$${((repair.labor_cost||0)+(repair.parts_cost||0)).toFixed(2)}`]].map(([l, v]) => (
            <div key={l} className="flex-between" style={{ marginBottom: 6 }}>
              <span style={{ color: 'var(--text3)', fontSize: 12 }}>{l}</span>
              <span style={{ fontSize: 13, fontWeight: l === 'Total' ? 700 : 400 }}>{v}</span>
            </div>
          ))}
          <hr className="divider" />
          <div className="flex-between">
            <span style={{ color: 'var(--text3)', fontSize: 12 }}>Warranty</span>
            <span style={{ fontSize: 12, color: repair.warranty_expires ? (warrantyOk ? 'var(--success)' : 'var(--danger)') : 'var(--text3)' }}>
              {repair.warranty_expires ? `${warrantyOk ? 'Valid until' : 'Expired'} ${format(new Date(repair.warranty_expires), 'MMM d, yyyy')}` : 'No warranty'}
            </span>
          </div>
        </div>
      </div>

      {repair.description && <div className="card card-sm" style={{ marginBottom: 10 }}><div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 }}>Problem Description</div><div style={{ fontSize: 13, lineHeight: 1.6 }}>{repair.description}</div></div>}
      {repair.repair_notes && <div className="card card-sm" style={{ marginBottom: 10 }}><div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 }}>Technician Notes</div><div style={{ fontSize: 13, lineHeight: 1.6 }}>{repair.repair_notes}</div></div>}

      <PhotoDocs repairId={repair.id} />

      {aiTab && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            {[['diagnose','🔧 Diagnose'],['notes','📝 Format notes'],['message','📞 Message']].map(([t,l]) => (
              <button key={t} className="btn btn-sm"
                style={{ background: aiTab === t ? 'var(--purple-light)' : undefined, color: aiTab === t ? 'var(--purple)' : undefined, borderColor: aiTab === t ? 'var(--purple)' : undefined }}
                onClick={() => setAiTab(t)}>{l}</button>
            ))}
          </div>
          {aiTab === 'diagnose' && <RepairDiagnosis repair={repair} onUseNotes={text => { setEditing(r => ({ ...r, repair_notes: text })); setAiTab(null); }} />}
          {aiTab === 'notes' && <NoteFormatter repair={repair} onUseNotes={text => { alert('Notes copied — paste into the repair notes field when editing.'); navigator.clipboard.writeText(text); }} />}
          {aiTab === 'message' && <CustomerMessage repairId={repair.id} />}
        </div>
      )}

      {repair.parts_used?.length > 0 && (
        <div className="card card-sm" style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>Parts Used</div>
          {repair.parts_used.map((p, i) => (
            <div key={i} className="flex-between" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 13 }}>{p.name}</span>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>× {p.qty}{p.cost ? ` — $${p.cost}` : ''}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 12 }}>
        Created: {format(new Date(repair.created_at), 'MMM d, yyyy h:mm a')}
        {repair.completed_date && <span style={{ marginLeft: 16 }}>Completed: {format(new Date(repair.completed_date), 'MMM d, yyyy')}</span>}
      </div>

      <Modal open={reminderModal} onClose={() => setReminderModal(false)} title="Set reminder">
        <ReminderForm repairId={repair.id} customerId={repair.customer_id} onSave={() => setReminderModal(false)} onClose={() => setReminderModal(false)} />
      </Modal>
    </div>
  );
}

export default function Repairs({ initialState, onNavigate }) {
  const [repairs, setRepairs] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filterStatus, setFilterStatus] = useState(initialState?.filterStatus || '');
  const [modal, setModal] = useState(initialState?.newRepair || false);
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(initialState?.repairId || null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterStatus) params.set('status', filterStatus);
    if (q) params.set('q', q);
    const [rep, cust] = await Promise.all([axios.get(`/api/repairs?${params}`), axios.get('/api/customers')]);
    setRepairs(rep.data);
    setCustomers(cust.data);
    setLoading(false);
  }, [filterStatus, q]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (initialState?.repairId) setSelected(initialState.repairId); if (initialState?.filterStatus) setFilterStatus(initialState.filterStatus); }, [initialState]);

  const openNew = () => {
    const c = initialState?.customer;
    setEditing(c ? { customer_id: c.id } : null);
    setModal(true);
  };

  if (selected) {
    return (
      <div className="page">
        <button className="btn btn-sm" style={{ marginBottom: 16 }} onClick={() => setSelected(null)}>← Back to repairs</button>
        <RepairDetail repairId={selected} onEdit={r => { setEditing(r); setModal(true); }} onNavigate={onNavigate} />
        <Modal open={modal} onClose={() => setModal(false)} title="Edit repair" large>
          <RepairForm initial={editing} customers={customers} onSave={() => { setModal(false); axios.get(`/api/repairs/${selected}`).then(r => setEditing(r.data)); }} onClose={() => setModal(false)} />
        </Modal>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>Repairs</h1><p>{repairs.length} showing</p></div>
        <div className="flex" style={{ flexWrap: 'wrap', gap: 8 }}>
          <SearchBar value={q} onChange={setQ} placeholder="Search repairs…" />
          <select className="form-control" style={{ width: 'auto' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All statuses</option>
            {REPAIR_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          <button className="btn btn-primary" onClick={openNew}>+ New Repair</button>
        </div>
      </div>

      <div className="card">
        {loading ? <Spinner /> : repairs.length === 0 ? (
          <EmptyState icon="🔧" title="No repairs found" body="Create your first repair ticket." action={<button className="btn btn-primary" onClick={openNew}>New Repair</button>} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Customer</th><th>Device</th><th>Title</th><th>Priority</th><th>Status</th><th>Date</th><th></th></tr></thead>
              <tbody>
                {repairs.map(r => (
                  <tr key={r.id} className="clickable-row" onClick={() => setSelected(r.id)}>
                    <td style={{ fontWeight: 500 }}>{r.customer_name}</td>
                    <td style={{ color: 'var(--text2)', fontSize: 12 }}>{[r.device_brand, r.device_model].filter(Boolean).join(' ') || '—'}</td>
                    <td>{r.title}</td>
                    <td><span style={{ fontSize: 11, color: r.priority === 'urgent' ? 'var(--danger)' : r.priority === 'high' ? 'var(--warning)' : 'var(--text3)' }}>{r.priority}</span></td>
                    <td><StatusBadge status={r.status} /></td>
                    <td style={{ color: 'var(--text3)', fontSize: 12 }}>{format(new Date(r.created_at), 'MMM d')}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="flex">
                        <select className="form-control" style={{ width: 'auto', fontSize: 11, padding: '3px 6px', height: 'auto' }}
                          value={r.status}
                          onChange={async e => {
                            await axios.patch(`/api/repairs/${r.id}/status`, { status: e.target.value });
                            setRepairs(prev => prev.map(x => x.id === r.id ? { ...x, status: e.target.value } : x));
                            axios.post('/api/workflows/trigger', { repair_id: r.id, status: e.target.value }).catch(() => {});
                          }}
                          onClick={e => e.stopPropagation()}>
                          {REPAIR_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                        </select>
                        <button className="btn btn-sm btn-icon btn-danger" onClick={() => setConfirm(r.id)}><svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" strokeWidth="2" strokeLinecap="round"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" strokeWidth="2" strokeLinecap="round"/></svg></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modal} onClose={() => { setModal(false); setEditing(null); }} title="New repair" large>
        <RepairForm initial={editing} customers={customers} onSave={() => { setModal(false); setEditing(null); load(); }} onClose={() => { setModal(false); setEditing(null); }} />
      </Modal>
      <ConfirmDialog open={!!confirm} message="Delete this repair?" onConfirm={async () => { await axios.delete(`/api/repairs/${confirm}`); setConfirm(null); load(); }} onCancel={() => setConfirm(null)} />
    </div>
  );
}
