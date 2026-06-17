'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CreditCard, FileText, ChevronRight, History, Calendar, CheckCircle2, AlertTriangle, XCircle, Trash2 } from 'lucide-react';

import RecentWorkList from '@/components/RecentWorkList';

export default function SimpleHomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<'simple' | 'advanced' | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedMode = localStorage.getItem('fuel-assurance-mode') as 'simple' | 'advanced';
    const defaultMode = savedMode || process.env.NEXT_PUBLIC_FUEL_ASSURANCE_MODE || 'simple';
    setMode(defaultMode as any);

    if (defaultMode === 'advanced') {
      router.push('/dashboard');
      return;
    }

    // Fetch history
    fetch('/api/check-transactions')
      .then((res) => res.json())
      .then((data) => {
        if (data.checks) {
          setHistory(data.checks.slice(0, 5));
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [router]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (!confirm('Are you sure you want to delete this result?')) return;
    try {
      const res = await fetch(`/api/check-transactions?id=${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setHistory(history.filter((h) => h.id !== id));
      } else {
        alert('Delete failed');
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (mode === null || mode === 'advanced') {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-brand-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-4 animate-fade-in text-slate-800 dark:text-surface-900">
      {/* Hero Header */}
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-surface-950 sm:text-4xl text-balance">
          Verify fuel and service transactions against vehicle GPS data
        </h1>
        <p className="max-w-xl mx-auto text-sm text-slate-500 dark:text-surface-600">
          Upload a transaction file or invoice and the GPS activity report to verify recorded vehicle forecourt actions and identify discrepancies automatically.
        </p>
      </div>

      {/* Start new check */}
      <div className="space-y-1 border-b border-slate-100 dark:border-slate-800 pb-1">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Start new check</h2>
      </div>

      {/* Workflow Selection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* DKV Card */}
        <div className="card hover:border-brand-500/50 hover:shadow-glow transition-all duration-300 flex flex-col justify-between h-56">
          <div className="space-y-3">
            <div className="h-10 w-10 rounded-xl bg-brand-100 dark:bg-brand-500/10 flex items-center justify-center text-brand-600 dark:text-brand-400">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-surface-950">DKV Check</h3>
              <p className="text-xs text-slate-500 dark:text-surface-600 mt-1">
                Upload a DKV transaction report or invoice workbook along with the vehicle GPS log file to verify charges.
              </p>
            </div>
          </div>
          <Link
            href="/dkv-check"
            className="btn btn-primary w-full text-xs font-semibold py-2.5 flex items-center justify-center gap-1"
          >
            Start DKV Check <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* AS24 Card */}
        <div className="card hover:border-brand-500/50 hover:shadow-glow transition-all duration-300 flex flex-col justify-between h-56">
          <div className="space-y-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-surface-950">AS24 Check</h3>
              <p className="text-xs text-slate-500 dark:text-surface-600 mt-1">
                Upload an AS24 PDF invoice statement along with the vehicle GPS log file to audit diesel, AdBlue and PASSango tolls.
              </p>
            </div>
          </div>
          <Link
            href="/as24-check"
            className="btn btn-primary w-full text-xs font-semibold py-2.5 flex items-center justify-center gap-1"
          >
            Start AS24 Check <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Continue Review area */}
      <RecentWorkList />

      {/* Recent History Table */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <History className="h-4.5 w-4.5 text-slate-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-surface-600">Recent Checks</h2>
        </div>

        <div className="card p-0 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading history...</div>
          ) : history.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">No previous check runs recorded.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-surface-50 border-b border-slate-200 dark:border-surface-300">
                  <tr>
                    <th className="px-5 py-3 font-semibold text-slate-500 uppercase tracking-wider">Date Checked</th>
                    <th className="px-5 py-3 font-semibold text-slate-500 uppercase tracking-wider">Provider</th>
                    <th className="px-5 py-3 font-semibold text-slate-500 uppercase tracking-wider">Vehicle</th>
                    <th className="px-5 py-3 font-semibold text-slate-500 uppercase tracking-wider text-right">Transactions</th>
                    <th className="px-5 py-3 font-semibold text-slate-500 uppercase tracking-wider text-center">Results</th>
                    <th className="px-5 py-3 font-semibold text-slate-500 uppercase tracking-wider text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-surface-200">
                  {history.map((check) => (
                    <tr key={check.id} className="hover:bg-slate-50/50 dark:hover:bg-surface-200/20 transition">
                      <td className="px-5 py-3 font-mono text-slate-600 dark:text-surface-600">
                        {new Date(check.check_date).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="px-5 py-3 font-semibold text-slate-900 dark:text-surface-950">{check.provider}</td>
                      <td className="px-5 py-3 font-medium text-slate-700 dark:text-surface-800">{check.vehicle}</td>
                      <td className="px-5 py-3 text-right font-mono text-slate-800 dark:text-surface-950 font-medium">
                        {check.total_transactions}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <div className="inline-flex gap-2 justify-center">
                          <span className="badge bg-green-500/10 text-green-700 dark:text-green-400 font-semibold" title="Supported">
                            {check.supported_count}
                          </span>
                          <span className="badge bg-amber-500/10 text-amber-700 dark:text-amber-400 font-semibold" title="Review Required">
                            {check.review_required_count}
                          </span>
                          <span className="badge bg-red-500/10 text-red-700 dark:text-red-400 font-semibold" title="Unsupported">
                            {check.unsupported_count}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/previous-results/${check.id}`}
                            className="btn btn-secondary btn-sm text-2xs px-2.5 py-1"
                          >
                            Open
                          </Link>
                          <button
                            onClick={(e) => handleDelete(check.id, e)}
                            className="p-1 rounded hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
