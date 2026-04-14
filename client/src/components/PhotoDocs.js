import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const STAGES = [
  { value: 'intake', label: '📥 Intake', color: 'var(--text2)' },
  { value: 'during', label: '🔧 During repair', color: 'var(--accent)' },
  { value: 'completed', label: '✅ Completed', color: 'var(--success)' },
  { value: 'damage', label: '⚠️ Pre-existing damage', color: 'var(--warning)' },
];

export default function PhotoDocs({ repairId }) {
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [stage, setStage] = useState('intake');
  const [caption, setCaption] = useState('');
  const [lightbox, setLightbox] = useState(null);
  const [editCaption, setEditCaption] = useState({});
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const load = useCallback(() => {
    axios.get(`/api/photos/repair/${repairId}`).then(r => setPhotos(r.data));
  }, [repairId]);

  useEffect(() => { load(); }, [load]);

  const upload = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const fd = new FormData();
    Array.from(files).forEach(f => fd.append('photos', f));
    fd.append('stage', stage);
    fd.append('caption', caption);
    try {
      await axios.post(`/api/photos/repair/${repairId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setCaption('');
      load();
    } catch (err) { alert(err.response?.data?.error || 'Upload failed'); }
    setUploading(false);
  };

  const deletePhoto = async (id) => {
    if (!window.confirm('Delete this photo?')) return;
    await axios.delete(`/api/photos/${id}`);
    load();
  };

  const saveCaption = async (photo) => {
    await axios.put(`/api/photos/${photo.id}`, { caption: editCaption[photo.id] ?? photo.caption, stage: photo.stage });
    setEditCaption(e => { const n = { ...e }; delete n[photo.id]; return n; });
    load();
  };

  const grouped = STAGES.reduce((acc, s) => {
    acc[s.value] = photos.filter(p => p.stage === s.value);
    return acc;
  }, {});

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>📷 Photo documentation</div>

      {/* Upload controls */}
      <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
        <div className="grid-2" style={{ marginBottom: 10 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Stage</label>
            <select className="form-control" value={stage} onChange={e => setStage(e.target.value)}>
              {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Caption (optional)</label>
            <input className="form-control" value={caption} onChange={e => setCaption(e.target.value)} placeholder="e.g. Cracked screen before repair" />
          </div>
        </div>
        <div className="flex" style={{ gap: 8 }}>
          <button className="btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            📁 {uploading ? 'Uploading…' : 'Choose files'}
          </button>
          <button className="btn" onClick={() => cameraInputRef.current?.click()} disabled={uploading}>
            📷 Take photo
          </button>
          <input ref={fileInputRef} type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={e => { upload(e.target.files); e.target.value = ''; }} />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { upload(e.target.files); e.target.value = ''; }} />
          <span style={{ fontSize: 12, color: 'var(--text3)', alignSelf: 'center' }}>JPG, PNG, WEBP · max 20MB each</span>
        </div>
      </div>

      {/* Photo gallery grouped by stage */}
      {photos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--text3)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
          No photos yet — upload intake photos to document device condition
        </div>
      ) : (
        STAGES.map(s => grouped[s.value].length > 0 && (
          <div key={s.value} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', marginBottom: 8 }}>
              {s.label} ({grouped[s.value].length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {grouped[s.value].map(photo => (
                <div key={photo.id} style={{ position: 'relative', width: 140 }}>
                  <img
                    src={photo.url}
                    alt={photo.caption || photo.stage}
                    style={{ width: 140, height: 105, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', display: 'block' }}
                    onClick={() => setLightbox(photo)}
                  />
                  <button
                    onClick={() => deletePhoto(photo.id)}
                    style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 12, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    ✕
                  </button>
                  {editCaption[photo.id] !== undefined ? (
                    <div style={{ marginTop: 4 }}>
                      <input className="form-control" style={{ fontSize: 11, padding: '3px 6px' }} value={editCaption[photo.id]} onChange={e => setEditCaption(ec => ({ ...ec, [photo.id]: e.target.value }))} autoFocus />
                      <div className="flex" style={{ marginTop: 3, gap: 4 }}>
                        <button className="btn btn-sm" style={{ flex: 1, fontSize: 10, padding: '2px 4px' }} onClick={() => saveCaption(photo)}>Save</button>
                        <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 4px' }} onClick={() => setEditCaption(ec => { const n = { ...ec }; delete n[photo.id]; return n; })}>✕</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, cursor: 'pointer', lineHeight: 1.3 }} onClick={() => setEditCaption(ec => ({ ...ec, [photo.id]: photo.caption || '' }))}>
                      {photo.caption || <span style={{ fontStyle: 'italic' }}>Add caption…</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="modal-overlay" onClick={() => setLightbox(null)} style={{ alignItems: 'flex-start', paddingTop: 40 }}>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: 900, width: '100%', background: 'var(--bg2)', borderRadius: 12, padding: 16 }}>
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <div>
                <span className="badge" style={{ background: 'var(--bg3)', color: 'var(--text2)' }}>{STAGES.find(s => s.value === lightbox.stage)?.label || lightbox.stage}</span>
                {lightbox.caption && <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--text2)' }}>{lightbox.caption}</span>}
              </div>
              <button className="btn btn-sm" onClick={() => setLightbox(null)}>✕ Close</button>
            </div>
            <img src={lightbox.url} alt={lightbox.caption} style={{ width: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: 8 }} />
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
              {new Date(lightbox.created_at).toLocaleString()}
              <a href={lightbox.url} target="_blank" rel="noreferrer" style={{ marginLeft: 12, color: 'var(--accent)' }}>Download original ↗</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
