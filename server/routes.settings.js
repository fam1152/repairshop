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
  const settings = req.body;
  const current = db.prepare('SELECT * FROM settings WHERE id=1').get();
  
  // Build dynamic update to avoid clearing fields not sent
  const keys = [
    'company_name', 'address', 'phone', 'email', 'tax_rate', 'tax_label', 
    'invoice_color', 'invoice_notes', 'dark_mode', 'currency',
    'auto_sync_google_calendar', 'auto_sync_google_contacts', 'auto_sync_google_drive',
    'ui_scale', 'donation_link', 'support_email', 'email_provider', 'email_api_key',
    'ai_mode', 'ai_cloud_provider', 'ai_cloud_key', 'ai_search_provider', 'ai_search_key',
    'ai_auto_research', 'ollama_url', 'device_types'
  ];

  let sql = 'UPDATE settings SET ';
  let params = [];
  let updates = [];

  keys.forEach(k => {
    if (k in settings) {
      updates.push(`${k}=?`);
      let val = settings[k];
      if (k.endsWith('_sync') || k === 'ai_auto_research' || k === 'dark_mode') val = val ? 1 : 0;
      if (k === 'tax_rate') val = parseFloat(val) || 0;
      params.push(val);
    }
  });

  if (updates.length > 0) {
    sql += updates.join(', ') + ' WHERE id=1';
    db.prepare(sql).run(...params);
  }

  res.json(db.prepare('SELECT * FROM settings WHERE id=1').get());
});

router.post('/logo', upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const logo_url = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE settings SET logo_url=? WHERE id=1').run(logo_url);
  res.json({ logo_url });
});

module.exports = router;
