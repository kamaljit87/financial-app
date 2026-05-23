import React, { useState, useEffect } from 'react';
import { Download, FileText, FileSpreadsheet, Database, Trash2, RefreshCw } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function Reports() {
  const [backups, setBackups] = useState([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [exportFilters, setExportFilters] = useState({ start_date: '', end_date: '', card_id: '' });
  const [cards, setCards] = useState([]);

  useEffect(() => {
    api.get('/cards').then(({ data }) => setCards(data.cards));
    fetchBackups();
  }, []);

  const fetchBackups = async () => {
    try {
      const { data } = await api.get('/backup/list');
      setBackups(data.backups);
    } catch {}
  };

  const handleExport = (type) => {
    const params = new URLSearchParams(Object.fromEntries(Object.entries(exportFilters).filter(([, v]) => v)));
    const token = localStorage.getItem('token');
    const baseUrl = import.meta.env.VITE_API_URL || `${import.meta.env.VITE_BASE_PATH || '/financial-app'}/api`;
    if (type === 'transactions_csv') window.open(`${baseUrl}/export/transactions/csv?${params}&token=${token}`, '_blank');
    else if (type === 'income_csv') window.open(`${baseUrl}/export/income/csv?${params}&token=${token}`, '_blank');
    else if (type === 'xlsx') window.open(`${baseUrl}/export/report/xlsx?month=${month}&token=${token}`, '_blank');
    toast.success('Export started — check your downloads');
  };

  const handleBackup = async () => {
    setBackupLoading(true);
    try {
      const { data } = await api.post('/backup/create');
      toast.success(`Backup created: ${data.filename}`);
      fetchBackups();
    } catch { toast.error('Backup failed'); }
    finally { setBackupLoading(false); }
  };

  const handleDeleteBackup = async (filename) => {
    if (!window.confirm(`Delete backup "${filename}"?`)) return;
    try { await api.delete(`/backup/${filename}`); toast.success('Backup deleted'); fetchBackups(); }
    catch { toast.error('Delete failed'); }
  };

  const handleDownloadBackup = (filename) => {
    const token = localStorage.getItem('token');
    const baseUrl = import.meta.env.VITE_API_URL || `${import.meta.env.VITE_BASE_PATH || '/financial-app'}/api`;
    window.open(`${baseUrl}/backup/download/${filename}?token=${token}`, '_blank');
  };

  const formatSize = (bytes) => bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h2 className="text-lg font-semibold text-surface-900">Reports & Export</h2>
        <p className="text-sm text-surface-400">Download your financial data</p>
      </div>

      {/* Export */}
      <div className="card">
        <h3 className="font-semibold text-surface-800 mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary-600" /> Export Data
        </h3>

        {/* Filters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 p-4 bg-surface-50 border border-surface-200 rounded-xl">
          <div>
            <label className="label text-xs">From Date</label>
            <input className="input text-sm" type="date" value={exportFilters.start_date}
              onChange={e => setExportFilters(p => ({ ...p, start_date: e.target.value }))} />
          </div>
          <div>
            <label className="label text-xs">To Date</label>
            <input className="input text-sm" type="date" value={exportFilters.end_date}
              onChange={e => setExportFilters(p => ({ ...p, end_date: e.target.value }))} />
          </div>
          <div>
            <label className="label text-xs">Filter by Card</label>
            <select className="input text-sm" value={exportFilters.card_id}
              onChange={e => setExportFilters(p => ({ ...p, card_id: e.target.value }))}>
              <option value="">All Cards</option>
              {cards.map(c => <option key={c.id} value={c.id}>{c.nickname}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button onClick={() => handleExport('transactions_csv')}
            className="card-hover flex items-center gap-3 p-4 cursor-pointer text-left">
            <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-surface-800 text-sm">Transactions CSV</p>
              <p className="text-xs text-surface-400">All transaction history</p>
            </div>
            <Download className="w-4 h-4 text-surface-400 ml-auto" />
          </button>

          <button onClick={() => handleExport('income_csv')}
            className="card-hover flex items-center gap-3 p-4 cursor-pointer text-left">
            <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
              <FileText className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-surface-800 text-sm">Income CSV</p>
              <p className="text-xs text-surface-400">All income records</p>
            </div>
            <Download className="w-4 h-4 text-surface-400 ml-auto" />
          </button>

          <div className="card-hover flex flex-col gap-2 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-50 border border-violet-200 rounded-lg">
                <FileSpreadsheet className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <p className="font-semibold text-surface-800 text-sm">Monthly Report XLSX</p>
                <p className="text-xs text-surface-400">Full financial report</p>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <input className="input text-xs flex-1" type="month" value={month}
                onChange={e => setMonth(e.target.value)} />
              <button onClick={() => handleExport('xlsx')} className="btn-primary flex items-center gap-1 text-xs py-1.5 px-3 flex-shrink-0">
                <Download className="w-3.5 h-3.5" /> Export
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Backup */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-surface-800 flex items-center gap-2">
            <Database className="w-4 h-4 text-primary-600" /> Database Backups
          </h3>
          <button onClick={handleBackup} disabled={backupLoading}
            className="btn-primary flex items-center gap-2 text-sm">
            {backupLoading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Creating...</>
              : <><Database className="w-4 h-4" /> Create Backup</>}
          </button>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-xs text-blue-700">
          Backups are SQLite database files stored in <code className="font-mono bg-blue-100 px-1 rounded">/data/backups/</code> inside the Docker container. Download them to keep an offline copy.
        </div>

        {backups.length === 0 ? (
          <p className="text-surface-400 text-sm text-center py-6">No backups yet. Create your first backup above.</p>
        ) : (
          <div className="space-y-2">
            {backups.map(b => (
              <div key={b.filename} className="flex items-center justify-between p-3 bg-surface-50 border border-surface-200 rounded-xl">
                <div>
                  <p className="text-sm text-surface-800 font-mono">{b.filename}</p>
                  <p className="text-xs text-surface-400">
                    {new Date(b.created_at).toLocaleString('en-IN')} · {formatSize(b.size)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleDownloadBackup(b.filename)}
                    className="btn-secondary flex items-center gap-1 text-xs py-1 px-2.5">
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                  <button onClick={() => handleDeleteBackup(b.filename)}
                    className="btn-danger p-1.5">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
