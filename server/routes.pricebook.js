const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const auth = require('./auth.middleware');
router.use(auth);

const CATEGORIES = ['Labor','Screen','Battery','Storage','RAM','Motherboard','Power','Keyboard','Cooling','Network','Cable','Service','Part','Other'];

router.get('/', (req, res) => {
  const { category, q } = req.query;
  let sql = 'SELECT * FROM price_book WHERE active=1';
  const params = [];
  if (category) { sql += ' AND category=?'; params.push(category); }
  if (q) { sql += ' AND (name LIKE ? OR description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY category, name';
  res.json(db.prepare(sql).all(...params));
});

router.get('/categories', (req, res) => {
  res.json(CATEGORIES);
});

router.post('/', (req, res) => {
  const { name, category, manufacturer, device_type, description, cost_price, sell_price, unit } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = uuidv4();
  db.prepare('INSERT INTO price_book (id,name,category,manufacturer,device_type,description,cost_price,sell_price,unit) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, name, category || 'Service', manufacturer || '', device_type || '', description || '', parseFloat(cost_price) || 0, parseFloat(sell_price) || 0, unit || 'ea');
  res.json(db.prepare('SELECT * FROM price_book WHERE id=?').get(id));
});

router.put('/:id', (req, res) => {
  const { name, category, manufacturer, device_type, description, cost_price, sell_price, unit, active } = req.body;
  db.prepare('UPDATE price_book SET name=?,category=?,manufacturer=?,device_type=?,description=?,cost_price=?,sell_price=?,unit=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(name, category || 'Service', manufacturer || '', device_type || '', description || '', parseFloat(cost_price) || 0, parseFloat(sell_price) || 0, unit || 'ea', active !== undefined ? (active ? 1 : 0) : 1, req.params.id);
  res.json(db.prepare('SELECT * FROM price_book WHERE id=?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  db.prepare('UPDATE price_book SET active=0 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
