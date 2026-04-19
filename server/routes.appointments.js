const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { google } = require('googleapis');
const db = require('./db');
const auth = require('./auth.middleware');
const googleUtils = require('./google.utils');

// Google OAuth2 client — credentials come from environment variables
function getOAuth2Client() {
  return googleUtils.getOAuth2Client();
}

function getStoredTokens() {
  return db.prepare('SELECT * FROM google_tokens WHERE id=1').get();
}

async function syncToGoogleCalendar(appointment) {
  return await googleUtils.syncToGoogleCalendar(appointment);
}

async function deleteFromGoogleCalendar(googleEventId) {
  const client = googleUtils.getAuthorizedClient();
  if (!client || !googleEventId) return;
  const tokens = getStoredTokens();
  const calendar = google.calendar({ version: 'v3', auth: client });
  await calendar.events.delete({ calendarId: tokens.calendar_id || 'primary', eventId: googleEventId });
}

// ── Public routes (no auth) ──

// OAuth callback — Google redirects here after user grants permission
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.send('<h2>Error: no code returned from Google</h2>');
  try {
    const client = getOAuth2Client();
    const { tokens } = await client.getToken(code);
    // Get user email
    let email = '';
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: client });
      const userInfo = await oauth2.userinfo.get();
      email = userInfo.data.email || '';
    } catch(e) {}
    db.prepare(`UPDATE google_tokens SET access_token=?, refresh_token=?, expiry_date=?, email=? WHERE id=1`)
      .run(tokens.access_token || '', tokens.refresh_token || '', tokens.expiry_date || 0, email);
    res.send(`
      <html><body style="font-family:sans-serif;padding:40px;text-align:center">
        <h2 style="color:#16a34a">✓ Google Calendar connected!</h2>
        <p>You can close this tab and return to RepairShop.</p>
        <script>setTimeout(()=>window.close(),2000)</script>
      </body></html>
    `);
  } catch (e) {
    res.send(`<h2>Error: ${e.message}</h2>`);
  }
});

// ── Protected routes ──
router.use(auth);

// Google OAuth status
router.get('/google/status', (req, res) => {
  const tokens = getStoredTokens();
  const configured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const connected = !!(tokens && tokens.refresh_token);
  res.json({ configured, connected, calendar_id: tokens?.calendar_id || 'primary', email: tokens?.email || '' });
});

// Generate Google OAuth URL
router.get('/google/auth-url', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(400).json({ error: 'GOOGLE_CLIENT_ID not configured' });
  const client = getOAuth2Client();
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/contacts',
      'https://www.googleapis.com/auth/drive.file',
      'email',
      'profile'
    ]
  });
  res.json({ url });
});

// Disconnect Google
router.post('/google/disconnect', (req, res) => {
  db.prepare("UPDATE google_tokens SET access_token='', refresh_token='', expiry_date=0 WHERE id=1").run();
  res.json({ ok: true });
});

// Update calendar ID
router.put('/google/calendar', (req, res) => {
  const { calendar_id } = req.body;
  db.prepare("UPDATE google_tokens SET calendar_id=? WHERE id=1").run(calendar_id || 'primary');
  res.json({ ok: true });
});

// List all appointments
router.get('/', (req, res) => {
  const { start, end, status, customer_id } = req.query;
  let sql = `SELECT a.*, c.name as linked_customer_name FROM appointments a
    LEFT JOIN customers c ON a.customer_id=c.id WHERE 1=1`;
  const params = [];
  if (start) { sql += ' AND a.start_time >= ?'; params.push(start); }
  if (end) { sql += ' AND a.start_time <= ?'; params.push(end); }
  if (status) { sql += ' AND a.status = ?'; params.push(status); }
  if (customer_id) { sql += ' AND a.customer_id = ?'; params.push(customer_id); }
  sql += ' ORDER BY a.start_time ASC';
  res.json(db.prepare(sql).all(...params));
});

// Get single appointment
router.get('/:id', (req, res) => {
  const appt = db.prepare(`SELECT a.*, c.name as linked_customer_name FROM appointments a
    LEFT JOIN customers c ON a.customer_id=c.id WHERE a.id=?`).get(req.params.id);
  if (!appt) return res.status(404).json({ error: 'Not found' });
  res.json(appt);
});

// Create appointment
router.post('/', async (req, res) => {
  const { customer_id, customer_name, customer_phone, customer_email, title, description,
    device_type, device_brand, device_model, start_time, end_time, notes } = req.body;
  if (!title || !start_time || !end_time) return res.status(400).json({ error: 'title, start_time, end_time required' });

  // Resolve customer name for calendar event
  let displayName = customer_name || '';
  if (customer_id && !displayName) {
    const c = db.prepare('SELECT name FROM customers WHERE id=?').get(customer_id);
    if (c) displayName = c.name;
  }

  const id = uuidv4();
  db.prepare(`INSERT INTO appointments (id,customer_id,customer_name,customer_phone,customer_email,title,description,device_type,device_brand,device_model,start_time,end_time,notes,created_by_id,created_by_name)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, customer_id || null, displayName, customer_phone || '',
    customer_email || '', title, description || '', device_type || '', device_brand || '', device_model || '',
    start_time, end_time, notes || '', req.user?.id || '', req.user?.username || '');

  const appt = db.prepare('SELECT * FROM appointments WHERE id=?').get(id);

  // Sync to Google Calendar
  const googleEventId = await syncToGoogleCalendar({ ...appt, customer_name: displayName });
  if (googleEventId) {
    db.prepare('UPDATE appointments SET google_event_id=? WHERE id=?').run(googleEventId, id);
  }

  res.json(db.prepare('SELECT * FROM appointments WHERE id=?').get(id));
});

// Update appointment
router.put('/:id', async (req, res) => {
  const { customer_id, customer_name, customer_phone, customer_email, title, description,
    device_type, device_brand, device_model, start_time, end_time, notes, status } = req.body;
  const existing = db.prepare('SELECT * FROM appointments WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  let displayName = customer_name || existing.customer_name;
  if (customer_id && !customer_name) {
    const c = db.prepare('SELECT name FROM customers WHERE id=?').get(customer_id);
    if (c) displayName = c.name;
  }

  db.prepare(`UPDATE appointments SET customer_id=?,customer_name=?,customer_phone=?,customer_email=?,
    title=?,description=?,device_type=?,device_brand=?,device_model=?,start_time=?,end_time=?,
    notes=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
    customer_id || existing.customer_id, displayName, customer_phone || existing.customer_phone,
    customer_email || existing.customer_email, title || existing.title, description || '',
    device_type || '', device_brand || '', device_model || '',
    start_time || existing.start_time, end_time || existing.end_time,
    notes || '', status || existing.status, req.params.id);

  const updated = db.prepare('SELECT * FROM appointments WHERE id=?').get(req.params.id);

  // Sync to Google Calendar
  const googleEventId = await syncToGoogleCalendar({ ...updated, google_event_id: existing.google_event_id });
  if (googleEventId && !existing.google_event_id) {
    db.prepare('UPDATE appointments SET google_event_id=? WHERE id=?').run(googleEventId, req.params.id);
  }

  res.json(db.prepare('SELECT * FROM appointments WHERE id=?').get(req.params.id));
});

// Convert appointment to repair ticket
router.post('/:id/convert', (req, res) => {
  const appt = db.prepare('SELECT * FROM appointments WHERE id=?').get(req.params.id);
  if (!appt) return res.status(404).json({ error: 'Not found' });

  // Require a linked customer
  if (!appt.customer_id) return res.status(400).json({ error: 'Link appointment to a customer first' });

  const repairId = uuidv4();
  db.prepare(`INSERT INTO repairs (id,customer_id,title,description,status,device_type,device_brand,device_model)
    VALUES (?,?,?,?,?,?,?,?)`).run(repairId, appt.customer_id, appt.title,
    appt.description || '', 'intake', appt.device_type || '', appt.device_brand || '', appt.device_model || '');

  // Link the appointment to the repair and mark it complete
  db.prepare("UPDATE appointments SET repair_id=?, status='completed', updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(repairId, appt.id);

  res.json({ repair_id: repairId });
});

// Delete appointment
router.delete('/:id', async (req, res) => {
  const appt = db.prepare('SELECT * FROM appointments WHERE id=?').get(req.params.id);
  if (!appt) return res.status(404).json({ error: 'Not found' });
  if (appt.google_event_id) await deleteFromGoogleCalendar(appt.google_event_id);
  db.prepare('DELETE FROM appointments WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;

// ── TWO-WAY SYNC: pull events from Google Calendar into appointments ──
router.post('/google/sync-from', async (req, res) => {
  const client = getAuthorizedClient();
  if (!client) return res.status(400).json({ error: 'Google not connected. Go to Settings → Cloud.' });
  try {
    const calendar = google.calendar({ version: 'v3', auth: client });
    const tokens = getStoredTokens();
    const calId = tokens?.calendar_id || 'primary';
    const now = new Date();
    const weekAhead = new Date(now.getTime() + 7 * 86400000);
    const r = await calendar.events.list({
      calendarId: calId,
      timeMin: now.toISOString(),
      timeMax: weekAhead.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });
    const events = r.data.items || [];
    let imported = 0;
    for (const ev of events) {
      if (!ev.id || !ev.summary) continue;
      const exists = db.prepare('SELECT id FROM appointments WHERE google_event_id=?').get(ev.id);
      if (!exists) {
        const startTime = ev.start?.dateTime || ev.start?.date + 'T09:00:00';
        const endTime = ev.end?.dateTime || ev.end?.date + 'T10:00:00';
        db.prepare('INSERT INTO appointments (id,title,description,start_time,end_time,notes,google_event_id,status) VALUES (?,?,?,?,?,?,?,?)')
          .run(uuidv4(), ev.summary, ev.description || '', startTime, endTime, ev.location || '', ev.id, 'confirmed');
        imported++;
      }
    }
    res.json({ ok: true, imported, total: events.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── SYNC ALL appointments to Google Calendar ──
router.post('/sync-all', async (req, res) => {
  const client = getAuthorizedClient();
  if (!client) return res.status(400).json({ error: 'Google not connected' });
  try {
    const calendar = google.calendar({ version: 'v3', auth: client });
    const tokens = getStoredTokens();
    const calId = tokens?.calendar_id || 'primary';
    const appts = db.prepare("SELECT * FROM appointments WHERE start_time >= datetime('now') ORDER BY start_time").all();
    let synced = 0;
    for (const appt of appts) {
      try {
        const event = {
          summary: appt.title,
          description: appt.description || '',
          start: { dateTime: new Date(appt.start_time).toISOString() },
          end: { dateTime: new Date(appt.end_time).toISOString() },
        };
        if (appt.google_event_id) {
          await calendar.events.update({ calendarId: calId, eventId: appt.google_event_id, requestBody: event });
        } else {
          const r = await calendar.events.insert({ calendarId: calId, requestBody: event });
          db.prepare('UPDATE appointments SET google_event_id=? WHERE id=?').run(r.data.id, appt.id);
        }
        synced++;
      } catch(e) {}
    }
    res.json({ ok: true, synced, total: appts.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});
