import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Modal, Spinner, EmptyState, ConfirmDialog } from '../components/Shared';
import { format, startOfWeek, addDays, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, isToday, parseISO, addWeeks, subWeeks } from 'date-fns';

const STATUS_COLORS = {
  scheduled: { bg: 'var(--accent-light)', color: 'var(--accent)', border: 'var(--accent)' },
  completed: { bg: 'var(--success-light)', color: 'var(--success)', border: 'var(--success)' },
  cancelled: { bg: 'var(--danger-light)', color: 'var(--danger)', border: 'var(--danger)' },
  noshow: { bg: 'var(--warning-light)', color: 'var(--warning)', border: 'var(--warning)' },
};

function AppointmentForm({ initial, customers, onSave, onClose }) {
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0);
  const defaultEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0);

  const toLocalDateTime = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}T${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
  };

  const [form, setForm] = useState(initial ? {
    ...initial,
    start_time: toLocalDateTime(initial.start_time),
    end_time: toLocalDateTime(initial.end_time),
  } : {
    customer_id: '', title: 'Device Repair', description: '',
    device_type: '', device_brand: '', device_model: '',
    start_time: toLocalDateTime(defaultStart),
    end_time: toLocalDateTime(defaultEnd),
    notes: '', status: 'scheduled'
  });
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  // Auto-set end time 1hr after start
  const handleStartChange = (e) => {
    const val = e.target.value;
    setForm(f => {
      const start = new Date(val);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      return { ...f, start_time: val, end_time: toLocalDateTime(end) };
    });
  };

  const submit = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      if (initial?.id) await axios.put(`/api/appointments/${initial.id}`, form);
      else await axios.post('/api/appointments', form);
      onSave();
    } catch (err) { alert(err.response?.data?.error || 'Error saving appointment'); }
    setSaving(false);
  };

  return (
    <form onSubmit={submit}>
      <div className="form-group">
        <label>Customer</label>
        <select className="form-control" value={form.customer_id} onChange={set('customer_id')}>
          <option value="">Select customer…</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name} {c.phone ? `· ${c.phone}` : ''}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label>Title *</label>
        <input className="form-control" value={form.title} onChange={set('title')} required autoFocus />
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label>Start *</label>
          <input className="form-control" type="datetime-local" value={form.start_time} onChange={handleStartChange} required />
        </div>
        <div className="form-group">
          <label>End *</label>
          <input className="form-control" type="datetime-local" value={form.end_time} onChange={set('end_time')} required />
        </div>
      </div>
      <div style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10 }}>Device (optional)</div>
      <div className="grid-2">
        <div className="form-group"><label>Type</label>
          <select className="form-control" value={form.device_type} onChange={set('device_type')}>
            <option value="">Select…</option>
            {['Desktop','Laptop','Phone','Tablet','Server','Printer','Network Device','Other'].map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Brand</label><input className="form-control" value={form.device_brand} onChange={set('device_brand')} /></div>
        <div className="form-group"><label>Model</label><input className="form-control" value={form.device_model} onChange={set('device_model')} /></div>
      </div>
      <div className="form-group"><label>Description / problem</label><textarea className="form-control" value={form.description} onChange={set('description')} rows={2} /></div>
      <div className="form-group"><label>Notes</label><textarea className="form-control" value={form.notes} onChange={set('notes')} rows={2} /></div>
      {initial?.id && (
        <div className="form-group">
          <label>Status</label>
          <select className="form-control" value={form.status} onChange={set('status')}>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="noshow">No show</option>
          </select>
        </div>
      )}
      <div className="modal-footer">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : initial?.id ? 'Save changes' : 'Book appointment'}</button>
      </div>
    </form>
  );
}

function WeekView({ appointments, weekStart, onSelect, onNewAt }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: 13 }, (_, i) => i + 7); // 7am–7pm

  const getApptForSlot = (day, hour) =>
    appointments.filter(a => {
      const s = new Date(a.start_time);
      return isSameDay(s, day) && s.getHours() === hour;
    });

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 700, display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', fontSize: 12 }}>
        {/* Header row */}
        <div style={{ borderBottom: '1px solid var(--border)', padding: '6px 0' }} />
        {days.map(d => (
          <div key={d} style={{ borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)', padding: '6px 4px', textAlign: 'center', background: isToday(d) ? 'var(--accent-light)' : undefined }}>
            <div style={{ fontWeight: 600, color: isToday(d) ? 'var(--accent)' : 'var(--text)' }}>{format(d, 'EEE')}</div>
            <div style={{ color: isToday(d) ? 'var(--accent)' : 'var(--text3)' }}>{format(d, 'MMM d')}</div>
          </div>
        ))}
        {/* Time slots */}
        {hours.map(hour => (
          <React.Fragment key={hour}>
            <div style={{ borderBottom: '1px solid var(--border)', padding: '6px 4px', color: 'var(--text3)', textAlign: 'right', fontSize: 11 }}>
              {hour === 12 ? '12pm' : hour > 12 ? `${hour-12}pm` : `${hour}am`}
            </div>
            {days.map(d => {
              const appts = getApptForSlot(d, hour);
              return (
                <div key={d} onClick={() => onNewAt(d, hour)}
                  style={{ borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)', padding: '2px', minHeight: 44, cursor: 'pointer', background: isToday(d) ? 'var(--accent-light)' : undefined, opacity: 0.9 }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '0.9'}>
                  {appts.map(a => {
                    const sc = STATUS_COLORS[a.status] || STATUS_COLORS.scheduled;
                    return (
                      <div key={a.id} onClick={e => { e.stopPropagation(); onSelect(a); }}
                        style={{ background: sc.bg, color: sc.color, borderLeft: `3px solid ${sc.border}`, borderRadius: 4, padding: '2px 5px', marginBottom: 2, cursor: 'pointer', fontSize: 11, lineHeight: 1.3 }}>
                        <div style={{ fontWeight: 600 }}>{format(new Date(a.start_time), 'h:mm a')}</div>
                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.customer_name || a.linked_customer_name || a.title}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function GoogleSetup({ onClose }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [calendarId, setCalendarId] = useState('primary');

  useEffect(() => {
    axios.get('/api/appointments/google/status').then(r => {
      setStatus(r.data);
      setCalendarId(r.data.calendar_id || 'primary');
      setLoading(false);
    });
  }, []);

  const connect = async () => {
    const r = await axios.get('/api/appointments/google/auth-url');
    window.open(r.data.url, '_blank', 'width=500,height=600');
  };

  const disconnect = async () => {
    await axios.post('/api/appointments/google/disconnect');
    setStatus(s => ({ ...s, connected: false }));
  };

  const saveCalendar = async () => {
    await axios.put('/api/appointments/google/calendar', { calendar_id: calendarId });
    alert('Calendar ID saved');
  };

  if (loading) return <Spinner />;

  return (
    <div>
      {!status.configured ? (
        <div>
          <div style={{ background: 'var(--warning-light)', color: 'var(--warning)', padding: '12px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            <strong>Google credentials not configured.</strong> You need to add them to your docker-compose.yml environment variables.
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.8 }}>
            <strong>Step 1</strong> — Go to <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>console.cloud.google.com</a><br />
            <strong>Step 2</strong> — Create a project → Enable <strong>Google Calendar API</strong><br />
            <strong>Step 3</strong> — Go to <strong>APIs & Services → Credentials → Create OAuth 2.0 Client ID</strong><br />
            <strong>Step 4</strong> — Application type: <strong>Web application</strong><br />
            <strong>Step 5</strong> — Add authorized redirect URI:<br />
            <code style={{ background: 'var(--bg3)', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>http://YOUR-TRUENAS-IP:3000/api/appointments/google/callback</code><br />
            <strong>Step 6</strong> — Copy the Client ID and Client Secret<br />
            <strong>Step 7</strong> — Add to your docker-compose.yml:
          </div>
          <pre style={{ background: 'var(--bg3)', padding: 12, borderRadius: 8, fontSize: 12, marginTop: 10, overflowX: 'auto' }}>{`environment:
  - GOOGLE_CLIENT_ID=your_client_id
  - GOOGLE_CLIENT_SECRET=your_client_secret
  - GOOGLE_REDIRECT_URI=http://YOUR-TRUENAS-IP:3000/api/appointments/google/callback`}</pre>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 8 }}>Then redeploy: <code style={{ fontSize: 12 }}>docker compose up -d</code></div>
        </div>
      ) : status.connected ? (
        <div>
          <div style={{ background: 'var(--success-light)', color: 'var(--success)', padding: '12px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            ✓ Google Calendar is connected. Appointments will sync automatically.
          </div>
          <div className="form-group">
            <label>Calendar ID (use "primary" for your main calendar, or paste a specific calendar ID)</label>
            <div className="flex">
              <input className="form-control" value={calendarId} onChange={e => setCalendarId(e.target.value)} placeholder="primary" />
              <button className="btn btn-primary" onClick={saveCalendar}>Save</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Find calendar IDs in Google Calendar → Settings → your calendar → Calendar ID</div>
          </div>
          <button className="btn btn-danger btn-sm" onClick={disconnect}>Disconnect Google Calendar</button>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
            Google credentials are configured. Click below to authorize access to your Google Calendar.
          </div>
          <button className="btn btn-primary" onClick={connect}>
            🔗 Connect Google Calendar
          </button>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
            This opens a Google sign-in window. After authorizing, close the window and return here.
          </div>
        </div>
      )}
      <div className="modal-footer">
        <button className="btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export default function Appointments({ onNavigate, initialState }) {
  const [appointments, setAppointments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [googleModal, setGoogleModal] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [converting, setConverting] = useState(null);
  const [googleConnected, setGoogleConnected] = useState(false);

  const load = useCallback(async () => {
    const start = weekStart.toISOString();
    const end = addDays(weekStart, 7).toISOString();
    const [appts, cust, gStatus] = await Promise.all([
      axios.get(`/api/appointments?start=${start}&end=${end}`),
      axios.get('/api/customers'),
      axios.get('/api/appointments/google/status').catch(() => ({ data: {} }))
    ]);
    setAppointments(appts.data);
    setCustomers(cust.data);
    setGoogleConnected(gStatus.data.connected || false);
    setLoading(false);
  }, [weekStart]);

  useEffect(() => { load(); }, [load]);

  // Auto-open new appointment modal if triggered from customer page
  useEffect(() => {
    if (initialState?.newAppt && initialState?.customer && customers.length > 0) {
      const c = initialState.customer;
      setEditing({
        customer_id: c.id,
        customer_name: c.name,
        customer_phone: c.phone || '',
        customer_email: c.email || '',
        title: 'Device Repair',
      });
      setModal(true);
    }
  }, [initialState, customers]);

  const openNew = (day, hour) => {
    const start = new Date(day);
    start.setHours(hour || 9, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    setEditing({ start_time: fmt(start), end_time: fmt(end) });
    setModal(true);
  };

  const convertToRepair = async (appt) => {
    setConverting(appt.id);
    try {
      if (!appt.customer_id) {
        alert('Please link this appointment to a customer first by editing it.');
        setConverting(null);
        return;
      }
      const r = await axios.post(`/api/appointments/${appt.id}/convert`);
      load();
      onNavigate('repairs', { repairId: r.data.repair_id });
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
    setConverting(null);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Appointments</h1>
          <p>Week of {format(weekStart, 'MMM d, yyyy')}</p>
        </div>
        <div className="flex" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button className="btn" onClick={() => setWeekStart(w => subWeeks(w, 1))}>← Prev</button>
          <button className="btn" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>Today</button>
          <button className="btn" onClick={() => setWeekStart(w => addWeeks(w, 1))}>Next →</button>
          <button className={`btn ${googleConnected ? '' : 'btn-sm'}`} onClick={() => setGoogleModal(true)} style={{ color: googleConnected ? 'var(--success)' : undefined }}>
            {googleConnected ? '✓ Google Calendar' : '⚙️ Google Calendar'}
          </button>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setModal(true); }}>+ New appointment</button>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <WeekView
            appointments={appointments}
            weekStart={weekStart}
            onSelect={a => { setEditing(a); setModal(true); }}
            onNewAt={(day, hour) => openNew(day, hour)}
          />
        </div>
      )}

      {/* Upcoming list */}
      {!loading && appointments.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 14 }}>This week</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Time</th><th>Customer</th><th>Title</th><th>Device</th><th>Booked by</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {appointments.map(a => {
                  const sc = STATUS_COLORS[a.status] || STATUS_COLORS.scheduled;
                  return (
                    <tr key={a.id}>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 600 }}>{format(new Date(a.start_time), 'EEE MMM d')}</div>
                        <div style={{ color: 'var(--text3)' }}>{format(new Date(a.start_time), 'h:mm a')} – {format(new Date(a.end_time), 'h:mm a')}</div>
                      </td>
                      <td style={{ fontWeight: 500 }}>{a.customer_name || a.linked_customer_name || '—'}</td>
                      <td>{a.title}</td>
                      <td style={{ fontSize: 12, color: 'var(--text2)' }}>{[a.device_brand, a.device_model].filter(Boolean).join(' ') || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text3)' }}>{a.created_by_name || '—'}</td>
                      <td><span className="badge" style={{ background: sc.bg, color: sc.color }}>{a.status}</span></td>
                      <td>
                        <div className="flex">
                          <button className="btn btn-sm btn-primary" onClick={() => convertToRepair(a)} disabled={converting === a.id}>
                            {converting === a.id ? '…' : '→ Repair'}
                          </button>
                          <button className="btn btn-sm" onClick={() => { setEditing(a); setModal(true); }}>Edit</button>
                          <button className="btn btn-sm btn-icon btn-danger" onClick={() => setConfirm(a.id)}>
                            <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" strokeWidth="2" strokeLinecap="round" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" strokeWidth="2" strokeLinecap="round" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={modal} onClose={() => { setModal(false); setEditing(null); }} title={editing?.id ? 'Edit appointment' : 'New appointment'} large>
        <AppointmentForm initial={editing} customers={customers} onSave={() => { setModal(false); setEditing(null); load(); }} onClose={() => { setModal(false); setEditing(null); }} />
      </Modal>

      <Modal open={googleModal} onClose={() => { setGoogleModal(false); load(); }} title="Google Calendar setup" large>
        <GoogleSetup onClose={() => { setGoogleModal(false); load(); }} />
      </Modal>

      <ConfirmDialog open={!!confirm} message="Delete this appointment? It will also be removed from Google Calendar." onConfirm={async () => { await axios.delete(`/api/appointments/${confirm}`); setConfirm(null); load(); }} onCancel={() => setConfirm(null)} />
    </div>
  );
}
