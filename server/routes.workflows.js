const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const auth = require('./auth.middleware');
router.use(auth);

// ── TEMPLATES ──
router.get('/templates', (req, res) => {
  const templates = db.prepare('SELECT * FROM workflow_templates ORDER BY name').all();
  const withSteps = templates.map(t => ({
    ...t,
    steps: db.prepare('SELECT * FROM workflow_steps WHERE template_id=? ORDER BY step_order').all(t.id).map(s => ({
      ...s, action_config: JSON.parse(s.action_config || '{}')
    }))
  }));
  res.json(withSteps);
});

router.post('/templates', (req, res) => {
  const { name, description, trigger_status, steps } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = uuidv4();
  db.prepare('INSERT INTO workflow_templates (id,name,description,trigger_status) VALUES (?,?,?,?)')
    .run(id, name, description || '', trigger_status || 'intake');

  if (steps?.length) {
    const stmt = db.prepare('INSERT INTO workflow_steps (id,template_id,step_order,action_type,action_config,delay_hours) VALUES (?,?,?,?,?,?)');
    steps.forEach((s, i) => stmt.run(uuidv4(), id, i, s.action_type, JSON.stringify(s.action_config || {}), s.delay_hours || 0));
  }
  res.json(db.prepare('SELECT * FROM workflow_templates WHERE id=?').get(id));
});

router.put('/templates/:id', (req, res) => {
  const { name, description, trigger_status, active, steps } = req.body;
  db.prepare('UPDATE workflow_templates SET name=?,description=?,trigger_status=?,active=? WHERE id=?')
    .run(name, description || '', trigger_status || 'intake', active !== false ? 1 : 0, req.params.id);

  if (steps) {
    db.prepare('DELETE FROM workflow_steps WHERE template_id=?').run(req.params.id);
    const stmt = db.prepare('INSERT INTO workflow_steps (id,template_id,step_order,action_type,action_config,delay_hours) VALUES (?,?,?,?,?,?)');
    steps.forEach((s, i) => stmt.run(uuidv4(), req.params.id, i, s.action_type, JSON.stringify(s.action_config || {}), s.delay_hours || 0));
  }
  res.json(db.prepare('SELECT * FROM workflow_templates WHERE id=?').get(req.params.id));
});

router.delete('/templates/:id', (req, res) => {
  db.prepare('DELETE FROM workflow_steps WHERE template_id=?').run(req.params.id);
  db.prepare('DELETE FROM workflow_templates WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── TRIGGER: run workflows when repair status changes ──
router.post('/trigger', (req, res) => {
  const { repair_id, status } = req.body;
  if (!repair_id || !status) return res.status(400).json({ error: 'repair_id and status required' });

  const repair = db.prepare('SELECT r.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email FROM repairs r JOIN customers c ON r.customer_id=c.id WHERE r.id=?').get(repair_id);
  if (!repair) return res.status(404).json({ error: 'Repair not found' });

  const templates = db.prepare('SELECT t.*, s.id as step_id, s.action_type, s.action_config, s.delay_hours, s.step_order FROM workflow_templates t JOIN workflow_steps s ON s.template_id=t.id WHERE t.trigger_status=? AND t.active=1 ORDER BY t.id, s.step_order').all(status);

  const runs = [];
  templates.forEach(step => {
    const config = JSON.parse(step.action_config || '{}');
    const scheduledFor = new Date(Date.now() + (step.delay_hours || 0) * 3600000);
    const runId = uuidv4();
    db.prepare('INSERT INTO workflow_runs (id,template_id,repair_id,step_id,status,scheduled_for) VALUES (?,?,?,?,?,?)')
      .run(runId, step.template_id || step.id, repair_id, step.step_id || step.id, step.delay_hours > 0 ? 'pending' : 'running', scheduledFor.toISOString());

    // Execute immediately if no delay
    if (step.delay_hours === 0) {
      executeStep(step.action_type, config, repair, runId);
    }
    runs.push({ runId, action: step.action_type, delay: step.delay_hours });
  });

  res.json({ triggered: runs.length, runs });
});

// ── RUNS / HISTORY ──
router.get('/runs', (req, res) => {
  const { repair_id } = req.query;
  let sql = 'SELECT r.*, t.name as template_name FROM workflow_runs r LEFT JOIN workflow_templates t ON r.template_id=t.id WHERE 1=1';
  const params = [];
  if (repair_id) { sql += ' AND r.repair_id=?'; params.push(repair_id); }
  sql += ' ORDER BY r.created_at DESC LIMIT 200';
  res.json(db.prepare(sql).all(...params));
});

// ── EXECUTE (for cron / immediate) ──
function executeStep(actionType, config, repair, runId) {
  try {
    switch (actionType) {
      case 'create_reminder': {
        const daysFromNow = config.days || 1;
        const dueDate = new Date(Date.now() + daysFromNow * 86400000).toISOString();
        db.prepare('INSERT INTO reminders (id,customer_id,repair_id,message,due_date,status,type) VALUES (?,?,?,?,?,?,?)')
          .run(uuidv4(), repair.customer_id, repair.id, config.message || 'Follow up with customer', dueDate, 'pending', 'followup');
        break;
      }
      case 'create_notification': {
        db.prepare('INSERT INTO notifications (id,user_id,type,title,body,link) VALUES (?,?,?,?,?,?)')
          .run(uuidv4(), '', config.type || 'info', config.title || 'Workflow notification', (config.body || '').replace('{{customer}}', repair.customer_name).replace('{{title}}', repair.title), `/repairs/${repair.id}`);
        break;
      }
      case 'update_status': {
        if (config.status) {
          db.prepare('UPDATE repairs SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(config.status, repair.id);
        }
        break;
      }
      case 'assign_tech': {
        if (config.user_id) {
          db.prepare('INSERT INTO notifications (id,user_id,type,title,body,link) VALUES (?,?,?,?,?,?)')
            .run(uuidv4(), config.user_id, 'assignment', `Assigned: ${repair.title}`, `${repair.customer_name} — ${repair.device_brand || ''} ${repair.device_model || ''}`.trim(), `/repairs/${repair.id}`);
        }
        break;
      }
    }
    db.prepare('UPDATE workflow_runs SET status=?,executed_at=CURRENT_TIMESTAMP WHERE id=?').run('completed', runId);
  } catch(e) {
    db.prepare('UPDATE workflow_runs SET status=? WHERE id=?').run('failed', runId);
    console.error('[Workflow] Step failed:', e.message);
  }
}

module.exports = router;
module.exports.executeStep = executeStep;
