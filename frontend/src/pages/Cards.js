import React, { useState, useEffect } from 'react';
import { Plus, CreditCard, Edit2, Trash2, X, Eye, EyeOff, Banknote, Sparkles, RefreshCw, Link } from 'lucide-react';
import api, { formatCurrency } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const CARD_COLORS = ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#3b82f6'];

const EMPTY_FORM = { nickname: '', bank_name: '', last_four: '', credit_limit: '', current_balance: '', billing_date: '', due_date: '', interest_rate: '', notes: '', color: '#6366f1', card_type: 'credit', is_active: true, shared_limit_group: '', shared_limit_pool: '' };

function CardModal({ card, onClose, onSave, existingCards = [] }) {
  const [form, setForm] = useState(card ? { ...card, is_active: card.is_active === 1, shared_limit_group: card.shared_limit_group || '', shared_limit_pool: card.shared_limit_pool ?? '', current_balance: card.current_balance ?? '' } : EMPTY_FORM);
  const existingGroups = [...new Set(existingCards.filter(c => c.shared_limit_group && c.id !== card?.id).map(c => c.shared_limit_group))];
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const set = (k, v) => { setForm(p => ({ ...p, [k]: v })); setErrors(p => ({ ...p, [k]: undefined })); };

  const validate = () => {
    const e = {};
    if (!form.nickname.trim()) e.nickname = 'Required';
    if (!form.bank_name.trim()) e.bank_name = 'Required';
    if (!/^\d{4}$/.test(form.last_four)) e.last_four = 'Must be exactly 4 digits';
    if (!form.credit_limit || isNaN(form.credit_limit) || parseFloat(form.credit_limit) < 0) e.credit_limit = 'Valid amount required';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
      const payload = {
        ...form,
        credit_limit: parseFloat(form.credit_limit),
        current_balance: form.current_balance !== '' ? parseFloat(form.current_balance) : 0,
        shared_limit_pool: form.shared_limit_pool !== '' ? parseFloat(form.shared_limit_pool) : null,
        billing_date: form.billing_date ? parseInt(form.billing_date) : null,
        due_date: form.due_date ? parseInt(form.due_date) : null,
        interest_rate: form.interest_rate ? parseFloat(form.interest_rate) : null,
        is_active: form.is_active ? 1 : 0,
      };
      if (card) await api.put(`/cards/${card.id}`, payload);
      else await api.post('/cards', payload);
      toast.success(card ? 'Card updated' : 'Card added');
      onSave();
    } catch (err) {
      const data = err.response?.data;
      const msg = data?.details?.length
        ? data.details.map(d => `${d.field}: ${d.message}`).join(', ')
        : data?.error || 'Failed to save card';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-900/50 backdrop-blur-sm">
      <div className="bg-white border border-surface-200 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-card-lg">
        <div className="flex items-center justify-between p-5 border-b border-surface-200">
          <h2 className="font-semibold text-surface-800">{card ? 'Edit Card' : 'Add Credit Card'}</h2>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-600 p-1"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Card Nickname *</label>
              <input className="input" placeholder="My HDFC Card" value={form.nickname} onChange={e => set('nickname', e.target.value)} />
              {errors.nickname && <p className="text-red-500 text-xs mt-1">{errors.nickname}</p>}
            </div>
            <div>
              <label className="label">Bank Name *</label>
              <input className="input" placeholder="HDFC Bank" value={form.bank_name} onChange={e => set('bank_name', e.target.value)} />
              {errors.bank_name && <p className="text-red-500 text-xs mt-1">{errors.bank_name}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Last 4 Digits *</label>
              <input className="input font-mono tracking-widest" placeholder="4242" maxLength={4}
                value={form.last_four} onChange={e => set('last_four', e.target.value.replace(/\D/g, ''))} />
              {errors.last_four && <p className="text-red-500 text-xs mt-1">{errors.last_four}</p>}
            </div>
            <div>
              <label className="label">Card Type</label>
              <select className="input" value={form.card_type} onChange={e => set('card_type', e.target.value)}>
                <option value="credit">Credit Card</option>
                <option value="debit">Debit Card</option>
                <option value="prepaid">Prepaid Card</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Credit Limit (₹) *</label>
              <input className="input" type="number" min="0" placeholder="100000" value={form.credit_limit} onChange={e => set('credit_limit', e.target.value)} />
              {errors.credit_limit && <p className="text-red-500 text-xs mt-1">{errors.credit_limit}</p>}
            </div>
            <div>
              <label className="label">Current Balance (₹)</label>
              <input className="input" type="number" min="0" placeholder="0" value={form.current_balance} onChange={e => set('current_balance', e.target.value)} />
              <p className="text-xs text-surface-400 mt-1">Amount you currently owe</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Billing Date</label>
              <input className="input" type="number" min="1" max="31" placeholder="1-31" value={form.billing_date} onChange={e => set('billing_date', e.target.value)} />
            </div>
            <div>
              <label className="label">Due Date</label>
              <input className="input" type="number" min="1" max="31" placeholder="1-31" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
            </div>
            <div>
              <label className="label">Interest Rate (%)</label>
              <input className="input" type="number" min="0" max="100" step="0.1" placeholder="36.0" value={form.interest_rate} onChange={e => set('interest_rate', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Card Color</label>
            <div className="flex gap-2 flex-wrap">
              {CARD_COLORS.map(c => (
                <button key={c} type="button" onClick={() => set('color', c)}
                  className={`w-7 h-7 rounded-full transition-all ${form.color === c ? 'ring-2 ring-primary-600 ring-offset-2 scale-110' : ''}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input resize-none h-16" placeholder="Optional notes..." value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Shared Limit Group <span className="text-surface-400 font-normal">(optional)</span></label>
              <input className="input" placeholder={`e.g. ${form.bank_name || 'HDFC'} Pool`}
                list="group-suggestions"
                value={form.shared_limit_group}
                onChange={e => set('shared_limit_group', e.target.value)} />
              <datalist id="group-suggestions">
                {existingGroups.map(g => <option key={g} value={g} />)}
              </datalist>
              <p className="text-xs text-surface-400 mt-1">Cards in the same group share a combined limit.</p>
            </div>
            <div>
              <label className="label">Pool Limit (₹) <span className="text-surface-400 font-normal">(optional)</span></label>
              <input className="input" type="number" min="0" placeholder="e.g. 290000"
                value={form.shared_limit_pool}
                disabled={!form.shared_limit_group}
                onChange={e => set('shared_limit_pool', e.target.value)} />
              <p className="text-xs text-surface-400 mt-1">Overrides card limits. Set on one card only.</p>
            </div>
          </div>
          {card && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} className="w-4 h-4" />
              <label htmlFor="is_active" className="text-sm text-surface-500">Active card</label>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1" disabled={loading}>
              {loading ? 'Saving...' : card ? 'Update Card' : 'Add Card'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PayModal({ card, onClose, onSave, sym }) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return toast.error('Enter a valid amount');
    setLoading(true);
    try {
      await api.post('/transactions', {
        title: `Payment — ${card.nickname}`,
        amount: parseFloat(amount),
        transaction_type: 'payment',
        category: 'payment',
        date,
        card_id: card.id,
        reference_number: reference || null,
        notes: '',
        tags: [],
        is_recurring: 0,
      });
      toast.success(`Payment of ${sym}${parseFloat(amount).toLocaleString('en-IN')} recorded`);
      onSave();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to record payment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-900/50 backdrop-blur-sm">
      <div className="bg-white border border-surface-200 rounded-2xl w-full max-w-sm shadow-card-lg">
        <div className="flex items-center justify-between p-5 border-b border-surface-200">
          <div>
            <h2 className="font-semibold text-surface-800">Pay Card</h2>
            <p className="text-xs text-surface-400 mt-0.5">{card.nickname} · ****{card.last_four}</p>
          </div>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-600 p-1"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="bg-surface-50 rounded-xl p-3 flex justify-between text-sm">
            <span className="text-surface-500">Outstanding balance</span>
            <span className="font-semibold text-red-600">{sym}{Number(card.current_balance).toLocaleString('en-IN')}</span>
          </div>
          <div>
            <label className="label">Payment Amount ({sym}) *</label>
            <input className="input text-lg font-semibold" type="number" min="0.01" step="0.01"
              placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} autoFocus required />
            <div className="flex gap-2 mt-2">
              {[card.current_balance, card.current_balance / 2].filter(v => v > 0).map((v, i) => (
                <button key={i} type="button"
                  className="text-xs px-2.5 py-1 rounded-lg bg-primary-50 text-primary-700 border border-primary-200 hover:bg-primary-100 transition-colors"
                  onClick={() => setAmount(v.toFixed(2))}>
                  {i === 0 ? 'Full' : 'Half'} — {sym}{Math.round(v).toLocaleString('en-IN')}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Payment Date *</label>
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </div>
          <div>
            <label className="label">Reference Number <span className="text-surface-400 font-normal">(optional)</span></label>
            <input className="input" placeholder="UTR / Transaction ID" value={reference} onChange={e => setReference(e.target.value)} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1" disabled={loading}>
              {loading ? 'Recording...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Cards() {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editCard, setEditCard] = useState(null);
  const [maskedCards, setMaskedCards] = useState(new Set());
  const [payCard, setPayCard] = useState(null);
  const [benefitsPanel, setBenefitsPanel] = useState({});
  const [benefitUrls, setBenefitUrls] = useState({});
  const [benefitsLoading, setBenefitsLoading] = useState({});
  const { settings } = useAuth();
  const sym = settings?.currency_symbol || '₹';

  const fetchCards = async () => {
    try {
      const { data } = await api.get('/cards');
      setCards(data.cards);
    } catch (err) {
      toast.error('Failed to load cards');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCards(); }, []);

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/cards/${id}`);
      toast.success('Card deleted');
      fetchCards();
    } catch {
      toast.error('Failed to delete card');
    }
  };

  const fetchBenefits = async (card) => {
    setBenefitsLoading(p => ({ ...p, [card.id]: true }));
    try {
      const url = benefitUrls[card.id]?.trim() || undefined;
      const { data } = await api.post(`/ai/card-benefits/${card.id}`, url ? { url } : {});
      setCards(prev => prev.map(c => c.id === card.id ? { ...c, benefits: data.benefits } : c));
      toast.success('Benefits fetched');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to fetch benefits');
    } finally {
      setBenefitsLoading(p => ({ ...p, [card.id]: false }));
    }
  };

  const toggleMask = (id) => setMaskedCards(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-surface-900">Credit Cards</h2>
          <p className="text-sm text-surface-400">{cards.length} card{cards.length !== 1 ? 's' : ''} · Only last 4 digits stored</p>
        </div>
        <button onClick={() => { setEditCard(null); setShowModal(true); }} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Card
        </button>
      </div>

      {cards.length === 0 ? (
        <div className="card text-center py-16">
          <CreditCard className="w-12 h-12 text-surface-300 mx-auto mb-4" />
          <p className="text-surface-600 mb-2">No credit cards added yet</p>
          <p className="text-surface-400 text-sm mb-6">Add your credit cards to start tracking debt</p>
          <button onClick={() => setShowModal(true)} className="btn-primary">Add Your First Card</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {cards.map(card => {
            const unmasked = maskedCards.has(card.id);
            const util = parseFloat(card.utilization_percent);
            const utilColor = util > 70 ? 'bg-red-500' : util > 50 ? 'bg-amber-500' : 'bg-emerald-500';
            const utilText = util > 70 ? 'text-red-600' : util > 50 ? 'text-amber-600' : 'text-emerald-600';

            const grp = card.group_summary;

            return (
              <div key={card.id} className="card-hover overflow-hidden">
                {/* Card visual header */}
                <div className="rounded-xl p-4 mb-4 relative" style={{ background: `linear-gradient(135deg, ${card.color}22, ${card.color}0d)`, border: `1px solid ${card.color}40` }}>
                  <div className="flex items-start justify-between mb-8">
                    <div>
                      <p className="text-xs text-surface-500 mb-0.5">{card.bank_name}</p>
                      <p className="font-semibold text-surface-800">{card.nickname}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="badge-purple text-xs capitalize">{card.card_type}</span>
                      {card.shared_limit_group && <span className="badge-blue text-xs">Shared Pool</span>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-surface-600 text-sm tracking-widest">
                      {unmasked ? `**** **** **** ${card.last_four}` : '•••• •••• •••• ••••'}
                    </div>
                    <button onClick={() => toggleMask(card.id)} className="text-surface-400 hover:text-surface-600 p-1">
                      {unmasked ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Stats */}
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-surface-500">Balance</span>
                    <span className="font-semibold text-surface-900">{formatCurrency(card.current_balance, sym)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-surface-500">{grp ? 'Card Limit' : 'Limit'}</span>
                    <span className="text-surface-600">{formatCurrency(card.credit_limit, sym)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-surface-500">Available</span>
                    <span className="text-emerald-600">{formatCurrency(card.available_credit, sym)}</span>
                  </div>

                  {/* Group shared limit banner */}
                  {grp && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 space-y-1.5">
                      <p className="text-xs font-medium text-blue-700">"{card.shared_limit_group}" — Shared Pool ({grp.card_count} cards)</p>
                      <div className="flex justify-between text-xs text-blue-600">
                        <span>Pool used: {formatCurrency(grp.total_balance, sym)}</span>
                        <span>Pool limit: {formatCurrency(grp.shared_limit, sym)}</span>
                      </div>
                      <div className="bg-blue-200 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full transition-all ${utilColor}`}
                          style={{ width: `${Math.min(100, util)}%` }} />
                      </div>
                      <p className="text-xs text-blue-500 text-right">{util}% of shared pool used</p>
                    </div>
                  )}

                  {!grp && (
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-surface-400">Utilization</span>
                        <span className={utilText}>{util}%</span>
                      </div>
                      <div className="bg-surface-200 rounded-full h-2">
                        <div className={`h-2 rounded-full transition-all ${utilColor}`} style={{ width: `${Math.min(100, util)}%` }} />
                      </div>
                    </div>
                  )}

                  {(card.due_date || card.interest_rate) && (
                    <div className="flex gap-3 text-xs text-surface-400 pt-1 border-t border-surface-100">
                      {card.due_date && <span>Due: Day {card.due_date}</span>}
                      {card.interest_rate && <span>APR: {card.interest_rate}%</span>}
                      {card.billing_date && <span>Billing: Day {card.billing_date}</span>}
                    </div>
                  )}

                  {!card.is_active && <div className="badge-yellow text-xs">Inactive</div>}

                  {/* Benefits panel */}
                  {benefitsPanel[card.id] && (
                    <div className="border border-surface-200 rounded-xl p-3 space-y-2 bg-surface-50">
                      <div className="flex gap-2">
                        <input
                          className="input text-xs flex-1 py-1.5"
                          type="url"
                          placeholder="Paste card benefits URL (optional)"
                          value={benefitUrls[card.id] || ''}
                          onChange={e => setBenefitUrls(p => ({ ...p, [card.id]: e.target.value }))}
                        />
                        <button
                          onClick={() => fetchBenefits(card)}
                          disabled={benefitsLoading[card.id]}
                          className="btn-primary flex items-center gap-1 text-xs py-1.5 px-3 flex-shrink-0">
                          {benefitsLoading[card.id]
                            ? <RefreshCw className="w-3 h-3 animate-spin" />
                            : <Sparkles className="w-3 h-3" />}
                          {benefitsLoading[card.id] ? 'Fetching...' : 'Fetch'}
                        </button>
                      </div>
                      {card.benefits && (
                        <div className="text-xs text-surface-600 whitespace-pre-line font-mono leading-relaxed max-h-32 overflow-y-auto">
                          {card.benefits}
                        </div>
                      )}
                      {!card.benefits && !benefitsLoading[card.id] && (
                        <p className="text-xs text-surface-400 italic">Paste a URL or click Fetch to use AI knowledge.</p>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setPayCard(card)}
                      className="btn-primary flex-1 flex items-center justify-center gap-1 text-xs py-1.5">
                      <Banknote className="w-3.5 h-3.5" /> Pay
                    </button>
                    <button onClick={() => setBenefitsPanel(p => ({ ...p, [card.id]: !p[card.id] }))}
                      className="btn-secondary flex-1 flex items-center justify-center gap-1 text-xs py-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-violet-500" /> Benefits
                    </button>
                    <button onClick={() => { setEditCard(card); setShowModal(true); }}
                      className="btn-secondary flex-1 flex items-center justify-center gap-1 text-xs py-1.5">
                      <Edit2 className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button onClick={() => handleDelete(card.id, card.nickname)}
                      className="btn-danger flex-1 flex items-center justify-center gap-1 text-xs py-1.5">
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && <CardModal card={editCard} existingCards={cards} onClose={() => setShowModal(false)} onSave={() => { setShowModal(false); fetchCards(); }} />}
      {payCard && <PayModal card={payCard} sym={sym} onClose={() => setPayCard(null)} onSave={() => { setPayCard(null); fetchCards(); }} />}
    </div>
  );
}
