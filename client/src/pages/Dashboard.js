import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { StatusBadge, Spinner } from '../components/Shared';
import { BusinessInsights, AIStatusBadge } from '../components/AIAssistant';
import { format } from 'date-fns';

const icons = {
  intake: '📥', diagnosing: '🔍', waiting_parts: '📦', in_repair: '🔧', ready: '✅', completed: '🏁', cancelled: '❌'
};

export default function Dashboard({ onNavigate }) {
  const [stats, setStats] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [recentRepairs, setRecentRepairs] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [showInsights, setShowInsights] = useState(false);
  const [logCallModal, setLogCallModal] = useState(false);
  const [callSearch, setCallSearch] = useState('');
  const [callCustomers, setCallCustomers] = useState([]);
  const [callCustomer, setCallCustomer] = useState(null);
  const [callNotes, setCallNotes] = useState('');
  const [callOutcome, setCallOutcome] = useState('');
  const [callSaving, setCallSaving] = useState(false);

  const searchCallCustomers = async (q) => {
    if (!q.trim()) { setCallCustomers([]); return; }
    try {
      const r = await axios.get('/api/customers?q=' + encodeURIComponent(q));
      setCallCustomers(r.data.slice(0, 8));
    } catch(e) {}
  };

  const saveCall = async () => {
    if (!callCustomer || !callNotes.trim()) return;
    setCallSaving(true);
    try {
      await axios.post('/api/customers/' + callCustomer.id + '/calls', { direction: 'inbound', notes: callNotes, outcome: callOutcome });
      setLogCallModal(false); setCallSearch(''); setCallCustomers([]); setCallCustomer(null); setCallNotes(''); setCallOutcome('');
    } catch(e) { alert('Error logging call'); }
    setCallSaving(false);
  };
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [aiGreeting, setAiGreeting] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [clock, setClock] = useState(new Date());
  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);

  const loadNotifications = React.useCallback(() => {
    axios.get('/api/notifications').then(r => {
      setNotifications(r.data);
      setNotifCount(r.data.filter(n => !n.read).length);
    }).catch(() => {});
  }, []);

  React.useEffect(() => {
    loadNotifications();
    const t = setInterval(loadNotifications, 30000);
    return () => clearInterval(t);
  }, [loadNotifications]);

  const dismissAll = async () => {
    await axios.delete('/api/notifications');
    setNotifications([]);
    setNotifCount(0);
    setNotifOpen(false);
  };

  const markAllRead = async () => {
    await axios.post('/api/notifications/read-all');
    setNotifications(prev => prev.map(n => ({...n, read: 1})));
    setNotifCount(0);
  };

  const dismissOne = async (id) => {
    await axios.delete('/api/notifications/' + id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    setNotifCount(prev => Math.max(0, prev - 1));
  };

  // Live clock
  React.useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // AI greeting on load
  React.useEffect(() => {
    axios.post('/api/chat/greeting').then(r => setAiGreeting(r.data.greeting)).catch(() => {});
  }, []);

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatLoading(true);
    setChatMessages(prev => [...prev, { id: Date.now(), sender: 'You', text: msg, isMe: true }]);
    try {
      const r = await axios.post('/api/chat/ai', { message: msg });
      setChatMessages(prev => [...prev, { id: Date.now()+1, sender: 'RepairBot', text: r.data.aiMessage?.message || '…', isMe: false }]);
    } catch(e) {
      setChatMessages(prev => [...prev, { id: Date.now()+1, sender: 'RepairBot', text: 'Sorry, I could not connect right now.', isMe: false }]);
    }
    setChatLoading(false);
  };
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      axios.get('/api/repairs/stats'),
      axios.get('/api/reminders/pending'),
      axios.get('/api/repairs?'),
      axios.get('/api/inventory?low_stock=1')
    ]).then(([s, r, rep, inv]) => {
      setStats(s.data);
      setReminders(r.data.slice(0, 5));
      setRecentRepairs(rep.data.slice(0, 8));
      setLowStock(inv.data.slice(0, 6));
    }).finally(() => setLoading(false));
  }, []);

  const dismissReminder = async (id) => {
    await axios.put(`/api/reminders/${id}/dismiss`);
    setReminders(r => r.filter(x => x.id !== id));
  };

  if (loading) return <div className="page"><Spinner /></div>;

  const statusOrder = ['intake', 'diagnosing', 'waiting_parts', 'in_repair', 'ready', 'completed', 'cancelled'];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p style={{ fontFamily: 'monospace', fontSize: 14, letterSpacing: '.03em' }}>
            {clock.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' })}
            {' · '}
            {clock.toLocaleTimeString('en-US', { hour12: true, hour:'2-digit', minute:'2-digit', second:'2-digit' })}
          </p>
          {aiGreeting && <p style={{ fontSize: 15, color: 'var(--purple)', marginTop: 4, fontWeight: 500, lineHeight: 1.5 }}>🤖 {aiGreeting}</p>}
        </div>
        <div className="flex" style={{ gap: 8 }}>
          <AIStatusBadge onClick={() => setShowInsights(s => !s)} />
          <button className="btn btn-sm" onClick={() => setLogCallModal(true)}>📞 Log call</button>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-sm" onClick={() => { setNotifOpen(o => !o); markAllRead(); }} style={{ position: 'relative' }}>
              🔔
              {notifCount > 0 && (
                <span style={{ position: 'absolute', top: -6, right: -6, background: 'var(--danger)', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {notifCount > 9 ? '9+' : notifCount}
                </span>
              )}
            </button>
            {notifOpen && (
              <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 200, width: 320, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', marginTop: 4 }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>🔔 Notifications</span>
                  <div className="flex" style={{ gap: 6 }}>
                    <button className="btn btn-sm" style={{ fontSize: 11 }} onClick={markAllRead}>Mark all read</button>
                    <button className="btn btn-sm btn-danger" style={{ fontSize: 11 }} onClick={dismissAll}>Clear all</button>
                    <button className="btn btn-sm btn-icon" onClick={() => setNotifOpen(false)}>✕</button>
                  </div>
                </div>
                <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>No notifications</div>
                  ) : notifications.map(n => (
                    <div key={n.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, background: n.read ? 'transparent' : 'var(--accent-light)', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: n.read ? 400 : 600, fontSize: 13 }}>{n.title}</div>
                        {n.body && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{n.body}</div>}
                      </div>
                      <button className="btn btn-sm btn-icon" style={{ fontSize: 11, flexShrink: 0 }} onClick={() => dismissOne(n.id)}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button className="btn btn-sm" style={{ background: showChat ? 'var(--purple-light)' : undefined, color: showChat ? 'var(--purple)' : undefined }} onClick={() => setShowChat(s => !s)}>💬 Chat</button>
          <button className="btn btn-primary" onClick={() => onNavigate('repairs', { newRepair: true })}>
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeWidth="2.5" strokeLinecap="round"/></svg>
            New Repair
          </button>
        </div>
      </div>

      {showInsights && (
        <div style={{ marginBottom: 20 }}>
          <BusinessInsights />
        </div>
      )}

      {showChat && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>💬 Quick chat with RepairBot</div>
          <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {chatMessages.length === 0 && <div style={{ color: 'var(--text3)', fontSize: 13 }}>Ask RepairBot anything about your shop…</div>}
            {chatMessages.map(m => (
              <div key={m.id} style={{ display: 'flex', gap: 8, flexDirection: m.isMe ? 'row-reverse' : 'row' }}>
                <div style={{ padding: '6px 10px', borderRadius: m.isMe ? '10px 2px 10px 10px' : '2px 10px 10px 10px', background: m.isMe ? 'var(--accent)' : 'var(--bg3)', color: m.isMe ? '#fff' : 'var(--text)', fontSize: 13, maxWidth: '80%' }}>
                  {m.text}
                </div>
              </div>
            ))}
            {chatLoading && <div style={{ color: 'var(--text3)', fontSize: 12 }}>🤖 RepairBot is thinking…</div>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-control" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()} placeholder="Ask RepairBot…" style={{ flex: 1 }} />
            <button className="btn btn-primary btn-sm" onClick={sendChat} disabled={!chatInput.trim() || chatLoading}>Send</button>
          </div>
        </div>
      )}

      {/* Reminder banners */}
      {reminders.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 16 }}>⏰</span>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Follow-up reminders due</span>
            <span style={{ background: 'var(--warning)', color: '#fff', borderRadius: 20, padding: '1px 8px', fontSize: 12, fontWeight: 700 }}>{reminders.length}</span>
          </div>
          {reminders.map(r => (
            <div key={r.id} className="reminder-banner" style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 14 }}>📞</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600 }}>{r.customer_name}</span>
                {r.repair_title && <span style={{ color: 'var(--text2)', fontSize: 12 }}> — {r.repair_title}</span>}
                <div style={{ fontSize: 12, color: 'var(--warning)', marginTop: 2 }}>{r.message || 'Follow-up due'}</div>
              </div>
              <button className="btn btn-sm" onClick={() => dismissReminder(r.id)} style={{ whiteSpace: 'nowrap' }}>Dismiss</button>
              <button className="btn btn-sm btn-primary" onClick={() => onNavigate('customers', { customerId: r.customer_id })} style={{ whiteSpace: 'nowrap' }}>View</button>
            </div>
          ))}
        </div>
      )}

      {/* Repair stats only — no money */}
      <div className="grid-stat" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">This month</div>
          <div className="stat-value">{stats?.monthly ?? 0}</div>
          <div className="stat-sub">repairs opened</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">This year</div>
          <div className="stat-value">{stats?.yearly ?? 0}</div>
          <div className="stat-sub">repairs total</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total repairs</div>
          <div className="stat-value">{stats?.total ?? 0}</div>
          <div className="stat-sub">all time</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Open repairs</div>
          <div className="stat-value" style={{ color: (stats?.statusCounts?.intake ?? 0) + (stats?.statusCounts?.in_repair ?? 0) + (stats?.statusCounts?.diagnosing ?? 0) + (stats?.statusCounts?.waiting_parts ?? 0) > 0 ? 'var(--warning)' : 'var(--success)' }}>
            {(stats?.statusCounts?.intake ?? 0) + (stats?.statusCounts?.in_repair ?? 0) + (stats?.statusCounts?.diagnosing ?? 0) + (stats?.statusCounts?.waiting_parts ?? 0)}
          </div>
          <div className="stat-sub">in progress</div>
        </div>
      </div>

      {/* Status breakdown */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 14 }}>Repairs by status</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
          {statusOrder.map(s => (
            <button key={s} onClick={() => onNavigate('repairs', { filterStatus: s })}
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 10px', textAlign: 'center', cursor: 'pointer', transition: 'all .15s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{icons[s]}</div>
              <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1 }}>{stats?.statusCounts?.[s] ?? 0}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, textTransform: 'capitalize' }}>{s.replace('_', ' ')}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Recent repairs */}
      <div className="card">
        <div className="flex-between" style={{ marginBottom: 14 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Recent repairs</span>
          <button className="btn btn-sm" onClick={() => onNavigate('repairs')}>View all</button>
        </div>
        {recentRepairs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text3)' }}>No repairs yet</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Customer</th><th>Device</th><th>Title</th><th>Status</th><th>Date</th>
              </tr></thead>
              <tbody>
                {recentRepairs.map(r => (
                  <tr key={r.id} className="clickable-row" onClick={() => onNavigate('repairs', { repairId: r.id })}>
                    <td style={{ fontWeight: 500 }}>{r.customer_name}</td>
                    <td style={{ color: 'var(--text2)' }}>{[r.device_brand, r.device_model].filter(Boolean).join(' ') || '—'}</td>
                    <td>{r.title}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td style={{ color: 'var(--text3)', fontSize: 12 }}>{format(new Date(r.created_at), 'MMM d')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Low stock alert widget */}
      {lowStock.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="flex-between" style={{ marginBottom: 14 }}>
            <div className="flex">
              <span style={{ fontSize: 16 }}>📦</span>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Low / out of stock</span>
              <span style={{ background: 'var(--danger)', color: '#fff', borderRadius: 20, padding: '1px 8px', fontSize: 12, fontWeight: 700 }}>{lowStock.length}</span>
            </div>
            <button className="btn btn-sm" onClick={() => onNavigate('inventory', { lowOnly: true })}>View all</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Item</th><th>Category</th><th>Stock</th><th>Status</th></tr></thead>
              <tbody>
                {lowStock.map(item => (
                  <tr key={item.id} className="clickable-row" onClick={() => onNavigate('inventory')}>
                    <td style={{ fontWeight: 500 }}>{item.name}</td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>{item.category}</td>
                    <td style={{ fontWeight: 700, color: item.quantity === 0 ? 'var(--danger)' : 'var(--warning)' }}>{item.quantity}</td>
                    <td>
                      {item.quantity === 0
                        ? <span className="badge" style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>Out of stock</span>
                        : <span className="badge" style={{ background: 'var(--warning-light)', color: 'var(--warning)' }}>Low stock</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Log Call Modal */}
      {logCallModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setLogCallModal(false); }}>
          <div className="modal">
            <div className="modal-header">
              <h2>📞 Log a call</h2>
              <button className="btn btn-icon btn-sm" onClick={() => setLogCallModal(false)}>✕</button>
            </div>
            <div style={{ padding: '0 24px 24px' }}>
              {!callCustomer ? (
                <div>
                  <div className="form-group">
                    <label>Search customer by name or phone</label>
                    <input className="form-control" value={callSearch} autoFocus
                      onChange={e => { setCallSearch(e.target.value); searchCallCustomers(e.target.value); }}
                      placeholder="Type name or phone…" />
                  </div>
                  {callCustomers.map(c => (
                    <div key={c.id} onClick={() => setCallCustomer(c)} style={{ padding: '10px 12px', background: 'var(--bg3)', borderRadius: 8, marginBottom: 6, cursor: 'pointer', border: '1px solid var(--border)' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor='var(--accent)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)' }}>{c.phone}{c.email ? ' · ' + c.email : ''}</div>
                    </div>
                  ))}
                  {callSearch && callCustomers.length === 0 && <div style={{ color: 'var(--text3)', fontSize: 13, padding: 8 }}>No customers found</div>}
                </div>
              ) : (
                <div>
                  <div style={{ background: 'var(--accent-light)', border: '1px solid var(--accent)', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
                    <div style={{ fontWeight: 600 }}>{callCustomer.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>{callCustomer.phone}</div>
                    <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => setCallCustomer(null)}>Change customer</button>
                  </div>
                  <div className="form-group"><label>Call notes *</label><textarea className="form-control" value={callNotes} onChange={e => setCallNotes(e.target.value)} rows={3} placeholder="What was discussed?" autoFocus /></div>
                  <div className="form-group"><label>Outcome</label><input className="form-control" value={callOutcome} onChange={e => setCallOutcome(e.target.value)} placeholder="Left voicemail, will call back, etc." /></div>
                  <div className="modal-footer">
                    <button className="btn" onClick={() => setLogCallModal(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={saveCall} disabled={callSaving || !callNotes.trim()}>{callSaving ? 'Saving…' : 'Log call'}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
