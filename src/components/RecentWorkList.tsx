'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Layers,
  ArrowRight,
  Satellite,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  Truck,
  Download,
  Clock,
  History,
} from 'lucide-react';

interface Batch {
  id: string;
  provider: string;
  filename: string;
  uploadDate: string;
  vehicles: string[];
  attachedGpsFiles?: any[];
  status: string;
  approvalStatus?: string;
  sourceType?: string;
  chargeSummary?: any;
}

export default function RecentWorkList() {
  const router = useRouter();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastBatch, setLastBatch] = useState<any>(null);

  useEffect(() => {
    fetch('/api/batches')
      .then((res) => res.json())
      .then((data) => {
        if (data.batches) {
          setBatches(data.batches);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load recent batches', err);
        setLoading(false);
      });

    // Check last active batch from localStorage
    const lastActiveId = localStorage.getItem('fuel_last_active_batch_id');
    if (lastActiveId) {
      const storedState = localStorage.getItem(`fuel_review_state_${lastActiveId}`);
      if (storedState) {
        try {
          setLastBatch(JSON.parse(storedState));
        } catch {}
      }
    }
  }, []);

  const handleExportCSV = (batch: Batch, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Quick client-side mock export for summary report
    const headers = ['File', 'Provider', 'Vehicles Found', 'Status'];
    const row = [batch.filename, batch.provider, batch.vehicles.length, batch.approvalStatus || 'draft'];
    const csvContent = [headers.join(','), row.join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${batch.filename}_Summary_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusStyle = (status?: string) => {
    const s = String(status || 'draft').toLowerCase();
    switch (s) {
      case 'approved':
        return 'bg-green-500/10 text-green-600 border-green-200/50';
      case 'rejected':
        return 'bg-rose-500/10 text-rose-600 border-rose-250/50';
      case 'needs_review':
        return 'bg-amber-500/10 text-amber-600 border-amber-250/50';
      case 'ready_to_approve':
        return 'bg-emerald-500/10 text-emerald-600 border-emerald-250/50';
      case 'gps_attached':
        return 'bg-indigo-500/10 text-indigo-600 border-indigo-250/50';
      case 'ready_for_gps':
        return 'bg-blue-500/10 text-blue-600 border-blue-200/50';
      default:
        return 'bg-gray-100 text-gray-650 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700';
    }
  };

  const formatStatus = (status?: string) => {
    return String(status || 'draft').replace(/_/g, ' ').toUpperCase();
  };

  if (loading) {
    return <div className="text-center py-6 text-xs text-gray-500">Loading recent work...</div>;
  }

  if (batches.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Restore state option */}
      {lastBatch && (
        <div className="p-4 bg-indigo-500/10 dark:bg-indigo-950/25 border border-indigo-200 dark:border-indigo-900/40 rounded-xl flex items-center justify-between gap-4 animate-in fade-in duration-300">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-indigo-500 animate-pulse" />
            <div>
              <span className="font-bold text-xs text-indigo-950 dark:text-indigo-200 block">
                Continue where you left off
              </span>
              <p className="text-[10px] text-indigo-700 dark:text-indigo-400 mt-0.5">
                Restores last open batch: <span className="font-semibold">{lastBatch.batchId.slice(0, 8)}...</span> in Tab: <span className="capitalize">{lastBatch.currentTab || 'Overview'}</span>
              </p>
            </div>
          </div>
          <Link
            href={`/batches?id=${lastBatch.batchId}&tab=${lastBatch.currentTab || 'overview'}`}
            className="btn btn-primary px-3 py-1.5 text-[11px] font-semibold flex items-center gap-1 shrink-0"
          >
            Resume Review <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Recent batches card list */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <History className="h-4.5 w-4.5 text-gray-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Recent Activity</h2>
        </div>

        <div className="card p-0 overflow-hidden bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 dark:bg-gray-850 border-b border-gray-200 dark:border-gray-850">
                <tr className="text-gray-500 dark:text-gray-400 font-semibold select-none text-[10px] uppercase tracking-wider">
                  <th className="px-5 py-3">Provider</th>
                  <th className="px-5 py-3">Source File</th>
                  <th className="px-5 py-3">Date Uploaded</th>
                  <th className="px-5 py-3 text-center">Vehicles</th>
                  <th className="px-5 py-3 text-center">GPS Files</th>
                  <th className="px-5 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-150 dark:divide-gray-850">
                {batches.slice(0, 5).map((batch) => {
                  const gpsCount = batch.attachedGpsFiles?.length || 0;
                  const isAllGps = gpsCount >= batch.vehicles.length;

                  return (
                    <tr
                      key={batch.id}
                      className="hover:bg-gray-50/50 dark:hover:bg-gray-800/10 transition cursor-pointer"
                      onClick={() => router.push(`/batches?id=${batch.id}`)}
                    >
                      <td className="px-5 py-3.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                          {batch.provider}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-gray-900 dark:text-white truncate max-w-[200px]" title={batch.filename}>
                        {batch.filename}
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 font-mono text-[11px]">
                        {new Date(batch.uploadDate).toLocaleString(undefined, {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="px-5 py-3.5 text-center font-bold">{batch.vehicles.length}</td>
                      <td className="px-5 py-3.5 text-center font-medium">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          isAllGps ? 'bg-green-100 text-green-800 dark:bg-green-950/20 dark:text-green-400' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/20 dark:text-amber-400'
                        }`}>
                          {gpsCount} of {batch.vehicles.length}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getStatusStyle(batch.approvalStatus)}`}>
                          {formatStatus(batch.approvalStatus)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2 text-[10px] font-semibold">
                          <Link
                            href={`/batches?id=${batch.id}&tab=transactions`}
                            className="hover:text-indigo-600 text-gray-500 dark:text-gray-450 hover:underline"
                          >
                            Txs
                          </Link>
                          <span className="text-gray-300 dark:text-gray-800">|</span>
                          <Link
                            href={`/batches?id=${batch.id}&tab=exceptions`}
                            className="hover:text-indigo-600 text-gray-500 dark:text-gray-450 hover:underline"
                          >
                            Exceptions
                          </Link>
                          <span className="text-gray-300 dark:text-gray-800">|</span>
                          <Link
                            href={`/batches?id=${batch.id}&tab=approval`}
                            className="hover:text-indigo-600 text-gray-500 dark:text-gray-450 hover:underline"
                          >
                            Approve
                          </Link>
                          <span className="text-gray-300 dark:text-gray-800">|</span>
                          <button
                            onClick={(e) => handleExportCSV(batch, e)}
                            className="hover:text-indigo-600 text-gray-550 dark:text-gray-450 hover:underline flex items-center gap-0.5"
                          >
                            <Download className="w-3 h-3" />
                            Report
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
