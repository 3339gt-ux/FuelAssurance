'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, Filter, History, Trash2, Calendar, FileCheck } from 'lucide-react';

export default function PreviousResultsPage() {
  const [checks, setChecks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState('ALL');

  const fetchHistory = () => {
    fetch('/api/check-transactions')
      .then((res) => res.json())
      .then((data) => {
        if (data.checks) {
          setChecks(data.checks);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (!confirm('Are you sure you want to delete this check run from history?')) return;
    try {
      const res = await fetch(`/api/check-transactions?id=${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setChecks(checks.filter((c) => c.id !== id));
      } else {
        alert('Delete failed');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filtered = checks.filter((c) => {
    const matchesSearch = c.vehicle.toUpperCase().includes(search.toUpperCase());
    const matchesProvider = providerFilter === 'ALL' || c.provider === providerFilter;
    return matchesSearch && matchesProvider;
  });

  return (
    <div className="space-y-6 animate-fade-in text-slate-800 dark:text-surface-900 max-w-5xl mx-auto py-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-surface-950">Verification History</h1>
        <p className="text-sm text-slate-500 dark:text-surface-600 mt-1">Review and audit all previous GPS-to-transaction validation checks</p>
      </div>

      {/* Filters bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by vehicle registration…"
            className="input text-xs pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="relative">
          <select
            className="input text-xs"
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
          >
            <option value="ALL">All Providers</option>
            <option value="DKV">DKV Only</option>
            <option value="AS24">AS24 Only</option>
          </select>
        </div>
      </div>

      {/* History Table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading history records...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">No matching check records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-surface-50 border-b border-slate-200 dark:border-surface-300">
                <tr>
                  <th className="px-5 py-3 font-semibold text-slate-500 uppercase tracking-wider">Date Checked</th>
                  <th className="px-5 py-3 font-semibold text-slate-500 uppercase tracking-wider">Provider</th>
                  <th className="px-5 py-3 font-semibold text-slate-500 uppercase tracking-wider">Vehicle</th>
                  <th className="px-5 py-3 font-semibold text-slate-500 uppercase tracking-wider">Source Files</th>
                  <th className="px-5 py-3 font-semibold text-slate-500 uppercase tracking-wider text-right">Transactions</th>
                  <th className="px-5 py-3 font-semibold text-slate-500 uppercase tracking-wider text-center">Outcome Summary</th>
                  <th className="px-5 py-3 font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-surface-200">
                {filtered.map((check) => (
                  <tr key={check.id} className="hover:bg-slate-50/50 dark:hover:bg-surface-200/20 transition">
                    <td className="px-5 py-3 font-mono text-slate-600 dark:text-surface-600">
                      {new Date(check.check_date).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="px-5 py-3 font-semibold text-slate-900 dark:text-surface-950">{check.provider}</td>
                    <td className="px-5 py-3 font-medium text-slate-700 dark:text-surface-800">{check.vehicle}</td>
                    <td className="px-5 py-3 text-slate-500 space-y-0.5">
                      <p className="font-mono text-3xs truncate max-w-xs" title={check.transaction_file_name}>TX: {check.transaction_file_name}</p>
                      <p className="font-mono text-3xs truncate max-w-xs" title={check.gps_file_name}>GPS: {check.gps_file_name}</p>
                    </td>
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
                          title="Delete check run"
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
  );
}
