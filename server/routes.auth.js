const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

// Seed default admin if no users exist
function ensureAdmin() {
  const count = db.prepare('SELECT COUNT(*) as c FROM users').get();
  if (count.c === 0) {
    const hash = bcrypt.hashSync('admin', 10);
    db.prepare('INSERT INTO users (id, username, password_hash, role) VALUES (?,?,?,?)').run(uuidv4(), 'admin', hash, 'admin');
    console.log('Default admin created: admin / admin — CHANGE THIS PASSWORD');
  }
}
ensureAdmin();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Invalid credentials' });
  if (user.active === 0)
    return res.status(403).json({ error: 'Account is disabled. Contact your administrator.' });

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role, is_kiosk: user.is_kiosk || 0 }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

router.post('/change-password', require('./auth.middleware'), (req, res) => {
  const { current, next } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current, user.password_hash))
    return res.status(400).json({ error: 'Current password incorrect' });
  const hash = bcrypt.hashSync(next, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ ok: true });
});

router.get('/me', require('./auth.middleware'), (req, res) => {
  const user = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

module.exports = router;
