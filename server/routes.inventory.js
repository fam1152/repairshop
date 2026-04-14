const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const auth = require('./auth.middleware');

router.use(auth);

// List all inventory items, optional search/category/manufacturer filter
router.get('/', (req, res) => {
  const { q, category, manufacturer, device_type, low_stock } = req.query;
  let sql = 'SELECT * FROM inventory WHERE 1=1';
  const params = [];
  if (q) {
    sql += ' AND (name LIKE ? OR sku LIKE ? OR description LIKE ? OR supplier LIKE ? OR manufacturer LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (category) { sql += ' AND category = ?'; params.push(category); }
  if (manufacturer) { sql += ' AND manufacturer = ?'; params.push(manufacturer); }
  if (device_type) { sql += ' AND device_type = ?'; params.push(device_type); }
  if (low_stock === '1') sql += ' AND quantity <= quantity_min';
  sql += ' ORDER BY manufacturer ASC, name ASC';
  res.json(db.prepare(sql).all(...params));
});

// Stats for dashboard widget
router.get('/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as c FROM inventory').get().c;
  const low = db.prepare('SELECT COUNT(*) as c FROM inventory WHERE quantity <= quantity_min').get().c;
  const out = db.prepare('SELECT COUNT(*) as c FROM inventory WHERE quantity = 0').get().c;
  const value = db.prepare('SELECT COALESCE(SUM(quantity * unit_cost), 0) as v FROM inventory').get().v;
  const categories = db.prepare("SELECT category, COUNT(*) as c FROM inventory GROUP BY category ORDER BY c DESC").all();
  const manufacturers = db.prepare("SELECT manufacturer, COUNT(*) as c, COALESCE(SUM(quantity),0) as total_qty FROM inventory WHERE manufacturer != '' GROUP BY manufacturer ORDER BY c DESC").all();
  const device_types = db.prepare("SELECT device_type, COUNT(*) as c FROM inventory WHERE device_type != '' GROUP BY device_type ORDER BY c DESC").all();
  res.json({ total, low_stock: low, out_of_stock: out, total_value: value, categories, manufacturers, device_types });
});

// Get single item with transaction history
router.get('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  const transactions = db.prepare(
    `SELECT t.*, r.title as repair_title FROM inventory_transactions t
     LEFT JOIN repairs r ON t.repair_id = r.id
     WHERE t.inventory_id = ? ORDER BY t.created_at DESC LIMIT 50`
  ).all(req.params.id);
  res.json({ ...item, transactions });
});

// Create item
router.post('/', (req, res) => {
  const { sku, name, description, category, manufacturer, device_type, quantity, quantity_min, unit_cost, sell_price, supplier, location, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = uuidv4();
  const qty = parseInt(quantity) || 0;
  db.prepare(`INSERT INTO inventory (id,sku,name,description,category,manufacturer,device_type,quantity,quantity_min,unit_cost,sell_price,supplier,location,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, sku||'', name, description||'', category||'General', manufacturer||'', device_type||'', qty,
    parseInt(quantity_min)||1, parseFloat(unit_cost)||0, parseFloat(sell_price)||0, supplier||'', location||'', notes||'');
  // Record initial stock transaction
  if (qty > 0) {
    db.prepare(`INSERT INTO inventory_transactions (id,inventory_id,type,quantity_change,quantity_after,unit_cost,notes)
      VALUES (?,?,?,?,?,?,?)`).run(uuidv4(), id, 'initial', qty, qty, parseFloat(unit_cost)||0, 'Initial stock');
  }
  res.json(db.prepare('SELECT * FROM inventory WHERE id = ?').get(id));
});

// Update item details
router.put('/:id', (req, res) => {
  const { sku, name, description, category, manufacturer, device_type, quantity_min, unit_cost, sell_price, supplier, location, notes } = req.body;
  db.prepare(`UPDATE inventory SET sku=?,name=?,description=?,category=?,manufacturer=?,device_type=?,quantity_min=?,unit_cost=?,sell_price=?,
    supplier=?,location=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
    sku||'', name, description||'', category||'General', manufacturer||'', device_type||'', parseInt(quantity_min)||1,
    parseFloat(unit_cost)||0, parseFloat(sell_price)||0, supplier||'', location||'', notes||'', req.params.id);
  res.json(db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id));
});

// Stock adjustment (add / remove / set)
router.post('/:id/adjust', (req, res) => {
  const { type, quantity, repair_id, notes } = req.body;
  const item = db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });

  const qty = parseInt(quantity);
  if (isNaN(qty)) return res.status(400).json({ error: 'quantity must be a number' });

  let change, after;
  if (type === 'set') {
    change = qty - item.quantity;
    after = qty;
  } else if (type === 'add') {
    change = qty;
    after = item.quantity + qty;
  } else if (type === 'remove') {
    change = -Math.abs(qty);
    after = item.quantity - Math.abs(qty);
  } else {
    return res.status(400).json({ error: 'type must be set|add|remove' });
  }

  if (after < 0) return res.status(400).json({ error: 'Cannot go below 0 stock' });

  db.prepare('UPDATE inventory SET quantity=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(after, req.params.id);
  db.prepare(`INSERT INTO inventory_transactions (id,inventory_id,type,quantity_change,quantity_after,repair_id,unit_cost,notes)
    VALUES (?,?,?,?,?,?,?,?)`).run(uuidv4(), req.params.id, type, change, after,
    repair_id||null, item.unit_cost, notes||'');

  res.json(db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id));
});

// Delete item
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM inventory_transactions WHERE inventory_id = ?').run(req.params.id);
  db.prepare('DELETE FROM inventory WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
