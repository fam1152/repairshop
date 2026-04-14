const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const db = require('./db');
const auth = require('./auth.middleware');

router.use(auth);

const uploadsPath = process.env.UPLOADS_PATH || path.join(__dirname, '../data/uploads');

router.get('/', (req, res) => {
  const { customer_id, status } = req.query;
  let sql = `SELECT i.*, c.name as customer_name FROM invoices i JOIN customers c ON i.customer_id=c.id WHERE i.deleted_at IS NULL`;
  const params = [];
  if (customer_id) { sql += ' AND i.customer_id = ?'; params.push(customer_id); }
  if (status) { sql += ' AND i.status = ?'; params.push(status); }
  sql += ' ORDER BY i.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const inv = db.prepare(`SELECT i.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone, c.address as customer_address FROM invoices i JOIN customers c ON i.customer_id=c.id WHERE i.id=?`).get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  inv.line_items = JSON.parse(inv.line_items || '[]');
  res.json(inv);
});

function nextInvoiceNumber() {
  const last = db.prepare("SELECT invoice_number FROM invoices ORDER BY created_at DESC LIMIT 1").get();
  if (!last) return 'INV-0001';
  const num = parseInt((last.invoice_number || '0').replace(/\D/g,'')) + 1;
  return `INV-${String(num).padStart(4,'0')}`;
}

router.post('/', (req, res) => {
  const { repair_id, customer_id, line_items, notes, due_date } = req.body;
  if (!customer_id) return res.status(400).json({ error: 'customer_id required' });
  const items = line_items || [];
  const subtotal = items.reduce((s, i) => s + (parseFloat(i.qty)||1) * (parseFloat(i.unit_price)||0), 0);
  const settings = db.prepare('SELECT * FROM settings WHERE id=1').get();
  const tax_amount = subtotal * ((settings.tax_rate||0)/100);
  const total = subtotal + tax_amount;
  const id = uuidv4();
  const invoice_number = nextInvoiceNumber();
  db.prepare(`INSERT INTO invoices (id,repair_id,customer_id,invoice_number,status,line_items,subtotal,tax_amount,total,notes,due_date) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id,repair_id||null,customer_id,invoice_number,'draft',JSON.stringify(items),subtotal,tax_amount,total,notes||'',due_date||null);
  res.json(db.prepare('SELECT * FROM invoices WHERE id=?').get(id));
});

router.put('/:id', (req, res) => {
  const { line_items, notes, status, due_date } = req.body;
  const items = line_items || [];
  const subtotal = items.reduce((s, i) => s + (parseFloat(i.qty)||1) * (parseFloat(i.unit_price)||0), 0);
  const settings = db.prepare('SELECT * FROM settings WHERE id=1').get();
  const tax_amount = subtotal * ((settings.tax_rate||0)/100);
  const total = subtotal + tax_amount;
  const paid_date = status === 'paid' ? new Date().toISOString() : null;
  db.prepare(`UPDATE invoices SET line_items=?,subtotal=?,tax_amount=?,total=?,notes=?,status=?,due_date=?,paid_date=? WHERE id=?`).run(JSON.stringify(items),subtotal,tax_amount,total,notes||'',status||'draft',due_date||null,paid_date,req.params.id);
  res.json(db.prepare('SELECT * FROM invoices WHERE id=?').get(req.params.id));
});

router.get('/:id/pdf', (req, res) => {
  const inv = db.prepare(`SELECT i.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone, c.address as customer_address FROM invoices i JOIN customers c ON i.customer_id=c.id WHERE i.id=?`).get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  inv.line_items = JSON.parse(inv.line_items || '[]');
  const settings = db.prepare('SELECT * FROM settings WHERE id=1').get();

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${inv.invoice_number}.pdf"`);
  doc.pipe(res);

  const accent = settings.invoice_color || '#2563eb';
  const hexToRgb = h => { const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h); return r ? [parseInt(r[1],16),parseInt(r[2],16),parseInt(r[3],16)] : [37,99,235]; };
  const [ar,ag,ab] = hexToRgb(accent);

  // Header bar
  doc.rect(0,0,595,8).fill(accent);

  // Logo
  if (settings.logo_url) {
    const logoPath = path.join(uploadsPath, path.basename(settings.logo_url));
    if (fs.existsSync(logoPath)) {
      try { doc.image(logoPath, 50, 20, { height: 60 }); } catch(e) {}
    }
  }

  // Company info
  doc.fillColor(accent).fontSize(18).font('Helvetica-Bold').text(settings.company_name || 'My IT Shop', 50, 30);
  doc.fillColor('#666').fontSize(9).font('Helvetica');
  if (settings.address) doc.text(settings.address, 50, 52);
  if (settings.phone) doc.text(settings.phone, 50, 64);
  if (settings.email) doc.text(settings.email, 50, 76);

  // Invoice title
  doc.fillColor(accent).fontSize(28).font('Helvetica-Bold').text('INVOICE', 400, 30, { align: 'right' });
  doc.fillColor('#333').fontSize(10).font('Helvetica').text(`# ${inv.invoice_number}`, 400, 62, { align: 'right' });
  doc.text(`Date: ${new Date(inv.issued_date).toLocaleDateString()}`, 400, 76, { align: 'right' });
  if (inv.due_date) doc.text(`Due: ${new Date(inv.due_date).toLocaleDateString()}`, 400, 90, { align: 'right' });

  // Status badge
  const statusColor = inv.status === 'paid' ? '#16a34a' : inv.status === 'sent' ? '#d97706' : '#6b7280';
  doc.roundedRect(400, 104, 140, 20, 4).fill(statusColor);
  doc.fillColor('#fff').fontSize(10).font('Helvetica-Bold').text(inv.status.toUpperCase(), 400, 108, { width: 140, align: 'center' });

  // Bill to
  doc.moveTo(50,130).lineTo(545,130).lineWidth(0.5).strokeColor('#e5e7eb').stroke();
  doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text('BILL TO', 50, 140);
  doc.fillColor('#333').fontSize(11).font('Helvetica-Bold').text(inv.customer_name, 50, 153);
  doc.fontSize(9).font('Helvetica').fillColor('#555');
  if (inv.customer_address) doc.text(inv.customer_address, 50, 167);
  if (inv.customer_phone) doc.text(inv.customer_phone, 50, 179);
  if (inv.customer_email) doc.text(inv.customer_email, 50, 191);

  // Line items table
  const tableTop = 220;
  doc.rect(50, tableTop, 495, 22).fill(accent);
  doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
  doc.text('DESCRIPTION', 58, tableTop+7);
  doc.text('QTY', 350, tableTop+7, { width: 50, align: 'right' });
  doc.text('UNIT PRICE', 405, tableTop+7, { width: 70, align: 'right' });
  doc.text('TOTAL', 480, tableTop+7, { width: 60, align: 'right' });

  let y = tableTop + 30;
  inv.line_items.forEach((item, i) => {
    if (i % 2 === 1) doc.rect(50, y-5, 495, 20).fill('#f9fafb');
    doc.fillColor('#333').fontSize(9).font('Helvetica').text(item.description || '', 58, y, { width: 280 });
    doc.text(String(item.qty || 1), 350, y, { width: 50, align: 'right' });
    doc.text(`$${parseFloat(item.unit_price||0).toFixed(2)}`, 405, y, { width: 70, align: 'right' });
    doc.text(`$${((item.qty||1)*(item.unit_price||0)).toFixed(2)}`, 480, y, { width: 60, align: 'right' });
    y += 20;
  });

  doc.moveTo(50,y+5).lineTo(545,y+5).lineWidth(0.5).strokeColor('#e5e7eb').stroke();
  y += 15;

  doc.fillColor('#555').fontSize(9).font('Helvetica').text('Subtotal', 380, y); doc.text(`$${inv.subtotal.toFixed(2)}`, 480, y, { width: 60, align: 'right' });
  y += 15;
  doc.text(`${settings.tax_label||'Tax'} (${settings.tax_rate||0}%)`, 380, y); doc.text(`$${inv.tax_amount.toFixed(2)}`, 480, y, { width: 60, align: 'right' });
  y += 5;
  doc.rect(370, y, 175, 24).fill(accent);
  doc.fillColor('#fff').fontSize(11).font('Helvetica-Bold').text('TOTAL', 380, y+6); doc.text(`$${inv.total.toFixed(2)}`, 480, y+6, { width: 60, align: 'right' });
  y += 40;

  if (inv.notes) {
    doc.fillColor(accent).fontSize(9).font('Helvetica-Bold').text('NOTES', 50, y);
    doc.fillColor('#555').font('Helvetica').text(inv.notes, 50, y+12, { width: 495 });
    y += 40;
  }
  if (settings.invoice_notes) {
    doc.fillColor('#aaa').fontSize(8).font('Helvetica').text(settings.invoice_notes, 50, y+10, { width: 495, align: 'center' });
  }
  doc.rect(0, 820, 595, 8).fill(accent);

  doc.end();
});

router.delete('/:id', (req, res) => {
  db.prepare('UPDATE invoices SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/restore', (req, res) => {
  db.prepare('UPDATE invoices SET deleted_at=NULL WHERE id=?').run(req.params.id);
  res.json(db.prepare('SELECT * FROM invoices WHERE id=?').get(req.params.id));
});

router.get('/trash/list', (req, res) => {
  res.json(db.prepare('SELECT i.*, c.name as customer_name FROM invoices i JOIN customers c ON i.customer_id=c.id WHERE i.deleted_at IS NOT NULL ORDER BY i.deleted_at DESC').all());
});

// Permanently delete all soft-deleted items
router.post('/trash/empty', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  db.prepare('DELETE FROM invoices WHERE deleted_at IS NOT NULL').run();
  res.json({ ok: true });
});

module.exports = router;

// ── PAYMENTS ──
const { v4: uuidv4pay } = require('uuid');

// Apply a payment to an invoice
router.post('/:id/payment', (req, res) => {
  const { amount, method, notes } = req.body;
  const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  const amt = parseFloat(amount);
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Valid amount required' });

  const newPaid = (inv.amount_paid || 0) + amt;
  const newBalance = Math.max(0, (inv.total || 0) - newPaid);
  const newStatus = newBalance <= 0 ? 'paid' : 'partial';
  const paidDate = newBalance <= 0 ? new Date().toISOString() : inv.paid_date;

  db.prepare('UPDATE invoices SET amount_paid=?, balance_due=?, status=?, paid_date=? WHERE id=?')
    .run(newPaid, newBalance, newStatus, paidDate, req.params.id);

  db.prepare('INSERT INTO invoice_payments (id,invoice_id,amount,method,notes,applied_by) VALUES (?,?,?,?,?,?)')
    .run(uuidv4pay(), req.params.id, amt, method || 'cash', notes || '', req.user.username);

  res.json(db.prepare('SELECT * FROM invoices WHERE id=?').get(req.params.id));
});

// Mark fully paid
router.post('/:id/mark-paid', (req, res) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE invoices SET status=?, amount_paid=?, balance_due=0, paid_date=? WHERE id=?')
    .run('paid', inv.total, new Date().toISOString(), req.params.id);
  db.prepare('INSERT INTO invoice_payments (id,invoice_id,amount,method,notes,applied_by) VALUES (?,?,?,?,?,?)')
    .run(uuidv4pay(), req.params.id, inv.total - (inv.amount_paid||0), 'cash', 'Marked as paid', req.user.username);
  res.json(db.prepare('SELECT * FROM invoices WHERE id=?').get(req.params.id));
});

// Apply to account (customer balance)
router.post('/:id/apply-to-account', (req, res) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE invoices SET status=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run('account', (inv.notes ? inv.notes + '\n' : '') + `Applied to account balance on ${new Date().toLocaleDateString()}`, req.params.id);
  res.json(db.prepare('SELECT * FROM invoices WHERE id=?').get(req.params.id));
});

// Get payment history for an invoice
router.get('/:id/payments', (req, res) => {
  res.json(db.prepare('SELECT * FROM invoice_payments WHERE invoice_id=? ORDER BY created_at DESC').all(req.params.id));
});

// Update authorized pickup
router.patch('/:id/authorized', (req, res) => {
  const { authorized_name, authorized_phone } = req.body;
  db.prepare('UPDATE invoices SET authorized_name=?, authorized_phone=? WHERE id=?')
    .run(authorized_name || '', authorized_phone || '', req.params.id);
  res.json({ ok: true });
});
