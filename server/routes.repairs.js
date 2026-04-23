const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const PDFDocument = require('pdfkit');
const db = require('./db');
const auth = require('./auth.middleware');

router.use(auth);

const STATUSES = ['intake','diagnosing','waiting_parts','in_repair','ready','completed','cancelled'];

router.get('/', (req, res) => {
  const { status, customer_id, q } = req.query;
  let sql = `SELECT r.*, c.name as customer_name, c.phone as customer_phone FROM repairs r JOIN customers c ON r.customer_id = c.id WHERE r.deleted_at IS NULL`;
  const params = [];
  if (status) { sql += ' AND r.status = ?'; params.push(status); }
  if (customer_id) { sql += ' AND r.customer_id = ?'; params.push(customer_id); }
  if (q) { sql += ' AND (r.title LIKE ? OR c.name LIKE ? OR r.device_brand LIKE ? OR r.device_model LIKE ?)'; params.push(`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`); }
  sql += ' ORDER BY r.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/stats', (req, res) => {
  const statusCounts = {};
  STATUSES.forEach(s => {
    statusCounts[s] = db.prepare('SELECT COUNT(*) as c FROM repairs WHERE status = ?').get(s).c;
  });
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();
  const monthly = db.prepare('SELECT COUNT(*) as c FROM repairs WHERE created_at >= ?').get(monthStart).c;
  const yearly = db.prepare('SELECT COUNT(*) as c FROM repairs WHERE created_at >= ?').get(yearStart).c;
  const total = db.prepare('SELECT COUNT(*) as c FROM repairs').get().c;
  const revenue_month = db.prepare("SELECT COALESCE(SUM(total),0) as t FROM invoices WHERE status='paid' AND issued_date >= ?").get(monthStart).t;
  const revenue_year = db.prepare("SELECT COALESCE(SUM(total),0) as t FROM invoices WHERE status='paid' AND issued_date >= ?").get(yearStart).t;
  res.json({ statusCounts, monthly, yearly, total, revenue_month, revenue_year });
});

router.get('/:id', (req, res) => {
  const r = db.prepare(`SELECT r.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email FROM repairs r JOIN customers c ON r.customer_id=c.id WHERE r.id=?`).get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  r.parts_used = JSON.parse(r.parts_used || '[]');
  res.json(r);
});

router.post('/', (req, res) => {
  const { customer_id, title, description, status, priority, device_type, device_brand, device_model,
    serial_number, password, repair_notes, parts_used, labor_cost, parts_cost, warranty_months,
    os_name, os_version, custom_created_at } = req.body;
  if (!customer_id || !title) return res.status(400).json({ error: 'customer_id and title required' });
  const id = uuidv4();
  let warranty_expires = null;
  if (warranty_months && parseInt(warranty_months) > 0) {
    const d = new Date();
    d.setMonth(d.getMonth() + parseInt(warranty_months));
    warranty_expires = d.toISOString();
  }
  const repairCreatedAt = custom_created_at || new Date().toISOString();
  db.prepare(`INSERT INTO repairs (id,customer_id,title,description,status,priority,device_type,device_brand,device_model,serial_number,password,repair_notes,parts_used,labor_cost,parts_cost,warranty_months,warranty_expires,os_name,os_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id,customer_id,title,description||'',status||'intake',priority||'normal',device_type||'',device_brand||'',device_model||'',serial_number||'',password||'',repair_notes||'',JSON.stringify(parts_used||[]),parseFloat(labor_cost)||0,parseFloat(parts_cost)||0,parseInt(warranty_months)||0,warranty_expires,os_name||'',os_version||'',repairCreatedAt,repairCreatedAt);
  res.json(db.prepare('SELECT * FROM repairs WHERE id = ?').get(id));
});

router.put('/:id', (req, res) => {
  const { title, description, status, priority, device_type, device_brand, device_model, serial_number, password, repair_notes, parts_used, labor_cost, parts_cost, warranty_months } = req.body;
  const existing = db.prepare('SELECT * FROM repairs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  let warranty_expires = existing.warranty_expires;
  const wm = parseInt(warranty_months);
  if (wm > 0) {
    const base = status === 'completed' ? new Date() : new Date(existing.intake_date);
    base.setMonth(base.getMonth() + wm);
    warranty_expires = base.toISOString();
  }
  const completed_date = status === 'completed' && existing.status !== 'completed' ? new Date().toISOString() : existing.completed_date;
  db.prepare(`UPDATE repairs SET title=?,description=?,status=?,priority=?,device_type=?,device_brand=?,device_model=?,serial_number=?,password=?,repair_notes=?,parts_used=?,labor_cost=?,parts_cost=?,warranty_months=?,warranty_expires=?,completed_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(title,description||'',status||existing.status,priority||'normal',device_type||'',device_brand||'',device_model||'',serial_number||'',password||'',repair_notes||'',JSON.stringify(parts_used||[]),labor_cost||0,parts_cost||0,wm||0,warranty_expires,completed_date,req.params.id);
  res.json(db.prepare('SELECT * FROM repairs WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('UPDATE repairs SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/restore', (req, res) => {
  db.prepare('UPDATE repairs SET deleted_at=NULL WHERE id=?').run(req.params.id);
  res.json(db.prepare('SELECT r.*, c.name as customer_name FROM repairs r JOIN customers c ON r.customer_id=c.id WHERE r.id=?').get(req.params.id));
});

router.get('/trash/list', (req, res) => {
  res.json(db.prepare('SELECT r.*, c.name as customer_name FROM repairs r JOIN customers c ON r.customer_id=c.id WHERE r.deleted_at IS NOT NULL ORDER BY r.deleted_at DESC').all());
});

router.get('/export/csv', (req, res) => {
  const repairs = db.prepare(`SELECT r.*, c.name as customer_name, c.phone as customer_phone FROM repairs r JOIN customers c ON r.customer_id = c.id WHERE r.deleted_at IS NULL ORDER BY r.created_at DESC`).all();
  
  const headers = ['ID', 'Customer', 'Phone', 'Title', 'Device', 'Brand', 'Model', 'Status', 'Priority', 'Labor Cost', 'Parts Cost', 'Created At'];
  const rows = repairs.map(r => [
    r.id,
    r.customer_name,
    r.customer_phone || '',
    `"${r.title.replace(/"/g, '""')}"`,
    r.device_type,
    r.device_brand,
    r.device_model,
    r.status,
    r.priority,
    r.labor_cost,
    r.parts_cost,
    r.created_at
  ]);

  const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="repairs-export.csv"');
  res.send(csv);
});

// Printable repair intake form PDF
router.get('/:id/intake-pdf', (req, res) => {
  const repair = db.prepare(`SELECT r.*, c.name as customer_name, c.phone as customer_phone,
    c.email as customer_email, c.address as customer_address
    FROM repairs r JOIN customers c ON r.customer_id=c.id WHERE r.id=?`).get(req.params.id);
  if (!repair) return res.status(404).json({ error: 'Not found' });
  const settings = db.prepare('SELECT * FROM settings WHERE id=1').get();
  const uploadsPath = process.env.UPLOADS_PATH || '/data/uploads';

  const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="intake-${repair.id.slice(0,8)}.pdf"`);
  doc.pipe(res);

  const accent = settings.invoice_color || '#2563eb';
  const hexToRgb = h => { const r=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h); return r?[parseInt(r[1],16),parseInt(r[2],16),parseInt(r[3],16)]:[37,99,235]; };
  const [ar,ag,ab] = hexToRgb(accent);

  const W = 612; // letter width pts
  const COL = 280;

  // Header bar
  doc.rect(0,0,W,6).fill(accent);

  // Logo
  let headerX = 50;
  if (settings.logo_url) {
    const logoPath = path.join(uploadsPath, path.basename(settings.logo_url));
    if (fs.existsSync(logoPath)) {
      try { doc.image(logoPath, 50, 16, { height: 48 }); headerX = 130; } catch(e) {}
    }
  }

  // Company
  doc.fillColor(accent).fontSize(16).font('Helvetica-Bold').text(settings.company_name || 'My IT Shop', headerX, 18);
  doc.fillColor('#555').fontSize(8).font('Helvetica');
  let cy = 37;
  if (settings.address) { doc.text(settings.address, headerX, cy); cy += 11; }
  if (settings.phone)   { doc.text(settings.phone,   headerX, cy); cy += 11; }
  if (settings.email)   { doc.text(settings.email,   headerX, cy); }

  // Form title
  doc.fillColor(accent).fontSize(20).font('Helvetica-Bold').text('REPAIR INTAKE FORM', 350, 18, { align: 'right', width: 210 });
  doc.fillColor('#555').fontSize(9).font('Helvetica').text(`Date: ${new Date(repair.created_at).toLocaleDateString()}`, 350, 46, { align: 'right', width: 210 });
  doc.text(`Ticket #: ${repair.id.slice(0,8).toUpperCase()}`, 350, 58, { align: 'right', width: 210 });

  const statusColors = { intake:'#6b7280', diagnosing:'#7c3aed', waiting_parts:'#d97706', in_repair:'#2563eb', ready:'#16a34a', completed:'#16a34a', cancelled:'#dc2626' };
  const sc = statusColors[repair.status] || '#6b7280';
  const [sr,sg,sb] = hexToRgb(sc);
  doc.roundedRect(350, 70, 210, 18, 4).fill(sc);
  doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold').text(repair.status.replace('_',' ').toUpperCase(), 350, 74, { width: 210, align: 'center' });

  // Divider
  doc.moveTo(50,100).lineTo(W-50,100).lineWidth(0.5).strokeColor('#cbd5e1').stroke();

  // ── SECTION HELPER ──
  let y = 110;
  const sectionHeader = (title) => {
    doc.rect(50, y, W-100, 18).fill(accent);
    doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold').text(title, 56, y+5);
    y += 24;
  };

  const field = (label, value, x, fw, inline) => {
    const lbl = label.toUpperCase();
    const val = value || '';
    doc.fillColor('#94a3b8').fontSize(7.5).font('Helvetica-Bold').text(lbl, x, y);
    if (inline) {
      doc.fillColor('#0f172a').fontSize(10).font('Helvetica').text(val, x, y+10, { width: fw });
      doc.moveTo(x, y+24).lineTo(x+fw, y+24).lineWidth(0.4).strokeColor('#e2e8f0').stroke();
    } else {
      doc.fillColor('#0f172a').fontSize(10).font('Helvetica').text(val || ' ', x, y+10, { width: fw });
      doc.moveTo(x, y+24).lineTo(x+fw, y+24).lineWidth(0.4).strokeColor('#e2e8f0').stroke();
    }
  };

  const twoCol = (l1, v1, l2, v2) => {
    field(l1, v1, 50, COL);
    field(l2, v2, 50+COL+20, COL);
    y += 36;
  };
  const oneCol = (label, value) => {
    field(label, value, 50, W-100);
    y += 36;
  };

  // ── CUSTOMER INFO ──
  sectionHeader('Customer Information');
  twoCol('Customer name', repair.customer_name, 'Phone', repair.customer_phone);
  twoCol('Email', repair.customer_email, 'Address', repair.customer_address);

  // ── DEVICE INFO ──
  sectionHeader('Device Information');
  twoCol('Device type', repair.device_type, 'Brand / Manufacturer', repair.device_brand);
  twoCol('Model', repair.device_model, 'Serial number', repair.serial_number);
  oneCol('Device password / PIN (if applicable)', repair.password ? '(on file)' : '___________________________');

  // ── REPAIR DETAILS ──
  sectionHeader('Repair Details');
  twoCol('Priority', repair.priority ? repair.priority.charAt(0).toUpperCase()+repair.priority.slice(1) : '', 'Warranty', repair.warranty_months ? `${repair.warranty_months} month(s)` : 'None');
  oneCol('Problem description / reason for intake', repair.description);

  // Taller notes field
  doc.fillColor('#94a3b8').fontSize(7.5).font('Helvetica-Bold').text('TECHNICIAN NOTES', 50, y);
  doc.fillColor('#0f172a').fontSize(10).font('Helvetica').text(repair.repair_notes || ' ', 50, y+10, { width: W-100, height: 60 });
  doc.rect(50, y+8, W-100, 64).lineWidth(0.4).strokeColor('#e2e8f0').stroke();
  y += 80;

  // ── PARTS USED ──
  const parts = JSON.parse(repair.parts_used || '[]');
  if (parts.length > 0 || true) {
    sectionHeader('Parts / Materials Used');
    doc.rect(50, y, W-100, 16).fill('#f8fafc');
    doc.fillColor('#475569').fontSize(8).font('Helvetica-Bold');
    doc.text('PART NAME', 56, y+5);
    doc.text('QTY', 360, y+5, { width: 50, align: 'center' });
    doc.text('UNIT COST', 420, y+5, { width: 70, align: 'right' });
    doc.text('TOTAL', 495, y+5, { width: 65, align: 'right' });
    y += 18;
    const rows = parts.length > 0 ? parts : [null, null, null];
    rows.forEach((p, i) => {
      if (i % 2 === 1) doc.rect(50, y, W-100, 18).fill('#f8fafc');
      doc.fillColor('#0f172a').fontSize(9).font('Helvetica');
      doc.text(p?.name || '', 56, y+5, { width: 295 });
      doc.text(p?.qty != null ? String(p.qty) : '', 360, y+5, { width: 50, align: 'center' });
      doc.text(p?.cost ? `$${parseFloat(p.cost).toFixed(2)}` : '', 420, y+5, { width: 70, align: 'right' });
      doc.text(p?.cost && p?.qty ? `$${(parseFloat(p.cost)*parseInt(p.qty)).toFixed(2)}` : '', 495, y+5, { width: 65, align: 'right' });
      y += 18;
    });
    doc.moveTo(50,y).lineTo(W-50,y).lineWidth(0.4).strokeColor('#e2e8f0').stroke();
    y += 10;
  }

  // ── PRICING ──
  sectionHeader('Estimated Charges');
  const labor = repair.labor_cost || 0;
  const partsCost = repair.parts_cost || 0;
  const subtotal = labor + partsCost;
  const taxRate = settings.tax_rate || 0;
  const taxAmt = subtotal * (taxRate / 100);
  const total = subtotal + taxAmt;

  const priceLine = (label, value, bold) => {
    doc.fillColor(bold ? '#0f172a' : '#475569').fontSize(bold ? 10 : 9).font(bold ? 'Helvetica-Bold' : 'Helvetica');
    doc.text(label, 380, y);
    doc.text(value, 490, y, { width: 70, align: 'right' });
    y += 16;
  };

  priceLine('Labor', `$${labor.toFixed(2)}`);
  priceLine('Parts', `$${partsCost.toFixed(2)}`);
  priceLine(`${settings.tax_label||'Tax'} (${taxRate}%)`, `$${taxAmt.toFixed(2)}`);
  doc.moveTo(380,y).lineTo(560,y).lineWidth(0.5).strokeColor('#475569').stroke();
  y += 4;
  priceLine('TOTAL', `$${total.toFixed(2)}`, true);
  y += 10;

  // ── AUTHORIZATION ──
  if (y > 650) { doc.addPage(); y = 50; }
  sectionHeader('Customer Authorization');
  doc.fillColor('#475569').fontSize(8.5).font('Helvetica')
    .text('I authorize the above repairs and agree to pay the estimated charges. I understand that additional charges may apply if further issues are discovered. Equipment left over 30 days may be subject to storage fees.', 50, y, { width: W-100 });
  y += 36;

  twoCol('Customer signature', '', 'Date', '');
  twoCol('Technician signature', '', 'Date', '');

  // Footer bar
  doc.rect(0, 756, W, 6).fill(accent);
  doc.fillColor('#94a3b8').fontSize(7.5).font('Helvetica')
    .text(settings.invoice_notes || 'Thank you for your business!', 50, 742, { width: W-100, align: 'center' });

  doc.end();
});

// Explicit status change (any authenticated user)
router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  const valid = ['intake','diagnosing','waiting_parts','in_repair','ready','completed','cancelled'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const old = db.prepare('SELECT status FROM repairs WHERE id=?').get(req.params.id);
  db.prepare('UPDATE repairs SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status, req.params.id);
  const updated = db.prepare('SELECT r.*, c.name as customer_name FROM repairs r JOIN customers c ON r.customer_id=c.id WHERE r.id=?').get(req.params.id);
  // Trigger workflows if status changed
  if (old && old.status !== status) {
    try {
      const http = require('http');
      const token = require('jsonwebtoken').sign({ id: req.user.id, username: req.user.username, role: req.user.role }, process.env.JWT_SECRET || 'devsecret');
      const body = JSON.stringify({ repair_id: req.params.id, status });
      const opts = { hostname: 'localhost', port: process.env.PORT || 3000, path: '/api/workflows/trigger', method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'Content-Length': Buffer.byteLength(body) } };
      const r2 = http.request(opts, resp => resp.resume());
      r2.on('error', () => {});
      r2.write(body); r2.end();
    } catch(e) {}
  }
  res.json(updated);
});

router.patch('/:id/kiosk-active', (req, res) => {
  db.prepare('UPDATE repairs SET is_active_kiosk = 0').run();
  db.prepare('UPDATE repairs SET is_active_kiosk = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Permanently delete all soft-deleted items
router.post('/trash/empty', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  db.prepare('DELETE FROM repairs WHERE deleted_at IS NOT NULL').run();
  res.json({ ok: true });
});

module.exports = router;
