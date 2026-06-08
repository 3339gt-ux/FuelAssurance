'use client';

import React, { useState, useEffect } from 'react';
import { GitCompareArrows, CheckCircle2, XCircle, AlertTriangle, Search, Download, Eye, ShieldCheck, HelpCircle } from 'lucide-react';

const statusColors: Record<string, string> = {
  EXACT_MATCH: 'badge-success',
  QUANTITY_TOLERANCE_MATCH: 'badge-success',
  STATION_CODE_MATCH: 'badge-info',
  COMPOSITE_MATCH: 'badge-info',
  TX_ONLY: 'badge-error',
  INV_ONLY: 'badge-error',
  PRICE_VARIANCE: 'badge-warning',
  TELEMATICS_VERIFIED: 'badge-success',
  TELEMATICS_UNLIKELY: 'badge-error',
  NO_TELEMATICS: 'badge-warning',
  DECLINED: 'badge-error',
  PERIOD_MISMATCH: 'badge-warning',
};

export default function ReconciliationPage() {
  const [data, setData] = useState<any>({ runs: [], matches: [] });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedMatch, setSelectedMatch] = useState<any | null>(null);
  const [overrideNotes, setOverrideNotes] = useState('');
  const [reasons, setReasons] = useState<any[]>([]);

  const fetchRecon = () => {
    fetch('/api/reconciliation')
      .then((res) => res.json())
      .then((resData) => {
        setData(resData);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchRecon();
  }, []);

  const handleOpenLedger = async (match: any) => {
    setSelectedMatch(match);
    setReasons([]);
    try {
      const res = await fetch(`/api/telematics?matchId=${match.id}`);
      const d = await res.json();
      setReasons(d.ledgers || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (data.matches.length > 0) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('open') === 'true') {
        handleOpenLedger(data.matches[0]);
      }
    }
  }, [data]);

  const handleOverride = async (status: 'approved' | 'escalated') => {
    if (!selectedMatch) return;
    try {
      const res = await fetch('/api/review-queue/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: selectedMatch.id,
          status,
          reason: 'Manual Auditor Override',
          notes: overrideNotes,
        }),
      });
      if (!res.ok) throw new Error('Override failed');
      setOverrideNotes('');
      setSelectedMatch(null);
      fetchRecon();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-brand-500"></div>
      </div>
    );
  }

  // Calculate stats dynamically from matches
  const totalTx = data.matches.length;
  const exactCount = data.matches.filter((m: any) => m.status === 'EXACT_MATCH' || m.status === 'TELEMATICS_VERIFIED').length;
  const varianceCount = data.matches.filter((m: any) => m.status.includes('VARIANCE') || m.status.includes('MISMATCH')).length;
  const unmatchedTxCount = data.matches.filter((m: any) => m.status === 'TX_ONLY').length;
  const unmatchedInvCount = data.matches.filter((m: any) => m.status === 'INV_ONLY').length;

  const filtered =
    filter === 'all'
      ? data.matches
      : filter === 'matched'
        ? data.matches.filter((m: any) => m.status.includes('MATCH') || m.status.includes('VERIFIED'))
        : filter === 'unmatched'
          ? data.matches.filter((m: any) => m.status === 'TX_ONLY' || m.status === 'INV_ONLY')
          : filter === 'variance'
            ? data.matches.filter((m: any) => m.status.includes('VARIANCE') || m.status.includes('MISMATCH') || m.status === 'PERIOD_MISMATCH')
            : data.matches;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Reconciliation</h1>
          <p className="text-sm text-surface-500 mt-1">Transaction-to-invoice matching results</p>
        </div>
        <button onClick={fetchRecon} className="btn btn-primary text-sm px-4 py-2 flex items-center gap-1.5">
          <GitCompareArrows className="h-4 w-4" />
          Refresh Run
        </button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Matches', value: String(exactCount), color: 'text-green-600' },
          { label: 'Unmatched Transactions', value: String(unmatchedTxCount), color: 'text-red-500' },
          { label: 'Unmatched Invoice Rows', value: String(unmatchedInvCount), color: 'text-red-400' },
          { label: 'Variances & Mismatches', value: String(varianceCount), color: 'text-amber-500' },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <p className="text-xs text-surface-500">{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        {['all', 'matched', 'unmatched', 'variance'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              filter === f ? 'bg-brand-600 text-white' : 'bg-surface-200 text-surface-600 hover:bg-surface-300'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Results table */}
      <div className="card overflow-hidden">
        {data.matches.length === 0 ? (
          <div className="p-8 text-center text-surface-400">
            No reconciliation data. Upload transactions and invoices to run the engine.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-surface-50 border-b border-surface-200">
              <tr>
                <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Registration</th>
                <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Card</th>
                <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Station</th>
                <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Product</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">TX Qty</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">INV Qty</th>
                <th className="text-center text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Status</th>
                <th className="text-center text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Stage</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Confidence</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-200">
              {filtered.map((m: any) => (
                <tr key={m.id} className="hover:bg-surface-50 transition">
                  <td className="px-5 py-3 text-sm font-medium text-surface-800">
                    {m.transaction?.registration || m.invoiceRow?.registration || '—'}
                  </td>
                  <td className="px-5 py-3 text-sm text-surface-600 font-mono">
                    {m.transaction?.cardNumber || m.invoiceRow?.cardNumberNormalised || '—'}
                  </td>
                  <td className="px-5 py-3 text-sm text-surface-600">
                    {m.transaction?.stationName || m.invoiceRow?.stationName || '—'}
                  </td>
                  <td className="px-5 py-3 text-sm text-surface-600">
                    {m.transaction?.productName || m.invoiceRow?.productName || '—'}
                  </td>
                  <td className="px-5 py-3 text-sm text-surface-800 text-right font-mono">
                    {m.transaction?.quantity || '—'}
                  </td>
                  <td className="px-5 py-3 text-sm text-surface-800 text-right font-mono">
                    {m.invoiceRow?.quantity || '—'}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={`badge ${statusColors[m.status] || 'badge-info'} text-2xs`}>
                      {m.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center text-sm text-surface-500">{m.matchStage || '—'}</td>
                  <td className="px-5 py-3 text-right text-sm font-medium">
                    <span className={m.confidence >= 80 ? 'text-green-600' : m.confidence >= 50 ? 'text-amber-600' : 'text-red-600'}>
                      {m.confidence > 0 ? `${m.confidence}%` : '—'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => handleOpenLedger(m)}
                      className="p-1 rounded-lg hover:bg-surface-200 text-surface-400 hover:text-surface-600 transition"
                      title="Audit Evidence"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Match Audit details Side Drawer / Modal */}
      {selectedMatch && (
        <div className="fixed inset-0 bg-surface-900/40 backdrop-blur-sm z-50 flex items-center justify-end">
          <div className="bg-white h-full max-w-xl w-full p-6 shadow-xl border-l border-surface-200 flex flex-col animate-slide-in">
            <div className="flex items-center justify-between border-b border-surface-150 pb-4">
              <div>
                <h3 className="text-lg font-bold text-surface-900">Match Evidence & Logic Audit</h3>
                <p className="text-xs text-surface-500">ID: {selectedMatch.id}</p>
              </div>
              <button
                onClick={() => setSelectedMatch(null)}
                className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400 hover:text-surface-600"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-6">
              {/* Evidence side-by-side comparison */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface-50 p-3 rounded-xl border border-surface-150">
                  <h4 className="text-xs font-bold text-surface-800 uppercase tracking-wider">Transaction Data</h4>
                  <div className="text-xs space-y-2 mt-2 font-mono">
                    <p><span className="text-surface-400">Reg:</span> {selectedMatch.transaction?.registration || 'N/A'}</p>
                    <p><span className="text-surface-400">Card:</span> {selectedMatch.transaction?.cardNumber || 'N/A'}</p>
                    <p><span className="text-surface-400">Date:</span> {selectedMatch.transaction?.transactionDate || 'N/A'}</p>
                    <p><span className="text-surface-400">Qty:</span> {selectedMatch.transaction?.quantity || 'N/A'} {selectedMatch.transaction?.unit}</p>
                    <p><span className="text-surface-400">Gross:</span> €{selectedMatch.transaction?.amountGross || 'N/A'}</p>
                  </div>
                </div>

                <div className="bg-surface-50 p-3 rounded-xl border border-surface-150">
                  <h4 className="text-xs font-bold text-surface-800 uppercase tracking-wider">Invoice Row Data</h4>
                  <div className="text-xs space-y-2 mt-2 font-mono">
                    <p><span className="text-surface-400">Reg:</span> {selectedMatch.invoiceRow?.registration || 'N/A'}</p>
                    <p><span className="text-surface-400">Card:</span> {selectedMatch.invoiceRow?.cardNumberNormalised || 'N/A'}</p>
                    <p><span className="text-surface-400">Date:</span> {selectedMatch.invoiceRow?.transactionDate || 'N/A'}</p>
                    <p><span className="text-surface-400">Qty:</span> {selectedMatch.invoiceRow?.quantity || 'N/A'} {selectedMatch.invoiceRow?.unit}</p>
                    <p><span className="text-surface-400">Gross:</span> €{selectedMatch.invoiceRow?.baseValueGross || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Reasoning Ledger Breakdown */}
              {reasons.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-surface-800 flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-brand-600" />
                    How was this calculated? (Reasoning Ledger)
                  </h4>
                  <div className="space-y-2">
                    {reasons.map((r: any) => (
                      <div key={r.id} className="bg-surface-50 p-3 rounded-xl border border-surface-200 text-xs">
                        <div className="flex justify-between font-semibold">
                          <span>{r.factor}</span>
                          <span className="text-brand-600">{r.awarded_points} / {r.max_points} pts</span>
                        </div>
                        <p className="text-surface-500 mt-1 font-mono text-2xs">Rule: {r.rule_applied}</p>
                        <p className="text-surface-600 mt-1">Value: {r.raw_value} → {r.normalised_value}</p>
                        {r.supporting_evidence && <p className="text-green-600 mt-1">✓ {r.supporting_evidence}</p>}
                        {r.contradictory_evidence && <p className="text-red-600 mt-1">✗ {r.contradictory_evidence}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Auditor Action */}
              <div className="border-t border-surface-200 pt-4 space-y-3">
                <h4 className="text-xs font-bold text-surface-700">Manual Override / Adjust Decision</h4>
                <textarea
                  rows={2}
                  value={overrideNotes}
                  onChange={(e) => setOverrideNotes(e.target.value)}
                  placeholder="Enter manual decision explanation..."
                  className="w-full rounded-xl border border-surface-300 p-2.5 text-xs"
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => handleOverride('escalated')} className="btn btn-secondary text-xs px-3 py-1.5 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Escalate
                  </button>
                  <button onClick={() => handleOverride('approved')} className="btn btn-primary text-xs px-3 py-1.5 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Approve / Override
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
