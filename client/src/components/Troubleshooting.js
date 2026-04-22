import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

function DBOptimize() {
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (!window.confirm('Run database cleanup?\n\nThis will VACUUM, ANALYZE, and REINDEX the SQLite database. Takes a few seconds. The app stays online during this process.')) return;
    setRunning(true); setResult(null);
    try {
      const r = await axios.get('/api/system/info'); // ensure axios imported
      const r2 = await axios.post('/api/system/db-optimize');
      setResult(r2.data);
    } catch(e) { setResult({ error: e.response?.data?.error || e.message }); }
    setRunning(false);
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>🗃️ Database optimize</div>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.6 }}>
        Runs VACUUM (reclaims unused space), ANALYZE (updates query stats), and REINDEX on the SQLite database.
        Safe to run anytime — the app stays live during the process.
      </p>
      {result && (
        <div style={{ padding: '10px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13,
          background: result.error ? 'var(--danger-light)' : 'var(--success-light)',
          color: result.error ? 'var(--danger)' : 'var(--success)' }}>
          {result.error ? '❌ ' + result.error : `✓ Complete — freed ${result.saved_kb} KB. DB size: ${((result.after_bytes||0)/1024).toFixed(0)} KB`}
        </div>
      )}
      <button className="btn btn-primary" onClick={run} disabled={running}>
        {running ? '⏳ Optimizing…' : '🗃️ Optimize database'}
      </button>
    </div>
  );
}

function LiveLogs() {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [paused, setPaused] = useState(false);
  const bottomRef = useRef(null);
  const lastTs = useRef(null);

  const fetchLogs = useCallback(async () => {
    if (paused) return;
    try {
      const params = lastTs.current ? `?since=${lastTs.current}` : '';
      const r = await axios.get(`/api/system/logs${params}`);
      if (r.data.logs.length > 0) {
        setLogs(prev => {
          const combined = lastTs.current ? [...prev, ...r.data.logs] : r.data.logs;
          lastTs.current = combined[combined.length - 1]?.ts;
          return combined.slice(-500); // Keep last 500
        });
      } else if (!lastTs.current && r.data.logs.length === 0) {
        setLogs([]);
      }
    } catch(e) {}
  }, [paused]);

  useEffect(() => {
    fetchLogs();
    const t = setInterval(fetchLogs, 1000);
    return () => clearInterval(t);
  }, [fetchLogs]);

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, autoScroll]);

  const filtered = filter ? logs.filter(l => l.message.toLowerCase().includes(filter.toLowerCase()) || l.level === filter) : logs;

  const levelColor = { info: 'var(--text2)', warn: 'var(--warning)', error: 'var(--danger)' };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="form-control" style={{ flex: 1, maxWidth: 240 }} value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter logs…" />
        {['info','warn','error'].map(l => (
          <button key={l} className={`btn btn-sm ${filter === l ? 'btn-primary' : ''}`} onClick={() => setFilter(f => f === l ? '' : l)}>{l}</button>
        ))}
        <button className={`btn btn-sm ${paused ? 'btn-primary' : ''}`} onClick={() => setPaused(p => !p)}>{paused ? '▶ Resume' : '⏸ Pause'}</button>
        <button className="btn btn-sm" onClick={() => setAutoScroll(a => !a)} style={{ color: autoScroll ? 'var(--success)' : undefined }}>Auto-scroll {autoScroll ? 'ON' : 'OFF'}</button>
        <button className="btn btn-sm" onClick={() => { setLogs([]); lastTs.current = null; }}>Clear</button>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>{filtered.length} entries</span>
      </div>
      <div style={{ background: '#0f172a', borderRadius: 8, padding: 12, height: 340, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6 }}>
        {filtered.map((log, i) => (
          <div key={i} style={{ color: levelColor[log.level] || '#94a3b8', marginBottom: 1 }}>
            <span style={{ color: '#475569', marginRight: 8 }}>{log.ts?.slice(11, 23)}</span>
            <span style={{ color: log.level === 'error' ? '#f87171' : log.level === 'warn' ? '#fbbf24' : '#94a3b8', marginRight: 8, textTransform: 'uppercase', fontSize: 9 }}>[{log.level}]</span>
            <span style={{ color: '#e2e8f0' }}>{log.message}</span>
          </div>
        ))}
        {filtered.length === 0 && <div style={{ color: '#475569' }}>No log entries yet…</div>}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function SystemInfo() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    const load = () => axios.get('/api/system/info').then(r => setInfo(r.data)).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  if (!info) return null;

  const uptime = s => {
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return [d > 0 && `${d}d`, h > 0 && `${h}h`, `${m}m`].filter(Boolean).join(' ');
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 16 }}>
      {[
        ['Node.js', info.node_version],
        ['Platform', info.platform],
        ['PID', info.pid],
        ['Uptime', uptime(info.uptime_seconds)],
        ['Memory', `${info.memory_used_mb}/${info.memory_total_mb} MB`],
        ['DB size', `${(info.db_size_bytes / 1024).toFixed(0)} KB`],
        ['Environment', info.env],
        ['Started', info.started_at ? new Date(info.started_at).toLocaleTimeString() : '—'],
      ].map(([l, v]) => (
        <div key={l} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ fontSize: 10, color: 'var(--text3)' }}>{l}</div>
          <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace' }}>{v}</div>
        </div>
      ))}
    </div>
  );
}

function RebootButton() {
  const [rebooting, setRebooting] = useState(false);
  const [countdown, setCountdown] = useState(null);

  const reboot = async () => {
    if (!window.confirm('Reboot the server?\n\nA backup will be created automatically before restart.\nYou will be disconnected for ~60 seconds.')) return;
    setRebooting(true);
    try {
      await axios.post('/api/system/reboot');
      let s = 65;
      setCountdown(s);
      const t = setInterval(() => {
        s--;
        setCountdown(s);
        if (s <= 0) {
          clearInterval(t);
          // Poll until back online
          const poll = setInterval(() => {
            axios.get('/api/system/info').then(() => { clearInterval(poll); window.location.reload(); }).catch(() => {});
          }, 3000);
        }
      }, 1000);
    } catch(e) { setRebooting(false); }
  };

  if (countdown !== null) {
    return (
      <div style={{ background: 'var(--warning-light)', border: '1px solid var(--warning)', borderRadius: 8, padding: '14px 16px', textAlign: 'center' }}>
        <div style={{ fontWeight: 700, color: 'var(--warning)', marginBottom: 6 }}>🔄 Rebooting… auto-backup in progress</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--warning)' }}>{countdown}s</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Reconnecting automatically when server is back…</div>
      </div>
    );
  }

  return (
    <button className="btn btn-danger" onClick={reboot} disabled={rebooting} style={{ fontSize: 14, padding: '10px 20px' }}>
      {rebooting ? '⏳ Initiating reboot…' : '🔄 Reboot server'}
    </button>
  );
}

function DockerComposeEditor() {
  const [content, setContent] = useState('');
  const [filePath, setFilePath] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/system/docker-compose').then(r => {
      setContent(r.data.content || '');
      setFilePath(r.data.path || '');
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const save = async (sudoPass = null) => {
    setSaving(true);
    try {
      const r = await axios.post('/api/system/docker-compose', { content, path: filePath, sudo_password: sudoPass });
      setFilePath(r.data.saved_to || filePath);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch(e) {
      if (e.response?.data?.needs_sudo) {
        const pass = window.prompt('Permission denied. Please enter your sudo password to save to ' + filePath);
        if (pass) return save(pass);
      } else {
        alert(e.response?.data?.error || 'Error saving');
      }
    }
    setSaving(false);
  };

  if (loading) return <div style={{ fontSize: 13, color: 'var(--text3)' }}>Loading…</div>;

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
        File: <code style={{ background: 'var(--bg3)', padding: '1px 6px', borderRadius: 4 }}>{filePath || 'Not found on filesystem — saved to database'}</code>
      </div>
      <textarea className="form-control" value={content} onChange={e => setContent(e.target.value)}
        style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6, minHeight: 400, resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saved ? '✓ Saved!' : saving ? 'Saving…' : 'Save docker-compose.yml'}
        </button>
        <div style={{ fontSize: 12, color: 'var(--text3)', alignSelf: 'center' }}>Run <code>docker compose up -d</code> on your host to apply changes.</div>
      </div>
    </div>
  );
}

export default function Troubleshooting() {
  const [tab, setTab] = useState('logs');

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 16 }}>
        {[['logs','📋 Live logs'],['sysinfo','💻 System info'],['reboot','🔄 Reboot'],['compose','🐳 docker-compose']].map(([id,label]) => (
          <button key={id} className={`tab ${tab===id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'logs' && <LiveLogs />}
      {tab === 'sysinfo' && (
        <div>
          <SystemInfo />
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>Refreshes every 5 seconds</div>
          
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>🔑 File Permissions</div>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.6 }}>
              If you cannot save your logo or docker-compose.yml due to "Permission Denied", use this tool to grant the application ownership of its data folder.
            </p>
            <button className="btn btn-warning" onClick={async () => {
              const pass = window.prompt('Enter sudo password to fix file permissions:');
              if (pass) {
                try {
                  await axios.post('/api/system/fix-permissions', { sudo_password: pass });
                  alert('Permissions fixed ✓');
                } catch(e) { alert(err.response?.data?.error || 'Failed'); }
              }
            }}>🛠️ Fix File Permissions</button>
          </div>

          <DBOptimize />
        </div>
      )}
      {tab === 'reboot' && (
        <div>
          <div style={{ background: 'var(--warning-light)', border: '1px solid var(--warning)', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 13, color: 'var(--warning)' }}>
            ⚠️ Rebooting restarts the Node.js server process. Docker will automatically restart the container. A <strong>PRE-REBOOT</strong> backup is created automatically before restart.
          </div>
          <RebootButton />
        </div>
      )}
      {tab === 'compose' && <DockerComposeEditor />}
    </div>
  );
}
