import React from 'react';
import { useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import ReminderBell from '../ui/ReminderBell';

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/cards': 'Credit Cards',
  '/transactions': 'Transactions',
  '/income': 'Income',
  '/insights': 'Financial Insights',
  '/reports': 'Reports & Export',
  '/settings': 'Settings',
};

export default function Header({ onMenuClick }) {
  const location = useLocation();
  const title = PAGE_TITLES[location.pathname] || 'DebtWise';
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <header className="bg-white border-b border-surface-200 px-4 lg:px-6 h-16 flex items-center justify-between flex-shrink-0 sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="lg:hidden text-surface-500 hover:text-surface-800 p-1.5 rounded-lg hover:bg-surface-100 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <h2 className="font-semibold text-surface-900 text-base">{title}</h2>
          <p className="text-xs text-surface-400 hidden sm:block">{dateStr}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <ReminderBell />
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-slow" />
          <span className="text-xs text-emerald-700 font-medium">Local</span>
        </div>
      </div>
    </header>
  );
}
