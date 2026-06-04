const express = require('express');
const { body, validationResult } = require('express-validator');
const webpush = require('web-push');
const { getDb } = require('../models/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

webpush.setVapidDetails(
  'mailto:' + (process.env.VAPID_EMAIL || 'admin@debtwise.app'),
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// GET /api/reminders — all reminders for user, upcoming first
router.get('/', (req, res) => {
  const db = getDb();
  const reminders = db.prepare(`
    SELECT r.*, c.nickname as card_nickname, c.bank_name, c.color as card_color
    FROM reminders r
    LEFT JOIN credit_cards c ON r.card_id = c.id
    WHERE r.user_id = ?
    ORDER BY r.is_done ASC, r.due_date ASC
  `).all(req.user.id);
  res.json({ reminders });
});

// GET /api/reminders/upcoming — due within 3 days or overdue, not done
router.get('/upcoming', (req, res) => {
  const db = getDb();
  const reminders = db.prepare(`
    SELECT r.*, c.nickname as card_nickname, c.bank_name, c.color as card_color
    FROM reminders r
    LEFT JOIN credit_cards c ON r.card_id = c.id
    WHERE r.user_id = ? AND r.is_done = 0
      AND r.due_date <= date('now', '+3 days')
    ORDER BY r.due_date ASC
  `).all(req.user.id);
  res.json({ reminders });
});

// POST /api/reminders
router.post('/', [
  body('title').trim().notEmpty().withMessage('Title required'),
  body('due_date').isISO8601().withMessage('Valid due date required'),
  body('type').optional().isIn(['statement', 'payment', 'annual_fee', 'custom']),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: 'Validation failed', details: errors.array() });

  const db = getDb();
  const { title, notes, due_date, type = 'custom', card_id } = req.body;
  const id = require('crypto').randomUUID();
  db.prepare(`
    INSERT INTO reminders (id, user_id, card_id, title, notes, due_date, type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.id, card_id || null, title, notes || null, due_date, type);

  const reminder = db.prepare(`
    SELECT r.*, c.nickname as card_nickname, c.bank_name, c.color as card_color
    FROM reminders r LEFT JOIN credit_cards c ON r.card_id = c.id
    WHERE r.id = ?
  `).get(id);
  res.status(201).json({ reminder });
});

// PATCH /api/reminders/:id
router.patch('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM reminders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Reminder not found' });

  const { title, notes, due_date, type, is_done, card_id } = req.body;
  db.prepare(`
    UPDATE reminders SET
      title = COALESCE(?, title),
      notes = COALESCE(?, notes),
      due_date = COALESCE(?, due_date),
      type = COALESCE(?, type),
      is_done = COALESCE(?, is_done),
      card_id = COALESCE(?, card_id),
      updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(title ?? null, notes ?? null, due_date ?? null, type ?? null, is_done ?? null, card_id ?? null, req.params.id, req.user.id);

  const reminder = db.prepare(`
    SELECT r.*, c.nickname as card_nickname, c.bank_name, c.color as card_color
    FROM reminders r LEFT JOIN credit_cards c ON r.card_id = c.id
    WHERE r.id = ?
  `).get(req.params.id);
  res.json({ reminder });
});

// DELETE /api/reminders/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM reminders WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (!result.changes) return res.status(404).json({ error: 'Reminder not found' });
  res.json({ success: true });
});

// POST /api/reminders/push/subscribe
router.post('/push/subscribe', (req, res) => {
  const db = getDb();
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(422).json({ error: 'Invalid subscription' });

  db.prepare(`
    INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth
  `).run(require('crypto').randomUUID(), req.user.id, endpoint, keys.p256dh, keys.auth);
  res.json({ success: true });
});

// DELETE /api/reminders/push/unsubscribe
router.delete('/push/unsubscribe', (req, res) => {
  const db = getDb();
  const { endpoint } = req.body;
  if (endpoint) db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, req.user.id);
  res.json({ success: true });
});

// POST /api/reminders/push/send-due — called on app load to send due push notifications
router.post('/push/send-due', async (req, res) => {
  const db = getDb();
  const due = db.prepare(`
    SELECT r.*, c.nickname as card_nickname
    FROM reminders r
    LEFT JOIN credit_cards c ON r.card_id = c.id
    WHERE r.user_id = ? AND r.is_done = 0
      AND r.due_date <= date('now', '+3 days')
      AND r.due_date >= date('now')
  `).all(req.user.id);

  if (!due.length || !process.env.VAPID_PUBLIC_KEY) return res.json({ sent: 0 });

  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(req.user.id);
  let sent = 0;
  for (const reminder of due) {
    const daysUntil = Math.ceil((new Date(reminder.due_date) - new Date()) / 86400000);
    const title = daysUntil === 0 ? `Due today: ${reminder.title}` : `Due in ${daysUntil}d: ${reminder.title}`;
    const body = reminder.card_nickname ? `${reminder.card_nickname} · ${reminder.due_date}` : reminder.due_date;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body, icon: '/financial-app/icon-192.png' })
        );
        sent++;
      } catch (e) {
        if (e.statusCode === 410) db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(sub.endpoint);
      }
    }
  }
  res.json({ sent });
});

module.exports = router;
