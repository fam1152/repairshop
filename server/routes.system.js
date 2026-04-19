const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const auth = require('./auth.middleware');
const db = require('./db');

router.use(auth);

function isAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// In-memory log buffer (last 500 lines)
const LOG_BUFFER = [];
const MAX_LOGS = 500;

function addLog(level, message) {
  const entry = { ts: new Date().toISOString(), level, message };
  LOG_BUFFER.push(entry);
  if (LOG_BUFFER.length > MAX_LOGS) LOG_BUFFER.shift();
}

// Intercept console methods to capture logs
const origLog = console.log.bind(console);
const origWarn = console.warn.bind(console);
const origError = console.error.bind(console);
console.log = (...args) => { origLog(...args); addLog('info', args.join(' ')); };
console.warn = (...args) => { origWarn(...args); addLog('warn', args.join(' ')); };
console.error = (...args) => { origError(...args); addLog('error', args.join(' ')); };

// Add startup log
addLog('info', `[System] RepairShop v11.0.0 started at ${new Date().toISOString()}`);
addLog('info', `[System] Node.js ${process.version} | PID ${process.pid}`);

// Get live logs
router.get('/logs', isAdmin, (req, res) => {
  const { since, level } = req.query;
  let logs = [...LOG_BUFFER];
  if (since) logs = logs.filter(l => l.ts > since);
  if (level) logs = logs.filter(l => l.level === level);
  res.json({ logs, count: logs.length });
});

// SSE stream for live logs
router.get('/logs/stream', isAdmin, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let lastIndex = LOG_BUFFER.length;

  // Send existing logs first
  res.write(`data: ${JSON.stringify({ type: 'history', logs: LOG_BUFFER })}\n\n`);

  const interval = setInterval(() => {
    if (LOG_BUFFER.length > lastIndex) {
      const newLogs = LOG_BUFFER.slice(lastIndex);
      lastIndex = LOG_BUFFER.length;
      res.write(`data: ${JSON.stringify({ type: 'new', logs: newLogs })}\n\n`);
    }
  }, 500);

  req.on('close', () => clearInterval(interval));
});

// System info
router.get('/info', isAdmin, (req, res) => {
  const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/repairshop.sqlite');
  const dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;

  res.json({
    node_version: process.version,
    pid: process.pid,
    uptime_seconds: Math.floor(process.uptime()),
    memory_used_mb: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1),
    memory_total_mb: (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(1),
    db_size_bytes: dbSize,
    platform: process.platform,
    env: process.env.NODE_ENV || 'development',
    started_at: new Date(Date.now() - process.uptime() * 1000).toISOString(),
  });
});

// Reboot — creates auto-backup then restarts
router.post('/reboot', isAdmin, async (req, res) => {
  addLog('warn', `[System] Reboot initiated by ${req.user.username}`);

  res.json({ ok: true, message: 'Creating backup then restarting. Reconnect in ~60 seconds.' });

  setTimeout(async () => {
    try {
      // Auto-backup before reboot
      const archiver = require('archiver');
      const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/repairshop.sqlite');
      const uploadsPath = process.env.UPLOADS_PATH || path.join(__dirname, '../data/uploads');
      const dataDir = path.dirname(dbPath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupName = `repairshop-PRE-REBOOT-${timestamp}.zip`;

      // Try scheduled backup path first, else save to data dir
      const schedule = db.prepare('SELECT * FROM scheduled_backups WHERE id=1').get();
      const savePath = (schedule?.save_path && fs.existsSync(schedule.save_path)) ? schedule.save_path : dataDir;
      const backupPath = path.join(savePath, backupName);

      addLog('info', `[Reboot] Creating pre-reboot backup: ${backupPath}`);

      const output = fs.createWriteStream(backupPath);
      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.pipe(output);
      if (fs.existsSync(dbPath)) { try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch(e) {} archive.file(dbPath, { name: 'repairshop.sqlite' }); }
      if (fs.existsSync(uploadsPath)) archive.directory(uploadsPath, 'uploads');
      archive.append(JSON.stringify({ type: 'pre-reboot', created_at: new Date().toISOString(), initiated_by: req.user.username }, null, 2), { name: 'backup-meta.json' });
      await archive.finalize();

      addLog('info', `[Reboot] Backup saved: ${backupName}`);

      // Now restart via Docker if socket available
      if (fs.existsSync('/var/run/docker.sock')) {
        const Docker = require('dockerode');
        const docker = new Docker({ socketPath: '/var/run/docker.sock' });
        const containers = await docker.listContainers();

        // Restart Ollama first so it's ready when RepairShop comes back up
        const ollamaContainer = containers.find(c =>
          c.Names.some(n => n.includes('ollama')) || c.Image.includes('ollama')
        );
        if (ollamaContainer) {
          addLog('info', '[Reboot] Restarting Ollama container...');
          try {
            await new Promise((resolve, reject) => {
              docker.getContainer(ollamaContainer.Id).restart({ t: 5 }, err => err ? reject(err) : resolve());
            });
            addLog('info', '[Reboot] Ollama restarted successfully');
          } catch(e) {
            addLog('warn', `[Reboot] Ollama restart error: ${e.message}`);
          }
        } else {
          addLog('warn', '[Reboot] Ollama container not found - skipping');
        }

        // Now restart RepairShop itself
        const self = containers.find(c => c.Names.some(n => n.includes('repairshop')));
        if (self) {
          addLog('info', '[Reboot] Restarting RepairShop container...');
          setTimeout(() => { docker.getContainer(self.Id).restart({ t: 3 }, () => {}); }, 2000);
          return;
        }
      }

      // Fallback: exit process (Docker restart policy will bring it back)
      addLog('info', '[Reboot] Exiting process (Docker will restart)…');
      setTimeout(() => process.exit(0), 2000);

    } catch(e) {
      addLog('error', `[Reboot] Error: ${e.message}`);
      setTimeout(() => process.exit(0), 2000);
    }
  }, 1000);
});

// Read docker-compose.yml
router.get('/docker-compose', isAdmin, (req, res) => {
  const composePaths = [
    '/mnt/tank/docker-compose.yml',
    path.join(__dirname, '../../docker-compose.yml'),
    '/app/docker-compose.yml',
  ];

  for (const p of composePaths) {
    if (fs.existsSync(p)) {
      return res.json({ content: fs.readFileSync(p, 'utf8'), path: p });
    }
  }

  // Return stored content from settings
  const settings = db.prepare('SELECT docker_compose_content FROM settings WHERE id=1').get();
  if (settings?.docker_compose_content) {
    return res.json({ content: settings.docker_compose_content, path: '(stored in database)' });
  }

  res.json({ content: '', path: null, message: 'docker-compose.yml not found on filesystem' });
});

// Save docker-compose.yml
router.post('/docker-compose', isAdmin, (req, res) => {
  const { content, path: filePath } = req.body;
  if (!content) return res.status(400).json({ error: 'Content required' });

  // Always save to database
  db.prepare('UPDATE settings SET docker_compose_content=? WHERE id=1').run(content);
  addLog('info', `[System] docker-compose.yml updated by ${req.user.username}`);

  // Also write to filesystem if path exists
  if (filePath && filePath !== '(stored in database)' && fs.existsSync(path.dirname(filePath))) {
    try {
      fs.writeFileSync(filePath, content, 'utf8');
      return res.json({ ok: true, saved_to: filePath });
    } catch(e) {
      return res.json({ ok: true, saved_to: 'database only', warning: e.message });
    }
  }

  res.json({ ok: true, saved_to: 'database' });
});


// ── DATABASE OPTIMIZE ──
router.post('/db-optimize', isAdmin, (req, res) => {
  try {
    addLog('info', '[DB] Running VACUUM and ANALYZE...');
    const db = require('./db');
    const before = db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").get();
    db.exec('VACUUM');
    db.exec('ANALYZE');
    db.exec('REINDEX');
    const after = db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").get();
    const savedBytes = (before?.size || 0) - (after?.size || 0);
    const savedKB = (savedBytes / 1024).toFixed(1);
    addLog('info', `[DB] Optimize complete. Saved ${savedKB} KB`);
    res.json({ ok: true, before_bytes: before?.size, after_bytes: after?.size, saved_kb: savedKB });
  } catch(e) {
    addLog('error', '[DB] Optimize failed: ' + e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.addLog = addLog;
module.exports.addLog = addLog;

// ── FORCED DOCKER UPDATE ──
router.post('/force-update', isAdmin, async (req, res) => {
  const image = process.env.DOCKER_IMAGE || 'fam1152/repairshop:latest';
  const { sudo_password } = req.body;

  if (!fs.existsSync('/var/run/docker.sock')) {
    return res.status(400).json({ error: 'Docker socket not available', needs_sudo: false });
  }

  addLog('warn', `[Update] Force update initiated by ${req.user.username}`);
  res.json({ ok: true, message: 'Force update started. The app will pull the latest image and restart.' });

  setTimeout(async () => {
    try {
      const Docker = require('dockerode');
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });

      addLog('info', `[Update] Pulling ${image}…`);
      await new Promise((resolve, reject) => {
        docker.pull(image, (err, stream) => {
          if (err) return reject(err);
          docker.modem.followProgress(stream, (err) => err ? reject(err) : resolve());
        });
      });
      addLog('info', '[Update] Pull complete. Restarting…');

      const containers = await docker.listContainers();
      const self = containers.find(c => c.Names.some(n => n.includes('repairshop')));
      if (self) {
        setTimeout(() => docker.getContainer(self.Id).restart({ t: 3 }, () => {}), 2000);
      } else {
        setTimeout(() => process.exit(0), 2000);
      }
    } catch(e) {
      addLog('error', `[Update] Force update failed: ${e.message}`);
    }
  }, 500);
});

// ── COMPOSE UPDATE via sudo ──
router.post('/compose-update', isAdmin, (req, res) => {
  const { sudo_password } = req.body;
  if (!sudo_password) return res.status(400).json({ error: 'sudo password required', needs_password: true });

  const { exec } = require('child_process');
  const composePaths = ['/mnt/tank/docker-compose.yml', '/app/docker-compose.yml'];
  const composePath = composePaths.find(p => fs.existsSync(p)) || '/mnt/tank/docker-compose.yml';
  const dir = require('path').dirname(composePath);

  addLog('info', `[Update] Running docker compose pull + up via sudo in ${dir}`);
  res.json({ ok: true, message: 'Running docker compose pull + up…' });

  // Use echo to pipe password to sudo
  const cmd = `echo '${sudo_password.replace(/'/g, "'\\''")}' | sudo -S sh -c "cd ${dir} && docker compose pull && docker compose up -d" 2>&1`;
  exec(cmd, { timeout: 120000 }, (err, stdout, stderr) => {
    if (err) {
      addLog('error', `[Update] Compose update error: ${err.message}`);
      addLog('error', stderr || '');
    } else {
      addLog('info', `[Update] Compose update output: ${stdout}`);
      addLog('info', '[Update] Compose update complete');
    }
  });
});
