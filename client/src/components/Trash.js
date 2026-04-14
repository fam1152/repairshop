import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { Spinner, EmptyState } from './Shared';

const SECTIONS = [
  { key: 'repairs',   label: 'Repairs',   icon: '🔧', endpoint: '/api/repairs/trash/list',   restore: id => axios.post(`/api/repairs/${id}/restore`) },
  { key: 'customers', label: 'Customers', icon: '👤', endpoint: '/api/customers/trash/list', restore: id => axios.post(`/api/customers/${id}/restore`) },
  { key: 'invoices',  label: 'Invoices',  icon: '🧾', endpoint: '/api/invoices/trash/list',  restore: id => axios.post(`/api/invoices/${id}/restore`) },
  { key: 'estimates', label: 'Estimates', icon: '📋', endpoint: '/api/estimates/trash/list', restore: id => axios.post(`/api/estimates/${id}/restore`) },
];

function TrashSection({ section, onRestored }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    axios.get(section.endpoint)
      .then(r => setItems(r.data))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [section.endpoint]);

  useEffect(() => { load(); }, [load]);

  const restore = async (item) => {
    setRestoring(item.id);
    try {
      await section.restore(item.id);
      load();
      onRestored(section.label, item);
    } catch(e) {
      alert('Restore failed: ' + (e.response?.data?.error || e.message));
    }
    setRestoring(null);
  };

  const getLabel = (item) => {
    return item.title || item.name || item.invoice_number ||
           item.estimate_number || item.customer_name || item.id;
  };

  const getSub = (item) => {
    const parts = [];
    if (item.customer_name && item.customer_name !== item.name) parts.push(item.customer_name);
    if (item.status) parts.push(item.status);
    if (item.total) parts.push(`$${item.total.toFixed(2)}`);
    if (item.device_brand || item.device_model) parts.push([item.device_brand, item.device_model].filter(Boolean).join(' '));
    return parts.join(' · ');
  };

  if (loading) return <div style={{ padding: '12px 0' }}><Spinner /></div>;

  if (items.length === 0) {
    return (
      <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
        No deleted {section.label.toLowerCase()}
      </div>
    );
  }

  return (
    <div>
      {items.map(item => (
        <div key={item.id} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 14px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg2)',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{getLabel(item)}</div>
            {getSub(item) && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{getSub(item)}</div>}
            <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 2 }}>
              Deleted {item.deleted_at ? format(new Date(item.deleted_at), 'MMM d, yyyy h:mm a') : 'recently'}
            </div>
          </div>
          <button
            className="btn btn-sm"
            onClick={() => restore(item)}
            disabled={restoring === item.id}
            style={{ background: 'var(--success-light)', color: 'var(--success)', borderColor: 'var(--success)', whiteSpace: 'nowrap' }}>
            {restoring === item.id ? '…' : '↩ Restore'}
          </button>
        </div>
      ))}
    </div>
  );
}

export default function Trash({ onClose }) {
  const [activeSection, setActiveSection] = useState('repairs');
  const [toast, setToast] = useState(null);

  const handleRestored = (sectionLabel, item) => {
    const label = item.title || item.name || item.invoice_number || 'Item';
    setToast(`✓ ${label} restored to ${sectionLabel}`);
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: 'var(--success)', color: '#fff',
          padding: '10px 18px', borderRadius: 8, fontWeight: 600, fontSize: 13,
          boxShadow: '0 4px 12px rgba(0,0,0,.2)',
          animation: 'slideIn .2s ease',
        }}>
          {toast}
          <style>{`@keyframes slideIn{from{transform:translateX(40px);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>
        </div>
      )}

      <div style={{ background: 'var(--warning-light)', border: '1px solid var(--warning)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--warning)' }}>
        🗑️ <strong>Recycle bin</strong> — items here were soft-deleted and can be restored. Hard deletion is permanent and not shown here.
      </div>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 0, borderBottom: '1px solid var(--border)' }}>
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setActiveSection(s.key)}
            style={{
              padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: 'none', borderBottom: activeSection === s.key ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeSection === s.key ? 'var(--accent)' : 'var(--text2)',
              marginBottom: -1,
            }}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden', minHeight: 100 }}>
        {SECTIONS.map(s => (
          s.key === activeSection && (
            <TrashSection key={s.key} section={s} onRestored={handleRestored} />
          )
        ))}
      </div>
    </div>
  );
}
