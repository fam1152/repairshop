const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const auth = require('./auth.middleware');

router.use(auth);

// ── REVENUE STATS ──
router.get('/stats', (req, res) => {
  const { period } = req.query;
  const now = new Date();
  let start, prevStart;

  if (period === 'week') {
    start = new Date(now); start.setDate(start.getDate() - 7);
    prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - 7);
  } else if (period === 'year') {
    start = new Date(now.getFullYear(), 0, 1);
    prevStart = new Date(now.getFullYear() - 1, 0, 1);
  } else {
    // month (default)
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  }

  const startStr = start.toISOString();
  const prevStartStr = prevStart.toISOString();

  const revenue = db.prepare("SELECT COALESCE(SUM(total),0) as t FROM invoices WHERE status='paid' AND issued_date >= ?").get(startStr).t;
  const prevRevenue = db.prepare("SELECT COALESCE(SUM(total),0) as t FROM invoices WHERE status='paid' AND issued_date >= ? AND issued_date < ?").get(prevStartStr, startStr).t;
  const outstanding = db.prepare("SELECT COALESCE(SUM(total),0) as t FROM invoices WHERE status IN ('draft','sent')").get().t;
  const toolsSpent = db.prepare("SELECT COALESCE(SUM(cost),0) as t FROM tools_purchases WHERE purchased_date >= ?").get(startStr).t;
  const totalToolsSpent = db.prepare("SELECT COALESCE(SUM(cost),0) as t FROM tools_purchases").get().t;
  const partsSpent = db.prepare("SELECT COALESCE(SUM(parts_cost),0) as t FROM repairs WHERE created_at >= ?").get(startStr).t;
  const laborRevenue = db.prepare("SELECT COALESCE(SUM(labor_cost),0) as t FROM repairs WHERE status='completed' AND created_at >= ?").get(startStr).t;

  // Monthly breakdown for chart (last 6 months)
  const monthly = [];
  for (let i = 5; i >= 0; i--) {
    const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const mRevenue = db.prepare("SELECT COALESCE(SUM(total),0) as t FROM invoices WHERE status='paid' AND issued_date >= ? AND issued_date < ?").get(mStart.toISOString(), mEnd.toISOString()).t;
    const mTools = db.prepare("SELECT COALESCE(SUM(cost),0) as t FROM tools_purchases WHERE purchased_date >= ? AND purchased_date < ?").get(mStart.toISOString(), mEnd.toISOString()).t;
    monthly.push({
      month: mStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      revenue: mRevenue,
      tools: mTools,
    });
  }

  // Top paying customers
  const topCustomers = db.prepare(`
    SELECT c.name, COALESCE(SUM(i.total),0) as total
    FROM invoices i JOIN customers c ON i.customer_id=c.id
    WHERE i.status='paid' AND i.issued_date >= ?
    GROUP BY c.id ORDER BY total DESC LIMIT 5
  `).all(startStr);

  // Invoice status breakdown
  const invoiceBreakdown = db.prepare(`
    SELECT status, COUNT(*) as count, COALESCE(SUM(total),0) as total
    FROM invoices GROUP BY status
  `).all();

  res.json({
    revenue, prevRevenue,
    outstanding,
    toolsSpent, totalToolsSpent,
    partsSpent, laborRevenue,
    monthly, topCustomers, invoiceBreakdown,
    profit: revenue - toolsSpent - partsSpent
  });
});

// ── TOOLS PURCHASES ──
router.get('/tools', (req, res) => {
  const tools = db.prepare('SELECT * FROM tools_purchases ORDER BY purchased_date DESC').all();
  res.json(tools);
});

router.post('/tools', (req, res) => {
  const { name, description, cost, supplier, purchased_date, category, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = uuidv4();
  db.prepare('INSERT INTO tools_purchases (id,name,description,cost,supplier,purchased_date,category,notes) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, name, description || '', parseFloat(cost) || 0, supplier || '', purchased_date || new Date().toISOString(), category || 'Tool', notes || '');
  res.json(db.prepare('SELECT * FROM tools_purchases WHERE id=?').get(id));
});

router.put('/tools/:id', (req, res) => {
  const { name, description, cost, supplier, purchased_date, category, notes } = req.body;
  db.prepare('UPDATE tools_purchases SET name=?,description=?,cost=?,supplier=?,purchased_date=?,category=?,notes=? WHERE id=?')
    .run(name, description || '', parseFloat(cost) || 0, supplier || '', purchased_date, category || 'Tool', notes || '', req.params.id);
  res.json(db.prepare('SELECT * FROM tools_purchases WHERE id=?').get(req.params.id));
});

router.delete('/tools/:id', (req, res) => {
  db.prepare('DELETE FROM tools_purchases WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── CHANGELOG ──
router.get('/changelog', (req, res) => {
  res.json(db.prepare('SELECT * FROM changelog ORDER BY date DESC').all());
});

router.post('/changelog', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { version, date, changes, type } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO changelog (id,version,date,changes,type) VALUES (?,?,?,?,?)').run(id, version, date, changes, type || 'feature');
  res.json(db.prepare('SELECT * FROM changelog WHERE id=?').get(id));
});

module.exports = router;
