const router = require('express').Router();
const db = require('./db');
const auth = require('./auth.middleware');

router.use(auth);

// Universal scan lookup — resolves any scanned code to its record
// Codes are structured as:  PART-{inventory_id}  |  REPAIR-{repair_id}  |  DEVICE-{serial}  |  raw text
router.get('/lookup', (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'code required' });

  const c = code.trim();

  // Structured internal codes
  if (c.startsWith('PART-')) {
    const id = c.slice(5);
    const item = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id);
    if (item) return res.json({ type: 'inventory', record: item });
  }

  if (c.startsWith('REPAIR-')) {
    const id = c.slice(7);
    const repair = db.prepare(`SELECT r.*, c.name as customer_name, c.phone as customer_phone
      FROM repairs r JOIN customers c ON r.customer_id=c.id WHERE r.id=?`).get(id);
    if (repair) return res.json({ type: 'repair', record: repair });
  }

  if (c.startsWith('DEVICE-')) {
    const serial = c.slice(7);
    const repairs = db.prepare(`SELECT r.*, c.name as customer_name FROM repairs r
      JOIN customers c ON r.customer_id=c.id WHERE r.serial_number=? ORDER BY r.created_at DESC`).all(serial);
    if (repairs.length > 0) return res.json({ type: 'device_serial', serial, records: repairs });
  }

  // Fallback: try raw serial number match
  const bySerial = db.prepare(`SELECT r.*, c.name as customer_name FROM repairs r
    JOIN customers c ON r.customer_id=c.id WHERE r.serial_number=? ORDER BY r.created_at DESC`).all(c);
  if (bySerial.length > 0) return res.json({ type: 'device_serial', serial: c, records: bySerial });

  // Try SKU match in inventory
  const bySku = db.prepare('SELECT * FROM inventory WHERE sku = ?').get(c);
  if (bySku) return res.json({ type: 'inventory', record: bySku });

  // Try inventory name partial
  const byName = db.prepare("SELECT * FROM inventory WHERE name LIKE ? LIMIT 5").all(`%${c}%`);
  if (byName.length > 0) return res.json({ type: 'inventory_search', records: byName });

  return res.json({ type: 'not_found', code: c });
});

// Get all inventory items formatted for label generation
router.get('/labels/inventory', (req, res) => {
  const { ids } = req.query; // comma-separated ids, or all
  let items;
  if (ids) {
    const idList = ids.split(',').map(s => s.trim()).filter(Boolean);
    items = idList.map(id => db.prepare('SELECT * FROM inventory WHERE id=?').get(id)).filter(Boolean);
  } else {
    items = db.prepare('SELECT * FROM inventory ORDER BY name').all();
  }
  res.json(items.map(i => ({
    id: i.id,
    name: i.name,
    sku: i.sku,
    category: i.category,
    location: i.location,
    sell_price: i.sell_price,
    qr_data: `PART-${i.id}`,
    barcode_data: i.sku || `PART-${i.id.slice(0,8)}`
  })));
});

// Get repair label data
router.get('/labels/repair/:id', (req, res) => {
  const repair = db.prepare(`SELECT r.*, c.name as customer_name, c.phone as customer_phone
    FROM repairs r JOIN customers c ON r.customer_id=c.id WHERE r.id=?`).get(req.params.id);
  if (!repair) return res.status(404).json({ error: 'Not found' });
  res.json({
    id: repair.id,
    customer_name: repair.customer_name,
    customer_phone: repair.customer_phone,
    title: repair.title,
    device: [repair.device_brand, repair.device_model].filter(Boolean).join(' '),
    serial_number: repair.serial_number,
    status: repair.status,
    intake_date: repair.intake_date,
    qr_data: `REPAIR-${repair.id}`,
    device_qr_data: repair.serial_number ? `DEVICE-${repair.serial_number}` : null
  });
});

module.exports = router;
