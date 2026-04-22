import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Spinner } from '../components/Shared';

function PrintSettingsTab() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);

  const load = () => axios.get('/api/print').then(r => setFiles(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      await axios.post('/api/print/upload', fd);
      load();
    } catch (err) { alert(err.response?.data?.error || 'Upload failed'); }
    setUploading(false);
  };

  const deleteFile = async (name) => {
    if (!window.confirm(`Delete ${name}?`)) return;
    await axios.delete(`/api/print/${name}`);
    load();
  };

  const printAll = async () => {
    if (!window.confirm('Print all documents in this folder?')) return;
    try {
      const res = await axios.post('/api/print/print-all');
      alert(res.data.message);
    } catch (err) { alert('Print failed'); }
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontWeight: 700 }}>🖨️ Print Documents</div>
          <button className="btn btn-primary" onClick={printAll} disabled={files.length === 0}>
            Dedicated Print All
          </button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, background: 'var(--bg3)', padding: 12, borderRadius: 6 }}>
          Upload documents (.pdf, .txt, .jpg) here. Clicking "Dedicated Print All" will send every file in this list to the system's default printer.
        </div>
        <input type="file" onChange={upload} disabled={uploading} className="form-control" accept=".pdf,.txt,.jpg,.jpeg,.png" />
      </div>

      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Upload Documents ({files.length})</div>
        {files.length === 0 && <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text3)' }}>No documents uploaded</div>}
        {files.map(f => (
          <div key={f.filename} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 20 }}>{f.ext === '.pdf' ? '📕' : f.ext === '.txt' ? '📄' : '🖼️'}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{f.original_name}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{(f.size / 1024).toFixed(1)} KB · {new Date(f.created_at).toLocaleString()}</div>
            </div>
            <button className="btn btn-sm btn-danger" onClick={() => deleteFile(f.filename)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function FileBrowserTab() {
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = (p) => {
    setLoading(true);
    axios.get('/api/system/files', { params: { path: p } })
      .then(r => {
        setEntries(r.data.entries);
        setPath(r.data.current_path);
      })
      .catch(() => alert('Failed to load directory'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(''); }, []);

  const navigate = (name) => {
    const newPath = path ? `${path}/${name}` : name;
    load(newPath);
  };

  const goUp = () => {
    const parts = path.split(/[/\\]/);
    parts.pop();
    load(parts.join('/'));
  };

  const download = (p) => {
    window.open(`/api/system/files/download?path=${encodeURIComponent(p)}&token=${localStorage.getItem('token')}`);
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ fontWeight: 700 }}>📂 Software Files</div>
        <div style={{ flex: 1, fontSize: 12, color: 'var(--text3)', fontFamily: 'monospace', background: 'var(--bg2)', padding: '4px 8px', borderRadius: 4 }}>
          data/{path || '.'}
        </div>
        {path && <button className="btn btn-sm" onClick={goUp}>↑ Up</button>}
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {loading ? <Spinner /> : (
          <table className="table" style={{ margin: 0 }}>
            <thead style={{ background: 'var(--bg2)' }}>
              <tr>
                <th>Name</th>
                <th>Size</th>
                <th>Modified</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.name}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{e.is_directory ? '📁' : '📄'}</span>
                      {e.is_directory ? (
                        <button className="link-btn" onClick={() => navigate(e.name)} style={{ fontWeight: 600 }}>{e.name}</button>
                      ) : (
                        <span>{e.name}</span>
                      )}
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text3)' }}>{e.is_directory ? '--' : (e.size / 1024).toFixed(1) + ' KB'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(e.modified_at).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    {!e.is_directory && (
                      <button className="btn btn-sm" onClick={() => download(e.path)}>Download</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function Operations() {
  return (
    <div className="page">
      <div className="page-header">
        <h1>⚙️ Operations</h1>
        <p style={{ fontSize: 13, color: 'var(--text3)' }}>Manage print queue and browse system data files</p>
      </div>
      
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <PrintSettingsTab />
        <FileBrowserTab />
      </div>
    </div>
  );
}
