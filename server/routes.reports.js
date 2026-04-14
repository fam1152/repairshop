const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const auth = require('./auth.middleware');

router.use(auth);

// ── PARTS ORDERS ──
router.get('/parts-orders', (req, res) => {
  const { year } = req.query;
  let sql = `SELECT po.*, 
    (SELECT COUNT(*) FROM parts_order_items WHERE order_id=po.id) as item_count
    FROM parts_orders po WHERE 1=1`;
  const params = [];
  if (year) { sql += ' AND strftime("%Y", po.order_date) = ?'; params.push(String(year)); }
  sql += ' ORDER BY po.order_date DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/parts-orders/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM parts_orders WHERE id=?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  const items = db.prepare(`SELECT poi.*, i.name as inventory_name FROM parts_order_items poi 
    LEFT JOIN inventory i ON poi.inventory_id=i.id WHERE poi.order_id=?`).all(req.params.id);
  res.json({ ...order, items });
});

router.post('/parts-orders', (req, res) => {
  const { supplier_name, supplier_website, order_invoice_number, order_date, total_cost, status, notes, tracking_number, items } = req.body;
  if (!supplier_name) return res.status(400).json({ error: 'Supplier name required' });
  const id = uuidv4();

  // Calculate total from items if provided
  const itemsData = items || [];
  const calcTotal = itemsData.reduce((s, i) => s + (parseFloat(i.unit_cost)||0) * (parseInt(i.quantity)||1), 0);
  const finalTotal = parseFloat(total_cost) || calcTotal;

  db.prepare(`INSERT INTO parts_orders (id,supplier_name,supplier_website,order_invoice_number,order_date,total_cost,status,notes,tracking_number)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(id, supplier_name, supplier_website||'', order_invoice_number||'',
    order_date || new Date().toISOString(), finalTotal, status||'ordered', notes||'', tracking_number||'');

  // Insert line items
  if (itemsData.length > 0) {
    const stmt = db.prepare(`INSERT INTO parts_order_items (id,order_id,inventory_id,part_name,quantity,unit_cost,total_cost,notes) VALUES (?,?,?,?,?,?,?,?)`);
    itemsData.forEach(item => {
      stmt.run(uuidv4(), id, item.inventory_id||null, item.part_name||'', parseInt(item.quantity)||1,
        parseFloat(item.unit_cost)||0, (parseFloat(item.unit_cost)||0)*(parseInt(item.quantity)||1), item.notes||'');
    });
  }

  res.json(db.prepare('SELECT * FROM parts_orders WHERE id=?').get(id));
});

router.put('/parts-orders/:id', (req, res) => {
  const { supplier_name, supplier_website, order_invoice_number, order_date, total_cost, status, notes, tracking_number } = req.body;
  db.prepare(`UPDATE parts_orders SET supplier_name=?,supplier_website=?,order_invoice_number=?,order_date=?,total_cost=?,status=?,notes=?,tracking_number=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(supplier_name, supplier_website||'', order_invoice_number||'', order_date, parseFloat(total_cost)||0, status||'ordered', notes||'', tracking_number||'', req.params.id);
  res.json(db.prepare('SELECT * FROM parts_orders WHERE id=?').get(req.params.id));
});

router.delete('/parts-orders/:id', (req, res) => {
  db.prepare('DELETE FROM parts_order_items WHERE order_id=?').run(req.params.id);
  db.prepare('DELETE FROM parts_orders WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── TAX REPORTS ──
router.get('/tax-summary', (req, res) => {
  const { year, quarter } = req.query;
  const y = parseInt(year) || new Date().getFullYear();

  let dateFilter, prevFilter;
  if (quarter) {
    const q = parseInt(quarter);
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    dateFilter = `strftime('%Y', date) = '${y}' AND CAST(strftime('%m', date) AS INTEGER) BETWEEN ${startMonth} AND ${endMonth}`;
    const prevQ = q === 1 ? 4 : q - 1;
    const prevY = q === 1 ? y - 1 : y;
    const pStartM = (prevQ - 1) * 3 + 1;
    prevFilter = `strftime('%Y', date) = '${prevY}' AND CAST(strftime('%m', date) AS INTEGER) BETWEEN ${pStartM} AND ${pStartM + 2}`;
  } else {
    dateFilter = `strftime('%Y', date) = '${y}'`;
    prevFilter = `strftime('%Y', date) = '${y - 1}'`;
  }

  // Revenue from paid invoices
  const revenue = db.prepare(`SELECT COALESCE(SUM(total),0) as total, COALESCE(SUM(tax_amount),0) as tax, COUNT(*) as count FROM invoices WHERE status='paid' AND ${dateFilter.replace(/date/g, 'issued_date')}`).get();
  const prevRevenue = db.prepare(`SELECT COALESCE(SUM(total),0) as total FROM invoices WHERE status='paid' AND ${prevFilter.replace(/date/g, 'issued_date')}`).get();

  // Parts costs (from repairs)
  const partsCosts = db.prepare(`SELECT COALESCE(SUM(parts_cost),0) as total FROM repairs WHERE ${dateFilter.replace(/date/g, 'created_at')}`).get();

  // Parts orders
  const partsOrders = db.prepare(`SELECT COALESCE(SUM(total_cost),0) as total, COUNT(*) as count FROM parts_orders WHERE ${dateFilter.replace(/date/g, 'order_date')}`).get();

  // Tools purchases
  const toolsCosts = db.prepare(`SELECT COALESCE(SUM(cost),0) as total, COUNT(*) as count FROM tools_purchases WHERE ${dateFilter.replace(/date/g, 'purchased_date')}`).get();

  // Monthly breakdown
  const monthly = [];
  for (let m = 1; m <= 12; m++) {
    const mStr = String(m).padStart(2, '0');
    const mFilter = `strftime('%Y-%m', date) = '${y}-${mStr}'`;
    const mRev = db.prepare(`SELECT COALESCE(SUM(total),0) as t FROM invoices WHERE status='paid' AND ${mFilter.replace(/date/g, 'issued_date')}`).get().t;
    const mParts = db.prepare(`SELECT COALESCE(SUM(total_cost),0) as t FROM parts_orders WHERE ${mFilter.replace(/date/g, 'order_date')}`).get().t;
    const mTools = db.prepare(`SELECT COALESCE(SUM(cost),0) as t FROM tools_purchases WHERE ${mFilter.replace(/date/g, 'purchased_date')}`).get().t;
    monthly.push({ month: m, month_name: new Date(y, m-1, 1).toLocaleDateString('en-US', { month: 'short' }), revenue: mRev, parts_cost: mParts, tools_cost: mTools, profit: mRev - mParts - mTools });
  }

  const totalExpenses = (partsOrders.total || 0) + (toolsCosts.total || 0);
  const netProfit = (revenue.total || 0) - totalExpenses;

  res.json({
    year: y, quarter: quarter || null,
    revenue: { total: revenue.total, tax_collected: revenue.tax, invoice_count: revenue.count },
    prev_revenue: prevRevenue.total,
    parts_costs: { from_repairs: partsCosts.total, from_orders: partsOrders.total, order_count: partsOrders.count },
    tools_costs: { total: toolsCosts.total, purchase_count: toolsCosts.count },
    total_expenses: totalExpenses,
    net_profit: netProfit,
    monthly,
  });
});

// ── XLS EXPORT ──
router.get('/export-xls', (req, res) => {
  const { year, quarter } = req.query;
  const y = parseInt(year) || new Date().getFullYear();
  const XLSX = require('xlsx');

  let dateWhere = `strftime('%Y', date_col) = '${y}'`;
  if (quarter) {
    const q = parseInt(quarter);
    const startMonth = (q - 1) * 3 + 1;
    dateWhere += ` AND CAST(strftime('%m', date_col) AS INTEGER) BETWEEN ${startMonth} AND ${startMonth + 2}`;
  }

  const settings = db.prepare('SELECT * FROM settings WHERE id=1').get();
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Revenue (Paid Invoices) ──
  const invoices = db.prepare(`SELECT i.invoice_number, i.issued_date, i.subtotal, i.tax_amount, i.total, c.name as customer_name FROM invoices i JOIN customers c ON i.customer_id=c.id WHERE i.status='paid' AND ${dateWhere.replace(/date_col/g, 'i.issued_date')} ORDER BY i.issued_date`).all();
  const invoiceRows = [
    ['Invoice #', 'Date', 'Customer', 'Subtotal', 'Tax', 'Total'],
    ...invoices.map(i => [i.invoice_number, i.issued_date?.split('T')[0], i.customer_name, i.subtotal?.toFixed(2), i.tax_amount?.toFixed(2), i.total?.toFixed(2)]),
    [],
    ['', '', 'TOTALS', invoices.reduce((s,i)=>s+(i.subtotal||0),0).toFixed(2), invoices.reduce((s,i)=>s+(i.tax_amount||0),0).toFixed(2), invoices.reduce((s,i)=>s+(i.total||0),0).toFixed(2)],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(invoiceRows);
  ws1['!cols'] = [{ wch:14 },{ wch:12 },{ wch:28 },{ wch:12 },{ wch:10 },{ wch:12 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Revenue');

  // ── Sheet 2: Parts Orders ──
  const orders = db.prepare(`SELECT po.order_date, po.supplier_name, po.supplier_website, po.order_invoice_number, po.tracking_number, po.total_cost, po.status FROM parts_orders po WHERE ${dateWhere.replace(/date_col/g, 'po.order_date')} ORDER BY po.order_date`).all();
  const orderRows = [
    ['Date', 'Supplier', 'Website', 'Invoice #', 'Tracking #', 'Total Cost', 'Status'],
    ...orders.map(o => [o.order_date?.split('T')[0], o.supplier_name, o.supplier_website, o.order_invoice_number, o.tracking_number, o.total_cost?.toFixed(2), o.status]),
    [],
    ['', '', '', '', 'TOTAL PARTS SPEND', orders.reduce((s,o)=>s+(o.total_cost||0),0).toFixed(2), ''],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(orderRows);
  ws2['!cols'] = [{ wch:12 },{ wch:22 },{ wch:28 },{ wch:16 },{ wch:18 },{ wch:14 },{ wch:12 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Parts Orders');

  // ── Sheet 3: Parts used per repair ──
  const repairParts = db.prepare(`SELECT r.created_at, c.name as customer_name, r.title, r.parts_cost, r.labor_cost, r.device_brand, r.device_model FROM repairs r JOIN customers c ON r.customer_id=c.id WHERE r.parts_cost > 0 AND ${dateWhere.replace(/date_col/g, 'r.created_at')} ORDER BY r.created_at`).all();
  const repairRows = [
    ['Date', 'Customer', 'Repair', 'Device', 'Parts Cost', 'Labor', 'Total'],
    ...repairParts.map(r => [r.created_at?.split('T')[0], r.customer_name, r.title, [r.device_brand,r.device_model].filter(Boolean).join(' '), r.parts_cost?.toFixed(2), r.labor_cost?.toFixed(2), ((r.parts_cost||0)+(r.labor_cost||0)).toFixed(2)]),
    [],
    ['', '', '', 'TOTALS', repairParts.reduce((s,r)=>s+(r.parts_cost||0),0).toFixed(2), repairParts.reduce((s,r)=>s+(r.labor_cost||0),0).toFixed(2), repairParts.reduce((s,r)=>s+(r.parts_cost||0)+(r.labor_cost||0),0).toFixed(2)],
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(repairRows);
  ws3['!cols'] = [{ wch:12 },{ wch:24 },{ wch:28 },{ wch:20 },{ wch:12 },{ wch:12 },{ wch:12 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Parts Per Repair');

  // ── Sheet 4: Tools & Equipment ──
  const tools = db.prepare(`SELECT name, category, purchased_date, cost, supplier, description FROM tools_purchases WHERE ${dateWhere.replace(/date_col/g, 'purchased_date')} ORDER BY purchased_date`).all();
  const toolRows = [
    ['Name', 'Category', 'Date', 'Cost', 'Supplier', 'Description'],
    ...tools.map(t => [t.name, t.category, t.purchased_date?.split('T')[0], t.cost?.toFixed(2), t.supplier, t.description]),
    [],
    ['', '', 'TOTAL TOOLS SPEND', tools.reduce((s,t)=>s+(t.cost||0),0).toFixed(2), '', ''],
  ];
  const ws4 = XLSX.utils.aoa_to_sheet(toolRows);
  ws4['!cols'] = [{ wch:24 },{ wch:14 },{ wch:12 },{ wch:12 },{ wch:22 },{ wch:32 }];
  XLSX.utils.book_append_sheet(wb, ws4, 'Tools & Equipment');

  // ── Sheet 5: Summary ──
  const totalRevenue = invoices.reduce((s,i)=>s+(i.total||0),0);
  const totalTax = invoices.reduce((s,i)=>s+(i.tax_amount||0),0);
  const totalParts = orders.reduce((s,o)=>s+(o.total_cost||0),0);
  const totalTools = tools.reduce((s,t)=>s+(t.cost||0),0);
  const totalExpenses = totalParts + totalTools;

  const summaryRows = [
    [`${settings?.company_name || 'RepairShop'} — Tax Report`],
    [`Year: ${y}${quarter ? ` Q${quarter}` : ''}`],
    [`Generated: ${new Date().toLocaleDateString()}`],
    [],
    ['REVENUE', ''],
    ['Gross revenue (paid invoices)', `$${totalRevenue.toFixed(2)}`],
    ['Tax collected', `$${totalTax.toFixed(2)}`],
    ['Revenue before tax', `$${(totalRevenue - totalTax).toFixed(2)}`],
    [],
    ['EXPENSES', ''],
    ['Parts / supplies ordered', `$${totalParts.toFixed(2)}`],
    ['Tools & equipment purchased', `$${totalTools.toFixed(2)}`],
    ['Total expenses', `$${totalExpenses.toFixed(2)}`],
    [],
    ['NET PROFIT (est.)', `$${(totalRevenue - totalTax - totalExpenses).toFixed(2)}`],
    [],
    ['NOTE', 'This report is for reference only. Consult a tax professional.'],
  ];
  const ws5 = XLSX.utils.aoa_to_sheet(summaryRows);
  ws5['!cols'] = [{ wch:36 },{ wch:18 }];
  XLSX.utils.book_append_sheet(wb, ws5, 'Summary');

  // Stream the file
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = `repairshop-tax-report-${y}${quarter ? `-Q${quarter}` : ''}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buf);
});

module.exports = router;
