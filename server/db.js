const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Determine database path
const dbPath = process.env.DB_PATH || '/data/repairshop.sqlite';
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'staff',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    company_name TEXT DEFAULT 'My IT Shop',
    address TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    tax_rate REAL DEFAULT 0,
    tax_label TEXT DEFAULT 'Tax',
    invoice_color TEXT DEFAULT '#2563eb',
    invoice_notes TEXT DEFAULT 'Thank you for your business!',
    logo_url TEXT DEFAULT '',
    dark_mode INTEGER DEFAULT 1,
    currency TEXT DEFAULT 'USD',
    jwt_secret TEXT DEFAULT ''
  );

  INSERT OR IGNORE INTO settings (id) VALUES (1);
`);

// Auto-generate a persistent JWT secret if missing
const settings = db.prepare('SELECT jwt_secret FROM settings WHERE id=1').get();
if (!settings?.jwt_secret) {
  const crypto = require('crypto');
  const secret = crypto.randomBytes(32).toString('hex');
  db.prepare('UPDATE settings SET jwt_secret=? WHERE id=1').run(secret);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    address TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS repairs (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id),
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'intake',
    priority TEXT DEFAULT 'normal',
    device_type TEXT DEFAULT '',
    device_brand TEXT DEFAULT '',
    device_model TEXT DEFAULT '',
    serial_number TEXT DEFAULT '',
    password TEXT DEFAULT '',
    repair_notes TEXT DEFAULT '',
    parts_used TEXT DEFAULT '[]',
    labor_cost REAL DEFAULT 0,
    parts_cost REAL DEFAULT 0,
    warranty_months INTEGER DEFAULT 0,
    warranty_expires DATETIME,
    intake_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_date DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS call_logs (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id),
    repair_id TEXT REFERENCES repairs(id),
    direction TEXT DEFAULT 'outbound',
    notes TEXT DEFAULT '',
    outcome TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    repair_id TEXT REFERENCES repairs(id),
    customer_id TEXT NOT NULL REFERENCES customers(id),
    invoice_number TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'draft',
    line_items TEXT DEFAULT '[]',
    subtotal REAL DEFAULT 0,
    tax_amount REAL DEFAULT 0,
    total REAL DEFAULT 0,
    notes TEXT DEFAULT '',
    pdf_path TEXT DEFAULT '',
    issued_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    due_date DATETIME,
    paid_date DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,
    repair_id TEXT REFERENCES repairs(id),
    customer_id TEXT NOT NULL REFERENCES customers(id),
    type TEXT DEFAULT 'followup',
    message TEXT DEFAULT '',
    due_date DATETIME NOT NULL,
    status TEXT DEFAULT 'pending',
    dismissed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS inventory (
    id TEXT PRIMARY KEY,
    sku TEXT DEFAULT '',
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    category TEXT DEFAULT 'General',
    quantity INTEGER DEFAULT 0,
    quantity_min INTEGER DEFAULT 1,
    unit_cost REAL DEFAULT 0,
    sell_price REAL DEFAULT 0,
    supplier TEXT DEFAULT '',
    manufacturer TEXT DEFAULT '',
    device_type TEXT DEFAULT '',
    location TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS inventory_transactions (
    id TEXT PRIMARY KEY,
    inventory_id TEXT NOT NULL REFERENCES inventory(id),
    type TEXT NOT NULL,
    quantity_change INTEGER NOT NULL,
    quantity_after INTEGER NOT NULL,
    repair_id TEXT REFERENCES repairs(id),
    unit_cost REAL DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_repairs_customer ON repairs(customer_id);
  CREATE INDEX IF NOT EXISTS idx_repairs_status ON repairs(status);
  CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
  CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);
  CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(due_date);
  CREATE INDEX IF NOT EXISTS idx_call_logs_customer ON call_logs(customer_id);
  CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category);
  CREATE INDEX IF NOT EXISTS idx_inventory_transactions ON inventory_transactions(inventory_id);
  CREATE TABLE IF NOT EXISTS estimates (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id),
    repair_id TEXT REFERENCES repairs(id),
    estimate_number TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'draft',
    line_items TEXT DEFAULT '[]',
    subtotal REAL DEFAULT 0,
    tax_amount REAL DEFAULT 0,
    total REAL DEFAULT 0,
    notes TEXT DEFAULT '',
    valid_until DATETIME,
    converted_invoice_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS repair_photos (
    id TEXT PRIMARY KEY,
    repair_id TEXT NOT NULL REFERENCES repairs(id),
    filename TEXT NOT NULL,
    original_name TEXT DEFAULT '',
    caption TEXT DEFAULT '',
    stage TEXT DEFAULT 'intake',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    customer_id TEXT REFERENCES customers(id),
    customer_name TEXT DEFAULT '',
    customer_phone TEXT DEFAULT '',
    customer_email TEXT DEFAULT '',
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    device_type TEXT DEFAULT '',
    device_brand TEXT DEFAULT '',
    device_model TEXT DEFAULT '',
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    status TEXT DEFAULT 'scheduled',
    notes TEXT DEFAULT '',
    google_event_id TEXT DEFAULT '',
    repair_id TEXT REFERENCES repairs(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS google_tokens (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    access_token TEXT DEFAULT '',
    refresh_token TEXT DEFAULT '',
    expiry_date INTEGER DEFAULT 0,
    calendar_id TEXT DEFAULT 'primary'
  );

  INSERT OR IGNORE INTO google_tokens (id) VALUES (1);

  CREATE INDEX IF NOT EXISTS idx_estimates_customer ON estimates(customer_id);
  CREATE INDEX IF NOT EXISTS idx_repair_photos_repair ON repair_photos(repair_id);
  CREATE INDEX IF NOT EXISTS idx_appointments_start ON appointments(start_time);
  -- Add columns to users if they don't exist (safe migration)
  CREATE TABLE IF NOT EXISTS users_v2 (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'staff',
    display_name TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    username TEXT DEFAULT '',
    action TEXT NOT NULL,
    entity_type TEXT DEFAULT '',
    entity_id TEXT DEFAULT '',
    entity_label TEXT DEFAULT '',
    details TEXT DEFAULT '',
    ip_address TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS scheduled_backups (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER DEFAULT 0,
    frequency TEXT DEFAULT 'daily',
    hour INTEGER DEFAULT 2,
    save_path TEXT DEFAULT '',
    last_run DATETIME,
    next_run DATETIME
  );

  INSERT OR IGNORE INTO scheduled_backups (id) VALUES (1);

  CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id);
  CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at);
  CREATE TABLE IF NOT EXISTS tools_purchases (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    cost REAL DEFAULT 0,
    supplier TEXT DEFAULT '',
    purchased_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    category TEXT DEFAULT 'Tool',
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_preferences (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
    dark_mode INTEGER DEFAULT 0,
    preferences TEXT DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    sender_name TEXT DEFAULT '',
    recipient_id TEXT DEFAULT '',
    is_broadcast INTEGER DEFAULT 0,
    is_ai INTEGER DEFAULT 0,
    message TEXT NOT NULL,
    read_by TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS changelog (
    id TEXT PRIMARY KEY,
    version TEXT NOT NULL,
    date TEXT NOT NULL,
    changes TEXT NOT NULL,
    type TEXT DEFAULT 'feature',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_tools_purchases ON tools_purchases(purchased_date);
  CREATE TABLE IF NOT EXISTS parts_orders (
    id TEXT PRIMARY KEY,
    supplier_name TEXT NOT NULL,
    supplier_website TEXT DEFAULT '',
    order_invoice_number TEXT DEFAULT '',
    order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    total_cost REAL DEFAULT 0,
    status TEXT DEFAULT 'ordered',
    notes TEXT DEFAULT '',
    tracking_number TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS parts_order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES parts_orders(id),
    inventory_id TEXT REFERENCES inventory(id),
    part_name TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_cost REAL DEFAULT 0,
    total_cost REAL DEFAULT 0,
    notes TEXT DEFAULT ''
  );

  CREATE INDEX IF NOT EXISTS idx_parts_orders_date ON parts_orders(order_date);
  CREATE INDEX IF NOT EXISTS idx_parts_order_items ON parts_order_items(order_id);

  CREATE INDEX IF NOT EXISTS idx_chat_messages ON chat_messages(created_at);
  CREATE INDEX IF NOT EXISTS idx_user_prefs ON user_preferences(user_id);
`);


// Safe migration — add new columns to users table if they don't exist
try {
  db.exec(`ALTER TABLE users ADD COLUMN display_name TEXT DEFAULT ''`);
} catch(e) {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT ''`);
} catch(e) {}
try {
  db.exec(`ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1`);
} catch(e) {}
try {
  db.exec(`ALTER TABLE appointments ADD COLUMN created_by_id TEXT DEFAULT ''`);
} catch(e) {}
try {
  db.exec(`ALTER TABLE appointments ADD COLUMN created_by_name TEXT DEFAULT ''`);
} catch(e) {}


try { db.exec(`ALTER TABLE settings ADD COLUMN docker_compose_content TEXT DEFAULT ''`); } catch(e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN preferences TEXT DEFAULT '{}'`); } catch(e) {}

// Seed changelog
const existingLog = db.prepare("SELECT COUNT(*) as c FROM changelog").get();
if (existingLog.c === 0) {
  const { v4: uuidv4 } = require('uuid');
  const logs = [
    { version: 'v8.0', date: '2026-04-13', type: 'feature', changes: 'Added AI assistant powered by Ollama — repair diagnosis, note formatter, customer messages, inventory reorder, business insights' },
    { version: 'v7.0', date: '2026-04-12', type: 'feature', changes: 'Added Docker update checker — check and apply updates from inside the app. Added container info and uptime display' },
    { version: 'v6.0', date: '2026-04-11', type: 'feature', changes: 'Added staff account management, activity log (30-day rolling), user avatars, appointment created-by tracking, scheduled backups, software license' },
    { version: 'v5.0', date: '2026-04-10', type: 'feature', changes: 'Added backup and restore — download full backup zip, drag-and-drop restore, ZFS snapshot guidance' },
    { version: 'v4.0', date: '2026-04-09', type: 'feature', changes: 'Added estimates/quotes with PDF, photo documentation per repair, appointment booking with Google Calendar sync' },
    { version: 'v3.0', date: '2026-04-08', type: 'feature', changes: 'Added barcode/QR scanner, QR code and barcode label generation, device serial number scanning, printable label sheets' },
    { version: 'v2.0', date: '2026-04-07', type: 'feature', changes: 'Added inventory tracking with stock levels, low stock alerts, transaction history, printable repair intake form PDF' },
    { version: 'v1.0', date: '2026-04-06', type: 'release', changes: 'Initial release — customer management, repair tickets, invoicing, reminders, dashboard, dark mode, Docker deployment' },
  ];
  const stmt = db.prepare('INSERT INTO changelog (id,version,date,type,changes) VALUES (?,?,?,?,?)');
  logs.forEach(l => stmt.run(uuidv4(), l.version, l.date, l.type, l.changes));
}


// ── v10.1.x & v11.0.0 changelog entries ────────────────────────
try {
  const checkV1 = db.prepare("SELECT id FROM changelog WHERE version=?").get('v1.0.0-Beta');
  if (!checkV1) {
    const { v4: uuidv4 } = require('uuid');
    const newLogs = [
      { version: 'v1.0.0-Beta-Build-04-20-2026', date: '2026-04-20', type: 'release', changes: 'Consolidated interface, added Dedicated Print Queue, File Browser, and color-coded status tray icon. Cleaned up settings into logical groups.' },
      { version: 'v10.1.2', date: '2026-04-19', type: 'fix', changes: 'Fixed SyntaxError (duplicate db declaration) and version synchronization' },
      { version: 'v10.1.1', date: '2026-04-19', type: 'fix', changes: 'Fixed critical server crash due to duplicate db variable declaration' },
      { version: 'v10.1.0', date: '2026-04-19', type: 'feature', changes: 'Multi-mode update system (Git/GitHub support) and database fixes for manufacturer/device_type' },
      { version: 'v10.0',   date: '2026-04-13', type: 'feature', changes: 'Invoice balance tracking, payments log, authorized pickup, OS/Version fields, customer document uploads, and Trash/Recycle bin' }
    ];
    const stmt = db.prepare('INSERT INTO changelog (id,version,date,type,changes) VALUES (?,?,?,?,?)');
    newLogs.forEach(l => {
      // Avoid duplicates if some already exist
      const exists = db.prepare("SELECT id FROM changelog WHERE version=?").get(l.version);
      if (!exists) stmt.run(uuidv4(), l.version, l.date, l.type, l.changes);
    });
  }
} catch(e) { console.error("Error seeding new changelog:", e.message); }

// Soft delete migrations
try { db.exec(`ALTER TABLE customers ADD COLUMN deleted_at DATETIME DEFAULT NULL`); } catch(e) {}
try { db.exec(`ALTER TABLE invoices ADD COLUMN deleted_at DATETIME DEFAULT NULL`); } catch(e) {}
try { db.exec(`ALTER TABLE estimates ADD COLUMN deleted_at DATETIME DEFAULT NULL`); } catch(e) {}
try { db.exec(`ALTER TABLE repairs ADD COLUMN deleted_at DATETIME DEFAULT NULL`); } catch(e) {}

// User preferences — ensure table exists with correct schema
db.exec(`CREATE TABLE IF NOT EXISTS user_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  dark_mode INTEGER DEFAULT 1,
  preferences TEXT DEFAULT '{}'
)`);


// ── v10.0 migrations ──────────────────────────────────────────────
// Invoices: balance tracking
try { db.exec(`ALTER TABLE invoices ADD COLUMN amount_paid REAL DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE invoices ADD COLUMN balance_due REAL DEFAULT 0`); } catch(e) {}

// Invoice payments log
db.exec(`CREATE TABLE IF NOT EXISTS invoice_payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  amount REAL NOT NULL,
  method TEXT DEFAULT 'cash',
  notes TEXT DEFAULT '',
  applied_by TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Customer: authorized pickup person per-invoice stored in invoices
// Customer: product keys table
db.exec(`CREATE TABLE IF NOT EXISTS customer_product_keys (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  repair_id TEXT REFERENCES repairs(id),
  product TEXT DEFAULT '',
  key_value TEXT NOT NULL,
  notes TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Customer: documents (scanned/uploaded)
db.exec(`CREATE TABLE IF NOT EXISTS customer_documents (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  filename TEXT NOT NULL,
  original_name TEXT DEFAULT '',
  file_type TEXT DEFAULT '',
  file_size INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Repairs: OS info, authorized pickup
try { db.exec(`ALTER TABLE repairs ADD COLUMN os_name TEXT DEFAULT ''`); } catch(e) {}
try { db.exec(`ALTER TABLE repairs ADD COLUMN os_version TEXT DEFAULT ''`); } catch(e) {}

// Invoices: authorized pickup
try { db.exec(`ALTER TABLE invoices ADD COLUMN authorized_name TEXT DEFAULT ''`); } catch(e) {}
try { db.exec(`ALTER TABLE invoices ADD COLUMN authorized_phone TEXT DEFAULT ''`); } catch(e) {}

// Repairs: allow custom intake date (for historical data entry)
try { db.exec(`ALTER TABLE repairs ADD COLUMN custom_date INTEGER DEFAULT 0`); } catch(e) {}

// Customers: Google contacts ID for sync
try { db.exec(`ALTER TABLE customers ADD COLUMN google_contact_id TEXT DEFAULT ''`); } catch(e) {}

// Update balance_due on existing invoices
try { db.exec(`UPDATE invoices SET balance_due = total - amount_paid WHERE balance_due = 0 AND total > 0`); } catch(e) {}

// Cloud sync settings
try { db.exec(`ALTER TABLE settings ADD COLUMN google_contacts_sync INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE settings ADD COLUMN google_calendar_sync INTEGER DEFAULT 0`); } catch(e) {}


// ── v10.1 migrations ──────────────────────────────────────────────

// Manufacturer list (editable)
db.exec(`CREATE TABLE IF NOT EXISTS manufacturers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  logo_emoji TEXT DEFAULT '📦',
  device_types TEXT DEFAULT '[]',
  active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Parts catalog / price book
db.exec(`CREATE TABLE IF NOT EXISTS price_book (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'Labor',
  manufacturer TEXT DEFAULT '',
  device_type TEXT DEFAULT '',
  description TEXT DEFAULT '',
  cost_price REAL DEFAULT 0,
  sell_price REAL DEFAULT 0,
  unit TEXT DEFAULT 'ea',
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Customer notes (multiple, with headings)
db.exec(`CREATE TABLE IF NOT EXISTS customer_notes (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  heading TEXT DEFAULT 'Note',
  body TEXT DEFAULT '',
  pinned INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Notifications
db.exec(`CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT DEFAULT '',
  type TEXT DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  link TEXT DEFAULT '',
  read INTEGER DEFAULT 0,
  dismissed INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Repair workflows
db.exec(`CREATE TABLE IF NOT EXISTS workflow_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  trigger_status TEXT DEFAULT 'intake',
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.exec(`CREATE TABLE IF NOT EXISTS workflow_steps (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES workflow_templates(id),
  step_order INTEGER DEFAULT 0,
  action_type TEXT NOT NULL,
  action_config TEXT DEFAULT '{}',
  delay_hours INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.exec(`CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  repair_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  scheduled_for DATETIME,
  executed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Google Drive backup settings
try { db.exec(`ALTER TABLE settings ADD COLUMN google_drive_backup INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE settings ADD COLUMN google_drive_folder_id TEXT DEFAULT ''`); } catch(e) {}

// Automatic Google sync toggles
try { db.exec(`ALTER TABLE settings ADD COLUMN auto_sync_google_calendar INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE settings ADD COLUMN auto_sync_google_contacts INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE settings ADD COLUMN auto_sync_google_drive INTEGER DEFAULT 0`); } catch(e) {}

// Inventory: manufacturer and device_type fields
try { db.exec(`ALTER TABLE inventory ADD COLUMN manufacturer TEXT DEFAULT ''`); } catch(e) {}
try { db.exec(`ALTER TABLE inventory ADD COLUMN device_type TEXT DEFAULT ''`); } catch(e) {}

// Invoice labor line flag
try { db.exec(`ALTER TABLE invoices ADD COLUMN labor_total REAL DEFAULT 0`); } catch(e) {}

// Seed default manufacturers
const mfrCount = db.prepare("SELECT COUNT(*) as c FROM manufacturers").get().c;
if (mfrCount === 0) {
  const { v4: uuidv4 } = require('uuid');
  const defaultMfrs = [
    { name: 'Apple', emoji: '🍎', types: ['Phone','Laptop','Tablet','Desktop'] },
    { name: 'Samsung', emoji: '🌀', types: ['Phone','Tablet','Laptop','Monitor'] },
    { name: 'LG', emoji: '🔵', types: ['Phone','Monitor','Laptop'] },
    { name: 'Motorola', emoji: '〽️', types: ['Phone'] },
    { name: 'TCL', emoji: '📺', types: ['Phone','Monitor'] },
    { name: 'Sony', emoji: '🎮', types: ['Phone','Laptop'] },
    { name: 'Google', emoji: '🔍', types: ['Phone','Tablet','Laptop'] },
    { name: 'Dell', emoji: '💻', types: ['Desktop','Laptop','Monitor','Server'] },
    { name: 'HP', emoji: '🖨️', types: ['Desktop','Laptop','Printer','Server'] },
    { name: 'Lenovo', emoji: '💼', types: ['Desktop','Laptop','Tablet','Server'] },
    { name: 'ASUS', emoji: '⚡', types: ['Desktop','Laptop','Tablet','Network Device'] },
    { name: 'Acer', emoji: '🅰️', types: ['Desktop','Laptop','Tablet','Monitor'] },
    { name: 'MSI', emoji: '🎯', types: ['Desktop','Laptop'] },
    { name: 'Toshiba', emoji: '💾', types: ['Desktop','Laptop'] },
    { name: 'Generic', emoji: '📦', types: [] },
  ];
  const stmt = db.prepare("INSERT OR IGNORE INTO manufacturers (id,name,logo_emoji,device_types,sort_order) VALUES (?,?,?,?,?)");
  defaultMfrs.forEach((m, i) => stmt.run(uuidv4(), m.name, m.emoji, JSON.stringify(m.types), i));
}

// Seed full price book from market research (2025 US rates)
const pbCount = db.prepare("SELECT COUNT(*) as c FROM price_book").get().c;
if (pbCount === 0) {
  const { v4: uuidv4 } = require('uuid');
  const stmt = db.prepare("INSERT INTO price_book (id,name,category,manufacturer,device_type,description,cost_price,sell_price,unit) VALUES (?,?,?,?,?,?,?,?,?)");
  const add = (name, category, sell_price, unit, description='', manufacturer='', device_type='', cost_price=0) =>
    stmt.run(uuidv4(), name, category, manufacturer, device_type, description, cost_price, sell_price, unit);

  // ── LABOR ──────────────────────────────────────────────
  add('Standard Bench Labor',        'Labor', 85,  'hr',   'In-shop hourly rate');
  add('Onsite / House Call Labor',   'Labor', 125, 'hr',   'Remote / onsite hourly rate — add travel fee');
  add('Diagnostic Fee — PC/Laptop',  'Labor', 75,  'flat', 'Bench diagnostic; credited toward repair');
  add('Diagnostic Fee — Phone',      'Labor', 25,  'flat', 'Usually waived if repair proceeds');
  add('Minimum Charge (under 15 min)','Labor', 35, 'flat', 'Quick jobs: SIM tray, port cleaning, etc.');
  add('Expedited / Same-Day Surcharge','Labor',50, 'flat', 'Add to base repair price');

  // ── PC & LAPTOP — DIAGNOSTICS & SOFTWARE ──────────────
  add('Virus / Malware Removal',          'Service', 90,  'flat', 'Flat rate; severe cases may be higher',  '', 'Desktop,Laptop');
  add('OS Reinstall — Windows',           'Service', 110, 'flat', 'Clean install without data transfer',    '', 'Desktop,Laptop');
  add('OS Reinstall — macOS',             'Service', 120, 'flat', 'Clean install without data transfer',    'Apple', 'Laptop');
  add('OS Reinstall + Data Migration',    'Service', 175, 'flat', 'Reinstall and transfer user data',       '', 'Desktop,Laptop');
  add('Driver Install / Software Setup',  'Service', 50,  'flat', 'Per session',                            '', 'Desktop,Laptop');
  add('General Tune-Up / Cleanup',        'Service', 75,  'flat', 'Software cleanup and startup optimization','', 'Desktop,Laptop');
  add('Password Reset / Account Recovery','Service', 45,  'flat', 'Local OS or BIOS password',              '', 'Desktop,Laptop');
  add('Network Setup / Troubleshooting',  'Service', 100, 'flat', 'Wi-Fi, ethernet, printer setup',         '', 'Desktop,Laptop');
  add('Remote Support Session',           'Service', 60,  'flat', 'No travel — lower rate',                 '', 'Desktop,Laptop');

  // ── PC & LAPTOP — STORAGE & MEMORY ────────────────────
  add('RAM Upgrade (labor)',              'Labor',   30,  'flat', 'Parts billed separately',                '', 'Desktop,Laptop');
  add('HDD to SSD Upgrade (labor)',       'Labor',   80,  'flat', 'Cloning or clean install',               '', 'Desktop,Laptop');
  add('Hard Drive Replacement + OS',      'Labor',   110, 'flat', 'Labor only; drive cost extra',           '', 'Desktop,Laptop');
  add('HDD + OS + Data Transfer',         'Labor',   150, 'flat', 'Full service — parts extra',             '', 'Desktop,Laptop');
  add('Data Recovery — Minor',            'Service', 150, 'flat', 'Accessible drive, logical failure',      '', 'Desktop,Laptop');
  add('Data Recovery — Severe',           'Service', 300, 'flat', 'Failed drive, physical damage',          '', 'Desktop,Laptop');

  // ── PC & LAPTOP — HARDWARE ────────────────────────────
  add('Desktop Power Supply Swap',        'Labor',   50,  'flat', 'Labor only; PSU cost extra',             '', 'Desktop');
  add('Desktop GPU Replacement',          'Labor',   50,  'flat', 'Labor only; card cost extra',            '', 'Desktop');
  add('Desktop CPU / Motherboard Swap',   'Labor',   100, 'flat', 'Labor only; parts extra',               '', 'Desktop');
  add('Laptop Screen Replacement',        'Labor',   140, 'flat', 'Labor only; screen varies by model',     '', 'Laptop');
  add('Laptop Screen Replacement — Apple','Labor',   180, 'flat', 'Labor only; MacBook screens pricier',    'Apple', 'Laptop');
  add('Laptop Battery Replacement',       'Labor',   65,  'flat', 'Standard laptops; parts extra',         '', 'Laptop');
  add('Laptop Battery — MacBook',         'Labor',   85,  'flat', 'More difficult; adhesive removal',       'Apple', 'Laptop');
  add('Laptop Keyboard Replacement',      'Labor',   80,  'flat', 'Labor only; keyboard cost extra',       '', 'Laptop');
  add('Laptop Motherboard Replacement',   'Labor',   160, 'flat', 'High skill; board cost extra',          '', 'Laptop');
  add('Laptop Charging Port Repair',      'Labor',   75,  'flat', 'Solder or connector swap',              '', 'Laptop');
  add('Laptop Fan / Thermal Paste Service','Labor',  65,  'flat', 'Cleaning + repaste — prevents overheating','', 'Laptop');
  add('Liquid Damage Treatment — Laptop', 'Service', 150, 'flat', 'Ultrasonic clean; no recovery guaranteed','', 'Laptop');
  add('Liquid Damage Treatment — Desktop','Service', 100, 'flat', 'Cleaning; component replacement extra', '', 'Desktop');

  // ── PHONE — SCREEN REPAIRS ────────────────────────────
  add('Screen Replacement — Budget/LCD Phone',    'Screen', 60,  'ea', 'Budget Android, older iPhones',             '', 'Phone');
  add('Screen Replacement — Mid-Range Android',   'Screen', 90,  'ea', 'Galaxy A-series, Pixel A-series',           '', 'Phone');
  add('Screen Replacement — iPhone (standard)',   'Screen', 130, 'ea', 'iPhone 11–13 standard',                     'Apple', 'Phone');
  add('Screen Replacement — iPhone Pro / OLED',   'Screen', 160, 'ea', 'iPhone 13/14/15 Pro; OLED premium',         'Apple', 'Phone');
  add('Screen Replacement — Samsung Flagship',    'Screen', 150, 'ea', 'Galaxy S-series; OLED/AMOLED',              'Samsung', 'Phone');
  add('Screen Replacement — Foldable',            'Screen', 200, 'ea', 'High risk; price accordingly',              '', 'Phone');
  add('Glass-Only Replacement (LOCA method)',     'Screen', 80,  'ea', 'Skilled repair; lower cost than full screen','', 'Phone');

  // ── PHONE — BATTERY ───────────────────────────────────
  add('Battery Replacement — Standard Phone',     'Battery', 45, 'ea', 'Older models, easy adhesive',               '', 'Phone');
  add('Battery Replacement — Sealed Mid-Range',   'Battery', 60, 'ea', 'Most modern Androids',                      '', 'Phone');
  add('Battery Replacement — iPhone',             'Battery', 65, 'ea', 'iPhone 11–14',                              'Apple', 'Phone');
  add('Battery Replacement — iPhone Pro',         'Battery', 80, 'ea', 'Pro models; tight adhesive',               'Apple', 'Phone');
  add('Battery Replacement — Samsung Galaxy S',   'Battery', 70, 'ea', 'Flagship sealed design',                   'Samsung', 'Phone');

  // ── PHONE — PORTS, CAMERAS & MISC ─────────────────────
  add('Charge Port Cleaning',                     'Service', 35, 'flat','Quick job — minimum charge',               '', 'Phone');
  add('Charge Port Replacement',                  'Labor',   65, 'flat','Solder or connector swap',                 '', 'Phone');
  add('Speaker Replacement',                      'Labor',   55, 'flat','Earpiece or loudspeaker',                  '', 'Phone');
  add('Microphone Repair',                        'Labor',   55, 'flat','Often combined with port repair',          '', 'Phone');
  add('Rear Camera Replacement',                  'Labor',   80, 'ea', 'Labor; module cost extra',                  '', 'Phone');
  add('Front Camera Replacement',                 'Labor',   70, 'ea', 'Labor; module cost extra',                  '', 'Phone');
  add('Back Glass Replacement',                   'Labor',   70, 'ea', 'Adhesive and heat required',                '', 'Phone');
  add('SIM Tray / Button Repair',                 'Labor',   40, 'flat','Minimum charge applies',                   '', 'Phone');

  // ── PHONE — ADVANCED ──────────────────────────────────
  add('Water Damage Treatment — Phone',           'Service', 100, 'flat','Ultrasonic clean; no recovery guaranteed', '', 'Phone');
  add('Data Recovery — Phone (logical)',          'Service', 150, 'flat','Accessible device, software issue',        '', 'Phone');
  add('Data Recovery — Phone (physical)',         'Service', 300, 'flat','Board-level; specialist required',         '', 'Phone');
  add('Motherboard / Board-Level Repair',         'Labor',   175, 'flat','Micro-soldering; high skill level',        '', 'Phone');
}


// Kiosk/display account support
try { db.exec(`ALTER TABLE users ADD COLUMN is_kiosk INTEGER DEFAULT 0`); } catch(e) {}


try { db.exec(`ALTER TABLE google_tokens ADD COLUMN email TEXT DEFAULT ''`); } catch(e) {}


try { db.exec(`ALTER TABLE appointments ADD COLUMN google_event_id TEXT DEFAULT ''`); } catch(e) {}


try { db.exec(`ALTER TABLE google_tokens ADD COLUMN drive_folder_id TEXT DEFAULT ''`); } catch(e) {}


// ── v10.1 price book migration: load full catalog into existing installs ──
{
  const { v4: uuidv4 } = require('uuid');
  const fullCatalog = [
    // Labor
    ['Standard Bench Labor','Labor','','','In-shop hourly rate',0,85,'hr'],
    ['Onsite / House Call Labor','Labor','','','Remote / onsite hourly rate — add travel fee',0,125,'hr'],
    ['Diagnostic Fee — PC/Laptop','Labor','','','Bench diagnostic; credited toward repair',0,75,'flat'],
    ['Diagnostic Fee — Phone','Labor','','','Usually waived if repair proceeds',0,25,'flat'],
    ['Minimum Charge (under 15 min)','Labor','','','Quick jobs: SIM tray, port cleaning, etc.',0,35,'flat'],
    ['Expedited / Same-Day Surcharge','Labor','','','Add to base repair price',0,50,'flat'],
    // PC/Laptop — Software
    ['Virus / Malware Removal','Service','','Desktop,Laptop','Flat rate; severe cases may be higher',0,90,'flat'],
    ['OS Reinstall — Windows','Service','','Desktop,Laptop','Clean install without data transfer',0,110,'flat'],
    ['OS Reinstall — macOS','Service','Apple','Laptop','Clean install without data transfer',0,120,'flat'],
    ['OS Reinstall + Data Migration','Service','','Desktop,Laptop','Reinstall and transfer user data',0,175,'flat'],
    ['Driver Install / Software Setup','Service','','Desktop,Laptop','Per session',0,50,'flat'],
    ['General Tune-Up / Cleanup','Service','','Desktop,Laptop','Software cleanup and startup optimization',0,75,'flat'],
    ['Password Reset / Account Recovery','Service','','Desktop,Laptop','Local OS or BIOS password',0,45,'flat'],
    ['Network Setup / Troubleshooting','Service','','Desktop,Laptop','Wi-Fi, ethernet, printer setup',0,100,'flat'],
    ['Remote Support Session','Service','','Desktop,Laptop','No travel — lower rate',0,60,'flat'],
    // PC/Laptop — Storage
    ['RAM Upgrade (labor)','Labor','','Desktop,Laptop','Parts billed separately',0,30,'flat'],
    ['HDD to SSD Upgrade (labor)','Labor','','Desktop,Laptop','Cloning or clean install',0,80,'flat'],
    ['Hard Drive Replacement + OS','Labor','','Desktop,Laptop','Labor only; drive cost extra',0,110,'flat'],
    ['HDD + OS + Data Transfer','Labor','','Desktop,Laptop','Full service — parts extra',0,150,'flat'],
    ['Data Recovery — Minor','Service','','Desktop,Laptop','Accessible drive, logical failure',0,150,'flat'],
    ['Data Recovery — Severe','Service','','Desktop,Laptop','Failed drive, physical damage',0,300,'flat'],
    // PC/Laptop — Hardware
    ['Desktop Power Supply Swap','Labor','','Desktop','Labor only; PSU cost extra',0,50,'flat'],
    ['Desktop GPU Replacement','Labor','','Desktop','Labor only; card cost extra',0,50,'flat'],
    ['Desktop CPU / Motherboard Swap','Labor','','Desktop','Labor only; parts extra',0,100,'flat'],
    ['Laptop Screen Replacement','Labor','','Laptop','Labor only; screen varies by model',0,140,'flat'],
    ['Laptop Screen Replacement — Apple','Labor','Apple','Laptop','Labor only; MacBook screens pricier',0,180,'flat'],
    ['Laptop Battery Replacement','Labor','','Laptop','Standard laptops; parts extra',0,65,'flat'],
    ['Laptop Battery — MacBook','Labor','Apple','Laptop','More difficult; adhesive removal',0,85,'flat'],
    ['Laptop Keyboard Replacement','Labor','','Laptop','Labor only; keyboard cost extra',0,80,'flat'],
    ['Laptop Motherboard Replacement','Labor','','Laptop','High skill; board cost extra',0,160,'flat'],
    ['Laptop Charging Port Repair','Labor','','Laptop','Solder or connector swap',0,75,'flat'],
    ['Laptop Fan / Thermal Paste Service','Labor','','Laptop','Cleaning + repaste — prevents overheating',0,65,'flat'],
    ['Liquid Damage Treatment — Laptop','Service','','Laptop','Ultrasonic clean; no recovery guaranteed',0,150,'flat'],
    ['Liquid Damage Treatment — Desktop','Service','','Desktop','Cleaning; component replacement extra',0,100,'flat'],
    // Phone — Screens
    ['Screen Replacement — Budget/LCD Phone','Screen','','Phone','Budget Android, older iPhones',0,60,'ea'],
    ['Screen Replacement — Mid-Range Android','Screen','','Phone','Galaxy A-series, Pixel A-series',0,90,'ea'],
    ['Screen Replacement — iPhone (standard)','Screen','Apple','Phone','iPhone 11–13 standard',0,130,'ea'],
    ['Screen Replacement — iPhone Pro / OLED','Screen','Apple','Phone','iPhone 13/14/15 Pro; OLED premium',0,160,'ea'],
    ['Screen Replacement — Samsung Flagship','Screen','Samsung','Phone','Galaxy S-series; OLED/AMOLED',0,150,'ea'],
    ['Screen Replacement — Foldable','Screen','','Phone','High risk; price accordingly',0,200,'ea'],
    ['Glass-Only Replacement (LOCA method)','Screen','','Phone','Skilled repair; lower cost than full screen',0,80,'ea'],
    // Phone — Battery
    ['Battery Replacement — Standard Phone','Battery','','Phone','Older models, easy adhesive',0,45,'ea'],
    ['Battery Replacement — Sealed Mid-Range','Battery','','Phone','Most modern Androids',0,60,'ea'],
    ['Battery Replacement — iPhone','Battery','Apple','Phone','iPhone 11–14',0,65,'ea'],
    ['Battery Replacement — iPhone Pro','Battery','Apple','Phone','Pro models; tight adhesive',0,80,'ea'],
    ['Battery Replacement — Samsung Galaxy S','Battery','Samsung','Phone','Flagship sealed design',0,70,'ea'],
    // Phone — Ports & Misc
    ['Charge Port Cleaning','Service','','Phone','Quick job — minimum charge',0,35,'flat'],
    ['Charge Port Replacement','Labor','','Phone','Solder or connector swap',0,65,'flat'],
    ['Speaker Replacement','Labor','','Phone','Earpiece or loudspeaker',0,55,'flat'],
    ['Microphone Repair','Labor','','Phone','Often combined with port repair',0,55,'flat'],
    ['Rear Camera Replacement','Labor','','Phone','Labor; module cost extra',0,80,'ea'],
    ['Front Camera Replacement','Labor','','Phone','Labor; module cost extra',0,70,'ea'],
    ['Back Glass Replacement','Labor','','Phone','Adhesive and heat required',0,70,'ea'],
    ['SIM Tray / Button Repair','Labor','','Phone','Minimum charge applies',0,40,'flat'],
    // Phone — Advanced
    ['Water Damage Treatment — Phone','Service','','Phone','Ultrasonic clean; no recovery guaranteed',0,100,'flat'],
    ['Data Recovery — Phone (logical)','Service','','Phone','Accessible device, software issue',0,150,'flat'],
    ['Data Recovery — Phone (physical)','Service','','Phone','Board-level; specialist required',0,300,'flat'],
    ['Motherboard / Board-Level Repair','Labor','','Phone','Micro-soldering; high skill level',0,175,'flat'],
  ];
  const insertPB = db.prepare("INSERT OR IGNORE INTO price_book (id,name,category,manufacturer,device_type,description,cost_price,sell_price,unit) VALUES (?,?,?,?,?,?,?,?,?)");
  // Use name as natural unique key - only insert if name doesn't already exist
  const existingNames = new Set(db.prepare("SELECT name FROM price_book").all().map(r => r.name));
  fullCatalog.forEach(([name,cat,mfr,dtype,desc,cost,sell,unit]) => {
    if (!existingNames.has(name)) {
      insertPB.run(uuidv4(), name, cat, mfr, dtype, desc, cost, sell, unit);
    }
  });
}

// ── NEW FEATURES MIGRATIONS ──────────────────────────────────────
try { db.exec(`ALTER TABLE settings ADD COLUMN ui_scale TEXT DEFAULT '1.0'`); } catch(e) {}
try { db.exec(`ALTER TABLE settings ADD COLUMN donation_link TEXT DEFAULT ''`); } catch(e) {}
try { db.exec(`ALTER TABLE settings ADD COLUMN support_email TEXT DEFAULT ''`); } catch(e) {}
try { db.exec(`ALTER TABLE settings ADD COLUMN email_provider TEXT DEFAULT 'resend'`); } catch(e) {}
try { db.exec(`ALTER TABLE settings ADD COLUMN email_api_key TEXT DEFAULT ''`); } catch(e) {}
try { db.exec(`ALTER TABLE settings ADD COLUMN ai_mode TEXT DEFAULT 'offline'`); } catch(e) {}
try { db.exec(`ALTER TABLE settings ADD COLUMN ai_cloud_provider TEXT DEFAULT 'openai'`); } catch(e) {}
try { db.exec(`ALTER TABLE settings ADD COLUMN ai_cloud_key TEXT DEFAULT ''`); } catch(e) {}
try { db.exec(`ALTER TABLE settings ADD COLUMN ai_search_provider TEXT DEFAULT 'serper'`); } catch(e) {}
try { db.exec(`ALTER TABLE settings ADD COLUMN ai_search_key TEXT DEFAULT ''`); } catch(e) {}
try { db.exec(`ALTER TABLE settings ADD COLUMN ai_auto_research INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE settings ADD COLUMN ollama_model TEXT DEFAULT 'llama3.2'`); } catch(e) {}
try { db.exec(`ALTER TABLE settings ADD COLUMN ollama_url TEXT DEFAULT ''`); } catch(e) {}
try { db.exec(`ALTER TABLE settings ADD COLUMN jwt_secret TEXT DEFAULT ''`); } catch(e) {}
try { db.exec(`ALTER TABLE settings ADD COLUMN device_types TEXT DEFAULT '["Phone","Laptop","Desktop","Tablets","Printer","Server","Network Device","Monitor","Other"]'`); } catch(e) {}
try { db.exec(`ALTER TABLE repairs ADD COLUMN is_active_kiosk INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE repair_guides ADD COLUMN deleted_at DATETIME`); } catch(e) {}

db.exec(`CREATE TABLE IF NOT EXISTS repair_guides (
  id TEXT PRIMARY KEY,
  device_brand TEXT,
  device_model TEXT,
  issue TEXT,
  guide_content TEXT NOT NULL,
  source_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.exec(`CREATE TABLE IF NOT EXISTS communications (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  repair_id TEXT REFERENCES repairs(id),
  type TEXT DEFAULT 'email',
  direction TEXT DEFAULT 'outbound',
  subject TEXT DEFAULT '',
  body TEXT NOT NULL,
  sender TEXT DEFAULT '',
  recipient TEXT DEFAULT '',
  status TEXT DEFAULT 'sent',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

module.exports = db;
