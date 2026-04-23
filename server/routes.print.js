const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const auth = require('./auth.middleware');
const { exec } = require('child_process');

router.use(auth);

const printPath = process.env.PRINT_QUEUE_PATH || '/data/print-queue';
if (!fs.existsSync(printPath)) fs.mkdirSync(printPath, { recursive: true });

const storage = multer.diskStorage({
  destination: printPath,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/[^a-z0-9]/gi, '_').toLowerCase();
    cb(null, `${Date.now()}_${name}${ext}`);
  }
});

const upload = multer({ 
  storage, 
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.txt', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only .pdf, .txt, .jpg, .jpeg, .png files are allowed'));
  }
});

// List print queue
router.get('/', (req, res) => {
  try {
    const files = fs.readdirSync(printPath)
      .filter(f => !f.startsWith('.'))
      .map(f => {
        const stats = fs.statSync(path.join(printPath, f));
        return {
          filename: f,
          original_name: f.split('_').slice(1).join('_'),
          size: stats.size,
          created_at: stats.birthtime,
          ext: path.extname(f).toLowerCase()
        };
      })
      .sort((a, b) => b.created_at - a.created_at);
    res.json(files);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Upload to print queue
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ ok: true, file: req.file.filename });
});

// Delete from print queue
router.delete('/:filename', (req, res) => {
  const filePath = path.join(printPath, req.params.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Print all contents
router.post('/print-all', (req, res) => {
  const files = fs.readdirSync(printPath).filter(f => !f.startsWith('.'));
  if (files.length === 0) return res.json({ ok: true, message: 'Queue is empty' });

  addLog('info', `[Print] Printing all files in queue (${files.length} files)`);

  // On Linux, use 'lp' command. 
  // We'll iterate and print each.
  let results = [];
  let errorCount = 0;

  files.forEach(f => {
    const fullPath = path.join(printPath, f);
    // Basic lp command. Might need printer name 'lp -d PrinterName'
    const cmd = `lp "${fullPath}"`;
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        errorCount++;
        addLog('error', `[Print] Failed to print ${f}: ${stderr}`);
      } else {
        addLog('info', `[Print] Printed ${f}: ${stdout.trim()}`);
      }
    });
  });

  res.json({ ok: true, message: `Printing ${files.length} files. Check logs for results.` });
});

function addLog(level, message) {
  try {
    const systemRoutes = require('./routes.system');
    if (systemRoutes.addLog) systemRoutes.addLog(level, message);
  } catch(e) {}
}

module.exports = router;
