import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Spinner, EmptyState } from '../components/Shared';
import { format, isPast } from 'date-fns';

const TYPE_LABELS = { followup: '📞 Follow-up', parts: '📦 Parts', pickup: '✅ Pickup', warranty: '🛡️ Warranty', other: '📌 Other' };

export default function Reminders() {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');

  const load = useCallback(async () => {
    const r = await axios.get(`/api/reminders${filter ? `?status=${filter}` : ''}`);
    setReminders(r.data);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const dismiss = async (id) => { await axios.put(`/api/reminders/${id}/dismiss`); load(); };
  const complete = async (id) => { await axios.put(`/api/reminders/${id}/complete`); load(); };
  const remove = async (id) => { await axios.delete(`/api/reminders/${id}`); load(); };

  const overdue = reminders.filter(r => isPast(new Date(r.due_date)) && r.status === 'pending');
  const upcoming = reminders.filter(r => !isPast(new Date(r.due_date)) && r.status === 'pending');
  const done = reminders.filter(r => r.status !== 'pending');

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Reminders</h1>
          {overdue.length > 0 && <p style={{ color: 'var(--warning)', fontWeight: 600 }}>⚠️ {overdue.length} overdue</p>}
        </div>
        <select className="form-control" style={{ width: 'auto' }} value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="pending">Pending</option>
          <option value="">All</option>
          <option value="completed">Completed</option>
          <option value="dismissed">Dismissed</option>
        </select>
      </div>

      {loading ? <Spinner /> : reminders.length === 0 ? (
        <EmptyState icon="⏰" title="No reminders" body="Set reminders from repair tickets to follow up with customers." />
      ) : (
        <div>
          {overdue.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--danger)', marginBottom: 10 }}>Overdue</div>
              {overdue.map(r => <ReminderCard key={r.id} r={r} onDismiss={dismiss} onComplete={complete} onDelete={remove} />)}
            </div>
          )}
          {upcoming.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', marginBottom: 10 }}>Upcoming</div>
              {upcoming.map(r => <ReminderCard key={r.id} r={r} onDismiss={dismiss} onComplete={complete} onDelete={remove} />)}
            </div>
          )}
          {done.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', marginBottom: 10 }}>Done</div>
              {done.map(r => <ReminderCard key={r.id} r={r} onDismiss={dismiss} onComplete={complete} onDelete={remove} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReminderCard({ r, onDismiss, onComplete, onDelete }) {
  const overdue = isPast(new Date(r.due_date)) && r.status === 'pending';
  return (
    <div className="card card-sm" style={{ marginBottom: 8, borderLeft: `3px solid ${overdue ? 'var(--danger)' : r.status === 'completed' ? 'var(--success)' : r.status === 'dismissed' ? 'var(--border)' : 'var(--warning)'}` }}>
      <div className="flex-between">
        <div>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{r.customer_name}</span>
          <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 8 }}>{TYPE_LABELS[r.type] || r.type}</span>
          {r.repair_title && <span style={{ fontSize: 12, color: 'var(--text2)', marginLeft: 8 }}>— {r.repair_title}</span>}
        </div>
        <span style={{ fontSize: 11, color: overdue ? 'var(--danger)' : 'var(--text3)', fontWeight: overdue ? 700 : 400, whiteSpace: 'nowrap' }}>
          {overdue ? '⚠️ ' : ''}{format(new Date(r.due_date), 'MMM d, yyyy')}
        </span>
      </div>
      {r.message && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{r.message}</div>}
      {r.customer_phone && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>📞 {r.customer_phone}</div>}
      {r.status === 'pending' && (
        <div className="flex" style={{ marginTop: 10 }}>
          <button className="btn btn-sm btn-primary" onClick={() => onComplete(r.id)}>✓ Done</button>
          <button className="btn btn-sm" onClick={() => onDismiss(r.id)}>Dismiss</button>
          <button className="btn btn-sm btn-danger" onClick={() => onDelete(r.id)}>Delete</button>
        </div>
      )}
      {r.status !== 'pending' && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, textTransform: 'capitalize' }}>{r.status}</div>}
    </div>
  );
}
