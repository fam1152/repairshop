const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const auth = require('./auth.middleware');

router.use(auth);

router.get('/', (req, res) => {
  const { status } = req.query;
  let sql = `SELECT r.*, c.name as customer_name, c.phone as customer_phone, rep.title as repair_title FROM reminders r JOIN customers c ON r.customer_id=c.id LEFT JOIN repairs rep ON r.repair_id=rep.id WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND r.status = ?'; params.push(status); }
  sql += ' ORDER BY r.due_date ASC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/pending', (req, res) => {
  const now = new Date().toISOString();
  const rows = db.prepare(`SELECT r.*, c.name as customer_name, c.phone as customer_phone, rep.title as repair_title FROM reminders r JOIN customers c ON r.customer_id=c.id LEFT JOIN repairs rep ON r.repair_id=rep.id WHERE r.status='pending' AND r.due_date <= ? ORDER BY r.due_date ASC`).all(now);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { repair_id, customer_id, type, message, days_from_now } = req.body;
  if (!customer_id) return res.status(400).json({ error: 'customer_id required' });
  const days = parseInt(days_from_now) || 2;
  const due = new Date();
  due.setDate(due.getDate() + Math.min(Math.max(days, 1), 30));
  const id = uuidv4();
  db.prepare('INSERT INTO reminders (id,repair_id,customer_id,type,message,due_date) VALUES (?,?,?,?,?,?)').run(id, repair_id||null, customer_id, type||'followup', message||'', due.toISOString());
  res.json(db.prepare('SELECT * FROM reminders WHERE id=?').get(id));
});

router.put('/:id/dismiss', (req, res) => {
  db.prepare("UPDATE reminders SET status='dismissed', dismissed_at=CURRENT_TIMESTAMP WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

router.put('/:id/complete', (req, res) => {
  db.prepare("UPDATE reminders SET status='completed' WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM reminders WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
