const { v4: uuidv4 } = require('uuid');
const db = require('./db');

// Auto-purge logs older than 30 days on startup and daily
function purgeOldLogs() {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const result = db.prepare("DELETE FROM activity_log WHERE created_at < ?").run(cutoff.toISOString());
    if (result.changes > 0) console.log(`[Activity Log] Purged ${result.changes} entries older than 30 days`);
  } catch(e) {}
}
purgeOldLogs();
setInterval(purgeOldLogs, 24 * 60 * 60 * 1000);

// Map route patterns to human-readable actions
function describeAction(method, path, body) {
  const p = path.replace(/\/api\//, '').replace(/\/[a-f0-9-]{36}/g, '/:id');

  const map = [
    // Auth
    { m: 'POST', p: 'auth/login',            action: 'Logged in' },
    { m: 'POST', p: 'auth/change-password',  action: 'Changed password' },
    // Customers
    { m: 'POST',   p: 'customers',            action: 'Created customer',    type: 'customer' },
    { m: 'PUT',    p: 'customers/:id',         action: 'Updated customer',    type: 'customer' },
    { m: 'DELETE', p: 'customers/:id',         action: 'Deleted customer',    type: 'customer' },
    { m: 'POST',   p: 'customers/:id/calls',   action: 'Logged call',         type: 'call_log' },
    // Repairs
    { m: 'POST',   p: 'repairs',              action: 'Created repair',       type: 'repair' },
    { m: 'PUT',    p: 'repairs/:id',           action: 'Updated repair',       type: 'repair' },
    { m: 'DELETE', p: 'repairs/:id',           action: 'Deleted repair',       type: 'repair' },
    // Invoices
    { m: 'POST',   p: 'invoices',             action: 'Created invoice',      type: 'invoice' },
    { m: 'PUT',    p: 'invoices/:id',          action: 'Updated invoice',      type: 'invoice' },
    { m: 'DELETE', p: 'invoices/:id',          action: 'Deleted invoice',      type: 'invoice' },
    // Estimates
    { m: 'POST',   p: 'estimates',            action: 'Created estimate',     type: 'estimate' },
    { m: 'PUT',    p: 'estimates/:id',         action: 'Updated estimate',     type: 'estimate' },
    { m: 'POST',   p: 'estimates/:id/convert', action: 'Converted estimate to invoice', type: 'estimate' },
    { m: 'DELETE', p: 'estimates/:id',         action: 'Deleted estimate',     type: 'estimate' },
    // Inventory
    { m: 'POST',   p: 'inventory',            action: 'Added inventory item', type: 'inventory' },
    { m: 'PUT',    p: 'inventory/:id',         action: 'Updated inventory',    type: 'inventory' },
    { m: 'POST',   p: 'inventory/:id/adjust',  action: 'Adjusted stock',       type: 'inventory' },
    { m: 'DELETE', p: 'inventory/:id',         action: 'Deleted inventory',    type: 'inventory' },
    // Appointments
    { m: 'POST',   p: 'appointments',         action: 'Created appointment',  type: 'appointment' },
    { m: 'PUT',    p: 'appointments/:id',      action: 'Updated appointment',  type: 'appointment' },
    { m: 'POST',   p: 'appointments/:id/convert', action: 'Converted appointment to repair', type: 'appointment' },
    { m: 'DELETE', p: 'appointments/:id',      action: 'Deleted appointment',  type: 'appointment' },
    // Reminders
    { m: 'POST',   p: 'reminders',            action: 'Created reminder',     type: 'reminder' },
    { m: 'PUT',    p: 'reminders/:id/dismiss', action: 'Dismissed reminder',   type: 'reminder' },
    { m: 'PUT',    p: 'reminders/:id/complete',action: 'Completed reminder',   type: 'reminder' },
    // Settings
    { m: 'PUT',    p: 'settings',             action: 'Updated settings',     type: 'settings' },
    { m: 'POST',   p: 'settings/logo',        action: 'Uploaded logo',        type: 'settings' },
    // Users
    { m: 'POST',   p: 'users',               action: 'Created user account', type: 'user' },
    { m: 'PUT',    p: 'users/:id',            action: 'Updated user account', type: 'user' },
    { m: 'DELETE', p: 'users/:id',            action: 'Deleted user account', type: 'user' },
    { m: 'POST',   p: 'users/:id/reset-password', action: 'Reset user password', type: 'user' },
    // Backup
    { m: 'GET',    p: 'backup/download',      action: 'Downloaded backup',    type: 'backup' },
    { m: 'POST',   p: 'backup/restore',       action: 'Restored from backup', type: 'backup' },
    // Photos
    { m: 'POST',   p: 'photos/repair/:id',    action: 'Uploaded photo',       type: 'photo' },
    { m: 'DELETE', p: 'photos/:id',           action: 'Deleted photo',        type: 'photo' },
  ];

  const clean = p.replace(/^\//, '');
  const match = map.find(m => m.m === method && clean.startsWith(m.p.replace('/:id', '')));
  return match || { action: `${method} /${clean}`, type: 'other' };
}

function logActivity(userId, username, method, path, body, ip, responseBody) {
  try {
    const desc = describeAction(method, path, body);
    let entityLabel = '';

    // Try to extract a useful label from request/response
    if (responseBody) {
      try {
        const r = typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody;
        entityLabel = r.name || r.title || r.username || r.invoice_number || r.estimate_number || r.customer_name || '';
      } catch(e) {}
    }
    if (!entityLabel && body) {
      entityLabel = body.name || body.title || body.username || '';
    }

    db.prepare(`INSERT INTO activity_log (id,user_id,username,action,entity_type,entity_label,details,ip_address)
      VALUES (?,?,?,?,?,?,?,?)`).run(
      uuidv4(), userId, username, desc.action, desc.type || '',
      entityLabel, JSON.stringify({ method, path: path.replace(/\/api\//, '') }).slice(0, 500),
      ip || ''
    );
  } catch(e) {
    // Never let logging break the request
  }
}

// Express middleware — logs after response
module.exports = function activityLogger(req, res, next) {
  if (!req.user) return next();

  // Only log mutating requests and important GETs
  const shouldLog = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) ||
    (req.method === 'GET' && (req.path.includes('/backup/download') || req.path.includes('/pdf')));

  if (!shouldLog) return next();

  const originalJson = res.json.bind(res);
  let responseBody = null;

  res.json = function(data) {
    responseBody = data;
    return originalJson(data);
  };

  res.on('finish', () => {
    if (res.statusCode < 400) {
      logActivity(
        req.user.id,
        req.user.username,
        req.method,
        req.path,
        req.body,
        req.ip,
        responseBody
      );
    }
  });

  next();
};

module.exports.logActivity = logActivity;
