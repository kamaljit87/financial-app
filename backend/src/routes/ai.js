const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { getDb } = require('../models/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function getClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured');
  return new Anthropic({ apiKey: key });
}

// POST /api/ai/card-benefits/:id — fetch and save AI-generated benefits for one card
router.post('/card-benefits/:id', async (req, res) => {
  const db = getDb();
  const card = db.prepare('SELECT * FROM credit_cards WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });

  try {
    const client = getClient();
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `You are a credit card expert for India. Based on the card details below, list the key benefits of this card in a concise, factual format. Focus on: rewards/cashback rates, welcome bonus, annual fee, lounge access, fuel surcharge waiver, and any notable perks. If you are not confident about this specific card variant, say so and give general information about the bank's card range.

Card nickname: ${card.nickname}
Bank: ${card.bank_name}
Card type: ${card.card_type}
Credit limit: ₹${card.credit_limit}

Respond ONLY with a plain text list of benefits, 1 per line, starting with a dash. No headers, no preamble. Maximum 10 lines.`,
      }],
    });

    const benefits = message.content[0].text.trim();
    db.prepare(`UPDATE credit_cards SET benefits = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(benefits, card.id);

    res.json({ benefits });
  } catch (err) {
    if (err.message === 'ANTHROPIC_API_KEY not configured') {
      return res.status(503).json({ error: 'AI features not configured. Add ANTHROPIC_API_KEY to your .env file.' });
    }
    res.status(500).json({ error: 'AI request failed', details: err.message });
  }
});

// GET /api/ai/recommendations — analyze all cards + spending and recommend best/worst
router.get('/recommendations', async (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  const cards = db.prepare(`SELECT * FROM credit_cards WHERE user_id = ? AND is_active = 1`).all(userId);
  if (!cards.length) return res.json({ recommendations: null, message: 'No active cards to analyze.' });

  // Spending by category per card over last 3 months
  const spending = db.prepare(`
    SELECT card_id, category, SUM(amount) as total, COUNT(*) as count
    FROM transactions
    WHERE user_id = ? AND transaction_type IN ('purchase','emi','fee')
      AND date >= date('now', '-3 months')
    GROUP BY card_id, category
    ORDER BY card_id, total DESC
  `).all(userId);

  // Monthly income for context
  const income = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM income_entries
    WHERE user_id = ? AND strftime('%Y-%m', date) = strftime('%Y-%m', 'now')
  `).get(userId);

  const spendingByCard = {};
  for (const row of spending) {
    if (!spendingByCard[row.card_id]) spendingByCard[row.card_id] = [];
    spendingByCard[row.card_id].push({ category: row.category, total: row.total, count: row.count });
  }

  const cardSummaries = cards.map(c => ({
    name: `${c.nickname} (${c.bank_name} ****${c.last_four})`,
    credit_limit: c.credit_limit,
    current_balance: c.current_balance,
    interest_rate: c.interest_rate,
    annual_fee_implied: null,
    benefits: c.benefits || 'Not specified',
    spending_last_3mo: spendingByCard[c.id] || [],
  }));

  const prompt = `You are a personal finance advisor for India. Analyze the following credit cards and spending data, then provide clear recommendations.

Monthly income: ₹${income.total.toLocaleString('en-IN')}

Cards:
${cardSummaries.map((c, i) => `
Card ${i + 1}: ${c.name}
  Credit limit: ₹${c.credit_limit.toLocaleString('en-IN')}
  Current balance: ₹${c.current_balance.toLocaleString('en-IN')}
  Interest rate: ${c.interest_rate ? c.interest_rate + '%' : 'Unknown'}
  Known benefits: ${c.benefits}
  Spending last 3 months by category: ${c.spending_last_3mo.length ? c.spending_last_3mo.map(s => `${s.category}: ₹${Math.round(s.total).toLocaleString('en-IN')}`).join(', ') : 'No transactions'}
`).join('')}

Provide your analysis in this exact JSON format (no markdown, no explanation outside JSON):
{
  "best_cards": [
    { "card_name": "...", "reason": "..." }
  ],
  "worst_cards": [
    { "card_name": "...", "reason": "..." }
  ],
  "best_use_per_card": [
    { "card_name": "...", "best_for": "...", "tip": "..." }
  ],
  "overall_advice": "2-3 sentence summary of the user's card portfolio and key action items."
}`;

  try {
    const client = getClient();
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].text.trim();
    let recommendations;
    try {
      recommendations = JSON.parse(raw);
    } catch {
      // Try to extract JSON if model added surrounding text
      const match = raw.match(/\{[\s\S]*\}/);
      recommendations = match ? JSON.parse(match[0]) : null;
    }

    if (!recommendations) return res.status(500).json({ error: 'Failed to parse AI response' });
    res.json({ recommendations });
  } catch (err) {
    if (err.message === 'ANTHROPIC_API_KEY not configured') {
      return res.status(503).json({ error: 'AI features not configured. Add ANTHROPIC_API_KEY to your .env file.' });
    }
    res.status(500).json({ error: 'AI request failed', details: err.message });
  }
});

// PATCH /api/ai/card-benefits/:id — manually update benefits text
router.patch('/card-benefits/:id', (req, res) => {
  const db = getDb();
  const { benefits } = req.body;
  if (typeof benefits !== 'string') return res.status(400).json({ error: 'benefits must be a string' });

  const card = db.prepare('SELECT id FROM credit_cards WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });

  db.prepare(`UPDATE credit_cards SET benefits = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(benefits, req.params.id);
  res.json({ message: 'Benefits updated' });
});

module.exports = router;
