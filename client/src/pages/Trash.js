import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Spinner, EmptyState } from '../components/Shared';
import { format } from 'date-fns';

const SECTIONS = [
  { id: 'repairs',   label: '🔧 Repairs',   endpoint: '/api/repairs/trash/list',   restore: (id) => axios.post(`/api/repairs/${id}/restore`) },
  { id: 'customers', label: '👤 Customers',  endpoint: '/api/customers/trash/list', restore: (id) => axios.post(`/api/customers/${id}/restore`) },
  { id: 'invoices',  label: '🧾 Invoices',   endpoint: '/api/invoices/trash/list',  restore: (id) => axios.post(`/api/invoices/${id}/restore`) },
  { id: 'estimates', label: '📋 Estimates',  endpoint: '/api/estimates/trash/list', restore: (id) => axios.post(`/api/estimates/${id}/restore`) },
];

function TrashSection({ section, onRestored }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(section.endpoint);
      setItems(r.data);
    } catch(e) { setItems([]); }
    setLoading(false);
  }, [section.endpoint]);

  useEffect(() => { load(); }, [load]);

  const restore = async (item) => {
    setRestoring(item.id);
    try {
      await section.restore(item.id);
      await load();
      onRestored(section.id, item);
    } catch(e) {
      alert('Restore failed: ' + (e.response?.data?.error || e.message));
    }
    setRestoring(null);
  };

  if (loading) return <div style={{ padding: '20px 0' }}><Spinner /></div>;

  if (items.length === 0) return (
    <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
      No deleted {section.id} — trash is empty
    </div>
  );

  return (
    <div>
      {items.map(item => {
        const label = item.customer_name || item.name || item.title || item.invoice_number || item.id;
        const sub = item.status ? `Status: ${item.status}` : item.email || item.issued_date?.split('T')[0] || '';
        const deletedAt = item.deleted_at ? format(new Date(item.deleted_at), 'MMM d, yyyy h:mm a') : '';

        return (
          <div key={item.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 14px', borderRadius: 8,
            background: 'var(--bg3)', marginBottom: 8,
            border: '1px solid var(--border)',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
              {sub && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{sub}</div>}
              <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 2 }}>
                Deleted {deletedAt}
              </div>
            </div>
            <button
              className="btn btn-sm"
              style={{ background: 'var(--success-light)', color: 'var(--success)', borderColor: 'var(--success)', whiteSpace: 'nowrap' }}
              onClick={() => restore(item)}
              disabled={restoring === item.id}>
              {restoring === item.id ? '…' : '↩ Restore'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default function Trash({ onNavigate }) {
  const [tab, setTab] = useState('repairs');
  const [toast, setToast] = useState(null);

  const handleRestored = (type, item) => {
    const label = item.customer_name || item.name || item.title || item.invoice_number || 'Item';
    setToast(`✓ ${label} restored`);
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>🗑️ Trash</h1>
          <p style={{ fontSize: 13, color: 'var(--text2)' }}>
            Deleted items — restore anything within 30 days
          </p>
        </div>
        <button className="btn btn-sm btn-danger" onClick={async () => {
          if (!window.confirm('Permanently delete ALL items in trash? This cannot be undone.')) return;
          try {
            await Promise.all([
              axios.post('/api/repairs/trash/empty'),
              axios.post('/api/customers/trash/empty'),
              axios.post('/api/invoices/trash/empty'),
              axios.post('/api/estimates/trash/empty'),
            ]);
            window.location.reload();
          } catch(e) { alert('Error emptying trash'); }
        }}>🗑️ Empty trash</button>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: 'var(--success)', color: '#fff',
          padding: '10px 18px', borderRadius: 8, fontWeight: 600, fontSize: 13,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          animation: 'slideUp .2s ease',
        }}>
          {toast}
          <style>{`@keyframes slideUp{from{transform:translateY(8px);opacity:0}to{transform:none;opacity:1}}`}</style>
        </div>
      )}

      <div className="tabs">
        {SECTIONS.map(s => (
          <button key={s.id} className={`tab ${tab === s.id ? 'active' : ''}`} onClick={() => setTab(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14, padding: '8px 12px', background: 'var(--warning-light)', borderRadius: 6, border: '1px solid var(--warning)' }}>
          ⚠️ Restoring an item brings it back exactly as it was. Permanently deleted items cannot be recovered.
        </div>
        {SECTIONS.filter(s => s.id === tab).map(section => (
          <TrashSection key={section.id} section={section} onRestored={handleRestored} />
        ))}
      </div>
    </div>
  );
}
