const express = require('express');
const { getDb } = require('../models/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function calculateHealthScore(metrics) {
  let score = 100;
  const issues = [];
  const positives = [];

  // Credit utilization (30 points)
  if (metrics.utilization > 90) { score -= 30; issues.push({ severity: 'critical', msg: 'Credit utilization above 90% — critical risk' }); }
  else if (metrics.utilization > 70) { score -= 20; issues.push({ severity: 'warning', msg: 'Credit utilization above 70% — high risk' }); }
  else if (metrics.utilization > 50) { score -= 10; issues.push({ severity: 'caution', msg: 'Credit utilization above 50% — moderate risk' }); }
  else if (metrics.utilization <= 30) { positives.push('Credit utilization is healthy (≤30%)'); }

  // Spending vs income (30 points)
  if (metrics.income > 0) {
    const spendingRatio = (metrics.expenses / metrics.income) * 100;
    if (spendingRatio > 100) { score -= 30; issues.push({ severity: 'critical', msg: `Spending exceeds income by ${(spendingRatio - 100).toFixed(0)}%` }); }
    else if (spendingRatio > 80) { score -= 20; issues.push({ severity: 'warning', msg: `Spending is ${spendingRatio.toFixed(0)}% of income — high` }); }
    else if (spendingRatio > 60) { score -= 10; issues.push({ severity: 'caution', msg: `Spending is ${spendingRatio.toFixed(0)}% of income — moderate` }); }
    else { positives.push(`Good spending discipline — ${spendingRatio.toFixed(0)}% of income spent`); }
  } else if (metrics.expenses > 0) {
    score -= 15;
    issues.push({ severity: 'caution', msg: 'No income recorded this month but expenses exist' });
  }

  // Debt trend (20 points)
  if (metrics.debtTrend === 'increasing') {
    score -= 20;
    issues.push({ severity: 'warning', msg: 'Debt is increasing month-over-month' });
  } else if (metrics.debtTrend === 'decreasing') {
    positives.push('Debt is decreasing — good progress!');
  }

  // Payment consistency (10 points)
  if (metrics.income > 0 && metrics.payments < metrics.expenses * 0.1) {
    score -= 10;
    issues.push({ severity: 'caution', msg: 'Low payment amount relative to expenses' });
  } else if (metrics.payments > 0) {
    positives.push('Making regular payments toward debt');
  }

  // Cash flow (10 points)
  if (metrics.netCashFlow < 0) {
    score -= 10;
    issues.push({ severity: 'warning', msg: 'Negative cash flow this month' });
  } else if (metrics.netCashFlow > 0) {
    positives.push('Positive cash flow this month');
  }

  score = Math.max(0, Math.min(100, score));

  let grade, color, status;
  if (score >= 75) { grade = 'A'; color = 'green'; status = 'Healthy'; }
  else if (score >= 50) { grade = 'B'; color = 'yellow'; status = 'Caution'; }
  else if (score >= 25) { grade = 'C'; color = 'orange'; status = 'At Risk'; }
  else { grade = 'D'; color = 'red'; status = 'Critical'; }

  return { score, grade, color, status, issues, positives };
}

function estimateDebtRepayment(balance, monthlyPayment, interestRate) {
  if (balance <= 0 || monthlyPayment <= 0) return null;
  const monthlyRate = (interestRate || 18) / 100 / 12;
  if (monthlyPayment <= balance * monthlyRate) return { months: null, message: 'Payment too low to cover interest' };

  let remaining = balance;
  let months = 0;
  while (remaining > 0 && months < 600) {
    const interest = remaining * monthlyRate;
    remaining = remaining + interest - monthlyPayment;
    months++;
  }
  return { months, years: Math.floor(months / 12), remainingMonths: months % 12, totalInterest: null };
}

router.get('/', (req, res) => {
  const db = getDb();
  const userId = req.user.id;
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonth = now.getMonth() === 0
    ? `${now.getFullYear() - 1}-12`
    : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;

  const settings = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId) || {};
  const debtWarning = settings.debt_warning_threshold || 70;
  const spendingWarning = settings.spending_warning_threshold || 80;

  // Cards
  const cards = db.prepare(`
    SELECT id, nickname, bank_name, last_four, current_balance, credit_limit, interest_rate, due_date, color
    FROM credit_cards WHERE user_id = ? AND is_active = 1
  `).all(userId);

  const totalDebt = cards.reduce((s, c) => s + c.current_balance, 0);
  const totalLimit = cards.reduce((s, c) => s + c.credit_limit, 0);
  const utilization = totalLimit > 0 ? (totalDebt / totalLimit) * 100 : 0;

  // Income
  const income = db.prepare(`
    SELECT COALESCE(SUM(amount),0) as total FROM income_entries
    WHERE user_id = ? AND strftime('%Y-%m', date) = ?
  `).get(userId, currentMonth).total;

  const lastIncome = db.prepare(`
    SELECT COALESCE(SUM(amount),0) as total FROM income_entries
    WHERE user_id = ? AND strftime('%Y-%m', date) = ?
  `).get(userId, lastMonth).total;

  // Expenses
  const expenses = db.prepare(`
    SELECT COALESCE(SUM(amount),0) as total FROM transactions
    WHERE user_id = ? AND strftime('%Y-%m', date) = ?
    AND transaction_type IN ('purchase','emi','fee')
  `).get(userId, currentMonth).total;

  const lastExpenses = db.prepare(`
    SELECT COALESCE(SUM(amount),0) as total FROM transactions
    WHERE user_id = ? AND strftime('%Y-%m', date) = ?
    AND transaction_type IN ('purchase','emi','fee')
  `).get(userId, lastMonth).total;

  const payments = db.prepare(`
    SELECT COALESCE(SUM(amount),0) as total FROM transactions
    WHERE user_id = ? AND strftime('%Y-%m', date) = ?
    AND transaction_type IN ('payment','cashback','refund')
  `).get(userId, currentMonth).total;

  const netCashFlow = income - expenses;
  const debtTrend = lastExpenses > 0 && expenses > lastExpenses * 1.05 ? 'increasing' : expenses < lastExpenses * 0.95 ? 'decreasing' : 'stable';

  // Health score
  const healthScore = calculateHealthScore({
    utilization, income, expenses, payments, netCashFlow, debtTrend,
    totalDebt, lastExpenses,
  });

  // Smart alerts
  const alerts = [];
  const spendingPct = income > 0 ? (expenses / income) * 100 : 0;

  if (spendingPct > 100) {
    alerts.push({ type: 'critical', icon: '🔴', message: `You've spent ${spendingPct.toFixed(0)}% of your monthly income — you are going into deficit`, category: 'spending' });
  } else if (spendingPct > spendingWarning) {
    alerts.push({ type: 'warning', icon: '🟡', message: `You spent ${spendingPct.toFixed(0)}% of your monthly income`, category: 'spending' });
  }

  if (utilization > debtWarning) {
    alerts.push({ type: 'warning', icon: '🟡', message: `Overall credit utilization is ${utilization.toFixed(0)}% — above recommended ${debtWarning}%`, category: 'utilization' });
  }

  cards.forEach(card => {
    const cardUtil = card.credit_limit > 0 ? (card.current_balance / card.credit_limit) * 100 : 0;
    if (cardUtil > 90) {
      alerts.push({ type: 'critical', icon: '🔴', message: `${card.nickname} utilization is ${cardUtil.toFixed(0)}% — nearly maxed out`, category: 'utilization', card_id: card.id });
    } else if (cardUtil > 70) {
      alerts.push({ type: 'warning', icon: '🟡', message: `${card.nickname} utilization is ${cardUtil.toFixed(0)}%`, category: 'utilization', card_id: card.id });
    }

    if (card.due_date) {
      const today = now.getDate();
      const daysUntil = card.due_date >= today ? card.due_date - today : (30 - today + card.due_date);
      if (daysUntil <= 3 && card.current_balance > 0) {
        alerts.push({ type: 'critical', icon: '🔴', message: `${card.nickname} payment due in ${daysUntil} day(s)!`, category: 'due_date', card_id: card.id });
      } else if (daysUntil <= 7 && card.current_balance > 0) {
        alerts.push({ type: 'warning', icon: '🟡', message: `${card.nickname} payment due in ${daysUntil} days`, category: 'due_date', card_id: card.id });
      }
    }
  });

  if (netCashFlow < 0 && income > 0) {
    alerts.push({ type: 'critical', icon: '🔴', message: `Negative cash flow of ₹${Math.abs(netCashFlow).toLocaleString()} — spending more than income`, category: 'cashflow' });
  }

  if (expenses > lastExpenses * 1.2 && lastExpenses > 0) {
    alerts.push({ type: 'warning', icon: '🟡', message: `Spending increased ${(((expenses - lastExpenses) / lastExpenses) * 100).toFixed(0)}% vs last month`, category: 'trend' });
  }

  if (payments < expenses * 0.05 && expenses > 0) {
    alerts.push({ type: 'caution', icon: '🔵', message: 'Payments this month are below recommended levels', category: 'payment' });
  }

  // Debt payoff projections per card
  const projections = cards.map(card => {
    if (card.current_balance <= 0) return null;
    const minPayment = Math.max(card.current_balance * 0.02, 500);
    const recommended = card.current_balance * 0.1;
    const repayment = estimateDebtRepayment(card.current_balance, minPayment, card.interest_rate);
    const fastRepayment = estimateDebtRepayment(card.current_balance, recommended, card.interest_rate);

    return {
      card_id: card.id,
      card_name: card.nickname,
      balance: card.current_balance,
      interest_rate: card.interest_rate,
      min_payment: minPayment,
      recommended_payment: recommended,
      repayment_at_minimum: repayment,
      repayment_at_recommended: fastRepayment,
    };
  }).filter(Boolean);

  // Month-end debt projection
  const dailySpendRate = expenses / now.getDate();
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
  const projectedAdditionalDebt = dailySpendRate * daysLeft;
  const projectedMonthEndDebt = totalDebt + projectedAdditionalDebt - (payments / now.getDate() * daysLeft);

  // Category spending analysis
  const topCategories = db.prepare(`
    SELECT category, SUM(amount) as total
    FROM transactions
    WHERE user_id = ? AND strftime('%Y-%m', date) = ?
    AND transaction_type IN ('purchase','emi','fee')
    GROUP BY category ORDER BY total DESC LIMIT 5
  `).all(userId, currentMonth);

  res.json({
    health_score: healthScore,
    alerts: alerts.sort((a, b) => {
      const order = { critical: 0, warning: 1, caution: 2 };
      return (order[a.type] || 3) - (order[b.type] || 3);
    }),
    metrics: {
      total_debt: totalDebt,
      total_credit_limit: totalLimit,
      utilization_percent: utilization.toFixed(1),
      monthly_income: income,
      monthly_expenses: expenses,
      monthly_payments: payments,
      net_cash_flow: netCashFlow,
      spending_to_income_ratio: spendingPct.toFixed(1),
      debt_trend: debtTrend,
    },
    projections,
    projected_month_end_debt: Math.max(0, projectedMonthEndDebt),
    top_spending_categories: topCategories,
    card_insights: cards.map(card => ({
      ...card,
      utilization: card.credit_limit > 0 ? ((card.current_balance / card.credit_limit) * 100).toFixed(1) : 0,
      available_credit: Math.max(0, card.credit_limit - card.current_balance),
    })),
  });
});

module.exports = router;
