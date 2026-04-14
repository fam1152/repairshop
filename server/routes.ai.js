const router = require('express').Router();
const https = require('https');
const http = require('http');
const db = require('./db');
const auth = require('./auth.middleware');

router.use(auth);

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://ollama:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

// ── Core Ollama fetch helper ──
// Streams or returns a full response from Ollama
function ollamaGenerate(prompt, systemPrompt, stream = false) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      system: systemPrompt,
      stream: false,
      options: {
        temperature: 0.4,
        num_predict: 600,
      }
    });

    const url = new URL(`${OLLAMA_URL}/api/generate`);
    const lib = url.protocol === 'https:' ? https : http;

    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.response || '');
        } catch(e) {
          reject(new Error('Invalid response from Ollama'));
        }
      });
    });

    req.on('error', err => reject(new Error(`Cannot reach Ollama: ${err.message}. Is it running?`)));
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Ollama request timed out after 2 minutes')); });
    req.write(body);
    req.end();
  });
}

// ── Status check ──
router.get('/status', async (req, res) => {
  try {
    const url = new URL(`${OLLAMA_URL}/api/tags`);
    const lib = url.protocol === 'https:' ? https : http;

    const models = await new Promise((resolve, reject) => {
      const r = lib.get(`${OLLAMA_URL}/api/tags`, resp => {
        let d = '';
        resp.on('data', c => d += c);
        resp.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
      });
      r.on('error', reject);
      r.setTimeout(5000, () => { r.destroy(); reject(new Error('timeout')); });
    });

    const modelList = (models.models || []).map(m => m.name);
    const modelReady = modelList.some(m => m.includes(OLLAMA_MODEL.split(':')[0]));

    res.json({
      online: true,
      model: OLLAMA_MODEL,
      model_ready: modelReady,
      available_models: modelList,
      ollama_url: OLLAMA_URL,
    });
  } catch(e) {
    res.json({ online: false, model: OLLAMA_MODEL, error: e.message });
  }
});

// ── RAM / memory stats ──
// Reads system memory from /proc/meminfo (Linux) and tries to get
// Ollama process memory via the Docker socket
router.get('/ram-stats', async (req, res) => {
  const fs = require('fs');
  const stats = {
    system_total_mb: 0,
    system_used_mb: 0,
    system_free_mb: 0,
    system_available_mb: 0,
    system_percent: 0,
    ollama_rss_mb: 0,
    ollama_container_mb: 0,
    node_heap_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    source: 'unavailable',
  };

  // 1. Read /proc/meminfo for system RAM
  try {
    const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
    const get = key => {
      const m = meminfo.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'));
      return m ? parseInt(m[1]) * 1024 : 0; // kB → bytes
    };
    const total = get('MemTotal');
    const free = get('MemFree');
    const available = get('MemAvailable');
    const buffers = get('Buffers');
    const cached = get('Cached');
    const used = total - available;

    stats.system_total_mb = Math.round(total / 1024 / 1024);
    stats.system_free_mb = Math.round(free / 1024 / 1024);
    stats.system_available_mb = Math.round(available / 1024 / 1024);
    stats.system_used_mb = Math.round(used / 1024 / 1024);
    stats.system_percent = total > 0 ? Math.round((used / total) * 100) : 0;
    stats.source = 'proc';
  } catch(e) {
    // /proc/meminfo not available (non-Linux or container without it)
    stats.source = 'unavailable';
  }

  // 2. Try to get Ollama container memory via Docker socket
  try {
    if (fs.existsSync('/var/run/docker.sock')) {
      const Docker = require('dockerode');
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });
      const containers = await docker.listContainers();
      const ollamaContainer = containers.find(c =>
        c.Names.some(n => n.includes('ollama')) || c.Image.includes('ollama')
      );

      if (ollamaContainer) {
        const container = docker.getContainer(ollamaContainer.Id);
        const containerStats = await new Promise((resolve, reject) => {
          container.stats({ stream: false }, (err, data) => {
            if (err) reject(err);
            else resolve(data);
          });
        });

        if (containerStats?.memory_stats) {
          const mem = containerStats.memory_stats;
          // usage - cache gives actual working set
          const cache = mem.stats?.cache || mem.stats?.inactive_file || 0;
          const workingSet = (mem.usage || 0) - cache;
          stats.ollama_container_mb = Math.round(workingSet / 1024 / 1024);
          stats.ollama_rss_mb = Math.round((mem.usage || 0) / 1024 / 1024);
          stats.ollama_container_id = ollamaContainer.Id.slice(0, 12);
          stats.ollama_container_name = ollamaContainer.Names[0]?.replace('/', '') || 'ollama';
          if (mem.limit && mem.limit < stats.system_total_mb * 1024 * 1024 * 2) {
            stats.ollama_limit_mb = Math.round(mem.limit / 1024 / 1024);
          }
        }
      }
    }
  } catch(e) {
    stats.ollama_error = e.message;
  }

  res.json(stats);
});

// ── Pull a model ──
router.post('/pull-model', async (req, res) => {
  const { model } = req.body;
  const modelName = model || OLLAMA_MODEL;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const url = new URL(`${OLLAMA_URL}/api/pull`);
    const lib = url.protocol === 'https:' ? https : http;
    const body = JSON.stringify({ name: modelName, stream: true });

    const pullReq = lib.request({
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, pullRes => {
      pullRes.on('data', chunk => {
        try {
          const lines = chunk.toString().split('\n').filter(Boolean);
          lines.forEach(line => {
            const data = JSON.parse(line);
            res.write(`data: ${JSON.stringify(data)}\n\n`);
          });
        } catch(e) {}
      });
      pullRes.on('end', () => {
        res.write(`data: ${JSON.stringify({ status: 'success' })}\n\n`);
        res.end();
      });
    });
    pullReq.on('error', err => {
      res.write(`data: ${JSON.stringify({ status: 'error', error: err.message })}\n\n`);
      res.end();
    });
    pullReq.write(body);
    pullReq.end();
  } catch(e) {
    res.write(`data: ${JSON.stringify({ status: 'error', error: e.message })}\n\n`);
    res.end();
  }
});

// ── 1. REPAIR DIAGNOSIS ──
router.post('/diagnose', async (req, res) => {
  const { device_type, device_brand, device_model, symptoms, existing_notes } = req.body;
  if (!symptoms) return res.status(400).json({ error: 'symptoms required' });

  // Pull relevant inventory for context
  const parts = db.prepare('SELECT name, sku, quantity, category FROM inventory WHERE quantity > 0 ORDER BY category, name').all();
  const partsContext = parts.length > 0
    ? `Available parts in inventory:\n${parts.map(p => `- ${p.name}${p.sku ? ` (${p.sku})` : ''} — ${p.quantity} in stock`).join('\n')}`
    : 'No inventory data available.';

  const system = `You are an expert IT repair technician assistant. You help diagnose computer and device issues and suggest repair steps. Be concise and practical. Format your response with clear sections.`;

  const prompt = `Device: ${[device_type, device_brand, device_model].filter(Boolean).join(' ') || 'Unknown device'}
Reported symptoms: ${symptoms}
${existing_notes ? `Existing notes: ${existing_notes}` : ''}

${partsContext}

Please provide:
1. LIKELY CAUSES (top 3, most likely first)
2. RECOMMENDED DIAGNOSTIC STEPS (numbered, in order)
3. PROBABLE REPAIR STEPS (once diagnosed)
4. PARTS THAT MAY BE NEEDED (reference inventory above if applicable)
5. ESTIMATED TIME (rough estimate)

Keep it practical and direct.`;

  try {
    const response = await ollamaGenerate(prompt, system);
    res.json({ result: response, model: OLLAMA_MODEL });
  } catch(e) {
    res.status(503).json({ error: e.message });
  }
});

// ── 2. FORMAT REPAIR NOTES ──
router.post('/format-notes', async (req, res) => {
  const { raw_notes, device_type, repair_title } = req.body;
  if (!raw_notes) return res.status(400).json({ error: 'raw_notes required' });

  const system = `You are a professional IT repair shop assistant. Your job is to reformat rough technician notes into clean, professional repair documentation. Keep all the facts but improve clarity, grammar, and structure. Use professional but plain language — no jargon overload.`;

  const prompt = `Repair: ${repair_title || 'IT Repair'}
Device: ${device_type || 'Device'}

Raw technician notes to reformat:
"${raw_notes}"

Please reformat these into clean professional repair notes. Include:
- What was found/diagnosed
- What was done (steps taken)
- Parts used (if mentioned)
- Current status / outcome

Keep it factual and concise. Write in past tense. Do not add information that wasn't in the original notes.`;

  try {
    const response = await ollamaGenerate(prompt, system);
    res.json({ result: response, model: OLLAMA_MODEL });
  } catch(e) {
    res.status(503).json({ error: e.message });
  }
});

// ── 3. CUSTOMER MESSAGE DRAFT ──
router.post('/customer-message', async (req, res) => {
  const { repair_id, message_type } = req.body;
  if (!repair_id) return res.status(400).json({ error: 'repair_id required' });

  const repair = db.prepare(`SELECT r.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
    FROM repairs r JOIN customers c ON r.customer_id=c.id WHERE r.id=?`).get(repair_id);
  if (!repair) return res.status(404).json({ error: 'Repair not found' });

  const settings = db.prepare('SELECT company_name, phone FROM settings WHERE id=1').get();

  const statusMessages = {
    intake: 'we have received their device and will begin diagnostics soon',
    diagnosing: 'we are currently diagnosing their device',
    waiting_parts: 'we have diagnosed the issue and are waiting for parts to arrive',
    in_repair: 'we are currently working on their repair',
    ready: 'their device is repaired and ready for pickup',
    completed: 'their repair has been completed',
    cancelled: 'their repair has been cancelled',
  };

  const system = `You are a friendly, professional customer service assistant for an IT repair shop. Write short, clear messages that are warm but not overly casual. Keep messages under 100 words unless it's an explanation message.`;

  const type = message_type || 'status_update';
  const typeInstructions = {
    status_update: 'Write a brief status update SMS/text message',
    ready_pickup: 'Write a pickup notification message — device is ready',
    follow_up: 'Write a friendly follow-up message checking if everything is working well after the repair',
    estimate_approval: 'Write a message asking the customer to approve the repair estimate before we proceed',
    delay_notice: 'Write a polite message explaining there is a short delay with their repair',
  };

  const prompt = `Shop name: ${settings?.company_name || 'Our Shop'}
Shop phone: ${settings?.phone || ''}
Customer name: ${repair.customer_name}
Device: ${[repair.device_brand, repair.device_model].filter(Boolean).join(' ') || repair.device_type || 'their device'}
Repair title: ${repair.title}
Current status: ${repair.status} (meaning ${statusMessages[repair.status] || repair.status})
${repair.repair_notes ? `Tech notes summary: ${repair.repair_notes.slice(0, 200)}` : ''}

Task: ${typeInstructions[type] || typeInstructions.status_update}

Write the message only — no subject line, no explanation, just the message text ready to send.`;

  try {
    const response = await ollamaGenerate(prompt, system);
    res.json({ result: response.trim(), model: OLLAMA_MODEL, customer_name: repair.customer_name, customer_phone: repair.customer_phone, customer_email: repair.customer_email });
  } catch(e) {
    res.status(503).json({ error: e.message });
  }
});

// ── 4. INVENTORY REORDER SUGGESTIONS ──
router.post('/reorder-suggestions', async (req, res) => {
  // Get inventory with transaction history
  const items = db.prepare('SELECT * FROM inventory ORDER BY category, name').all();

  if (items.length === 0) return res.json({ result: 'No inventory items found. Add parts to your inventory first.', model: OLLAMA_MODEL });

  // Get usage in last 30 and 90 days
  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const ninetyDaysAgo = new Date(); ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const usageMap = {};
  items.forEach(item => {
    const used30 = db.prepare(`SELECT COALESCE(SUM(ABS(quantity_change)),0) as total FROM inventory_transactions
      WHERE inventory_id=? AND type='remove' AND created_at >= ?`).get(item.id, thirtyDaysAgo.toISOString()).total;
    const used90 = db.prepare(`SELECT COALESCE(SUM(ABS(quantity_change)),0) as total FROM inventory_transactions
      WHERE inventory_id=? AND type='remove' AND created_at >= ?`).get(item.id, ninetyDaysAgo.toISOString()).total;
    usageMap[item.id] = { used30, used90 };
  });

  const inventoryContext = items.map(item => {
    const u = usageMap[item.id];
    return `${item.name} | Stock: ${item.quantity} | Min: ${item.quantity_min} | Used (30d): ${u.used30} | Used (90d): ${u.used90} | Cost: $${item.unit_cost || 0}${item.supplier ? ` | Supplier: ${item.supplier}` : ''}`;
  }).join('\n');

  const system = `You are an inventory management expert for an IT repair shop. Analyze stock levels and usage patterns to give practical reorder recommendations.`;

  const prompt = `Current inventory for an IT repair shop:
Name | Current Stock | Min Level | Used Last 30 Days | Used Last 90 Days | Unit Cost | Supplier

${inventoryContext}

Today's date: ${new Date().toLocaleDateString()}

Please analyze this and provide:
1. URGENT REORDER (out of stock or critically low based on usage rate)
2. SOON TO REORDER (will run out within 2-3 weeks at current usage rate)
3. WELL STOCKED (no action needed)
4. SLOW MOVERS (high stock, very low usage — consider reducing order quantities)

For each reorder item, suggest a quantity to order based on usage patterns. Be practical and specific.`;

  try {
    const response = await ollamaGenerate(prompt, system);
    res.json({ result: response, model: OLLAMA_MODEL });
  } catch(e) {
    res.status(503).json({ error: e.message });
  }
});

// ── 5. BUSINESS INSIGHTS ──
router.post('/insights', async (req, res) => {
  const { period } = req.body; // 'week' | 'month' | 'year'
  const p = period || 'month';

  const now = new Date();
  let start;
  if (p === 'week') { start = new Date(now); start.setDate(start.getDate() - 7); }
  else if (p === 'month') { start = new Date(now.getFullYear(), now.getMonth(), 1); }
  else { start = new Date(now.getFullYear(), 0, 1); }

  const startStr = start.toISOString();

  // Gather all the stats
  const totalRepairs = db.prepare('SELECT COUNT(*) as c FROM repairs WHERE created_at >= ?').get(startStr).c;
  const completedRepairs = db.prepare("SELECT COUNT(*) as c FROM repairs WHERE status='completed' AND created_at >= ?").get(startStr).c;
  const revenue = db.prepare("SELECT COALESCE(SUM(total),0) as t FROM invoices WHERE status='paid' AND issued_date >= ?").get(startStr).t;
  const newCustomers = db.prepare('SELECT COUNT(*) as c FROM customers WHERE created_at >= ?').get(startStr).c;
  const openRepairs = db.prepare("SELECT COUNT(*) as c FROM repairs WHERE status NOT IN ('completed','cancelled')").get().c;
  const lowStock = db.prepare('SELECT COUNT(*) as c FROM inventory WHERE quantity <= quantity_min').get().c;
  const pendingReminders = db.prepare("SELECT COUNT(*) as c FROM reminders WHERE status='pending'").get().c;
  const pendingInvoices = db.prepare("SELECT COUNT(*) as c FROM invoices WHERE status IN ('draft','sent')").get().c;

  // Status breakdown
  const statuses = ['intake','diagnosing','waiting_parts','in_repair','ready'];
  const statusBreakdown = statuses.map(s => {
    const count = db.prepare('SELECT COUNT(*) as c FROM repairs WHERE status=?').get(s).c;
    return `${s.replace('_',' ')}: ${count}`;
  }).join(', ');

  // Most common device types
  const deviceTypes = db.prepare(`SELECT device_type, COUNT(*) as c FROM repairs WHERE created_at >= ? AND device_type != '' GROUP BY device_type ORDER BY c DESC LIMIT 5`).all(startStr);

  // Most common repair titles
  const commonRepairs = db.prepare(`SELECT title, COUNT(*) as c FROM repairs WHERE created_at >= ? GROUP BY title ORDER BY c DESC LIMIT 5`).all(startStr);

  // Previous period for comparison
  let prevStart;
  if (p === 'week') { prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - 7); }
  else if (p === 'month') { prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1); }
  else { prevStart = new Date(now.getFullYear() - 1, 0, 1); }

  const prevRepairs = db.prepare('SELECT COUNT(*) as c FROM repairs WHERE created_at >= ? AND created_at < ?').get(prevStart.toISOString(), startStr).c;
  const prevRevenue = db.prepare("SELECT COALESCE(SUM(total),0) as t FROM invoices WHERE status='paid' AND issued_date >= ? AND issued_date < ?").get(prevStart.toISOString(), startStr).t;

  const system = `You are a business analyst for a small IT repair shop. Provide clear, actionable insights in plain English. Be encouraging but honest. Focus on what matters most to a small business owner. Keep it to 3-4 paragraphs max.`;

  const prompt = `IT Repair Shop — ${p === 'week' ? 'Last 7 Days' : p === 'month' ? 'This Month' : 'This Year'} Business Summary

PERFORMANCE:
- New repairs: ${totalRepairs} (vs ${prevRepairs} previous ${p})
- Completed repairs: ${completedRepairs}
- Revenue collected: $${revenue.toFixed(2)} (vs $${prevRevenue.toFixed(2)} previous ${p})
- New customers: ${newCustomers}

CURRENT STATUS:
- Open repairs: ${openRepairs} (breakdown: ${statusBreakdown})
- Pending invoices: ${pendingInvoices}
- Pending reminders: ${pendingReminders}
- Low/out of stock parts: ${lowStock}

TOP DEVICE TYPES THIS PERIOD:
${deviceTypes.map(d => `- ${d.device_type}: ${d.c} repairs`).join('\n') || '- No data yet'}

TOP REPAIR TYPES THIS PERIOD:
${commonRepairs.map(r => `- ${r.title}: ${r.c} times`).join('\n') || '- No data yet'}

Please write a brief business summary with:
1. How the period went overall (growth/decline vs previous period)
2. What's working well
3. What needs attention (open repairs, low stock, pending items)
4. One practical suggestion based on the data

Write it like you're briefing the shop owner directly. Use plain English, no bullet points in your response — write in paragraphs.`;

  try {
    const response = await ollamaGenerate(prompt, system);
    res.json({ result: response, model: OLLAMA_MODEL, stats: { totalRepairs, completedRepairs, revenue, newCustomers, openRepairs, lowStock } });
  } catch(e) {
    res.status(503).json({ error: e.message });
  }
});

module.exports = router;

// ── USER PREFERENCES (per-user settings including dark mode) ──
router.get('/prefs', (req, res) => {
  try {
    let prefs = db.prepare('SELECT * FROM user_preferences WHERE user_id=?').get(req.user.id);
    if (!prefs) {
      const globalSettings = db.prepare('SELECT dark_mode FROM settings WHERE id=1').get();
      return res.json({ user_id: req.user.id, dark_mode: globalSettings?.dark_mode || 0, preferences: {} });
    }
    let parsed = {};
    try { parsed = JSON.parse(prefs.preferences || '{}'); } catch(e) {}
    res.json({ ...prefs, preferences: parsed });
  } catch(e) {
    res.json({ user_id: req.user.id, dark_mode: 0, preferences: {} });
  }
});

router.put('/prefs', (req, res) => {
  try {
    const { v4: uuidv4 } = require('uuid');
    const { dark_mode, preferences } = req.body;
    const prefsStr = JSON.stringify(preferences || {});
    const darkVal = dark_mode ? 1 : 0;
    const existing = db.prepare('SELECT id FROM user_preferences WHERE user_id=?').get(req.user.id);
    if (existing) {
      db.prepare('UPDATE user_preferences SET dark_mode=?, preferences=? WHERE user_id=?')
        .run(darkVal, prefsStr, req.user.id);
    } else {
      db.prepare('INSERT INTO user_preferences (id, user_id, dark_mode, preferences) VALUES (?,?,?,?)')
        .run(uuidv4(), req.user.id, darkVal, prefsStr);
    }
    res.json({ ok: true, dark_mode: darkVal });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── AI MODEL TRAINING DATA ──
// Save custom training examples for fine-tuning context
router.get('/training', (req, res) => {
  try {
    const path = require('path');
    const fs = require('fs');
    const trainPath = path.join(process.env.UPLOADS_PATH || '/data/uploads', 'ai-training.json');
    if (fs.existsSync(trainPath)) {
      return res.json(JSON.parse(fs.readFileSync(trainPath, 'utf8')));
    }
  } catch(e) {}
  res.json({ examples: [], system_context: '', last_updated: null });
});

router.post('/training', (req, res) => {
  const { examples, system_context } = req.body;
  const path = require('path');
  const fs = require('fs');
  const uploadsPath = process.env.UPLOADS_PATH || '/data/uploads';
  if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
  const trainPath = path.join(uploadsPath, 'ai-training.json');
  const data = { examples: examples || [], system_context: system_context || '', last_updated: new Date().toISOString() };
  fs.writeFileSync(trainPath, JSON.stringify(data, null, 2));
  res.json({ ok: true, examples_count: (examples || []).length });
});

// ── CHECK FOR OLLAMA UPDATES ──
router.get('/model-updates', async (req, res) => {
  const https = require('https');
  const http = require('http');
  const OLLAMA_URL = process.env.OLLAMA_URL || 'http://ollama:11434';
  const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

  try {
    // Get currently installed model info
    const url = new URL(`${OLLAMA_URL}/api/tags`);
    const lib = url.protocol === 'https:' ? https : http;

    const localModels = await new Promise((resolve, reject) => {
      const r = lib.get(`${OLLAMA_URL}/api/tags`, resp => {
        let d = ''; resp.on('data', c => d += c);
        resp.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
      });
      r.on('error', reject);
      r.setTimeout(5000, () => { r.destroy(); reject(new Error('timeout')); });
    });

    const installed = (localModels.models || []).map(m => ({
      name: m.name,
      size: m.size,
      modified_at: m.modified_at,
      digest: m.digest?.slice(0, 12)
    }));

    res.json({
      installed,
      current_model: OLLAMA_MODEL,
      ollama_online: true,
      message: 'Pull a model to get the latest version. Ollama always pulls the newest digest when you pull a model tag.',
    });
  } catch(e) {
    res.json({ installed: [], ollama_online: false, error: e.message });
  }
});

// ── START/STOP OLLAMA MODEL (load into memory) ──
router.post('/model-action', async (req, res) => {
  const { action, model } = req.body;
  const https = require('https');
  const http = require('http');
  const OLLAMA_URL = process.env.OLLAMA_URL || 'http://ollama:11434';
  const modelName = model || process.env.OLLAMA_MODEL || 'llama3.2';

  if (action === 'start') {
    // Load model into memory by sending a keep-alive request
    try {
      const body = JSON.stringify({ model: modelName, keep_alive: '10m', prompt: 'Hello', stream: false });
      const url = new URL(`${OLLAMA_URL}/api/generate`);
      const lib = url.protocol === 'https:' ? https : http;

      res.json({ ok: true, message: `Loading ${modelName} into memory…` });

      // Fire and forget
      const r = lib.request({ hostname: url.hostname, port: url.port || 80, path: url.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, resp => {
        resp.resume(); // drain
      });
      r.on('error', () => {});
      r.setTimeout(120000, () => r.destroy());
      r.write(body);
      r.end();
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  } else if (action === 'unload') {
    try {
      const body = JSON.stringify({ model: modelName, keep_alive: 0 });
      const url = new URL(`${OLLAMA_URL}/api/generate`);
      const lib = url.protocol === 'https:' ? https : http;
      const r = lib.request({ hostname: url.hostname, port: url.port || 80, path: url.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, resp => { resp.resume(); });
      r.on('error', () => {});
      r.write(body);
      r.end();
      res.json({ ok: true, message: `${modelName} unloaded from memory` });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  } else {
    res.status(400).json({ error: 'action must be start or unload' });
  }
});

// ── DELETE a model from Ollama ──
router.delete('/models/:modelName', async (req, res) => {
  const model = decodeURIComponent(req.params.modelName);
  const OLLAMA_URL = process.env.OLLAMA_URL || 'http://ollama:11434';
  const http = require('http'); const https = require('https');
  try {
    const body = JSON.stringify({ name: model });
    const url = new URL(`${OLLAMA_URL}/api/delete`);
    const lib = url.protocol === 'https:' ? https : http;
    await new Promise((resolve, reject) => {
      const r = lib.request({ hostname: url.hostname, port: url.port || 80, path: url.pathname, method: 'DELETE', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, resp => { resp.resume(); resolve(); });
      r.on('error', reject); r.write(body); r.end();
    });
    res.json({ ok: true, deleted: model });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── SET active model (updates env + persists to settings) ──
router.post('/set-model', (req, res) => {
  const { model } = req.body;
  if (!model) return res.status(400).json({ error: 'model required' });
  // Store in settings table for persistence across restarts
  try {
    const db = require('./db');
    db.prepare("UPDATE settings SET value=? WHERE key='ollama_model'").run(model);
  } catch(e) {}
  // Update in-process env
  process.env.OLLAMA_MODEL = model;
  res.json({ ok: true, model });
});
