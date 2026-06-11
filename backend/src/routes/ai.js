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

function buildPortfolioContext(db, userId) {
  const cards = db.prepare(`SELECT * FROM credit_cards WHERE user_id = ? AND is_active = 1`).all(userId);

  const spending = db.prepare(`
    SELECT card_id, category, SUM(amount) as total, COUNT(*) as txn_count
    FROM transactions
    WHERE user_id = ? AND transaction_type IN ('purchase','emi','fee')
      AND date >= date('now', '-6 months')
    GROUP BY card_id, category ORDER BY card_id, total DESC
  `).all(userId);

  const cardStats = db.prepare(`
    SELECT card_id,
      SUM(CASE WHEN transaction_type IN ('purchase','emi','fee') THEN amount ELSE 0 END) as total_spent,
      SUM(CASE WHEN transaction_type IN ('payment','cashback','refund') THEN amount ELSE 0 END) as total_paid,
      COUNT(CASE WHEN transaction_type IN ('purchase','emi','fee') THEN 1 END) as txn_count,
      MIN(date) as first_txn, MAX(date) as last_txn
    FROM transactions WHERE user_id = ? AND date >= date('now', '-6 months')
    GROUP BY card_id
  `).all(userId);

  const income = db.prepare(`
    SELECT COALESCE(AVG(monthly), 0) as avg_monthly FROM (
      SELECT strftime('%Y-%m', date) as month, SUM(amount) as monthly
      FROM income_entries WHERE user_id = ? AND date >= date('now', '-3 months')
      GROUP BY month
    )
  `).get(userId);

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

  const cardLines = cards.map((c, i) => {
    const stats = statsByCard[c.id] || { total_spent: 0, total_paid: 0, txn_count: 0, last_txn: null };
    const util = c.credit_limit > 0 ? ((c.current_balance / c.credit_limit) * 100).toFixed(0) : 0;
    // Top 4 categories only, compact format
    const cats = (spendingByCard[c.id] || []).slice(0, 4).map(s => `${s.category}:₹${Math.round(s.total / 1000)}k`).join(' ') || 'none';
    const lastUsed = stats.last_txn ? stats.last_txn : 'never';
    // Compress benefits: strip leading dashes/bullets, join into one line
    // Tighter limit for large portfolios to keep prompt size manageable
    const benefitsCap = cards.length > 12 ? 120 : cards.length > 8 ? 200 : 300;
    const benefits = c.benefits
      ? c.benefits.replace(/^[-•*]\s*/gm, '').replace(/\n+/g, ' | ').trim().slice(0, benefitsCap)
      : 'not provided';
    return `[${i + 1}] ${c.nickname} (${c.bank_name})
  Limit:₹${Math.round(c.credit_limit / 1000)}k Bal:₹${Math.round(c.current_balance / 1000)}k Util:${util}% APR:${c.interest_rate || '?'}% LastUsed:${lastUsed}
  Spent6mo:₹${Math.round(stats.total_spent / 1000)}k(${stats.txn_count}txns) Paid:₹${Math.round(stats.total_paid / 1000)}k
  Spend:${cats}
  Benefits:${benefits}`;
  }).join('\n\n');

  return {
    cards,
    cardLines,
    income: Math.round(income.avg_monthly),
    totalDebt: Math.round(debtSummary.total_debt || 0),
    totalLimit: Math.round(debtSummary.total_limit || 0),
    utilization: debtSummary.total_limit > 0 ? ((debtSummary.total_debt / debtSummary.total_limit) * 100).toFixed(1) : 0,
  };
}

const MODE_PROMPTS = {
  keep_vs_close: (ctx) => `${SYSTEM_PROMPT}

USER PORTFOLIO:
${ctx.cardLines}

FINANCIALS: Monthly income ₹${ctx.income.toLocaleString('en-IN')} | Total debt ₹${ctx.totalDebt.toLocaleString('en-IN')} | Overall utilization ${ctx.utilization}%

MODE: Keep vs Close Analysis

Reply with ONLY valid JSON (no markdown):
{
  "mode": "keep_vs_close",
  "summary": "2-3 sentence portfolio overview",
  "cards": [
    {
      "card_name": "...",
      "verdict": "keep|downgrade|close",
      "score": 1-10,
      "yearly_value_est": "₹X,XXX estimated yearly value",
      "reasoning": "...",
      "risks_of_closing": "...",
      "fee_justified": true|false,
      "replacement_suggestion": "..." or null
    }
  ],
  "immediate_actions": ["..."],
  "ecosystem_impact": "Impact on reward ecosystems if any cards are closed"
}`,

  best_card_per_category: (ctx) => `${SYSTEM_PROMPT}

USER PORTFOLIO:
${ctx.cardLines}

FINANCIALS: Monthly income ₹${ctx.income.toLocaleString('en-IN')} | Total debt ₹${ctx.totalDebt.toLocaleString('en-IN')}

MODE: Best Card Per Category

Reply with ONLY valid JSON (no markdown):
{
  "mode": "best_card_per_category",
  "summary": "...",
  "categories": [
    {
      "category": "dining|fuel|groceries|online_shopping|travel|flights|hotels|insurance|utilities|upi|rent|emi|offline_shopping|international|subscriptions",
      "best_card": "...",
      "expected_reward": "X% cashback or X points per ₹100",
      "why_it_wins": "...",
      "fallback_card": "...",
      "cards_to_avoid": ["..."],
      "caps_or_exclusions": "..." or null
    }
  ],
  "routing_tip": "One overall routing strategy tip"
}`,

  portfolio_optimization: (ctx) => `${SYSTEM_PROMPT}

USER PORTFOLIO:
${ctx.cardLines}

FINANCIALS: Monthly income ₹${ctx.income.toLocaleString('en-IN')} | Total debt ₹${ctx.totalDebt.toLocaleString('en-IN')} | Overall utilization ${ctx.utilization}%

MODE: Portfolio Optimization

Reply with ONLY valid JSON (no markdown):
{
  "mode": "portfolio_optimization",
  "summary": "...",
  "gaps": ["gap 1", "gap 2"],
  "redundancies": [{"cards": ["card A", "card B"], "issue": "..."}],
  "optimized_setup": [{"card": "...", "role": "primary for X", "monthly_target_spend": "₹..."}],
  "missing_ecosystems": ["..."],
  "yearly_reward_estimate": "₹X,XXX",
  "simplified_plan": "3-4 sentence practical usage plan",
  "immediate_actions": ["..."]
}`,

  reward_maximization: (ctx) => `${SYSTEM_PROMPT}

USER PORTFOLIO:
${ctx.cardLines}

FINANCIALS: Monthly income ₹${ctx.income.toLocaleString('en-IN')} | Total debt ₹${ctx.totalDebt.toLocaleString('en-IN')}

MODE: Reward Maximization Strategy

Reply with ONLY valid JSON (no markdown):
{
  "mode": "reward_maximization",
  "summary": "...",
  "strategy_map": [
    {"card": "...", "spend_category": "...", "monthly_target": "₹...", "expected_reward": "...", "milestone_tip": "..." or null}
  ],
  "stacking_opportunities": ["..."],
  "transfer_partners": ["relevant transfer partners for points cards"],
  "redemption_tips": ["..."],
  "estimated_extra_yearly_value": "₹X,XXX",
  "seasonal_tips": ["..."]
}`,

  minimalist_wallet: (ctx) => `${SYSTEM_PROMPT}

USER PORTFOLIO:
${ctx.cardLines}

FINANCIALS: Monthly income ₹${ctx.income.toLocaleString('en-IN')} | Total debt ₹${ctx.totalDebt.toLocaleString('en-IN')}

MODE: Minimalist Wallet

Reply with ONLY valid JSON (no markdown):
{
  "mode": "minimalist_wallet",
  "summary": "...",
  "one_card": {"card": "...", "why": "...", "coverage": "...", "annual_fee": "...", "effective_return": "...%"},
  "two_card": {"cards": ["...", "..."], "why": "...", "coverage": "...", "combined_fee": "...", "effective_return": "...%"},
  "three_card": {"cards": ["...", "...", "..."], "why": "...", "coverage": "...", "combined_fee": "...", "effective_return": "...%"},
  "cards_to_close": ["..."],
  "simplification_tip": "..."
}`,

  card_health_check: (ctx) => `${SYSTEM_PROMPT}

USER PORTFOLIO:
${ctx.cardLines}

FINANCIALS: Monthly income ₹${ctx.income.toLocaleString('en-IN')} | Total debt ₹${ctx.totalDebt.toLocaleString('en-IN')}

MODE: Card Health Check

Reply with ONLY valid JSON (no markdown):
{
  "mode": "card_health_check",
  "summary": "...",
  "cards": [
    {
      "card_name": "...",
      "health_score": 1-10,
      "strengths": ["..."],
      "weaknesses": ["..."],
      "hidden_issues": ["..."],
      "ideal_use_cases": ["..."],
      "poor_use_cases": ["..."],
      "rating": "overrated|underrated|fairly-rated",
      "fee_justified": true|false,
      "fee_justification": "...",
      "long_term_viability": "strong|moderate|weak",
      "viability_reason": "..."
    }
  ],
  "portfolio_health_score": 1-10,
  "overall_verdict": "..."
}`
};

const SYSTEM_PROMPT = `You are an advanced credit card portfolio optimization engine for India.

ANALYSIS RULES:
- Use real-world Indian credit card behavior and actual market knowledge
- Consider reward redemption difficulty and value
- Consider reward inflation/devaluation risks
- Consider annual fee recovery difficulty
- Consider practical usability, not theoretical reward rates
- Penalize cards with poor redemption systems or too many exclusions
- Prioritize actual value over marketing claims
- Be concise but deeply insightful, practical, data-driven, and opinionated
- Avoid generic recommendations — be specific to the cards named`;

// GET /api/ai/recommendations?mode=keep_vs_close|best_card_per_category|portfolio_optimization|reward_maximization|minimalist_wallet|card_health_check
router.get('/recommendations', async (req, res) => {
  const db = getDb();
  const userId = req.user.id;
  const mode = req.query.mode;

  if (!mode || !MODE_PROMPTS[mode]) {
    return res.status(400).json({
      error: 'mode parameter required',
      available_modes: Object.keys(MODE_PROMPTS),
    });
  }

  const ctx = buildPortfolioContext(db, userId);
  if (!ctx.cards.length) return res.json({ recommendations: null, message: 'No active cards to analyze.' });

  const prompt = MODE_PROMPTS[mode](ctx);

  // Per-mode token limits — generous enough for full output but not unbounded
  const MAX_TOKENS = {
    keep_vs_close:          ctx.cards.length > 12 ? 2500 : 2000,
    card_health_check:      ctx.cards.length > 12 ? 4000 : 3000,
    best_card_per_category: 2000,
    portfolio_optimization: 2500,
    reward_maximization:    2500,
    minimalist_wallet:      1500,
  };
  const maxTokens = MAX_TOKENS[mode] || 2500;

  console.log(`[AI] mode=${mode} cards=${ctx.cards.length} prompt_chars=${prompt.length} max_tokens=${maxTokens}`);

  try {
    const client = getClient();
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    console.log(`[AI] stop_reason=${message.stop_reason} output_tokens=${message.usage?.output_tokens}`);

    const raw = message.content[0].text.trim();
    let recommendations;
    try {
      recommendations = JSON.parse(raw);
    } catch {
      const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      try {
        recommendations = JSON.parse(stripped);
      } catch {
        const match = stripped.match(/\{[\s\S]*\}/);
        recommendations = match ? JSON.parse(match[0]) : null;
      }
    }

    if (!recommendations) {
      console.error('[AI] Failed to parse response for mode:', mode, raw.slice(0, 300));
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
