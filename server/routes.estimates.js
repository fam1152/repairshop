const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const auth = require('./auth.middleware');

router.use(auth);

const uploadsPath = process.env.UPLOADS_PATH || path.join(__dirname, '../data/uploads');

function nextEstimateNumber() {
  const last = db.prepare("SELECT estimate_number FROM estimates ORDER BY created_at DESC LIMIT 1").get();
  if (!last) return 'EST-0001';
  const num = parseInt((last.estimate_number || '0').replace(/\D/g, '')) + 1;
  return `EST-${String(num).padStart(4, '0')}`;
}

router.get('/', (req, res) => {
  const { customer_id, status } = req.query;
  let sql = `SELECT e.*, c.name as customer_name FROM estimates e JOIN customers c ON e.customer_id=c.id WHERE e.deleted_at IS NULL`;
  const params = [];
  if (customer_id) { sql += ' AND e.customer_id=?'; params.push(customer_id); }
  if (status) { sql += ' AND e.status=?'; params.push(status); }
  sql += ' ORDER BY e.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const est = db.prepare(`SELECT e.*, c.name as customer_name, c.email as customer_email,
    c.phone as customer_phone, c.address as customer_address
    FROM estimates e JOIN customers c ON e.customer_id=c.id WHERE e.id=?`).get(req.params.id);
  if (!est) return res.status(404).json({ error: 'Not found' });
  est.line_items = JSON.parse(est.line_items || '[]');
  res.json(est);
});

router.post('/', (req, res) => {
  const { customer_id, repair_id, line_items, notes, valid_until } = req.body;
  if (!customer_id) return res.status(400).json({ error: 'customer_id required' });
  const items = line_items || [];
  const subtotal = items.reduce((s, i) => s + (parseFloat(i.qty) || 1) * (parseFloat(i.unit_price) || 0), 0);
  const settings = db.prepare('SELECT * FROM settings WHERE id=1').get();
  const tax_amount = subtotal * ((settings.tax_rate || 0) / 100);
  const total = subtotal + tax_amount;
  const id = uuidv4();
  const estimate_number = nextEstimateNumber();
  db.prepare(`INSERT INTO estimates (id,customer_id,repair_id,estimate_number,status,line_items,subtotal,tax_amount,total,notes,valid_until)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id, customer_id, repair_id || null, estimate_number, 'draft',
    JSON.stringify(items), subtotal, tax_amount, total, notes || '', valid_until || null);
  res.json(db.prepare('SELECT * FROM estimates WHERE id=?').get(id));
});

router.put('/:id', (req, res) => {
  const { line_items, notes, status, valid_until } = req.body;
  const items = line_items || [];
  const subtotal = items.reduce((s, i) => s + (parseFloat(i.qty) || 1) * (parseFloat(i.unit_price) || 0), 0);
  const settings = db.prepare('SELECT * FROM settings WHERE id=1').get();
  const tax_amount = subtotal * ((settings.tax_rate || 0) / 100);
  const total = subtotal + tax_amount;
  db.prepare(`UPDATE estimates SET line_items=?,subtotal=?,tax_amount=?,total=?,notes=?,status=?,valid_until=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(JSON.stringify(items), subtotal, tax_amount, total, notes || '', status || 'draft', valid_until || null, req.params.id);
  res.json(db.prepare('SELECT * FROM estimates WHERE id=?').get(req.params.id));
});

// Convert estimate to invoice
router.post('/:id/convert', (req, res) => {
  const est = db.prepare(`SELECT e.*, c.name as customer_name FROM estimates e JOIN customers c ON e.customer_id=c.id WHERE e.id=?`).get(req.params.id);
  if (!est) return res.status(404).json({ error: 'Not found' });
  est.line_items = JSON.parse(est.line_items || '[]');

  // Create invoice
  const lastInv = db.prepare("SELECT invoice_number FROM invoices ORDER BY created_at DESC LIMIT 1").get();
  const invNum = lastInv ? `INV-${String(parseInt((lastInv.invoice_number || '0').replace(/\D/g, '')) + 1).padStart(4, '0')}` : 'INV-0001';
  const invId = uuidv4();
  db.prepare(`INSERT INTO invoices (id,repair_id,customer_id,invoice_number,status,line_items,subtotal,tax_amount,total,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(invId, est.repair_id, est.customer_id, invNum, 'draft',
    est.line_items_raw || JSON.stringify(est.line_items), est.subtotal, est.tax_amount, est.total, est.notes || '');

  // Mark estimate as converted
  db.prepare("UPDATE estimates SET status='converted', converted_invoice_id=? WHERE id=?").run(invId, req.params.id);
  res.json({ invoice_id: invId, invoice_number: invNum });
});

router.delete('/:id', (req, res) => {
  db.prepare('UPDATE estimates SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/restore', (req, res) => {
  db.prepare('UPDATE estimates SET deleted_at=NULL WHERE id=?').run(req.params.id);
  res.json(db.prepare('SELECT * FROM estimates WHERE id=?').get(req.params.id));
});

router.get('/trash/list', (req, res) => {
  res.json(db.prepare('SELECT * FROM estimates WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all());
});

// PDF generation
router.get('/:id/pdf', (req, res) => {
  const est = db.prepare(`SELECT e.*, c.name as customer_name, c.email as customer_email,
    c.phone as customer_phone, c.address as customer_address
    FROM estimates e JOIN customers c ON e.customer_id=c.id WHERE e.id=?`).get(req.params.id);
  if (!est) return res.status(404).json({ error: 'Not found' });
  est.line_items = JSON.parse(est.line_items || '[]');
  const settings = db.prepare('SELECT * FROM settings WHERE id=1').get();

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${est.estimate_number}.pdf"`);
  doc.pipe(res);

  const accent = settings.invoice_color || '#2563eb';
  const hexToRgb = h => { const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h); return r ? [parseInt(r[1], 16), parseInt(r[2], 16), parseInt(r[3], 16)] : [37, 99, 235]; };

  doc.rect(0, 0, 595, 8).fill(accent);

  if (settings.logo_url) {
    const logoPath = path.join(uploadsPath, path.basename(settings.logo_url));
    if (fs.existsSync(logoPath)) { try { doc.image(logoPath, 50, 20, { height: 60 }); } catch (e) {} }
  }

  doc.fillColor(accent).fontSize(18).font('Helvetica-Bold').text(settings.company_name || 'My IT Shop', 50, 30);
  doc.fillColor('#666').fontSize(9).font('Helvetica');
  if (settings.address) doc.text(settings.address, 50, 52);
  if (settings.phone) doc.text(settings.phone, 50, 64);

  doc.fillColor(accent).fontSize(28).font('Helvetica-Bold').text('ESTIMATE', 400, 30, { align: 'right' });
  doc.fillColor('#333').fontSize(10).font('Helvetica').text(`# ${est.estimate_number}`, 400, 62, { align: 'right' });
  doc.text(`Date: ${new Date(est.created_at).toLocaleDateString()}`, 400, 76, { align: 'right' });
  if (est.valid_until) doc.text(`Valid until: ${new Date(est.valid_until).toLocaleDateString()}`, 400, 90, { align: 'right' });

  const statusColors = { draft: '#6b7280', sent: '#d97706', approved: '#16a34a', declined: '#dc2626', converted: '#2563eb' };
  doc.roundedRect(400, 104, 140, 20, 4).fill(statusColors[est.status] || '#6b7280');
  doc.fillColor('#fff').fontSize(10).font('Helvetica-Bold').text(est.status.toUpperCase(), 400, 108, { width: 140, align: 'center' });

  doc.moveTo(50, 130).lineTo(545, 130).lineWidth(0.5).strokeColor('#e5e7eb').stroke();
  doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text('ESTIMATE FOR', 50, 140);
  doc.fillColor('#333').fontSize(11).font('Helvetica-Bold').text(est.customer_name, 50, 153);
  doc.fontSize(9).font('Helvetica').fillColor('#555');
  if (est.customer_address) doc.text(est.customer_address, 50, 167);
  if (est.customer_phone) doc.text(est.customer_phone, 50, 179);
  if (est.customer_email) doc.text(est.customer_email, 50, 191);

  const tableTop = 220;
  doc.rect(50, tableTop, 495, 22).fill(accent);
  doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
  doc.text('DESCRIPTION', 58, tableTop + 7);
  doc.text('QTY', 350, tableTop + 7, { width: 50, align: 'right' });
  doc.text('UNIT PRICE', 405, tableTop + 7, { width: 70, align: 'right' });
  doc.text('TOTAL', 480, tableTop + 7, { width: 60, align: 'right' });

  let y = tableTop + 30;
  est.line_items.forEach((item, i) => {
    if (i % 2 === 1) doc.rect(50, y - 5, 495, 20).fill('#f9fafb');
    doc.fillColor('#333').fontSize(9).font('Helvetica').text(item.description || '', 58, y, { width: 280 });
    doc.text(String(item.qty || 1), 350, y, { width: 50, align: 'right' });
    doc.text(`$${parseFloat(item.unit_price || 0).toFixed(2)}`, 405, y, { width: 70, align: 'right' });
    doc.text(`$${((item.qty || 1) * (item.unit_price || 0)).toFixed(2)}`, 480, y, { width: 60, align: 'right' });
    y += 20;
  });

  doc.moveTo(50, y + 5).lineTo(545, y + 5).lineWidth(0.5).strokeColor('#e5e7eb').stroke();
  y += 15;
  doc.fillColor('#555').fontSize(9).font('Helvetica').text('Subtotal', 380, y);
  doc.text(`$${est.subtotal.toFixed(2)}`, 480, y, { width: 60, align: 'right' });
  y += 15;
  doc.text(`${settings.tax_label || 'Tax'} (${settings.tax_rate || 0}%)`, 380, y);
  doc.text(`$${est.tax_amount.toFixed(2)}`, 480, y, { width: 60, align: 'right' });
  y += 5;
  doc.rect(370, y, 175, 24).fill(accent);
  doc.fillColor('#fff').fontSize(11).font('Helvetica-Bold').text('TOTAL', 380, y + 6);
  doc.text(`$${est.total.toFixed(2)}`, 480, y + 6, { width: 60, align: 'right' });
  y += 40;

  if (est.notes) {
    doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text('NOTES', 50, y);
    doc.fillColor('#555').font('Helvetica').text(est.notes, 50, y + 12, { width: 495 });
    y += 40;
  }

  doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text('ACCEPTANCE', 50, y);
  doc.fillColor('#555').font('Helvetica').fontSize(8).text('By signing below, you authorize the above work to be performed at the quoted price.', 50, y + 12, { width: 495 });
  y += 30;
  doc.moveTo(50, y + 20).lineTo(250, y + 20).lineWidth(0.4).strokeColor('#aaa').stroke();
  doc.moveTo(300, y + 20).lineTo(495, y + 20).lineWidth(0.4).strokeColor('#aaa').stroke();
  doc.fillColor('#aaa').fontSize(8).text('Customer signature', 50, y + 24);
  doc.text('Date', 300, y + 24);

  if (settings.invoice_notes) {
    doc.fillColor('#aaa').fontSize(8).font('Helvetica').text(settings.invoice_notes, 50, 800, { width: 495, align: 'center' });
  }
  doc.rect(0, 820, 595, 8).fill(accent);
  doc.end();
});

// Permanently delete all soft-deleted items
router.post('/trash/empty', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  db.prepare('DELETE FROM estimates WHERE deleted_at IS NOT NULL').run();
  res.json({ ok: true });
});

module.exports = router;
