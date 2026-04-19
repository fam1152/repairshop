import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Modal, ConfirmDialog, SearchBar, Spinner, EmptyState, formatPhoneNumber } from '../components/Shared';
import { SpeechButton, MagicWandButton } from '../components/AIAssistant';
import { format } from 'date-fns';

function CustomerForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || { name: '', email: '', phone: '', address: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const submit = async e => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = { ...form, phone: formatPhoneNumber(form.phone) };
      if (initial?.id) await axios.put(`/api/customers/${initial.id}`, payload);
      else await axios.post('/api/customers', payload);
      onSave();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
    setSaving(false);
  };
  return (
    <form onSubmit={submit}>
      <div className="grid-2">
        <div className="form-group"><label>Name *</label><input className="form-control" value={form.name} onChange={set('name')} required autoFocus /></div>
        <div className="form-group"><label>Phone</label><input className="form-control" value={form.phone} onChange={set('phone')} /></div>
      </div>
      <div className="form-group"><label>Email</label><input className="form-control" type="email" value={form.email} onChange={set('email')} /></div>
      <div className="form-group"><label>Address</label><input className="form-control" value={form.address} onChange={set('address')} /></div>
      <div className="form-group">
        <div className="flex-between">
          <label>Notes</label>
          <div className="flex" style={{ gap: 6 }}>
            <MagicWandButton value={form.notes} onExpanded={t => setForm(f => ({ ...f, notes: t }))} />
            <SpeechButton onTranscript={t => setForm(f => ({ ...f, notes: f.notes ? f.notes + ' ' + t : t }))} />
          </div>
        </div>
        <textarea className="form-control" value={form.notes} onChange={set('notes')} rows={3} />
      </div>
      <div className="modal-footer">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save customer'}</button>
      </div>
    </form>
  );
}

function CallLogForm({ customerId, repairs, onSave, onClose }) {
  const [form, setForm] = useState({ direction: 'outbound', notes: '', outcome: '', repair_id: '' });
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const submit = async e => {
    e.preventDefault(); setSaving(true);
    try { await axios.post(`/api/customers/${customerId}/calls`, form); onSave(); }
    catch { alert('Error saving call'); }
    setSaving(false);
  };
  return (
    <form onSubmit={submit}>
      <div className="form-group">
        <label>Direction</label>
        <select className="form-control" value={form.direction} onChange={set('direction')}>
          <option value="outbound">Outbound (I called them)</option>
          <option value="inbound">Inbound (They called me)</option>
        </select>
      </div>
      {repairs?.length > 0 && (
        <div className="form-group">
          <label>Related repair (optional)</label>
          <select className="form-control" value={form.repair_id} onChange={set('repair_id')}>
            <option value="">— None —</option>
            {repairs.map(r => <option key={r.id} value={r.id}>{r.title} ({r.status})</option>)}
          </select>
        </div>
      )}
      <div className="form-group"><label>Notes *</label><textarea className="form-control" value={form.notes} onChange={set('notes')} placeholder="What was discussed?" autoFocus rows={3} /></div>
      <div className="form-group"><label>Outcome</label><input className="form-control" value={form.outcome} onChange={set('outcome')} placeholder="Left voicemail, scheduled pickup, etc." /></div>
      <div className="modal-footer">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Log call'}</button>
      </div>
    </form>
  );
}

function ProductKeysPanel({ customerId, repairs }) {
  const [keys, setKeys] = useState([]);
  const [form, setForm] = useState({ product: '', key_value: '', repair_id: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    axios.get(`/api/customers/${customerId}/product-keys`).then(r => setKeys(r.data)).catch(() => {});
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const add = async e => {
    e.preventDefault(); if (!form.key_value) return;
    setSaving(true);
    try { await axios.post(`/api/customers/${customerId}/product-keys`, form); setForm({ product: '', key_value: '', repair_id: '', notes: '' }); load(); }
    catch(err) { alert(err.response?.data?.error || 'Error'); }
    setSaving(false);
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Add product key</div>
        <form onSubmit={add}>
          <div className="grid-2">
            <div className="form-group"><label>Product / Software</label><input className="form-control" value={form.product} onChange={e => setForm(f => ({...f, product: e.target.value}))} placeholder="e.g. Windows 11 Pro" /></div>
            <div className="form-group"><label>Key *</label><input className="form-control" value={form.key_value} onChange={e => setForm(f => ({...f, key_value: e.target.value}))} placeholder="XXXXX-XXXXX-XXXXX-XXXXX" required /></div>
          </div>
          {repairs?.length > 0 && (
            <div className="form-group">
              <label>Related repair</label>
              <select className="form-control" value={form.repair_id} onChange={e => setForm(f => ({...f, repair_id: e.target.value}))}>
                <option value="">— None —</option>
                {repairs.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
            </div>
          )}
          <div className="form-group">
            <div className="flex-between">
              <label>Notes</label>
              <MagicWandButton value={form.notes} onExpanded={t => setForm(f => ({...f, notes: t}))} />
            </div>
            <input className="form-control" value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} />
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>+ Add key</button>
        </form>
      </div>

      {keys.length === 0 ? (
        <div style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: 20 }}>No product keys saved yet</div>
      ) : keys.map(k => (
        <div key={k.id} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 12px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            {k.product && <div style={{ fontWeight: 600, fontSize: 13 }}>{k.product}</div>}
            <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--accent)', letterSpacing: '.06em' }}>{k.key_value}</div>
            {k.notes && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{k.notes}</div>}
          </div>
          <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(k.key_value); }} title="Copy key">📋</button>
          <button className="btn btn-sm btn-danger" onClick={async () => { await axios.delete(`/api/customers/${customerId}/product-keys/${k.id}`); load(); }}>✕</button>
        </div>
      ))}
    </div>
  );
}

function DocumentsPanel({ customerId }) {
  const [docs, setDocs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [notes, setNotes] = useState('');
  const fileRef = useRef();
  const scanRef = useRef();

  const load = useCallback(() => {
    axios.get(`/api/customers/${customerId}/documents`).then(r => setDocs(r.data)).catch(() => {});
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const upload = async (file, fromScan) => {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('document', file);
    fd.append('notes', fromScan ? 'Scanned document' : notes);
    try { await axios.post(`/api/customers/${customerId}/documents`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }); setNotes(''); load(); }
    catch(err) { alert(err.response?.data?.error || 'Upload failed'); }
    setUploading(false);
  };

  const formatSize = bytes => bytes < 1024*1024 ? `${(bytes/1024).toFixed(0)} KB` : `${(bytes/1024/1024).toFixed(1)} MB`;

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="flex" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            📁 Upload document
          </button>
          <button className="btn btn-sm" onClick={() => scanRef.current?.click()} disabled={uploading}>
            📷 Scan document
          </button>
          <input ref={fileRef} type="file" style={{ display: 'none' }} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.txt" onChange={e => upload(e.target.files[0], false)} />
          <input ref={scanRef} type="file" style={{ display: 'none' }} accept="image/*" capture="environment" onChange={e => upload(e.target.files[0], true)} />
        </div>
        <input className="form-control" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Document description (optional)" />
        {uploading && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>Uploading…</div>}
      </div>

      {docs.length === 0 ? (
        <div style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: 20 }}>No documents uploaded yet</div>
      ) : docs.map(doc => (
        <div key={doc.id} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 12px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 20 }}>{doc.file_type?.includes('pdf') ? '📄' : doc.file_type?.includes('image') ? '🖼️' : '📎'}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, fontSize: 13 }}>{doc.original_name}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>{formatSize(doc.file_size)} · {format(new Date(doc.created_at), 'MMM d, yyyy')}{doc.notes ? ` · ${doc.notes}` : ''}</div>
          </div>
          <a href={`/api/customers/${customerId}/documents/${doc.id}/file`} target="_blank" rel="noreferrer" className="btn btn-sm">View</a>
          <button className="btn btn-sm btn-danger" onClick={async () => { await axios.delete(`/api/customers/${customerId}/documents/${doc.id}`); load(); }}>✕</button>
        </div>
      ))}
    </div>
  );
}


function NotesPanel({ customerId }) {
  const [notes, setNotes] = React.useState([]);
  const [newHeading, setNewHeading] = React.useState('Note');
  const [newBody, setNewBody] = React.useState('');
  const [editingId, setEditingId] = React.useState(null);
  const [editForm, setEditForm] = React.useState({});
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(() => {
    axios.get('/api/customers/' + customerId + '/notes').then(r => setNotes(r.data)).catch(()=>{});
  }, [customerId]);

  React.useEffect(() => { load(); }, [load]);

  const addNote = async () => {
    if (!newBody.trim()) return;
    setSaving(true);
    try { await axios.post('/api/customers/' + customerId + '/notes', { heading: newHeading, body: newBody }); setNewHeading('Note'); setNewBody(''); load(); }
    catch(e) { alert('Error saving note'); }
    setSaving(false);
  };

  const updateNote = async (id) => {
    try { await axios.put('/api/customers/' + customerId + '/notes/' + id, editForm); setEditingId(null); load(); }
    catch(e) { alert('Error updating note'); }
  };

  return (
    <div>
      {/* Add new note */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Add note</div>
        <div className="form-group">
          <label>Heading (customizable)</label>
          <input className="form-control" value={newHeading} onChange={e => setNewHeading(e.target.value)} placeholder="e.g. Repair Notes, Device History, Preferences…" />
        </div>
        <div className="form-group">
          <div className="flex-between">
            <label>Notes *</label>
            <div className="flex" style={{ gap: 6 }}>
              <MagicWandButton value={newBody} onExpanded={setNewBody} />
              <SpeechButton onTranscript={t => setNewBody(prev => prev ? prev + ' ' + t : t)} />
            </div>
          </div>
          <textarea className="form-control" value={newBody} onChange={e => setNewBody(e.target.value)} rows={3} placeholder="Enter notes here…" />
        </div>
        <button className="btn btn-primary btn-sm" onClick={addNote} disabled={saving || !newBody.trim()}>{saving ? 'Saving…' : '+ Add note'}</button>
      </div>

      {notes.length === 0 ? (
        <div style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: 20 }}>No notes yet</div>
      ) : notes.map(note => (
        <div key={note.id} className="card card-sm" style={{ marginBottom: 8, border: note.pinned ? '1px solid var(--accent)' : '1px solid var(--border)' }}>
          {editingId === note.id ? (
            <div>
              <div className="form-group"><label style={{ fontSize: 11 }}>Heading</label><input className="form-control" value={editForm.heading} onChange={e => setEditForm(f => ({...f, heading: e.target.value}))} /></div>
              <div className="form-group">
                <div className="flex-between">
                  <label style={{ fontSize: 11 }}>Notes</label>
                  <div className="flex" style={{ gap: 6 }}>
                    <MagicWandButton value={editForm.body} onExpanded={t => setEditForm(f => ({...f, body: t}))} />
                  </div>
                </div>
                <textarea className="form-control" value={editForm.body} onChange={e => setEditForm(f => ({...f, body: e.target.value}))} rows={3} />
              </div>
              <div className="flex" style={{ gap: 6 }}>
                <button className="btn btn-sm btn-primary" onClick={() => updateNote(note.id)}>Save</button>
                <button className="btn btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex-between" style={{ marginBottom: 6 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent)' }}>{note.heading}{note.pinned && ' 📌'}</div>
                <div className="flex" style={{ gap: 4 }}>
                  <button className="btn btn-sm" onClick={async () => { await axios.put('/api/customers/' + customerId + '/notes/' + note.id, {...note, pinned: !note.pinned}); load(); }} title="Pin">{note.pinned ? '📌' : '📍'}</button>
                  <button className="btn btn-sm btn-icon" onClick={() => { setEditingId(note.id); setEditForm({ heading: note.heading, body: note.body, pinned: note.pinned }); }}>✏️</button>
                  <button className="btn btn-sm btn-icon btn-danger" onClick={async () => { await axios.delete('/api/customers/' + customerId + '/notes/' + note.id); load(); }}>🗑️</button>
                </div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{note.body}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>{new Date(note.updated_at).toLocaleString()}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


function UpcomingTab({ customerId, onNavigate }) {
  const [appts, setAppts] = React.useState([]);
  React.useEffect(() => {
    axios.get('/api/appointments?customer_id=' + customerId).then(r => setAppts(r.data.filter(a => new Date(a.start_time) >= new Date()).slice(0, 5))).catch(()=>{});
  }, [customerId]);
  if (appts.length === 0) return <div style={{ color:'var(--text3)', fontSize:13, textAlign:'center', padding:20 }}>No upcoming appointments</div>;
  return <div>{appts.map(a => (
    <div key={a.id} className="card card-sm" style={{ marginBottom:8 }}>
      <div style={{ fontWeight:600 }}>{a.title}</div>
      <div style={{ fontSize:12, color:'var(--text3)' }}>{new Date(a.start_time).toLocaleString()}</div>
    </div>
  ))}</div>;
}

function CustomerDetail({ customerId, onEdit, onNewRepair, onNewAppointment, onNavigate }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('repairs');
  const [callModal, setCallModal] = useState(false);
  const [upcomingAppts, setUpcomingAppts] = useState([]);

  const load = useCallback(() => {
    axios.get(`/api/customers/${customerId}`).then(r => setData(r.data));
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  // Load upcoming appointments for this customer
  React.useEffect(() => {
    if (!customerId) return;
    axios.get(`/api/appointments?customer_id=${customerId}&start=${new Date().toISOString()}&end=${new Date(Date.now()+30*86400000).toISOString()}`)
      .then(r => setUpcomingAppts(r.data || []))
      .catch(() => {});
  }, [customerId]);

  if (!data) return <Spinner />;

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>{data.name}</h2>
          <div style={{ display: 'flex', gap: 16, marginTop: 4, flexWrap: 'wrap' }}>
            {data.phone && <span style={{ fontSize: 13, color: 'var(--text2)' }}>📞 {data.phone}</span>}
            {data.email && <span style={{ fontSize: 13, color: 'var(--text2)' }}>✉️ {data.email}</span>}
            {data.address && <span style={{ fontSize: 13, color: 'var(--text2)' }}>📍 {data.address}</span>}
          </div>
          {data.google_contact_id && <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 4 }}>✓ Synced to Google Contacts</div>}
        </div>
        <div className="flex" style={{ flexWrap: 'wrap', gap: 6 }}>
          <button className="btn btn-sm" onClick={() => setTab('notes')} style={{ background: tab==='notes' ? 'var(--accent-light)' : undefined, color: tab==='notes' ? 'var(--accent)' : undefined }}>📝 Notes</button>
          <button className="btn btn-sm" onClick={() => setCallModal(true)}>📞 Log call</button>
          <button className="btn btn-sm btn-primary" onClick={() => onNewRepair(data)}>+ Repair</button>
          <button className="btn btn-sm" onClick={() => onNewAppointment && onNewAppointment(data)}>📅 Appt</button>
          <button className="btn btn-sm" onClick={() => onEdit(data)}>Edit</button>
          <button className="btn btn-sm" onClick={async () => {
            try { const r = await axios.post(`/api/customers/${customerId}/sync-google`); alert('Synced to Google Contacts ✓'); }
            catch(e) { alert('Sync failed: ' + (e.response?.data?.error || e.message)); }
          }}>🔄 Sync Google</button>
        </div>
      </div>

      {/* Upcoming appointments banner */}
      {upcomingAppts.length > 0 && (
        <div style={{ background: 'var(--success-light)', border: '1px solid var(--success)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>📅</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--success)' }}>Upcoming appointment{upcomingAppts.length > 1 ? 's' : ''}</div>
            {upcomingAppts.slice(0,2).map(a => (
              <div key={a.id} style={{ fontSize: 12, color: 'var(--text2)' }}>{a.title} — {new Date(a.start_time).toLocaleDateString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })}</div>
            ))}
          </div>
        </div>
      )}

      <div className="tabs">
        {[
          ['repairs', `🔧 Repairs (${data.repairs?.length || 0})`],
          ['calls', `📞 Calls (${data.calls?.length || 0})`],
          ['notes', '📝 Notes'],
          ['keys', '🔑 Product Keys'],
          ['docs', '📎 Documents'],
          ['upcoming', '📅 Upcoming'],
        ].map(([t, l]) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{l}</button>
        ))}
      </div>

      {tab === 'repairs' && (
        data.repairs?.length === 0
          ? <EmptyState icon="🔧" title="No repairs yet" body="Create the first repair for this customer." action={<button className="btn btn-primary btn-sm" onClick={() => onNewRepair(data)}>New Repair</button>} />
          : <div className="table-wrap"><table>
              <thead><tr><th>Title</th><th>Device</th><th>Status</th><th>Date</th><th>Warranty</th></tr></thead>
              <tbody>
                {data.repairs?.map(r => (
                  <tr key={r.id} className="clickable-row" onClick={() => onNavigate('repairs', { repairId: r.id })}>
                    <td style={{ fontWeight: 500 }}>{r.title}</td>
                    <td style={{ color: 'var(--text2)' }}>{[r.device_brand, r.device_model].filter(Boolean).join(' ') || '—'}</td>
                    <td><span className={`badge badge-${r.status}`}>{r.status.replace('_', ' ')}</span></td>
                    <td style={{ color: 'var(--text3)', fontSize: 12 }}>{format(new Date(r.created_at), 'MMM d, yyyy')}</td>
                    <td style={{ fontSize: 12 }}>{r.warranty_expires ? <span style={{ color: new Date(r.warranty_expires) > new Date() ? 'var(--success)' : 'var(--danger)' }}>{format(new Date(r.warranty_expires), 'MMM d, yyyy')}</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
      )}

      {tab === 'calls' && (
        data.calls?.length === 0
          ? <EmptyState icon="📞" title="No calls logged" body="Log a call to track customer contact." action={<button className="btn btn-primary btn-sm" onClick={() => setCallModal(true)}>Log Call</button>} />
          : <div>{data.calls?.map(c => (
              <div key={c.id} className="card card-sm" style={{ marginBottom: 8 }}>
                <div className="flex-between">
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: c.direction === 'inbound' ? 'var(--success)' : 'var(--accent)' }}>{c.direction === 'inbound' ? '📲 Inbound' : '📞 Outbound'}</span>
                    <span style={{ color: 'var(--text3)', fontSize: 12, marginLeft: 8 }}>{format(new Date(c.created_at), 'MMM d, yyyy h:mm a')}</span>
                  </div>
                  <button className="btn btn-sm btn-danger" onClick={async () => { await axios.delete(`/api/customers/calls/${c.id}`); load(); }}>✕</button>
                </div>
                {c.notes && <div style={{ marginTop: 6, fontSize: 13 }}>{c.notes}</div>}
                {c.outcome && <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text3)' }}>Outcome: {c.outcome}</div>}
              </div>
            ))}</div>
      )}

      {tab === 'notes' && <NotesPanel customerId={customerId} />}
      {tab === 'keys' && <ProductKeysPanel customerId={customerId} repairs={data.repairs} />}
      {tab === 'upcoming' && <UpcomingTab customerId={customerId} onNavigate={onNavigate} />}
      {tab === 'docs' && <DocumentsPanel customerId={customerId} />}

      <Modal open={callModal} onClose={() => setCallModal(false)} title="Log a call">
        <CallLogForm customerId={data.id} repairs={data.repairs} onSave={() => { setCallModal(false); load(); }} onClose={() => setCallModal(false)} />
      </Modal>
    </div>
  );
}

export { CustomerDetail };

export default function Customers({ initialState, onNavigate }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(initialState?.customerId || null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    const r = await axios.get(`/api/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    setCustomers(r.data);
    setLoading(false);
  }, [q]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (initialState?.customerId) setSelected(initialState.customerId); }, [initialState]);

  if (selected) return (
    <div className="page">
      <button className="btn btn-sm" style={{ marginBottom: 16 }} onClick={() => setSelected(null)}>← Back to customers</button>
      <CustomerDetail
        customerId={selected}
        onEdit={c => { setEditing(c); setModal(true); }}
        onNewRepair={c => onNavigate('repairs', { newRepair: true, customer: c })}
        onNewAppointment={c => onNavigate('appointments', { newAppt: true, customer: c })}
        onNavigate={onNavigate}
      />
      <Modal open={modal} onClose={() => setModal(false)} title="Edit customer">
        <CustomerForm initial={editing} onSave={() => { setModal(false); load(); }} onClose={() => setModal(false)} />
      </Modal>
    </div>
  );

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>Customers</h1><p>{customers.length} total</p></div>
        <div className="flex" style={{ gap: 8 }}>
          <SearchBar value={q} onChange={setQ} placeholder="Search name, phone, email…" />
          <button className="btn" onClick={() => window.open('/api/customers/export/csv', '_blank')}>📥 Export CSV</button>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setModal(true); }}>+ New Customer</button>
        </div>

      </div>
      <div className="card">
        {loading ? <Spinner /> : customers.length === 0 ? (
          <EmptyState icon="👤" title="No customers yet" body="Add your first customer to get started." action={<button className="btn btn-primary" onClick={() => setModal(true)}>Add Customer</button>} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Added</th><th></th></tr></thead>
              <tbody>
                {customers.map(c => (
                  <tr key={c.id} className="clickable-row" onClick={() => setSelected(c.id)}>
                    <td style={{ fontWeight: 500 }}>{c.name}</td>
                    <td style={{ color: 'var(--text2)' }}>{c.phone || '—'}</td>
                    <td style={{ color: 'var(--text2)' }}>{c.email || '—'}</td>
                    <td style={{ color: 'var(--text3)', fontSize: 12 }}>{format(new Date(c.created_at), 'MMM d, yyyy')}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="flex">
                        <button className="btn btn-sm btn-icon" onClick={() => { setEditing(c); setModal(true); }}>✏️</button>
                        <button className="btn btn-sm btn-icon btn-danger" onClick={() => setConfirm(c.id)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal open={modal} onClose={() => { setModal(false); setEditing(null); }} title={editing ? 'Edit customer' : 'New customer'}>
        <CustomerForm initial={editing} onSave={() => { setModal(false); setEditing(null); load(); }} onClose={() => { setModal(false); setEditing(null); }} />
      </Modal>
      <ConfirmDialog open={!!confirm} message="Delete this customer? They will be moved to Trash." onConfirm={async () => { await axios.delete(`/api/customers/${confirm}`); setConfirm(null); load(); }} onCancel={() => setConfirm(null)} />
    </div>
  );
}
