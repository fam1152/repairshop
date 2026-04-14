const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./db');
const auth = require('./auth.middleware');

router.use(auth);

const uploadsPath = process.env.UPLOADS_PATH || path.join(__dirname, '../data/uploads');
const avatarsPath = path.join(uploadsPath, 'avatars');
if (!fs.existsSync(avatarsPath)) fs.mkdirSync(avatarsPath, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: avatarsPath,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `avatar_${req.user.id}${ext}`);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Images only'));
  }
});

function isAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// Get all users (admin only)
router.get('/', isAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, display_name, role, avatar_url, active, is_kiosk, created_at FROM users ORDER BY created_at ASC').all();
  res.json(users);
});

// Get current user profile
router.get('/me', (req, res) => {
  const user = db.prepare('SELECT id, username, display_name, role, avatar_url, active, is_kiosk, created_at FROM users WHERE id=?').get(req.user.id);
  res.json(user);
});

// Create staff account (admin only)
router.post('/', isAdmin, (req, res) => {
  const { username, password, display_name, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE username=?').get(username);
  if (existing) return res.status(400).json({ error: 'Username already taken' });

  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  const isKiosk = req.body.is_kiosk ? 1 : 0;
  db.prepare('INSERT INTO users (id, username, password_hash, display_name, role, active, is_kiosk) VALUES (?,?,?,?,?,1,?)')
    .run(id, username, hash, display_name || username, role === 'admin' ? 'admin' : 'staff', isKiosk);

  res.json(db.prepare('SELECT id, username, display_name, role, avatar_url, active, created_at FROM users WHERE id=?').get(id));
});

// Update user (admin can update anyone, staff can only update themselves)
router.put('/:id', (req, res) => {
  if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { display_name, active } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });

  // Only admin can change active status or role
  const newActive = req.user.role === 'admin' ? (active !== undefined ? (active ? 1 : 0) : user.active) : user.active;
  db.prepare('UPDATE users SET display_name=?, active=? WHERE id=?').run(display_name || user.display_name, newActive, req.params.id);
  res.json(db.prepare('SELECT id, username, display_name, role, avatar_url, active, created_at FROM users WHERE id=?').get(req.params.id));
});

// Upload avatar (any user for themselves, admin for anyone)
router.post('/:id/avatar', (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}, avatarUpload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const avatarUrl = `/uploads/avatars/${req.file.filename}`;
  db.prepare('UPDATE users SET avatar_url=? WHERE id=?').run(avatarUrl, req.params.id);
  res.json({ avatar_url: avatarUrl });
});

// Admin reset any user's password
router.post('/:id/reset-password', isAdmin, (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, req.params.id);
  res.json({ ok: true });
});

// Delete user (admin only, cannot delete self)
router.delete('/:id', isAdmin, (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  // Delete avatar file
  if (user.avatar_url) {
    const filePath = path.join(uploadsPath, 'avatars', path.basename(user.avatar_url));
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch(e) {}
  }
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Change own password
router.post('/me/change-password', (req, res) => {
  const { current, next_password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!bcrypt.compareSync(current, user.password_hash)) return res.status(400).json({ error: 'Current password incorrect' });
  if (!next_password || next_password.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  const hash = bcrypt.hashSync(next_password, 10);
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, req.user.id);
  res.json({ ok: true });
});

// Activity log — admin sees all, staff sees own
router.get('/activity-log', (req, res) => {
  const { user_id, limit, offset } = req.query;
  const lim = Math.min(parseInt(limit) || 100, 500);
  const off = parseInt(offset) || 0;

  let sql, params;
  if (req.user.role === 'admin') {
    // Admin can see all or filter by user
    if (user_id) {
      sql = 'SELECT * FROM activity_log WHERE user_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params = [user_id, lim, off];
    } else {
      sql = 'SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params = [lim, off];
    }
  } else {
    // Staff can only see their own
    sql = 'SELECT * FROM activity_log WHERE user_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params = [req.user.id, lim, off];
  }

  const logs = db.prepare(sql).all(...params);
  const total = req.user.role === 'admin'
    ? (user_id ? db.prepare('SELECT COUNT(*) as c FROM activity_log WHERE user_id=?').get(user_id).c : db.prepare('SELECT COUNT(*) as c FROM activity_log').get().c)
    : db.prepare('SELECT COUNT(*) as c FROM activity_log WHERE user_id=?').get(req.user.id).c;

  res.json({ logs, total, limit: lim, offset: off });
});

module.exports = router;

// ── USER PREFERENCES (dark mode, per-user settings) ──
router.get('/prefs', (req, res) => {
  try {
    let prefs = db.prepare('SELECT * FROM user_preferences WHERE user_id=?').get(req.user.id);
    if (!prefs) {
      // Return defaults — don't create row yet
      const global = db.prepare('SELECT dark_mode FROM settings WHERE id=1').get();
      return res.json({ user_id: req.user.id, dark_mode: global?.dark_mode || 0, preferences: {} });
    }
    try { prefs.preferences = JSON.parse(prefs.preferences || '{}'); } catch(e) { prefs.preferences = {}; }
    res.json(prefs);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/prefs', (req, res) => {
  try {
    const { dark_mode, preferences } = req.body;
    const prefsStr = JSON.stringify(preferences || {});
    const existing = db.prepare('SELECT id FROM user_preferences WHERE user_id=?').get(req.user.id);
    if (existing) {
      db.prepare('UPDATE user_preferences SET dark_mode=?, preferences=? WHERE user_id=?')
        .run(dark_mode ? 1 : 0, prefsStr, req.user.id);
    } else {
      const { v4: uuidv4 } = require('uuid');
      db.prepare('INSERT INTO user_preferences (id, user_id, dark_mode, preferences) VALUES (?,?,?,?)')
        .run(uuidv4(), req.user.id, dark_mode ? 1 : 0, prefsStr);
    }
    res.json({ ok: true, dark_mode: dark_mode ? 1 : 0 });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});
