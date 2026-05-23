const express = require('express');
const { getDb } = require('../models/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const db = getDb();
  const userId = req.user.id;
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonth = now.getMonth() === 0
    ? `${now.getFullYear() - 1}-12`
    : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;

  // Total outstanding debt across all cards
  const debtSummary = db.prepare(`
    SELECT
      SUM(current_balance) as total_debt,
      SUM(credit_limit) as total_credit_limit,
      COUNT(*) as card_count,
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_cards
    FROM credit_cards WHERE user_id = ?
  `).get(userId);

  // Current month income
  const monthlyIncome = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM income_entries
    WHERE user_id = ? AND strftime('%Y-%m', date) = ?
  `).get(userId, currentMonth);

  // Last month income (for trend)
  const lastMonthIncome = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM income_entries
    WHERE user_id = ? AND strftime('%Y-%m', date) = ?
  `).get(userId, lastMonth);

  // Current month expenses (purchases + EMI + fees)
  const monthlyExpenses = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM transactions
    WHERE user_id = ? AND strftime('%Y-%m', date) = ?
    AND transaction_type IN ('purchase', 'emi', 'fee')
  `).get(userId, currentMonth);

  // Current month payments
  const monthlyPayments = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM transactions
    WHERE user_id = ? AND strftime('%Y-%m', date) = ?
    AND transaction_type IN ('payment', 'cashback', 'refund')
  `).get(userId, currentMonth);

  // Last month expenses (for trend)
  const lastMonthExpenses = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM transactions
    WHERE user_id = ? AND strftime('%Y-%m', date) = ?
    AND transaction_type IN ('purchase', 'emi', 'fee')
  `).get(userId, lastMonth);

  // Per-card balances
  const cardBalances = db.prepare(`
    SELECT id, nickname, bank_name, last_four, current_balance, credit_limit, due_date, color, shared_limit_group,
      CASE WHEN credit_limit > 0 THEN ROUND((current_balance * 100.0 / credit_limit), 1) ELSE 0 END as utilization
    FROM credit_cards
    WHERE user_id = ? AND is_active = 1
    ORDER BY current_balance DESC
  `).all(userId);

  // Build group summaries for shared-limit cards
  // Use shared_limit_pool if manually set, otherwise fall back to max card credit_limit
  const groupMap = {};
  for (const card of cardBalances) {
    if (!card.shared_limit_group) continue;
    const g = card.shared_limit_group;
    if (!groupMap[g]) groupMap[g] = { total_balance: 0, shared_limit: 0, pool_limit: null, card_count: 0 };
    groupMap[g].total_balance += card.current_balance;
    groupMap[g].shared_limit = Math.max(groupMap[g].shared_limit, card.credit_limit);
    if (card.shared_limit_pool) groupMap[g].pool_limit = card.shared_limit_pool;
    groupMap[g].card_count += 1;
  }
  for (const g of Object.values(groupMap)) {
    g.shared_limit = g.pool_limit ?? g.shared_limit;
  }

  const enrichedCardBalances = cardBalances.map(card => {
    const group = card.shared_limit_group ? groupMap[card.shared_limit_group] : null;
    return {
      ...card,
      utilization: group
        ? (group.shared_limit > 0 ? Math.min(100, (group.total_balance / group.shared_limit) * 100).toFixed(1) : 0)
        : card.utilization,
      group_summary: group || null,
    };
  });

  // Upcoming due dates (within next 7 days)
  const today = now.getDate();
  const upcomingDues = cardBalances.filter(c => {
    if (!c.due_date || c.current_balance <= 0) return false;
    const daysUntilDue = c.due_date >= today
      ? c.due_date - today
      : (30 - today + c.due_date);
    return daysUntilDue <= 7;
  }).map(c => ({
    ...c,
    daysUntilDue: c.due_date >= today ? c.due_date - today : (30 - today + c.due_date),
  }));

  // Spending by category this month
  const categoryBreakdown = db.prepare(`
    SELECT category, SUM(amount) as total, COUNT(*) as count
    FROM transactions
    WHERE user_id = ? AND strftime('%Y-%m', date) = ?
    AND transaction_type IN ('purchase', 'emi', 'fee')
    GROUP BY category
    ORDER BY total DESC
    LIMIT 10
  `).all(userId, currentMonth);

  // Last 6 months trend
  const monthlyTrend = db.prepare(`
    SELECT
      strftime('%Y-%m', date) as month,
      SUM(CASE WHEN transaction_type IN ('purchase','emi','fee') THEN amount ELSE 0 END) as expenses,
      SUM(CASE WHEN transaction_type IN ('payment','refund','cashback') THEN amount ELSE 0 END) as payments
    FROM transactions
    WHERE user_id = ? AND date >= date('now', '-6 months')
    GROUP BY strftime('%Y-%m', date)
    ORDER BY month ASC
  `).all(userId);

  const incomeMonthlyTrend = db.prepare(`
    SELECT strftime('%Y-%m', date) as month, SUM(amount) as income
    FROM income_entries
    WHERE user_id = ? AND date >= date('now', '-6 months')
    GROUP BY strftime('%Y-%m', date)
    ORDER BY month ASC
  `).all(userId);

  // Recent transactions
  const recentTransactions = db.prepare(`
    SELECT t.*, c.nickname as card_nickname, c.color as card_color
    FROM transactions t
    LEFT JOIN credit_cards c ON c.id = t.card_id
    WHERE t.user_id = ?
    ORDER BY t.date DESC, t.created_at DESC
    LIMIT 10
  `).all(userId);

  // User settings
  const settings = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId);

  const totalDebt = debtSummary.total_debt || 0;
  const totalCreditLimit = debtSummary.total_credit_limit || 0;
  const income = monthlyIncome.total;
  const expenses = monthlyExpenses.total;
  const payments = monthlyPayments.total;
  const netCashFlow = income - expenses;
  const utilizationPercent = totalCreditLimit > 0 ? (totalDebt / totalCreditLimit) * 100 : 0;
  const debtToIncomeRatio = income > 0 ? (totalDebt / income) * 100 : 0;

  res.json({
    summary: {
      total_debt: totalDebt,
      total_credit_limit: totalCreditLimit,
      card_count: debtSummary.card_count || 0,
      active_cards: debtSummary.active_cards || 0,
      monthly_income: income,
      last_month_income: lastMonthIncome.total,
      monthly_expenses: expenses,
      last_month_expenses: lastMonthExpenses.total,
      monthly_payments: payments,
      net_cash_flow: netCashFlow,
      savings_or_deficit: netCashFlow,
      overall_utilization: Math.min(100, utilizationPercent).toFixed(1),
      debt_to_income_ratio: debtToIncomeRatio.toFixed(1),
      income_trend: income > lastMonthIncome.total ? 'up' : income < lastMonthIncome.total ? 'down' : 'stable',
      expense_trend: expenses > lastMonthExpenses.total ? 'up' : expenses < lastMonthExpenses.total ? 'down' : 'stable',
    },
    card_balances: enrichedCardBalances,
    upcoming_dues: upcomingDues,
    category_breakdown: categoryBreakdown,
    monthly_trend: monthlyTrend,
    income_trend: incomeMonthlyTrend,
    recent_transactions: recentTransactions.map(t => ({ ...t, tags: JSON.parse(t.tags || '[]') })),
    settings: settings || {},
    current_month: currentMonth,
  });
});

module.exports = router;
