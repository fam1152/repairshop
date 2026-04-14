import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function BackupRestore() {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState(null);
  const [restoreError, setRestoreError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [schedule, setSchedule] = useState(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleSaved, setScheduleSaved] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  const load = () => {
    setLoading(true);
    axios.get('/api/backup/info').then(r => setInfo(r.data)).finally(() => setLoading(false));
    axios.get('/api/backup/schedule').then(r => setSchedule(r.data)).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const downloadBackup = async () => {
    setDownloading(true);
    try {
      const res = await axios.get('/api/backup/download', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url;
      a.download = `repairshop-backup-${timestamp}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Backup download failed. Check the server logs.');
    }
    setDownloading(false);
  };

  const doRestore = async (file) => {
    if (!file) return;
    if (!file.name.endsWith('.zip')) {
      setRestoreError('Please select a .zip backup file created by RepairShop.');
      return;
    }

    const confirmed = window.confirm(
      '⚠️ RESTORE WARNING\n\nThis will replace ALL current data with the backup.\n\nYour current data will be permanently overwritten.\n\nAre you absolutely sure you want to continue?'
    );
    if (!confirmed) { setSelectedFile(null); return; }

    setRestoring(true);
    setRestoreError('');
    setRestoreResult(null);

    const fd = new FormData();
    fd.append('backup', file);

    try {
      const r = await axios.post('/api/backup/restore', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: () => {},
        timeout: 120000,
      });
      setRestoreResult(r.data);
      setSelectedFile(null);
      load();
    } catch (err) {
      setRestoreError(err.response?.data?.error || 'Restore failed. The backup file may be corrupted.');
      setSelectedFile(null);
    }
    setRestoring(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) { setSelectedFile(file); setRestoreError(''); }
  };

  const RECORD_LABELS = {
    customers: '👤 Customers',
    repairs: '🔧 Repairs',
    invoices: '🧾 Invoices',
    estimates: '📋 Estimates',
    inventory: '📦 Inventory',
    appointments: '📅 Appointments',
    reminders: '⏰ Reminders',
    photos: '📷 Photos',
  };

  return (
    <div>
      {/* Database info */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 14 }}>💾 Current data</div>
        {loading ? (
          <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
        ) : info ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 14 }}>
              {Object.entries(info.record_counts || {}).map(([key, count]) => (
                <div key={key} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>{RECORD_LABELS[key] || key}</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{count}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              Database size: <strong>{formatBytes(info.db_size_bytes)}</strong>
              <span style={{ marginLeft: 16 }}>Location: <code style={{ fontSize: 11, background: 'var(--bg3)', padding: '1px 6px', borderRadius: 4 }}>{info.db_path}</code></span>
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--danger)', fontSize: 13 }}>Could not load database info</div>
        )}
      </div>

      {/* Download backup */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14 }}>📥 Create backup</div>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.6 }}>
          Downloads a <code style={{ fontSize: 12, background: 'var(--bg3)', padding: '1px 6px', borderRadius: 4 }}>.zip</code> file containing your complete database and all uploaded photos and logos.
          Store this file somewhere safe — an external drive, cloud storage, or another machine.
        </p>
        <div style={{ background: 'var(--accent-light)', border: '1px solid var(--accent)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--accent)' }}>
          💡 <strong>Tip:</strong> Back up before every update and at least once a week during normal use.
        </div>
        <button
          className="btn btn-primary"
          onClick={downloadBackup}
          disabled={downloading}
          style={{ fontSize: 14, padding: '10px 20px' }}>
          {downloading ? (
            <span className="flex" style={{ gap: 8 }}>
              <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              Preparing backup…
            </span>
          ) : '⬇️ Download backup'}
        </button>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>

      {/* Restore */}
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14 }}>📤 Restore from backup</div>
        <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--danger)' }}>
          ⚠️ <strong>Warning:</strong> Restoring will permanently replace all current data — customers, repairs, invoices, photos, and settings — with the contents of the backup file. This cannot be undone.
        </div>

        {/* Drag and drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? 'var(--accent)' : selectedFile ? 'var(--success)' : 'var(--border)'}`,
            borderRadius: 10,
            padding: '32px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragOver ? 'var(--accent-light)' : selectedFile ? 'var(--success-light)' : 'var(--bg3)',
            transition: 'all .15s',
            marginBottom: 14,
          }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>
            {selectedFile ? '✅' : '📂'}
          </div>
          {selectedFile ? (
            <div>
              <div style={{ fontWeight: 600, color: 'var(--success)', marginBottom: 4 }}>{selectedFile.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>{formatBytes(selectedFile.size)}</div>
            </div>
          ) : (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Drop backup .zip here</div>
              <div style={{ fontSize: 13, color: 'var(--text3)' }}>or click to browse</div>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files[0]; if (f) { setSelectedFile(f); setRestoreError(''); } e.target.value = ''; }}
          />
        </div>

        {restoreError && (
          <div style={{ background: 'var(--danger-light)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
            ❌ {restoreError}
          </div>
        )}

        {restoreResult && (
          <div style={{ background: 'var(--success-light)', color: 'var(--success)', padding: '12px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>✓ Restore successful!</div>
            <div>{restoreResult.files_restored} uploaded file{restoreResult.files_restored !== 1 ? 's' : ''} restored.</div>
            {restoreResult.meta?.created_at && (
              <div style={{ marginTop: 4 }}>Backup was created: {new Date(restoreResult.meta.created_at).toLocaleString()}</div>
            )}
            <div style={{ marginTop: 8 }}>
              <button className="btn btn-sm" style={{ background: 'var(--success)', color: '#fff', borderColor: 'var(--success)' }} onClick={() => window.location.reload()}>
                Refresh page to see restored data
              </button>
            </div>
          </div>
        )}

        <button
          className="btn btn-danger"
          onClick={() => doRestore(selectedFile)}
          disabled={!selectedFile || restoring}
          style={{ fontSize: 14, padding: '10px 20px' }}>
          {restoring ? (
            <span className="flex" style={{ gap: 8 }}>
              <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(220,38,38,0.3)', borderTopColor: 'var(--danger)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              Restoring…
            </span>
          ) : '📤 Restore from this backup'}
        </button>
        {selectedFile && !restoring && (
          <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => { setSelectedFile(null); setRestoreError(''); }}>
            Clear
          </button>
        )}
      </div>

      {/* Scheduled automatic backup */}
      {schedule !== null && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14 }}>⏰ Automatic scheduled backup</div>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.6 }}>
            Automatically save a backup to a folder on your TrueNAS storage on a schedule. Keeps the last 10 backups.
          </p>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!(schedule?.enabled)} onChange={e => setSchedule(s => ({ ...s, enabled: e.target.checked }))} style={{ width: 16, height: 16 }} />
              Enable automatic backups
            </label>
          </div>
          {schedule?.enabled && (
            <div className="grid-2">
              <div className="form-group">
                <label>Frequency</label>
                <select className="form-control" value={schedule.frequency || 'daily'} onChange={e => setSchedule(s => ({ ...s, frequency: e.target.value }))}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
              <div className="form-group">
                <label>Run at hour (24h)</label>
                <select className="form-control" value={schedule.hour ?? 2} onChange={e => setSchedule(s => ({ ...s, hour: parseInt(e.target.value) }))}>
                  {Array.from({length: 24}, (_, i) => (
                    <option key={i} value={i}>{i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i-12}:00 PM`}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label>Save location (path on TrueNAS, e.g. /mnt/tank/backups)</label>
                <input className="form-control" value={schedule.save_path || ''} onChange={e => setSchedule(s => ({ ...s, save_path: e.target.value }))} placeholder="/mnt/tank/repairshop-backups" />
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>This must be a path the container can write to. Mount it as an additional volume in your docker-compose.yml if needed.</div>
              </div>
            </div>
          )}
          {schedule?.last_run && (
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
              Last backup: {new Date(schedule.last_run).toLocaleString()}
            </div>
          )}
          <button className="btn btn-primary" disabled={scheduleSaving} onClick={async () => {
            setScheduleSaving(true);
            try {
              const r = await axios.put('/api/backup/schedule', schedule);
              setSchedule(r.data);
              setScheduleSaved(true);
              setTimeout(() => setScheduleSaved(false), 2000);
            } catch(e) { alert('Error saving schedule'); }
            setScheduleSaving(false);
          }}>
            {scheduleSaved ? '✓ Saved!' : scheduleSaving ? 'Saving…' : 'Save schedule'}
          </button>
        </div>
      )}

      {/* TrueNAS automatic backup tip */}
      <div className="card" style={{ marginTop: 16, background: 'var(--bg3)', border: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>🏠 TrueNAS automatic backups</div>
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 0 }}>
          Your data lives at <code style={{ fontSize: 11, background: 'var(--bg2)', padding: '1px 6px', borderRadius: 4 }}>/mnt/tank/repairshop-data/</code> on TrueNAS.
          You can set up automatic ZFS snapshots in TrueNAS → <strong>Data Protection → Periodic Snapshot Tasks</strong> to back up this dataset on a schedule.
          ZFS snapshots are instant and take almost no extra space — recommended daily snapshots with 30-day retention.
        </p>
      </div>
    </div>
  );
}
