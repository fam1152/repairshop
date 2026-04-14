import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Modal, Spinner, EmptyState, ConfirmDialog } from '../components/Shared';

const STATUSES = ['intake','diagnosing','waiting_parts','in_repair','ready','completed','cancelled'];
const ACTION_TYPES = [
  { value: 'create_reminder', label: '⏰ Create follow-up reminder' },
  { value: 'create_notification', label: '🔔 Send staff notification' },
  { value: 'update_status', label: '🔄 Change repair status' },
  { value: 'assign_tech', label: '👤 Assign technician' },
];

function StepForm({ step, users, onChange, onRemove }) {
  const set = k => e => onChange({ ...step, [k]: e.target.value });
  const setConfig = k => e => onChange({ ...step, action_config: { ...(step.action_config||{}), [k]: e.target.value } });
  return (
    <div style={{ background:'var(--bg3)', borderRadius:8, padding:'12px 14px', marginBottom:8, border:'1px solid var(--border)' }}>
      <div style={{ display:'flex', gap:8, marginBottom:8, alignItems:'center' }}>
        <div style={{ width:24, height:24, borderRadius:'50%', background:'var(--accent)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>{step.step_order+1}</div>
        <select className="form-control" value={step.action_type} onChange={set('action_type')} style={{ flex:2 }}>{ACTION_TYPES.map(a=><option key={a.value} value={a.value}>{a.label}</option>)}</select>
        <input type="number" className="form-control" style={{ width:70 }} value={step.delay_hours||0} onChange={set('delay_hours')} min="0" />
        <span style={{ fontSize:11, color:'var(--text3)', whiteSpace:'nowrap' }}>hr delay</span>
        <button type="button" className="btn btn-sm btn-danger" onClick={onRemove}>✕</button>
      </div>
      <div style={{ paddingLeft:32 }}>
        {step.action_type === 'create_reminder' && <div className="grid-2"><div className="form-group" style={{ marginBottom:0 }}><label style={{ fontSize:11 }}>Days until due</label><input className="form-control" type="number" min="1" value={step.action_config?.days||1} onChange={setConfig('days')} /></div><div className="form-group" style={{ marginBottom:0 }}><label style={{ fontSize:11 }}>Message</label><input className="form-control" value={step.action_config?.message||''} onChange={setConfig('message')} placeholder="Follow up with customer" /></div></div>}
        {step.action_type === 'create_notification' && <div className="grid-2"><div className="form-group" style={{ marginBottom:0 }}><label style={{ fontSize:11 }}>Title</label><input className="form-control" value={step.action_config?.title||''} onChange={setConfig('title')} placeholder="Repair ready" /></div><div className="form-group" style={{ marginBottom:0 }}><label style={{ fontSize:11 }}>Body (use {"{{customer}}"}, {"{{title}}"})</label><input className="form-control" value={step.action_config?.body||''} onChange={setConfig('body')} /></div></div>}
        {step.action_type === 'update_status' && <div className="form-group" style={{ marginBottom:0 }}><label style={{ fontSize:11 }}>New status</label><select className="form-control" value={step.action_config?.status||''} onChange={setConfig('status')}><option value="">— Select —</option>{STATUSES.map(s=><option key={s} value={s}>{s.replace('_',' ')}</option>)}</select></div>}
        {step.action_type === 'assign_tech' && <div className="form-group" style={{ marginBottom:0 }}><label style={{ fontSize:11 }}>Assign to</label><select className="form-control" value={step.action_config?.user_id||''} onChange={setConfig('user_id')}><option value="">— Select user —</option>{users.map(u=><option key={u.id} value={u.id}>{u.display_name||u.username}</option>)}</select></div>}
      </div>
    </div>
  );
}

function WorkflowForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || { name:'', description:'', trigger_status:'intake', active:true, steps:[] });
  const [users, setUsers] = useState([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { axios.get('/api/users').then(r=>setUsers(r.data)).catch(()=>{}); }, []);
  const addStep = () => setForm(f => ({ ...f, steps:[...f.steps, { step_order:f.steps.length, action_type:'create_notification', action_config:{}, delay_hours:0 }] }));
  const updateStep = (i, s) => setForm(f => ({ ...f, steps:f.steps.map((x,idx)=>idx===i?s:x) }));
  const removeStep = (i) => setForm(f => ({ ...f, steps:f.steps.filter((_,idx)=>idx!==i).map((s,idx)=>({...s,step_order:idx})) }));
  const submit = async e => {
    e.preventDefault(); setSaving(true);
    try {
      if (initial?.id) await axios.put(`/api/workflows/templates/${initial.id}`, form);
      else await axios.post('/api/workflows/templates', form);
      onSave();
    } catch(err) { alert(err.response?.data?.error||'Error'); }
    setSaving(false);
  };
  return (
    <form onSubmit={submit}>
      <div className="grid-2">
        <div className="form-group"><label>Workflow name *</label><input className="form-control" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} required autoFocus /></div>
        <div className="form-group"><label>Triggered when repair → </label><select className="form-control" value={form.trigger_status} onChange={e=>setForm(f=>({...f,trigger_status:e.target.value}))}>{STATUSES.map(s=><option key={s} value={s}>{s.replace('_',' ')}</option>)}</select></div>
      </div>
      <div className="form-group"><label>Description</label><textarea className="form-control" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={2} /></div>
      <div style={{ fontWeight:600, fontSize:12, textTransform:'uppercase', color:'var(--text3)', marginBottom:10 }}>Steps ({form.steps.length})</div>
      {form.steps.map((step,i) => <StepForm key={i} step={{...step,step_order:i}} users={users} onChange={s=>updateStep(i,s)} onRemove={()=>removeStep(i)} />)}
      <button type="button" className="btn btn-sm" onClick={addStep} style={{ marginBottom:16 }}>+ Add step</button>
      <div className="modal-footer">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Saving…':initial?.id?'Save workflow':'Create workflow'}</button>
      </div>
    </form>
  );
}

export default function Workflows() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const load = useCallback(async () => { const r = await axios.get('/api/workflows/templates'); setTemplates(r.data); setLoading(false); }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>⚡ Workflows</h1><p style={{ fontSize:13, color:'var(--text2)' }}>Automated actions triggered when a repair status changes</p></div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setModal(true); }}>+ New workflow</button>
      </div>
      <div style={{ background:'var(--accent-light)', border:'1px solid var(--accent)', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:13 }}>
        💡 Workflows run automatically when a repair status changes. Each step can create reminders, send notifications, change status, or assign a technician — with optional time delays.
      </div>
      {loading ? <Spinner /> : templates.length === 0 ? (
        <div className="card"><EmptyState icon="⚡" title="No workflows yet" body="Automate follow-ups, assignments, and status updates." action={<button className="btn btn-primary" onClick={() => setModal(true)}>Create first workflow</button>} /></div>
      ) : templates.map(t => (
        <div key={t.id} className="card" style={{ marginBottom:12, opacity:t.active?1:0.6 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:t.steps?.length?12:0 }}>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                <span style={{ fontWeight:700, fontSize:14 }}>{t.name}</span>
                <span style={{ fontSize:11, background:t.active?'var(--success-light)':'var(--bg3)', color:t.active?'var(--success)':'var(--text3)', padding:'2px 8px', borderRadius:10, fontWeight:600 }}>{t.active?'● Active':'○ Paused'}</span>
              </div>
              <div style={{ fontSize:12, color:'var(--text3)' }}>Triggers on → <strong>{t.trigger_status?.replace('_',' ')}</strong>{t.description&&` · ${t.description}`}</div>
            </div>
            <div className="flex" style={{ gap:6 }}>
              <button className="btn btn-sm" onClick={async () => { await axios.put(`/api/workflows/templates/${t.id}`, {...t, active:!t.active}); load(); }}>{t.active?'Pause':'Activate'}</button>
              <button className="btn btn-sm btn-icon" onClick={() => { setEditing(t); setModal(true); }}>✏️</button>
              <button className="btn btn-sm btn-icon btn-danger" onClick={() => setConfirm(t.id)}>🗑️</button>
            </div>
          </div>
          {t.steps?.length > 0 && <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>{t.steps.map((s,i)=><div key={i} style={{ fontSize:11, background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:6, padding:'4px 8px' }}>{s.delay_hours>0&&<span style={{ color:'var(--text3)', marginRight:4 }}>+{s.delay_hours}h</span>}{ACTION_TYPES.find(a=>a.value===s.action_type)?.label.split(' ').slice(0,2).join(' ')||s.action_type}</div>)}</div>}
        </div>
      ))}
      <Modal open={modal} onClose={() => { setModal(false); setEditing(null); }} title={editing?'Edit workflow':'New workflow'} large>
        <WorkflowForm initial={editing} onSave={() => { setModal(false); setEditing(null); load(); }} onClose={() => { setModal(false); setEditing(null); }} />
      </Modal>
      <ConfirmDialog open={!!confirm} message="Delete this workflow?" onConfirm={async () => { await axios.delete(`/api/workflows/templates/${confirm}`); setConfirm(null); load(); }} onCancel={() => setConfirm(null)} />
    </div>
  );
}
