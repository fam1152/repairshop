import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { Spinner } from './Shared';

function Avatar({ user, size = 36 }) {
  const initials = (user?.display_name || user?.username || '?').slice(0, 2).toUpperCase();
  const colors = ['#2563eb','#7c3aed','#059669','#d97706','#dc2626','#0891b2'];
  const color = colors[(user?.username?.charCodeAt(0) || 0) % colors.length];

  if (user?.avatar_url) {
    return (
      <img src={user.avatar_url} alt={user.display_name || user.username}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)' }} />
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: Math.round(size * 0.38), flexShrink: 0 }}>
      {initials}
    </div>
  );
}

export { Avatar };

function UserCard({ user, currentUser, onEdit, onDelete, onResetPassword }) {
  const isMe = user.id === currentUser.id;
  return (
    <div className="card card-sm" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 14 }}>
      <Avatar user={user} size={44} />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{user.display_name || user.username}</span>
          {user.username !== user.display_name && <span style={{ fontSize: 12, color: 'var(--text3)' }}>@{user.username}</span>}
          <span className="badge" style={{ background: user.role === 'admin' ? 'var(--purple-light)' : 'var(--bg3)', color: user.role === 'admin' ? 'var(--purple)' : 'var(--text2)', fontSize: 10 }}>{user.role}</span>
          {!user.active && <span className="badge" style={{ background: 'var(--danger-light)', color: 'var(--danger)', fontSize: 10 }}>Inactive</span>}
          {isMe && <span className="badge" style={{ background: 'var(--accent-light)', color: 'var(--accent)', fontSize: 10 }}>You</span>}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>Joined {format(new Date(user.created_at), 'MMM d, yyyy')}</div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {currentUser.role === 'admin' && !isMe && (
          <>
            <button className="btn btn-sm" onClick={() => onResetPassword(user)}>Reset password</button>
            <button className="btn btn-sm" onClick={() => onEdit(user)}>Edit</button>
            <button className="btn btn-sm btn-danger" onClick={() => onDelete(user)}>Delete</button>
          </>
        )}
        {isMe && <button className="btn btn-sm" onClick={() => onEdit(user)}>Edit my profile</button>}
      </div>
    </div>
  );
}

function CreateUserForm({ onSave, onClose }) {
  const [form, setForm] = useState({ username: '', password: '', display_name: '', role: 'staff', is_kiosk: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async e => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await axios.post('/api/users', form);
      onSave();
    } catch (err) { setError(err.response?.data?.error || 'Error creating user'); }
    setSaving(false);
  };

  return (
    <form onSubmit={submit}>
      <div className="grid-2">
        <div className="form-group"><label>Username *</label><input className="form-control" value={form.username} onChange={set('username')} required autoFocus placeholder="e.g. john_tech" /></div>
        <div className="form-group"><label>Display name</label><input className="form-control" value={form.display_name} onChange={set('display_name')} placeholder="e.g. John Smith" /></div>
      </div>
      <div className="grid-2">
        <div className="form-group"><label>Password *</label><input className="form-control" type="password" value={form.password} onChange={set('password')} required placeholder="Min 6 characters" /></div>
        <div className="form-group">
          <label>Role</label>
          <select className="form-control" value={form.role} onChange={set('role')}>
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!form.is_kiosk} onChange={e => setForm(f => ({...f, is_kiosk: e.target.checked ? 1 : 0}))} />
            <div>
              <div style={{ fontWeight: 600 }}>Kiosk / Display account</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>This account shows the public-facing display dashboard (no financial data)</div>
            </div>
          </label>
        </div>
      </div>
      {error && <div style={{ background: 'var(--danger-light)', color: 'var(--danger)', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{error}</div>}
      <div className="modal-footer">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create account'}</button>
      </div>
    </form>
  );
}

function EditUserForm({ user, isMe, onSave, onClose }) {
  const [form, setForm] = useState({ display_name: user.display_name || '', active: !!user.active, dark_mode: 0 });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(user.avatar_url || null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    // Fetch target user preferences
    axios.get(`/api/users/${user.id}/prefs`).then(r => {
      setForm(f => ({ ...f, dark_mode: r.data.dark_mode || 0 }));
    }).catch(() => {});
  }, [user.id]);

  const submit = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.put(`/api/users/${user.id}`, form);
      // Save prefs for this user
      await axios.put(`/api/users/${user.id}/prefs`, { dark_mode: form.dark_mode, preferences: {} });
      
      if (avatarFile) {
        const fd = new FormData();
        fd.append('avatar', avatarFile);
        await axios.post(`/api/users/${user.id}/avatar`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      onSave();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
    setSaving(false);
  };

  return (
    <form onSubmit={submit}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => fileRef.current?.click()}>
          {avatarPreview ? (
            <img src={avatarPreview} alt="Avatar" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)' }} />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--bg3)', border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 24 }}>👤</div>
          )}
          <div style={{ position: 'absolute', bottom: 0, right: 0, background: 'var(--accent)', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>+</div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) { setAvatarFile(f); setAvatarPreview(URL.createObjectURL(f)); } }} />
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Profile photo</div>
          <div>Click the photo to upload a new one</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>JPG, PNG · max 5MB</div>
        </div>
      </div>
      <div className="form-group"><label>Display name</label><input className="form-control" value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} autoFocus /></div>
      
      <div className="form-group">
        <label>Theme Preference</label>
        <select className="form-control" value={form.dark_mode} onChange={e => setForm(f => ({ ...f, dark_mode: parseInt(e.target.value) }))}>
          <option value={0}>Light Mode</option>
          <option value={1}>Dark Mode</option>
        </select>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Used on the kiosk and technician dashboard.</div>
      </div>

      {!isMe && (
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} style={{ width: 16, height: 16 }} />
            Account active (uncheck to disable login)
          </label>
        </div>
      )}
      <div className="modal-footer">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  );
}

function ResetPasswordForm({ user, onSave, onClose }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async e => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setSaving(true); setError('');
    try {
      await axios.post(`/api/users/${user.id}/reset-password`, { new_password: password });
      onSave();
    } catch (err) { setError(err.response?.data?.error || 'Error'); }
    setSaving(false);
  };

  return (
    <form onSubmit={submit}>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
        Resetting password for <strong>{user.display_name || user.username}</strong>. They will need to use the new password on their next login.
      </div>
      <div className="form-group"><label>New password</label><input className="form-control" type="password" value={password} onChange={e => setPassword(e.target.value)} required autoFocus placeholder="Min 6 characters" /></div>
      <div className="form-group"><label>Confirm password</label><input className="form-control" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required /></div>
      {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
      <div className="modal-footer">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Reset password'}</button>
      </div>
    </form>
  );
}

const ACTION_ICONS = {
  customer: '👤', repair: '🔧', invoice: '🧾', estimate: '📋',
  inventory: '📦', appointment: '📅', reminder: '⏰', settings: '⚙️',
  backup: '💾', user: '👥', photo: '📷', call_log: '📞', other: '•'
};

function ActivityLog({ userId, isAdmin }) {
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [filterUser, setFilterUser] = useState(userId || '');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const PER_PAGE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: PER_PAGE, offset: page * PER_PAGE });
      if (filterUser) params.set('user_id', filterUser);
      const r = await axios.get(`/api/users/activity-log?${params}`);
      setLogs(r.data.logs);
      setTotal(r.data.total);
    } catch(e) {}
    setLoading(false);
  }, [filterUser, page]);

  useEffect(() => {
    if (isAdmin) axios.get('/api/users').then(r => setUsers(r.data));
    load();
  }, [load, isAdmin]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--text2)' }}>{total} entries (30-day rolling log)</span>
        {isAdmin && (
          <select className="form-control" style={{ width: 'auto' }} value={filterUser} onChange={e => { setFilterUser(e.target.value); setPage(0); }}>
            <option value="">All users</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.display_name || u.username}</option>)}
          </select>
        )}
        <button className="btn btn-sm" onClick={() => load()}>↻ Refresh</button>
      </div>
      {loading ? <Spinner /> : logs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--text3)' }}>No activity recorded yet</div>
      ) : (
        <div>
          <div className="table-wrap">
            <table>
              <thead><tr>
                {isAdmin && <th>User</th>}
                <th>Action</th>
                <th>Item</th>
                <th>Time</th>
              </tr></thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    {isAdmin && <td style={{ fontSize: 12, color: 'var(--text2)' }}>{log.username}</td>}
                    <td>
                      <span style={{ marginRight: 6 }}>{ACTION_ICONS[log.entity_type] || '•'}</span>
                      <span style={{ fontSize: 13 }}>{log.action}</span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text3)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.entity_label || '—'}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                      {format(new Date(log.created_at), 'MMM d, h:mm a')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > PER_PAGE && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
              <button className="btn btn-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span style={{ fontSize: 13, color: 'var(--text3)', alignSelf: 'center' }}>{page + 1} / {Math.ceil(total / PER_PAGE)}</span>
              <button className="btn btn-sm" disabled={(page + 1) * PER_PAGE >= total} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AccountManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // 'create' | 'edit' | 'reset' | null
  const [target, setTarget] = useState(null);
  const [activeTab, setActiveTab] = useState('users');

  const load = useCallback(async () => {
    if (currentUser?.role === 'admin') {
      const r = await axios.get('/api/users');
      setUsers(r.data);
    } else {
      const r = await axios.get('/api/users/me');
      setUsers([r.data]);
    }
    setLoading(false);
  }, [currentUser]);

  useEffect(() => { load(); }, [load]);

  const deleteUser = async (user) => {
    if (!window.confirm(`Delete account for ${user.display_name || user.username}? This cannot be undone.`)) return;
    await axios.delete(`/api/users/${user.id}`);
    load();
  };

  const MODAL_TITLES = { create: 'Create staff account', edit: `Edit ${target?.display_name || target?.username}`, reset: `Reset password — ${target?.display_name || target?.username}` };

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={`tab ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>👥 Accounts</button>
        <button className={`tab ${activeTab === 'log' ? 'active' : ''}`} onClick={() => setActiveTab('log')}>📋 Activity log</button>
      </div>

      {activeTab === 'users' && (
        <div>
          {currentUser?.role === 'admin' && (
            <div style={{ marginBottom: 16 }}>
              <button className="btn btn-primary" onClick={() => { setModal('create'); setTarget(null); }}>+ Create staff account</button>
            </div>
          )}
          {loading ? <Spinner /> : users.map(u => (
            <UserCard key={u.id} user={u} currentUser={currentUser}
              onEdit={u => { setTarget(u); setModal('edit'); }}
              onDelete={deleteUser}
              onResetPassword={u => { setTarget(u); setModal('reset'); }} />
          ))}
        </div>
      )}

      {activeTab === 'log' && (
        <ActivityLog userId={currentUser?.role !== 'admin' ? currentUser?.id : ''} isAdmin={currentUser?.role === 'admin'} />
      )}

      {/* Modals */}
      {modal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="modal">
            <div className="modal-header">
              <h2>{MODAL_TITLES[modal]}</h2>
              <button className="btn btn-icon btn-sm" onClick={() => setModal(null)}>✕</button>
            </div>
            {modal === 'create' && <CreateUserForm onSave={() => { setModal(null); load(); }} onClose={() => setModal(null)} />}
            {modal === 'edit' && target && <EditUserForm user={target} isMe={target.id === currentUser?.id} onSave={() => { setModal(null); load(); if (target.id === currentUser?.id) window.location.reload(); }} onClose={() => setModal(null)} />}
            {modal === 'reset' && target && <ResetPasswordForm user={target} onSave={() => { setModal(null); alert('Password reset successfully.'); }} onClose={() => setModal(null)} />}
          </div>
        </div>
      )}
    </div>
  );
}
