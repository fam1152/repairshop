const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./db');
const auth = require('./auth.middleware');

router.use(auth);

const uploadsPath = process.env.UPLOADS_PATH || path.join(__dirname, '../data/uploads');
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsPath,
  filename: (req, file, cb) => cb(null, `logo_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 5*1024*1024 }, fileFilter: (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) cb(null, true); else cb(new Error('Images only'));
}});

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM settings WHERE id=1').get());
});

router.put('/', (req, res) => {
  const { company_name, address, phone, email, tax_rate, tax_label, invoice_color, invoice_notes, dark_mode, currency } = req.body;
  db.prepare(`UPDATE settings SET company_name=?,address=?,phone=?,email=?,tax_rate=?,tax_label=?,invoice_color=?,invoice_notes=?,dark_mode=?,currency=? WHERE id=1`).run(company_name||'My IT Shop',address||'',phone||'',email||'',parseFloat(tax_rate)||0,tax_label||'Tax',invoice_color||'#2563eb',invoice_notes||'',dark_mode?1:0,currency||'USD');
  res.json(db.prepare('SELECT * FROM settings WHERE id=1').get());
});

router.post('/logo', upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const logo_url = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE settings SET logo_url=? WHERE id=1').run(logo_url);
  res.json({ logo_url });
});

module.exports = router;
