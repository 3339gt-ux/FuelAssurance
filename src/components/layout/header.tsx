'use client';

import React, { useState, useEffect } from 'react';
import {
  Bell,
  Search,
  User,
  ChevronDown,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';

export function Header() {
  const [mode, setMode] = useState<'simple' | 'advanced'>('simple');
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [showThemeMenu, setShowThemeMenu] = useState(false);

  useEffect(() => {
    const savedMode = localStorage.getItem('fuel-assurance-mode') as 'simple' | 'advanced';
    if (savedMode) setMode(savedMode);

    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | 'system';
    if (savedTheme) setTheme(savedTheme);
  }, []);

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    setShowThemeMenu(false);

    const root = document.documentElement;
    if (newTheme === 'dark' || (newTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  };

  return (
    <header className="fixed right-0 top-0 z-30 h-16 border-b border-surface-300 bg-surface-50/80 backdrop-blur-lg flex items-center justify-between px-6 transition-all duration-300"
      style={{ left: 'var(--sidebar-width, 16rem)' }}
    >
      {/* Search */}
      <div className="flex items-center gap-3 flex-1 max-w-xl">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-600" />
          <input
            type="text"
            placeholder="Search transactions, vehicles, stations…"
            className="w-full h-9 pl-10 pr-4 rounded-lg border border-surface-300 bg-surface-100 text-sm text-surface-800 placeholder:text-surface-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-2xs text-surface-600 bg-surface-200 px-1.5 py-0.5 rounded font-mono hidden sm:block">⌘K</kbd>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4 ml-4">
        {/* Period selector - Advanced mode only */}
        {mode === 'advanced' && (
          <button className="flex items-center gap-2 h-9 px-3 rounded-lg border border-surface-300 bg-surface-100 text-sm text-surface-800 hover:bg-surface-200 transition">
            <span className="text-surface-600">Period:</span>
            <span className="font-medium">Apr 2026</span>
            <ChevronDown className="h-3 w-3 text-surface-600" />
          </button>
        )}

        {/* Theme Selector */}
        <div className="relative">
          <button
            onClick={() => setShowThemeMenu(!showThemeMenu)}
            className="p-2 rounded-lg text-surface-600 hover:bg-surface-200 transition flex items-center justify-center"
            title="Theme settings"
          >
            {theme === 'light' && <Sun className="h-4 w-4 text-amber-500" />}
            {theme === 'dark' && <Moon className="h-4 w-4 text-brand-400" />}
            {theme === 'system' && <Monitor className="h-4 w-4" />}
          </button>

          {showThemeMenu && (
            <div className="absolute right-0 mt-2 w-36 rounded-lg border border-surface-300 bg-surface-100 p-1 shadow-lg z-50">
              <button
                onClick={() => handleThemeChange('light')}
                className="flex items-center gap-2 w-full px-3 py-1.5 rounded text-xs text-surface-800 hover:bg-surface-200"
              >
                <Sun className="h-3.5 w-3.5 text-amber-500" /> Light
              </button>
              <button
                onClick={() => handleThemeChange('dark')}
                className="flex items-center gap-2 w-full px-3 py-1.5 rounded text-xs text-surface-800 hover:bg-surface-200"
              >
                <Moon className="h-3.5 w-3.5 text-brand-400" /> Dark
              </button>
              <button
                onClick={() => handleThemeChange('system')}
                className="flex items-center gap-2 w-full px-3 py-1.5 rounded text-xs text-surface-800 hover:bg-surface-200"
              >
                <Monitor className="h-3.5 w-3.5" /> System
              </button>
            </div>
          )}
        </div>

        {/* Notifications */}
        <button className="relative p-2 rounded-lg text-surface-600 hover:bg-surface-200 transition" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-status-error animate-pulse-soft" />
        </button>

        {/* User menu */}
        <button className="flex items-center gap-2 h-9 px-3 rounded-lg hover:bg-surface-200 transition">
          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
            <User className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-medium text-surface-800 hidden md:block">Auditor</span>
          <ChevronDown className="h-3 w-3 text-surface-600" />
        </button>
      </div>
    </header>
  );
}
