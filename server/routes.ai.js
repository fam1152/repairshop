const router = require('express').Router();
const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const auth = require('./auth.middleware');
const multer = require('multer');
const pdf = require('pdf-parse');
const Tesseract = require('tesseract.js');
const { v4: uuidv4 } = require('uuid');
const upload = multer({ limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB limit

router.use(auth);

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://ollama:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

// ── Helper: Get Shop and Training Context ──
async function getAIContext() {
  const settings = db.prepare('SELECT company_name, phone, device_types FROM settings WHERE id=1').get();
  const manufacturers = db.prepare('SELECT name, device_types FROM manufacturers WHERE active=1').all();
  let training = { system_context: '', examples: [] };
  try {
    const trainPath = path.join(process.env.UPLOADS_PATH || path.join(__dirname, '../data/uploads'), 'ai-training.json');
    if (fs.existsSync(trainPath)) {
      training = JSON.parse(fs.readFileSync(trainPath, 'utf8'));
    }
  } catch(e) {}

  let context = `Shop Name: ${settings?.company_name || 'Our IT Shop'}\n`;
  if (settings?.phone) context += `Shop Phone: ${settings.phone}\n`;
  if (training.system_context) context += `\nAdditional Context:\n${training.system_context}\n`;
  
  // ── Load Technical Knowledge Base ──
  try {
    const kbPath = path.join(process.env.UPLOADS_PATH || path.join(__dirname, '../data/uploads'), 'knowledge-base');
    if (!fs.existsSync(kbPath)) fs.mkdirSync(kbPath, { recursive: true });
    const kbFiles = fs.readdirSync(kbPath).filter(f => f.endsWith('.txt') || f.endsWith('.learned'));
    if (kbFiles.length > 0) {
      context += `\nTechnical Knowledge Base (Manuals/Schematics):\n`;
      kbFiles.forEach(f => {
        const content = fs.readFileSync(path.join(kbPath, f), 'utf8');
        context += `--- Document: ${f} ---\n${content}\n`;
      });
    }
  } catch(e) { console.error('[AI] KB load error:', e); }

  if (training.examples && training.examples.length > 0) {
    context += `\nHere are some examples of how to respond:\n`;
    training.examples.forEach(ex => {
      context += `Q: ${ex.prompt}\nA: ${ex.response}\n`;
    });
  }

  return { 
    shop_name: settings?.company_name || 'Our IT Shop',
    training_context: context,
    system_context_only: training.system_context || '',
    settings, // Include full settings object
    shop_info: `Supported Manufacturers: ${manufacturers.map(m => `${m.name} (${JSON.parse(m.device_types || '[]').join(', ')})`).join('; ')}\nAvailable Device Types: ${settings?.device_types || '[]'}`
  };
}

// ── Web Search Helper (Serper.dev) ──
async function performWebSearch(query, apiKey) {
  if (!apiKey) return "No Search API key provided.";
  try {
    const res = await axios.post('https://google.serper.dev/search', { q: query, num: 4 }, {
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' }
    });
    const snippets = (res.data.organic || []).map(r => `Title: ${r.title}\nSource: ${r.link}\nSnippet: ${r.snippet}`).join('\n\n');
    return snippets || "No results found.";
  } catch (e) { return "Search failed: " + e.message; }
}

// ── Cloud AI Helper (OpenAI / Gemini) ──
async function cloudGenerate(prompt, systemPrompt, images = [], settings) {
  const { ai_cloud_provider, ai_cloud_key } = settings;
  if (!ai_cloud_key) throw new Error('Cloud API key missing in settings.');

  if (ai_cloud_provider === 'openai') {
    const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }];
    // Handle images if any
    if (images.length > 0) {
      messages[1].content = [
        { type: 'text', text: prompt },
        ...images.map(img => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img}` } }))
      ];
    }
    const res = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 1000,
    }, { headers: { 'Authorization': `Bearer ${ai_cloud_key}` } });
    return res.data.choices[0].message.content;
  } 
  else if (ai_cloud_provider === 'gemini') {
    // Basic Gemini implementation
    const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${ai_cloud_key}`, {
      contents: [{ role: 'user', parts: [{ text: systemPrompt + "\n\n" + prompt }] }]
    });
    return res.data.candidates[0].content.parts[0].text;
  }
  throw new Error('Unsupported cloud provider');
}

// ── Core Ollama fetch helper ──
async function ollamaGenerate(prompt, systemPrompt, images = []) {
  // We'll wrap this in a way that respects the mode
  const ctx = await getAIContext();
  const mode = ctx.settings?.ai_mode || 'offline';

  if (mode === 'cloud') {
    return cloudGenerate(prompt, systemPrompt, images, ctx.settings);
  }

  let finalSystem = systemPrompt;
  if (mode === 'hybrid') {
    const searchResults = await performWebSearch(prompt, ctx.settings?.ai_search_key);
    finalSystem += `\n\nWEB SEARCH RESULTS (Use these for up-to-date info):\n${searchResults}`;
  }

  return new Promise((resolve, reject) => {
    // Use vision model if images are provided
    const model = images.length > 0 ? 'llama3.2-vision' : OLLAMA_MODEL;
    const body = JSON.stringify({
      model,
      prompt,
      system: finalSystem,
      stream: false,
      images, // Array of base64 strings
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
    const currentModel = OLLAMA_MODEL;
    const modelReady = modelList.some(m => m === currentModel || m.split(':')[0] === currentModel.split(':')[0]);

    res.json({
      online: true,
      model: currentModel,
      model_ready: modelReady,
      available_models: modelList,
      ollama_url: OLLAMA_URL,
    });
  } catch(e) {
    res.json({ online: false, model: OLLAMA_MODEL, error: e.message });
  }
});

// ── Install Ollama ──
router.post('/install', async (req, res) => {
  const { exec } = require('child_process');
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Transfer-Encoding', 'chunked');
  const proc = exec('curl -fsSL https://ollama.com/install.sh | sh');
  proc.stdout.on('data', d => res.write(d));
  proc.stderr.on('data', d => res.write(d));
  proc.on('close', () => res.end());
});

// ── Pull a model ──
router.post('/pull-model', async (req, res) => {
  const { model } = req.body;
  const modelName = model || OLLAMA_MODEL;
  res.setHeader('Content-Type', 'text/event-stream');
  try {
    const url = new URL(`${OLLAMA_URL}/api/pull`);
    const lib = url.protocol === 'https:' ? https : http;
    const body = JSON.stringify({ name: modelName, stream: true });
    const pullReq = lib.request({ hostname: url.hostname, port: url.port || 80, path: url.pathname, method: 'POST', headers: { 'Content-Type': 'application/json' } }, pullRes => {
      pullRes.on('data', chunk => {
        const lines = chunk.toString().split('\n').filter(Boolean);
        lines.forEach(line => { try { const d = JSON.parse(line); res.write(`data: ${JSON.stringify(d)}\n\n`); } catch(e) {} });
      });
      pullRes.on('end', () => { res.write(`data: {"status":"success"}\n\n`); res.end(); });
    });
    pullReq.on('error', err => { res.write(`data: {"status":"error","error":"${err.message}"}\n\n`); res.end(); });
    pullReq.write(body); pullReq.end();
  } catch(e) { res.write(`data: {"status":"error","error":"${e.message}"}\n\n`); res.end(); }
});

// ── RAM / memory / GPU stats ──
router.get('/ram-stats', async (req, res) => {
  const fs = require('fs');
  const { execSync } = require('child_process');
  const stats = {
    system_total_mb: 0, system_used_mb: 0, system_available_mb: 0,
    node_heap_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    ollama_container_mb: 0, ollama_rss_mb: 0,
    gpu: null,
    storage: { guides_bytes: 0, models_bytes: 0, training_bytes: 0, count_guides: 0 }
  };

  // Basic System RAM
  try {
    const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
    const get = key => { const m = meminfo.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm')); return m ? parseInt(m[1]) * 1024 : 0; };
    const total = get('MemTotal'); const available = get('MemAvailable');
    stats.system_total_mb = Math.round(total / 1024 / 1024);
    stats.system_available_mb = Math.round(available / 1024 / 1024);
    stats.system_used_mb = stats.system_total_mb - stats.system_available_mb;
  } catch(e) {}

  // GPU Monitoring (Nvidia)
  try {
    const nvidia = execSync('nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu --format=csv,noheader,nounits', { encoding: 'utf8' });
    if (nvidia) {
      const p = nvidia.trim().split(', ');
      stats.gpu = { type: 'NVIDIA', name: p[0], used_mb: parseInt(p[1]), total_mb: parseInt(p[2]), load: p[3] + '%' };
    }
  } catch(e) {
    // Try AMD (ROCm)
    try {
      const amd = execSync('rocm-smi --showproductname --showmeminfo vram --showuse --json', { encoding: 'utf8' });
      const d = JSON.parse(amd);
      const card = Object.values(d)[0];
      if (card) {
        stats.gpu = { 
          type: 'AMD', name: card['Product Name'], 
          used_mb: Math.round(card['VRAM Total Memory (B)'] - card['VRAM Total Memory Available (B)'] / 1024 / 1024),
          total_mb: Math.round(card['VRAM Total Memory (B)'] / 1024 / 1024),
          load: card['GPU use (%)'] + '%'
        };
      }
    } catch(e2) {}
  }

  // Storage Stats
  try {
    const g = db.prepare('SELECT COUNT(*) as c, SUM(LENGTH(guide_content)) as s FROM repair_guides WHERE deleted_at IS NULL').get();
    stats.storage.count_guides = g.c || 0;
    stats.storage.guides_bytes = g.s || 0;

    const trainPath = path.join(process.env.UPLOADS_PATH || path.join(__dirname, '../data/uploads'), 'ai-training.json');
    if (fs.existsSync(trainPath)) stats.storage.training_bytes = fs.statSync(trainPath).size;

    // Estimate model sizes from Ollama
    const ourl = new URL(`${OLLAMA_URL}/api/tags`);
    const ores = await new Promise((resolve) => {
      const lib = ourl.protocol === 'https:' ? https : http;
      lib.get(ourl, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({}); } }); }).on('error', () => resolve({}));
    });
    if (ores.models) stats.storage.models_bytes = ores.models.reduce((acc, m) => acc + (m.size || 0), 0);
  } catch(e) {}

  // Docker / Ollama Container
  try {
    if (fs.existsSync('/var/run/docker.sock')) {
      const Docker = require('dockerode');
      const docker = new Docker({ socketPath: '/var/run/docker.sock' });
      const containers = await docker.listContainers();
      const ollama = containers.find(c => c.Image.includes('ollama') || c.Names.some(n => n.includes('ollama')));
      if (ollama) {
        const containerStats = await docker.getContainer(ollama.Id).stats({ stream: false });
        if (containerStats?.memory_stats) {
          const mem = containerStats.memory_stats;
          const cache = mem.stats?.cache || 0;
          stats.ollama_container_mb = Math.round((mem.usage - cache) / 1024 / 1024);
          stats.ollama_rss_mb = Math.round(mem.usage / 1024 / 1024);
          stats.ollama_container_name = ollama.Names[0]?.replace('/', '') || 'ollama';
          if (mem.limit && mem.limit < stats.system_total_mb * 1024 * 1024) stats.ollama_limit_mb = Math.round(mem.limit / 1024 / 1024);
        }
      }
    }
  } catch(e) {}
  res.json(stats);
});

// ── NEW: AI CHAT / TRAINING PLAYGROUND ──
router.post('/chat', async (req, res) => {
  const { message, history } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  // ── 🔍 Intelligent Search Context ──
  let searchContext = '';
  try {
    const q = message.trim();
    const words = q.split(/\s+/).filter(w => w.length > 2 && !['the', 'and', 'for', 'can', 'you', 'find', 'with', 'this'].includes(w.toLowerCase()));
    const searchTerms = [q, ...words];
    let foundCustomers = []; let foundRepairs = []; let foundInvoices = [];
    for (const term of searchTerms) {
      if (foundCustomers.length < 5) {
        const c = db.prepare(`SELECT * FROM customers WHERE deleted_at IS NULL AND (name LIKE ? OR phone LIKE ? OR email LIKE ?) LIMIT 3`).all(`%${term}%`, `%${term}%`, `%${term}%`);
        c.forEach(x => { if (!foundCustomers.find(f => f.id === x.id)) foundCustomers.push(x); });
      }
      if (foundRepairs.length < 5) {
        const r = db.prepare(`SELECT r.*, c.name as customer_name FROM repairs r JOIN customers c ON r.customer_id=c.id WHERE r.deleted_at IS NULL AND (r.title LIKE ? OR r.serial_number LIKE ? OR r.device_model LIKE ? OR c.name LIKE ?) LIMIT 3`).all(`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`);
        r.forEach(x => { if (!foundRepairs.find(f => f.id === x.id)) foundRepairs.push(x); });
      }
      if (foundInvoices.length < 5) {
        const i = db.prepare(`SELECT i.*, c.name as customer_name FROM invoices i JOIN customers c ON i.customer_id=c.id WHERE i.deleted_at IS NULL AND (i.invoice_number LIKE ? OR c.name LIKE ?) LIMIT 3`).all(`%${term}%`, `%${term}%`);
        i.forEach(x => { if (!foundInvoices.find(f => f.id === x.id)) foundInvoices.push(x); });
      }
    }
    if (foundCustomers.length > 0) {
      searchContext += "\nCustomers found:\n" + foundCustomers.slice(0, 3).map(c => {
        const notes = db.prepare('SELECT notes FROM customer_notes WHERE customer_id=? ORDER BY created_at DESC LIMIT 3').all(c.id);
        const calls = db.prepare('SELECT notes, outcome FROM call_logs WHERE customer_id=? ORDER BY created_at DESC LIMIT 3').all(c.id);
        const comms = db.prepare('SELECT subject, direction FROM communications WHERE customer_id=? ORDER BY created_at DESC LIMIT 3').all(c.id);
        let detail = `- ${c.name} (Phone: ${c.phone}, Email: ${c.email})`;
        if (notes.length > 0) detail += `\n  Notes: ${notes.map(n => n.notes).join(' | ')}`;
        if (calls.length > 0) detail += `\n  Call History: ${calls.map(cl => `${cl.notes} (${cl.outcome})`).join(' | ')}`;
        if (comms.length > 0) detail += `\n  Recent Emails: ${comms.map(cm => `[${cm.direction}] ${cm.subject}`).join(' | ')}`;
        return detail;
      }).join('\n');
    }
    if (foundRepairs.length > 0) {
      searchContext += "\nRepairs found:\n" + foundRepairs.slice(0, 3).map(r => {
        const photos = db.prepare('SELECT caption, stage FROM repair_photos WHERE repair_id=? AND caption IS NOT NULL AND caption != ""').all(r.id);
        let detail = `- ${r.title} for ${r.customer_name} (Status: ${r.status}, S/N: ${r.serial_number})`;
        if (photos.length > 0) detail += `\n  Photo documentation: ${photos.map(p => `${p.stage}: ${p.caption}`).join(' | ')}`;
        return detail;
      }).join('\n');
    }
  } catch (e) {}

  const ctx = await getAIContext();
  const system = `You are a helpful AI assistant for ${ctx.shop_name}, an IT repair shop. Version 11.0.0.
Shop Policy & Capability:
${ctx.shop_info}

Use the following context to help answer questions and maintain the shop's personality:
${ctx.training_context}
${searchContext ? `\nDatabase Information relevant to the user's message:\n${searchContext}` : ''}

Always format phone numbers in the style XXX-XXX-XXXX.
Be helpful, professional, and concise. When providing info from the database, be specific with names and numbers.

DOWNLOAD & RESEARCH CAPABILITY:
If a user asks you to "download", "research", or "save" a specific technical manual, schematic, or image from a URL, or if you find a highly relevant direct file link during a web search that would help future repairs, you can suggest that the user let you "Download and Learn" it. 
You have access to a background tool that can OCR images and parse PDFs to add them to your permanent Knowledge Base.
`;

  let prompt = message;
  if (history && history.length > 0) prompt = history.map(h => `${h.role === 'user' ? 'User' : 'AI'}: ${h.content}`).join('\n') + `\nUser: ${message}`;

  try {
    const response = await ollamaGenerate(prompt, system);
    res.json({ result: response, model: OLLAMA_MODEL });
  } catch(e) { res.status(503).json({ error: e.message }); }
});

// ── 1. REPAIR DIAGNOSIS ──
router.post('/diagnose', upload.single('image'), async (req, res) => {
  const { device_type, device_brand, device_model, symptoms, existing_notes } = req.body;
  if (!symptoms) return res.status(400).json({ error: 'symptoms required' });

  const images = [];
  if (req.file) images.push(req.file.buffer.toString('base64'));

  const ctx = await getAIContext();
  const parts = db.prepare('SELECT name, sku, quantity, category FROM inventory WHERE quantity > 0 ORDER BY category, name').all();
  const partsContext = parts.length > 0 ? `Available parts in inventory:\n${parts.map(p => `- ${p.name} — ${p.quantity} in stock`).join('\n')}` : 'No inventory data.';

  const system = `You are an expert IT repair technician assistant for ${ctx.shop_name}. Help diagnose issues. Format response with sections. ${images.length > 0 ? 'Analyze attached image to help diagnosis.' : ''}`;
  const prompt = `Device: ${[device_type, device_brand, device_model].filter(Boolean).join(' ') || 'Unknown'}\nSymptoms: ${symptoms}\n${existing_notes ? `Notes: ${existing_notes}` : ''}\n\n${partsContext}`;

  try {
    const response = await ollamaGenerate(prompt, system, images);
    res.json({ result: response, model: images.length > 0 ? 'llama3.2-vision' : OLLAMA_MODEL });
  } catch(e) { res.status(503).json({ error: e.message }); }
});

// ── 2. FORMAT REPAIR NOTES & EXPAND SHORTHAND ──
router.post('/format-notes', async (req, res) => {
  const { raw_notes, device_type, repair_title } = req.body;
  if (!raw_notes) return res.status(400).json({ error: 'raw_notes required' });
  const ctx = await getAIContext();
  const system = `You are a professional IT repair shop assistant for ${ctx.shop_name}. 
Your job is to expand shorthand/abbreviations and reformat rough technician notes into clean, professional documentation.

${ctx.system_context_only ? `IMPORTANT SHORTHAND & RULES FROM USER:\n${ctx.system_context_only}\n` : ''}

RULES:
1. Expand all shorthand (e.g., "cust" -> "customer", "ssd" -> "Solid State Drive" if appropriate, etc.).
2. Use the shorthand mappings provided in the context above.
3. Format all phone numbers to the style XXX-XXX-XXXX (e.g., 3333333333 becomes 333-333-3333).
4. Keep all factual data, serial numbers, and technical details.
5. Improve grammar and clarity while remaining concise.
6. Do not add information that wasn't in the original notes.`;

  const prompt = `Repair: ${repair_title || 'General'}\nDevice: ${device_type || 'Device'}\n\nRough notes to expand and format:\n"${raw_notes}"`;
  try {
    const response = await ollamaGenerate(prompt, system);
    res.json({ result: response, model: OLLAMA_MODEL });
  } catch(e) { res.status(503).json({ error: e.message }); }
});

// ── 3. CUSTOMER MESSAGE DRAFT ──
router.post('/customer-message', async (req, res) => {
  const { repair_id, message_type } = req.body;
  const repair = db.prepare(`SELECT r.*, c.name as customer_name FROM repairs r JOIN customers c ON r.customer_id=c.id WHERE r.id=?`).get(repair_id);
  if (!repair) return res.status(404).json({ error: 'Repair not found' });
  const ctx = await getAIContext();
  const system = `Friendly customer service assistant for ${ctx.shop_name}.`;
  const prompt = `Draft a ${message_type || 'status_update'} message for ${repair.customer_name}. Status: ${repair.status}. Write message only.`;
  try {
    const response = await ollamaGenerate(prompt, system);
    res.json({ result: response.trim(), model: OLLAMA_MODEL });
  } catch(e) { res.status(503).json({ error: e.message }); }
});

// ── 4. INVENTORY REORDER SUGGESTIONS ──
router.post('/reorder-suggestions', async (req, res) => {
  const items = db.prepare('SELECT * FROM inventory ORDER BY category, name').all();
  const ctx = await getAIContext();
  const system = `Inventory analyst for ${ctx.shop_name}. Analyze stock and give reorder advice.`;
  const prompt = `Inventory:\n${items.map(i => `${i.name} | Stock: ${i.quantity} | Min: ${i.quantity_min}`).join('\n')}`;
  try {
    const response = await ollamaGenerate(prompt, system);
    res.json({ result: response, model: OLLAMA_MODEL });
  } catch(e) { res.status(503).json({ error: e.message }); }
});

// ── 5. BUSINESS INSIGHTS ──
router.post('/insights', async (req, res) => {
  const { period } = req.body;
  const ctx = await getAIContext();
  const system = `Business analyst for ${ctx.shop_name}. Provide actionable insights.`;
  const prompt = `Generate business summary for period: ${period || 'month'}`;
  try {
    const response = await ollamaGenerate(prompt, system);
    res.json({ result: response, model: OLLAMA_MODEL });
  } catch(e) { res.status(503).json({ error: e.message }); }
});

// ── 6. REPAIR GUIDES & KNOWLEDGE BASE ──
router.get('/guides', (req, res) => {
  const { brand, model, q, type, source, include_deleted } = req.query;
  const uploadsBase = process.env.UPLOADS_PATH || path.join(__dirname, '../data/uploads');
  const kbPath = path.join(uploadsBase, 'knowledge-base');
  if (!fs.existsSync(kbPath)) fs.mkdirSync(kbPath, { recursive: true });

  // 1. Get guides from DB
  let sql = 'SELECT * FROM repair_guides WHERE 1=1';
  let params = [];
  if (include_deleted !== '1') sql += ' AND deleted_at IS NULL';
  else sql += ' AND deleted_at IS NOT NULL';

  if (brand) { sql += ' AND device_brand LIKE ?'; params.push(`%${brand}%`); }
  if (model) { sql += ' AND device_model LIKE ?'; params.push(`%${model}%`); }
  if (type) { sql += ' AND issue LIKE ?'; params.push(`%${type}%`); }
  if (source) { sql += ' AND source_url LIKE ?'; params.push(`%${source}%`); }
  if (q) { sql += ' AND (device_brand LIKE ? OR device_model LIKE ? OR issue LIKE ? OR guide_content LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
  
  const dbGuides = db.prepare(sql).all(...params).map(g => ({ ...g, source_type: 'AI Generated' }));

  // 2. Get learned documents from Disk (Knowledge Base)
  let diskGuides = [];
  try {
    const files = fs.readdirSync(kbPath);
    files.forEach(filename => {
      const isDeleted = filename.endsWith('.deleted');
      if ((include_deleted === '1' && !isDeleted) || (include_deleted !== '1' && isDeleted)) return;

      const parts = filename.replace('.learned', '').replace('.deleted', '').split('_');
      const timestamp = parts[0];
      const name = parts.slice(1).join(' ').toUpperCase() || filename;
      
      let content = '';
      try { content = fs.readFileSync(path.join(kbPath, filename), 'utf8'); } catch(e) {}
      
      if (q && !name.toLowerCase().includes(q.toLowerCase()) && !content.toLowerCase().includes(q.toLowerCase())) return;
      if (brand && !name.toLowerCase().includes(brand.toLowerCase())) return;

      diskGuides.push({
        id: 'file:' + filename,
        device_brand: 'Technical Doc',
        device_model: name,
        issue: 'Manual/Schematic',
        guide_content: content,
        source_url: 'Knowledge Base',
        source_type: 'Technical Documentation',
        created_at: new Date(parseInt(timestamp) || Date.now()).toISOString(),
        is_disk_file: true
      });
    });
  } catch(e) {}

  const allGuides = [...dbGuides, ...diskGuides].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(allGuides.slice(0, 100));
});

router.post('/guides', upload.single('file'), async (req, res) => {
  const { brand, model, issue, content, source } = req.body;
  let finalContent = content;
  if (req.file) finalContent = req.file.buffer.toString('utf8');
  if (!finalContent) return res.status(400).json({ error: 'Content required' });
  
  const id = uuidv4();
  db.prepare('INSERT INTO repair_guides (id, device_brand, device_model, issue, guide_content, source_url) VALUES (?,?,?,?,?,?)')
    .run(id, brand || 'General', model || 'Universal', issue || 'Manual Upload', finalContent, source || 'Manual');
  res.json({ ok: true, id });
});

router.delete('/guides/:id', (req, res) => {
  const { id } = req.params;
  if (id.startsWith('file:')) {
    const filename = id.replace('file:', '');
    const uploadsBase = process.env.UPLOADS_PATH || path.join(__dirname, '../data/uploads');
    const oldPath = path.join(uploadsBase, 'knowledge-base', filename);
    const newPath = oldPath + '.deleted';
    if (fs.existsSync(oldPath)) fs.renameSync(oldPath, newPath);
  } else {
    db.prepare('UPDATE repair_guides SET deleted_at = CURRENT_TIMESTAMP WHERE id=?').run(id);
  }
  res.json({ ok: true });
});

router.post('/guides/:id/restore', (req, res) => {
  const { id } = req.params;
  if (id.startsWith('file:')) {
    const filename = id.replace('file:', '');
    const uploadsBase = process.env.UPLOADS_PATH || path.join(__dirname, '../data/uploads');
    const oldPath = path.join(uploadsBase, 'knowledge-base', filename);
    const newPath = oldPath.replace('.deleted', '');
    if (fs.existsSync(oldPath)) fs.renameSync(oldPath, newPath);
  } else {
    db.prepare('UPDATE repair_guides SET deleted_at = NULL WHERE id=?').run(id);
  }
  res.json({ ok: true });
});

router.get('/guides/:id/download', (req, res) => {
  const { id } = req.params;
  if (id.startsWith('file:')) {
    const filename = id.replace('file:', '');
    const uploadsBase = process.env.UPLOADS_PATH || path.join(__dirname, '../data/uploads');
    const filePath = path.join(uploadsBase, 'knowledge-base', filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    res.download(filePath);
  } else {
    const g = db.prepare('SELECT * FROM repair_guides WHERE id=?').get(id);
    if (!g) return res.status(404).json({ error: 'Not found' });
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${g.device_brand}-${g.device_model}.txt"`);
    res.send(g.guide_content);
  }
});

router.post('/generate-guide', async (req, res) => {
  const { brand, model, issue, device_type } = req.body;
  if (!issue) return res.status(400).json({ error: 'Issue required' });

  try {
    const guide = await generateRepairGuide(brand, model, issue, device_type);
    res.json({ ok: true, guide });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

async function generateRepairGuide(brand, model, issue, deviceType) {
  const ctx = await getAIContext();
  const system = `You are a professional IT repair engineer. Generate a comprehensive repair guide or diagnostic flowchart.
Include sections for: Tools Needed, Safety Precautions, Diagnostic Steps, and Repair Procedure.
If schematics information is available, mention key test points.`;
  
  const prompt = `Generate a detailed repair guide for:
Device: ${deviceType || ''} ${brand || ''} ${model || ''}
Issue: ${issue}

Format the output in clean Markdown.`;

  // Always use Hybrid/Search for guides if possible
  const originalMode = ctx.settings?.ai_mode;
  const searchKey = ctx.settings?.ai_search_key;
  
  // Temporarily force hybrid if we have a search key to get accurate data
  let finalSystem = system;
  if (searchKey) {
    const searchResults = await performWebSearch(`${brand} ${model} ${issue} repair guide schematics`, searchKey);
    finalSystem += `\n\nWEB RESEARCH RESULTS:\n${searchResults}`;
  }

  const response = await ollamaGenerate(prompt, finalSystem);
  
  // Save to DB
  db.prepare('INSERT INTO repair_guides (id, device_brand, device_model, issue, guide_content) VALUES (?,?,?,?,?)')
    .run(uuidv4(), brand || '', model || '', issue, response);
    
  return response;
}

// ── PREFS & TRAINING ──
router.get('/prefs', (req, res) => {
  try {
    let prefs = db.prepare('SELECT * FROM user_preferences WHERE user_id=?').get(req.user.id);
    if (!prefs) return res.json({ user_id: req.user.id, dark_mode: 0, preferences: {} });
    res.json({ ...prefs, preferences: JSON.parse(prefs.preferences || '{}') });
  } catch(e) { res.json({ user_id: req.user.id, dark_mode: 0, preferences: {} }); }
});

router.put('/prefs', (req, res) => {
  const { dark_mode, preferences } = req.body;
  const existing = db.prepare('SELECT id FROM user_preferences WHERE user_id=?').get(req.user.id);
  if (existing) db.prepare('UPDATE user_preferences SET dark_mode=?, preferences=? WHERE user_id=?').run(dark_mode?1:0, JSON.stringify(preferences || {}), req.user.id);
  else db.prepare('INSERT INTO user_preferences (id, user_id, dark_mode, preferences) VALUES (?,?,?,?)').run(require('uuid').v4(), req.user.id, dark_mode?1:0, JSON.stringify(preferences || {}));
  res.json({ ok: true });
});

router.get('/training', (req, res) => {
  const trainPath = path.join(process.env.UPLOADS_PATH || path.join(__dirname, '../data/uploads'), 'ai-training.json');
  if (require('fs').existsSync(trainPath)) return res.json(JSON.parse(require('fs').readFileSync(trainPath, 'utf8')));
  res.json({ examples: [], system_context: '' });
});

router.post('/training', (req, res) => {
  const uploadsPath = process.env.UPLOADS_PATH || '/data/uploads';
  if (!require('fs').existsSync(uploadsPath)) require('fs').mkdirSync(uploadsPath, { recursive: true });
  require('fs').writeFileSync(path.join(uploadsPath, 'ai-training.json'), JSON.stringify({ ...req.body, last_updated: new Date().toISOString() }, null, 2));
  res.json({ ok: true });
});

router.post('/training/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    let text = '';
    const mimeType = req.file.mimetype;

    if (mimeType === 'application/pdf') {
      const data = await pdf(req.file.buffer);
      text = data.text;
    } 
    else if (mimeType.startsWith('image/')) {
      const result = await Tesseract.recognize(req.file.buffer, 'eng');
      text = result.data.text;
    }
    else {
      text = req.file.buffer.toString('utf8');
    }

    if (!text.trim()) throw new Error('No text content found in file');

    const uploadsBase = process.env.UPLOADS_PATH || path.join(__dirname, '../data/uploads');
    const kbPath = path.join(uploadsBase, 'knowledge-base');
    if (!fs.existsSync(kbPath)) fs.mkdirSync(kbPath, { recursive: true });

    // Save as a permanent learned document
    const safeName = req.file.originalname.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const saveName = `${Date.now()}_${safeName}.learned`;
    fs.writeFileSync(path.join(kbPath, saveName), text);

    res.json({ ok: true, learned_as: saveName });
  } catch(e) { 
    console.error('[AI Training Upload] Error:', e);
    res.status(500).json({ error: e.message }); 
  }
});

// ── 7. DOWNLOAD TOOL ──
router.post('/download-tool', async (req, res) => {
  const { url, type } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);
    const contentType = response.headers['content-type'];
    const originalName = url.split('/').pop().split('?')[0] || 'downloaded_file';
    
    let text = '';
    if (contentType === 'application/pdf' || originalName.endsWith('.pdf')) {
      const data = await pdf(buffer);
      text = data.text;
    } else if (contentType.startsWith('image/')) {
      const result = await Tesseract.recognize(buffer, 'eng');
      text = result.data.text;
    } else {
      text = buffer.toString('utf8');
    }

    if (!text.trim()) throw new Error('Could not extract text from downloaded file');

    const uploadsBase = process.env.UPLOADS_PATH || path.join(__dirname, '../data/uploads');
    const kbPath = path.join(uploadsBase, 'knowledge-base');
    if (!fs.existsSync(kbPath)) fs.mkdirSync(kbPath, { recursive: true });

    const safeName = originalName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const saveName = `${Date.now()}_${safeName}.learned`;
    fs.writeFileSync(path.join(kbPath, saveName), text);

    res.json({ ok: true, learned_as: saveName, source: url });
  } catch(e) {
    console.error('[AI Download Tool] Error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── OLLAMA MODEL MANAGEMENT ──
router.post('/models/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No model file provided' });
  const modelDir = path.join(process.env.UPLOADS_PATH || path.join(__dirname, '../data/uploads'), 'custom-models');
  if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });
  
  const savePath = path.join(modelDir, req.file.originalname);
  fs.writeFileSync(savePath, req.file.buffer);
  res.json({ ok: true, path: savePath, name: req.file.originalname });
});

router.post('/models/create', async (req, res) => {
  const { name, filePath } = req.body;
  if (!name || !filePath) return res.status(400).json({ error: 'Name and filePath required' });

  const modelfileContent = `FROM ${filePath}`;
  const modelfilePath = filePath + '.modelfile';
  fs.writeFileSync(modelfilePath, modelfileContent);

  const { spawn } = require('child_process');
  const proc = spawn('ollama', ['create', name, '-f', modelfilePath]);
  
  proc.on('close', (code) => {
    fs.unlinkSync(modelfilePath); // Cleanup modelfile
    if (code === 0) res.json({ ok: true });
    else res.status(500).json({ error: 'Ollama create failed' });
  });
});

router.get('/model-updates', async (req, res) => {
  try {
    const ores = await new Promise((resolve, reject) => {
      const url = new URL(`${OLLAMA_URL}/api/tags`);
      const lib = url.protocol === 'https:' ? https : http;
      lib.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => resolve(JSON.parse(d))); }).on('error', reject);
    });
    res.json({ installed: ores.models, current_model: OLLAMA_MODEL, ollama_online: true });
  } catch(e) { res.json({ installed: [], ollama_online: false, error: e.message }); }
});

router.post('/model-action', async (req, res) => {
  const { action, model } = req.body;
  const body = JSON.stringify({ model: model || OLLAMA_MODEL, keep_alive: action === 'start' ? '10m' : 0 });
  const url = new URL(`${OLLAMA_URL}/api/generate`);
  const lib = url.protocol === 'https:' ? https : http;
  const req2 = lib.request({ hostname: url.hostname, port: url.port || 80, path: url.pathname, method: 'POST', headers: { 'Content-Type': 'application/json' } }, r => r.resume());
  req2.write(body); req2.end();
  res.json({ ok: true });
});

router.delete('/models/:modelName', async (req, res) => {
  const model = decodeURIComponent(req.params.modelName);
  const body = JSON.stringify({ name: model });
  const url = new URL(`${OLLAMA_URL}/api/delete`);
  const lib = url.protocol === 'https:' ? https : http;
  const req2 = lib.request({ hostname: url.hostname, port: url.port || 80, path: url.pathname, method: 'DELETE', headers: { 'Content-Type': 'application/json' } }, r => r.resume());
  req2.write(body); req2.end();
  res.json({ ok: true });
});

router.post('/set-model', (req, res) => {
  db.prepare("UPDATE settings SET value=? WHERE key='ollama_model'").run(req.body.model);
  process.env.OLLAMA_MODEL = req.body.model;
  res.json({ ok: true });
});

// ── AUTO-DOWNLOAD & UPDATE MODELS ──
async function pullModel(model) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ name: model });
    const url = new URL(`${OLLAMA_URL}/api/pull`);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request({ hostname: url.hostname, port: url.port || 80, path: url.pathname, method: 'POST', headers: { 'Content-Type': 'application/json' } }, resp => {
      resp.on('data', () => {}); resp.on('end', resolve);
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

async function initModels() {
  try {
    const resp = await new Promise((resolve, reject) => {
      const url = new URL(`${OLLAMA_URL}/api/tags`);
      const lib = url.protocol === 'https:' ? https : http;
      lib.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } }); }).on('error', reject);
    });
    const installed = (resp.models || []).map(m => m.name);
    for (const m of ['llama3.2', 'llama3.2-vision']) {
      if (!installed.includes(m) && !installed.includes(m + ':latest')) {
        console.log(`[AI] Downloading required model: ${m}...`);
        await pullModel(m);
        console.log(`[AI] Downloaded ${m}`);
      }
    }
  } catch (e) { console.error('[AI] Model init failed:', e.message); }
}

async function updateModels() {
  try {
    console.log('[AI] Backup triggered: Updating LLMs...');
    await pullModel('llama3.2');
    await pullModel('llama3.2-vision');
    console.log('[AI] LLM updates completed.');
  } catch (e) { console.error('[AI] LLM update failed:', e.message); }
}

async function runAutoResearch() {
  try {
    const settings = db.prepare('SELECT ai_auto_research FROM settings WHERE id=1').get();
    if (!settings?.ai_auto_research) return;

    console.log('[AI Research] Checking for documented repairs needing guides...');
    // Strictly find repairs documented in the repairs table that lack a guide
    const target = db.prepare(`
      SELECT r.device_brand, r.device_model, r.description, r.device_type
      FROM repairs r 
      LEFT JOIN repair_guides g ON (LOWER(r.device_brand) = LOWER(g.device_brand) AND LOWER(r.device_model) = LOWER(g.device_model))
      WHERE r.deleted_at IS NULL
      AND r.status NOT IN ('completed','cancelled') 
      AND r.device_brand != '' AND r.device_model != ''
      AND g.id IS NULL
      LIMIT 1
    `).get();

    if (target) {
      console.log(`[AI Research] Documented repair found: ${target.device_brand} ${target.device_model}. Starting research...`);
      await generateRepairGuide(target.device_brand, target.device_model, target.description, target.device_type);
    }
  } catch(e) { console.error('[AI Research] Error:', e.message); }
}

setTimeout(initModels, 10000);

module.exports = router;
module.exports.updateModels = updateModels;
module.exports.runAutoResearch = runAutoResearch;
