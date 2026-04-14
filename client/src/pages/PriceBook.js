import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Modal, SearchBar, Spinner, EmptyState, ConfirmDialog } from '../components/Shared';

const CATEGORIES = ['Labor','Screen','Battery','Storage','RAM','Motherboard','Power','Keyboard','Cooling','Network','Cable','Service','Part','Other'];
const UNITS = ['ea','hr','flat','pair','set'];

function PriceBookForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || { name:'', category:'Labor', manufacturer:'', device_type:'', description:'', cost_price:'', sell_price:'', unit:'ea' });
  const [manufacturers, setManufacturers] = useState([]);
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  useEffect(() => { axios.get('/api/manufacturers').then(r => setManufacturers(r.data)).catch(()=>{}); }, []);
  const margin = form.sell_price && form.cost_price ? (((form.sell_price - form.cost_price) / form.sell_price) * 100).toFixed(0) : null;
  const submit = async e => {
    e.preventDefault(); setSaving(true);
    try {
      if (initial?.id) await axios.put(`/api/pricebook/${initial.id}`, form);
      else await axios.post('/api/pricebook', form);
      onSave();
    } catch(err) { alert(err.response?.data?.error || 'Error'); }
    setSaving(false);
  };
  return (
    <form onSubmit={submit}>
      <div className="grid-2">
        <div className="form-group"><label>Name *</label><input className="form-control" value={form.name} onChange={set('name')} required autoFocus /></div>
        <div className="form-group"><label>Category</label><select className="form-control" value={form.category} onChange={set('category')}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></div>
        <div className="form-group"><label>Manufacturer</label><select className="form-control" value={form.manufacturer} onChange={set('manufacturer')}><option value="">— Any —</option>{manufacturers.map(m=><option key={m.id} value={m.name}>{m.logo_emoji} {m.name}</option>)}</select></div>
        <div className="form-group"><label>Device type</label><input className="form-control" value={form.device_type} onChange={set('device_type')} placeholder="e.g. Phone, Laptop" /></div>
        <div className="form-group"><label>Cost price ($)</label><input className="form-control" type="number" step="0.01" min="0" value={form.cost_price} onChange={set('cost_price')} /></div>
        <div className="form-group">
          <label>Sell price ($) {margin !== null && <span style={{ marginLeft:8, fontSize:11, color: Number(margin)>0?'var(--success)':'var(--danger)', fontWeight:600 }}>{margin}% margin</span>}</label>
          <input className="form-control" type="number" step="0.01" min="0" value={form.sell_price} onChange={set('sell_price')} />
        </div>
        <div className="form-group"><label>Unit</label><select className="form-control" value={form.unit} onChange={set('unit')}>{UNITS.map(u=><option key={u}>{u}</option>)}</select></div>
      </div>
      <div className="form-group"><label>Description</label><textarea className="form-control" value={form.description} onChange={set('description')} rows={2} /></div>
      <div className="modal-footer">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : initial?.id ? 'Save changes' : 'Add to price book'}</button>
      </div>
    </form>
  );
}

export default function PriceBook() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (filterCat) params.set('category', filterCat);
    const r = await axios.get(`/api/pricebook?${params}`);
    setItems(r.data); setLoading(false);
  }, [q, filterCat]);

  useEffect(() => { load(); }, [load]);

  const grouped = items.reduce((acc, item) => { if (!acc[item.category]) acc[item.category] = []; acc[item.category].push(item); return acc; }, {});

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>📒 Price Book</h1><p style={{ fontSize:13, color:'var(--text2)' }}>Standard labor and parts pricing — used when creating invoices</p></div>
        <div className="flex" style={{ gap:8 }}>
          <SearchBar value={q} onChange={setQ} placeholder="Search items…" />
          <select className="form-control" style={{ width:'auto' }} value={filterCat} onChange={e => setFilterCat(e.target.value)}><option value="">All categories</option>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setModal(true); }}>+ Add item</button>
        </div>
      </div>
      {loading ? <Spinner /> : items.length === 0 ? (
        <div className="card"><EmptyState icon="📒" title="Price book is empty" body="Add standard labor rates and parts prices here." action={<button className="btn btn-primary" onClick={() => setModal(true)}>Add first item</button>} /></div>
      ) : Object.entries(grouped).map(([category, catItems]) => (
        <div key={category} className="card" style={{ marginBottom:16 }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:12, paddingBottom:8, borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between' }}>
            <span>{category}</span>
            <span style={{ fontSize:11, color:'var(--text3)', fontWeight:400 }}>{catItems.length} item{catItems.length!==1?'s':''}</span>
          </div>
          <div className="table-wrap"><table>
            <thead><tr><th>Name</th><th>Manufacturer</th><th>Sell Price</th><th>Unit</th><th>Margin</th><th></th></tr></thead>
            <tbody>{catItems.map(item => {
              const margin = item.sell_price > 0 && item.cost_price > 0 ? (((item.sell_price - item.cost_price) / item.sell_price) * 100).toFixed(0) : null;
              return (
                <tr key={item.id}>
                  <td style={{ fontWeight:500 }}>{item.name}{item.description && <div style={{ fontSize:11, color:'var(--text3)' }}>{item.description}</div>}</td>
                  <td style={{ fontSize:12, color:'var(--text2)' }}>{item.manufacturer || '—'}</td>
                  <td style={{ fontWeight:600, color:'var(--success)' }}>${item.sell_price.toFixed(2)}</td>
                  <td style={{ fontSize:12, color:'var(--text3)' }}>/{item.unit}</td>
                  <td>{margin !== null && <span style={{ fontSize:11, color: Number(margin)>40?'var(--success)':Number(margin)>20?'var(--warning)':'var(--danger)', fontWeight:600 }}>{margin}%</span>}</td>
                  <td><div className="flex">
                    <button className="btn btn-sm btn-icon" onClick={() => { setEditing(item); setModal(true); }}>✏️</button>
                    <button className="btn btn-sm btn-icon btn-danger" onClick={() => setConfirm(item.id)}>🗑️</button>
                  </div></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </div>
      ))}
      <Modal open={modal} onClose={() => { setModal(false); setEditing(null); }} title={editing ? 'Edit item' : 'Add to price book'} large>
        <PriceBookForm initial={editing} onSave={() => { setModal(false); setEditing(null); load(); }} onClose={() => { setModal(false); setEditing(null); }} />
      </Modal>
      <ConfirmDialog open={!!confirm} message="Remove this item?" onConfirm={async () => { await axios.delete(`/api/pricebook/${confirm}`); setConfirm(null); load(); }} onCancel={() => setConfirm(null)} />
    </div>
  );
}
