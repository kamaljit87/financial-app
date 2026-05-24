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

  const cardSummaries = cards.map(c => {
    // Truncate benefits to 300 chars to keep prompt manageable with many cards
    const benefits = c.benefits ? c.benefits.slice(0, 300) : 'Not specified';
    const topSpend = (spendingByCard[c.id] || []).slice(0, 3);
    return {
      name: `${c.nickname} (${c.bank_name} ****${c.last_four})`,
      credit_limit: c.credit_limit,
      current_balance: c.current_balance,
      interest_rate: c.interest_rate,
      benefits,
      spending: topSpend,
    };
  });

  const cardLines = cardSummaries.map((c, i) =>
    `Card ${i + 1}: ${c.name} | Limit: ₹${Math.round(c.credit_limit).toLocaleString('en-IN')} | Balance: ₹${Math.round(c.current_balance).toLocaleString('en-IN')} | APR: ${c.interest_rate || '?'}% | Benefits: ${c.benefits} | Top spend: ${c.spending.length ? c.spending.map(s => `${s.category}:₹${Math.round(s.total)}`).join(', ') : 'none'}`
  ).join('\n');

  const prompt = `You are a personal finance advisor for India. Analyze these ${cards.length} credit cards and return JSON only.

Monthly income: ₹${Math.round(income.total).toLocaleString('en-IN')}

${cardLines}

Reply with ONLY this JSON (no markdown fences, no explanation):
{"best_cards":[{"card_name":"...","reason":"..."}],"worst_cards":[{"card_name":"...","reason":"..."}],"best_use_per_card":[{"card_name":"...","best_for":"...","tip":"..."}],"overall_advice":"2-3 sentences."}`;

  try {
    const client = getClient();
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
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
