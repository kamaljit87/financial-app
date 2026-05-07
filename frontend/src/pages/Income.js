import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api, { formatCurrency } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const INCOME_TYPES = ['salary', 'freelance', 'side_income', 'bonus', 'investment', 'rental', 'gift', 'other'];
const TYPE_LABELS = { salary: 'Salary', freelance: 'Freelance', side_income: 'Side Income', bonus: 'Bonus', investment: 'Investment Returns', rental: 'Rental', gift: 'Gift', other: 'Other' };
const TYPE_COLORS = { salary: 'badge-blue', freelance: 'badge-purple', side_income: 'badge-green', bonus: 'badge-yellow', investment: 'badge-blue', rental: 'badge-green', gift: 'badge-purple', other: 'badge-blue' };

const EMPTY_FORM = { source: '', amount: '', income_type: 'salary', date: new Date().toISOString().split('T')[0], category: '', notes: '', tags: '', is_recurring: false };

function IncomeModal({ entry, onClose, onSave }) {
  const [form, setForm] = useState(entry ? { ...entry, tags: Array.isArray(entry.tags) ? entry.tags.join(', ') : '' } : EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...form,
        amount: parseFloat(form.amount),
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        is_recurring: form.is_recurring ? 1 : 0,
      };
      if (entry) await api.put(`/income/${entry.id}`, payload);
      else await api.post('/income', payload);
      toast.success(entry ? 'Income updated' : 'Income entry added');
      onSave();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-900/50 backdrop-blur-sm">
      <div className="bg-white border border-surface-200 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-card-lg">
        <div className="flex items-center justify-between p-5 border-b border-surface-200">
          <h2 className="font-semibold text-surface-800">{entry ? 'Edit Income' : 'Add Income'}</h2>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-600 p-1"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Source *</label>
            <input className="input" placeholder="e.g. Company Salary, Upwork Project" value={form.source}
              onChange={e => set('source', e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Amount (₹) *</label>
              <input className="input" type="number" min="0.01" step="0.01" placeholder="0.00" value={form.amount}
                onChange={e => set('amount', e.target.value)} required />
            </div>
            <div>
              <label className="label">Date *</label>
              <input className="input" type="date" value={form.date} onChange={e => set('date', e.target.value)} required />
            </div>
          </div>
          <div>
            <label className="label">Income Type *</label>
            <select className="input" value={form.income_type} onChange={e => set('income_type', e.target.value)}>
              {INCOME_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Tags (comma-separated)</label>
            <input className="input" placeholder="e.g. monthly, recurring" value={form.tags} onChange={e => set('tags', e.target.value)} />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input resize-none h-16" placeholder="Optional details..." value={form.notes}
              onChange={e => set('notes', e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="recurring_income" checked={form.is_recurring} onChange={e => set('is_recurring', e.target.checked)} className="w-4 h-4" />
            <label htmlFor="recurring_income" className="text-sm text-surface-500">Recurring income</label>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1" disabled={loading}>{loading ? 'Saving...' : entry ? 'Update' : 'Add Income'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Income() {
  const [income, setIncome] = useState([]);
  const [summary, setSummary] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ type: '', start_date: '', end_date: '' });
  const { settings } = useAuth();
  const sym = settings?.currency_symbol || '₹';

  const fetchIncome = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) };
      const [list, sum] = await Promise.all([
        api.get('/income', { params }),
        api.get('/income/summary/monthly', { params: { months: 6 } }),
      ]);
      setIncome(list.data.income);
      setPagination(list.data.pagination);
      setSummary(sum.data.summary);
    } catch { toast.error('Failed to load income'); }
    finally { setLoading(false); }
  }, [page, filters]);

  useEffect(() => { fetchIncome(); }, [fetchIncome]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this income entry?')) return;
    try { await api.delete(`/income/${id}`); toast.success('Deleted'); fetchIncome(); }
    catch { toast.error('Failed to delete'); }
  };

  const chartMap = {};
  summary.forEach(s => {
    if (!chartMap[s.month]) chartMap[s.month] = { month: s.month.slice(5) };
    chartMap[s.month][s.income_type] = (chartMap[s.month][s.income_type] || 0) + s.total;
  });
  const chartData = Object.values(chartMap).sort((a, b) => a.month.localeCompare(b.month));

  const totalThisMonth = income.filter(i => i.date.startsWith(new Date().toISOString().slice(0, 7))).reduce((s, i) => s + i.amount, 0);
  const tooltipStyle = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, color: '#1e293b', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.08)' };

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-surface-900">Income</h2>
          <p className="text-sm text-surface-400">{pagination.total} entries · This month: {formatCurrency(totalThisMonth, sym)}</p>
        </div>
        <button onClick={() => { setEditEntry(null); setShowModal(true); }} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Income
        </button>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-surface-800 mb-4 text-sm">Monthly Income Breakdown (6 Months)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `${sym}${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => formatCurrency(v, sym)} contentStyle={tooltipStyle} />
              <Bar dataKey="salary" stackId="a" fill="#6366f1" name="Salary" />
              <Bar dataKey="freelance" stackId="a" fill="#8b5cf6" name="Freelance" />
              <Bar dataKey="side_income" stackId="a" fill="#10b981" name="Side Income" />
              <Bar dataKey="bonus" stackId="a" fill="#f59e0b" name="Bonus" />
              <Bar dataKey="other" stackId="a" fill="#94a3b8" name="Other" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filters */}
      <div className="card flex flex-wrap gap-3">
        <select className="input text-sm w-auto min-w-[140px]" value={filters.type} onChange={e => setFilters(p => ({ ...p, type: e.target.value }))}>
          <option value="">All Types</option>
          {INCOME_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
        </select>
        <input className="input text-sm w-auto" type="date" value={filters.start_date} onChange={e => setFilters(p => ({ ...p, start_date: e.target.value }))} />
        <input className="input text-sm w-auto" type="date" value={filters.end_date} onChange={e => setFilters(p => ({ ...p, end_date: e.target.value }))} />
      </div>

      {/* Income list */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-surface-400 border-b border-surface-100">
                <th className="pb-3 pl-1 font-medium">Date</th>
                <th className="pb-3 font-medium">Source</th>
                <th className="pb-3 font-medium hidden sm:table-cell">Type</th>
                <th className="pb-3 font-medium text-right">Amount</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-12 text-center">
                  <div className="w-6 h-6 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mx-auto" />
                </td></tr>
              ) : income.length === 0 ? (
                <tr><td colSpan={5} className="py-12 text-center text-surface-400">No income entries yet</td></tr>
              ) : income.map(entry => (
                <tr key={entry.id} className="table-row">
                  <td className="py-2.5 pl-1 text-surface-400 text-xs whitespace-nowrap">
                    {new Date(entry.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </td>
                  <td className="py-2.5">
                    <p className="text-surface-800">{entry.source}</p>
                    {entry.notes && <p className="text-xs text-surface-400 truncate">{entry.notes}</p>}
                  </td>
                  <td className="py-2.5 hidden sm:table-cell">
                    <span className={`${TYPE_COLORS[entry.income_type] || 'badge-blue'} text-xs`}>{TYPE_LABELS[entry.income_type] || entry.income_type}</span>
                  </td>
                  <td className="py-2.5 text-right font-semibold text-emerald-600">{formatCurrency(entry.amount, sym)}</td>
                  <td className="py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setEditEntry(entry); setShowModal(true); }}
                        className="p-1.5 text-surface-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(entry.id)}
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
            <p className="text-xs text-surface-400">Page {page} of {pagination.totalPages}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn-secondary p-1.5 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={page >= pagination.totalPages} className="btn-secondary p-1.5 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>

      {showModal && <IncomeModal entry={editEntry} onClose={() => setShowModal(false)} onSave={() => { setShowModal(false); fetchIncome(); }} />}
    </div>
  );
}
