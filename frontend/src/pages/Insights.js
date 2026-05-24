import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, TrendingDown, TrendingUp, Clock, Sparkles, RefreshCw, ThumbsUp, ThumbsDown, Star } from 'lucide-react';
import { RadialBarChart, RadialBar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import api, { formatCurrency } from '../services/api';
import { useAuth } from '../context/AuthContext';
import LoadingScreen from '../components/ui/LoadingScreen';
import toast from 'react-hot-toast';

const ALERT_ICONS = { critical: '🔴', warning: '🟡', caution: '🔵' };
const ALERT_CLASSES = { critical: 'alert-critical', warning: 'alert-warning', caution: 'alert-caution' };

function CardRecommendations({ sym }) {
  const [cards, setCards] = useState([]);
  const [recommendations, setRecommendations] = useState(null);
  const [recLoading, setRecLoading] = useState(false);
  const [benefitsLoading, setBenefitsLoading] = useState({});
  const [editingBenefits, setEditingBenefits] = useState({});
  const [benefitDrafts, setBenefitDrafts] = useState({});

  useEffect(() => {
    api.get('/cards').then(r => setCards(r.data.cards)).catch(() => toast.error('Failed to load cards'));
  }, []);

  const fetchBenefits = async (card) => {
    setBenefitsLoading(p => ({ ...p, [card.id]: true }));
    try {
      const { data } = await api.post(`/ai/card-benefits/${card.id}`);
      setCards(prev => prev.map(c => c.id === card.id ? { ...c, benefits: data.benefits } : c));
      toast.success(`Benefits fetched for ${card.nickname}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to fetch benefits');
    } finally {
      setBenefitsLoading(p => ({ ...p, [card.id]: false }));
    }
  };

  const saveBenefits = async (card) => {
    try {
      await api.patch(`/ai/card-benefits/${card.id}`, { benefits: benefitDrafts[card.id] });
      setCards(prev => prev.map(c => c.id === card.id ? { ...c, benefits: benefitDrafts[card.id] } : c));
      setEditingBenefits(p => ({ ...p, [card.id]: false }));
      toast.success('Benefits saved');
    } catch {
      toast.error('Failed to save benefits');
    }
  };

  const getRecommendations = async () => {
    setRecLoading(true);
    try {
      const { data } = await api.get('/ai/recommendations');
      setRecommendations(data.recommendations);
      if (data.message) toast(data.message);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to get recommendations');
    } finally {
      setRecLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Benefits per card */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-surface-800 flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-500" /> Card Benefits
          </h3>
          <p className="text-xs text-surface-400">AI pre-fills benefits based on bank & card name. You can edit them.</p>
        </div>
        {cards.length === 0 ? (
          <p className="text-surface-400 text-sm text-center py-6">No cards found. Add cards first.</p>
        ) : (
          <div className="space-y-4">
            {cards.map(card => (
              <div key={card.id} className="border border-surface-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-semibold text-surface-800 text-sm">{card.nickname}</p>
                    <p className="text-xs text-surface-400">{card.bank_name} · ****{card.last_four}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => fetchBenefits(card)}
                      disabled={benefitsLoading[card.id]}
                      className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-3">
                      {benefitsLoading[card.id]
                        ? <><RefreshCw className="w-3 h-3 animate-spin" /> Fetching...</>
                        : <><Sparkles className="w-3 h-3 text-violet-500" /> {card.benefits ? 'Re-fetch' : 'Fetch Benefits'}</>}
                    </button>
                    {!editingBenefits[card.id] && (
                      <button
                        onClick={() => { setEditingBenefits(p => ({ ...p, [card.id]: true })); setBenefitDrafts(p => ({ ...p, [card.id]: card.benefits || '' })); }}
                        className="btn-secondary text-xs py-1.5 px-3">
                        Edit
                      </button>
                    )}
                  </div>
                </div>

                {editingBenefits[card.id] ? (
                  <div className="space-y-2">
                    <textarea
                      className="input resize-none text-xs font-mono h-28 w-full"
                      value={benefitDrafts[card.id]}
                      onChange={e => setBenefitDrafts(p => ({ ...p, [card.id]: e.target.value }))}
                      placeholder="- 2% cashback on groceries&#10;- ₹500 annual fee&#10;- 2 lounge visits per quarter" />
                    <div className="flex gap-2">
                      <button onClick={() => saveBenefits(card)} className="btn-primary text-xs py-1.5 px-3">Save</button>
                      <button onClick={() => setEditingBenefits(p => ({ ...p, [card.id]: false }))} className="btn-secondary text-xs py-1.5 px-3">Cancel</button>
                    </div>
                  </div>
                ) : card.benefits ? (
                  <div className="text-xs text-surface-600 whitespace-pre-line bg-surface-50 border border-surface-200 rounded-lg p-3 font-mono leading-relaxed">
                    {card.benefits}
                  </div>
                ) : (
                  <p className="text-xs text-surface-400 italic">No benefits entered yet. Click "Fetch Benefits" to auto-fill.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recommendations */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-surface-800 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-500" /> AI Card Recommendations
          </h3>
          <button onClick={getRecommendations} disabled={recLoading}
            className="btn-primary flex items-center gap-2 text-sm">
            {recLoading
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Analyzing...</>
              : <><Sparkles className="w-4 h-4" /> Analyze My Cards</>}
          </button>
        </div>

        {!recommendations && !recLoading && (
          <div className="text-center py-8 text-surface-400">
            <Sparkles className="w-8 h-8 mx-auto mb-2 text-violet-300" />
            <p className="text-sm">Click "Analyze My Cards" to get AI-powered recommendations</p>
            <p className="text-xs mt-1">Based on your card benefits and actual spending patterns</p>
          </div>
        )}

        {recommendations && (
          <div className="space-y-5">
            {/* Overall advice */}
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-sm text-violet-800">
              <p className="font-semibold mb-1 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Summary</p>
              <p>{recommendations.overall_advice}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Best cards */}
              {recommendations.best_cards?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5 mb-2">
                    <ThumbsUp className="w-4 h-4" /> Best Cards to Keep
                  </h4>
                  <div className="space-y-2">
                    {recommendations.best_cards.map((c, i) => (
                      <div key={i} className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                        <p className="font-semibold text-emerald-800 text-sm">{c.card_name}</p>
                        <p className="text-xs text-emerald-700 mt-0.5">{c.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Worst cards */}
              {recommendations.worst_cards?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-red-600 flex items-center gap-1.5 mb-2">
                    <ThumbsDown className="w-4 h-4" /> Cards to Reconsider
                  </h4>
                  <div className="space-y-2">
                    {recommendations.worst_cards.map((c, i) => (
                      <div key={i} className="bg-red-50 border border-red-200 rounded-xl p-3">
                        <p className="font-semibold text-red-700 text-sm">{c.card_name}</p>
                        <p className="text-xs text-red-600 mt-0.5">{c.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Best use per card */}
            {recommendations.best_use_per_card?.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-surface-700 flex items-center gap-1.5 mb-2">
                  <Star className="w-4 h-4 text-amber-500" /> Best Use Per Card
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {recommendations.best_use_per_card.map((c, i) => (
                    <div key={i} className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <p className="font-semibold text-surface-800 text-sm">{c.card_name}</p>
                      <p className="text-xs text-amber-700 font-medium mt-0.5">Best for: {c.best_for}</p>
                      <p className="text-xs text-surface-500 mt-1">{c.tip}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-surface-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> AI analysis based on your entered benefits and last 3 months of spending. Re-run anytime.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Insights() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const { settings } = useAuth();
  const sym = settings?.currency_symbol || '₹';

  useEffect(() => {
    api.get('/insights').then(r => setData(r.data)).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingScreen />;
  if (!data) return <div className="text-surface-400 p-4">Failed to load insights.</div>;

  const { health_score, alerts, metrics, projections, projected_month_end_debt, top_spending_categories, card_insights } = data;

  const healthColor = { green: '#059669', yellow: '#d97706', orange: '#ea580c', red: '#dc2626' }[health_score.color] || '#4f46e5';
  const tooltipStyle = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, color: '#1e293b', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.08)' };

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Tabs */}
      <div className="flex gap-1 bg-surface-100 p-1 rounded-xl w-fit">
        <button onClick={() => setTab('overview')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === 'overview' ? 'bg-white text-surface-900 shadow-sm' : 'text-surface-500 hover:text-surface-700'}`}>
          Overview
        </button>
        <button onClick={() => setTab('recommendations')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${tab === 'recommendations' ? 'bg-white text-surface-900 shadow-sm' : 'text-surface-500 hover:text-surface-700'}`}>
          <Sparkles className="w-3.5 h-3.5 text-violet-500" /> Card Recommendations
        </button>
      </div>

      {tab === 'recommendations' ? (
        <CardRecommendations sym={sym} />
      ) : (
        <>
          {/* Health Score + Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="card flex flex-col items-center justify-center py-6 lg:col-span-1">
              <h3 className="text-sm font-semibold text-surface-600 mb-4">Financial Health Score</h3>
              <div className="relative w-36 h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="90%"
                    startAngle={90} endAngle={-270} data={[{ value: health_score.score, fill: healthColor }]}>
                    <RadialBar dataKey="value" cornerRadius={8} background={{ fill: '#f1f5f9' }} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-surface-900">{health_score.score}</span>
                  <span className="text-xs text-surface-400">/100</span>
                </div>
              </div>
              <div className="mt-3 text-center">
                <p className="font-semibold text-lg" style={{ color: healthColor }}>{health_score.status}</p>
                <p className="text-xs text-surface-400">Grade: {health_score.grade}</p>
              </div>
              {health_score.positives?.length > 0 && (
                <div className="mt-4 space-y-1.5 w-full">
                  {health_score.positives.map((p, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-emerald-600">
                      <CheckCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>{p}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card lg:col-span-2">
              <h3 className="text-sm font-semibold text-surface-800 mb-4">Current Month Metrics</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Monthly Income', value: formatCurrency(metrics.monthly_income, sym), color: 'text-emerald-600' },
                  { label: 'Monthly Expenses', value: formatCurrency(metrics.monthly_expenses, sym), color: 'text-red-600' },
                  { label: 'Net Cash Flow', value: formatCurrency(metrics.net_cash_flow, sym), color: metrics.net_cash_flow >= 0 ? 'text-emerald-600' : 'text-red-600' },
                  { label: 'Payments Made', value: formatCurrency(metrics.monthly_payments, sym), color: 'text-blue-600' },
                  { label: 'Credit Utilization', value: `${metrics.utilization_percent}%`, color: parseFloat(metrics.utilization_percent) > 70 ? 'text-red-600' : parseFloat(metrics.utilization_percent) > 50 ? 'text-amber-600' : 'text-emerald-600' },
                  { label: 'Spending/Income Ratio', value: `${metrics.spending_to_income_ratio}%`, color: parseFloat(metrics.spending_to_income_ratio) > 80 ? 'text-red-600' : 'text-amber-600' },
                  { label: 'Total Debt', value: formatCurrency(metrics.total_debt, sym), color: 'text-orange-600' },
                  { label: 'Projected Month-End Debt', value: formatCurrency(projected_month_end_debt, sym), color: 'text-violet-600' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-surface-50 border border-surface-200 rounded-lg p-3">
                    <p className="text-xs text-surface-400 mb-1">{label}</p>
                    <p className={`font-semibold ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <span className="text-xs text-surface-400">Debt trend:</span>
                {metrics.debt_trend === 'increasing' ? (
                  <span className="flex items-center gap-1 text-red-600 text-xs"><TrendingUp className="w-3.5 h-3.5" /> Increasing</span>
                ) : metrics.debt_trend === 'decreasing' ? (
                  <span className="flex items-center gap-1 text-emerald-600 text-xs"><TrendingDown className="w-3.5 h-3.5" /> Decreasing</span>
                ) : (
                  <span className="text-surface-400 text-xs">Stable</span>
                )}
              </div>
            </div>
          </div>

          {/* Alerts */}
          {alerts?.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-surface-800 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> Smart Alerts ({alerts.length})
              </h3>
              <div className="space-y-2">
                {alerts.map((alert, i) => (
                  <div key={i} className={ALERT_CLASSES[alert.type] || 'alert-caution'}>
                    <span className="text-base">{ALERT_ICONS[alert.type]}</span>
                    <span className="text-sm">{alert.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Card insights */}
          {card_insights?.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-surface-800 mb-4">Card Utilization</h3>
              <div className="space-y-3">
                {card_insights.map(card => {
                  const util = parseFloat(card.utilization);
                  const barColor = util > 70 ? '#ef4444' : util > 50 ? '#f59e0b' : '#10b981';
                  return (
                    <div key={card.id} className="flex items-center gap-4">
                      <div className="w-32 flex-shrink-0">
                        <p className="text-sm text-surface-800 truncate">{card.nickname}</p>
                        <p className="text-xs text-surface-400">****{card.last_four}</p>
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-surface-400">{formatCurrency(card.current_balance, sym)} / {formatCurrency(card.credit_limit, sym)}</span>
                          <span style={{ color: barColor }}>{util}%</span>
                        </div>
                        <div className="bg-surface-200 rounded-full h-2">
                          <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(100, util)}%`, background: barColor }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Debt payoff projections */}
          {projections?.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-surface-800 mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary-600" /> Debt Payoff Projections
              </h3>
              <div className="space-y-4">
                {projections.map(p => (
                  <div key={p.card_id} className="bg-surface-50 border border-surface-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-semibold text-surface-800">{p.card_name}</p>
                      <span className="badge-red text-xs">{formatCurrency(p.balance, sym)} outstanding</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                        <p className="text-xs text-amber-600 mb-1">At minimum payment ({formatCurrency(p.min_payment, sym)}/mo)</p>
                        {p.repayment_at_minimum?.months ? (
                          <p className="text-amber-700 font-semibold">{p.repayment_at_minimum.years}y {p.repayment_at_minimum.remainingMonths}m to repay</p>
                        ) : <p className="text-red-600 text-xs">{p.repayment_at_minimum?.message}</p>}
                      </div>
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                        <p className="text-xs text-emerald-600 mb-1">At recommended ({formatCurrency(p.recommended_payment, sym)}/mo)</p>
                        {p.repayment_at_recommended?.months ? (
                          <p className="text-emerald-700 font-semibold">{p.repayment_at_recommended.years}y {p.repayment_at_recommended.remainingMonths}m to repay</p>
                        ) : <p className="text-red-600 text-xs">Insufficient payment</p>}
                      </div>
                    </div>
                    {p.interest_rate && <p className="text-xs text-surface-400 mt-2">APR: {p.interest_rate}%</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top spending categories */}
          {top_spending_categories?.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-surface-800 mb-4">Top Spending Categories This Month</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={top_spending_categories} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `${sym}${(v/1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="category" tick={{ fill: '#64748b', fontSize: 12 }} width={80} />
                  <Tooltip formatter={v => formatCurrency(v, sym)} contentStyle={tooltipStyle} />
                  <Bar dataKey="total" fill="#6366f1" radius={[0, 4, 4, 0]} name="Amount" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
