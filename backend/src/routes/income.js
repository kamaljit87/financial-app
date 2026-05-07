const express = require('express');
const { body } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../models/database');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();
router.use(authenticate);

const incomeValidators = [
  body('source').trim().isLength({ min: 1, max: 100 }).escape(),
  body('amount').isFloat({ min: 0.01 }),
  body('income_type').isIn(['salary', 'freelance', 'side_income', 'bonus', 'investment', 'rental', 'gift', 'other']),
  body('date').isISO8601(),
  body('category').optional().trim().isLength({ max: 50 }).escape(),
  body('notes').optional().trim().isLength({ max: 500 }).escape(),
  body('tags').optional().isArray(),
  body('is_recurring').optional().isBoolean(),
];

// GET all income entries
router.get('/', (req, res) => {
  const db = getDb();
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const offset = (page - 1) * limit;

  const conditions = ['user_id = ?'];
  const params = [req.user.id];

  if (req.query.type) { conditions.push('income_type = ?'); params.push(req.query.type); }
  if (req.query.start_date) { conditions.push('date >= ?'); params.push(req.query.start_date); }
  if (req.query.end_date) { conditions.push('date <= ?'); params.push(req.query.end_date); }
  if (req.query.search) { conditions.push('source LIKE ?'); params.push(`%${req.query.search}%`); }

  const whereClause = conditions.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) as count FROM income_entries WHERE ${whereClause}`).get(...params).count;

  const entries = db.prepare(`
    SELECT * FROM income_entries WHERE ${whereClause}
    ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({
    income: entries.map(e => ({ ...e, tags: JSON.parse(e.tags || '[]') })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// GET monthly income summary
router.get('/summary/monthly', (req, res) => {
  const db = getDb();
  const months = parseInt(req.query.months) || 6;

  const summary = db.prepare(`
    SELECT
      strftime('%Y-%m', date) as month,
      income_type,
      SUM(amount) as total,
      COUNT(*) as count
    FROM income_entries
    WHERE user_id = ? AND date >= date('now', '-' || ? || ' months')
    GROUP BY strftime('%Y-%m', date), income_type
    ORDER BY month DESC
  `).all(req.user.id, months);

  res.json({ summary });
});

// CREATE income entry
router.post('/', incomeValidators, validate, (req, res) => {
  const db = getDb();
  const { source, amount, income_type, date, category, notes, tags, is_recurring } = req.body;
  const id = uuidv4();

  db.prepare(`
    INSERT INTO income_entries (id, user_id, source, amount, income_type, date, category, notes, tags, is_recurring)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.id, source, amount, income_type, date, category || income_type,
    notes || null, JSON.stringify(tags || []), is_recurring ? 1 : 0);

  const entry = db.prepare('SELECT * FROM income_entries WHERE id = ?').get(id);
  res.status(201).json({ income: { ...entry, tags: JSON.parse(entry.tags || '[]') } });
});

// UPDATE income entry
router.put('/:id', incomeValidators, validate, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM income_entries WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Income entry not found' });

  const { source, amount, income_type, date, category, notes, tags, is_recurring } = req.body;

  db.prepare(`
    UPDATE income_entries SET source=?, amount=?, income_type=?, date=?, category=?, notes=?, tags=?, is_recurring=?, updated_at=datetime('now')
    WHERE id = ?
  `).run(source, amount, income_type, date, category || income_type, notes || null,
    JSON.stringify(tags || []), is_recurring ? 1 : 0, req.params.id);

  const updated = db.prepare('SELECT * FROM income_entries WHERE id = ?').get(req.params.id);
  res.json({ income: { ...updated, tags: JSON.parse(updated.tags || '[]') } });
});

// DELETE income entry
router.delete('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM income_entries WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Income entry not found' });

  db.prepare('DELETE FROM income_entries WHERE id = ?').run(req.params.id);
  res.json({ message: 'Income entry deleted' });
});

module.exports = router;
