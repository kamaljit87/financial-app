import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, TrendingDown, TrendingUp, Clock, Sparkles, RefreshCw, ThumbsUp, ThumbsDown, Star, Zap, Target, Shield } from 'lucide-react';
import { RadialBarChart, RadialBar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import api, { formatCurrency } from '../services/api';
import { useAuth } from '../context/AuthContext';
import LoadingScreen from '../components/ui/LoadingScreen';
import toast from 'react-hot-toast';

const ALERT_ICONS = { critical: '🔴', warning: '🟡', caution: '🔵' };
const ALERT_CLASSES = { critical: 'alert-critical', warning: 'alert-warning', caution: 'alert-caution' };

const MODES = [
  { id: 'keep_vs_close', label: 'Keep vs Close', icon: Shield, desc: 'Which cards to keep, downgrade, or close' },
  { id: 'best_card_per_category', label: 'Best Card Per Category', icon: Star, desc: 'Best card for dining, fuel, travel, etc.' },
  { id: 'portfolio_optimization', label: 'Portfolio Optimization', icon: Target, desc: 'Gaps, redundancies, ideal setup' },
  { id: 'reward_maximization', label: 'Reward Maximization', icon: Zap, desc: 'Strategy to maximize yearly rewards' },
  { id: 'minimalist_wallet', label: 'Minimalist Wallet', icon: ThumbsUp, desc: 'Best 1, 2, or 3 card setup' },
  { id: 'card_health_check', label: 'Card Health Check', icon: CheckCircle, desc: 'Deep audit of every card' },
];

function Section({ title, icon: Icon, color = 'violet', children }) {
  const colors = {
    violet: 'bg-violet-50 border-violet-200 text-violet-800',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    red: 'bg-red-50 border-red-200 text-red-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    orange: 'bg-orange-50 border-orange-200 text-orange-800',
  };
  return (
    <div className={`border rounded-xl p-4 ${colors[color]}`}>
      <h4 className="font-semibold text-sm flex items-center gap-1.5 mb-3">
        {Icon && <Icon className="w-4 h-4" />} {title}
      </h4>
      {children}
    </div>
  );
}

function RecommendationResult({ rec }) {
  if (!rec) return null;
  const mode = rec.mode;

  const Summary = () => rec.summary ? (
    <Section title="Summary" icon={Sparkles} color="violet">
      <p className="text-sm leading-relaxed">{rec.summary}</p>
    </Section>
  ) : null;

  const Actions = ({ actions }) => actions?.length > 0 ? (
    <Section title="Immediate Actions" icon={Zap} color="orange">
      <ol className="space-y-1.5">
        {actions.map((a, i) => (
          <li key={i} className="flex items-start gap-2 text-xs">
            <span className="flex-shrink-0 w-4 h-4 rounded-full bg-orange-200 text-orange-700 flex items-center justify-center font-bold text-[10px]">{i + 1}</span>
            <span>{a}</span>
          </li>
        ))}
      </ol>
    </Section>
  ) : null;

  if (mode === 'keep_vs_close') return (
    <div className="space-y-4">
      <Summary />
      {rec.cards?.map((c, i) => {
        const verdictStyle = { keep: 'bg-emerald-100 text-emerald-700', downgrade: 'bg-amber-100 text-amber-700', close: 'bg-red-100 text-red-700' }[c.verdict] || 'bg-surface-100 text-surface-600';
        return (
          <div key={i} className="border border-surface-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-surface-800">{c.card_name}</p>
              <div className="flex items-center gap-2">
                {c.score && <span className="text-xs font-bold text-surface-600 bg-surface-100 px-1.5 py-0.5 rounded-md">{c.score}/10</span>}
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${verdictStyle}`}>{c.verdict}</span>
              </div>
            </div>
            <p className="text-xs text-surface-600 leading-relaxed">{c.reasoning}</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {c.yearly_value_est && <div className="bg-surface-50 rounded-lg p-2"><span className="text-surface-400">Est. yearly value: </span><span className="font-medium text-emerald-700">{c.yearly_value_est}</span></div>}
              {c.fee_justified !== undefined && <div className="bg-surface-50 rounded-lg p-2"><span className="text-surface-400">Fee justified: </span><span className={`font-medium ${c.fee_justified ? 'text-emerald-700' : 'text-red-600'}`}>{c.fee_justified ? 'Yes' : 'No'}</span></div>}
            </div>
            {c.risks_of_closing && c.verdict !== 'keep' && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2"><span className="font-medium">Risk of closing: </span>{c.risks_of_closing}</p>}
            {c.replacement_suggestion && <p className="text-xs text-blue-700 bg-blue-50 rounded-lg p-2"><span className="font-medium">Suggested replacement: </span>{c.replacement_suggestion}</p>}
          </div>
        );
      })}
      <Actions actions={rec.immediate_actions} />
      {rec.ecosystem_impact && <Section title="Ecosystem Impact" icon={Shield} color="blue"><p className="text-sm leading-relaxed">{rec.ecosystem_impact}</p></Section>}
    </div>
  );

  if (mode === 'best_card_per_category') return (
    <div className="space-y-4">
      <Summary />
      <div className="space-y-3">
        {rec.categories?.map((c, i) => (
          <div key={i} className="border border-surface-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-semibold text-surface-800 text-sm capitalize">{c.category.replace(/_/g, ' ')}</span>
              <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{c.expected_reward}</span>
            </div>
            <p className="text-xs font-medium text-primary-700 mb-1">→ {c.best_card}</p>
            <p className="text-xs text-surface-500 leading-relaxed mb-2">{c.why_it_wins}</p>
            <div className="flex flex-wrap gap-2 text-xs">
              {c.fallback_card && <span className="bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full">Fallback: {c.fallback_card}</span>}
              {c.caps_or_exclusions && <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">⚠ {c.caps_or_exclusions}</span>}
            </div>
            {c.cards_to_avoid?.length > 0 && <p className="text-xs text-red-500 mt-1">Avoid: {c.cards_to_avoid.join(', ')}</p>}
          </div>
        ))}
      </div>
      {rec.routing_tip && <Section title="Routing Tip" icon={Zap} color="blue"><p className="text-sm leading-relaxed">{rec.routing_tip}</p></Section>}
    </div>
  );

  if (mode === 'portfolio_optimization') return (
    <div className="space-y-4">
      <Summary />
      {rec.gaps?.length > 0 && <Section title="Portfolio Gaps" icon={Target} color="red"><ul className="space-y-1">{rec.gaps.map((g, i) => <li key={i} className="text-xs flex items-start gap-1.5"><span className="text-red-400 mt-0.5">•</span>{g}</li>)}</ul></Section>}
      {rec.redundancies?.length > 0 && <Section title="Redundancies" icon={ThumbsDown} color="amber"><div className="space-y-2">{rec.redundancies.map((r, i) => <div key={i} className="text-xs"><span className="font-medium">{r.cards?.join(' + ')}: </span>{r.issue}</div>)}</div></Section>}
      {rec.optimized_setup?.length > 0 && (
        <Section title="Optimized Setup" icon={Star} color="emerald">
          <div className="space-y-2">
            {rec.optimized_setup.map((s, i) => (
              <div key={i} className="text-xs flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-200 text-emerald-800 flex items-center justify-center font-bold text-[10px]">{i + 1}</span>
                <div><span className="font-medium">{s.card}</span> — {s.role}{s.monthly_target_spend ? ` (target: ${s.monthly_target_spend}/mo)` : ''}</div>
              </div>
            ))}
          </div>
        </Section>
      )}
      {rec.yearly_reward_estimate && <Section title="Yearly Reward Estimate" icon={Zap} color="violet"><p className="text-2xl font-bold">{rec.yearly_reward_estimate}</p></Section>}
      {rec.simplified_plan && <Section title="Simplified Usage Plan" icon={CheckCircle} color="blue"><p className="text-sm leading-relaxed">{rec.simplified_plan}</p></Section>}
      <Actions actions={rec.immediate_actions} />
    </div>
  );

  if (mode === 'reward_maximization') return (
    <div className="space-y-4">
      <Summary />
      {rec.strategy_map?.length > 0 && (
        <Section title="Strategy Map" icon={Target} color="violet">
          <div className="space-y-3">
            {rec.strategy_map.map((s, i) => (
              <div key={i} className="border border-violet-200 rounded-lg p-3 bg-white">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-medium text-sm text-surface-800">{s.card}</span>
                  <span className="text-xs text-emerald-700 font-medium">{s.expected_reward}</span>
                </div>
                <p className="text-xs text-surface-500">{s.spend_category}{s.monthly_target ? ` · target ${s.monthly_target}/mo` : ''}</p>
                {s.milestone_tip && <p className="text-xs text-amber-700 mt-1">🎯 {s.milestone_tip}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}
      {rec.stacking_opportunities?.length > 0 && <Section title="Stacking Opportunities" icon={Zap} color="amber"><ul className="space-y-1">{rec.stacking_opportunities.map((s, i) => <li key={i} className="text-xs flex gap-1.5"><span className="text-amber-500">⚡</span>{s}</li>)}</ul></Section>}
      {rec.redemption_tips?.length > 0 && <Section title="Redemption Tips" icon={Star} color="emerald"><ul className="space-y-1">{rec.redemption_tips.map((t, i) => <li key={i} className="text-xs flex gap-1.5"><span className="text-emerald-500">→</span>{t}</li>)}</ul></Section>}
      {rec.estimated_extra_yearly_value && <Section title="Estimated Extra Yearly Value" icon={Target} color="blue"><p className="text-2xl font-bold text-blue-800">{rec.estimated_extra_yearly_value}</p></Section>}
    </div>
  );

  if (mode === 'minimalist_wallet') return (
    <div className="space-y-4">
      <Summary />
      {[['one_card', '1-Card Setup'], ['two_card', '2-Card Setup'], ['three_card', '3-Card Setup']].map(([key, label]) => rec[key] && (
        <div key={key} className="border border-surface-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-surface-800 text-sm">{label}</h4>
            <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{rec[key].effective_return}</span>
          </div>
          <p className="text-sm font-medium text-primary-700 mb-1">{Array.isArray(rec[key].cards) ? rec[key].cards.join(' + ') : rec[key].card}</p>
          <p className="text-xs text-surface-500 mb-2 leading-relaxed">{rec[key].why}</p>
          <div className="flex gap-3 text-xs text-surface-400">
            <span>Coverage: {rec[key].coverage}</span>
            <span>·</span>
            <span>Fees: {rec[key].annual_fee || rec[key].combined_fee}</span>
          </div>
        </div>
      ))}
      {rec.cards_to_close?.length > 0 && <Section title="Cards to Close" icon={ThumbsDown} color="red"><ul className="space-y-1">{rec.cards_to_close.map((c, i) => <li key={i} className="text-xs">{c}</li>)}</ul></Section>}
      {rec.simplification_tip && <Section title="Simplification Tip" icon={CheckCircle} color="blue"><p className="text-sm leading-relaxed">{rec.simplification_tip}</p></Section>}
    </div>
  );

  if (mode === 'card_health_check') return (
    <div className="space-y-4">
      <Summary />
      {rec.portfolio_health_score && (
        <div className="flex items-center gap-3 bg-surface-50 border border-surface-200 rounded-xl p-4">
          <div className="text-3xl font-bold text-surface-800">{rec.portfolio_health_score}<span className="text-base font-normal text-surface-400">/10</span></div>
          <div><p className="text-sm font-medium text-surface-700">Portfolio Health Score</p><p className="text-xs text-surface-400">{rec.overall_verdict}</p></div>
        </div>
      )}
      {rec.cards?.map((c, i) => {
        const ratingColor = { overrated: 'bg-red-100 text-red-700', underrated: 'bg-emerald-100 text-emerald-700', 'fairly-rated': 'bg-surface-100 text-surface-600' }[c.rating] || 'bg-surface-100 text-surface-600';
        const viabilityColor = { strong: 'text-emerald-600', moderate: 'text-amber-600', weak: 'text-red-600' }[c.long_term_viability] || 'text-surface-500';
        return (
          <div key={i} className="border border-surface-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-surface-800">{c.card_name}</p>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold bg-surface-100 text-surface-700 px-1.5 py-0.5 rounded-md">{c.health_score}/10</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ratingColor}`}>{c.rating}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {c.strengths?.length > 0 && <div className="bg-emerald-50 rounded-lg p-2"><p className="text-xs font-medium text-emerald-700 mb-1">Strengths</p><ul className="space-y-0.5">{c.strengths.map((s, j) => <li key={j} className="text-xs text-emerald-600">+ {s}</li>)}</ul></div>}
              {c.weaknesses?.length > 0 && <div className="bg-red-50 rounded-lg p-2"><p className="text-xs font-medium text-red-700 mb-1">Weaknesses</p><ul className="space-y-0.5">{c.weaknesses.map((w, j) => <li key={j} className="text-xs text-red-600">− {w}</li>)}</ul></div>}
            </div>
            {c.hidden_issues?.length > 0 && <div className="bg-amber-50 rounded-lg p-2"><p className="text-xs font-medium text-amber-700 mb-1">Hidden Issues</p><ul className="space-y-0.5">{c.hidden_issues.map((h, j) => <li key={j} className="text-xs text-amber-600">⚠ {h}</li>)}</ul></div>}
            <div className="flex flex-wrap gap-3 text-xs text-surface-500">
              <span>Fee justified: <span className={c.fee_justified ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>{c.fee_justified ? 'Yes' : 'No'}</span></span>
              <span>Long-term: <span className={`font-medium ${viabilityColor}`}>{c.long_term_viability}</span></span>
            </div>
            {c.fee_justification && <p className="text-xs text-surface-500 italic">{c.fee_justification}</p>}
          </div>
        );
      })}
    </div>
  );

  return <pre className="text-xs text-surface-500 overflow-auto">{JSON.stringify(rec, null, 2)}</pre>;
}

function CardRecommendations({ sym }) {
  const [cards, setCards] = useState([]);
  const [selectedMode, setSelectedMode] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [recLoading, setRecLoading] = useState(false);
  const [benefitsLoading, setBenefitsLoading] = useState({});
  const [editingBenefits, setEditingBenefits] = useState({});
  const [benefitDrafts, setBenefitDrafts] = useState({});
  const [urlInputs, setUrlInputs] = useState({});
  const [showUrlInput, setShowUrlInput] = useState({});

  useEffect(() => {
    api.get('/cards').then(r => setCards(r.data.cards)).catch(() => toast.error('Failed to load cards'));
  }, []);

  const fetchBenefits = async (card) => {
    setBenefitsLoading(p => ({ ...p, [card.id]: true }));
    try {
      const url = urlInputs[card.id]?.trim() || undefined;
      const { data } = await api.post(`/ai/card-benefits/${card.id}`, url ? { url } : {});
      setCards(prev => prev.map(c => c.id === card.id ? { ...c, benefits: data.benefits } : c));
      setShowUrlInput(p => ({ ...p, [card.id]: false }));
      if (data.url_blocked) toast('URL blocked by bank site — used AI knowledge instead', { icon: '⚠️' });
      else toast.success(`Benefits fetched for ${card.nickname}`);
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

  const runAnalysis = async (mode) => {
    setSelectedMode(mode);
    setRecommendations(null);
    setRecLoading(true);
    try {
      const { data } = await api.get(`/ai/recommendations?mode=${mode}`);
      setRecommendations(data.recommendations);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Analysis failed');
      setSelectedMode(null);
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
          <p className="text-xs text-surface-400">Fetch or edit benefits per card — better benefits = better AI analysis.</p>
        </div>
        {cards.length === 0 ? (
          <p className="text-surface-400 text-sm text-center py-6">No cards found.</p>
        ) : (
          <div className="space-y-3">
            {cards.map(card => (
              <div key={card.id} className="border border-surface-200 rounded-xl p-3">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="font-semibold text-surface-800 text-sm">{card.nickname}</p>
                    <p className="text-xs text-surface-400">{card.bank_name} · ****{card.last_four}</p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => setShowUrlInput(p => ({ ...p, [card.id]: !p[card.id] }))}
                      className="btn-secondary text-xs py-1 px-2">🔗</button>
                    <button onClick={() => fetchBenefits(card)} disabled={benefitsLoading[card.id]}
                      className="btn-secondary flex items-center gap-1 text-xs py-1 px-2">
                      {benefitsLoading[card.id] ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-violet-500" />}
                      {benefitsLoading[card.id] ? 'Fetching...' : card.benefits ? 'Re-fetch' : 'Fetch'}
                    </button>
                    {!editingBenefits[card.id] && (
                      <button onClick={() => { setEditingBenefits(p => ({ ...p, [card.id]: true })); setBenefitDrafts(p => ({ ...p, [card.id]: card.benefits || '' })); }}
                        className="btn-secondary text-xs py-1 px-2">Edit</button>
                    )}
                  </div>
                </div>
                {showUrlInput[card.id] && (
                  <input className="input text-xs mb-2" type="url" placeholder="https://bank.com/card-page"
                    value={urlInputs[card.id] || ''} onChange={e => setUrlInputs(p => ({ ...p, [card.id]: e.target.value }))} />
                )}
                {editingBenefits[card.id] ? (
                  <div className="space-y-1.5">
                    <textarea className="input resize-none text-xs font-mono h-24 w-full"
                      value={benefitDrafts[card.id]} onChange={e => setBenefitDrafts(p => ({ ...p, [card.id]: e.target.value }))}
                      placeholder="- 2% cashback on groceries&#10;- ₹500 annual fee" />
                    <div className="flex gap-1.5">
                      <button onClick={() => saveBenefits(card)} className="btn-primary text-xs py-1 px-3">Save</button>
                      <button onClick={() => setEditingBenefits(p => ({ ...p, [card.id]: false }))} className="btn-secondary text-xs py-1 px-3">Cancel</button>
                    </div>
                  </div>
                ) : card.benefits ? (
                  <div className="text-xs text-surface-500 whitespace-pre-line bg-surface-50 border border-surface-100 rounded-lg p-2 font-mono leading-relaxed">{card.benefits}</div>
                ) : (
                  <p className="text-xs text-surface-400 italic">No benefits — click Fetch to auto-fill.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mode selection */}
      <div className="card">
        <h3 className="font-semibold text-surface-800 flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-violet-500" /> AI Portfolio Analysis
        </h3>
        <p className="text-xs text-surface-400 mb-4">Choose an analysis mode. Each gives a different deep-dive into your card portfolio.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {MODES.map(mode => {
            const Icon = mode.icon;
            const isActive = selectedMode === mode.id;
            const isLoading = recLoading && selectedMode === mode.id;
            return (
              <button key={mode.id} onClick={() => runAnalysis(mode.id)} disabled={recLoading}
                className={`text-left p-3 rounded-xl border transition-all ${isActive ? 'border-primary-400 bg-primary-50' : 'border-surface-200 hover:border-primary-300 hover:bg-surface-50'}`}>
                <div className="flex items-center gap-2 mb-1">
                  {isLoading ? <RefreshCw className="w-4 h-4 text-primary-500 animate-spin" /> : <Icon className="w-4 h-4 text-primary-500" />}
                  <span className="font-semibold text-sm text-surface-800">{mode.label}</span>
                </div>
                <p className="text-xs text-surface-400">{mode.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Results */}
      {recLoading && (
        <div className="card text-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-primary-500 mx-auto mb-3" />
          <p className="text-sm text-surface-600 font-medium">Running analysis…</p>
          <p className="text-xs text-surface-400 mt-1">This may take 10–20 seconds</p>
        </div>
      )}

      {recommendations && !recLoading && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-surface-800">
              {MODES.find(m => m.id === selectedMode)?.label}
            </h3>
            <button onClick={() => runAnalysis(selectedMode)} className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-3">
              <RefreshCw className="w-3 h-3" /> Re-run
            </button>
          </div>
          <RecommendationResult rec={recommendations} />
          <p className="text-xs text-surface-400 flex items-center gap-1 mt-4">
            <Sparkles className="w-3 h-3" /> Based on 6 months of spending data. Re-run anytime after updating benefits.
          </p>
        </div>
      )}
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
