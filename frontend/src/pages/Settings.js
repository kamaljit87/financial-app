import React, { useState } from 'react';
import { Save, Lock, Globe, Bell, Shield, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import toast from 'react-hot-toast';

const CURRENCIES = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham' },
];

export default function Settings() {
  const { user, settings, updateSettings } = useAuth();
  const [form, setForm] = useState({
    currency: settings?.currency || 'INR',
    currency_symbol: settings?.currency_symbol || '₹',
    theme: settings?.theme || 'light',
    date_format: settings?.date_format || 'DD/MM/YYYY',
    debt_warning_threshold: settings?.debt_warning_threshold || 70,
    spending_warning_threshold: settings?.spending_warning_threshold || 80,
    monthly_budget: settings?.monthly_budget || '',
    notifications_enabled: settings?.notifications_enabled !== 0,
  });
  const [passForm, setPassForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPass, setSavingPass] = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleCurrencyChange = (code) => {
    const cur = CURRENCIES.find(c => c.code === code);
    if (cur) { set('currency', cur.code); set('currency_symbol', cur.symbol); }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await updateSettings({
        ...form,
        debt_warning_threshold: parseFloat(form.debt_warning_threshold),
        spending_warning_threshold: parseFloat(form.spending_warning_threshold),
        monthly_budget: form.monthly_budget ? parseFloat(form.monthly_budget) : null,
        notifications_enabled: form.notifications_enabled ? 1 : 0,
      });
      toast.success('Settings saved');
    } catch { toast.error('Failed to save settings'); }
    finally { setSaving(false); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passForm.newPassword !== passForm.confirmPassword) { toast.error('Passwords do not match'); return; }
    if (passForm.newPassword.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setSavingPass(true);
    try {
      await api.post('/auth/change-password', { currentPassword: passForm.currentPassword, newPassword: passForm.newPassword });
      toast.success('Password changed successfully');
      setPassForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Password change failed');
    } finally { setSavingPass(false); }
  };

  return (
    <div className="space-y-6 max-w-2xl animate-slide-up">
      <div>
        <h2 className="text-lg font-semibold text-surface-900">Settings</h2>
        <p className="text-sm text-surface-400">Configure your DebtWise preferences</p>
      </div>

      {/* Account info */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-primary-600" />
          <h3 className="font-semibold text-surface-800">Account</h3>
        </div>
        <div className="flex items-center gap-4 p-4 bg-surface-50 rounded-xl border border-surface-200">
          <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 font-bold text-lg">
            {user?.username?.[0]?.toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-surface-900">{user?.username}</p>
            <p className="text-sm text-surface-500">{user?.email}</p>
            <span className="badge-purple text-xs mt-1">{user?.role}</span>
          </div>
        </div>
      </div>

      {/* Preferences */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-4 h-4 text-primary-600" />
          <h3 className="font-semibold text-surface-800">Preferences</h3>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label">Currency</label>
            <select className="input" value={form.currency} onChange={e => handleCurrencyChange(e.target.value)}>
              {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.symbol} — {c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Date Format</label>
            <select className="input" value={form.date_format} onChange={e => set('date_format', e.target.value)}>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </select>
          </div>
          <div>
            <label className="label">Monthly Budget ({form.currency_symbol})</label>
            <input className="input" type="number" min="0" placeholder="e.g. 50000"
              value={form.monthly_budget} onChange={e => set('monthly_budget', e.target.value)} />
            <p className="text-xs text-surface-400 mt-1">Leave blank for no budget limit</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="notifications" checked={form.notifications_enabled}
              onChange={e => set('notifications_enabled', e.target.checked)} className="w-4 h-4" />
            <label htmlFor="notifications" className="text-sm text-surface-600">Enable financial alerts</label>
          </div>
        </div>
      </div>

      {/* Alert thresholds */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-4 h-4 text-primary-600" />
          <h3 className="font-semibold text-surface-800">Alert Thresholds</h3>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label">Credit Utilization Warning (%)</label>
            <input className="input" type="number" min="1" max="100"
              value={form.debt_warning_threshold} onChange={e => set('debt_warning_threshold', e.target.value)} />
            <p className="text-xs text-surface-400 mt-1">Alert when utilization exceeds this value (default: 70%)</p>
          </div>
          <div>
            <label className="label">Spending Warning — % of Income</label>
            <input className="input" type="number" min="1" max="100"
              value={form.spending_warning_threshold} onChange={e => set('spending_warning_threshold', e.target.value)} />
            <p className="text-xs text-surface-400 mt-1">Alert when spending reaches this % of monthly income (default: 80%)</p>
          </div>
        </div>
      </div>

      <button onClick={handleSaveSettings} disabled={saving} className="btn-primary flex items-center gap-2">
        <Save className="w-4 h-4" />
        {saving ? 'Saving...' : 'Save Settings'}
      </button>

      {/* Change password */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-4 h-4 text-primary-600" />
          <h3 className="font-semibold text-surface-800">Change Password</h3>
        </div>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="label">Current Password</label>
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} className="input pr-10"
                value={passForm.currentPassword} onChange={e => setPassForm(p => ({ ...p, currentPassword: e.target.value }))} required />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
                onClick={() => setShowPass(v => !v)}>
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="label">New Password</label>
            <input type="password" className="input" placeholder="Min 8 chars with uppercase, lowercase, number"
              value={passForm.newPassword} onChange={e => setPassForm(p => ({ ...p, newPassword: e.target.value }))} required />
          </div>
          <div>
            <label className="label">Confirm New Password</label>
            <input type="password" className="input"
              value={passForm.confirmPassword} onChange={e => setPassForm(p => ({ ...p, confirmPassword: e.target.value }))} required />
          </div>
          <button type="submit" className="btn-primary" disabled={savingPass}>
            {savingPass ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Security info */}
      <div className="card bg-emerald-50 border-emerald-200">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-emerald-600" />
          <h3 className="font-semibold text-emerald-800">Security Info</h3>
        </div>
        <ul className="space-y-1.5 text-xs text-emerald-700">
          <li>✓ Passwords hashed with bcrypt (12 rounds)</li>
          <li>✓ JWT tokens with configurable expiry</li>
          <li>✓ Account lockout after 5 failed attempts (30 min)</li>
          <li>✓ Rate limiting on all authentication endpoints</li>
          <li>✓ Only last 4 digits of card numbers stored</li>
          <li>✓ All data stored locally — never leaves your device</li>
          <li>✓ Audit log for all auth events</li>
          <li>✓ SQL injection prevention via parameterized queries</li>
          <li>✓ Secure HTTP headers via Helmet</li>
        </ul>
      </div>
    </div>
  );
}
