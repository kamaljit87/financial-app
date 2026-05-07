const express = require('express');
const ExcelJS = require('exceljs');
const { stringify } = require('csv-stringify/sync');
const { getDb } = require('../models/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function buildDateFilter(params, tableAlias = '') {
  const col = tableAlias ? `${tableAlias}.date` : 'date';
  const conditions = [];
  if (params.start_date) conditions.push({ cond: `${col} >= ?`, val: params.start_date });
  if (params.end_date) conditions.push({ cond: `${col} <= ?`, val: params.end_date });
  if (params.card_id) conditions.push({ cond: `${tableAlias ? tableAlias + '.' : ''}card_id = ?`, val: params.card_id });
  return conditions;
}

router.get('/transactions/csv', (req, res) => {
  const db = getDb();
  const filters = buildDateFilter(req.query, 't');
  const extra = filters.map(f => f.cond);
  const vals = filters.map(f => f.val);

  const transactions = db.prepare(`
    SELECT t.date, t.title, t.transaction_type, t.category, t.amount,
      c.nickname as card, c.bank_name, t.notes, t.reference_number
    FROM transactions t
    LEFT JOIN credit_cards c ON c.id = t.card_id
    WHERE t.user_id = ? ${extra.length ? 'AND ' + extra.join(' AND ') : ''}
    ORDER BY t.date DESC
  `).all(req.user.id, ...vals);

  const csv = stringify(transactions, { header: true, cast: { number: v => v } });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="transactions-${Date.now()}.csv"`);
  res.send(csv);
});

router.get('/income/csv', (req, res) => {
  const db = getDb();
  const filters = buildDateFilter(req.query);
  const extra = filters.map(f => f.cond);
  const vals = filters.map(f => f.val);

  const income = db.prepare(`
    SELECT date, source, income_type, amount, category, notes
    FROM income_entries
    WHERE user_id = ? ${extra.length ? 'AND ' + extra.join(' AND ') : ''}
    ORDER BY date DESC
  `).all(req.user.id, ...vals);

  const csv = stringify(income, { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="income-${Date.now()}.csv"`);
  res.send(csv);
});

router.get('/report/xlsx', async (req, res) => {
  const db = getDb();
  const userId = req.user.id;
  const now = new Date();
  const month = req.query.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'DebtWise';
  workbook.created = now;

  const headerStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6366F1' } }, alignment: { horizontal: 'center' } };

  // Summary sheet
  const summarySheet = workbook.addWorksheet('Summary');
  const income = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM income_entries WHERE user_id = ? AND strftime('%Y-%m', date) = ?`).get(userId, month);
  const expenses = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE user_id = ? AND strftime('%Y-%m', date) = ? AND transaction_type IN ('purchase','emi','fee')`).get(userId, month);
  const payments = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE user_id = ? AND strftime('%Y-%m', date) = ? AND transaction_type IN ('payment','refund','cashback')`).get(userId, month);
  const cards = db.prepare(`SELECT SUM(current_balance) as debt, SUM(credit_limit) as limit_ FROM credit_cards WHERE user_id = ?`).get(userId);

  summarySheet.columns = [{ header: 'Metric', key: 'metric', width: 30 }, { header: 'Amount (₹)', key: 'amount', width: 20 }];
  summarySheet.getRow(1).eachCell(cell => Object.assign(cell, headerStyle));
  [
    ['Month', month], ['Monthly Income', income.total], ['Monthly Expenses', expenses.total],
    ['Payments Made', payments.total], ['Net Cash Flow', income.total - expenses.total],
    ['Total Outstanding Debt', cards.debt || 0], ['Total Credit Limit', cards.limit_ || 0],
    ['Generated At', now.toISOString()],
  ].forEach(row => summarySheet.addRow({ metric: row[0], amount: row[1] }));

  // Transactions sheet
  const txnSheet = workbook.addWorksheet('Transactions');
  txnSheet.columns = [
    { header: 'Date', key: 'date', width: 14 }, { header: 'Title', key: 'title', width: 30 },
    { header: 'Type', key: 'type', width: 14 }, { header: 'Category', key: 'category', width: 16 },
    { header: 'Amount', key: 'amount', width: 14 }, { header: 'Card', key: 'card', width: 20 },
    { header: 'Notes', key: 'notes', width: 30 },
  ];
  txnSheet.getRow(1).eachCell(cell => Object.assign(cell, headerStyle));
  const txns = db.prepare(`
    SELECT t.date, t.title, t.transaction_type, t.category, t.amount, c.nickname as card, t.notes
    FROM transactions t LEFT JOIN credit_cards c ON c.id = t.card_id
    WHERE t.user_id = ? AND strftime('%Y-%m', t.date) = ? ORDER BY t.date DESC
  `).all(userId, month);
  txns.forEach(t => txnSheet.addRow({ date: t.date, title: t.title, type: t.transaction_type, category: t.category, amount: t.amount, card: t.card || 'N/A', notes: t.notes || '' }));

  // Income sheet
  const incSheet = workbook.addWorksheet('Income');
  incSheet.columns = [
    { header: 'Date', key: 'date', width: 14 }, { header: 'Source', key: 'source', width: 25 },
    { header: 'Type', key: 'type', width: 16 }, { header: 'Amount', key: 'amount', width: 14 },
    { header: 'Category', key: 'category', width: 16 }, { header: 'Notes', key: 'notes', width: 30 },
  ];
  incSheet.getRow(1).eachCell(cell => Object.assign(cell, headerStyle));
  const inc = db.prepare(`SELECT * FROM income_entries WHERE user_id = ? AND strftime('%Y-%m', date) = ? ORDER BY date DESC`).all(userId, month);
  inc.forEach(i => incSheet.addRow({ date: i.date, source: i.source, type: i.income_type, amount: i.amount, category: i.category, notes: i.notes || '' }));

  // Cards sheet
  const cardsSheet = workbook.addWorksheet('Cards');
  cardsSheet.columns = [
    { header: 'Nickname', key: 'nickname', width: 20 }, { header: 'Bank', key: 'bank', width: 20 },
    { header: 'Last 4', key: 'last4', width: 10 }, { header: 'Balance', key: 'balance', width: 14 },
    { header: 'Limit', key: 'limit', width: 14 }, { header: 'Utilization %', key: 'util', width: 16 },
    { header: 'Due Date', key: 'due', width: 12 }, { header: 'Interest Rate', key: 'rate', width: 16 },
  ];
  cardsSheet.getRow(1).eachCell(cell => Object.assign(cell, headerStyle));
  const cardRows = db.prepare(`SELECT * FROM credit_cards WHERE user_id = ?`).all(userId);
  cardRows.forEach(c => cardsSheet.addRow({
    nickname: c.nickname, bank: c.bank_name, last4: `****${c.last_four}`,
    balance: c.current_balance, limit: c.credit_limit,
    util: c.credit_limit > 0 ? ((c.current_balance / c.credit_limit) * 100).toFixed(1) + '%' : '0%',
    due: c.due_date ? `Day ${c.due_date}` : 'N/A', rate: c.interest_rate ? `${c.interest_rate}%` : 'N/A',
  }));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="debtwise-report-${month}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;
