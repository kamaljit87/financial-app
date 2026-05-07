import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, X, Edit2, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import api, { formatCurrency } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const TYPES = ['purchase', 'emi', 'payment', 'refund', 'fee', 'cashback'];
const CATEGORIES = ['food','transport','shopping','utilities','healthcare','entertainment','education','travel','emi','payment','fuel','groceries','dining','subscriptions','insurance','rent','other'];

const TYPE_COLORS = {
  purchase: 'badge-red', emi: 'badge-yellow', payment: 'badge-green',
  refund: 'badge-blue', fee: 'badge-yellow', cashback: 'badge-green',
};
const AMOUNT_COLORS = {
  purchase: 'text-red-600', emi: 'text-orange-600', payment: 'text-emerald-600',
  refund: 'text-blue-600', fee: 'text-amber-600', cashback: 'text-teal-600',
};

const EMPTY_FORM = { title: '', amount: '', transaction_type: 'purchase', category: 'other', date: new Date().toISOString().split('T')[0], card_id: '', notes: '', tags: '', is_recurring: false, reference_number: '' };

function TransactionModal({ txn, cards, onClose, onSave }) {
  const [form, setForm] = useState(txn ? { ...txn, tags: Array.isArray(txn.tags) ? txn.tags.join(', ') : '' } : EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...form,
        amount: parseFloat(form.amount),
        card_id: form.card_id || null,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        is_recurring: form.is_recurring ? 1 : 0,
      };
      if (txn) await api.put(`/transactions/${txn.id}`, payload);
      else await api.post('/transactions', payload);
      toast.success(txn ? 'Transaction updated' : 'Transaction added');
      onSave();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-900/50 backdrop-blur-sm">
      <div className="bg-white border border-surface-200 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-card-lg">
        <div className="flex items-center justify-between p-5 border-b border-surface-200">
          <h2 className="font-semibold text-surface-800">{txn ? 'Edit Transaction' : 'Add Transaction'}</h2>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-600 p-1"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Title *</label>
            <input className="input" placeholder="e.g. Amazon Purchase" value={form.title} onChange={e => set('title', e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Amount (₹) *</label>
              <input className="input" type="number" min="0.01" step="0.01" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} required />
            </div>
            <div>
              <label className="label">Date *</label>
              <input className="input" type="date" value={form.date} onChange={e => set('date', e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Type *</label>
              <select className="input" value={form.transaction_type} onChange={e => set('transaction_type', e.target.value)}>
                {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Category *</label>
              <select className="input" value={form.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Credit Card (Optional)</label>
            <select className="input" value={form.card_id} onChange={e => set('card_id', e.target.value)}>
              <option value="">No card / Cash</option>
              {cards.map(c => <option key={c.id} value={c.id}>{c.nickname} (****{c.last_four})</option>)}
            </select>
          </div>
          <div>
            <label className="label">Reference Number</label>
            <input className="input" placeholder="Optional transaction ID" value={form.reference_number} onChange={e => set('reference_number', e.target.value)} />
          </div>
          <div>
            <label className="label">Tags (comma-separated)</label>
            <input className="input" placeholder="e.g. essential, online, food" value={form.tags} onChange={e => set('tags', e.target.value)} />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input resize-none h-16" placeholder="Optional notes..." value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="recurring" checked={form.is_recurring} onChange={e => set('is_recurring', e.target.checked)} className="w-4 h-4" />
            <label htmlFor="recurring" className="text-sm text-surface-500">Recurring transaction</label>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1" disabled={loading}>{loading ? 'Saving...' : txn ? 'Update' : 'Add Transaction'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [cards, setCards] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTxn, setEditTxn] = useState(null);
  const [filters, setFilters] = useState({ search: '', type: '', category: '', card_id: '', start_date: '', end_date: '' });
  const [page, setPage] = useState(1);
  const { settings } = useAuth();
  const sym = settings?.currency_symbol || '₹';

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) };
      const { data } = await api.get('/transactions', { params });
      setTransactions(data.transactions);
      setPagination(data.pagination);
    } catch { toast.error('Failed to load transactions'); }
    finally { setLoading(false); }
  }, [page, filters]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);
  useEffect(() => { api.get('/cards').then(({ data }) => setCards(data.cards)); }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this transaction?')) return;
    try {
      await api.delete(`/transactions/${id}`);
      toast.success('Deleted');
      fetchTransactions();
    } catch { toast.error('Failed to delete'); }
  };

  const setFilter = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(1); };
  const clearFilters = () => { setFilters({ search: '', type: '', category: '', card_id: '', start_date: '', end_date: '' }); setPage(1); };
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-surface-900">Transactions</h2>
          <p className="text-sm text-surface-400">{pagination.total} total transactions</p>
        </div>
        <button onClick={() => { setEditTxn(null); setShowModal(true); }} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Transaction
        </button>
      </div>

      {/* Filters */}
      <div className="card space-y-3">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input className="input pl-9" placeholder="Search transactions..." value={filters.search}
              onChange={e => setFilter('search', e.target.value)} />
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className="btn-secondary flex items-center gap-1 text-xs">
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <select className="input text-sm" value={filters.type} onChange={e => setFilter('type', e.target.value)}>
            <option value="">All Types</option>
            {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
          <select className="input text-sm" value={filters.category} onChange={e => setFilter('category', e.target.value)}>
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
          <select className="input text-sm" value={filters.card_id} onChange={e => setFilter('card_id', e.target.value)}>
            <option value="">All Cards</option>
            {cards.map(c => <option key={c.id} value={c.id}>{c.nickname}</option>)}
          </select>
          <input className="input text-sm" type="date" value={filters.start_date} onChange={e => setFilter('start_date', e.target.value)} />
          <input className="input text-sm" type="date" value={filters.end_date} onChange={e => setFilter('end_date', e.target.value)} />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-surface-400 border-b border-surface-100">
                <th className="pb-3 pl-1 font-medium">Date</th>
                <th className="pb-3 font-medium">Description</th>
                <th className="pb-3 font-medium hidden sm:table-cell">Type</th>
                <th className="pb-3 font-medium hidden md:table-cell">Category</th>
                <th className="pb-3 font-medium hidden lg:table-cell">Card</th>
                <th className="pb-3 font-medium text-right">Amount</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-12 text-center">
                  <div className="w-6 h-6 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mx-auto" />
                </td></tr>
              ) : transactions.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-surface-400">
                  {hasFilters ? 'No transactions match your filters' : 'No transactions yet — add your first!'}
                </td></tr>
              ) : transactions.map(txn => (
                <tr key={txn.id} className="table-row">
                  <td className="py-2.5 pl-1 text-surface-400 whitespace-nowrap text-xs">
                    {new Date(txn.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </td>
                  <td className="py-2.5 max-w-[140px]">
                    <p className="text-surface-800 truncate">{txn.title}</p>
                    {txn.notes && <p className="text-xs text-surface-400 truncate">{txn.notes}</p>}
                  </td>
                  <td className="py-2.5 hidden sm:table-cell">
                    <span className={`${TYPE_COLORS[txn.transaction_type] || 'badge-blue'} capitalize text-xs`}>{txn.transaction_type}</span>
                  </td>
                  <td className="py-2.5 hidden md:table-cell">
                    <span className="text-surface-500 text-xs capitalize">{txn.category}</span>
                  </td>
                  <td className="py-2.5 hidden lg:table-cell">
                    {txn.card_nickname ? (
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: txn.card_color || '#6366f1' }} />
                        <span className="text-surface-500 text-xs">{txn.card_nickname}</span>
                      </div>
                    ) : <span className="text-surface-300 text-xs">Cash</span>}
                  </td>
                  <td className={`py-2.5 text-right font-medium ${AMOUNT_COLORS[txn.transaction_type] || 'text-surface-800'}`}>
                    {['payment','refund','cashback'].includes(txn.transaction_type) ? '+' : '-'}
                    {formatCurrency(txn.amount, sym)}
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setEditTxn(txn); setShowModal(true); }}
                        className="p-1.5 text-surface-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(txn.id)}
                        className="p-1.5 text-surface-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 mt-4 border-t border-surface-100 px-1">
            <p className="text-xs text-surface-400">
              Page {pagination.page} of {pagination.totalPages} · {pagination.total} results
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="btn-secondary p-1.5 disabled:opacity-40">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={page >= pagination.totalPages}
                className="btn-secondary p-1.5 disabled:opacity-40">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {showModal && <TransactionModal txn={editTxn} cards={cards} onClose={() => setShowModal(false)} onSave={() => { setShowModal(false); fetchTransactions(); }} />}
    </div>
  );
}
