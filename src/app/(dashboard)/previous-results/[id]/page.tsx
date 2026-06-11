'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, Printer, FileText, Download, ShieldCheck, ChevronRight, AlertTriangle, CheckCircle2, XCircle, Info, Calendar, ArrowLeft, RefreshCw, Landmark } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function CheckResultDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const tabParam = searchParams.get('tab');
  const expandParam = searchParams.get('expand');

  const [check, setCheck] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'discrepancies' | 'all'>('summary');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);

  useEffect(() => {
    if (tabParam === 'discrepancies' || tabParam === 'all') {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  useEffect(() => {
    fetch(`/api/check-transactions?id=${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.batchId) {
          router.replace(`/batches?id=${data.batchId}&tab=transactions`);
          return;
        }
        if (data.check) {
          setCheck(data.check);
          const results = data.check.results || [];
          if (expandParam === 'first' && results.length > 0) {
            setExpandedRow(results[0].id);
          } else if (expandParam) {
            setExpandedRow(expandParam);
          }
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [id, expandParam, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-brand-500"></div>
      </div>
    );
  }

  if (!check) {
    return (
      <div className="card text-center py-12 space-y-4 max-w-md mx-auto">
        <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
        <h2 className="text-base font-bold">Verification Run Not Found</h2>
        <p className="text-xs text-slate-500">The requested check results could not be located in database storage.</p>
        <Link href="/" className="btn btn-primary btn-sm mx-auto">
          Return Home
        </Link>
      </div>
    );
  }

  const results = check.results || [];

  // Filter lists
  const discrepancies = results.filter(
    (r: any) => r.simpleStatus !== 'Supported' && r.simpleStatus !== 'Likely supported'
  );

  const displayedRows =
    activeTab === 'summary'
      ? results.slice(0, 10) // Show top 10 on summary
      : activeTab === 'discrepancies'
        ? discrepancies
        : results;

  // Render friendly overall conclusion
  let mainConclusion = `All ${check.total_transactions} transactions for vehicle ${check.vehicle} are supported by the available GPS evidence.`;
  if (check.unsupported_count > 0 || check.review_required_count > 0 || check.insufficient_evidence_count > 0) {
    const issuesList = [];
    if (check.unsupported_count > 0) issuesList.push(`${check.unsupported_count} unsupported`);
    if (check.review_required_count > 0) issuesList.push(`${check.review_required_count} requiring review`);
    if (check.insufficient_evidence_count > 0) issuesList.push(`${check.insufficient_evidence_count} with insufficient evidence`);
    mainConclusion = `${check.supported_count + check.likely_supported_count} of ${check.total_transactions} transactions for vehicle ${check.vehicle} are supported. ${issuesList.join(', ')} discrepancies identified.`;
  }

  // Prevent formula injection in CSV/XLSX cellular values
  const sanitizeCell = (val: any) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.startsWith('=') || str.startsWith('+') || str.startsWith('-') || str.startsWith('@')) {
      return `'${str}`;
    }
    return str;
  };

  const handleExportCSV = () => {
    const headers = ['Date', 'Product', 'Station', 'Quantity', 'Amount', 'Status', 'Confidence %', 'Reason'];
    const rows = results.map((r: any) => [
      sanitizeCell(r.transactionTimestamp),
      sanitizeCell(r.productName),
      sanitizeCell(r.stationName + (r.stationCity ? `, ${r.stationCity}` : '')),
      sanitizeCell(r.quantity),
      sanitizeCell(r.amountGross),
      sanitizeCell(r.simpleStatus),
      sanitizeCell(r.confidence),
      sanitizeCell(r.friendlyReason)
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e: any) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `verification_report_${check.vehicle}_${check.provider}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportMenu(false);
  };

  const handleExportExcel = () => {
    const data = results.map((r: any) => ({
      Date: sanitizeCell(r.transactionTimestamp),
      Product: sanitizeCell(r.productName),
      Station: sanitizeCell(r.stationName + (r.stationCity ? `, ${r.stationCity}` : '')),
      Quantity: sanitizeCell(r.quantity),
      Amount: sanitizeCell(r.amountGross),
      Status: sanitizeCell(r.simpleStatus),
      'Confidence %': sanitizeCell(r.confidence),
      Reason: sanitizeCell(r.friendlyReason)
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Verification Results');
    XLSX.writeFile(wb, `verification_report_${check.vehicle}_${check.provider}.xlsx`);
    setShowExportMenu(false);
  };

  return (
    <div className="space-y-6 text-slate-800 dark:text-surface-900 max-w-5xl mx-auto py-4 animate-fade-in print:p-0 print:m-0">
      {/* Back button */}
      <div className="flex items-center justify-between print:hidden">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition">
          <ArrowLeft className="h-4 w-4" /> Back to Home
        </Link>

        {/* Export menu */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="btn btn-secondary text-xs px-4 py-2 flex items-center gap-1.5"
          >
            <Download className="h-4 w-4" /> Export Report <ChevronDown className="h-3 w-3" />
          </button>

          {showExportMenu && (
            <div className="absolute right-0 mt-2 w-48 rounded-lg border border-surface-300 bg-surface-100 p-1 shadow-lg z-50">
              <button
                onClick={() => {
                  window.print();
                  setShowExportMenu(false);
                }}
                className="flex items-center gap-2.5 w-full px-3 py-2 rounded text-xs text-surface-800 hover:bg-surface-200"
              >
                <Printer className="h-4 w-4 text-slate-400" /> Print-Friendly Report
              </button>
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-2.5 w-full px-3 py-2 rounded text-xs text-surface-800 hover:bg-surface-200"
              >
                <FileText className="h-4 w-4 text-green-600" /> Export Excel (.xlsx)
              </button>
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-2.5 w-full px-3 py-2 rounded text-xs text-surface-800 hover:bg-surface-200"
              >
                <Download className="h-4 w-4 text-blue-500" /> Export CSV (.csv)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Conclusion Title Card */}
      <div className="card bg-gradient-to-br from-brand-600/10 to-brand-700/5 border-brand-200 dark:border-brand-500/20 p-6 space-y-3">
        <div className="flex items-center gap-2 text-brand-600 dark:text-brand-400">
          <ShieldCheck className="h-6 w-6" />
          <span className="text-xs font-bold uppercase tracking-wider">Verification Complete</span>
        </div>
        <h2 className="text-xl font-extrabold text-slate-900 dark:text-surface-950 tracking-tight leading-snug">
          {mainConclusion}
        </h2>
        <p className="text-xs text-slate-500 dark:text-surface-600">
          Audited {check.provider} file <span className="font-mono">{check.transaction_file_name}</span> against GPS log <span className="font-mono">{check.gps_file_name}</span>.
        </p>
      </div>

      {/* Exclusions Notice Banner */}
      {check.excluded_transactions_count > 0 && (
        <div className="flex gap-3 p-4 bg-amber-500/10 border border-amber-300 rounded-xl text-amber-800 text-xs animate-slide-down">
          <Landmark className="h-5 w-5 shrink-0 mt-0.5 text-amber-600" />
          <div>
            <p className="font-bold">Vehicle-Focused check comparison filter</p>
            <p className="mt-0.5">
              This verification check includes only transactions linked to <span className="font-mono font-bold">{check.vehicle}</span>.
              There are <span className="font-bold">{check.excluded_transactions_count} charges</span> in the transaction file for other fleet vehicles ({check.excluded_vehicles?.join(', ') || 'None'}) that were excluded.
              To check those vehicles, return to the check wizard and upload the matching GPS telemetry file.
            </p>
          </div>
        </div>
      )}

      {/* Status metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Supported', count: check.supported_count, color: 'text-green-600', bg: 'bg-green-500/10' },
          { label: 'Likely Supported', count: check.likely_supported_count || 0, color: 'text-cyan-600', bg: 'bg-cyan-500/10' },
          { label: 'Review Required', count: check.review_required_count || 0, color: 'text-amber-600', bg: 'bg-amber-500/10' },
          { label: 'Unsupported', count: check.unsupported_count || 0, color: 'text-red-600', bg: 'bg-red-500/10' },
          { label: 'Insufficient Evidence', count: check.insufficient_evidence_count || 0, color: 'text-slate-500', bg: 'bg-slate-500/10' },
        ].map((m) => (
          <div key={m.label} className="card p-3 flex items-center justify-between">
            <span className="text-3xs font-semibold text-slate-500 uppercase tracking-wider">{m.label}</span>
            <span className="badge h-6 px-2.5 rounded-full flex items-center justify-center text-xs font-bold ${m.bg} ${m.color}">
              {m.count}
            </span>
          </div>
        ))}
      </div>

      {/* Selector Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-surface-300 pb-px print:hidden">
        {[
          { id: 'summary', label: 'Summary View' },
          { id: 'discrepancies', label: `Discrepancies Only (${discrepancies.length})` },
          { id: 'all', label: `All Transactions (${results.length})` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`px-4 py-2 border-b-2 text-xs font-bold transition ${
              activeTab === t.id
                ? 'border-brand-500 text-brand-600 dark:text-brand-400 font-extrabold'
                : 'border-transparent text-slate-400 hover:text-slate-600 dark:text-surface-600 dark:hover:text-surface-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Transaction Result List */}
      <div className="space-y-4">
        {displayedRows.length === 0 ? (
          <div className="card p-8 text-center text-xs text-slate-400">
            No transactions found matching this tab filters.
          </div>
        ) : (
          <div className="space-y-3">
            {displayedRows.map((r: any) => {
              const isExpanded = expandedRow === r.id;

              // Status Styling mapping
              const statusStyles: Record<string, { bg: string; text: string; icon: any }> = {
                Supported: { bg: 'bg-green-500/10', text: 'text-green-700 dark:text-green-400', icon: CheckCircle2 },
                'Likely supported': { bg: 'bg-cyan-500/10', text: 'text-cyan-700 dark:text-cyan-400', icon: CheckCircle2 },
                'Review required': { bg: 'bg-amber-500/10', text: 'text-amber-700 dark:text-amber-400', icon: AlertTriangle },
                'Not supported': { bg: 'bg-red-500/10', text: 'text-red-700 dark:text-red-400', icon: XCircle },
                'Insufficient GPS evidence': { bg: 'bg-slate-500/10', text: 'text-slate-600 dark:text-surface-600', icon: Info },
              };

              const style = statusStyles[r.simpleStatus] || { bg: 'bg-slate-100', text: 'text-slate-700', icon: Info };
              const Icon = style.icon;

              return (
                <div key={r.id} className="card p-0 overflow-hidden hover:border-slate-300 dark:hover:border-surface-400 transition">
                  <div
                    onClick={() => setExpandedRow(isExpanded ? null : r.id)}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
                  >
                    {/* Time & Product */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-3xs text-slate-500">{r.transactionDate}</span>
                        <span className="badge bg-slate-100 dark:bg-surface-200 text-slate-800 dark:text-surface-950 uppercase text-3xs font-semibold">{r.productName}</span>
                      </div>
                      <p className="text-xs font-semibold text-slate-900 dark:text-surface-950">{r.stationName} {r.stationCity && `(${r.stationCity})`}</p>
                    </div>

                    {/* Qty & Amount */}
                    <div className="flex sm:flex-col items-baseline sm:items-end gap-2 sm:gap-0 font-mono text-xs">
                      <p className="font-semibold text-slate-900 dark:text-surface-950">€{parseFloat(r.amountGross).toFixed(2)}</p>
                      <p className="text-slate-500 text-3xs">{r.quantity} {r.unit}</p>
                    </div>

                    {/* Status & Friendly Reason */}
                    <div className="flex items-center justify-between sm:justify-end gap-3 flex-1 max-w-md">
                      <div className="text-left sm:text-right hidden sm:block">
                        <p className="text-2xs font-medium text-slate-800 dark:text-surface-950">{r.friendlyReason}</p>
                        <p className="text-3xs text-slate-500 mt-0.5">Confidence match score: {r.confidence}%</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`badge ${style.bg} ${style.text} text-3xs font-bold py-1 px-3 flex items-center gap-1`}>
                          <Icon className="h-3.5 w-3.5" /> {r.simpleStatus}
                        </span>
                        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                  </div>

                  {/* Expandable "Why did the app reach this result?" Details */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 dark:border-surface-200 bg-slate-50/50 dark:bg-surface-50/10 p-5 space-y-4 text-xs font-medium text-slate-700 dark:text-surface-800 animate-slide-down">
                      <h4 className="text-2xs font-extrabold text-slate-900 dark:text-surface-950 uppercase tracking-wider">
                        Why did the app reach this result? (Reasoning Details)
                      </h4>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Comparison Factors breakdown */}
                        <div className="space-y-3">
                          <h5 className="font-bold text-slate-800 dark:text-surface-950 text-2xs uppercase">Audit Score Analysis</h5>
                          <div className="space-y-2">
                            {r.factors.map((f: any, idx: number) => (
                              <div key={idx} className="flex justify-between border-b border-slate-100 dark:border-surface-200 pb-1.5">
                                <span className="text-slate-500 capitalize">{f.factorName.toLowerCase()}</span>
                                <span className="font-mono text-slate-900 dark:text-surface-950">
                                  {f.awardedPoints} / {f.maxPoints} pts ({f.result})
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Telemetry Log Summary */}
                        <div className="space-y-3">
                          <h5 className="font-bold text-slate-800 dark:text-surface-950 text-2xs uppercase">Telemetry Audit Evidence</h5>
                          <div className="space-y-2 text-2xs font-mono text-slate-600 dark:text-surface-600 space-y-1">
                            {r.factors.map((f: any, idx: number) => (
                              <div key={idx} className="border-l-2 border-slate-200 dark:border-surface-300 pl-2 text-2xs">
                                <p className="font-bold text-slate-800 dark:text-surface-800 capitalize">{f.factorName.toLowerCase()}:</p>
                                {f.details ? (
                                  <div className="space-y-3 mt-1.5 p-3.5 bg-slate-100 dark:bg-surface-50 rounded-xl border border-slate-200 dark:border-surface-300 text-3xs font-medium font-sans">
                                    <div className="text-2xs font-bold text-brand-800 dark:text-brand-400 bg-brand-500/10 p-2.5 rounded-lg border-l-4 border-l-brand-600 mb-3 leading-snug">
                                      {f.details.plainEnglishConclusion}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2.5 gap-x-6">
                                      <div><span className="text-slate-400">Transaction Timestamp:</span> <span className="font-mono text-slate-850 dark:text-surface-900 block mt-0.5">{f.details.transactionTimestamp}</span></div>
                                      <div><span className="text-slate-400">Applied Timezone:</span> <span className="text-slate-850 dark:text-surface-900 block mt-0.5">{f.details.timezoneApplied}</span></div>
                                      <div><span className="text-slate-400">Session Window Start:</span> <span className="font-mono text-slate-850 dark:text-surface-900 block mt-0.5">{f.details.sessionStart}</span></div>
                                      <div><span className="text-slate-400">Session Window End:</span> <span className="font-mono text-slate-855 dark:text-surface-900 block mt-0.5">{f.details.sessionEnd}</span></div>
                                      <div><span className="text-slate-400">Baseline Timestamp:</span> <span className="font-mono text-slate-850 dark:text-surface-900 block mt-0.5">{f.details.baselineTimestamp}</span></div>
                                      <div><span className="text-slate-400">Baseline Fuel Level:</span> <span className="font-bold text-slate-850 dark:text-surface-900 font-mono block mt-0.5">{f.details.baselineFuelPercent}%</span></div>
                                      <div><span className="text-slate-400">Post-Fill Timestamp:</span> <span className="font-mono text-slate-850 dark:text-surface-900 block mt-0.5">{f.details.postFillTimestamp}</span></div>
                                      <div><span className="text-slate-400">Post-Fill Fuel Level:</span> <span className="font-bold text-slate-850 dark:text-surface-900 font-mono block mt-0.5">{f.details.postFillFuelPercent}%</span></div>
                                      <div><span className="text-slate-400">Observed Fuel Increase:</span> <span className="font-black text-brand-600 font-mono block mt-0.5">+{f.details.observedIncreasePercent} percentage points</span></div>
                                      <div><span className="text-slate-400">Transaction Volume:</span> <span className="font-bold text-slate-850 dark:text-surface-900 font-mono block mt-0.5">{f.details.transactionLitres} Litres</span></div>
                                      <div><span className="text-slate-400">Configured Tank Capacity:</span> <span className="font-mono text-slate-850 dark:text-surface-900 block mt-0.5">{f.details.tankCapacity} L</span></div>
                                      <div><span className="text-slate-400">Expected Fill Percentage:</span> <span className="font-mono text-slate-850 dark:text-surface-900 block mt-0.5">~{f.details.expectedIncreasePercent}%</span></div>
                                      <div><span className="text-slate-400">Observed vs Expected Diff:</span> <span className="font-mono text-slate-850 dark:text-surface-900 block mt-0.5">{f.details.differencePercent}%</span></div>
                                      <div><span className="text-slate-400">Sensor Ceiling Status:</span> <span className="badge bg-slate-200 text-slate-800 text-4xs font-bold font-mono uppercase block mt-0.5 w-fit">{f.details.sensorCeilingStatus}</span></div>
                                      <div><span className="text-slate-400">Telemetry Logs Used:</span> <span className="font-mono text-slate-850 dark:text-surface-900 block mt-0.5">{f.details.pointsUsedCount} points</span></div>
                                      <div><span className="text-slate-400">Telemetry Logs Excluded:</span> <span className="font-mono text-slate-850 dark:text-surface-900 block mt-0.5">{f.details.pointsExcludedCount} points</span></div>
                                      <div><span className="text-slate-400">Exclusion Reason:</span> <span className="text-slate-500 italic block mt-0.5">{f.details.reasonForExclusion}</span></div>
                                      <div><span className="text-slate-400">Fuel Score Awarded:</span> <span className="font-bold text-slate-850 dark:text-surface-900 font-mono block mt-0.5">{f.details.finalFuelScore} / 25 pts</span></div>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-3xs text-slate-505 mt-0.5 font-sans font-medium leading-relaxed">{f.explanation}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Applied Config details */}
                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-3xs font-mono text-slate-450 mt-4 border-t border-slate-100 dark:border-surface-200 pt-3">
                        <p>Timezone Offset Applied: {r.timezoneApplied}</p>
                        <p>Time Tolerance Applied: {r.toleranceApplied}</p>
                        <p>Validation Ruleset Version: 1.0.0</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
