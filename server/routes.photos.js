const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./db');
const auth = require('./auth.middleware');

router.use(auth);

const uploadsPath = process.env.UPLOADS_PATH || '/data/uploads';
const photosPath = path.join(uploadsPath, 'photos');
if (!fs.existsSync(photosPath)) fs.mkdirSync(photosPath, { recursive: true });

const storage = multer.diskStorage({
  destination: photosPath,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `photo_${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Images only'));
  }
});

// Get all photos for a repair
router.get('/repair/:repairId', (req, res) => {
  const photos = db.prepare('SELECT * FROM repair_photos WHERE repair_id=? ORDER BY created_at ASC').all(req.params.repairId);
  res.json(photos.map(p => ({ ...p, url: `/uploads/photos/${p.filename}` })));
});

// Upload photo(s) to a repair
router.post('/repair/:repairId', upload.array('photos', 20), (req, res) => {
  const { stage, caption } = req.body;
  const repairId = req.params.repairId;

  // Verify repair exists
  const repair = db.prepare('SELECT id FROM repairs WHERE id=?').get(repairId);
  if (!repair) return res.status(404).json({ error: 'Repair not found' });

  const saved = [];
  for (const file of req.files) {
    const id = uuidv4();
    db.prepare('INSERT INTO repair_photos (id,repair_id,filename,original_name,caption,stage) VALUES (?,?,?,?,?,?)')
      .run(id, repairId, file.filename, file.originalname, caption || '', stage || 'intake');
    saved.push({ id, repair_id: repairId, filename: file.filename, original_name: file.originalname, caption: caption || '', stage: stage || 'intake', url: `/uploads/photos/${file.filename}` });
  }
  res.json(saved);
});

// Update photo caption/stage
router.put('/:id', (req, res) => {
  const { caption, stage } = req.body;
  db.prepare('UPDATE repair_photos SET caption=?, stage=? WHERE id=?').run(caption || '', stage || 'intake', req.params.id);
  const p = db.prepare('SELECT * FROM repair_photos WHERE id=?').get(req.params.id);
  res.json({ ...p, url: `/uploads/photos/${p.filename}` });
});

// Delete a photo
router.delete('/:id', (req, res) => {
  const photo = db.prepare('SELECT * FROM repair_photos WHERE id=?').get(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Not found' });
  // Delete file from disk
  const filePath = path.join(photosPath, photo.filename);
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch (e) {}
  }
  db.prepare('DELETE FROM repair_photos WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
