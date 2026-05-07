import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, CreditCard, Wallet, AlertTriangle,
  ArrowUpRight, ArrowDownRight, DollarSign, BarChart3, Calendar
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import api, { formatCurrency } from '../services/api';
import { useAuth } from '../context/AuthContext';
import LoadingScreen from '../components/ui/LoadingScreen';

const CATEGORY_COLORS = ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#3b82f6','#06b6d4'];

function StatCard({ label, value, subtext, icon: Icon, trend, color = 'blue', currency = true, symbol }) {
  const colorMap = {
    blue:   'text-blue-600 bg-blue-50 border-blue-200',
    green:  'text-emerald-600 bg-emerald-50 border-emerald-200',
    red:    'text-red-600 bg-red-50 border-red-200',
    yellow: 'text-amber-600 bg-amber-50 border-amber-200',
    purple: 'text-violet-600 bg-violet-50 border-violet-200',
  };
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-2">
        <span className="stat-label">{label}</span>
        <div className={`p-2 rounded-lg border ${colorMap[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="stat-value">
        {currency ? formatCurrency(value, symbol) : value}
      </div>
      {subtext && (
        <div className="flex items-center gap-1 mt-1">
          {trend === 'up' && <ArrowUpRight className="w-3 h-3 text-emerald-500" />}
          {trend === 'down' && <ArrowDownRight className="w-3 h-3 text-red-500" />}
          <span className="text-xs text-surface-400">{subtext}</span>
        </div>
      )}
    </div>
  );
}

function HealthScoreBadge({ score }) {
  const color = score >= 75 ? 'emerald' : score >= 50 ? 'amber' : score >= 25 ? 'orange' : 'red';
  const styles = {
    emerald: { text: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', stroke: '#059669' },
    amber:   { text: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',     stroke: '#d97706' },
    orange:  { text: 'text-orange-700',  bg: 'bg-orange-50 border-orange-200',   stroke: '#ea580c' },
    red:     { text: 'text-red-700',     bg: 'bg-red-50 border-red-200',         stroke: '#dc2626' },
  }[color];
  const label = score >= 75 ? 'Healthy' : score >= 50 ? 'Caution' : score >= 25 ? 'At Risk' : 'Critical';

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${styles.bg}`}>
      <div className="relative w-8 h-8">
        <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="12" fill="none" stroke="#e2e8f0" strokeWidth="3" />
          <circle cx="16" cy="16" r="12" fill="none" stroke={styles.stroke} strokeWidth="3"
            strokeDasharray={`${(score / 100) * 75.4} 75.4`} strokeLinecap="round" />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center text-[8px] font-bold ${styles.text}`}>{score}</span>
      </div>
      <div>
        <p className={`text-sm font-semibold ${styles.text}`}>{label}</p>
        <p className="text-xs text-surface-400">Health Score</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const { settings } = useAuth();
  const sym = settings?.currency_symbol || '₹';

  useEffect(() => {
    Promise.all([api.get('/dashboard'), api.get('/insights')])
      .then(([d, i]) => { setData(d.data); setInsights(i.data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingScreen />;
  if (!data) return <div className="text-surface-500 p-4">Failed to load dashboard.</div>;

  const { summary, card_balances, upcoming_dues, category_breakdown, monthly_trend, income_trend, recent_transactions } = data;

  const trendMap = {};
  (monthly_trend || []).forEach(m => { trendMap[m.month] = { ...trendMap[m.month], expenses: m.expenses, payments: m.payments }; });
  (income_trend || []).forEach(m => { trendMap[m.month] = { ...trendMap[m.month], income: m.income }; });
  const chartData = Object.entries(trendMap).sort(([a], [b]) => a.localeCompare(b))
    .map(([month, vals]) => ({ month: month.slice(5), ...vals }));

  const txnTypeColor = {
    purchase: 'text-red-600', emi: 'text-orange-600', payment: 'text-emerald-600',
    refund: 'text-blue-600', fee: 'text-amber-600', cashback: 'text-teal-600',
  };

  const tooltipStyle = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, color: '#1e293b', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.08)' };

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Alerts */}
      {insights?.alerts?.length > 0 && (
        <div className="space-y-2">
          {insights.alerts.slice(0, 3).map((alert, i) => (
            <div key={i} className={alert.type === 'critical' ? 'alert-critical' : alert.type === 'warning' ? 'alert-warning' : 'alert-caution'}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span className="text-sm">{alert.message}</span>
            </div>
          ))}
          {insights.alerts.length > 3 && (
            <Link to="/insights" className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1">
              +{insights.alerts.length - 3} more alerts — View Insights
            </Link>
          )}
        </div>
      )}

      {/* Header row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-surface-900">{new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h3>
          <p className="text-sm text-surface-400">Financial overview</p>
        </div>
        {insights?.health_score && <HealthScoreBadge score={insights.health_score.score} />}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Debt" value={summary.total_debt} icon={CreditCard} color="red" symbol={sym}
          subtext={`${summary.overall_utilization}% utilized`} />
        <StatCard label="Monthly Income" value={summary.monthly_income} icon={TrendingUp} color="green" symbol={sym}
          trend={summary.income_trend} subtext="This month" />
        <StatCard label="Monthly Expenses" value={summary.monthly_expenses} icon={TrendingDown} color="red" symbol={sym}
          trend={summary.expense_trend} subtext="This month" />
        <StatCard label="Net Cash Flow" value={summary.net_cash_flow} icon={Wallet}
          color={summary.net_cash_flow >= 0 ? 'green' : 'red'} symbol={sym}
          subtext={summary.net_cash_flow >= 0 ? 'Positive flow' : 'Spending > Income'} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Payments Made" value={summary.monthly_payments} icon={DollarSign} color="blue" symbol={sym} />
        <StatCard label="Active Cards" value={summary.active_cards} icon={CreditCard} currency={false} color="purple" />
        <StatCard label="Debt-to-Income" value={`${summary.debt_to_income_ratio}%`} icon={BarChart3} currency={false}
          color={parseFloat(summary.debt_to_income_ratio) > 100 ? 'red' : 'yellow'} />
        <StatCard label="Credit Limit" value={summary.total_credit_limit} icon={CreditCard} color="blue" symbol={sym} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold text-surface-800 mb-4 text-sm">Income vs Expenses (6 Months)</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `${sym}${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v, name) => [formatCurrency(v, sym), name]} contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="income" stroke="#10b981" fill="url(#gradIncome)" strokeWidth={2} name="Income" />
                <Area type="monotone" dataKey="expenses" stroke="#ef4444" fill="url(#gradExpense)" strokeWidth={2} name="Expenses" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div className="h-48 flex items-center justify-center text-surface-400 text-sm">No data yet</div>}
        </div>

        <div className="card">
          <h3 className="font-semibold text-surface-800 mb-4 text-sm">Spending by Category</h3>
          {category_breakdown?.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={category_breakdown} dataKey="total" nameKey="category" cx="50%" cy="50%" outerRadius={80} labelLine={false}
                  label={({ name, percent }) => percent > 0.05 ? `${name} ${(percent*100).toFixed(0)}%` : ''}>
                  {category_breakdown.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => formatCurrency(v, sym)} contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="h-48 flex items-center justify-center text-surface-400 text-sm">No transactions yet</div>}
        </div>
      </div>

      {/* Cards + Dues */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-surface-800 text-sm">Card Balances</h3>
            <Link to="/cards" className="text-xs text-primary-600 hover:text-primary-700">Manage →</Link>
          </div>
          {card_balances?.length > 0 ? (
            <div className="space-y-3">
              {card_balances.map(card => (
                <div key={card.id} className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: card.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm text-surface-800 truncate">{card.nickname}</span>
                      <span className="text-sm font-semibold text-surface-900 ml-2">{formatCurrency(card.current_balance, sym)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-surface-200 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(100, card.utilization)}%`, background: card.utilization > 70 ? '#ef4444' : card.utilization > 50 ? '#f59e0b' : '#10b981' }} />
                      </div>
                      <span className={`text-xs flex-shrink-0 ${card.utilization > 70 ? 'text-red-600' : card.utilization > 50 ? 'text-amber-600' : 'text-emerald-600'}`}>{card.utilization}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-surface-400 text-sm mb-3">No cards added yet</p>
              <Link to="/cards" className="btn-primary text-xs px-3 py-1.5">Add Card</Link>
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-surface-800 text-sm">Upcoming Due Dates</h3>
            <Calendar className="w-4 h-4 text-surface-400" />
          </div>
          {upcoming_dues?.length > 0 ? (
            <div className="space-y-2">
              {upcoming_dues.map(card => (
                <div key={card.id} className={`flex items-center justify-between p-2.5 rounded-lg border ${card.daysUntilDue <= 3 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                  <div>
                    <p className="text-sm font-medium text-surface-800">{card.nickname}</p>
                    <p className={`text-xs ${card.daysUntilDue <= 3 ? 'text-red-600' : 'text-amber-600'}`}>
                      Due in {card.daysUntilDue} day{card.daysUntilDue !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-surface-900">{formatCurrency(card.current_balance, sym)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-surface-400 text-sm">No upcoming due dates</div>
          )}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-surface-800 text-sm">Recent Transactions</h3>
          <Link to="/transactions" className="text-xs text-primary-600 hover:text-primary-700">View all →</Link>
        </div>
        {recent_transactions?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-surface-400 border-b border-surface-100">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Description</th>
                  <th className="pb-2 font-medium hidden sm:table-cell">Category</th>
                  <th className="pb-2 font-medium hidden md:table-cell">Card</th>
                  <th className="pb-2 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recent_transactions.map(txn => (
                  <tr key={txn.id} className="table-row">
                    <td className="py-2 text-surface-400 whitespace-nowrap">{new Date(txn.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</td>
                    <td className="py-2 text-surface-800 max-w-[120px] truncate">{txn.title}</td>
                    <td className="py-2 hidden sm:table-cell">
                      <span className="badge-purple capitalize">{txn.category}</span>
                    </td>
                    <td className="py-2 hidden md:table-cell">
                      {txn.card_nickname ? (
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ background: txn.card_color }} />
                          <span className="text-surface-500 text-xs">{txn.card_nickname}</span>
                        </div>
                      ) : <span className="text-surface-300">—</span>}
                    </td>
                    <td className={`py-2 text-right font-medium ${txnTypeColor[txn.transaction_type] || 'text-surface-800'}`}>
                      {['payment','refund','cashback'].includes(txn.transaction_type) ? '+' : '-'}
                      {formatCurrency(txn.amount, sym)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-surface-400 text-sm mb-3">No transactions yet</p>
            <Link to="/transactions" className="btn-primary text-xs px-3 py-1.5">Add Transaction</Link>
          </div>
        )}
      </div>
    </div>
  );
}
