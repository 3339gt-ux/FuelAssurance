'use client';

import React, { useState, useEffect } from 'react';
import { Save, Shield, Settings, Info, Sun, Moon, Monitor } from 'lucide-react';

export default function SettingsPage() {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [tankCapacity, setTankCapacity] = useState('500');
  const [timezone, setTimezone] = useState('UTC');
  const [reportFormat, setReportFormat] = useState('Excel');
  const [mode, setMode] = useState<'simple' | 'advanced'>('simple');

  useEffect(() => {
    // Load config
    const savedTheme = localStorage.getItem('theme') as any || 'system';
    setTheme(savedTheme);

    const savedCapacity = localStorage.getItem('default-tank-capacity') || '500';
    setTankCapacity(savedCapacity);

    const savedTimezone = localStorage.getItem('default-timezone') || 'UTC';
    setTimezone(savedTimezone);

    const savedFormat = localStorage.getItem('default-report-format') || 'Excel';
    setReportFormat(savedFormat);

    const savedMode = localStorage.getItem('fuel-assurance-mode') as any || 'simple';
    setMode(savedMode);
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Save to storage
    localStorage.setItem('theme', theme);
    localStorage.setItem('default-tank-capacity', tankCapacity);
    localStorage.setItem('default-timezone', timezone);
    localStorage.setItem('default-report-format', reportFormat);

    const prevMode = localStorage.getItem('fuel-assurance-mode');
    localStorage.setItem('fuel-assurance-mode', mode);

    // Apply theme
    const root = document.documentElement;
    if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    alert('System settings updated and saved successfully.');

    // If mode changed, refresh page to redraw sidebar
    if (prevMode !== mode) {
      window.location.reload();
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-slate-800 dark:text-surface-900 max-w-3xl mx-auto py-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-surface-950">Settings</h1>
        <p className="text-sm text-slate-500 dark:text-surface-600 mt-1">Configure user preferences, default telemetry values, and interface settings</p>
      </div>

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings options */}
        <div className="lg:col-span-2 space-y-6">
          {/* User Preferences */}
          <div className="card space-y-4">
            <h3 className="text-xs font-bold text-slate-900 dark:text-surface-950 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 dark:border-surface-300 pb-2">
              <Settings className="h-4 w-4 text-brand-500" /> User Preferences
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Theme */}
              <div className="space-y-1">
                <label className="text-2xs font-semibold text-slate-500 uppercase tracking-wider block">Visual Theme</label>
                <select
                  className="input text-xs"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as any)}
                >
                  <option value="light">Light Theme</option>
                  <option value="dark">Dark Theme</option>
                  <option value="system">System Default</option>
                </select>
              </div>

              {/* Timezone */}
              <div className="space-y-1">
                <label className="text-2xs font-semibold text-slate-500 uppercase tracking-wider block">Default Timezone</label>
                <select
                  className="input text-xs"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                >
                  <option value="UTC">UTC (Coordinated Universal Time)</option>
                  <option value="GMT">GMT (Greenwich Mean Time)</option>
                  <option value="Europe/Dublin">IST/GMT (Dublin/London)</option>
                  <option value="Europe/Warsaw">CET (Central European Time)</option>
                </select>
              </div>

              {/* Tank capacity */}
              <div className="space-y-1">
                <label className="text-2xs font-semibold text-slate-500 uppercase tracking-wider block">Default Tank Capacity (Litres)</label>
                <input
                  type="number"
                  className="input text-xs"
                  value={tankCapacity}
                  onChange={(e) => setTankCapacity(e.target.value)}
                />
                <span className="text-3xs text-slate-400 mt-1 block">Default tank limit when verifying diesel volume.</span>
              </div>

              {/* Report Format */}
              <div className="space-y-1">
                <label className="text-2xs font-semibold text-slate-500 uppercase tracking-wider block">Preferred Report Export Format</label>
                <select
                  className="input text-xs"
                  value={reportFormat}
                  onChange={(e) => setReportFormat(e.target.value)}
                >
                  <option value="Excel">Excel Spreadsheet (.xlsx)</option>
                  <option value="CSV">Comma Separated Values (.csv)</option>
                  <option value="PDF">Printable PDF Layout</option>
                </select>
              </div>
            </div>
          </div>

          {/* Mode control */}
          <div className="card space-y-4">
            <h3 className="text-xs font-bold text-slate-900 dark:text-surface-950 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 dark:border-surface-300 pb-2">
              <Shield className="h-4 w-4 text-brand-500" /> Platform Mode Switch
            </h3>

            <div className="space-y-3 text-xs">
              <p className="text-slate-500 dark:text-surface-600">
                Switch between **Simple Mode** (focused transaction checks against GPS logs) and **Advanced Mode** (fleet-wide reconciliation, approved station matrices, period sign-offs, and mapping queues).
              </p>
              
              <div className="flex gap-4 pt-1">
                <label className="flex items-center gap-2 font-semibold text-slate-800 dark:text-surface-950">
                  <input
                    type="radio"
                    name="mode"
                    value="simple"
                    checked={mode === 'simple'}
                    onChange={() => setMode('simple')}
                    className="accent-brand-600"
                  />
                  Simple Mode (Default)
                </label>
                <label className="flex items-center gap-2 font-semibold text-slate-800 dark:text-surface-950">
                  <input
                    type="radio"
                    name="mode"
                    value="advanced"
                    checked={mode === 'advanced'}
                    onChange={() => setMode('advanced')}
                    className="accent-brand-600"
                  />
                  Advanced Mode
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Action Panel */}
        <div className="card space-y-4 h-fit">
          <h3 className="text-xs font-bold text-slate-950 dark:text-surface-950 uppercase tracking-wider">Save Changes</h3>
          <p className="text-xs text-slate-500 dark:text-surface-600">Preferences are stored locally and take effect immediately on update.</p>
          <button
            type="submit"
            className="btn btn-primary w-full py-2.5 text-xs flex items-center justify-center gap-2 font-semibold"
          >
            <Save className="h-4 w-4" /> Save Settings
          </button>
        </div>
      </form>
    </div>
  );
}
