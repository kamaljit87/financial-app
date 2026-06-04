import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Plus, X, Check, Trash2, CreditCard, ChevronDown } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const TYPES = [
  { value: 'statement',   label: 'Statement Due',  color: 'bg-blue-100 text-blue-700' },
  { value: 'payment',     label: 'Payment Due',    color: 'bg-red-100 text-red-700' },
  { value: 'annual_fee',  label: 'Annual Fee',     color: 'bg-amber-100 text-amber-700' },
  { value: 'custom',      label: 'Custom',         color: 'bg-surface-100 text-surface-600' },
];

const VAPID_PUBLIC_KEY = 'BALGAMCiKWu5ftcDwNj73ti8asRlRfw-RLxSqJndxXvqpmW3cKTgx-rVIZQg51dKzPcfxEdlXOJtkFUtgpF_II0';

function typeStyle(type) {
  return TYPES.find(t => t.value === type)?.color || 'bg-surface-100 text-surface-600';
}
function typeLabel(type) {
  return TYPES.find(t => t.value === type)?.label || 'Custom';
}

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr); due.setHours(0, 0, 0, 0);
  return Math.ceil((due - today) / 86400000);
}

function DueBadge({ dateStr }) {
  const d = daysUntil(dateStr);
  if (d < 0) return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">{Math.abs(d)}d overdue</span>;
  if (d === 0) return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Due today</span>;
  if (d <= 3) return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Due in {d}d</span>;
  return <span className="text-[10px] text-surface-400">{new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>;
}

const EMPTY_FORM = { title: '', notes: '', due_date: '', type: 'statement', card_id: '' };

export default function ReminderBell() {
  const [open, setOpen] = useState(false);
  const [reminders, setReminders] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [cards, setCards] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const dropdownRef = useRef(null);

  const loadReminders = useCallback(async () => {
    try {
      const [allRes, upRes] = await Promise.all([
        api.get('/reminders'),
        api.get('/reminders/upcoming'),
      ]);
      setReminders(allRes.data.reminders);
      setUpcoming(upRes.data.reminders);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadReminders();
    api.get('/cards').then(r => setCards(r.data.cards)).catch(() => {});
    // Check existing push subscription
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(reg => reg.pushManager.getSubscription()).then(sub => {
        setPushEnabled(!!sub);
      });
    }
    // Trigger push notifications for due reminders on load
    api.post('/reminders/push/send-due').catch(() => {});
  }, [loadReminders]);

  // Register service worker once
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/financial-app/sw.js').catch(() => {});
    }
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const togglePush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return toast.error('Push notifications not supported in this browser');
    }
    setPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (pushEnabled) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) { await sub.unsubscribe(); await api.delete('/reminders/push/unsubscribe', { data: { endpoint: sub.endpoint } }); }
        setPushEnabled(false);
        toast('Browser push disabled');
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return toast.error('Notification permission denied');
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        await api.post('/reminders/push/subscribe', sub.toJSON());
        setPushEnabled(true);
        toast.success('Browser push notifications enabled!');
      }
    } catch (e) {
      toast.error('Failed to toggle push: ' + e.message);
    } finally {
      setPushLoading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.due_date) return toast.error('Title and due date are required');
    setSaving(true);
    try {
      await api.post('/reminders', { ...form, card_id: form.card_id || undefined });
      toast.success('Reminder added');
      setForm(EMPTY_FORM);
      setShowAdd(false);
      loadReminders();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add reminder');
    } finally {
      setSaving(false);
    }
  };

  const markDone = async (id, done) => {
    try {
      await api.patch(`/reminders/${id}`, { is_done: done ? 1 : 0 });
      loadReminders();
    } catch { toast.error('Failed to update'); }
  };

  const deleteReminder = async (id) => {
    try {
      await api.delete(`/reminders/${id}`);
      loadReminders();
    } catch { toast.error('Failed to delete'); }
  };

  const pendingCount = upcoming.filter(r => !r.is_done).length;
  const pending = reminders.filter(r => !r.is_done);
  const done = reminders.filter(r => r.is_done);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-lg text-surface-500 hover:text-surface-800 hover:bg-surface-100 transition-colors"
        aria-label="Reminders"
      >
        <Bell className="w-5 h-5" />
        {pendingCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
            {pendingCount > 9 ? '9+' : pendingCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-1rem)] bg-white border border-surface-200 rounded-2xl shadow-card-lg z-50 flex flex-col max-h-[80vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary-600" />
              <span className="font-semibold text-surface-800 text-sm">Reminders</span>
              {pendingCount > 0 && <span className="text-xs font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">{pendingCount} due</span>}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={togglePush}
                disabled={pushLoading}
                title={pushEnabled ? 'Disable browser push' : 'Enable browser push notifications'}
                className={`text-xs px-2 py-1 rounded-lg border transition-colors ${pushEnabled ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'border-surface-200 text-surface-500 hover:bg-surface-50'}`}>
                {pushLoading ? '…' : pushEnabled ? '🔔 On' : '🔕 Off'}
              </button>
              <button onClick={() => { setShowAdd(s => !s); setForm(EMPTY_FORM); }}
                className="p-1 rounded-lg text-surface-400 hover:text-primary-600 hover:bg-primary-50 transition-colors">
                <Plus className="w-4 h-4" />
              </button>
              <button onClick={() => setOpen(false)} className="p-1 rounded-lg text-surface-400 hover:text-surface-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Add form */}
          {showAdd && (
            <form onSubmit={handleAdd} className="px-4 py-3 border-b border-surface-100 space-y-2.5 flex-shrink-0 bg-surface-50">
              <input className="input text-sm py-1.5 w-full" placeholder="Reminder title*" value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))} autoFocus />
              <div className="grid grid-cols-2 gap-2">
                <select className="input text-sm py-1.5" value={form.type}
                  onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                  {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <input className="input text-sm py-1.5" type="date" value={form.due_date}
                  onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} required />
              </div>
              <select className="input text-sm py-1.5 w-full" value={form.card_id}
                onChange={e => setForm(p => ({ ...p, card_id: e.target.value }))}>
                <option value="">— No card —</option>
                {cards.map(c => <option key={c.id} value={c.id}>{c.nickname} (****{c.last_four})</option>)}
              </select>
              <input className="input text-sm py-1.5 w-full" placeholder="Notes (optional)" value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="btn-primary text-xs py-1.5 flex-1">
                  {saving ? 'Saving…' : 'Add Reminder'}
                </button>
                <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary text-xs py-1.5 px-3">
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Reminder list */}
          <div className="overflow-y-auto flex-1">
            {reminders.length === 0 ? (
              <div className="text-center py-10 text-surface-400">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No reminders yet</p>
                <p className="text-xs mt-1">Click + to add one</p>
              </div>
            ) : (
              <>
                {pending.length > 0 && (
                  <div>
                    <p className="px-4 py-2 text-[10px] font-bold tracking-widest uppercase text-surface-400 bg-surface-50 border-b border-surface-100">Upcoming</p>
                    {pending.map(r => (
                      <ReminderRow key={r.id} reminder={r} onDone={() => markDone(r.id, true)} onDelete={() => deleteReminder(r.id)} />
                    ))}
                  </div>
                )}
                {done.length > 0 && (
                  <div>
                    <p className="px-4 py-2 text-[10px] font-bold tracking-widest uppercase text-surface-400 bg-surface-50 border-b border-surface-100">Done</p>
                    {done.map(r => (
                      <ReminderRow key={r.id} reminder={r} isDone onUndo={() => markDone(r.id, false)} onDelete={() => deleteReminder(r.id)} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ReminderRow({ reminder: r, isDone, onDone, onUndo, onDelete }) {
  return (
    <div className={`flex items-start gap-3 px-4 py-3 border-b border-surface-50 hover:bg-surface-50 transition-colors ${isDone ? 'opacity-50' : ''}`}>
      <button
        onClick={isDone ? onUndo : onDone}
        className={`flex-shrink-0 mt-0.5 w-4 h-4 rounded-full border-2 transition-colors flex items-center justify-center
          ${isDone ? 'bg-emerald-500 border-emerald-500' : 'border-surface-300 hover:border-primary-500'}`}>
        {isDone && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${typeStyle(r.type)}`}>{typeLabel(r.type)}</span>
          {r.card_nickname && (
            <span className="text-[10px] text-surface-400 flex items-center gap-0.5">
              <CreditCard className="w-2.5 h-2.5" />{r.card_nickname}
            </span>
          )}
        </div>
        <p className={`text-sm font-medium mt-0.5 ${isDone ? 'line-through text-surface-400' : 'text-surface-800'}`}>{r.title}</p>
        {r.notes && <p className="text-xs text-surface-400 mt-0.5 truncate">{r.notes}</p>}
        <div className="mt-1">
          <DueBadge dateStr={r.due_date} />
        </div>
      </div>
      <button onClick={onDelete} className="flex-shrink-0 p-1 text-surface-300 hover:text-red-500 transition-colors rounded">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}
