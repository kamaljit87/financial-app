import React from 'react';

export default function LoadingScreen() {
  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-primary-500/30 border-t-primary-600 rounded-full animate-spin" />
        <p className="text-surface-400 text-sm">Loading DebtWise...</p>
      </div>
    </div>
  );
}
