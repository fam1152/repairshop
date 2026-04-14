import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ReorderSuggestions } from '../components/AIAssistant';
import { Modal, SearchBar, Spinner, EmptyState, ConfirmDialog } from '../components/Shared';
import { format } from 'date-fns';

const CATEGORIES = ['General','CPU','RAM','Storage','Display','Battery','Keyboard','Motherboard','Power Supply','Cable','Adapter','Cooling','Network','Tool','Other'];
const DEVICE_TYPES = ['Phone','Laptop','Desktop','Tablet','Printer','Server','Network Device','Monitor','Other'];
const MANUFACTURERS = ['Apple','Samsung','LG','Motorola','TCL','Sony','Google','OnePlus','Xiaomi','Huawei','Nokia','HTC','ASUS','Lenovo','Dell','HP','Acer','MSI','Toshiba','Panasonic','Sharp','Philips','Generic','Other'];
const MFR_LOGOS = { Apple:'🍎', Samsung:'🌀', LG:'🔵', Motorola:'〽️', TCL:'📺', Sony:'🎮', Google:'🔍', OnePlus:'1️⃣', Dell:'💻', HP:'🖨️', ASUS:'⚡', Lenovo:'💼', Acer:'🅰️', Generic:'📦' };

function StockBadge({ quantity, min }) {
  if (quantity === 0) return <span className="badge" style={{ background:'var(--danger-light)', color:'var(--danger)' }}>Out of stock</span>;
  if (quantity <= min) return <span className="badge" style={{ background:'var(--warning-light)', color:'var(--warning)' }}>Low stock</span>;
  return <span className="badge" style={{ background:'var(--success-light)', color:'var(--success)' }}>In stock</span>;
}

function ManufacturerCard({ manufacturer, count, isActive, onClick }) {
  const logo = MFR_LOGOS[manufacturer] || '📦';
  return (
    <button onClick={onClick} style={{
      display:'flex', flexDirection:'column', alignItems:'center', gap:4,
      padding:'12px 10px', borderRadius:10, cursor:'pointer', minWidth:80,
      border:`2px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
      background: isActive ? 'var(--accent-light)' : 'var(--bg2)',
      transition:'all .15s',
    }}>
      <span style={{ fontSize:22 }}>{logo}</span>
      <span style={{ fontSize:11, fontWeight:700, color: isActive ? 'var(--accent)' : 'var(--text)', textAlign:'center', lineHeight:1.2 }}>{manufacturer}</span>
      <span style={{ fontSize:10, color:'var(--text3)' }}>{count} item{count!==1?'s':''}</span>
    </button>
  );
}

function ItemForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || { sku:'', name:'', description:'', category:'General', manufacturer:'', device_type:'', quantity:0, quantity_min:1, unit_cost:'', sell_price:'', supplier:'', location:'', notes:'' });
  const [saving, setSaving] = useState(false);
  const [customMfr, setCustomMfr] = useState(!MANUFACTURERS.includes(initial?.manufacturer||'') && !!initial?.manufacturer);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async e => {
    e.preventDefault(); setSaving(true);
    try {
      if (initial?.id) await axios.put(`/api/inventory/${initial.id}`, form);
      else await axios.post('/api/inventory', form);
      onSave();
    } catch (err) { alert(err.response?.data?.error || 'Error saving item'); }
    setSaving(false);
  };

  return (
    <form onSubmit={submit}>
      <div className="grid-2">
        <div className="form-group"><label>Name *</label><input className="form-control" value={form.name} onChange={set('name')} required autoFocus /></div>
        <div className="form-group"><label>SKU / Part #</label><input className="form-control" value={form.sku} onChange={set('sku')} placeholder="e.g. BATT-IP13-001" /></div>
      </div>
      <div style={{ fontWeight:600, fontSize:12, textTransform:'uppercase', letterSpacing:'.05em', color:'var(--text3)', marginBottom:10 }}>Manufacturer & Device</div>
      <div className="grid-2">
        <div className="form-group">
          <label>Manufacturer</label>
          {!customMfr ? (
            <select className="form-control" value={form.manufacturer} onChange={e => {
              if (e.target.value === '__custom__') { setCustomMfr(true); setForm(f => ({ ...f, manufacturer:'' })); }
              else set('manufacturer')(e);
            }}>
              <option value="">— None —</option>
              {MANUFACTURERS.map(m => <option key={m} value={m}>{m}</option>)}
              <option value="__custom__">+ Type custom…</option>
            </select>
          ) : (
            <div className="flex" style={{ gap:6 }}>
              <input className="form-control" value={form.manufacturer} onChange={set('manufacturer')} placeholder="e.g. Razer" autoFocus />
              <button type="button" className="btn btn-sm" onClick={() => { setCustomMfr(false); setForm(f => ({ ...f, manufacturer:'' })); }}>✕</button>
            </div>
          )}
        </div>
        <div className="form-group">
          <label>Device type</label>
          <select className="form-control" value={form.device_type} onChange={set('device_type')}>
            <option value="">— None —</option>
            {DEVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div className="grid-2">
        <div className="form-group"><label>Category</label><select className="form-control" value={form.category} onChange={set('category')}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
        <div className="form-group"><label>Supplier</label><input className="form-control" value={form.supplier} onChange={set('supplier')} /></div>
      </div>
      <div className="form-group"><label>Description</label><textarea className="form-control" value={form.description} onChange={set('description')} rows={2} /></div>
      <div style={{ fontWeight:600, fontSize:12, textTransform:'uppercase', letterSpacing:'.05em', color:'var(--text3)', margin:'4px 0 10px' }}>Stock & Pricing</div>
      <div className="grid-2">
        {!initial?.id && <div className="form-group"><label>Initial quantity</label><input className="form-control" type="number" min="0" value={form.quantity} onChange={set('quantity')} /></div>}
        <div className="form-group"><label>Low stock alert at</label><input className="form-control" type="number" min="0" value={form.quantity_min} onChange={set('quantity_min')} /></div>
        <div className="form-group"><label>Unit cost ($)</label><input className="form-control" type="number" step="0.01" min="0" value={form.unit_cost} onChange={set('unit_cost')} /></div>
        <div className="form-group"><label>Sell price ($)</label><input className="form-control" type="number" step="0.01" min="0" value={form.sell_price} onChange={set('sell_price')} /></div>
        <div className="form-group"><label>Storage location</label><input className="form-control" value={form.location} onChange={set('location')} placeholder="e.g. Shelf A3" /></div>
      </div>
      <div className="form-group"><label>Notes</label><textarea className="form-control" value={form.notes} onChange={set('notes')} rows={2} /></div>
      <div className="modal-footer">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : initial?.id ? 'Save changes' : 'Add item'}</button>
      </div>
    </form>
  );
}

function AdjustForm({ item, onSave, onClose }) {
  const [type, setType] = useState('add');
  const [qty, setQty] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const preview = () => { const q=parseInt(qty)||0; if(type==='add') return item.quantity+q; if(type==='remove') return Math.max(0,item.quantity-q); return q; };
  const submit = async e => {
    e.preventDefault(); setSaving(true);
    try { await axios.post(`/api/inventory/${item.id}/adjust`, { type, quantity: parseInt(qty), notes }); onSave(); }
    catch (err) { alert(err.response?.data?.error || 'Error'); }
    setSaving(false);
  };
  return (
    <form onSubmit={submit}>
      <div style={{ background:'var(--bg3)', borderRadius:8, padding:'12px 14px', marginBottom:16 }}>
        <div style={{ fontSize:13, color:'var(--text2)' }}>Current stock — <strong>{item.name}</strong></div>
        {item.manufacturer && <div style={{ fontSize:12, color:'var(--text3)' }}>{MFR_LOGOS[item.manufacturer]||'📦'} {item.manufacturer}{item.device_type ? ` · ${item.device_type}` : ''}</div>}
        <div style={{ fontSize:28, fontWeight:700 }}>{item.quantity}</div>
        <StockBadge quantity={item.quantity} min={item.quantity_min} />
      </div>
      <div className="form-group">
        <label>Adjustment type</label>
        <div style={{ display:'flex', gap:8 }}>
          {[['add','+ Add'],['remove','− Remove'],['set','= Set exact']].map(([v,l]) => (
            <button key={v} type="button" onClick={() => setType(v)} className="btn"
              style={{ flex:1, background:type===v?'var(--accent)':undefined, color:type===v?'#fff':undefined, borderColor:type===v?'var(--accent)':undefined }}>{l}</button>
          ))}
        </div>
      </div>
      <div className="form-group"><label>Quantity</label><input className="form-control" type="number" min="0" value={qty} onChange={e => setQty(e.target.value)} autoFocus required /></div>
      {qty && <div style={{ background:'var(--accent-light)', color:'var(--accent)', padding:'8px 12px', borderRadius:6, marginBottom:14, fontSize:13 }}>New stock level: <strong>{preview()}</strong></div>}
      <div className="form-group"><label>Notes</label><input className="form-control" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Received from supplier" /></div>
      <div className="modal-footer">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving||!qty}>{saving?'Saving…':'Confirm adjustment'}</button>
      </div>
    </form>
  );
}

function ItemDetail({ itemId, onEdit, onAdjust, onNavigate }) {
  const [item, setItem] = useState(null);
  const load = useCallback(() => { axios.get(`/api/inventory/${itemId}`).then(r => setItem(r.data)); }, [itemId]);
  useEffect(() => { load(); }, [load]);
  if (!item) return <Spinner />;
  const margin = item.sell_price>0&&item.unit_cost>0 ? (((item.sell_price-item.unit_cost)/item.sell_price)*100).toFixed(1) : null;
  return (
    <div>
      <div className="flex-between" style={{ marginBottom:20 }}>
        <div>
          <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:6, flexWrap:'wrap' }}>
            <StockBadge quantity={item.quantity} min={item.quantity_min} />
            {item.manufacturer && <span className="badge" style={{ background:'var(--purple-light)', color:'var(--purple)' }}>{MFR_LOGOS[item.manufacturer]||'📦'} {item.manufacturer}</span>}
            {item.device_type && <span className="badge" style={{ background:'var(--bg3)', color:'var(--text2)' }}>{item.device_type}</span>}
            <span style={{ fontSize:12, color:'var(--text3)' }}>{item.category}</span>
            {item.sku && <span style={{ fontSize:12, color:'var(--text3)', fontFamily:'monospace' }}>{item.sku}</span>}
          </div>
          <h2 style={{ fontSize:20, fontWeight:700 }}>{item.name}</h2>
          {item.description && <p style={{ color:'var(--text2)', fontSize:13, marginTop:4 }}>{item.description}</p>}
        </div>
        <div className="flex">
          <button className="btn btn-primary" onClick={onAdjust}>Adjust stock</button>
          <button className="btn" onClick={() => onEdit(item)}>Edit</button>
          <button className="btn btn-sm" onClick={() => onNavigate('scanner')}>🏷️ Label</button>
        </div>
      </div>
      <div className="grid-4" style={{ marginBottom:16 }}>
        {[['Current stock',item.quantity,item.quantity===0?'var(--danger)':item.quantity<=item.quantity_min?'var(--warning)':'var(--success)'],['Low stock at',item.quantity_min,'var(--text2)'],['Unit cost',`$${(item.unit_cost||0).toFixed(2)}`,'var(--text2)'],['Sell price',`$${(item.sell_price||0).toFixed(2)}`,'var(--text2)']].map(([label,val,color]) => (
          <div key={label} className="stat-card"><div className="stat-label">{label}</div><div className="stat-value" style={{ fontSize:22, color }}>{val}</div></div>
        ))}
      </div>
      <div className="grid-2" style={{ marginBottom:16 }}>
        <div className="card card-sm">
          <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'.05em', color:'var(--text3)', marginBottom:10 }}>Item details</div>
          {[['Manufacturer',item.manufacturer],['Device type',item.device_type],['Supplier',item.supplier],['Location',item.location],['Stock value',`$${((item.quantity||0)*(item.unit_cost||0)).toFixed(2)}`],['Margin',margin?`${margin}%`:'—']].map(([l,v]) => v ? (
            <div key={l} className="flex-between" style={{ marginBottom:6 }}><span style={{ color:'var(--text3)', fontSize:12 }}>{l}</span><span style={{ fontSize:13 }}>{v}</span></div>
          ) : null)}
        </div>
        <div className="card card-sm">
          <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'.05em', color:'var(--text3)', marginBottom:10 }}>Stock meter</div>
          {(() => { const max=Math.max(item.quantity*2,item.quantity_min*3,10); const pct=Math.min(100,(item.quantity/max)*100); const color=item.quantity===0?'var(--danger)':item.quantity<=item.quantity_min?'var(--warning)':'var(--success)'; return (<><div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--text2)', marginBottom:4 }}><span>0</span><span style={{ fontWeight:600 }}>{item.quantity}</span><span>{max}</span></div><div style={{ height:12, background:'var(--bg3)', borderRadius:6, overflow:'hidden' }}><div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:6, transition:'width .3s' }} /></div><div style={{ fontSize:12, color:'var(--text3)', marginTop:8 }}>Alert at <strong>{item.quantity_min}</strong></div></>); })()}
        </div>
      </div>
      <div className="card">
        <div style={{ fontWeight:700, marginBottom:14, fontSize:14 }}>Transaction history</div>
        {item.transactions?.length===0 ? <div style={{ color:'var(--text3)', fontSize:13, textAlign:'center', padding:16 }}>No transactions yet</div> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Date</th><th>Type</th><th>Change</th><th>After</th><th>Notes</th></tr></thead>
            <tbody>{item.transactions.map(t => (
              <tr key={t.id}>
                <td style={{ fontSize:12, color:'var(--text3)' }}>{format(new Date(t.created_at),'MMM d, yyyy h:mm a')}</td>
                <td style={{ fontSize:12, textTransform:'capitalize' }}>{t.type}</td>
                <td style={{ fontWeight:600, color:t.quantity_change>0?'var(--success)':t.quantity_change<0?'var(--danger)':'var(--text3)' }}>{t.quantity_change>0?'+':''}{t.quantity_change}</td>
                <td style={{ fontWeight:500 }}>{t.quantity_after}</td>
                <td style={{ fontSize:12, color:'var(--text2)' }}>{t.repair_title?<span>Repair: <em>{t.repair_title}</em></span>:t.notes||'—'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

export default function Inventory({ onNavigate }) {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterMfr, setFilterMfr] = useState('');
  const [filterDeviceType, setFilterDeviceType] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [viewMode, setViewMode] = useState('list');
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [adjustItem, setAdjustItem] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [showAI, setShowAI] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (filterCat) params.set('category', filterCat);
    if (filterMfr) params.set('manufacturer', filterMfr);
    if (filterDeviceType) params.set('device_type', filterDeviceType);
    if (lowOnly) params.set('low_stock', '1');
    const [itemsRes, statsRes] = await Promise.all([
      axios.get(`/api/inventory?${params}`),
      axios.get('/api/inventory/stats')
    ]);
    setItems(itemsRes.data);
    setStats(statsRes.data);
    setLoading(false);
  }, [q, filterCat, filterMfr, filterDeviceType, lowOnly]);

  useEffect(() => { load(); }, [load]);

  const groupedByMfr = items.reduce((acc, item) => {
    const key = item.manufacturer || 'Unbranded';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  if (selected) return (
    <div className="page">
      <button className="btn btn-sm" style={{ marginBottom:16 }} onClick={() => { setSelected(null); load(); }}>← Back to inventory</button>
      <ItemDetail itemId={selected} onEdit={item => { setEditing(item); setModal(true); }} onAdjust={() => axios.get(`/api/inventory/${selected}`).then(r => setAdjustItem(r.data))} onNavigate={onNavigate} />
      <Modal open={modal} onClose={() => setModal(false)} title="Edit item" large><ItemForm initial={editing} onSave={() => { setModal(false); load(); }} onClose={() => setModal(false)} /></Modal>
      <Modal open={!!adjustItem} onClose={() => setAdjustItem(null)} title={`Adjust stock — ${adjustItem?.name}`}>{adjustItem && <AdjustForm item={adjustItem} onSave={() => { setAdjustItem(null); load(); }} onClose={() => setAdjustItem(null)} />}</Modal>
    </div>
  );

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>Inventory</h1><p>{items.length} items</p></div>
        <div className="flex" style={{ flexWrap:'wrap', gap:8 }}>
          <SearchBar value={q} onChange={setQ} placeholder="Search parts, manufacturer…" />
          <button className={`btn btn-sm ${lowOnly ? 'btn-primary' : ''}`} onClick={() => setLowOnly(v => !v)}>⚠️ Low{stats?.low_stock>0&&!lowOnly?` (${stats.low_stock})`:''}</button>
          <button className="btn btn-sm" style={{ background:showAI?'var(--purple-light)':undefined, color:showAI?'var(--purple)':undefined }} onClick={() => setShowAI(s => !s)}>🤖 AI</button>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setModal(true); }}>+ Add item</button>
        </div>
      </div>

      {stats && (
        <div className="grid-stat" style={{ marginBottom:16 }}>
          <div className="stat-card"><div className="stat-label">Total items</div><div className="stat-value">{stats.total}</div></div>
          <div className="stat-card"><div className="stat-label">Low stock</div><div className="stat-value" style={{ color:'var(--warning)' }}>{stats.low_stock}</div></div>
          <div className="stat-card"><div className="stat-label">Out of stock</div><div className="stat-value" style={{ color:'var(--danger)' }}>{stats.out_of_stock}</div></div>
          <div className="stat-card"><div className="stat-label">Stock value</div><div className="stat-value">${(stats.total_value||0).toFixed(0)}</div></div>
        </div>
      )}

      {/* Manufacturer brand cards */}
      {stats?.manufacturers?.length > 0 && (
        <div className="card" style={{ marginBottom:16 }}>
          <div className="flex-between" style={{ marginBottom:12 }}>
            <span style={{ fontWeight:700, fontSize:13 }}>🏭 Filter by manufacturer</span>
            {filterMfr && <button className="btn btn-sm" onClick={() => setFilterMfr('')}>✕ Clear</button>}
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {stats.manufacturers.map(m => (
              <ManufacturerCard key={m.manufacturer} manufacturer={m.manufacturer} count={m.c}
                isActive={filterMfr===m.manufacturer} onClick={() => setFilterMfr(f => f===m.manufacturer?'':m.manufacturer)} />
            ))}
          </div>
        </div>
      )}

      {/* Secondary filters + view toggle */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <select className="form-control" style={{ width:'auto' }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="form-control" style={{ width:'auto' }} value={filterDeviceType} onChange={e => setFilterDeviceType(e.target.value)}>
          <option value="">All device types</option>
          {DEVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div style={{ display:'flex', borderRadius:8, overflow:'hidden', border:'1px solid var(--border)', marginLeft:'auto' }}>
          {[['list','☰ List'],['manufacturer','🏭 By brand']].map(([v,l]) => (
            <button key={v} onClick={() => setViewMode(v)} style={{ padding:'7px 14px', border:'none', cursor:'pointer', fontSize:12, fontWeight:600, background:viewMode===v?'var(--accent)':'var(--bg2)', color:viewMode===v?'#fff':'var(--text2)' }}>{l}</button>
          ))}
        </div>
      </div>

      {showAI && <div style={{ marginBottom:16 }}><ReorderSuggestions /></div>}

      {loading ? <Spinner /> : items.length===0 ? (
        <div className="card"><EmptyState icon="📦" title="No inventory items" body="Add parts and supplies to track your stock levels." action={<button className="btn btn-primary" onClick={() => setModal(true)}>Add first item</button>} /></div>
      ) : viewMode === 'manufacturer' ? (
        <div>
          {Object.entries(groupedByMfr).sort(([a],[b]) => a.localeCompare(b)).map(([mfr, mfrItems]) => (
            <div key={mfr} className="card" style={{ marginBottom:16 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12, paddingBottom:10, borderBottom:'1px solid var(--border)' }}>
                <span style={{ fontSize:26 }}>{MFR_LOGOS[mfr]||'📦'}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:15 }}>{mfr}</div>
                  <div style={{ fontSize:12, color:'var(--text3)' }}>{mfrItems.length} item{mfrItems.length!==1?'s':''} · {mfrItems.reduce((s,i)=>s+i.quantity,0)} units total · ${mfrItems.reduce((s,i)=>s+(i.quantity*i.unit_cost),0).toFixed(0)} value</div>
                </div>
                <button className="btn btn-sm" onClick={() => { setFilterMfr(mfr); setViewMode('list'); }}>View list →</button>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(190px, 1fr))', gap:8 }}>
                {mfrItems.map(item => (
                  <div key={item.id} onClick={() => setSelected(item.id)} style={{ padding:'10px 12px', borderRadius:8, border:'1px solid var(--border)', cursor:'pointer', background:'var(--bg3)', transition:'border-color .15s' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor='var(--accent)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}>
                    <div style={{ fontWeight:600, fontSize:13, marginBottom:3 }}>{item.name}</div>
                    {item.device_type && <div style={{ fontSize:11, color:'var(--text3)', marginBottom:5 }}>{item.device_type} · {item.category}</div>}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <StockBadge quantity={item.quantity} min={item.quantity_min} />
                      <span style={{ fontWeight:700, fontSize:15, color:item.quantity===0?'var(--danger)':item.quantity<=item.quantity_min?'var(--warning)':'var(--text)' }}>{item.quantity}</span>
                    </div>
                    {item.sell_price>0 && <div style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>${item.sell_price.toFixed(2)} ea</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Manufacturer</th><th>Device</th><th>Category</th><th>Stock</th><th>Status</th><th>Cost</th><th>Price</th><th>Location</th><th></th></tr></thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} className="clickable-row" onClick={() => setSelected(item.id)}>
                    <td style={{ fontWeight:500 }}>{item.name}{item.sku && <span style={{ fontFamily:'monospace', fontSize:10, color:'var(--text3)', marginLeft:6 }}>{item.sku}</span>}</td>
                    <td>{item.manufacturer ? <span style={{ display:'flex', alignItems:'center', gap:4 }}><span>{MFR_LOGOS[item.manufacturer]||'📦'}</span><span style={{ fontSize:12 }}>{item.manufacturer}</span></span> : <span style={{ color:'var(--text3)', fontSize:12 }}>—</span>}</td>
                    <td style={{ fontSize:12, color:'var(--text2)' }}>{item.device_type||'—'}</td>
                    <td style={{ fontSize:12, color:'var(--text2)' }}>{item.category}</td>
                    <td style={{ fontWeight:700, color:item.quantity===0?'var(--danger)':item.quantity<=item.quantity_min?'var(--warning)':'var(--text)' }}>{item.quantity}</td>
                    <td><StockBadge quantity={item.quantity} min={item.quantity_min} /></td>
                    <td style={{ color:'var(--text2)' }}>{item.unit_cost>0?`$${item.unit_cost.toFixed(2)}`:'—'}</td>
                    <td style={{ color:'var(--text2)' }}>{item.sell_price>0?`$${item.sell_price.toFixed(2)}`:'—'}</td>
                    <td style={{ fontSize:12, color:'var(--text3)' }}>{item.location||'—'}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="flex">
                        <button className="btn btn-sm" onClick={() => setAdjustItem(item)} title="Adjust">±</button>
                        <button className="btn btn-sm btn-icon" onClick={() => { setEditing(item); setModal(true); }}>
                          <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" strokeWidth="2" strokeLinecap="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" strokeWidth="2" strokeLinecap="round"/></svg>
                        </button>
                        <button className="btn btn-sm btn-icon btn-danger" onClick={() => setConfirm(item.id)}>
                          <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" strokeWidth="2" strokeLinecap="round"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" strokeWidth="2" strokeLinecap="round"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={modal} onClose={() => { setModal(false); setEditing(null); }} title={editing ? 'Edit item' : 'Add inventory item'} large>
        <ItemForm initial={editing} onSave={() => { setModal(false); setEditing(null); load(); }} onClose={() => { setModal(false); setEditing(null); }} />
      </Modal>
      <Modal open={!!adjustItem&&!selected} onClose={() => setAdjustItem(null)} title={`Adjust stock — ${adjustItem?.name}`}>
        {adjustItem && <AdjustForm item={adjustItem} onSave={() => { setAdjustItem(null); load(); }} onClose={() => setAdjustItem(null)} />}
      </Modal>
      <ConfirmDialog open={!!confirm} message="Delete this item and all transaction history?" onConfirm={async () => { await axios.delete(`/api/inventory/${confirm}`); setConfirm(null); load(); }} onCancel={() => setConfirm(null)} />
    </div>
  );
}
