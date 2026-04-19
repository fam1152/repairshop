const router = require('express').Router();
const axios = require('axios');
const db = require('./db');
const auth = require('./auth.middleware');

router.use(auth);

// Helper to send email via External API
async function sendEmail({ to, subject, html, text }) {
  const settings = db.prepare('SELECT email, email_provider, email_api_key, company_name FROM settings WHERE id=1').get();
  
  if (!settings.email_api_key) {
    throw new Error('Email API key not configured in Settings.');
  }

  const from = `${settings.company_name} <${settings.email}>`;

  if (settings.email_provider === 'resend') {
    return axios.post('https://api.resend.com/emails', {
      from,
      to: [to],
      subject,
      html: html || text,
    }, {
      headers: {
        'Authorization': `Bearer ${settings.email_api_key}`,
        'Content-Type': 'application/json',
      }
    });
  } else if (settings.email_provider === 'sendgrid') {
    return axios.post('https://api.sendgrid.com/v3/mail/send', {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: settings.email, name: settings.company_name },
      subject,
      content: [{ type: 'text/html', value: html || text }]
    }, {
      headers: {
        'Authorization': `Bearer ${settings.email_api_key}`,
        'Content-Type': 'application/json',
      }
    });
  } else {
    throw new Error('Unsupported email provider');
  }
}

// Send an invoice by email
router.post('/send-invoice', async (req, res) => {
  const { invoice_id, email, subject, message } = req.body;
  if (!invoice_id || !email) return res.status(400).json({ error: 'invoice_id and email required' });

  try {
    const invoice = db.prepare(`SELECT i.*, c.name as customer_name FROM invoices i JOIN customers c ON i.customer_id=c.id WHERE i.id=?`).get(invoice_id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const emailSubject = subject || `Invoice #${invoice.invoice_number} from ${invoice.customer_name}`;
    const emailBody = `
      <h3>Hello ${invoice.customer_name},</h3>
      <p>${message || 'Please find your invoice details below.'}</p>
      <hr />
      <p><strong>Invoice #:</strong> ${invoice.invoice_number}</p>
      <p><strong>Total:</strong> $${invoice.total.toFixed(2)}</p>
      <p><strong>Balance Due:</strong> $${invoice.balance_due.toFixed(2)}</p>
      <p><strong>Due Date:</strong> ${invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : 'N/A'}</p>
      <hr />
      <p>Thank you for your business!</p>
    `;

    await sendEmail({ to: email, subject: emailSubject, html: emailBody });

    // Log the communication
    const { v4: uuidv4 } = require('uuid');
    db.prepare('INSERT INTO communications (id, customer_id, repair_id, type, direction, subject, body, recipient) VALUES (?,?,?,?,?,?,?,?)')
      .run(uuidv4(), invoice.customer_id, invoice.repair_id, 'email', 'outbound', emailSubject, emailBody, email);

    res.json({ ok: true, message: 'Email sent successfully' });
  } catch (e) {
    res.status(500).json({ error: e.response?.data?.message || e.message });
  }
});

// Send a general message / document notification
router.post('/send-general', async (req, res) => {
  const { customer_id, repair_id, email, subject, body } = req.body;
  if (!customer_id || !email || !body) return res.status(400).json({ error: 'customer_id, email and body required' });

  try {
    await sendEmail({ to: email, subject, html: body });

    // Log the communication
    const { v4: uuidv4 } = require('uuid');
    db.prepare('INSERT INTO communications (id, customer_id, repair_id, type, direction, subject, body, recipient) VALUES (?,?,?,?,?,?,?,?)')
      .run(uuidv4(), customer_id, repair_id || null, 'email', 'outbound', subject, body, email);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.response?.data?.message || e.message });
  }
});

// List communications for a customer
router.get('/customer/:customerId', (req, res) => {
  const comms = db.prepare('SELECT * FROM communications WHERE customer_id=? ORDER BY created_at DESC').all(req.params.customerId);
  res.json(comms);
});

// Inbound webhook (simplified stub for the plan)
router.post('/webhook/:provider', async (req, res) => {
  const { provider } = req.params;
  // This would need specific parsing per provider (SendGrid Inbound Parse, Resend Webhooks)
  // For now, we just acknowledge. Implementation depends on user setting up the DNS/Webhook.
  res.json({ ok: true });
});

module.exports = router;
