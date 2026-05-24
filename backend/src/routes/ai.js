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

async function fetchUrlText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DebtWise/1.0)' },
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
  if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status}`);
  const html = await res.text();
  // Strip tags and collapse whitespace — keep it under ~6000 chars to fit context
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 6000);
  return text;
}

// POST /api/ai/card-benefits/:id — fetch and save AI-generated benefits for one card
// Body: { url?: string }  — optional URL to read benefits from
router.post('/card-benefits/:id', async (req, res) => {
  const db = getDb();
  const card = db.prepare('SELECT * FROM credit_cards WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });

  const { url } = req.body;

  // Validate URL if provided
  if (url) {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    } catch {
      return res.status(400).json({ error: 'Invalid URL. Must start with http:// or https://' });
    }
  }

  try {
    const client = getClient();

    let pageContent = '';
    let urlFailed = false;
    if (url) {
      try {
        pageContent = await fetchUrlText(url);
      } catch (fetchErr) {
        // Bank websites often block scrapers — fall back to AI knowledge and warn
        urlFailed = true;
      }
    }

    const prompt = (url && !urlFailed)
      ? `You are a credit card expert for India. The following is the text content of a card benefits page. Extract the key benefits and fees for this card in a concise list.

Card: ${card.nickname} (${card.bank_name})
Page content:
${pageContent}

Respond ONLY with a plain text list, 1 benefit/fee per line, starting with a dash. Focus on: rewards/cashback rates, annual fee, joining fee, welcome bonus, lounge access, fuel surcharge waiver, and notable perks. Maximum 12 lines. No headers, no preamble.`
      : `You are a credit card expert for India. Based on the card details below, list the key benefits of this card in a concise, factual format. Focus on: rewards/cashback rates, welcome bonus, annual fee, lounge access, fuel surcharge waiver, and any notable perks. If you are not confident about this specific card variant, say so and give general information about the bank's card range.

Card nickname: ${card.nickname}
Bank: ${card.bank_name}
Card type: ${card.card_type}
Credit limit: ₹${card.credit_limit}

Respond ONLY with a plain text list of benefits, 1 per line, starting with a dash. No headers, no preamble. Maximum 10 lines.`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    });

    const benefits = message.content[0].text.trim();
    db.prepare(`UPDATE credit_cards SET benefits = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(benefits, card.id);

    res.json({ benefits, url_blocked: urlFailed });
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

  // Spending by category per card over last 6 months
  const spending = db.prepare(`
    SELECT card_id, category, SUM(amount) as total, COUNT(*) as txn_count
    FROM transactions
    WHERE user_id = ? AND transaction_type IN ('purchase','emi','fee')
      AND date >= date('now', '-6 months')
    GROUP BY card_id, category
    ORDER BY card_id, total DESC
  `).all(userId);

  // Total spend and payments per card last 6 months
  const cardStats = db.prepare(`
    SELECT
      card_id,
      SUM(CASE WHEN transaction_type IN ('purchase','emi','fee') THEN amount ELSE 0 END) as total_spent,
      SUM(CASE WHEN transaction_type IN ('payment','cashback','refund') THEN amount ELSE 0 END) as total_paid,
      COUNT(CASE WHEN transaction_type IN ('purchase','emi','fee') THEN 1 END) as txn_count
    FROM transactions
    WHERE user_id = ? AND date >= date('now', '-6 months')
    GROUP BY card_id
  `).all(userId);

  // Monthly income (last 3 months average for stability)
  const income = db.prepare(`
    SELECT COALESCE(AVG(monthly), 0) as avg_monthly FROM (
      SELECT strftime('%Y-%m', date) as month, SUM(amount) as monthly
      FROM income_entries WHERE user_id = ? AND date >= date('now', '-3 months')
      GROUP BY month
    )
  `).get(userId);

  // Total debt context
  const debtSummary = db.prepare(`
    SELECT SUM(current_balance) as total_debt, SUM(credit_limit) as total_limit
    FROM credit_cards WHERE user_id = ? AND is_active = 1
  `).get(userId);

  const spendingByCard = {};
  for (const row of spending) {
    if (!spendingByCard[row.card_id]) spendingByCard[row.card_id] = [];
    spendingByCard[row.card_id].push(row);
  }

  const statsByCard = {};
  for (const row of cardStats) statsByCard[row.card_id] = row;

  const cardSummaries = cards.map(c => {
    const stats = statsByCard[c.id] || { total_spent: 0, total_paid: 0, txn_count: 0 };
    const utilization = c.credit_limit > 0 ? ((c.current_balance / c.credit_limit) * 100).toFixed(1) : 0;
    const topCategories = (spendingByCard[c.id] || []).slice(0, 5);
    return {
      name: `${c.nickname} (${c.bank_name} ****${c.last_four})`,
      credit_limit: c.credit_limit,
      current_balance: c.current_balance,
      utilization_pct: utilization,
      interest_rate: c.interest_rate,
      benefits: c.benefits || 'Not provided',
      total_spent_6mo: stats.total_spent,
      total_paid_6mo: stats.total_paid,
      txn_count_6mo: stats.txn_count,
      top_categories: topCategories,
    };
  });

  const cardLines = cardSummaries.map((c, i) => `
Card ${i + 1}: ${c.name}
  Credit limit: ₹${Math.round(c.credit_limit).toLocaleString('en-IN')} | Balance: ₹${Math.round(c.current_balance).toLocaleString('en-IN')} | Utilization: ${c.utilization_pct}%
  Interest rate: ${c.interest_rate ? c.interest_rate + '% p.a.' : 'Not specified'}
  Total spent (6mo): ₹${Math.round(c.total_spent_6mo).toLocaleString('en-IN')} across ${c.txn_count_6mo} transactions
  Total paid (6mo): ₹${Math.round(c.total_paid_6mo).toLocaleString('en-IN')}
  Spending by category: ${c.top_categories.length ? c.top_categories.map(s => `${s.category} ₹${Math.round(s.total).toLocaleString('en-IN')} (${s.txn_count} txns)`).join(', ') : 'No transactions recorded'}
  Card benefits: ${c.benefits}`).join('\n');

  const prompt = `You are an expert personal finance advisor specializing in Indian credit cards. Analyze the user's complete credit card portfolio and provide detailed, actionable recommendations.

USER FINANCIAL PROFILE:
- Average monthly income: ₹${Math.round(income.avg_monthly).toLocaleString('en-IN')}
- Total credit card debt: ₹${Math.round(debtSummary.total_debt || 0).toLocaleString('en-IN')}
- Total credit limit: ₹${Math.round(debtSummary.total_limit || 0).toLocaleString('en-IN')}
- Overall utilization: ${debtSummary.total_limit > 0 ? ((debtSummary.total_debt / debtSummary.total_limit) * 100).toFixed(1) : 0}%
- Number of active cards: ${cards.length}

CREDIT CARDS (last 6 months of data):
${cardLines}

Provide a thorough analysis. Consider:
- Which cards give best value based on actual spending patterns vs benefits
- High-interest cards with significant balances (debt cost)
- Cards with low/no activity that may have annual fees (dead weight)
- Which card is best for each spending category based on rewards
- Credit utilization per card and rebalancing opportunities
- Whether the number of cards is too many/few for this income level

Reply with ONLY valid JSON (no markdown, no text outside JSON):
{
  "best_cards": [{"card_name": "...", "reason": "...", "score": 1-10}],
  "worst_cards": [{"card_name": "...", "reason": "...", "action": "close|reduce-usage|pay-down"}],
  "best_use_per_card": [{"card_name": "...", "best_for": "...", "tip": "..."}],
  "immediate_actions": ["action 1", "action 2", "action 3"],
  "debt_strategy": "Specific advice on paying down debt across these cards (avalanche/snowball recommendation with card names)",
  "overall_advice": "3-4 sentence portfolio summary with key insight."
}`;

  try {
    const client = getClient();
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].text.trim();
    let recommendations;
    try {
      recommendations = JSON.parse(raw);
    } catch {
      // Strip markdown code fences and retry
      const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      try {
        recommendations = JSON.parse(stripped);
      } catch {
        const match = stripped.match(/\{[\s\S]*\}/);
        recommendations = match ? JSON.parse(match[0]) : null;
      }
    }

    if (!recommendations) {
      console.error('[AI] Failed to parse recommendations response:', raw.slice(0, 300));
      return res.status(500).json({ error: 'Failed to parse AI response' });
    }
    res.json({ recommendations });
  } catch (err) {
    console.error('[AI] Recommendations error:', err.message, err.status || '');
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
