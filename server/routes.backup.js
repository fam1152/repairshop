const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const multer = require('multer');
const { execSync } = require('child_process');
const db = require('./db');
const auth = require('./auth.middleware');

router.use(auth);

const uploadsPath = process.env.UPLOADS_PATH || path.join(__dirname, '../data/uploads');
const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/repairshop.sqlite');
const dataDir = path.dirname(dbPath);
const tempDir = path.join(dataDir, 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// ── BACKUP ──
// Creates a zip containing the SQLite database + all uploaded files
router.get('/download', async (req, res) => {
  const customPath = req.query.path;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `repairshop-backup-${timestamp}.zip`;

  if (customPath) {
    try {
      if (!fs.existsSync(customPath)) fs.mkdirSync(customPath, { recursive: true });
      const fullPath = path.join(customPath, filename);
      const output = fs.createWriteStream(fullPath);
      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.pipe(output);

      if (fs.existsSync(dbPath)) {
        try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch (e) {}
        archive.file(dbPath, { name: 'repairshop.sqlite' });
      }
      if (fs.existsSync(uploadsPath)) archive.directory(uploadsPath, 'uploads');
      const printQueuePath = process.env.PRINT_QUEUE_PATH || path.join(__dirname, '../data/print-queue');
      if (fs.existsSync(printQueuePath)) archive.directory(printQueuePath, 'print-queue');
      
      await archive.finalize();
      return res.json({ ok: true, message: `Backup saved to ${fullPath}`, filename: fullPath });
    } catch (err) {
      return res.status(500).json({ error: `Failed to save backup to ${customPath}: ${err.message}` });
    }
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const archive = archiver('zip', { zlib: { level: 6 } });

  archive.on('error', err => {
    console.error('Backup error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Backup failed' });
  });

  archive.pipe(res);

  // Add database file
  if (fs.existsSync(dbPath)) {
    // Checkpoint WAL to ensure we get a clean snapshot
    try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch (e) {}
    archive.file(dbPath, { name: 'repairshop.sqlite' });
  }

  // Add uploads directory (logos, photos)
  if (fs.existsSync(uploadsPath)) {
    archive.directory(uploadsPath, 'uploads');
  }

  // Add print queue directory
  const printQueuePath = process.env.PRINT_QUEUE_PATH || path.join(__dirname, '../data/print-queue');
  if (fs.existsSync(printQueuePath)) {
    archive.directory(printQueuePath, 'print-queue');
  }

  // Add a metadata file
  const meta = {
    version: 4,
    created_at: new Date().toISOString(),
    db_path: dbPath,
    uploads_path: uploadsPath,
    print_queue_path: printQueuePath,
    tables: db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name),
  };
  archive.append(JSON.stringify(meta, null, 2), { name: 'backup-meta.json' });

  await archive.finalize();
});

// Get backup info / status
router.get('/info', (req, res) => {
  const dbExists = fs.existsSync(dbPath);
  const dbSize = dbExists ? fs.statSync(dbPath).size : 0;

  // Count records across main tables
  const counts = {};
  const tables = ['customers', 'repairs', 'invoices', 'inventory', 'estimates', 'appointments', 'reminders'];
  for (const t of tables) {
    try { counts[t] = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get().c; } catch (e) { counts[t] = 0; }
  }

  // Count photos
  try {
    const photosDir = path.join(uploadsPath, 'photos');
    counts.photos = fs.existsSync(photosDir) ? fs.readdirSync(photosDir).filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f)).length : 0;
  } catch (e) { counts.photos = 0; }

  res.json({
    db_size_bytes: dbSize,
    db_size_mb: (dbSize / 1024 / 1024).toFixed(2),
    record_counts: counts,
    db_path: dbPath,
    uploads_path: uploadsPath,
  });
});

// ── RESTORE ──
const restoreUpload = multer({
  dest: tempDir,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.zip') || file.mimetype === 'application/zip' || file.mimetype === 'application/octet-stream') {
      cb(null, true);
    } else {
      cb(new Error('Only .zip backup files are accepted'));
    }
  }
});

router.post('/restore', restoreUpload.single('backup'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No backup file uploaded' });

  const uploadedZip = req.file.path;

  try {
    // Validate the zip contains the expected files
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(uploadedZip);
    const entries = zip.getEntries().map(e => e.entryName);

    if (!entries.includes('repairshop.sqlite')) {
      fs.unlinkSync(uploadedZip);
      return res.status(400).json({ error: 'Invalid backup file — missing repairshop.sqlite' });
    }

    // Read metadata if present
    let meta = {};
    if (entries.includes('backup-meta.json')) {
      try { meta = JSON.parse(zip.readAsText('backup-meta.json')); } catch (e) {}
    }

    // Create a backup of the current database before overwriting
    const safetyBackup = `${dbPath}.pre-restore-${Date.now()}`;
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, safetyBackup);
    }

    // Extract database
    const dbEntry = zip.getEntry('repairshop.sqlite');
    fs.writeFileSync(dbPath, dbEntry.getData());

    // Extract uploads and print-queue if present
    const dataEntries = entries.filter(e => (e.startsWith('uploads/') || e.startsWith('print-queue/')) && !e.endsWith('/'));
    for (const entry of dataEntries) {
      const zipEntry = zip.getEntry(entry);
      if (!zipEntry) continue;
      const destPath = path.join(dataDir, entry);
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(destPath, zipEntry.getData());
    }

    // Clean up temp file
    fs.unlinkSync(uploadedZip);

    // Clean up old safety backup if restore succeeded
    if (fs.existsSync(safetyBackup)) {
      setTimeout(() => { try { fs.unlinkSync(safetyBackup); } catch (e) {} }, 30000);
    }

    res.json({
      ok: true,
      message: 'Restore successful. Please refresh the page.',
      meta,
      files_restored: dataEntries.length,
    });

  } catch (err) {
    // Clean up temp file
    try { fs.unlinkSync(uploadedZip); } catch (e) {}
    console.error('Restore error:', err);
    res.status(500).json({ error: `Restore failed: ${err.message}` });
  }
});

// ── SCHEDULED BACKUP SETTINGS ──
router.get('/schedule', (req, res) => {
  const schedule = db.prepare('SELECT * FROM scheduled_backups WHERE id=1').get();
  res.json(schedule);
});

router.put('/schedule', (req, res) => {
  const { enabled, frequency, hour, save_path } = req.body;
  db.prepare('UPDATE scheduled_backups SET enabled=?,frequency=?,hour=?,save_path=? WHERE id=1')
    .run(enabled ? 1 : 0, frequency || 'daily', parseInt(hour) || 2, save_path || '');
  res.json(db.prepare('SELECT * FROM scheduled_backups WHERE id=1').get());
});

// ── GOOGLE DRIVE BACKUP ──
router.post('/drive', async (req, res) => {
  const db2 = require('./db');
  const { google } = require('googleapis');
  const tokens = db2.prepare('SELECT * FROM google_tokens WHERE id=1').get();
  if (!tokens || !tokens.refresh_token) {
    return res.status(400).json({ error: 'Google not connected. Go to Settings → Cloud to connect.' });
  }

  try {
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    oauth2.setCredentials({ access_token: tokens.access_token, refresh_token: tokens.refresh_token });
    const drive = google.drive({ version: 'v3', auth: oauth2 });

    // Create backup zip in memory
    const archiver = require('archiver');
    const { PassThrough } = require('stream');
    const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/repairshop.sqlite');
    const archive = archiver('zip', { zlib: { level: 6 } });
    const passThrough = new PassThrough();
    archive.pipe(passThrough);
    if (fs.existsSync(dbPath)) {
      try { db2.pragma('wal_checkpoint(TRUNCATE)'); } catch(e) {}
      archive.file(dbPath, { name: 'repairshop.sqlite' });
    }
    archive.append(JSON.stringify({ type: 'drive-backup', created_at: new Date().toISOString() }, null, 2), { name: 'backup-meta.json' });
    archive.finalize();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `repairshop-backup-${timestamp}.zip`;

    // Find or create RepairShop folder in Drive
    let folderId = tokens.drive_folder_id || '';
    if (!folderId) {
      const folderSearch = await drive.files.list({ q: "name='RepairShop Backups' and mimeType='application/vnd.google-apps.folder' and trashed=false", fields: 'files(id)' });
      if (folderSearch.data.files?.length > 0) {
        folderId = folderSearch.data.files[0].id;
      } else {
        const folder = await drive.files.create({ requestBody: { name: 'RepairShop Backups', mimeType: 'application/vnd.google-apps.folder' }, fields: 'id' });
        folderId = folder.data.id;
      }
      db2.prepare('UPDATE google_tokens SET drive_folder_id=? WHERE id=1').run(folderId);
    }

    const fileRes = await drive.files.create({
      requestBody: { name: filename, parents: [folderId] },
      media: { mimeType: 'application/zip', body: passThrough },
      fields: 'id,name,webViewLink',
    });

    res.json({ ok: true, file_id: fileRes.data.id, file_name: fileRes.data.name, link: fileRes.data.webViewLink });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── RESTART / RELOAD ──
router.post('/restart', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  
  res.json({ ok: true, message: 'System is restarting...' });
  
  console.log('[System] Manual restart/reload triggered by', req.user.username);
  
  // Wait a bit to let the response finish
  setTimeout(() => {
    try {
      db.close();
      process.exit(0); // systemd or docker will restart it
    } catch(e) {
      process.exit(1);
    }
  }, 1000);
});

module.exports = router;
