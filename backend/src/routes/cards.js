const express = require('express');
const { body } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../models/database');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();
router.use(authenticate);

const cardValidators = [
  body('nickname').trim().isLength({ min: 1, max: 50 }).withMessage('Nickname is required (max 50 chars)'),
  body('bank_name').trim().isLength({ min: 1, max: 50 }).withMessage('Bank name is required (max 50 chars)'),
  body('last_four').trim().matches(/^\d{4}$/).withMessage('Last four digits must be exactly 4 numbers'),
  body('credit_limit').isFloat({ min: 0 }).withMessage('Credit limit must be a positive number'),
  body('billing_date').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1, max: 31 }).withMessage('Billing date must be 1-31'),
  body('due_date').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1, max: 31 }).withMessage('Due date must be 1-31'),
  body('interest_rate').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0, max: 100 }).withMessage('Interest rate must be 0-100'),
  body('notes').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 500 }).withMessage('Notes max 500 chars'),
  body('color').optional({ nullable: true, checkFalsy: true }).matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Invalid color format'),
  body('card_type').optional({ nullable: true, checkFalsy: true }).isIn(['credit', 'debit', 'prepaid']).withMessage('Invalid card type'),
  body('shared_limit_group').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Group name max 100 chars'),
  body('shared_limit_pool').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Pool limit must be a positive number'),
  body('current_balance').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Balance must be a positive number'),
];

// GET all cards
router.get('/', (req, res) => {
  const db = getDb();
  const cards = db.prepare(`
    SELECT c.*,
      COALESCE(SUM(CASE WHEN t.transaction_type IN ('purchase','emi','fee') THEN t.amount
                       WHEN t.transaction_type IN ('payment','refund','cashback') THEN -t.amount
                       ELSE 0 END), 0) as calculated_balance
    FROM credit_cards c
    LEFT JOIN transactions t ON t.card_id = c.id
    WHERE c.user_id = ?
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `).all(req.user.id);

  // Build group summaries: total balance and shared limit per group
  // Use shared_limit_pool if set, otherwise fall back to max card credit_limit
  const groupMap = {};
  for (const card of cards) {
    if (!card.shared_limit_group) continue;
    const g = card.shared_limit_group;
    if (!groupMap[g]) groupMap[g] = { total_balance: 0, shared_limit: 0, pool_limit: null, card_count: 0 };
    groupMap[g].total_balance += card.current_balance;
    groupMap[g].shared_limit = Math.max(groupMap[g].shared_limit, card.credit_limit);
    if (card.shared_limit_pool) groupMap[g].pool_limit = card.shared_limit_pool;
    groupMap[g].card_count += 1;
  }
  // Resolve final limit: manual pool > max card limit
  for (const g of Object.values(groupMap)) {
    g.shared_limit = g.pool_limit ?? g.shared_limit;
  }

  const enriched = cards.map(card => {
    const group = card.shared_limit_group ? groupMap[card.shared_limit_group] : null;
    const limitForUtil = group ? group.shared_limit : card.credit_limit;
    const balanceForUtil = group ? group.total_balance : card.current_balance;
    return {
      ...card,
      utilization_percent: limitForUtil > 0
        ? Math.min(100, (balanceForUtil / limitForUtil) * 100).toFixed(1)
        : 0,
      available_credit: group
        ? Math.max(0, group.shared_limit - group.total_balance)
        : Math.max(0, card.credit_limit - card.current_balance),
      group_summary: group || null,
    };
  });

  res.json({ cards: enriched });
});

// GET single card
router.get('/:id', (req, res) => {
  const db = getDb();
  const card = db.prepare('SELECT * FROM credit_cards WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });

  const recentTxns = db.prepare(`
    SELECT * FROM transactions WHERE card_id = ? ORDER BY date DESC LIMIT 10
  `).all(card.id);

  res.json({ card, recentTransactions: recentTxns });
});

// CREATE card
router.post('/', cardValidators, validate, (req, res) => {
  const db = getDb();
  const { nickname, bank_name, last_four, credit_limit, current_balance, billing_date, due_date, interest_rate, notes, color, card_type, shared_limit_group, shared_limit_pool } = req.body;
  const id = uuidv4();

  db.prepare(`
    INSERT INTO credit_cards (id, user_id, nickname, bank_name, last_four, credit_limit, current_balance, billing_date, due_date, interest_rate, notes, color, card_type, shared_limit_group, shared_limit_pool)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.id, nickname, bank_name, last_four, credit_limit, current_balance ?? 0, billing_date || null, due_date || null, interest_rate || null, notes || null, color || '#6366f1', card_type || 'credit', shared_limit_group || null, shared_limit_pool || null);

  const card = db.prepare('SELECT * FROM credit_cards WHERE id = ?').get(id);
  res.status(201).json({ card });
});

// UPDATE card
router.put('/:id', cardValidators, validate, (req, res) => {
  const db = getDb();
  const card = db.prepare('SELECT id FROM credit_cards WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });

  const { nickname, bank_name, last_four, credit_limit, current_balance, billing_date, due_date, interest_rate, notes, color, card_type, is_active, shared_limit_group, shared_limit_pool } = req.body;

  db.prepare(`
    UPDATE credit_cards SET
      nickname = ?, bank_name = ?, last_four = ?, credit_limit = ?, current_balance = ?,
      billing_date = ?, due_date = ?, interest_rate = ?, notes = ?,
      color = ?, card_type = ?, is_active = ?, shared_limit_group = ?, shared_limit_pool = ?,
      updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(nickname, bank_name, last_four, credit_limit, current_balance ?? 0,
    billing_date || null, due_date || null,
    interest_rate || null, notes || null, color || '#6366f1', card_type || 'credit',
    is_active !== undefined ? is_active : 1, shared_limit_group || null, shared_limit_pool || null,
    req.params.id, req.user.id);

  const updated = db.prepare('SELECT * FROM credit_cards WHERE id = ?').get(req.params.id);
  res.json({ card: updated });
});

// UPDATE card balance manually
router.patch('/:id/balance', (req, res) => {
  const db = getDb();
  const { current_balance } = req.body;
  if (typeof current_balance !== 'number' || current_balance < 0) {
    return res.status(400).json({ error: 'Invalid balance value' });
  }

  const card = db.prepare('SELECT id, credit_limit FROM credit_cards WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });

  db.prepare(`UPDATE credit_cards SET current_balance = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(current_balance, req.params.id);

  res.json({ message: 'Balance updated', current_balance });
});

// DELETE card
router.delete('/:id', (req, res) => {
  const db = getDb();
  const card = db.prepare('SELECT id FROM credit_cards WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });

  db.prepare('DELETE FROM credit_cards WHERE id = ?').run(req.params.id);
  res.json({ message: 'Card deleted successfully' });
});

module.exports = router;
