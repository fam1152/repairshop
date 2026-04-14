require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const activityLogger = require('./activity.middleware');

const app = express();
const PORT = process.env.PORT || 3000;
const uploadsPath = process.env.UPLOADS_PATH || path.join(__dirname, '../data/uploads');
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsPath));
app.use('/uploads/avatars', express.static(require('path').join(uploadsPath, 'avatars')));
app.use('/uploads/photos', express.static(require('path').join(uploadsPath, 'photos')));
app.use('/uploads/customer-docs', express.static(require('path').join(uploadsPath, 'customer-docs')));

// API routes
app.use('/api/auth', require('./routes.auth'));
app.use('/api/customers', require('./routes.customers'));
app.use('/api/repairs', require('./routes.repairs'));
app.use('/api/invoices', require('./routes.invoices'));
app.use('/api/reminders', require('./routes.reminders'));
app.use('/api/settings', require('./routes.settings'));
app.use('/api/inventory', require('./routes.inventory'));
app.use('/api/scanner', require('./routes.scanner'));
app.use('/api/estimates', require('./routes.estimates'));
app.use('/api/photos', require('./routes.photos'));
app.use('/api/appointments', require('./routes.appointments'));
app.use('/api/backup', require('./routes.backup'));
app.use('/api/update', require('./routes.update'));
app.use('/api/ai', require('./routes.ai'));
app.use('/api/money', require('./routes.money'));
app.use('/api/chat', require('./routes.chat'));
app.use('/api/system', require('./routes.system'));
app.use('/api/reports', require('./routes.reports'));
app.use('/api/manufacturers', require('./routes.manufacturers'));
app.use('/api/pricebook', require('./routes.pricebook'));
app.use('/api/notifications', require('./routes.notifications'));
app.use('/api/workflows', require('./routes.workflows'));
app.use('/api/users', require('./routes.users'));

// Activity logging middleware — runs after auth
app.use('/api', activityLogger);

// Serve React build in production
const buildPath = path.join(__dirname, '../client/build');
if (fs.existsSync(buildPath)) {
  app.use(express.static(buildPath));
  app.get('*', (req, res) => res.sendFile(path.join(buildPath, 'index.html')));
}

// Cron: scheduled automatic backups
const archiver = require('archiver');
cron.schedule('0 * * * *', async () => {
  try {
    const schedule = db.prepare('SELECT * FROM scheduled_backups WHERE id=1').get();
    if (!schedule || !schedule.enabled || !schedule.save_path) return;
    const now = new Date();
    const currentHour = now.getHours();
    if (currentHour !== schedule.hour) return;

    // Check if we already ran today
    if (schedule.last_run) {
      const last = new Date(schedule.last_run);
      if (schedule.frequency === 'daily' && last.toDateString() === now.toDateString()) return;
      if (schedule.frequency === 'weekly' && (now - last) < 7 * 24 * 60 * 60 * 1000) return;
    }

    // Create backup file
    const fs = require('fs');
    const path = require('path');
    const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/repairshop.sqlite');
    const uploadsPath = process.env.UPLOADS_PATH || path.join(__dirname, '../data/uploads');
    const savePath = schedule.save_path;

    if (!fs.existsSync(savePath)) { fs.mkdirSync(savePath, { recursive: true }); }

    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = path.join(savePath, `repairshop-backup-${timestamp}.zip`);
    const output = fs.createWriteStream(filename);
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.pipe(output);
    if (fs.existsSync(dbPath)) { try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch(e) {} archive.file(dbPath, { name: 'repairshop.sqlite' }); }
    if (fs.existsSync(uploadsPath)) archive.directory(uploadsPath, 'uploads');
    // Include Ollama models if they exist
    const ollamaPath = '/mnt/tank/ollama-models';
    if (fs.existsSync(ollamaPath)) archive.directory(ollamaPath, 'ollama-models');
    await archive.finalize();

    db.prepare("UPDATE scheduled_backups SET last_run=? WHERE id=1").run(now.toISOString());
    console.log('[Backup] Scheduled backup saved to', filename);

    // Keep only last 10 backups in the save path
    const files = fs.readdirSync(savePath).filter(f => f.startsWith('repairshop-backup-') && f.endsWith('.zip')).sort();
    if (files.length > 10) {
      files.slice(0, files.length - 10).forEach(f => { try { fs.unlinkSync(path.join(savePath, f)); } catch(e) {} });
    }
  } catch(e) { console.error('[Backup] Scheduled backup failed:', e.message); }
});

// Cron: process pending workflow runs every 5 minutes
cron.schedule('*/5 * * * *', () => {
  try {
    const { executeStep } = require('./routes.workflows');
    const pending = db.prepare("SELECT wr.*, ws.action_type, ws.action_config FROM workflow_runs wr JOIN workflow_steps ws ON wr.step_id=ws.id WHERE wr.status='pending' AND wr.scheduled_for <= datetime('now')").all();
    pending.forEach(run => {
      const repair = db.prepare('SELECT r.*, c.name as customer_name, c.phone as customer_phone FROM repairs r JOIN customers c ON r.customer_id=c.id WHERE r.id=?').get(run.repair_id);
      if (repair) executeStep(run.action_type, JSON.parse(run.action_config || '{}'), repair, run.id);
    });
    if (pending.length > 0) console.log('[Workflows] Processed', pending.length, 'pending runs');
  } catch(e) { console.error('[Workflows] Error:', e.message); }
});

// Cron: check reminders every hour
const db = require('./db');
cron.schedule('0 * * * *', () => {
  const now = new Date().toISOString();
  const overdue = db.prepare("SELECT COUNT(*) as c FROM reminders WHERE status='pending' AND due_date <= ?").get(now);
  if (overdue.c > 0) console.log(`[Reminders] ${overdue.c} reminder(s) are due`);
});

// ── SSL / HTTPS support ──
const SSL_CERT = process.env.SSL_CERT;
const SSL_KEY  = process.env.SSL_KEY;
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT) || 3443;

if (SSL_CERT && SSL_KEY && fs.existsSync(SSL_CERT) && fs.existsSync(SSL_KEY)) {
  const https = require('https');
  const sslOptions = {
    cert: fs.readFileSync(SSL_CERT),
    key:  fs.readFileSync(SSL_KEY),
  };
  // HTTPS server (camera, secure features)
  https.createServer(sslOptions, app).listen(HTTPS_PORT, '0.0.0.0', () => {
    console.log(`\n🔒 IT Repair Shop (HTTPS) running at https://0.0.0.0:${HTTPS_PORT}`);
    console.log(`   Camera/scanner will work at https://<your-ip>:${HTTPS_PORT}\n`);
  });
  // HTTP still available on PORT (redirect to HTTPS)
  const http = require('http');
  const redirect = require('express')();
  redirect.use((req, res) => {
    const host = req.headers.host?.replace(/:\d+/, '') || 'localhost';
    res.redirect(301, `https://${host}:${HTTPS_PORT}${req.url}`);
  });
  http.createServer(redirect).listen(PORT, '0.0.0.0', () => {
    console.log(`   HTTP on port ${PORT} redirects to HTTPS:${HTTPS_PORT}\n`);
  });
} else {
  // HTTP only
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🔧 IT Repair Shop running at http://0.0.0.0:${PORT}`);
    console.log(`   Access on your network via http://<your-ip>:${PORT}`);
    if (!SSL_CERT) console.log(`   💡 To enable HTTPS (needed for camera): set SSL_CERT, SSL_KEY, HTTPS_PORT env vars\n`);
  });
}
