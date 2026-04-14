import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef();

  const load = useCallback(async () => {
    try {
      const [notifs, cnt] = await Promise.all([
        axios.get('/api/notifications'),
        axios.get('/api/notifications/count'),
      ]);
      setNotifications(notifs.data);
      setCount(cnt.data.count);
    } catch(e) {}
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  // Close on outside click
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const dismiss = async (id, e) => {
    e.stopPropagation();
    await axios.delete(`/api/notifications/${id}`);
    setNotifications(prev => prev.filter(n => n.id !== id));
    setCount(prev => Math.max(0, prev - 1));
  };

  const markRead = async (id) => {
    await axios.patch(`/api/notifications/${id}/read`);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: 1 } : n));
    setCount(prev => Math.max(0, prev - 1));
  };

  const clearAll = async () => {
    await axios.delete('/api/notifications');
    setNotifications([]);
    setCount(0);
  };

  const markAllRead = async () => {
    await axios.post('/api/notifications/read-all');
    setNotifications(prev => prev.map(n => ({ ...n, read: 1 })));
    setCount(0);
  };

  const TYPE_ICONS = { info: 'ℹ️', warning: '⚠️', success: '✓', error: '❌', assignment: '👤', stock: '📦', reminder: '⏰', workflow: '⚡' };
  const TYPE_COLORS = { info: 'var(--accent)', warning: 'var(--warning)', success: 'var(--success)', error: 'var(--danger)', assignment: 'var(--purple)', stock: 'var(--warning)', reminder: 'var(--accent)', workflow: 'var(--teal, #0d9488)' };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'relative', width: 36, height: 36, borderRadius: '50%',
          border: '1px solid var(--border)', background: open ? 'var(--bg3)' : 'var(--bg2)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, transition: 'background .15s',
        }}>
        🔔
        {count > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2,
            background: 'var(--danger)', color: '#fff',
            borderRadius: '50%', width: 16, height: 16,
            fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1.5px solid var(--bg)',
          }}>{count > 9 ? '9+' : count}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 44, right: 0, zIndex: 1000,
          width: 340, maxHeight: 480, background: 'var(--bg2)',
          border: '1px solid var(--border)', borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>🔔 Notifications {count > 0 && <span style={{ background: 'var(--danger)', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, marginLeft: 4 }}>{count}</span>}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {count > 0 && <button onClick={markAllRead} className="btn btn-sm" style={{ fontSize: 11, padding: '3px 8px' }}>Mark all read</button>}
              {notifications.length > 0 && <button onClick={clearAll} className="btn btn-sm btn-danger" style={{ fontSize: 11, padding: '3px 8px' }}>Clear all</button>}
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                No notifications
              </div>
            ) : notifications.map(n => (
              <div key={n.id} onClick={() => markRead(n.id)} style={{
                padding: '10px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                background: n.read ? 'transparent' : 'var(--accent-light)',
                display: 'flex', gap: 10, alignItems: 'flex-start',
                transition: 'background .15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
              onMouseLeave={e => e.currentTarget.style.background = n.read ? 'transparent' : 'var(--accent-light)'}>
                <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{TYPE_ICONS[n.type] || 'ℹ️'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: n.read ? 400 : 700, fontSize: 13, color: TYPE_COLORS[n.type] || 'var(--text)' }}>{n.title}</div>
                  {n.body && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, lineHeight: 1.4 }}>{n.body}</div>}
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>{new Date(n.created_at).toLocaleString()}</div>
                </div>
                <button onClick={e => dismiss(n.id, e)} style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, lineHeight: 1, padding: '2px 4px' }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
