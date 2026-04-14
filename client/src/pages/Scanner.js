import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Spinner, StatusBadge } from '../components/Shared';
import { format } from 'date-fns';

// ── QR Code generator (pure JS, no library needed for simple cases)
// Uses the qrcode npm-free approach via a canvas — we load qrcode.js from CDN
function useQRScript() {
  const [ready, setReady] = useState(!!window.QRCode);
  useEffect(() => {
    if (window.QRCode) { setReady(true); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, []);
  return ready;
}

function useBarcodeScript() {
  const [ready, setReady] = useState(!!window.JsBarcode);
  useEffect(() => {
    if (window.JsBarcode) { setReady(true); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js';
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, []);
  return ready;
}

function useZxingScript() {
  const [ready, setReady] = useState(!!window.ZXing);
  useEffect(() => {
    if (window.ZXing) { setReady(true); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.19.1/umd/index.min.js';
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, []);
  return ready;
}

// ── QR Label component
function QRLabel({ data, title, subtitle, size = 128 }) {
  const ref = useRef(null);
  const qrReady = useQRScript();
  const instanceRef = useRef(null);

  useEffect(() => {
    if (!qrReady || !ref.current || !data) return;
    if (instanceRef.current) {
      try { ref.current.innerHTML = ''; } catch(e) {}
    }
    try {
      instanceRef.current = new window.QRCode(ref.current, {
        text: data,
        width: size,
        height: size,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.M
      });
    } catch(e) {}
  }, [qrReady, data, size]);

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
      <div ref={ref} style={{ lineHeight:0 }} />
      {title && <div style={{ fontSize:11, fontWeight:700, textAlign:'center', maxWidth:size, lineHeight:1.2 }}>{title}</div>}
      {subtitle && <div style={{ fontSize:10, color:'var(--text3)', textAlign:'center', maxWidth:size, fontFamily:'monospace' }}>{subtitle}</div>}
    </div>
  );
}

// ── Barcode component
function Barcode({ data, label, width = 200 }) {
  const ref = useRef(null);
  const barcodeReady = useBarcodeScript();

  useEffect(() => {
    if (!barcodeReady || !ref.current || !data) return;
    // CODE128 handles alphanumeric well
    const clean = data.replace(/[^\x00-\x7F]/g, '').slice(0, 40);
    if (!clean) return;
    try {
      window.JsBarcode(ref.current, clean, {
        format: 'CODE128',
        width: 1.4,
        height: 40,
        displayValue: true,
        fontSize: 10,
        margin: 4,
        background: '#ffffff',
        lineColor: '#000000',
      });
    } catch(e) {}
  }, [barcodeReady, data]);

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
      <svg ref={ref} style={{ maxWidth:width }} />
      {label && <div style={{ fontSize:10, color:'var(--text3)', textAlign:'center' }}>{label}</div>}
    </div>
  );
}

// ── Camera scanner component
function CameraScanner({ onResult, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const readerRef = useRef(null);
  const zxingReady = useZxingScript();
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [manualInput, setManualInput] = useState('');

  const startCamera = useCallback(async () => {
    if (!zxingReady) return;
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      const ZXing = window.ZXing;
      const hints = new Map();
      const formats = [
        ZXing.BarcodeFormat.QR_CODE,
        ZXing.BarcodeFormat.CODE_128,
        ZXing.BarcodeFormat.CODE_39,
        ZXing.BarcodeFormat.EAN_13,
        ZXing.BarcodeFormat.EAN_8,
        ZXing.BarcodeFormat.UPC_A,
        ZXing.BarcodeFormat.DATA_MATRIX,
      ];
      hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);
      readerRef.current = new ZXing.BrowserMultiFormatReader(hints);

      setScanning(true);
      readerRef.current.decodeFromVideoElement(videoRef.current, (result, err) => {
        if (result) {
          stopCamera();
          onResult(result.getText());
        }
      });
    } catch (e) {
      setError(e.name === 'NotAllowedError'
        ? 'Camera permission denied. Please allow camera access in your browser, or use manual entry below.'
        : `Camera error: ${e.message}`);
    }
  }, [zxingReady, onResult]);

  const stopCamera = useCallback(() => {
    try { readerRef.current?.reset(); } catch(e) {}
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }, []);

  useEffect(() => {
    if (zxingReady) startCamera();
    return () => stopCamera();
  }, [zxingReady, startCamera, stopCamera]);

  const submitManual = e => {
    e.preventDefault();
    if (manualInput.trim()) {
      stopCamera();
      onResult(manualInput.trim());
    }
  };

  return (
    <div>
      <div style={{ position:'relative', background:'#000', borderRadius:8, overflow:'hidden', marginBottom:16, minHeight:240 }}>
        <video ref={videoRef} style={{ width:'100%', display:'block', maxHeight:320, objectFit:'cover' }} muted playsInline />
        {scanning && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
            <div style={{ width:200, height:200, border:'2px solid rgba(255,255,255,0.7)', borderRadius:8, boxShadow:'0 0 0 2000px rgba(0,0,0,0.3)' }}>
              <div style={{ position:'absolute', top:0, left:0, width:'100%', height:2, background:'var(--accent)', animation:'scan 2s ease-in-out infinite' }} />
            </div>
          </div>
        )}
        {!zxingReady && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:13 }}>
            Loading scanner…
          </div>
        )}
        <style>{`@keyframes scan { 0%,100%{top:10%} 50%{top:85%} }`}</style>
      </div>

      {error && (
        <div style={{ background:'var(--warning-light)', color:'var(--warning)', padding:'10px 12px', borderRadius:6, marginBottom:12, fontSize:13 }}>
          {error}
        </div>
      )}

      <div style={{ fontSize:12, color:'var(--text3)', textAlign:'center', marginBottom:12 }}>
        Point camera at a QR code or barcode · Works best in good lighting
      </div>

      <div style={{ borderTop:'1px solid var(--border)', paddingTop:14 }}>
        <div style={{ fontSize:12, fontWeight:600, color:'var(--text2)', marginBottom:8 }}>Or type / paste a code manually</div>
        <form onSubmit={submitManual} style={{ display:'flex', gap:8 }}>
          <input className="form-control" value={manualInput} onChange={e => setManualInput(e.target.value)}
            placeholder="SKU, serial number, or PART-/REPAIR- code…" autoComplete="off" />
          <button type="submit" className="btn btn-primary" disabled={!manualInput.trim()}>Look up</button>
        </form>
      </div>
    </div>
  );
}

// ── Lookup result display
function LookupResult({ result, onNavigate, onClose, onAdjustStock }) {
  if (!result) return null;

  if (result.type === 'not_found') return (
    <div style={{ textAlign:'center', padding:'24px 16px' }}>
      <div style={{ fontSize:32, marginBottom:8 }}>🔍</div>
      <div style={{ fontWeight:600, marginBottom:4 }}>No match found</div>
      <div style={{ fontSize:13, color:'var(--text3)' }}>Code: <code style={{ fontFamily:'monospace' }}>{result.code}</code></div>
    </div>
  );

  if (result.type === 'inventory') {
    const item = result.record;
    return (
      <div>
        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:4 }}>
          <span style={{ fontSize:20 }}>📦</span>
          <span style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', color:'var(--text3)' }}>Inventory Part</span>
        </div>
        <div style={{ fontWeight:700, fontSize:18, marginBottom:2 }}>{item.name}</div>
        {item.sku && <div style={{ fontFamily:'monospace', fontSize:12, color:'var(--text3)', marginBottom:8 }}>{item.sku}</div>}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
          {[
            ['Stock', <span style={{ fontWeight:700, color: item.quantity===0?'var(--danger)':item.quantity<=item.quantity_min?'var(--warning)':'var(--success)' }}>{item.quantity}</span>],
            ['Category', item.category],
            ['Unit cost', item.unit_cost ? `$${item.unit_cost.toFixed(2)}` : '—'],
            ['Sell price', item.sell_price ? `$${item.sell_price.toFixed(2)}` : '—'],
            ['Location', item.location || '—'],
            ['Supplier', item.supplier || '—'],
          ].map(([l,v]) => (
            <div key={l} style={{ background:'var(--bg3)', borderRadius:6, padding:'8px 10px' }}>
              <div style={{ fontSize:10, color:'var(--text3)', marginBottom:2 }}>{l}</div>
              <div style={{ fontSize:13, fontWeight:500 }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-primary" onClick={() => { onClose(); onNavigate('inventory'); }}>Open in Inventory</button>
          <button className="btn" onClick={() => onAdjustStock(item)}>± Adjust stock</button>
        </div>
      </div>
    );
  }

  if (result.type === 'repair') {
    const r = result.record;
    return (
      <div>
        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:4 }}>
          <span style={{ fontSize:20 }}>🔧</span>
          <span style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', color:'var(--text3)' }}>Repair Ticket</span>
          <StatusBadge status={r.status} />
        </div>
        <div style={{ fontWeight:700, fontSize:18, marginBottom:2 }}>{r.title}</div>
        <div style={{ fontSize:13, color:'var(--text2)', marginBottom:8 }}>
          {r.customer_name}{r.customer_phone ? ` · ${r.customer_phone}` : ''}
        </div>
        {[r.device_brand, r.device_model].filter(Boolean).length > 0 && (
          <div style={{ fontSize:13, color:'var(--text3)', marginBottom:4 }}>
            Device: {[r.device_brand, r.device_model].filter(Boolean).join(' ')}
          </div>
        )}
        {r.serial_number && <div style={{ fontFamily:'monospace', fontSize:12, color:'var(--text3)', marginBottom:8 }}>S/N: {r.serial_number}</div>}
        <div style={{ fontSize:12, color:'var(--text3)', marginBottom:12 }}>Opened: {format(new Date(r.created_at), 'MMM d, yyyy')}</div>
        <button className="btn btn-primary" onClick={() => { onClose(); onNavigate('repairs', { repairId: r.id }); }}>Open repair ticket</button>
      </div>
    );
  }

  if (result.type === 'device_serial') {
    return (
      <div>
        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:4 }}>
          <span style={{ fontSize:20 }}>💻</span>
          <span style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', color:'var(--text3)' }}>Device serial match</span>
        </div>
        <div style={{ fontFamily:'monospace', fontSize:13, color:'var(--text3)', marginBottom:12 }}>S/N: {result.serial}</div>
        <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>{result.records.length} repair{result.records.length > 1 ? 's' : ''} found</div>
        {result.records.map(r => (
          <div key={r.id} className="card card-sm" style={{ marginBottom:8, cursor:'pointer' }}
            onClick={() => { onClose(); onNavigate('repairs', { repairId: r.id }); }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontWeight:600, fontSize:13 }}>{r.title}</div>
                <div style={{ fontSize:12, color:'var(--text2)' }}>{r.customer_name}</div>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <div style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>{format(new Date(r.created_at), 'MMM d, yyyy')}</div>
          </div>
        ))}
      </div>
    );
  }

  if (result.type === 'inventory_search') {
    return (
      <div>
        <div style={{ fontSize:13, fontWeight:600, marginBottom:10 }}>Multiple parts matched:</div>
        {result.records.map(item => (
          <div key={item.id} className="card card-sm" style={{ marginBottom:8, cursor:'pointer' }}
            onClick={() => { onClose(); onNavigate('inventory'); }}>
            <div style={{ fontWeight:600 }}>{item.name}</div>
            <div style={{ fontSize:12, color:'var(--text2)' }}>Stock: {item.quantity} · {item.category}</div>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

// ── Label sheet for printing
function LabelSheet({ items, repairs, type, onClose }) {
  const qrReady = useQRScript();
  const barcodeReady = useBarcodeScript();
  const printRef = useRef(null);

  const doPrint = () => {
    const win = window.open('', '_blank');
    const content = printRef.current?.innerHTML || '';
    win.document.write(`
      <!DOCTYPE html><html><head><title>Labels</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; background: #fff; }
        .sheet { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px; }
        .label { border: 1px solid #ccc; border-radius: 4px; padding: 8px; width: 180px; display: flex; flex-direction: column; align-items: center; gap: 4px; break-inside: avoid; }
        .label-title { font-size: 10px; font-weight: 700; text-align: center; max-width: 164px; line-height: 1.2; }
        .label-sub { font-size: 9px; color: #555; text-align: center; font-family: monospace; }
        .label-loc { font-size: 9px; color: #777; }
        .label-price { font-size: 11px; font-weight: 700; }
        img { max-width: 130px; height: auto; }
        svg { max-width: 164px; }
        @media print { body { margin: 0; } }
      </style></head><body>
      <div class="sheet">${content}</div>
      </body></html>
    `);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 600);
  };

  if (!qrReady || !barcodeReady) return <div style={{ padding:24, textAlign:'center' }}><Spinner /></div>;

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <span style={{ fontSize:13, color:'var(--text2)' }}>{(items||repairs||[]).length} label{(items||repairs||[]).length!==1?'s':''} ready</span>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-primary" onClick={doPrint}>🖨️ Print labels</button>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>

      <div ref={printRef} style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
        {type === 'inventory' && (items||[]).map(item => (
          <InventoryLabel key={item.id} item={item} />
        ))}
        {type === 'repair' && (repairs||[]).map(r => (
          <RepairLabel key={r.id} repair={r} />
        ))}
      </div>
    </div>
  );
}

function InventoryLabel({ item }) {
  const qrRef = useRef(null);
  const barcodeRef = useRef(null);
  const qrReady = useQRScript();
  const barcodeReady = useBarcodeScript();

  useEffect(() => {
    if (qrReady && qrRef.current) {
      qrRef.current.innerHTML = '';
      try {
        new window.QRCode(qrRef.current, { text: `PART-${item.id}`, width: 90, height: 90, correctLevel: window.QRCode.CorrectLevel.M });
      } catch(e) {}
    }
  }, [qrReady, item.id]);

  useEffect(() => {
    if (barcodeReady && barcodeRef.current && (item.sku || item.id)) {
      try {
        window.JsBarcode(barcodeRef.current, item.sku || `PART-${item.id.slice(0,8)}`, {
          format: 'CODE128', width: 1.2, height: 32, displayValue: true, fontSize: 8, margin: 2, background: '#fff', lineColor: '#000'
        });
      } catch(e) {}
    }
  }, [barcodeReady, item.sku, item.id]);

  return (
    <div style={{ border:'1px solid var(--border)', borderRadius:6, padding:'10px 8px', width:190, display:'flex', flexDirection:'column', alignItems:'center', gap:5, background:'#fff' }}>
      <div ref={qrRef} style={{ lineHeight:0 }} />
      <div style={{ fontSize:11, fontWeight:700, textAlign:'center', lineHeight:1.2, color:'#000', maxWidth:170 }}>{item.name}</div>
      {item.sku && <div style={{ fontSize:9, fontFamily:'monospace', color:'#555' }}>{item.sku}</div>}
      {item.category && <div style={{ fontSize:9, color:'#777' }}>{item.category}</div>}
      {item.location && <div style={{ fontSize:9, color:'#777' }}>📍 {item.location}</div>}
      {item.sell_price > 0 && <div style={{ fontSize:12, fontWeight:700, color:'#000' }}>${item.sell_price.toFixed(2)}</div>}
      <svg ref={barcodeRef} style={{ maxWidth:170 }} />
    </div>
  );
}

function RepairLabel({ repair }) {
  const qrRef = useRef(null);
  const snQrRef = useRef(null);
  const qrReady = useQRScript();

  useEffect(() => {
    if (!qrReady) return;
    if (qrRef.current) {
      qrRef.current.innerHTML = '';
      try { new window.QRCode(qrRef.current, { text: `REPAIR-${repair.id}`, width: 90, height: 90, correctLevel: window.QRCode.CorrectLevel.M }); } catch(e) {}
    }
    if (snQrRef.current && repair.serial_number) {
      snQrRef.current.innerHTML = '';
      try { new window.QRCode(snQrRef.current, { text: `DEVICE-${repair.serial_number}`, width: 60, height: 60, correctLevel: window.QRCode.CorrectLevel.M }); } catch(e) {}
    }
  }, [qrReady, repair.id, repair.serial_number]);

  return (
    <div style={{ border:'1px solid var(--border)', borderRadius:6, padding:'10px 8px', width:190, display:'flex', flexDirection:'column', alignItems:'center', gap:4, background:'#fff' }}>
      <div ref={qrRef} style={{ lineHeight:0 }} />
      <div style={{ fontSize:11, fontWeight:700, textAlign:'center', color:'#000', maxWidth:170, lineHeight:1.2 }}>{repair.customer_name}</div>
      <div style={{ fontSize:10, textAlign:'center', color:'#333', maxWidth:170 }}>{repair.title}</div>
      {repair.device && <div style={{ fontSize:9, color:'#555' }}>{repair.device}</div>}
      {repair.serial_number && (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, borderTop:'1px dashed #ddd', paddingTop:4, width:'100%' }}>
          <div style={{ fontSize:8, color:'#999', textTransform:'uppercase', letterSpacing:'.05em' }}>Device S/N QR</div>
          <div ref={snQrRef} style={{ lineHeight:0 }} />
          <div style={{ fontSize:8, fontFamily:'monospace', color:'#555' }}>{repair.serial_number}</div>
        </div>
      )}
      <div style={{ fontSize:9, color:'#777' }}>{repair.intake_date ? format(new Date(repair.intake_date), 'MMM d, yyyy') : ''}</div>
      <div style={{ fontSize:9, fontFamily:'monospace', color:'#aaa' }}>{repair.id?.slice(0,8).toUpperCase()}</div>
    </div>
  );
}

// ── Quick stock adjust modal (reused from Inventory page logic inline)
function QuickAdjust({ item, onSave, onClose }) {
  const [type, setType] = useState('add');
  const [qty, setQty] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const preview = () => {
    const q = parseInt(qty) || 0;
    if (type === 'add') return item.quantity + q;
    if (type === 'remove') return Math.max(0, item.quantity - q);
    return q;
  };

  const submit = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post(`/api/inventory/${item.id}/adjust`, { type, quantity: parseInt(qty), notes });
      onSave();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
    setSaving(false);
  };

  return (
    <form onSubmit={submit}>
      <div style={{ background:'var(--bg3)', borderRadius:8, padding:'10px 14px', marginBottom:14 }}>
        <div style={{ fontSize:12, color:'var(--text2)' }}>Current stock for <strong>{item.name}</strong></div>
        <div style={{ fontSize:26, fontWeight:700 }}>{item.quantity}</div>
      </div>
      <div className="form-group">
        <label>Type</label>
        <div style={{ display:'flex', gap:6 }}>
          {[['add','+ Add'],['remove','− Remove'],['set','= Set']].map(([v,l]) => (
            <button key={v} type="button" onClick={() => setType(v)} className="btn"
              style={{ flex:1, background:type===v?'var(--accent)':undefined, color:type===v?'#fff':undefined, borderColor:type===v?'var(--accent)':undefined }}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="form-group">
        <label>Quantity</label>
        <input className="form-control" type="number" min="0" value={qty} onChange={e => setQty(e.target.value)} autoFocus required />
      </div>
      {qty && <div style={{ background:'var(--accent-light)', color:'var(--accent)', padding:'7px 10px', borderRadius:6, marginBottom:12, fontSize:13 }}>New level: <strong>{preview()}</strong></div>}
      <div className="form-group"><label>Notes</label><input className="form-control" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason…" /></div>
      <div className="modal-footer">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving||!qty}>{saving?'Saving…':'Confirm'}</button>
      </div>
    </form>
  );
}

// ══════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════
export default function Scanner({ onNavigate }) {
  const [tab, setTab] = useState('scan');
  const [scanning, setScanning] = useState(false);
  const [lookupResult, setLookupResult] = useState(null);
  const [looking, setLooking] = useState(false);
  const [adjustItem, setAdjustItem] = useState(null);
  const [labelTab, setLabelTab] = useState('inventory');
  const [inventoryItems, setInventoryItems] = useState([]);
  const [repairItems, setRepairItems] = useState([]);
  const [selectedInv, setSelectedInv] = useState([]);
  const [recentRepairs, setRecentRepairs] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [labelRepairs, setLabelRepairs] = useState([]);
  const [generateSingle, setGenerateSingle] = useState(null); // { type, data, title, subtitle }

  const handleScan = useCallback(async (code) => {
    setScanning(false);
    setLooking(true);
    setLookupResult(null);
    try {
      const r = await axios.get(`/api/scanner/lookup?code=${encodeURIComponent(code)}`);
      setLookupResult(r.data);
    } catch {
      setLookupResult({ type: 'not_found', code });
    }
    setLooking(false);
    setTab('result');
  }, []);

  const loadLabelData = useCallback(async () => {
    setLoadingData(true);
    const [inv, rep] = await Promise.all([
      axios.get('/api/inventory'),
      axios.get('/api/repairs')
    ]);
    setInventoryItems(inv.data);
    setRecentRepairs(rep.data.slice(0, 50));
    setLoadingData(false);
  }, []);

  useEffect(() => {
    if (tab === 'generate') loadLabelData();
  }, [tab, loadLabelData]);

  const toggleInv = id => setSelectedInv(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const toggleRepair = id => setLabelRepairs(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const buildInventoryLabels = () => {
    const items = selectedInv.length > 0 ? inventoryItems.filter(i => selectedInv.includes(i.id)) : inventoryItems;
    return items.map(i => ({ ...i, qr_data: `PART-${i.id}` }));
  };

  const buildRepairLabels = () => {
    const repairs = labelRepairs.length > 0 ? recentRepairs.filter(r => labelRepairs.includes(r.id)) : recentRepairs.slice(0, 10);
    return repairs.map(r => ({
      id: r.id,
      customer_name: r.customer_name,
      title: r.title,
      device: [r.device_brand, r.device_model].filter(Boolean).join(' '),
      serial_number: r.serial_number,
      status: r.status,
      intake_date: r.created_at,
    }));
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Scanner &amp; Labels</h1>
          <p>Scan barcodes/QR codes · Generate and print labels</p>
        </div>
      </div>

      <div className="tabs">
        {[['scan','📷 Scan'], ['result','🔍 Result'], ['generate','🏷️ Generate labels']].map(([id, label]) => (
          <button key={id} className={`tab ${tab===id?'active':''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {/* ── SCAN TAB ── */}
      {tab === 'scan' && (
        <div>
          {!scanning ? (
            <div className="card" style={{ maxWidth:540 }}>
              <div style={{ textAlign:'center', padding:'24px 16px' }}>
                <div style={{ fontSize:48, marginBottom:12 }}>📷</div>
                <div style={{ fontWeight:700, fontSize:16, marginBottom:6 }}>Scan a barcode or QR code</div>
                <div style={{ fontSize:13, color:'var(--text3)', marginBottom:20 }}>
                  Works with inventory part labels, repair ticket QR codes, and device serial number QR codes.
                  You can also type in any SKU or serial number manually.
                </div>
                <button className="btn btn-primary" style={{ fontSize:15, padding:'10px 24px' }} onClick={() => setScanning(true)}>
                  Start scanning
                </button>
              </div>
            </div>
          ) : (
            <div className="card" style={{ maxWidth:540 }}>
              <div style={{ fontWeight:700, marginBottom:14 }}>Scanning…</div>
              <CameraScanner onResult={handleScan} onClose={() => setScanning(false)} />
            </div>
          )}
        </div>
      )}

      {/* ── RESULT TAB ── */}
      {tab === 'result' && (
        <div className="card" style={{ maxWidth:540 }}>
          {looking ? (
            <div style={{ textAlign:'center', padding:32 }}>
              <Spinner />
              <div style={{ marginTop:8, color:'var(--text3)', fontSize:13 }}>Looking up code…</div>
            </div>
          ) : lookupResult ? (
            <div>
              <LookupResult
                result={lookupResult}
                onNavigate={onNavigate}
                onClose={() => setLookupResult(null)}
                onAdjustStock={item => setAdjustItem(item)}
              />
              <div style={{ borderTop:'1px solid var(--border)', paddingTop:14, marginTop:16 }}>
                <button className="btn" onClick={() => { setLookupResult(null); setScanning(true); setTab('scan'); }}>
                  ← Scan another
                </button>
              </div>
            </div>
          ) : (
            <div style={{ textAlign:'center', padding:'32px 16px', color:'var(--text3)' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>🔍</div>
              No scan result yet — go to the Scan tab to scan a code.
            </div>
          )}
        </div>
      )}

      {/* ── GENERATE LABELS TAB ── */}
      {tab === 'generate' && (
        <div>
          {showLabels ? (
            <div className="card">
              <LabelSheet
                type={labelTab}
                items={labelTab === 'inventory' ? buildInventoryLabels() : undefined}
                repairs={labelTab === 'repair' ? buildRepairLabels() : undefined}
                onClose={() => setShowLabels(false)}
              />
            </div>
          ) : (
            <div>
              <div className="tabs" style={{ marginBottom:16 }}>
                {[['inventory','📦 Parts labels'],['repair','🔧 Repair ticket labels']].map(([id, label]) => (
                  <button key={id} className={`tab ${labelTab===id?'active':''}`} onClick={() => setLabelTab(id)}>{label}</button>
                ))}
              </div>

              {loadingData ? <Spinner /> : labelTab === 'inventory' ? (
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                    <div style={{ fontSize:13, color:'var(--text2)' }}>
                      {selectedInv.length > 0 ? `${selectedInv.length} selected` : `All ${inventoryItems.length} items`} will be included
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      {selectedInv.length > 0 && <button className="btn btn-sm" onClick={() => setSelectedInv([])}>Clear selection</button>}
                      <button className="btn btn-sm btn-primary" onClick={() => { setSelectedInv([]); setShowLabels(true); }}>
                        🏷️ All labels
                      </button>
                      {selectedInv.length > 0 && (
                        <button className="btn btn-sm btn-primary" onClick={() => setShowLabels(true)}>
                          🏷️ Selected ({selectedInv.length})
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="card">
                    <div style={{ fontSize:12, color:'var(--text3)', marginBottom:10 }}>Click items to select for printing, or use "All labels" above</div>
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th></th><th>Name</th><th>SKU</th><th>Category</th><th>Stock</th><th>QR data</th></tr></thead>
                        <tbody>
                          {inventoryItems.map(item => (
                            <tr key={item.id} className="clickable-row" onClick={() => toggleInv(item.id)}
                              style={{ background: selectedInv.includes(item.id) ? 'var(--accent-light)' : undefined }}>
                              <td><input type="checkbox" checked={selectedInv.includes(item.id)} onChange={() => toggleInv(item.id)} onClick={e => e.stopPropagation()} /></td>
                              <td style={{ fontWeight:500 }}>{item.name}</td>
                              <td style={{ fontFamily:'monospace', fontSize:12, color:'var(--text3)' }}>{item.sku || '—'}</td>
                              <td style={{ fontSize:12, color:'var(--text2)' }}>{item.category}</td>
                              <td style={{ fontWeight:700, color: item.quantity===0?'var(--danger)':item.quantity<=item.quantity_min?'var(--warning)':'var(--text)' }}>{item.quantity}</td>
                              <td style={{ fontFamily:'monospace', fontSize:11, color:'var(--text3)' }}>PART-{item.id.slice(0,8)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                    <div style={{ fontSize:13, color:'var(--text2)' }}>
                      {labelRepairs.length > 0 ? `${labelRepairs.length} selected` : `Latest ${Math.min(10, recentRepairs.length)} repairs`} will be included
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      {labelRepairs.length > 0 && <button className="btn btn-sm" onClick={() => setLabelRepairs([])}>Clear</button>}
                      <button className="btn btn-sm btn-primary" onClick={() => setShowLabels(true)}>
                        🏷️ {labelRepairs.length > 0 ? `Selected (${labelRepairs.length})` : 'Generate labels'}
                      </button>
                    </div>
                  </div>
                  <div className="card">
                    <div style={{ fontSize:12, color:'var(--text3)', marginBottom:10 }}>Each label includes a QR code for the repair ticket, plus a separate device S/N QR if a serial number is on file.</div>
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th></th><th>Customer</th><th>Title</th><th>Device</th><th>Serial #</th><th>Status</th></tr></thead>
                        <tbody>
                          {recentRepairs.map(r => (
                            <tr key={r.id} className="clickable-row" onClick={() => toggleRepair(r.id)}
                              style={{ background: labelRepairs.includes(r.id) ? 'var(--accent-light)' : undefined }}>
                              <td><input type="checkbox" checked={labelRepairs.includes(r.id)} onChange={() => toggleRepair(r.id)} onClick={e => e.stopPropagation()} /></td>
                              <td style={{ fontWeight:500 }}>{r.customer_name}</td>
                              <td>{r.title}</td>
                              <td style={{ fontSize:12, color:'var(--text2)' }}>{[r.device_brand, r.device_model].filter(Boolean).join(' ') || '—'}</td>
                              <td style={{ fontFamily:'monospace', fontSize:11, color:'var(--text3)' }}>{r.serial_number || '—'}</td>
                              <td><StatusBadge status={r.status} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Quick adjust modal */}
      {adjustItem && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setAdjustItem(null); }}>
          <div className="modal">
            <div className="modal-header">
              <h2>Adjust stock</h2>
              <button className="btn btn-icon btn-sm" onClick={() => setAdjustItem(null)}>✕</button>
            </div>
            <QuickAdjust item={adjustItem} onSave={() => { setAdjustItem(null); if (lookupResult?.type==='inventory') handleScan(`PART-${adjustItem.id}`); }} onClose={() => setAdjustItem(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
