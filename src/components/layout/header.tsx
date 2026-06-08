'use client';

import React from 'react';
import {
  Bell,
  Search,
  User,
  ChevronDown,
} from 'lucide-react';

export function Header() {
  return (
    <header className="fixed right-0 top-0 z-30 h-16 border-b border-surface-300 bg-surface-50/80 backdrop-blur-lg flex items-center justify-between px-6 transition-all duration-300"
      style={{ left: 'var(--sidebar-width, 16rem)' }}
    >
      {/* Search */}
      <div className="flex items-center gap-3 flex-1 max-w-xl">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-400" />
          <input
            type="text"
            placeholder="Search transactions, vehicles, stations…"
            className="w-full h-9 pl-10 pr-4 rounded-lg border border-surface-300 bg-surface-100 text-sm text-surface-800 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-2xs text-surface-400 bg-surface-200 px-1.5 py-0.5 rounded font-mono hidden sm:block">⌘K</kbd>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4 ml-4">
        {/* Period selector */}
        <button className="flex items-center gap-2 h-9 px-3 rounded-lg border border-surface-300 bg-surface-100 text-sm text-surface-700 hover:bg-surface-200 transition">
          <span className="text-surface-500">Period:</span>
          <span className="font-medium">Apr 2025</span>
          <ChevronDown className="h-3 w-3 text-surface-400" />
        </button>

        {/* Notifications */}
        <button className="relative p-2 rounded-lg text-surface-500 hover:bg-surface-200 transition" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-status-error animate-pulse-soft" />
        </button>

        {/* User menu */}
        <button className="flex items-center gap-2 h-9 px-3 rounded-lg hover:bg-surface-200 transition">
          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
            <User className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-medium text-surface-700 hidden md:block">Admin</span>
          <ChevronDown className="h-3 w-3 text-surface-400" />
        </button>
      </div>
    </header>
  );
}
