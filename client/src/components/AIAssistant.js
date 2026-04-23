import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAI } from '../context/AIContext';

// ── Helpers ──
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

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ── Shared UI Components ──

export function SpeechButton({ onTranscript, style }) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false; recognition.interimResults = false; recognition.lang = 'en-US';
      recognition.onresult = (event) => { onTranscript?.(event.results[0][0].transcript); setListening(false); };
      recognition.onerror = () => setListening(false);
      recognition.onend = () => setListening(false);
      recognitionRef.current = recognition;
    }
  }, [onTranscript]);
  const toggle = () => {
    if (!recognitionRef.current) return alert('Speech recognition not supported.');
    if (listening) { recognitionRef.current.stop(); setListening(false); }
    else { recognitionRef.current.start(); setListening(true); }
  };
  return (
    <button type="button" onClick={toggle} className={`btn btn-sm ${listening ? 'btn-danger' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, padding: 0, borderRadius: '50%', ...style }}>
      {listening ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', animation: 'aipulse 1s infinite' }} /> : '🎤'}
    </button>
  );
}

export function MagicWandButton({ value, onExpanded, style, deviceType, repairTitle }) {
  const [loading, setLoading] = useState(false);
  const expand = async () => {
    if (!value?.trim()) return;
    setLoading(true);
    try {
      const r = await axios.post('/api/ai/format-notes', { raw_notes: value, device_type: deviceType || '', repair_title: repairTitle || '' });
      onExpanded?.(r.data.result);
    } catch(e) { alert('Expansion failed'); }
    setLoading(false);
  };
  return (
    <button type="button" onClick={expand} disabled={loading || !value?.trim()} className="btn btn-sm" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, padding: 0, borderRadius: '50%', background: 'var(--purple-light)', color: 'var(--purple)', borderColor: 'var(--purple)', ...style }}>
      {loading ? '…' : '✨'}
    </button>
  );
}

export function AIStatusBadge({ onClick }) {
  const [status, setStatus] = useState(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    const check = () => { setChecking(true); axios.get('/api/ai/status').then(r => { setStatus(r.data); setChecking(false); }).catch(() => { setStatus({ online: false }); setChecking(false); }); };
    check(); const t = setInterval(check, 30000); return () => clearInterval(t);
  }, []);
  const state = getOllamaState(status, checking);
  const cfg = STATE_CONFIG[state];
  return (
    <button onClick={onClick} className="btn btn-sm" style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, opacity: cfg.pulse ? 0.8 : 1 }} />
      🤖 {cfg.label}
    </button>
  );
}

function TypewriterText({ text, speed = 8 }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDisplayed(''); setDone(false); if (!text) return;
    let i = 0; const interval = setInterval(() => { i += speed; if (i >= text.length) { setDisplayed(text); setDone(true); clearInterval(interval); } else { setDisplayed(text.slice(0, i)); } }, 16);
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

function AIPanel({ title, icon, loading, result, error, children, onUse, extraHeader }) {
  const copy = () => { navigator.clipboard.writeText(result).then(() => alert('Copied!')); };
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ background: 'var(--bg3)', padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{title}</span>
        {extraHeader}
        {result && (
          <>
            <button className="btn btn-sm" onClick={copy}>📋 Copy</button>
            {onUse && <button className="btn btn-sm btn-primary" onClick={() => onUse(result)}>Use this →</button>}
          </>
        )}
      </div>
      <div style={{ padding: '14px' }}>
        {children}
        {loading && <div style={{ color: 'var(--text3)', fontSize: 13 }}>AI is thinking…</div>}
        {error && <div style={{ background: 'var(--danger-light)', color: 'var(--danger)', padding: '10px 12px', borderRadius: 6, fontSize: 13 }}>❌ {error}</div>}
        {result && !loading && (
          <div>
            <TypewriterText text={result} />
            <div style={{ marginTop: 16, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>⚠️ double check ai documentsition, AI can make mistakes</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Feature Components ──

export function RepairDiagnosis({ repair, onUseNotes }) {
  const [loading, setLoading] = useState(false); const [result, setResult] = useState(''); const [error, setError] = useState(''); const [symptoms, setSymptoms] = useState(repair?.description || '');
  const [image, setImage] = useState(null);
  const run = async () => {
    setLoading(true); setResult(''); setError(''); try {
      const fd = new FormData(); fd.append('device_type', repair?.device_type || ''); fd.append('device_brand', repair?.device_brand || ''); fd.append('device_model', repair?.device_model || ''); fd.append('symptoms', symptoms); if (image) fd.append('image', image);
      const r = await axios.post('/api/ai/diagnose', fd, { headers: { 'Content-Type': 'multipart/form-data' } }); setResult(r.data.result);
    } catch(e) { setError(e.response?.data?.error || e.message); } setLoading(false);
  };
  return (
    <AIPanel title="AI repair diagnosis" icon="🔧" loading={loading} result={result} error={error} onUse={onUseNotes}>
      <div className="form-group"><div className="flex-between"><label>Symptoms</label><SpeechButton onTranscript={t => setSymptoms(s => s + ' ' + t)} /></div>
        <textarea className="form-control" rows={3} value={symptoms} onChange={e => setSymptoms(e.target.value)} />
      </div>
      <div className="form-group"><label>Attach photo (optional)</label><input type="file" onChange={e => setImage(e.target.files[0])} /></div>
      <button className="btn btn-primary btn-sm" onClick={run} disabled={loading || !symptoms.trim()}>Get diagnosis</button>
    </AIPanel>
  );
}

export function NoteFormatter({ repair, onUseNotes }) {
  const [loading, setLoading] = useState(false); const [result, setResult] = useState(''); const [error, setError] = useState(''); const [raw, setRaw] = useState('');
  const run = async () => {
    setLoading(true); try { const r = await axios.post('/api/ai/format-notes', { raw_notes: raw, device_type: repair?.device_type }); setResult(r.data.result); } catch(e) { setError(e.message); } setLoading(false);
  };
  return (
    <AIPanel title="Format notes" icon="📝" loading={loading} result={result} error={error} onUse={onUseNotes}>
      <textarea className="form-control" rows={3} value={raw} onChange={e => setRaw(e.target.value)} placeholder="Paste shorthand notes…" />
      <button className="btn btn-primary btn-sm mt-2" onClick={run} disabled={loading || !raw.trim()}>Format</button>
    </AIPanel>
  );
}

export function CustomerMessage({ repairId }) {
  const [loading, setLoading] = useState(false); const [result, setResult] = useState(''); const [type, setType] = useState('status_update');
  const run = async () => {
    setLoading(true); try { const r = await axios.post('/api/ai/customer-message', { repair_id: repairId, message_type: type }); setResult(r.data.result); } catch(e) { alert(e.message); } setLoading(false);
  };
  return (
    <AIPanel title="Draft message" icon="📞" loading={loading} result={result}>
      <select className="form-control mb-3" value={type} onChange={e => setType(e.target.value)}>
        <option value="status_update">Status Update</option>
        <option value="ready_pickup">Ready for Pickup</option>
        <option value="follow_up">Follow Up</option>
      </select>
      <button className="btn btn-primary btn-sm" onClick={run} disabled={loading}>Draft</button>
    </AIPanel>
  );
}

export function ReorderSuggestions() {
  const [loading, setLoading] = useState(false); const [result, setResult] = useState('');
  const run = async () => {
    setLoading(true); try { const r = await axios.post('/api/ai/reorder-suggestions'); setResult(r.data.result); } catch(e) { alert(e.message); } setLoading(false);
  };
  return (
    <AIPanel title="Inventory suggestions" icon="📦" loading={loading} result={result}>
      <button className="btn btn-primary btn-sm" onClick={run} disabled={loading}>Analyze Inventory</button>
    </AIPanel>
  );
}

export function BusinessInsights() {
  const [loading, setLoading] = useState(false); const [result, setResult] = useState(''); const [period, setPeriod] = useState('month');
  const run = async () => {
    setLoading(true); try { const r = await axios.post('/api/ai/insights', { period }); setResult(r.data.result); } catch(e) { alert(e.message); } setLoading(false);
  };
  return (
    <AIPanel title="Business insights" icon="📊" loading={loading} result={result}>
      <div className="flex gap-2 mb-3">
        {['week','month','year'].map(p => <button key={p} className={`btn btn-xs ${period===p?'btn-primary':''}`} onClick={() => setPeriod(p)}>{p.toUpperCase()}</button>)}
      </div>
      <button className="btn btn-primary btn-sm" onClick={run} disabled={loading}>Generate Insights</button>
    </AIPanel>
  );
}

// ── Internal Layout Components ──

function AITrainerChat() {
  const { messages, setMessages, inputDraft, setInputDraft } = useAI();
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  const send = async () => {
    if (!inputDraft.trim() || loading) return;
    const userMsg = inputDraft.trim();
    setInputDraft('');
    
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);
    try {
      const r = await axios.post('/api/ai/chat', { message: userMsg, history: messages.slice(-6) });
      setMessages(prev => [...prev, { role: 'ai', content: r.data.result }]);
    } catch(e) {
      setMessages(prev => [...prev, { role: 'error', content: e.message }]);
    }
    setLoading(false);
  };
  const saveAsGuide = async (msg) => {
    const brand = window.prompt('System / Brand:');
    const model = window.prompt('Model:');
    const issue = window.prompt('Repair Type / Issue:');
    if (!brand || !model || !issue) return;
    try { await axios.post('/api/ai/guides', { brand, model, issue, content: msg, source: 'AI Chat' }); alert('Saved to Guides ✓'); } catch(e) { alert('Save failed'); }
  };
  return (
    <div style={{ background: 'var(--bg2)', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', height: 500 }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }} ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 14, textAlign: m.role === 'user' ? 'right' : 'left' }}>
            <div style={{ display: 'inline-block', maxWidth: '85%', padding: '8px 12px', borderRadius: 12, background: m.role === 'user' ? 'var(--accent)' : 'var(--bg3)', color: m.role === 'user' ? '#fff' : 'var(--text)', fontSize: 13 }}>
              {m.content}
              {m.role === 'ai' && <button className="btn btn-xs mt-2" style={{ display: 'block' }} onClick={() => saveAsGuide(m.content)}>💾 Save as Guide</button>}
            </div>
          </div>
        ))}
      </div>
      <div className="flex p-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg1)' }}>
        <input className="form-control" value={inputDraft} onChange={e => setInputDraft(e.target.value)} onKeyDown={e => e.key==='Enter' && send()} placeholder="Ask RepairBot…" />
        <button className="btn btn-primary" onClick={send}>Send</button>
      </div>
    </div>
  );
}

function TrainingManager() {
  const [data, setData] = useState(null); const [systemCtx, setSystemCtx] = useState(''); const [saving, setSaving] = useState(false); const [uploading, setUploading] = useState(false);
  const [assets, setAssets] = useState([]);

  const load = () => {
    axios.get('/api/ai/training').then(r => { setData(r.data); setSystemCtx(r.data.system_context || ''); });
    axios.get('/api/ai/guides').then(r => setAssets(r.data.filter(g => g.is_disk_file)));
  };
  useEffect(() => { load(); }, []);

  const onFileUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return; setUploading(true);
    const fd = new FormData(); fd.append('file', file);
    try { await axios.post('/api/ai/training/upload', fd); alert('Knowledge Base updated! AI will now use this document for all future repairs. ✓'); load(); } catch(e) { alert('Upload failed: ' + (e.response?.data?.error || e.message)); }
    setUploading(false);
  };

  const save = async () => { setSaving(true); try { await axios.post('/api/ai/training', { examples: data?.examples || [], system_context: systemCtx }); alert('Saved ✓'); } catch(e) { alert('Save failed'); } setSaving(false); };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      <div>
        <div style={{ fontWeight: 700, marginBottom: 14 }}>🎓 Training & Documentation</div>
        
        <div className="card mb-3">
          <label className="text-sm font-bold block mb-2">Upload Docs (TXT/PDF/JPG)</label>
          <input type="file" accept=".txt,.md,.pdf,.jpg,.jpeg,.png" onChange={onFileUpload} disabled={uploading} />
          {uploading && <div className="text-sm mt-1">AI is reading and learning from document…</div>}
        </div>

        <div className="form-group"><label>Custom Shop Context</label><textarea className="form-control" rows={8} value={systemCtx} onChange={e => setSystemCtx(e.target.value)} /></div>
        <button className="btn btn-primary w-full mb-4" onClick={save} disabled={saving}>Save Training</button>

        {/* ── Downloaded Assets Gallery ── */}
        <div className="card" style={{ border: '1px dashed var(--accent)', background: 'var(--accent-light)' }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>📁 Technical Assets Knowledge Base</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8 }}>
            {assets.slice(0, 12).map(a => (
              <div key={a.id} title={a.device_model} style={{ 
                aspectRatio: '1', borderRadius: 6, background: 'var(--bg2)', border: '1px solid var(--border)', 
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, cursor: 'help', overflow: 'hidden'
              }}>
                {a.mime_type?.startsWith('image/') || a.device_brand === 'Image Asset' ? '🖼️' : 
                 a.mime_type === 'application/pdf' || a.device_brand === 'PDF Manual' ? '📄' : '📝'}
              </div>
            ))}
            {assets.length === 0 && <div style={{ gridColumn: 'span 10', fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: '10px 0' }}>No assets downloaded or uploaded yet.</div>}
          </div>
          <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 10, textAlign: 'center', fontWeight: 600 }}>Documents & schematics AI has learned</div>
        </div>
      </div>
      <div><div style={{ fontWeight: 700, marginBottom: 14 }}>💬 Test AI</div><AITrainerChat /></div>
    </div>
  );
}

function RepairGuidesTab() {
  const [guides, setGuides] = useState([]); const [loading, setLoading] = useState(true); const [q, setQ] = useState(''); const [selected, setSelected] = useState(null);
  const [showTrash, setShowTrash] = useState(false);
  const [filters, setFilters] = useState({ brand: '', model: '', type: '', source: '' });

  const load = useCallback(async () => {
    setLoading(true); try {
      let url = `/api/ai/guides?q=${encodeURIComponent(q)}&brand=${filters.brand}&model=${filters.model}&type=${filters.type}&source=${filters.source}`;
      if (showTrash) url += '&include_deleted=1';
      const r = await axios.get(url); setGuides(r.data);
    } catch(e) {} setLoading(false);
  }, [q, filters, showTrash]);

  useEffect(() => { load(); }, [load]);

  const deleteGuide = async (id) => { if(!window.confirm('Move to trash?')) return; await axios.delete(`/api/ai/guides/${id}`); load(); setSelected(null); };
  const restoreGuide = async (id) => { await axios.post(`/api/ai/guides/${id}/restore`); load(); setSelected(null); };
  const download = (g) => { window.open(`/api/ai/guides/${g.id}/download`, '_blank'); };

  const handleUpload = async (e) => {
    const file = e.target.files[0]; if(!file) return;
    const brand = window.prompt('Brand:'); const model = window.prompt('Model:'); const type = window.prompt('Repair Type:');
    const fd = new FormData(); fd.append('file', file); fd.append('brand', brand); fd.append('model', model); fd.append('issue', type);
    try { await axios.post('/api/ai/guides', fd); load(); } catch(e) { alert('Upload failed'); }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selected ? '350px 1fr' : '1fr', gap: 20 }}>
      <div style={{ minWidth: 0 }}>
        <div className="flex mb-3" style={{ gap: 8 }}>
          <input className="form-control" value={q} onChange={e => setQ(e.target.value)} placeholder="Search guides…" />
          <button className={`btn btn-sm ${showTrash ? 'btn-danger' : ''}`} onClick={() => setShowTrash(!showTrash)}>{showTrash ? '🗑️ Trash' : '📚 Active'}</button>
          <label className="btn btn-sm btn-primary">➕ Upload <input type="file" style={{ border: 'none', display: 'none' }} onChange={handleUpload} /></label>
        </div>
        <div className="grid-2 mb-3">
          <input className="form-control form-control-sm" placeholder="System" value={filters.brand} onChange={e => setFilters({...filters, brand: e.target.value})} />
          <input className="form-control form-control-sm" placeholder="Model" value={filters.model} onChange={e => setFilters({...filters, model: e.target.value})} />
        </div>
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {loading ? <div>Loading…</div> : guides.map(g => (
            <div key={g.id} onClick={() => setSelected(g)} style={{ padding: 12, background: selected?.id===g.id ? 'var(--accent-light)' : 'var(--bg3)', borderRadius: 8, marginBottom: 8, cursor: 'pointer', border: `1px solid ${selected?.id===g.id ? 'var(--accent)' : 'var(--border)'}` }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{g.device_brand} {g.device_model}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>{g.issue}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>Added: {new Date(g.created_at).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      </div>
      {selected && (
        <div className="card">
          <div className="flex-between mb-4">
            <div>
              <h2 style={{ fontSize: 18 }}>{selected.device_brand} {selected.device_model}</h2>
              <div className="text-sm text-muted">Naming: {selected.device_brand}-{selected.device_model}-{selected.created_at?.split('T')[0]}-{selected.issue}</div>
            </div>
            <div className="flex">
              <button className="btn btn-sm" onClick={() => download(selected)}>💾 Download</button>
              {showTrash ? <button className="btn btn-sm btn-primary" onClick={() => restoreGuide(selected.id)}>Restore</button> : <button className="btn btn-sm btn-danger" onClick={() => deleteGuide(selected.id)}>🗑️ Delete</button>}
              <button className="btn btn-sm" onClick={() => setSelected(null)}>✕</button>
            </div>
          </div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.8 }}>{selected.guide_content}
            <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 12, fontSize: 11, fontStyle: 'italic', color: 'var(--text3)' }}>⚠️ double check ai documentsition, AI can make mistakes</div>
          </div>
        </div>
      )}
    </div>
  );
}

function CircularGauge({ percent, label, sublabel, color = 'var(--accent)' }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  
  return (
    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: 90, height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="90" height="90" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="50" cy="50" r={radius} fill="transparent" stroke="var(--bg3)" strokeWidth="8" />
          <circle 
            cx="50" cy="50" r={radius} fill="transparent" stroke={color} strokeWidth="8" 
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{Math.round(percent)}%</div>
          <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase' }}>{label}</div>
        </div>
      </div>
      {sublabel && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4, fontWeight: 500, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sublabel}</div>}
    </div>
  );
}

function HardwareStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const load = () => {
    setLoading(true);
    axios.get('/api/ai/ram-stats').then(r => { setStats(r.data); setLoading(false); }).catch(() => setLoading(false));
  };
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);
  
  if (!stats) return null;

  const ramUsage = Math.round((stats.system_used_mb / stats.system_total_mb) * 100) || 0;
  const diskUsage = Math.round((stats.system_storage?.used_gb / stats.system_storage?.total_gb) * 100) || 0;
  const gpuUsage = stats.gpu ? parseInt(stats.gpu.load) : 0;
  const vramUsage = stats.gpu ? Math.round((stats.gpu.used_mb / stats.gpu.total_mb) * 100) : 0;

  return (
    <div className="mt-4">
      <div className="card mb-4">
        <div className="flex-between mb-4">
          <div className="text-sm font-bold flex-center gap-2">📊 System Performance <span className="badge badge-xs">{stats.cpu?.cores} Cores</span></div>
          <button className={`btn btn-icon btn-xs ${loading ? 'spinning' : ''}`} onClick={load}>↻</button>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 16, padding: '10px 0' }}>
          <CircularGauge percent={stats.cpu?.load || 0} label="CPU" sublabel={stats.cpu?.model?.split('@')[0]?.trim() || 'Processor'} color="#3b82f6" />
          <CircularGauge percent={ramUsage} label="RAM" sublabel={`${(stats.system_used_mb/1024).toFixed(1)} / ${(stats.system_total_mb/1024).toFixed(0)} GB`} color="#8b5cf6" />
          {stats.gpu ? (
            <CircularGauge percent={gpuUsage} label="GPU" sublabel={stats.gpu.name} color="#10b981" />
          ) : (
            <CircularGauge percent={vramUsage} label="VRAM" sublabel="No GPU" color="#f59e0b" />
          )}
          <CircularGauge percent={diskUsage} label="DISK" sublabel={`${stats.system_storage?.used_gb} / ${stats.system_storage?.total_gb} GB`} color="#ef4444" />
        </div>
      </div>

      <div className="grid-2" style={{ gap: 16 }}>
        <div className="card">
          <div className="text-sm font-bold mb-3">🖥️ Hardware Specs</div>
          <div className="text-xs space-y-2">
            <div className="flex-between"><span className="text-muted">CPU Model:</span> <span className="font-bold text-right" style={{maxWidth: '60%'}}>{stats.cpu?.model}</span></div>
            <div className="flex-between"><span className="text-muted">Total RAM:</span> <span className="font-bold">{(stats.system_total_mb/1024).toFixed(1)} GB</span></div>
            <div className="flex-between"><span className="text-muted">GPU Type:</span> <span className="font-bold">{stats.gpu ? stats.gpu.type : 'Integrated/None'}</span></div>
            <div className="flex-between"><span className="text-muted">Root Storage:</span> <span className="font-bold">{stats.system_storage?.total_gb} GB</span></div>
          </div>
        </div>
        <div className="card">
          <div className="text-sm font-bold mb-3">📦 AI Data Index</div>
          <div className="grid-2 text-xs" style={{ gap: '6px 12px' }}>
            <div className="text-muted">Models Size:</div><div className="font-bold">{formatSize(stats.storage?.models_bytes)}</div>
            <div className="text-muted">Guides:</div><div className="font-bold">{stats.storage?.count_guides} ({formatSize(stats.storage?.guides_bytes)})</div>
            <div className="text-muted">Training Data:</div><div className="font-bold">{formatSize(stats.storage?.training_bytes)}</div>
            <div className="text-muted">Ollama Process:</div><div className="font-bold">{stats.ollama_rss_mb} MB</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AISettings() {
  const [status, setStatus] = useState(null); 
  const [modelInfo, setModelInfo] = useState({ installed: [], running: [], current_model: '' });
  const [pulling, setPulling] = useState(false); 
  const [pullProgress, setPullProgress] = useState(''); 
  const [pullModel, setPullModel] = useState('llama3.2');
  const [aiTab, setAiTab] = useState('status');
  const [config, setConfig] = useState({ ai_mode: 'offline', ai_cloud_provider: 'openai', ai_cloud_key: '', ai_search_provider: 'serper', ai_search_key: '', ai_auto_research: 0, ollama_url: '' });
  const [actionLoading, setActionLoading] = useState(null);
  const [connectLog, setConnectLog] = useState([]);
  const [checking, setChecking] = useState(false);

  const loadStatus = async () => {
    setChecking(true);
    try {
      const r = await axios.get('/api/ai/status');
      setStatus(r.data);
      if (r.data.online) {
        setConnectLog(prev => [...prev.slice(-9), `> [${new Date().toLocaleTimeString()}] Connected to Ollama at ${r.data.ollama_url}`]);
      } else {
        setConnectLog(prev => [...prev.slice(-9), `> [${new Date().toLocaleTimeString()}] Error: ${r.data.error || 'Ollama offline'}`]);
      }
    } catch (e) {
      setStatus({ online: false });
      setConnectLog(prev => [...prev.slice(-9), `> [${new Date().toLocaleTimeString()}] Connection failed: ${e.message}`]);
    }
    setChecking(false);
    axios.get('/api/ai/model-updates').then(r => setModelInfo(r.data)).catch(() => {});
  };

  useEffect(() => {
    loadStatus(); axios.get('/api/settings').then(r => r.data && setConfig({ ai_mode: r.data.ai_mode || 'offline', ai_cloud_provider: r.data.ai_cloud_provider || 'openai', ai_cloud_key: r.data.ai_cloud_key || '', ai_search_provider: r.data.ai_search_provider || 'serper', ai_search_key: r.data.ai_search_key || '', ai_auto_research: r.data.ai_auto_research || 0, ollama_url: r.data.ollama_url || '' }));
    const t = setInterval(loadStatus, 10000); return () => clearInterval(t);
  }, []);

  const saveConfig = async () => { try { await axios.put('/api/settings', config); alert('Saved ✓'); } catch(e) { alert('Failed'); } };
  
  const modelAction = async (model, action) => {
    setActionLoading(model + action);
    try {
      await axios.post('/api/ai/model-action', { model, action });
      loadStatus();
    } catch(e) { alert('Action failed'); }
    setActionLoading(null);
  };

  const setDefaultModel = async (model) => {
    try {
      await axios.post('/api/ai/set-model', { model });
      loadStatus();
      alert(`Default model set to: ${model}`);
    } catch(e) { alert('Failed to set default'); }
  };

  const pullModelFn = async () => {
    setPulling(true); setPullProgress('Starting…'); try {
      const response = await fetch('/api/ai/pull-model', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify({ model: pullModel }) });
      const reader = response.body.getReader(); const decoder = new TextDecoder();
      while(true) { const {done, value} = await reader.read(); if(done) break; const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data: ')); for(const l of lines) { try { const d = JSON.parse(l.slice(6)); if(d.status==='success') { setPullProgress('✓ Done'); loadStatus(); } else if(d.total) setPullProgress(`${d.status} — ${Math.round((d.completed/d.total)*100)}%`); else setPullProgress(d.status); } catch(e) {} } }
    } catch(e) { setPullProgress('Error'); } setPulling(false);
  };

  return (
    <div>
      <div className="tabs mb-4">
        {[['status','🤖 Status'],['training','🎓 Training'],['guides','📚 Guides']].map(([id,label]) => (
          <button key={id} className={`tab ${aiTab===id ? 'active' : ''}`} onClick={() => setAiTab(id)}>{label}</button>
        ))}
      </div>
      {aiTab==='training' && <TrainingManager />}
      {aiTab==='guides' && <RepairGuidesTab />}
      {aiTab==='status' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 20 }}>
          <div>
            <div className="card mb-3">
              <div className="flex-between mb-3"><div style={{ fontWeight: 700 }}>🤖 Ollama Management & RAM</div><button className="btn btn-sm" onClick={loadStatus}>↻ Refresh</button></div>
              
              <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                {modelInfo.installed?.map(m => {
                  const isRunning = modelInfo.running?.some(r => r.name === m.name);
                  const isDefault = modelInfo.current_model === m.name;
                  return (
                    <div key={m.name} style={{ padding: 14, background: 'var(--bg3)', borderRadius: 10, marginBottom: 10, border: isDefault ? '2px solid var(--accent)' : '1px solid var(--border)' }}>
                      <div className="flex-between">
                        <div>
                          <div style={{ fontWeight: 700 }}>{m.name} {isDefault && <span className="badge" style={{ background: 'var(--accent)', color: '#fff', fontSize: 10 }}>DEFAULT</span>}</div>
                          <div style={{ fontSize: 11, color: 'var(--text3)' }}>Size: {formatSize(m.size)} • Type: {m.details?.family || 'N/A'}</div>
                          {isRunning && <div className="badge badge-success" style={{ fontSize: 9, marginTop: 4 }}>⚡ LOADED IN RAM</div>}
                        </div>
                        <div className="flex" style={{ gap: 6 }}>
                          {!isDefault && <button className="btn btn-xs" onClick={() => setDefaultModel(m.name)}>Set Default</button>}
                          {isRunning ? (
                            <button className="btn btn-xs btn-danger" onClick={() => modelAction(m.name, 'unload')} disabled={actionLoading === m.name + 'unload'}>
                              {actionLoading === m.name + 'unload' ? '…' : 'Unload'}
                            </button>
                          ) : (
                            <button className="btn btn-xs btn-primary" onClick={() => modelAction(m.name, 'load')} disabled={actionLoading === m.name + 'load'}>
                              {actionLoading === m.name + 'load' ? '…' : 'Load to RAM'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {(!modelInfo.installed || modelInfo.installed.length === 0) && (
                  <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>No models installed yet. Use the download tool on the right.</div>
                )}
              </div>
              <HardwareStats />
            </div>
          </div>

          <div>
            <div className="card mb-3">
              <div style={{ fontWeight: 700, marginBottom: 12 }}>🌐 AI Mode & Connection</div>
              <div className="form-group">
                <label className="text-sm">Connectivity Mode</label>
                <select className="form-control mb-2" value={config.ai_mode} onChange={e => setConfig({...config, ai_mode: e.target.value})}>
                  <option value="offline">Offline (Local Ollama)</option>
                  <option value="cloud">Cloud AI (Gemini/OpenAI)</option>
                </select>
              </div>

              {config.ai_mode === 'cloud' && (
                <div style={{ background: 'var(--bg3)', padding: 12, borderRadius: 8, marginTop: 10, border: '1px solid var(--border)' }}>
                  <div className="form-group">
                    <label className="text-sm">Cloud Provider</label>
                    <select className="form-control mb-2" value={config.ai_cloud_provider} onChange={e => setConfig({...config, ai_cloud_provider: e.target.value})}>
                      <option value="gemini">Google Gemini (Recommended)</option>
                      <option value="openai">OpenAI (GPT-4)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <div className="flex-between">
                      <label className="text-sm">{config.ai_cloud_provider === 'gemini' ? 'Gemini API Key' : 'OpenAI API Key'}</label>
                      {config.ai_cloud_provider === 'gemini' && (
                        <button 
                          className="btn btn-xs btn-outline" 
                          onClick={async () => {
                            if (!config.ai_cloud_key) return alert('Enter a key first');
                            setActionLoading('test-gemini');
                            try {
                              const r = await axios.post('/api/ai/test-gemini', { key: config.ai_cloud_key });
                              if (r.data.ok) alert('Gemini API Key is valid and connected!');
                            } catch(e) {
                              alert('Connection Failed: ' + (e.response?.data?.error || e.message));
                            }
                            setActionLoading(null);
                          }}
                          disabled={actionLoading === 'test-gemini'}
                        >
                          {actionLoading === 'test-gemini' ? 'Testing…' : 'Test Connection'}
                        </button>
                      )}
                    </div>
                    <input 
                      type="password"
                      className="form-control" 
                      value={config.ai_cloud_key} 
                      onChange={e => setConfig({...config, ai_cloud_key: e.target.value})} 
                      placeholder="Paste your API key here…"
                    />
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                      {config.ai_cloud_provider === 'gemini' ? (
                        <span>Get a free key at <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" style={{color:'var(--accent)'}}>Google AI Studio</a>. Data is not used for training via API.</span>
                      ) : (
                        <span>Enter your OpenAI platform key.</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="form-group mt-3">
                <label className="text-sm">Ollama API URL (Optional Override)</label>
                <input 
                  className="form-control" 
                  value={config.ollama_url} 
                  onChange={e => setConfig({...config, ollama_url: e.target.value})} 
                  placeholder="e.g. http://192.168.1.50:11434"
                />
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                  Default is auto-discovered or environment OLLAMA_URL.
                  {status?.online && status?.ollama_url && ` Currently using: ${status.ollama_url}`}
                </div>
              </div>

              <button className="btn btn-primary w-full mt-3" onClick={saveConfig}>Save Connectivity</button>
              
              <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Connection Logs</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-sm btn-outline" onClick={async () => {
                      if (!window.confirm('Install Ollama on this host?')) return;
                      setChecking(true);
                      setConnectLog(prev => [...prev.slice(-9), `> [${new Date().toLocaleTimeString()}] Installing Ollama...`]);
                      try {
                        const response = await fetch('/api/ai/install', { method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
                        const reader = response.body.getReader();
                        const decoder = new TextDecoder();
                        while(true) {
                          const {done, value} = await reader.read();
                          if (done) break;
                          const text = decoder.decode(value);
                          setConnectLog(prev => [...prev.slice(-15), `> ${text.trim()}`]);
                        }
                        setConnectLog(prev => [...prev.slice(-15), `> [${new Date().toLocaleTimeString()}] Install complete.`]);
                      } catch(e) {
                        setConnectLog(prev => [...prev.slice(-15), `> [${new Date().toLocaleTimeString()}] Install failed: ${e.message}`]);
                      }
                      setChecking(false);
                      loadStatus();
                    }} disabled={checking}>
                      Install Ollama
                    </button>
                    <button className="btn btn-sm btn-outline" onClick={loadStatus} disabled={checking}>
                      {checking ? 'Connecting...' : 'Connect Now'}
                    </button>
                  </div>
                </div>
                <div style={{ background: '#000', color: '#0f0', padding: '10px', borderRadius: 6, fontFamily: 'monospace', fontSize: 11, minHeight: 100, maxHeight: 150, overflowY: 'auto' }}>
                  {connectLog.length === 0 ? '> Idle' : connectLog.map((log, i) => <div key={i}>{log}</div>)}
                </div>
              </div>
            </div>
            
            <div className="card mb-3">
              <div style={{ fontWeight: 700, marginBottom: 10 }}>⬇️ Download Models</div>
              <div className="flex gap-2 mb-2">
                <input className="form-control" value={pullModel} onChange={e => setPullModel(e.target.value)} placeholder="Model name…" />
                <select className="form-control" style={{ width: 'auto' }} onChange={e => setPullModel(e.target.value)}>
                  <option value="">Popular…</option>
                  {['llama3.2','llama3.2-vision','mistral','phi3'].map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <button className="btn btn-primary w-full" onClick={pullModelFn} disabled={pulling}>{pulling ? pullProgress : `Download Model`}</button>
            </div>

            <div className="card mt-3">
              <div style={{ fontWeight: 700, marginBottom: 10 }}>📤 Upload Custom LLM (.GGUF)</div>
              <div className="form-group">
                <label>Model Name</label>
                <input className="form-control mb-2" id="custom-model-name" placeholder="e.g. my-custom-model" />
              </div>
              <input type="file" accept=".gguf" id="custom-model-file" className="mb-3" />
              <button className="btn btn-primary w-full" onClick={async () => {
                const name = document.getElementById('custom-model-name').value;
                const file = document.getElementById('custom-model-file').files[0];
                if (!name || !file) return alert('Name and file required');
                const fd = new FormData(); fd.append('file', file);
                try {
                  const res = await axios.post('/api/ai/models/upload', fd);
                  await axios.post('/api/ai/models/create', { name, filePath: res.data.path });
                  alert('Custom model created successfully!');
                  loadStatus();
                } catch(e) { alert('Upload failed'); }
              }}>Upload & Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
