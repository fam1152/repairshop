const { google } = require('googleapis');
const db = require('./db');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { PassThrough } = require('stream');

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/appointments/google/callback'
  );
}

function getStoredTokens() {
  return db.prepare('SELECT * FROM google_tokens WHERE id=1').get();
}

function getAuthorizedClient() {
  const tokens = getStoredTokens();
  if (!tokens || !tokens.refresh_token) return null;
  const client = getOAuth2Client();
  client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date
  });
  return client;
}

async function syncToGoogleCalendar(appointment) {
  try {
    const client = getAuthorizedClient();
    if (!client) return null;
    const tokens = getStoredTokens();
    const calendar = google.calendar({ version: 'v3', auth: client });
    const calendarId = tokens.calendar_id || 'primary';

    const event = {
      summary: `${appointment.title} — ${appointment.customer_name || appointment.customer_name_field || 'Unknown'}`,
      description: [
        appointment.customer_phone ? `Phone: ${appointment.customer_phone}` : '',
        appointment.customer_email ? `Email: ${appointment.customer_email}` : '',
        appointment.device_type ? `Device: ${[appointment.device_type, appointment.device_brand, appointment.device_model].filter(Boolean).join(' ')}` : '',
        appointment.description ? `Notes: ${appointment.description}` : '',
      ].filter(Boolean).join('\n'),
      start: { dateTime: new Date(appointment.start_time).toISOString() },
      end: { dateTime: new Date(appointment.end_time).toISOString() },
    };

    if (appointment.google_event_id) {
      const res = await calendar.events.update({ calendarId, eventId: appointment.google_event_id, resource: event });
      return res.data.id;
    } else {
      const res = await calendar.events.insert({ calendarId, resource: event });
      return res.data.id;
    }
  } catch (e) {
    console.error('Google Calendar sync error:', e.message);
    return null;
  }
}

async function syncAllCalendar() {
  const client = getAuthorizedClient();
  if (!client) return { error: 'Not connected' };
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
    return { synced, total: appts.length };
  } catch(e) {
    console.error('Sync all calendar error:', e.message);
    return { error: e.message };
  }
}

async function syncAllContacts() {
  const client = getAuthorizedClient();
  if (!client) return { error: 'Not connected' };
  try {
    const people = google.people({ version: 'v1', auth: client });
    const customers = db.prepare('SELECT * FROM customers').all();
    let synced = 0;
    for (const c of customers) {
      try {
        const contactData = {
          names: [{ givenName: c.name }],
          emailAddresses: c.email ? [{ value: c.email }] : [],
          phoneNumbers: c.phone ? [{ value: c.phone }] : [],
        };
        if (c.google_contact_id) {
          await people.people.updateContact({ resourceName: c.google_contact_id, updatePersonFields: 'names,emailAddresses,phoneNumbers', requestBody: contactData });
        } else {
          const r = await people.people.createContact({ requestBody: contactData });
          db.prepare('UPDATE customers SET google_contact_id=? WHERE id=?').run(r.data.resourceName, c.id);
        }
        synced++;
      } catch(e) {}
    }
    return { synced, total: customers.length };
  } catch(e) {
    console.error('Sync all contacts error:', e.message);
    return { error: e.message };
  }
}

async function backupToDrive() {
  const client = getAuthorizedClient();
  if (!client) return { error: 'Not connected' };
  try {
    const drive = google.drive({ version: 'v3', auth: client });
    const tokens = getStoredTokens();
    const dbPath = process.env.DB_PATH || '/data/repairshop.sqlite';
    
    const archive = archiver('zip', { zlib: { level: 6 } });
    const passThrough = new PassThrough();
    archive.pipe(passThrough);
    if (fs.existsSync(dbPath)) {
      try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch(e) {}
      archive.file(dbPath, { name: 'repairshop.sqlite' });
    }
    archive.append(JSON.stringify({ type: 'auto-drive-backup', created_at: new Date().toISOString() }, null, 2), { name: 'backup-meta.json' });
    archive.finalize();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `repairshop-auto-backup-${timestamp}.zip`;

    let folderId = tokens.drive_folder_id || '';
    if (!folderId) {
      const folderSearch = await drive.files.list({ q: "name='RepairShop Backups' and mimeType='application/vnd.google-apps.folder' and trashed=false", fields: 'files(id)' });
      if (folderSearch.data.files?.length > 0) {
        folderId = folderSearch.data.files[0].id;
      } else {
        const folder = await drive.files.create({ requestBody: { name: 'RepairShop Backups', mimeType: 'application/vnd.google-apps.folder' }, fields: 'id' });
        folderId = folder.data.id;
      }
      db.prepare('UPDATE google_tokens SET drive_folder_id=? WHERE id=1').run(folderId);
    }

    const fileRes = await drive.files.create({
      requestBody: { name: filename, parents: [folderId] },
      media: { mimeType: 'application/zip', body: passThrough },
      fields: 'id,name,webViewLink',
    });
    return { ok: true, file_id: fileRes.data.id, name: fileRes.data.name };
  } catch(e) {
    console.error('Drive backup error:', e.message);
    return { error: e.message };
  }
}

module.exports = {
  getOAuth2Client,
  getAuthorizedClient,
  syncToGoogleCalendar,
  syncAllCalendar,
  syncAllContacts,
  backupToDrive
};
