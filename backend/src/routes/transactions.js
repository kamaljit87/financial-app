const express = require('express');
const { body, query } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../models/database');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();
router.use(authenticate);

const txnValidators = [
  body('title').trim().isLength({ min: 1, max: 100 }).escape(),
  body('amount').isFloat({ min: 0.01 }),
  body('transaction_type').isIn(['purchase', 'emi', 'payment', 'refund', 'fee', 'cashback']),
  body('category').trim().isLength({ min: 1, max: 50 }).escape(),
  body('date').isISO8601(),
  body('card_id').optional({ nullable: true }).isUUID(),
  body('notes').optional().trim().isLength({ max: 500 }).escape(),
  body('tags').optional().isArray(),
  body('is_recurring').optional().isBoolean(),
  body('reference_number').optional().trim().isLength({ max: 50 }).escape(),
];

const VALID_CATEGORIES = ['food', 'transport', 'shopping', 'utilities', 'healthcare', 'entertainment', 'education', 'travel', 'emi', 'payment', 'fuel', 'groceries', 'dining', 'subscriptions', 'insurance', 'rent', 'other'];

// GET all transactions with filters and pagination
router.get('/', (req, res) => {
  const db = getDb();
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const offset = (page - 1) * limit;

  const conditions = ['t.user_id = ?'];
  const params = [req.user.id];

  if (req.query.card_id) { conditions.push('t.card_id = ?'); params.push(req.query.card_id); }
  if (req.query.type) { conditions.push('t.transaction_type = ?'); params.push(req.query.type); }
  if (req.query.category) { conditions.push('t.category = ?'); params.push(req.query.category); }
  if (req.query.start_date) { conditions.push('t.date >= ?'); params.push(req.query.start_date); }
  if (req.query.end_date) { conditions.push('t.date <= ?'); params.push(req.query.end_date); }
  if (req.query.search) { conditions.push('t.title LIKE ?'); params.push(`%${req.query.search}%`); }
  if (req.query.min_amount) { conditions.push('t.amount >= ?'); params.push(parseFloat(req.query.min_amount)); }
  if (req.query.max_amount) { conditions.push('t.amount <= ?'); params.push(parseFloat(req.query.max_amount)); }

  const whereClause = conditions.join(' AND ');

  const total = db.prepare(`
    SELECT COUNT(*) as count FROM transactions t WHERE ${whereClause}
  `).get(...params).count;

  const transactions = db.prepare(`
    SELECT t.*, c.nickname as card_nickname, c.bank_name, c.last_four, c.color as card_color
    FROM transactions t
    LEFT JOIN credit_cards c ON c.id = t.card_id
    WHERE ${whereClause}
    ORDER BY t.date DESC, t.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({
    transactions: transactions.map(t => ({ ...t, tags: JSON.parse(t.tags || '[]') })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// GET single transaction
router.get('/:id', (req, res) => {
  const db = getDb();
  const txn = db.prepare(`
    SELECT t.*, c.nickname as card_nickname, c.bank_name, c.last_four
    FROM transactions t
    LEFT JOIN credit_cards c ON c.id = t.card_id
    WHERE t.id = ? AND t.user_id = ?
  `).get(req.params.id, req.user.id);

  if (!txn) return res.status(404).json({ error: 'Transaction not found' });
  res.json({ transaction: { ...txn, tags: JSON.parse(txn.tags || '[]') } });
});

// CREATE transaction
router.post('/', txnValidators, validate, (req, res) => {
  const db = getDb();
  const { title, amount, transaction_type, category, date, card_id, notes, tags, is_recurring, reference_number } = req.body;

  if (card_id) {
    const card = db.prepare('SELECT id, current_balance, credit_limit FROM credit_cards WHERE id = ? AND user_id = ?')
      .get(card_id, req.user.id);
    if (!card) return res.status(404).json({ error: 'Card not found' });

    // Update card balance
    let balanceChange = 0;
    if (['purchase', 'emi', 'fee'].includes(transaction_type)) balanceChange = amount;
    else if (['payment', 'refund', 'cashback'].includes(transaction_type)) balanceChange = -amount;

    const newBalance = Math.max(0, card.current_balance + balanceChange);
    db.prepare(`UPDATE credit_cards SET current_balance = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(newBalance, card_id);
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO transactions (id, user_id, card_id, title, amount, transaction_type, category, date, notes, tags, is_recurring, reference_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.id, card_id || null, title, amount, transaction_type, category || 'other', date,
    notes || null, JSON.stringify(tags || []), is_recurring ? 1 : 0, reference_number || null);

  const txn = db.prepare(`
    SELECT t.*, c.nickname as card_nickname FROM transactions t
    LEFT JOIN credit_cards c ON c.id = t.card_id WHERE t.id = ?
  `).get(id);

  res.status(201).json({ transaction: { ...txn, tags: JSON.parse(txn.tags || '[]') } });
});

// UPDATE transaction
router.put('/:id', txnValidators, validate, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Transaction not found' });

  const { title, amount, transaction_type, category, date, card_id, notes, tags, is_recurring, reference_number } = req.body;

  // Reverse old balance effect
  if (existing.card_id) {
    const oldCard = db.prepare('SELECT current_balance FROM credit_cards WHERE id = ?').get(existing.card_id);
    if (oldCard) {
      let reversal = 0;
      if (['purchase', 'emi', 'fee'].includes(existing.transaction_type)) reversal = -existing.amount;
      else if (['payment', 'refund', 'cashback'].includes(existing.transaction_type)) reversal = existing.amount;
      db.prepare(`UPDATE credit_cards SET current_balance = MAX(0, current_balance + ?), updated_at = datetime('now') WHERE id = ?`)
        .run(reversal, existing.card_id);
    }
  }

  // Apply new balance effect
  const targetCardId = card_id || null;
  if (targetCardId) {
    const newCard = db.prepare('SELECT current_balance FROM credit_cards WHERE id = ? AND user_id = ?').get(targetCardId, req.user.id);
    if (newCard) {
      let change = 0;
      if (['purchase', 'emi', 'fee'].includes(transaction_type)) change = amount;
      else if (['payment', 'refund', 'cashback'].includes(transaction_type)) change = -amount;
      db.prepare(`UPDATE credit_cards SET current_balance = MAX(0, current_balance + ?), updated_at = datetime('now') WHERE id = ?`)
        .run(change, targetCardId);
    }
  }

  db.prepare(`
    UPDATE transactions SET title=?, amount=?, transaction_type=?, category=?, date=?, card_id=?,
      notes=?, tags=?, is_recurring=?, reference_number=?, updated_at=datetime('now')
    WHERE id = ?
  `).run(title, amount, transaction_type, category || 'other', date, targetCardId,
    notes || null, JSON.stringify(tags || []), is_recurring ? 1 : 0, reference_number || null, req.params.id);

  const updated = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  res.json({ transaction: { ...updated, tags: JSON.parse(updated.tags || '[]') } });
});

// DELETE transaction
router.delete('/:id', (req, res) => {
  const db = getDb();
  const txn = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!txn) return res.status(404).json({ error: 'Transaction not found' });

  // Reverse balance effect
  if (txn.card_id) {
    let reversal = 0;
    if (['purchase', 'emi', 'fee'].includes(txn.transaction_type)) reversal = -txn.amount;
    else if (['payment', 'refund', 'cashback'].includes(txn.transaction_type)) reversal = txn.amount;
    if (reversal !== 0) {
      db.prepare(`UPDATE credit_cards SET current_balance = MAX(0, current_balance + ?), updated_at = datetime('now') WHERE id = ?`)
        .run(reversal, txn.card_id);
    }
  }

  db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
  res.json({ message: 'Transaction deleted' });
});

// GET categories
router.get('/meta/categories', (req, res) => {
  res.json({ categories: VALID_CATEGORIES });
});

// GET monthly summary
router.get('/stats/monthly', (req, res) => {
  const db = getDb();
  const year = req.query.year || new Date().getFullYear();
  const month = req.query.month || new Date().getMonth() + 1;
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  const stats = db.prepare(`
    SELECT
      transaction_type,
      category,
      SUM(amount) as total,
      COUNT(*) as count
    FROM transactions
    WHERE user_id = ? AND strftime('%Y-%m', date) = ?
    GROUP BY transaction_type, category
  `).all(req.user.id, monthStr);

  res.json({ stats, month: monthStr });
});

module.exports = router;
