import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function CloudSettings() {
  const [googleStatus, setGoogleStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState('');
  const [syncResult, setSyncResult] = useState('');
  const [driveResult, setDriveResult] = useState(null);
  const [driveBacking, setDriveBacking] = useState(false);

  const load = () => {
    axios.get('/api/appointments/google/status')
      .then(r => setGoogleStatus(r.data))
      .catch(() => setGoogleStatus({ configured: false, connected: false }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const connect = async () => {
    try {
      const r = await axios.get('/api/appointments/google/auth-url');
      window.open(r.data.url, '_blank', 'width=600,height=700');
      // Poll for connection
      const poll = setInterval(() => {
        axios.get('/api/appointments/google/status').then(r2 => {
          if (r2.data.connected) { clearInterval(poll); setGoogleStatus(r2.data); }
        });
      }, 3000);
      setTimeout(() => clearInterval(poll), 120000);
    } catch(e) { alert('Error: ' + e.message); }
  };

  const disconnect = async () => {
    if (!window.confirm('Disconnect Google account?')) return;
    await axios.post('/api/appointments/google/disconnect');
    setGoogleStatus({ configured: googleStatus?.configured, connected: false });
  };

  const runSync = async (action, label) => {
    setSyncing(action); setSyncResult('');
    try {
      const endpoint = action === 'contacts' ? '/api/customers/sync-all-google'
        : action === 'calendar-push' ? '/api/appointments/sync-all'
        : action === 'calendar-pull' ? '/api/appointments/google/sync-from'
        : null;
      const r = await axios.post(endpoint);
      setSyncResult(`✓ ${label}: ${r.data.synced ?? r.data.imported ?? 'done'} ${action.includes('pull') ? 'imported' : 'synced'}`);
    } catch(e) { setSyncResult('❌ ' + (e.response?.data?.error || e.message)); }
    setSyncing('');
  };

  const backupToDrive = async () => {
    setDriveBacking(true); setDriveResult(null);
    try {
      const r = await axios.post('/api/backup/drive');
      setDriveResult({ ok: true, name: r.data.file_name, link: r.data.link });
    } catch(e) { setDriveResult({ ok: false, error: e.response?.data?.error || e.message }); }
    setDriveBacking(false);
  };

  const SyncButton = ({ action, label, icon, description }) => (
    <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '12px 14px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>{description}</div>
        </div>
        <button className="btn btn-sm btn-primary" onClick={() => runSync(action, label)} disabled={!!syncing || !googleStatus?.connected}>
          {syncing === action ? <span style={{ display:'flex', gap:6, alignItems:'center' }}><span style={{ display:'inline-block', width:12, height:12, border:'2px solid rgba(255,255,255,.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin .7s linear infinite' }} />Syncing…</span> : 'Sync now'}
        </button>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div>
      {/* Google Account */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>🔗 Google account</div>
        {loading ? (
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>Checking…</div>
        ) : !googleStatus?.configured ? (
          <div style={{ background: 'var(--warning-light)', border: '1px solid var(--warning)', borderRadius: 8, padding: '12px 14px', fontSize: 13 }}>
            ⚠️ Google API credentials not configured. Add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to your docker-compose.yml environment, then restart.
          </div>
        ) : googleStatus?.connected ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--success)', animation: 'aipulse 2s ease-in-out infinite' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)' }}>Connected</span>
              {googleStatus.email && <span style={{ fontSize: 12, color: 'var(--text3)' }}>{googleStatus.email}</span>}
            </div>
            <style>{`@keyframes aipulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
            <button className="btn btn-sm btn-danger" onClick={disconnect}>Disconnect Google</button>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.6 }}>
              Connect Google to sync contacts and calendar. Requires Calendar and Contacts access.
            </p>
            <button className="btn btn-primary" onClick={connect}>🔗 Connect Google account</button>
          </div>
        )}
      </div>

      {/* Sync controls */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>🔄 Sync controls</div>

        <SyncButton action="contacts" label="Sync contacts → Google" icon="👥"
          description="Push all customer records to Google Contacts" />
        <SyncButton action="calendar-push" label="Push appointments → Google Calendar" icon="📤"
          description="Send upcoming appointments to Google Calendar" />
        <SyncButton action="calendar-pull" label="Pull events ← Google Calendar" icon="📥"
          description="Import upcoming Google Calendar events as appointments (two-way sync)" />

        {syncResult && (
          <div style={{ padding: '9px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, marginTop: 8,
            background: syncResult.startsWith('✓') ? 'var(--success-light)' : 'var(--danger-light)',
            color: syncResult.startsWith('✓') ? 'var(--success)' : 'var(--danger)',
          }}>{syncResult}</div>
        )}
      </div>

      {/* Google Drive Backup */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>☁️ Google Drive backup</div>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.6 }}>
          Uploads a backup of your database to a <strong>RepairShop Backups</strong> folder in your Google Drive.
          Safe to run anytime — creates a new timestamped zip each time.
        </p>
        {driveResult && (
          <div style={{ padding: '9px 12px', borderRadius: 6, fontSize: 13, marginBottom: 12,
            background: driveResult.ok ? 'var(--success-light)' : 'var(--danger-light)',
            color: driveResult.ok ? 'var(--success)' : 'var(--danger)',
          }}>
            {driveResult.ok
              ? <>✓ Backed up: <a href={driveResult.link} target="_blank" rel="noreferrer" style={{ color: 'var(--success)', fontWeight: 700 }}>{driveResult.name}</a></>
              : '❌ ' + driveResult.error}
          </div>
        )}
        <button className="btn btn-primary" onClick={backupToDrive} disabled={driveBacking || !googleStatus?.connected}>
          {driveBacking ? (
            <span style={{ display:'flex', gap:8, alignItems:'center' }}>
              <span style={{ display:'inline-block', width:14, height:14, border:'2px solid rgba(255,255,255,.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin .7s linear infinite' }} />
              Uploading to Drive…
            </span>
          ) : '☁️ Backup to Google Drive'}
        </button>
        {!googleStatus?.connected && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>Connect Google account first.</div>}
      </div>

      {/* Info */}
      <div className="card" style={{ background: 'var(--bg3)' }}>
        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>ℹ️ About Google integration</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.8 }}>
          <div>• Two-way calendar sync — push repairs/appts to Google, pull Google events back</div>
          <div>• Contact sync keeps your customer list in Google Contacts automatically</div>
          <div>• Drive backup creates <code>RepairShop Backups/</code> folder in your Google Drive</div>
          <div>• Set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in docker-compose.yml</div>
          <div>• Google Cloud Console → Create project → Enable Calendar, People, Drive APIs → OAuth credentials</div>
        </div>
      </div>
    </div>
  );
}
