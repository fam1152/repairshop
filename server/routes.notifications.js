const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const auth = require('./auth.middleware');
router.use(auth);

// Get notifications for current user (own + broadcast)
router.get('/', (req, res) => {
  const { unread_only } = req.query;
  let sql = `SELECT * FROM notifications WHERE dismissed=0 AND (user_id=? OR user_id='')`;
  const params = [req.user.id];
  if (unread_only === '1') { sql += ' AND read=0'; }
  sql += ' ORDER BY created_at DESC LIMIT 100';
  res.json(db.prepare(sql).all(...params));
});

router.get('/count', (req, res) => {
  const count = db.prepare(`SELECT COUNT(*) as c FROM notifications WHERE dismissed=0 AND read=0 AND (user_id=? OR user_id='')`).get(req.user.id).c;
  res.json({ count });
});

// Mark one as read
router.patch('/:id/read', (req, res) => {
  db.prepare('UPDATE notifications SET read=1 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Mark all as read
router.post('/read-all', (req, res) => {
  db.prepare(`UPDATE notifications SET read=1 WHERE dismissed=0 AND (user_id=? OR user_id='')`).run(req.user.id);
  res.json({ ok: true });
});

// Dismiss one
router.delete('/:id', (req, res) => {
  db.prepare('UPDATE notifications SET dismissed=1 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Dismiss all
router.delete('/', (req, res) => {
  db.prepare(`UPDATE notifications SET dismissed=1 WHERE (user_id=? OR user_id='')`).run(req.user.id);
  res.json({ ok: true });
});

// Create notification (internal helper)
router.post('/', (req, res) => {
  const { type, title, body, link, user_id } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const id = uuidv4();
  db.prepare('INSERT INTO notifications (id,user_id,type,title,body,link) VALUES (?,?,?,?,?,?)')
    .run(id, user_id || '', type || 'info', title, body || '', link || '');
  res.json(db.prepare('SELECT * FROM notifications WHERE id=?').get(id));
});

module.exports = router;
