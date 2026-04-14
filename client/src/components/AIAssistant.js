import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

// ── Ollama state detector
// States: 'off' | 'loading' | 'running' | 'error'
function getOllamaState(status, checking) {
  if (checking) return 'loading';
  if (!status) return 'loading';
  if (status.error && !status.online) return 'off';
  if (!status.online) return 'off';
  if (status.online && !status.model_ready) return 'loading';
  if (status.online && status.model_ready) return 'running';
  return 'error';
}

const STATE_CONFIG = {
  off:     { label: 'Offline',      color: 'var(--text3)',   bg: 'var(--bg3)',           border: 'var(--border)',  dot: '#94a3b8', pulse: false },
  loading: { label: 'Loading…',     color: 'var(--warning)', bg: 'var(--warning-light)', border: 'var(--warning)', dot: '#d97706', pulse: true  },
  running: { label: 'Running',      color: 'var(--success)', bg: 'var(--success-light)', border: 'var(--success)', dot: '#16a34a', pulse: true  },
  error:   { label: 'Error',        color: 'var(--danger)',  bg: 'var(--danger-light)',  border: 'var(--danger)',  dot: '#dc2626', pulse: false },
};

// ── AI Status indicator (small badge shown in dashboard/header)
export function AIStatusBadge({ onClick }) {
  const [status, setStatus] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const check = () => {
      setChecking(true);
      axios.get('/api/ai/status')
        .then(r => { setStatus(r.data); setChecking(false); })
        .catch(() => { setStatus({ online: false, error: 'Cannot reach Ollama' }); setChecking(false); });
    };
    check();
    const t = setInterval(check, 30000); // re-check every 30s
    return () => clearInterval(t);
  }, []);

  const state = getOllamaState(status, checking);
  const cfg = STATE_CONFIG[state];

  return (
    <button onClick={onClick} className="btn btn-sm" style={{
      background: cfg.bg, color: cfg.color, borderColor: cfg.border,
      fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', background: cfg.dot, flexShrink: 0,
        animation: cfg.pulse ? 'aipulse 2s ease-in-out infinite' : 'none',
      }} />
      <style>{`@keyframes aipulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(0.8)}}`}</style>
      🤖 {cfg.label}
    </button>
  );
}

// ── Typewriter effect for AI responses
function TypewriterText({ text, speed = 8 }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed('');
    setDone(false);
    if (!text) return;
    let i = 0;
    const interval = setInterval(() => {
      i += speed;
      if (i >= text.length) {
        setDisplayed(text);
        setDone(true);
        clearInterval(interval);
      } else {
        setDisplayed(text.slice(0, i));
      }
    }, 16);
    return () => clearInterval(interval);
  }, [text, speed]);

  return (
    <div style={{ position: 'relative' }}>
      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.7, margin: 0, color: 'var(--text)' }}>
        {displayed}
        {!done && <span style={{ display: 'inline-block', width: 2, height: '1em', background: 'var(--accent)', marginLeft: 2, animation: 'blink 1s step-end infinite', verticalAlign: 'text-bottom' }} />}
      </pre>
      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
    </div>
  );
}

// ── Generic AI panel wrapper
function AIPanel({ title, icon, loading, result, error, children, onCopy, onUse }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(result).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ background: 'var(--bg3)', padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{title}</span>
        {result && (
          <>
            <button className="btn btn-sm" onClick={copy}>{copied ? '✓ Copied' : '📋 Copy'}</button>
            {onUse && <button className="btn btn-sm btn-primary" onClick={() => onUse(result)}>Use this →</button>}
          </>
        )}
      </div>
      <div style={{ padding: '14px' }}>
        {children}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text3)', fontSize: 13 }}>
            <div style={{ display: 'flex', gap: 3 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width: 6, height: 6, background: 'var(--accent)', borderRadius: '50%', animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
              ))}
            </div>
            AI is thinking…
            <style>{`@keyframes bounce{0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}`}</style>
          </div>
        )}
        {error && (
          <div style={{ background: 'var(--danger-light)', color: 'var(--danger)', padding: '10px 12px', borderRadius: 6, fontSize: 13 }}>
            ❌ {error}
            {error.includes('Cannot reach Ollama') && (
              <div style={{ marginTop: 6, fontSize: 12 }}>Make sure the Ollama container is running: <code>docker compose up -d ollama</code></div>
            )}
            {error.includes('model not loaded') || error.includes('model_not_found') && (
              <div style={{ marginTop: 6, fontSize: 12 }}>Pull the model first in Settings → AI Assistant.</div>
            )}
          </div>
        )}
        {result && !loading && <TypewriterText text={result} />}
      </div>
    </div>
  );
}

// ── 1. REPAIR DIAGNOSIS ──
export function RepairDiagnosis({ repair, onUseNotes }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [symptoms, setSymptoms] = useState(repair?.description || '');

  const run = async () => {
    setLoading(true); setResult(''); setError('');
    try {
      const r = await axios.post('/api/ai/diagnose', {
        device_type: repair?.device_type, device_brand: repair?.device_brand,
        device_model: repair?.device_model, symptoms, existing_notes: repair?.repair_notes
      });
      setResult(r.data.result);
    } catch(e) { setError(e.response?.data?.error || e.message); }
    setLoading(false);
  };

  return (
    <AIPanel title="AI repair diagnosis" icon="🔧" loading={loading} result={result} error={error}
      onUse={onUseNotes ? (text) => onUseNotes(text) : undefined}>
      <div className="form-group" style={{ marginBottom: 10 }}>
        <label>Describe the symptoms / problem</label>
        <textarea className="form-control" rows={3} value={symptoms}
          onChange={e => setSymptoms(e.target.value)}
          placeholder="e.g. won't boot, screen flickering, battery drains fast, makes clicking sound…" />
      </div>
      <button className="btn btn-primary btn-sm" onClick={run} disabled={loading || !symptoms.trim()}>
        {loading ? 'Analyzing…' : '🔧 Get diagnosis'}
      </button>
    </AIPanel>
  );
}

// ── 2. FORMAT NOTES ──
export function NoteFormatter({ repair, onUseNotes }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [rawNotes, setRawNotes] = useState('');

  const run = async () => {
    setLoading(true); setResult(''); setError('');
    try {
      const r = await axios.post('/api/ai/format-notes', {
        raw_notes: rawNotes, device_type: repair?.device_type, repair_title: repair?.title
      });
      setResult(r.data.result);
    } catch(e) { setError(e.response?.data?.error || e.message); }
    setLoading(false);
  };

  return (
    <AIPanel title="Format repair notes" icon="📝" loading={loading} result={result} error={error}
      onUse={onUseNotes}>
      <div className="form-group" style={{ marginBottom: 10 }}>
        <label>Paste your rough notes</label>
        <textarea className="form-control" rows={3} value={rawNotes}
          onChange={e => setRawNotes(e.target.value)}
          placeholder="e.g. replaced ssd 500gb samsung, cleaned dust, reseated ram, bios update, boots fine now" />
      </div>
      <button className="btn btn-primary btn-sm" onClick={run} disabled={loading || !rawNotes.trim()}>
        {loading ? 'Formatting…' : '📝 Format notes'}
      </button>
    </AIPanel>
  );
}

// ── 3. CUSTOMER MESSAGE ──
export function CustomerMessage({ repairId }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [type, setType] = useState('status_update');
  const [copied, setCopied] = useState(false);

  const MESSAGE_TYPES = [
    { value: 'status_update', label: '📊 Status update' },
    { value: 'ready_pickup', label: '✅ Ready for pickup' },
    { value: 'follow_up', label: '💬 Post-repair follow-up' },
    { value: 'estimate_approval', label: '📋 Estimate approval request' },
    { value: 'delay_notice', label: '⏳ Delay notice' },
  ];

  const run = async () => {
    setLoading(true); setResult(''); setError('');
    try {
      const r = await axios.post('/api/ai/customer-message', { repair_id: repairId, message_type: type });
      setResult(r.data.result);
    } catch(e) { setError(e.response?.data?.error || e.message); }
    setLoading(false);
  };

  const copy = () => {
    navigator.clipboard.writeText(result).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <AIPanel title="Draft customer message" icon="📞" loading={loading} result={result} error={error}>
      <div className="form-group" style={{ marginBottom: 10 }}>
        <label>Message type</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {MESSAGE_TYPES.map(t => (
            <button key={t.value} type="button" className="btn btn-sm"
              style={{ background: type === t.value ? 'var(--accent)' : undefined, color: type === t.value ? '#fff' : undefined, borderColor: type === t.value ? 'var(--accent)' : undefined }}
              onClick={() => setType(t.value)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <button className="btn btn-primary btn-sm" onClick={run} disabled={loading}>
        {loading ? 'Drafting…' : '📞 Draft message'}
      </button>
      {result && !loading && (
        <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
          <button className="btn btn-sm" onClick={copy}>{copied ? '✓ Copied' : '📋 Copy message'}</button>
        </div>
      )}
    </AIPanel>
  );
}

// ── 4. INVENTORY REORDER SUGGESTIONS ──
export function ReorderSuggestions() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const run = async () => {
    setLoading(true); setResult(''); setError('');
    try {
      const r = await axios.post('/api/ai/reorder-suggestions');
      setResult(r.data.result);
    } catch(e) { setError(e.response?.data?.error || e.message); }
    setLoading(false);
  };

  return (
    <AIPanel title="AI reorder suggestions" icon="📦" loading={loading} result={result} error={error}>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>
        Analyzes your inventory levels and usage history to suggest what to reorder and in what quantities.
      </p>
      <button className="btn btn-primary btn-sm" onClick={run} disabled={loading}>
        {loading ? 'Analyzing inventory…' : '📦 Get reorder suggestions'}
      </button>
    </AIPanel>
  );
}

// ── 5. BUSINESS INSIGHTS ──
export function BusinessInsights() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('month');

  const run = async () => {
    setLoading(true); setResult(''); setError('');
    try {
      const r = await axios.post('/api/ai/insights', { period });
      setResult(r.data.result);
    } catch(e) { setError(e.response?.data?.error || e.message); }
    setLoading(false);
  };

  return (
    <AIPanel title="Business insights" icon="📊" loading={loading} result={result} error={error}>
      <div className="flex" style={{ marginBottom: 10, gap: 6 }}>
        {[['week','Last 7 days'],['month','This month'],['year','This year']].map(([v,l]) => (
          <button key={v} type="button" className="btn btn-sm"
            style={{ background: period === v ? 'var(--accent)' : undefined, color: period === v ? '#fff' : undefined, borderColor: period === v ? 'var(--accent)' : undefined }}
            onClick={() => setPeriod(v)}>{l}</button>
        ))}
      </div>
      <button className="btn btn-primary btn-sm" onClick={run} disabled={loading}>
        {loading ? 'Generating insights…' : '📊 Generate business summary'}
      </button>
    </AIPanel>
  );
}


// ── TRAINING DATA MANAGER ──
function TrainingManager() {
  const [data, setData] = useState(null);
  const [newQ, setNewQ] = useState('');
  const [newA, setNewA] = useState('');
  const [systemCtx, setSystemCtx] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    axios.get('/api/ai/training').then(r => {
      setData(r.data);
      setSystemCtx(r.data.system_context || '');
    }).catch(() => {});
  }, []);

  const addExample = () => {
    if (!newQ.trim() || !newA.trim()) return;
    setData(d => ({ ...d, examples: [...(d?.examples || []), { prompt: newQ, response: newA }] }));
    setNewQ(''); setNewA('');
  };

  const removeExample = (i) => setData(d => ({ ...d, examples: d.examples.filter((_, x) => x !== i) }));

  const save = async () => {
    setSaving(true);
    try {
      await axios.post('/api/ai/training', { examples: data?.examples || [], system_context: systemCtx });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch(e) { alert('Error saving'); }
    setSaving(false);
  };

  return (
    <div>
      <div style={{ background: 'var(--accent-light)', border: '1px solid var(--accent)', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 13 }}>
        💡 Training examples teach the AI about your shop's specific terminology, common repairs, and how you like responses formatted. When you update the AI model, these examples carry over automatically.
      </div>
      <div className="form-group">
        <label>Custom system context (describes your shop to the AI)</label>
        <textarea className="form-control" rows={3} value={systemCtx} onChange={e => setSystemCtx(e.target.value)}
          placeholder="e.g. We are a small IT repair shop specializing in laptops and desktops. We use the term 'job' instead of 'repair ticket'. Our most common repairs are screen replacements and virus removal." />
      </div>
      <div style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10 }}>Training examples ({data?.examples?.length || 0})</div>
      {(data?.examples || []).map((ex, i) => (
        <div key={i} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginBottom: 3 }}>Q: {ex.prompt}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>A: {ex.response}</div>
          <button className="btn btn-sm btn-danger" onClick={() => removeExample(i)}>Remove</button>
        </div>
      ))}
      <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '12px', marginBottom: 12 }}>
        <div className="form-group"><label>Example question / prompt</label><input className="form-control" value={newQ} onChange={e => setNewQ(e.target.value)} placeholder="e.g. What's your most common repair?" /></div>
        <div className="form-group"><label>Ideal answer</label><textarea className="form-control" rows={2} value={newA} onChange={e => setNewA(e.target.value)} placeholder="e.g. Screen replacements on laptops, followed by virus removal." /></div>
        <button className="btn btn-sm btn-primary" onClick={addExample} disabled={!newQ.trim() || !newA.trim()}>+ Add example</button>
      </div>
      <button className="btn btn-primary" onClick={save} disabled={saving}>{saved ? '✓ Saved!' : saving ? 'Saving…' : 'Save training data'}</button>
      {data?.last_updated && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>Last updated: {new Date(data.last_updated).toLocaleString()}</div>}
    </div>
  );
}

// ── RAM usage meter component ──
function RAMMeter() {
  const [ram, setRam] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetch = () => {
      axios.get('/api/ai/ram-stats')
        .then(r => { setRam(r.data); setError(false); })
        .catch(() => setError(true));
    };
    fetch();
    const t = setInterval(fetch, 3000); // update every 3s
    return () => clearInterval(t);
  }, []);

  const Bar = ({ label, used, total, color, sublabel }) => {
    if (!total) return null;
    const pct = Math.min(100, Math.round((used / total) * 100));
    const barColor = pct > 90 ? 'var(--danger)' : pct > 70 ? 'var(--warning)' : color || 'var(--accent)';
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>{label}</span>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: barColor }}>{used.toLocaleString()} MB</span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}> / {total.toLocaleString()} MB</span>
            <span style={{ fontSize: 11, color: barColor, marginLeft: 6, fontWeight: 700 }}>{pct}%</span>
          </div>
        </div>
        <div style={{ height: 10, background: 'var(--bg3)', borderRadius: 5, overflow: 'hidden', position: 'relative' }}>
          <div style={{
            height: '100%', width: `${pct}%`, borderRadius: 5,
            background: barColor,
            transition: 'width 0.6s ease, background 0.3s ease',
          }} />
        </div>
        {sublabel && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{sublabel}</div>}
      </div>
    );
  };

  if (error) return (
    <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 0' }}>
      RAM stats unavailable
    </div>
  );

  if (!ram) return (
    <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 0' }}>
      Loading RAM stats…
    </div>
  );

  return (
    <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '14px 16px', marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>💾 Live RAM usage</span>
        <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'monospace' }}>
          updates every 3s
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', marginLeft: 6, animation: 'aipulse 2s ease-in-out infinite' }} />
        </span>
      </div>

      {/* Ollama container RAM */}
      {ram.ollama_container_mb > 0 && (
        <Bar
          label={`🤖 Ollama${ram.ollama_container_name ? ` (${ram.ollama_container_name})` : ''}`}
          used={ram.ollama_container_mb}
          total={ram.ollama_limit_mb || ram.system_total_mb}
          color="var(--purple)"
          sublabel={ram.ollama_rss_mb > ram.ollama_container_mb
            ? `Total RSS: ${ram.ollama_rss_mb} MB (incl. shared/cache)`
            : `Working set memory`}
        />
      )}
      {ram.ollama_container_mb === 0 && ram.system_total_mb > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
          🤖 Ollama: not detected via Docker socket
        </div>
      )}

      {/* System RAM */}
      {ram.system_total_mb > 0 && (
        <Bar
          label="🖥️ System RAM"
          used={ram.system_used_mb}
          total={ram.system_total_mb}
          color="var(--accent)"
          sublabel={`${ram.system_available_mb.toLocaleString()} MB available`}
        />
      )}

      {/* Node.js heap */}
      <Bar
        label="⚙️ RepairShop (Node.js heap)"
        used={ram.node_heap_mb}
        total={Math.max(ram.node_heap_mb * 2, 256)}
        color="var(--teal, #0d9488)"
        sublabel="App server memory usage"
      />

      {/* Summary row */}
      {ram.system_total_mb > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {[
            ['Total', `${ram.system_total_mb.toLocaleString()} MB`],
            ['Used', `${ram.system_used_mb.toLocaleString()} MB`],
            ['Available', `${ram.system_available_mb.toLocaleString()} MB`],
            ...(ram.ollama_container_mb > 0 ? [['Ollama', `${ram.ollama_container_mb.toLocaleString()} MB`]] : []),
          ].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{l}</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── MODEL START/STOP ──
function ModelControls({ status, onRefresh }) {
  const [acting, setActing] = useState(null); // null | 'start' | 'unload' | 'restart'
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('info'); // 'info' | 'success' | 'error'

  const action = async (type) => {
    setActing(type);
    setMsg('');
    try {
      if (type === 'restart') {
        // Unload then re-load
        await axios.post('/api/ai/model-action', { action: 'unload', model: status?.model });
        setMsg('Unloaded — reloading model…');
        setMsgType('info');
        await new Promise(r => setTimeout(r, 1500));
        const r = await axios.post('/api/ai/model-action', { action: 'start', model: status?.model });
        setMsg(r.data.message || 'Model is loading into memory…');
        setMsgType('success');
      } else {
        const r = await axios.post('/api/ai/model-action', { action: type, model: status?.model });
        setMsg(r.data.message || 'Done');
        setMsgType('success');
      }
      // Refresh status after a short delay
      setTimeout(() => { onRefresh(); }, 3000);
      setTimeout(() => { setMsg(''); }, 8000);
    } catch(e) {
      setMsg(e.response?.data?.error || e.message);
      setMsgType('error');
    }
    setActing(null);
  };

  const isOnline = status?.online;
  const isLoaded = status?.model_ready;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 14 }}>⚙️ Ollama controls</div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        {/* START button — shown when Ollama is online but model not loaded */}
        <button
          className="btn"
          onClick={() => action('start')}
          disabled={!!acting || !isOnline}
          style={{
            background: 'var(--success)', color: '#fff', borderColor: 'var(--success)',
            padding: '10px 20px', fontSize: 14, fontWeight: 600,
            opacity: (!isOnline) ? 0.5 : 1,
          }}>
          {acting === 'start'
            ? <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                Starting…
              </span>
            : '▶ Start Ollama'}
        </button>

        {/* RESTART button — reload model from disk */}
        <button
          className="btn"
          onClick={() => action('restart')}
          disabled={!!acting || !isOnline}
          style={{
            background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)',
            padding: '10px 20px', fontSize: 14, fontWeight: 600,
            opacity: !isOnline ? 0.5 : 1,
          }}>
          {acting === 'restart'
            ? <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                Restarting…
              </span>
            : '🔄 Restart model'}
        </button>

        {/* UNLOAD button — free memory */}
        <button
          className="btn"
          onClick={() => action('unload')}
          disabled={!!acting || !isOnline || !isLoaded}
          style={{ padding: '10px 20px', fontSize: 14, opacity: (!isOnline || !isLoaded) ? 0.5 : 1 }}>
          {acting === 'unload'
            ? <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: 'var(--text)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                Unloading…
              </span>
            : '⏹ Unload from memory'}
        </button>

        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>

      {/* Status message */}
      {msg && (
        <div style={{
          padding: '9px 12px', borderRadius: 6, fontSize: 13,
          background: msgType === 'error' ? 'var(--danger-light)' : msgType === 'success' ? 'var(--success-light)' : 'var(--accent-light)',
          color: msgType === 'error' ? 'var(--danger)' : msgType === 'success' ? 'var(--success)' : 'var(--accent)',
          marginBottom: 8,
        }}>
          {msg}
        </div>
      )}

      {/* Guidance based on state */}
      <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.7 }}>
        {!isOnline && <div>⚠️ Ollama container is offline. Start it with <code style={{ background: 'var(--bg3)', padding: '1px 5px', borderRadius: 3 }}>docker compose up -d ollama</code> on TrueNAS.</div>}
        {isOnline && !isLoaded && <div>💡 Ollama is running but the model isn't loaded yet. Click <strong>▶ Start Ollama</strong> to load it into memory.</div>}
        {isOnline && isLoaded && <div>✓ Model is loaded and ready. Use <strong>Unload</strong> to free RAM, or <strong>Restart model</strong> to reload it fresh.</div>}
      </div>

      {/* Live RAM meter */}
      <RAMMeter />
    </div>
  );
}

// ── AI MODEL UPDATES ──
function ModelUpdates({ onRefresh }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(null);
  const [progress, setProgress] = useState('');

  const check = async () => {
    setLoading(true);
    try { const r = await axios.get('/api/ai/model-updates'); setData(r.data); } catch(e) { setData({ ollama_online: false, error: e.message }); }
    setLoading(false);
  };

  useEffect(() => { check(); }, []);

  const updateModel = async (model) => {
    setUpdating(model); setProgress('Starting download…');
    try {
      const response = await fetch('/api/ai/pull-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ model })
      });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
          try {
            const d = JSON.parse(line.slice(6));
            if (d.status === 'success') { setProgress('✓ Updated!'); check(); }
            else if (d.total && d.completed) { setProgress(`${d.status} — ${Math.round((d.completed/d.total)*100)}%`); }
            else if (d.status) setProgress(d.status);
          } catch(e) {}
        }
      }
    } catch(e) { setProgress(`Error: ${e.message}`); }
    setUpdating(null);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="btn btn-sm btn-primary" onClick={check} disabled={loading}>{loading ? 'Checking…' : '🔍 Check for model updates'}</button>
      </div>
      {data && (
        <div>
          {!data.ollama_online ? (
            <div style={{ color: 'var(--danger)', fontSize: 13 }}>Ollama offline: {data.error}</div>
          ) : (
            <div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>
                Pulling a model always fetches the latest version from Ollama's registry. Your training data carries over automatically.
              </div>
              {(data.installed || []).map(m => {
                const isActive = m.name === data.current_model || m.name.split(':')[0] === data.current_model.split(':')[0];
                return (
                  <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 8, background: isActive ? 'var(--success-light)' : 'var(--bg3)', borderRadius: 8, padding: '8px 12px', marginBottom: 6, border: `1px solid ${isActive ? 'var(--success)' : 'var(--border)'}` }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {m.name}
                        {isActive && <span style={{ fontSize: 10, background: 'var(--success)', color: '#fff', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>ACTIVE</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace' }}>{m.digest} · {(m.size/1e9).toFixed(1)}GB</div>
                    </div>
                    {!isActive && (
                      <button className="btn btn-sm" onClick={async () => {
                        try { await axios.post('/api/ai/set-model', { model: m.name }); onRefresh(); check(); }
                        catch(e) { alert('Error: ' + e.message); }
                      }} style={{ background: 'var(--accent-light)', color: 'var(--accent)', borderColor: 'var(--accent)' }}>
                        ✓ Use this
                      </button>
                    )}
                    <button className="btn btn-sm btn-primary" onClick={() => updateModel(m.name)} disabled={!!updating}>
                      {updating === m.name ? progress : '⬆️ Update'}
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={async () => {
                      if (!window.confirm(`Delete model ${m.name}?\n\nThis frees ${(m.size/1e9).toFixed(1)} GB of disk space. You can re-download it later.`)) return;
                      try {
                        await axios.delete('/api/ai/models/' + encodeURIComponent(m.name));
                        check();
                      } catch(e) { alert('Delete failed: ' + e.message); }
                    }} disabled={isActive} title={isActive ? 'Cannot delete active model' : 'Delete model'}>
                      🗑️
                    </button>
                  </div>
                );
              })}
              {data.installed?.length === 0 && <div style={{ fontSize: 13, color: 'var(--text3)' }}>No models installed yet. Download one below.</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── AI SETTINGS / MODEL MANAGER ──
export function AISettings() {
  const [status, setStatus] = useState(null);
  const [pulling, setPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState('');
  const [pullModel, setPullModel] = useState('llama3.2');
  const [aiTab, setAiTab] = useState('status');
  const eventSourceRef = useRef(null);

  const loadStatus = () => {
    axios.get('/api/ai/status').then(r => setStatus(r.data)).catch(() => setStatus({ online: false, error: 'Cannot connect to Ollama' }));
  };

  useEffect(() => {
    loadStatus();
    // Auto-refresh every 5 seconds so state updates live
    const t = setInterval(loadStatus, 5000);
    return () => clearInterval(t);
  }, []);

  const pullModelFn = async () => {
    setPulling(true);
    setPullProgress('Starting download…');
    try {
      const response = await fetch('/api/ai/pull-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ model: pullModel })
      });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.status === 'success') { setPullProgress('✓ Model downloaded successfully!'); loadStatus(); }
            else if (data.total && data.completed) { const pct = Math.round((data.completed / data.total) * 100); setPullProgress(`${data.status} — ${pct}%`); }
            else if (data.status) { setPullProgress(data.status); }
          } catch(e) {}
        }
      }
    } catch(e) { setPullProgress(`Error: ${e.message}`); }
    setPulling(false);
  };

  const MODELS = [
    { value: 'llama3.2', label: 'Llama 3.2 (3B) — Recommended, fast, ~2GB', size: '~2GB' },
    { value: 'llama3.2:1b', label: 'Llama 3.2 (1B) — Smallest, very fast, ~800MB', size: '~800MB' },
    { value: 'llama3.1:8b', label: 'Llama 3.1 (8B) — Smarter, slower, ~5GB', size: '~5GB' },
    { value: 'mistral', label: 'Mistral 7B — Good all-rounder, ~4GB', size: '~4GB' },
    { value: 'phi3', label: 'Phi-3 Mini — Microsoft model, very fast, ~2GB', size: '~2GB' },
    { value: 'deepseek-r1:7b', label: 'DeepSeek R1 7B — Strong reasoning, ~5GB', size: '~5GB' },
  ];

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 16 }}>
        {[['status','🤖 Status & Models'],['training','🎓 Training'],['updates','⬆️ Model updates']].map(([id,label]) => (
          <button key={id} className={`tab ${aiTab===id ? 'active' : ''}`} onClick={() => setAiTab(id)}>{label}</button>
        ))}
      </div>

      {aiTab === 'training' && <TrainingManager />}
      {aiTab === 'updates' && <ModelUpdates onRefresh={loadStatus} />}
      {aiTab === 'status' && <div>
      {/* ── Ollama status panel ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>🤖 Ollama status</div>
          <button className="btn btn-sm" onClick={loadStatus}>↻ Refresh</button>
        </div>

        {/* Big status indicator */}
        {(() => {
          const state = getOllamaState(status, false);
          const cfg = STATE_CONFIG[state];
          const stateDetails = {
            off:     { icon: '⏹', desc: 'Ollama container is not running or unreachable.', action: 'Start it with: docker compose up -d ollama' },
            loading: { icon: '⏳', desc: 'Ollama is starting up or the model is loading into memory.', action: 'This can take 30–60 seconds on first start.' },
            running: { icon: '▶', desc: 'Ollama is running and the model is loaded in memory.', action: 'AI features are fully available.' },
            error:   { icon: '⚠️', desc: status?.error || 'An error occurred communicating with Ollama.', action: 'Check the Troubleshooting tab for logs.' },
          };
          const detail = stateDetails[state];

          return (
            <div>
              {/* Status banner */}
              <div style={{
                background: cfg.bg, border: `1px solid ${cfg.border}`,
                borderRadius: 10, padding: '16px 20px', marginBottom: 16,
                display: 'flex', alignItems: 'center', gap: 16,
              }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: cfg.dot, opacity: 0.15,
                    position: 'absolute', top: '50%', left: '50%',
                    transform: 'translate(-50%,-50%)',
                    animation: cfg.pulse ? 'ringpulse 2s ease-in-out infinite' : 'none',
                  }} />
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: cfg.dot, position: 'relative', zIndex: 1,
                    animation: cfg.pulse ? 'aipulse 2s ease-in-out infinite' : 'none',
                  }} />
                  <style>{`
                    @keyframes ringpulse{0%,100%{transform:translate(-50%,-50%) scale(1);opacity:.15}50%{transform:translate(-50%,-50%) scale(1.8);opacity:0}}
                    @keyframes aipulse{0%,100%{opacity:1}50%{opacity:.5}}
                  `}</style>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 18, color: cfg.color, marginBottom: 3 }}>
                    {detail.icon} {cfg.label}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text2)' }}>{detail.desc}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>{detail.action}</div>
                </div>
              </div>

              {/* 4-state chips */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {(['off','loading','running','error']).map(s => {
                  const c = STATE_CONFIG[s];
                  const isActive = state === s;
                  return (
                    <div key={s} style={{
                      flex: 1, padding: '8px 10px', borderRadius: 8, textAlign: 'center',
                      background: isActive ? c.bg : 'var(--bg3)',
                      border: `1px solid ${isActive ? c.border : 'var(--border)'}`,
                      opacity: isActive ? 1 : 0.4, transition: 'all .2s',
                    }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot, margin: '0 auto 5px' }} />
                      <div style={{ fontSize: 11, fontWeight: 600, color: isActive ? c.color : 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{s}</div>
                    </div>
                  );
                })}
              </div>

              {/* Model details when running */}
              {status?.online && (
                <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>Active model</div>
                      <code style={{ fontSize: 12, background: 'var(--bg2)', padding: '2px 8px', borderRadius: 4 }}>{status.model}</code>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>Model in memory</div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: status.model_ready ? 'var(--success)' : 'var(--warning)' }}>
                        {status.model_ready ? '✓ Loaded' : '⏳ Not loaded'}
                      </span>
                    </div>
                    {status.available_models?.length > 0 && (
                      <div style={{ gridColumn: '1/-1' }}>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>Downloaded models</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {status.available_models.map(m => (
                            <span key={m} style={{ fontSize: 11, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 7px', fontFamily: 'monospace' }}>{m}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Model start/stop controls */}
      <ModelControls status={status} onRefresh={loadStatus} />

      {/* Model downloader */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14 }}>⬇️ Download / switch model</div>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.6 }}>
          Models are downloaded once and stored on TrueNAS. Larger models are smarter but slower — start with Llama 3.2 (3B).
        </p>
        <div className="form-group">
          <label>Select model</label>
          <select className="form-control" value={pullModel} onChange={e => setPullModel(e.target.value)} disabled={pulling}>
            {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        {pullProgress && (
          <div style={{ background: 'var(--bg3)', padding: '10px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13, fontFamily: 'monospace' }}>
            {pullProgress}
          </div>
        )}
        <button className="btn btn-primary" onClick={pullModelFn} disabled={pulling || !status?.online}>
          {pulling ? '⬇️ Downloading…' : `⬇️ Download ${pullModel}`}
        </button>
        {!status?.online && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>Start Ollama first before downloading models.</div>}
      </div>

      {/* Info card */}
      <div className="card" style={{ background: 'var(--bg3)' }}>
        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>ℹ️ About Ollama</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.8 }}>
          <div>• Runs entirely on your TrueNAS box — no internet required after model download</div>
          <div>• Zero cost — no API keys, no subscriptions, no usage limits</div>
          <div>• Your repair data never leaves your network</div>
          <div>• Models are stored at <code style={{ fontSize: 11, background: 'var(--bg2)', padding: '1px 5px', borderRadius: 3 }}>/mnt/tank/ollama-models</code></div>
          <div>• Runs on CPU — no GPU required (GPU makes it faster if available)</div>
          <div style={{ marginTop: 8, color: 'var(--text3)', fontSize: 12 }}>First response after startup may take 30–60 seconds while the model loads into memory. Subsequent responses are faster.</div>
        </div>
      </div>
      </div>}
    </div>
  );
}
