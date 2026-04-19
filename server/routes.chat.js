const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const https = require('https');
const db = require('./db');
const auth = require('./auth.middleware');

router.use(auth);

// Get messages (broadcast + messages involving current user)
router.get('/messages', (req, res) => {
  const { since, limit } = req.query;
  const lim = Math.min(parseInt(limit) || 100, 500);
  let sql = `SELECT * FROM chat_messages WHERE (is_broadcast=1 OR sender_id=? OR recipient_id=? OR recipient_id='') `;
  const params = [req.user.id, req.user.id];
  if (since) { sql += ' AND created_at > ?'; params.push(since); }
  sql += ' ORDER BY created_at ASC LIMIT ?';
  params.push(lim);
  const messages = db.prepare(sql).all(...params);
  res.json(messages);
});

// Send a message
router.post('/messages', (req, res) => {
  const { message, recipient_id, is_broadcast } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Message required' });
  const id = uuidv4();
  db.prepare('INSERT INTO chat_messages (id,sender_id,sender_name,recipient_id,is_broadcast,message) VALUES (?,?,?,?,?,?)')
    .run(id, req.user.id, req.user.username, recipient_id || '', is_broadcast ? 1 : 0, message.trim());
  res.json(db.prepare('SELECT * FROM chat_messages WHERE id=?').get(id));
});

// AI chat — sends message to Ollama and stores response
router.post('/ai', async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

  // Store user message
  const userMsgId = uuidv4();
  db.prepare('INSERT INTO chat_messages (id,sender_id,sender_name,recipient_id,is_broadcast,message,is_ai) VALUES (?,?,?,?,?,?,0)')
    .run(userMsgId, req.user.id, req.user.username, 'ai', 0, message.trim());

  // ── 🔍 Intelligent Search Context ──
  let searchContext = '';
  try {
    const q = message.trim();
    // Split into words and filter out common short words to find potential search terms
    const words = q.split(/\s+/).filter(w => w.length > 2 && !['the', 'and', 'for', 'can', 'you', 'find', 'with', 'this'].includes(w.toLowerCase()));
    
    // Build search conditions
    const searchTerms = [q, ...words];
    
    let foundCustomers = [];
    let foundRepairs = [];
    let foundInvoices = [];

    for (const term of searchTerms) {
      if (foundCustomers.length < 5) {
        const c = db.prepare(`SELECT * FROM customers WHERE deleted_at IS NULL AND (name LIKE ? OR phone LIKE ? OR email LIKE ?) LIMIT 3`)
          .all(`%${term}%`, `%${term}%`, `%${term}%`);
        c.forEach(x => { if (!foundCustomers.find(f => f.id === x.id)) foundCustomers.push(x); });
      }
      if (foundRepairs.length < 5) {
        const r = db.prepare(`SELECT r.*, c.name as customer_name FROM repairs r JOIN customers c ON r.customer_id=c.id 
          WHERE r.deleted_at IS NULL AND (r.title LIKE ? OR r.serial_number LIKE ? OR r.device_model LIKE ? OR c.name LIKE ?) LIMIT 3`)
          .all(`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`);
        r.forEach(x => { if (!foundRepairs.find(f => f.id === x.id)) foundRepairs.push(x); });
      }
      if (foundInvoices.length < 5) {
        const i = db.prepare(`SELECT i.*, c.name as customer_name FROM invoices i JOIN customers c ON i.customer_id=c.id 
          WHERE i.deleted_at IS NULL AND (i.invoice_number LIKE ? OR c.name LIKE ?) LIMIT 3`)
          .all(`%${term}%`, `%${term}%`);
        i.forEach(x => { if (!foundInvoices.find(f => f.id === x.id)) foundInvoices.push(x); });
      }
    }

    if (foundCustomers.length > 0) {
      searchContext += "\nRelevant Customers found:\n" + foundCustomers.slice(0, 3).map(c => {
        // Fetch detailed context for each customer
        const notes = db.prepare('SELECT notes, created_at FROM customer_notes WHERE customer_id=? ORDER BY created_at DESC LIMIT 3').all(c.id);
        const calls = db.prepare('SELECT notes, outcome, created_at FROM call_logs WHERE customer_id=? ORDER BY created_at DESC LIMIT 3').all(c.id);
        const comms = db.prepare('SELECT subject, body, direction, created_at FROM communications WHERE customer_id=? ORDER BY created_at DESC LIMIT 3').all(c.id);
        
        let detail = `- ${c.name} (Phone: ${c.phone}, Email: ${c.email})`;
        if (notes.length > 0) detail += `\n  Notes: ${notes.map(n => n.notes).join(' | ')}`;
        if (calls.length > 0) detail += `\n  Call History: ${calls.map(cl => `${cl.notes} (${cl.outcome})`).join(' | ')}`;
        if (comms.length > 0) detail += `\n  Recent Emails: ${comms.map(cm => `[${cm.direction}] ${cm.subject}`).join(' | ')}`;
        return detail;
      }).join('\n');
    }
    if (foundRepairs.length > 0) {
      searchContext += "\nRelevant Repairs found:\n" + foundRepairs.slice(0, 3).map(r => {
        // Fetch photo documentation captions
        const photos = db.prepare('SELECT caption, stage FROM repair_photos WHERE repair_id=? AND caption IS NOT NULL AND caption != ""').all(r.id);
        let detail = `- ${r.title} for ${r.customer_name} (Status: ${r.status}, S/N: ${r.serial_number})`;
        if (photos.length > 0) detail += `\n  Photo documentation: ${photos.map(p => `${p.stage}: ${p.caption}`).join(' | ')}`;
        return detail;
      }).join('\n');
    }
    if (foundInvoices.length > 0) {
      searchContext += "\nRelevant Invoices found:\n" + foundInvoices.slice(0, 3).map(i => `- Invoice #${i.invoice_number} for ${i.customer_name} (Total: $${i.total}, Balance: $${i.balance_due})`).join('\n');
    }
  } catch (e) { console.error('AI search context error:', e); }

  // Build context from recent repairs/stats for the AI
  const sett = db.prepare('SELECT device_types FROM settings WHERE id=1').get();
  const manufacturers = db.prepare('SELECT name, device_types FROM manufacturers WHERE active=1').all();
  const shopInfo = `Supported Manufacturers: ${manufacturers.map(m => `${m.name} (${JSON.parse(m.device_types || '[]').join(', ')})`).join('; ')}\nAvailable Device Types: ${sett?.device_types || '[]'}`;

  const openRepairs = db.prepare("SELECT COUNT(*) as c FROM repairs WHERE status NOT IN ('completed','cancelled')").get().c;
  const todayRepairs = db.prepare("SELECT COUNT(*) as c FROM repairs WHERE date(created_at)=date('now')").get().c;
  const lowStock = db.prepare('SELECT COUNT(*) as c FROM inventory WHERE quantity <= quantity_min').get().c;
  const pendingReminders = db.prepare("SELECT COUNT(*) as c FROM reminders WHERE status='pending'").get().c;

  const OLLAMA_URL = process.env.OLLAMA_URL || 'http://ollama:11434';
  const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

  const systemPrompt = `You are RepairBot, the AI assistant for an IT repair shop management system. You are helpful, friendly, and knowledgeable about IT repairs, customer service, and shop management.

Shop Policy & Capability:
${shopInfo}

Current shop status:
- Open repairs: ${openRepairs}
- New repairs today: ${todayRepairs}
- Low stock items: ${lowStock}
- Pending reminders: ${pendingReminders}
- Current user: ${req.user.username}
${searchContext ? `\nDatabase Information relevant to the user's message (History, Call Logs, Notes):\n${searchContext}` : ''}

Keep responses concise and practical. You can answer questions about repairs, inventory, customers, IT issues, and shop management. If asked about shop data you don't have access to, say so and suggest checking the relevant section of the app.
When providing information from the database, be specific (e.g., mention names, phone numbers, or invoice numbers).`;

  try {
    const body = JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: message,
      system: systemPrompt,
      stream: false,
      options: { temperature: 0.5, num_predict: 400 }
    });

    const url = new URL(`${OLLAMA_URL}/api/generate`);
    const lib = url.protocol === 'https:' ? https : http;

    const aiResponse = await new Promise((resolve, reject) => {
      const req2 = lib.request({
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      }, resp => {
        let data = '';
        resp.on('data', c => data += c);
        resp.on('end', () => { try { resolve(JSON.parse(data).response || 'Sorry, I could not generate a response.'); } catch(e) { reject(e); } });
      });
      req2.on('error', reject);
      req2.setTimeout(60000, () => { req2.destroy(); reject(new Error('timeout')); });
      req2.write(body);
      req2.end();
    });

    // Store AI response
    const aiMsgId = uuidv4();
    db.prepare('INSERT INTO chat_messages (id,sender_id,sender_name,recipient_id,is_broadcast,message,is_ai) VALUES (?,?,?,?,?,?,1)')
      .run(aiMsgId, 'ai', 'RepairBot', req.user.id, 0, aiResponse);

    res.json({ userMessage: db.prepare('SELECT * FROM chat_messages WHERE id=?').get(userMsgId), aiMessage: db.prepare('SELECT * FROM chat_messages WHERE id=?').get(aiMsgId) });

  } catch(e) {
    const errMsg = `I'm having trouble connecting right now. Error: ${e.message}`;
    const aiMsgId = uuidv4();
    db.prepare('INSERT INTO chat_messages (id,sender_id,sender_name,recipient_id,is_broadcast,message,is_ai) VALUES (?,?,?,?,?,?,1)')
      .run(aiMsgId, 'ai', 'RepairBot', req.user.id, 0, errMsg);
    res.json({ userMessage: db.prepare('SELECT * FROM chat_messages WHERE id=?').get(userMsgId), aiMessage: db.prepare('SELECT * FROM chat_messages WHERE id=?').get(aiMsgId) });
  }
});

// AI greeting on login
router.post('/greeting', async (req, res) => {
  const OLLAMA_URL = process.env.OLLAMA_URL || 'http://ollama:11434';
  const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

  const now = new Date();
  const hour = now.getHours();
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  const openRepairs = db.prepare("SELECT COUNT(*) as c FROM repairs WHERE status NOT IN ('completed','cancelled')").get().c;
  const overdueReminders = db.prepare("SELECT COUNT(*) as c FROM reminders WHERE status='pending' AND due_date <= datetime('now')").get().c;
  const readyRepairs = db.prepare("SELECT COUNT(*) as c FROM repairs WHERE status='ready'").get().c;

  const prompt = `Generate a brief, friendly good ${timeOfDay} greeting for ${req.user.username}, an IT repair shop technician. 

Current shop status they should know about:
- Open repairs: ${openRepairs}
- Repairs ready for pickup: ${readyRepairs}  
- Overdue reminders: ${overdueReminders}

Keep it to 2-3 sentences max. Be warm and helpful. Mention the most important thing they should check first if anything needs attention.`;

  try {
    const body = JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false, options: { temperature: 0.7, num_predict: 120 } });
    const url = new URL(`${OLLAMA_URL}/api/generate`);
    const lib = url.protocol === 'https:' ? https : http;

    const greeting = await new Promise((resolve, reject) => {
      const r = lib.request({ hostname: url.hostname, port: url.port || 80, path: url.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, resp => {
        let data = '';
        resp.on('data', c => data += c);
        resp.on('end', () => { try { resolve(JSON.parse(data).response || `Good ${timeOfDay}, ${req.user.username}!`); } catch(e) { reject(e); } });
      });
      r.on('error', reject);
      r.setTimeout(15000, () => { r.destroy(); reject(new Error('timeout')); });
      r.write(body);
      r.end();
    });

    res.json({ greeting: greeting.trim() });
  } catch(e) {
    res.json({ greeting: `Good ${timeOfDay}, ${req.user.username}! You have ${openRepairs} open repairs${overdueReminders > 0 ? ` and ${overdueReminders} overdue reminders` : ''}.` });
  }
});

module.exports = router;
