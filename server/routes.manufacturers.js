const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const auth = require('./auth.middleware');
router.use(auth);

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM manufacturers WHERE active=1 ORDER BY sort_order, name').all());
});

router.get('/all', (req, res) => {
  res.json(db.prepare('SELECT * FROM manufacturers ORDER BY sort_order, name').all());
});

router.post('/', (req, res) => {
  const { name, logo_emoji, device_types, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = uuidv4();
  db.prepare('INSERT INTO manufacturers (id,name,logo_emoji,device_types,sort_order) VALUES (?,?,?,?,?)')
    .run(id, name, logo_emoji || '📦', JSON.stringify(device_types || []), sort_order || 0);
  res.json(db.prepare('SELECT * FROM manufacturers WHERE id=?').get(id));
});

router.put('/:id', (req, res) => {
  const { name, logo_emoji, device_types, active, sort_order } = req.body;
  const m = db.prepare('SELECT * FROM manufacturers WHERE id=?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE manufacturers SET name=?,logo_emoji=?,device_types=?,active=?,sort_order=? WHERE id=?')
    .run(name || m.name, logo_emoji || m.logo_emoji, JSON.stringify(device_types || JSON.parse(m.device_types || '[]')), active !== undefined ? (active ? 1 : 0) : m.active, sort_order !== undefined ? sort_order : m.sort_order, req.params.id);
  res.json(db.prepare('SELECT * FROM manufacturers WHERE id=?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  db.prepare('UPDATE manufacturers SET active=0 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
