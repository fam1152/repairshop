import React from 'react';

export function StatusBadge({ status }) {
  const labels = { intake:'Intake', diagnosing:'Diagnosing', waiting_parts:'Waiting Parts', in_repair:'In Repair', ready:'Ready', completed:'Completed', cancelled:'Cancelled', draft:'Draft', sent:'Sent', paid:'Paid' };
  return <span className={`badge badge-${status}`}>{labels[status] || status}</span>;
}

export function Modal({ open, onClose, title, children, large }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${large ? 'modal-lg' : ''}`}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="btn btn-icon btn-sm" onClick={onClose} style={{marginLeft:'auto'}}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Spinner() {
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:'40px'}}>
      <div style={{width:28,height:28,border:'3px solid var(--border)',borderTopColor:'var(--accent)',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export function EmptyState({ icon, title, body, action }) {
  return (
    <div style={{textAlign:'center',padding:'48px 24px',color:'var(--text3)'}}>
      <div style={{fontSize:40,marginBottom:12}}>{icon}</div>
      <div style={{fontSize:15,fontWeight:600,color:'var(--text2)',marginBottom:6}}>{title}</div>
      {body && <div style={{fontSize:13,marginBottom:16}}>{body}</div>}
      {action}
    </div>
  );
}

export function ConfirmDialog({ open, message, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="modal-overlay">
      <div className="modal" style={{maxWidth:380}}>
        <div style={{marginBottom:16,fontSize:15}}>{message}</div>
        <div className="modal-footer">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

export function SearchBar({ value, onChange, placeholder }) {
  return (
    <div className="search-bar">
      <svg width="14" height="14" fill="none" stroke="var(--text3)" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35" strokeWidth="2" strokeLinecap="round"/></svg>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder||'Search…'} />
      {value && <button style={{border:'none',background:'none',cursor:'pointer',color:'var(--text3)',padding:0,lineHeight:1}} onClick={()=>onChange('')}>✕</button>}
    </div>
  );
}

export const REPAIR_STATUSES = ['intake','diagnosing','waiting_parts','in_repair','ready','completed','cancelled'];
export const STATUS_LABELS = { intake:'Intake', diagnosing:'Diagnosing', waiting_parts:'Waiting Parts', in_repair:'In Repair', ready:'Ready', completed:'Completed', cancelled:'Cancelled' };

/**
 * Formats a string of digits to XXX-XXX-XXXX
 */
export function formatPhoneNumber(val) {
  if (!val) return '';
  const cleaned = val.toString().replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return val; // Return original if not 10 digits
}
