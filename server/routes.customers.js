const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const auth = require('./auth.middleware');

router.use(auth);

router.get('/', (req, res) => {
  const { q } = req.query;
  let rows;
  if (q) {
    rows = db.prepare(`SELECT * FROM customers WHERE deleted_at IS NULL AND (name LIKE ? OR phone LIKE ? OR email LIKE ?) ORDER BY name`).all(`%${q}%`, `%${q}%`, `%${q}%`);
  } else {
    rows = db.prepare('SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY name').all();
  }
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const repairs = db.prepare('SELECT * FROM repairs WHERE customer_id = ? ORDER BY created_at DESC').all(req.params.id);
  const calls = db.prepare('SELECT * FROM call_logs WHERE customer_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json({ ...c, repairs, calls });
});

router.post('/', (req, res) => {
  const { name, email, phone, address, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = uuidv4();
  db.prepare('INSERT INTO customers (id,name,email,phone,address,notes) VALUES (?,?,?,?,?,?)').run(id, name, email||'', phone||'', address||'', notes||'');
  res.json(db.prepare('SELECT * FROM customers WHERE id = ?').get(id));
});

router.put('/:id', (req, res) => {
  const { name, email, phone, address, notes } = req.body;
  db.prepare('UPDATE customers SET name=?,email=?,phone=?,address=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(name, email||'', phone||'', address||'', notes||'', req.params.id);
  res.json(db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('UPDATE customers SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Restore soft-deleted customer
router.post('/:id/restore', (req, res) => {
  db.prepare('UPDATE customers SET deleted_at=NULL WHERE id=?').run(req.params.id);
  res.json(db.prepare('SELECT * FROM customers WHERE id=?').get(req.params.id));
});

// Get deleted customers (trash)
router.get('/trash/list', (req, res) => {
  res.json(db.prepare('SELECT * FROM customers WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all());
});

router.get('/export/csv', (req, res) => {
  const customers = db.prepare('SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY name').all();
  
  const headers = ['ID', 'Name', 'Email', 'Phone', 'Address', 'Notes', 'Created At'];
  const rows = customers.map(c => [
    c.id,
    `"${c.name.replace(/"/g, '""')}"`,
    c.email,
    c.phone,
    `"${(c.address || '').replace(/"/g, '""')}"`,
    `"${(c.notes || '').replace(/"/g, '""')}"`,
    c.created_at
  ]);

  const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="customers-export.csv"');
  res.send(csv);
});

// Call logs
router.post('/:id/calls', (req, res) => {
  const { repair_id, direction, notes, outcome } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO call_logs (id,customer_id,repair_id,direction,notes,outcome) VALUES (?,?,?,?,?,?)').run(id, req.params.id, repair_id||null, direction||'outbound', notes||'', outcome||'');
  res.json(db.prepare('SELECT * FROM call_logs WHERE id = ?').get(id));
});

router.delete('/calls/:callId', (req, res) => {
  db.prepare('DELETE FROM call_logs WHERE id = ?').run(req.params.callId);
  res.json({ ok: true });
});

// Permanently delete all soft-deleted items
router.post('/trash/empty', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  db.prepare('DELETE FROM customers WHERE deleted_at IS NOT NULL').run();
  res.json({ ok: true });
});

module.exports = router;

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const docsPath = path.join(process.env.UPLOADS_PATH || '/data/uploads', 'customer-docs');
if (!fs.existsSync(docsPath)) fs.mkdirSync(docsPath, { recursive: true });

const docStorage = multer.diskStorage({
  destination: docsPath,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `doc_${req.params.id}_${Date.now()}${ext}`);
  }
});
const docUpload = multer({ storage: docStorage, limits: { fileSize: 20 * 1024 * 1024 } });

// Product keys
router.get('/:id/product-keys', (req, res) => {
  res.json(db.prepare('SELECT * FROM customer_product_keys WHERE customer_id=? ORDER BY created_at DESC').all(req.params.id));
});

router.post('/:id/product-keys', (req, res) => {
  const { v4: uuidv4 } = require('uuid');
  const { product, key_value, repair_id, notes } = req.body;
  if (!key_value) return res.status(400).json({ error: 'Key value required' });
  const id = uuidv4();
  db.prepare('INSERT INTO customer_product_keys (id,customer_id,repair_id,product,key_value,notes) VALUES (?,?,?,?,?,?)')
    .run(id, req.params.id, repair_id || null, product || '', key_value, notes || '');
  res.json(db.prepare('SELECT * FROM customer_product_keys WHERE id=?').get(id));
});

router.delete('/:id/product-keys/:keyId', (req, res) => {
  db.prepare('DELETE FROM customer_product_keys WHERE id=? AND customer_id=?').run(req.params.keyId, req.params.id);
  res.json({ ok: true });
});

// Documents
router.get('/:id/documents', (req, res) => {
  res.json(db.prepare('SELECT * FROM customer_documents WHERE customer_id=? ORDER BY created_at DESC').all(req.params.id));
});

router.post('/:id/documents', docUpload.single('document'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { v4: uuidv4 } = require('uuid');
  const id = uuidv4();
  db.prepare('INSERT INTO customer_documents (id,customer_id,filename,original_name,file_type,file_size,notes) VALUES (?,?,?,?,?,?,?)')
    .run(id, req.params.id, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.body.notes || '');
  res.json(db.prepare('SELECT * FROM customer_documents WHERE id=?').get(id));
});

router.delete('/:id/documents/:docId', (req, res) => {
  const doc = db.prepare('SELECT * FROM customer_documents WHERE id=? AND customer_id=?').get(req.params.docId, req.params.id);
  if (doc) {
    try { fs.unlinkSync(path.join(docsPath, doc.filename)); } catch(e) {}
    db.prepare('DELETE FROM customer_documents WHERE id=?').run(req.params.docId);
  }
  res.json({ ok: true });
});

// Serve document files
router.get('/:id/documents/:docId/file', (req, res) => {
  const doc = db.prepare('SELECT * FROM customer_documents WHERE id=? AND customer_id=?').get(req.params.docId, req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  const filePath = path.join(docsPath, doc.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.setHeader('Content-Disposition', `inline; filename="${doc.original_name}"`);
  res.sendFile(filePath);
});

// Google Contacts sync for a single customer
router.post('/:id/sync-google', async (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id=?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Not found' });
  try {
    const { google } = require('googleapis');
    const token = db.prepare('SELECT * FROM google_tokens WHERE id=1').get();
    if (!token) return res.status(400).json({ error: 'Google not connected. Go to Settings → Cloud to connect.' });
    const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    oauth2.setCredentials(JSON.parse(token.token_data));
    const people = google.people({ version: 'v1', auth: oauth2 });
    const contactData = {
      names: [{ givenName: customer.name }],
      emailAddresses: customer.email ? [{ value: customer.email }] : [],
      phoneNumbers: customer.phone ? [{ value: customer.phone }] : [],
      addresses: customer.address ? [{ formattedValue: customer.address }] : [],
    };
    let result;
    if (customer.google_contact_id) {
      result = await people.people.updateContact({
        resourceName: customer.google_contact_id,
        updatePersonFields: 'names,emailAddresses,phoneNumbers,addresses',
        requestBody: contactData,
      });
    } else {
      result = await people.people.createContact({ requestBody: contactData });
      db.prepare('UPDATE customers SET google_contact_id=? WHERE id=?').run(result.data.resourceName, customer.id);
    }
    res.json({ ok: true, resource: result.data.resourceName });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Bulk sync all customers to Google Contacts
router.post('/sync-all-google', async (req, res) => {
  try {
    const { google } = require('googleapis');
    const token = db.prepare('SELECT * FROM google_tokens WHERE id=1').get();
    if (!token) return res.status(400).json({ error: 'Google not connected' });
    const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    oauth2.setCredentials(JSON.parse(token.token_data));
    const people = google.people({ version: 'v1', auth: oauth2 });

    const customers = db.prepare('SELECT * FROM customers WHERE deleted_at IS NULL').all();
    let synced = 0;
    for (const c of customers) {
      try {
        const contactData = {
          names: [{ givenName: c.name }],
          emailAddresses: c.email ? [{ value: c.email }] : [],
          phoneNumbers: c.phone ? [{ value: c.phone }] : [],
        };
        if (c.google_contact_id) {
          await people.people.updateContact({ resourceName: c.google_contact_id, updatePersonFields: 'names,emailAddresses,phoneNumbers', requestBody: contactData });
        } else {
          const r = await people.people.createContact({ requestBody: contactData });
          db.prepare('UPDATE customers SET google_contact_id=? WHERE id=?').run(r.data.resourceName, c.id);
        }
        synced++;
      } catch(e) { /* skip individual failures */ }
    }
    res.json({ ok: true, synced, total: customers.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── CUSTOMER NOTES ──
router.get('/:id/notes', (req, res) => {
  res.json(db.prepare('SELECT * FROM customer_notes WHERE customer_id=? ORDER BY pinned DESC, updated_at DESC').all(req.params.id));
});

router.post('/:id/notes', (req, res) => {
  const { v4: uuidv4 } = require('uuid');
  const { heading, body, pinned } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO customer_notes (id,customer_id,heading,body,pinned) VALUES (?,?,?,?,?)')
    .run(id, req.params.id, heading || 'Note', body || '', pinned ? 1 : 0);
  res.json(db.prepare('SELECT * FROM customer_notes WHERE id=?').get(id));
});

router.put('/:id/notes/:noteId', (req, res) => {
  const { heading, body, pinned } = req.body;
  db.prepare('UPDATE customer_notes SET heading=?,body=?,pinned=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND customer_id=?')
    .run(heading || 'Note', body || '', pinned ? 1 : 0, req.params.noteId, req.params.id);
  res.json(db.prepare('SELECT * FROM customer_notes WHERE id=?').get(req.params.noteId));
});

router.delete('/:id/notes/:noteId', (req, res) => {
  db.prepare('DELETE FROM customer_notes WHERE id=? AND customer_id=?').run(req.params.noteId, req.params.id);
  res.json({ ok: true });
});
