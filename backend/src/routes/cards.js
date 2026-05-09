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

  const enriched = cards.map(card => ({
    ...card,
    utilization_percent: card.credit_limit > 0
      ? Math.min(100, (card.current_balance / card.credit_limit) * 100).toFixed(1)
      : 0,
    available_credit: Math.max(0, card.credit_limit - card.current_balance),
  }));

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
  const { nickname, bank_name, last_four, credit_limit, billing_date, due_date, interest_rate, notes, color, card_type } = req.body;
  const id = uuidv4();

  db.prepare(`
    INSERT INTO credit_cards (id, user_id, nickname, bank_name, last_four, credit_limit, billing_date, due_date, interest_rate, notes, color, card_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.id, nickname, bank_name, last_four, credit_limit, billing_date || null, due_date || null, interest_rate || null, notes || null, color || '#6366f1', card_type || 'credit');

  const card = db.prepare('SELECT * FROM credit_cards WHERE id = ?').get(id);
  res.status(201).json({ card });
});

// UPDATE card
router.put('/:id', cardValidators, validate, (req, res) => {
  const db = getDb();
  const card = db.prepare('SELECT id FROM credit_cards WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });

  const { nickname, bank_name, last_four, credit_limit, billing_date, due_date, interest_rate, notes, color, card_type, is_active } = req.body;

  db.prepare(`
    UPDATE credit_cards SET
      nickname = ?, bank_name = ?, last_four = ?, credit_limit = ?,
      billing_date = ?, due_date = ?, interest_rate = ?, notes = ?,
      color = ?, card_type = ?, is_active = ?,
      updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(nickname, bank_name, last_four, credit_limit, billing_date || null, due_date || null,
    interest_rate || null, notes || null, color || '#6366f1', card_type || 'credit',
    is_active !== undefined ? is_active : 1, req.params.id, req.user.id);

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
