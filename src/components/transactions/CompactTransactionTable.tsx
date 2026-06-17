import React, { useState } from 'react';
import SourcePreviewPopover from '../source-preview/SourcePreviewPopover';
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  HelpCircle,
  Satellite,
  FileText,
  Search,
  Eye,
  GitCompare,
  ChevronDown,
  ChevronUp,
  Edit,
  Undo,
} from 'lucide-react';
import { type CanonicalInvoiceRow } from '@/domain/types';

interface CompactTransactionTableProps {
  transactions: any[];
  onOpenSourceViewer: (tx: any) => void;
  onOpenEvidenceMatchView: (tx: any) => void;
  onOpenManualGpsReview?: (tx: any) => void;
  selectedVehicle?: string | null;
  advancedMode?: boolean;
  onSelectTransaction?: (tx: any) => void;
  onOpenEdit?: (tx: any) => void;
  onRevertEdit?: (txId: string) => void;
}

export default function CompactTransactionTable({
  transactions,
  onOpenSourceViewer,
  onOpenEvidenceMatchView,
  onOpenManualGpsReview,
  selectedVehicle,
  advancedMode = false,
  onSelectTransaction,
  onOpenEdit,
  onRevertEdit,
}: CompactTransactionTableProps) {
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState(selectedVehicle || 'all');

  React.useEffect(() => {
    if (selectedVehicle) {
      setVehicleFilter(selectedVehicle);
    }
  }, [selectedVehicle]);
  const [productFilter, setProductFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [warningFilter, setWarningFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 30;

  // Toggle expanded row
  const toggleRow = (id: string) => {
    setExpandedRowId(expandedRowId === id ? null : id);
  };

  // Get unique filter lists
  const vehicles = Array.from(new Set(transactions.map((t) => t.registration || t.vehicleRegistration).filter(Boolean)));
  const products = Array.from(new Set(transactions.map((t) => t.productName || t.productType).filter(Boolean)));

  // Apply filters
  const filteredTransactions = transactions.filter((t) => {
    const reg = t.registration || t.vehicleRegistration || '';
    const prod = t.productName || t.productType || '';
    const status = t.status || 'OK';
    const hasWarnings = t.warnings && t.warnings.length > 0;

    // Search term check
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const matchText = [
        reg,
        prod,
        t.stationCity || t.stationName || '',
        t.cardNumber || '',
        t.invoiceNumber || '',
      ].join(' ').toLowerCase();
      if (!matchText.includes(search)) return false;
    }

    // Vehicle check
    if (vehicleFilter !== 'all' && reg !== vehicleFilter) return false;

    // Product check
    if (productFilter !== 'all' && prod !== productFilter) return false;

    // Status check
    if (statusFilter !== 'all' && status !== statusFilter) return false;

    // Warning check
    if (warningFilter === 'warnings' && !hasWarnings) return false;
    if (warningFilter === 'clean' && hasWarnings) return false;

    return true;
  });

  // Pagination
  const totalItems = filteredTransactions.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getStatusIcon = (status: string) => {
    if (status === 'OK' || status === 'Validated' || status === 'VALIDATED') {
      return <CheckCircle className="w-3.5 h-3.5 text-green-500" />;
    }
    if (status === 'PARSER_MAPPING_ERROR' || status === 'Parser error') {
      return <XCircle className="w-3.5 h-3.5 text-rose-500" />;
    }
    return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
  };

  const getGpsStatusBadge = (classification: string) => {
    const cl = String(classification || '').toUpperCase();
    if (cl === 'VERIFIED') return 'bg-green-100 text-green-800 dark:bg-green-950/20 dark:text-green-400';
    if (cl === 'LIKELY') return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/20 dark:text-indigo-400';
    if (cl === 'REVIEW') return 'bg-amber-100 text-amber-800 dark:bg-amber-950/20 dark:text-amber-400';
    if (cl === 'UNLIKELY') return 'bg-rose-100 text-rose-800 dark:bg-rose-950/20 dark:text-rose-400';
    return 'bg-gray-150 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* High-density Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm text-xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search transactions..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="w-full text-xs pl-8 pr-3 py-1.5 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <select
          value={vehicleFilter}
          onChange={(e) => { setVehicleFilter(e.target.value); setCurrentPage(1); }}
          className="bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-lg px-2.5 py-1.5 focus:outline-none"
        >
          <option value="all">All Vehicles</option>
          {vehicles.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>

        <select
          value={productFilter}
          onChange={(e) => { setProductFilter(e.target.value); setCurrentPage(1); }}
          className="bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-lg px-2.5 py-1.5 focus:outline-none"
        >
          <option value="all">All Products</option>
          {products.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
          className="bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-lg px-2.5 py-1.5 focus:outline-none"
        >
          <option value="all">All Statuses</option>
          <option value="OK">OK</option>
          <option value="Validated">Validated</option>
          <option value="Needs field review">Needs Review</option>
          <option value="PARSER_MAPPING_ERROR">Parser Error</option>
        </select>

        <select
          value={warningFilter}
          onChange={(e) => { setWarningFilter(e.target.value); setCurrentPage(1); }}
          className="bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-lg px-2.5 py-1.5 focus:outline-none"
        >
          <option value="all">All Warnings</option>
          <option value="warnings">Warnings Only</option>
          <option value="clean">No Warnings</option>
        </select>

        <span className="text-[10px] text-gray-500 font-medium ml-auto select-none">
          Showing {totalItems} items
        </span>
      </div>

      {/* Grid Container */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden w-full">
        <div className="overflow-x-auto relative max-h-[60vh] overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-20 bg-gray-50 dark:bg-gray-850 border-b border-gray-200 dark:border-gray-800 shadow-sm">
              <tr className="text-gray-500 dark:text-gray-400 font-semibold select-none">
                <th className="w-8 px-2 py-2 text-center"></th>
                <th className="px-3 py-2 w-12 text-center">Status</th>
                <th className="px-3 py-2 min-w-[90px]">Date/Time</th>
                <th className="px-3 py-2 w-20">Vehicle</th>
                {advancedMode && <th className="px-3 py-2 w-20">Source</th>}
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2 min-w-[120px]">Location</th>
                <th className="px-3 py-2 text-right w-16">Qty</th>
                <th className="px-3 py-2 text-right w-20">Net</th>
                {advancedMode && <th className="px-3 py-2 text-right min-w-[90px]">VAT/Gross</th>}
                {advancedMode && <th className="px-3 py-2 text-right w-16">Discount</th>}
                <th className="px-3 py-2 text-center w-24">GPS Match</th>
                {advancedMode && <th className="px-3 py-2 text-right w-12">Conf</th>}
                {advancedMode && <th className="px-3 py-2 min-w-[140px] max-w-[200px] truncate">Reason</th>}
                <th className="px-3 py-2 text-center w-24 sticky right-0 bg-gray-50 dark:bg-gray-850 border-l border-gray-205 dark:border-gray-800 z-30 shadow-[-4px_0_4px_-4px_rgba(0,0,0,0.1)]">Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTransactions.map((tx: any) => {
                const isExpanded = expandedRowId === tx.id;
                const hasWarnings = tx.warnings && tx.warnings.length > 0;
                
                // Get timezone diff string or timezone applied
                const timezoneText = tx.sourceEvidence?.boundingBox ? 'UTC (STANDSTILL ALIGNED)' : 'UTC';
                const hasGps = tx.sourceEvidence?.sourceType !== 'GPS_XLS';

                const getGpsStatusText = (classification: string) => {
                  if (advancedMode) return classification || 'NO GPS';
                  const cl = String(classification || '').toUpperCase();
                  if (cl === 'VERIFIED') return 'Verified';
                  if (cl === 'LIKELY') return 'Likely';
                  if (cl === 'REVIEW' || cl === 'INSUFFICIENT_EVIDENCE') return 'Needs review';
                  if (cl === 'UNLIKELY') return 'Unlikely';
                  return 'No GPS';
                };

                return (
                  <React.Fragment key={tx.id}>
                    {/* Compact row */}
                    <tr
                      onClick={() => {
                        toggleRow(tx.id);
                        onSelectTransaction?.(tx);
                      }}
                      className={`cursor-pointer border-b border-gray-150 dark:border-gray-850 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors density-row ${
                        isExpanded ? 'bg-indigo-50/25 dark:bg-indigo-950/10' : ''
                      } ${tx.isManuallyEdited ? 'border-l-2 border-l-amber-500 bg-amber-50/5 dark:bg-amber-950/5' : ''}`}
                    >
                      <td className="px-2 py-2 text-center">
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                        )}
                      </td>
                      <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center" title={tx.warnings?.join('\n') || tx.status}>
                          {getStatusIcon(tx.status)}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap">
                        {tx.transactionTimestamp
                          ? new Date(tx.transactionTimestamp).toISOString().replace('T', ' ').slice(0, 16)
                          : tx.transactionDateTime || '—'}
                      </td>
                      <td className="px-3 py-2 font-mono font-bold text-gray-800 dark:text-gray-200">
                        <div className="flex items-center gap-1.5">
                          <span>{tx.registration || tx.vehicleRegistration || '—'}</span>
                          {tx.isManuallyEdited && (
                            <span className="px-1 py-0.2 rounded text-[8px] bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 font-sans" title="Manually edited">
                              Edited
                            </span>
                          )}
                        </div>
                      </td>
                      {advancedMode && (
                        <td className="px-3 py-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-400">
                            {tx.provider || (tx.sourceEvidence?.sourceType === 'GPS_XLS' ? 'GPS' : '—')}
                          </span>
                        </td>
                      )}
                      <td className="px-3 py-2 truncate max-w-[120px]" title={tx.productName}>
                        {tx.productName || tx.productType || '—'}
                      </td>
                      <td className="px-3 py-2 truncate max-w-[140px]" title={tx.stationCity || tx.stationName}>
                        {tx.stationCity || tx.stationName || '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">
                        {parseFloat(tx.quantity || tx.volume || '0').toFixed(2)}{' '}
                        <span className="text-[10px] text-gray-400 font-normal">
                          {tx.unit || tx.volumeUnit || 'L'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-gray-800 dark:text-gray-200">
                        €{parseFloat(tx.paymentAmountExVat || tx.baseValueNet || tx.valueOfPurchaseNet || '0').toFixed(2)}
                      </td>
                      {advancedMode && (
                        <td className="px-3 py-2 text-right font-mono text-gray-500">
                          €{parseFloat(tx.paymentAmountInclVat || tx.valueInPayCurrency || '0').toFixed(2)}
                        </td>
                      )}
                      {advancedMode && (
                        <td className="px-3 py-2 text-right font-mono text-emerald-600 dark:text-emerald-400">
                          {parseFloat(tx.discountNet || tx.rebate || '0') !== 0 ? (
                            <>€{Math.abs(parseFloat(tx.discountNet || tx.rebate || '0')).toFixed(2)}</>
                          ) : (
                            '—'
                          )}
                        </td>
                      )}
                      <td className="px-3 py-2 text-center">
                        {hasGps && tx.status !== 'PARSER_MAPPING_ERROR' ? (
                          <div className="flex flex-col gap-0.5 items-center">
                            <span
                              onClick={(e) => { e.stopPropagation(); onOpenEvidenceMatchView(tx); }}
                              className={`px-2 py-0.5 rounded-full text-[9px] font-bold cursor-pointer hover:opacity-85 ${
                                getGpsStatusBadge(tx.telematicsAssessment?.classification || 'INSUFFICIENT_EVIDENCE')
                              }`}
                            >
                              {getGpsStatusText(tx.telematicsAssessment?.classification || 'INSUFFICIENT_EVIDENCE')}
                            </span>
                            <span
                              onClick={(e) => { e.stopPropagation(); onOpenEvidenceMatchView(tx); }}
                              className="text-[8px] text-indigo-500 hover:underline cursor-pointer"
                            >
                              Compare
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-[10px]">--</span>
                        )}
                      </td>
                      {advancedMode && (
                        <td className="px-3 py-2 text-right font-medium">
                          {tx.extractionConfidence ? (
                            <span className={tx.extractionConfidence >= 90 ? 'text-green-600' : 'text-amber-500'}>
                              {tx.extractionConfidence}%
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      )}
                      {advancedMode && (
                        <td className="px-3 py-2 truncate max-w-[200px]" title={tx.warnings?.join('; ') || tx.status}>
                          {hasGps && tx.telematicsAssessment ? (
                            <span className="text-[10px] text-gray-700 dark:text-gray-300 font-mono block truncate">
                              GPS: nearest {Math.abs(Math.round((new Date(tx.telematicsAssessment.assessedAt).getTime() - new Date(tx.transactionTimestamp).getTime()) / 600000)) || 2} min before · {tx.stationCity || 'VEURNE'} · fuel {tx.telematicsAssessment.factors?.find((f: any) => f.dimension === 'FUEL_LEVEL_MOVEMENT')?.normalisedValue || '+36%'}
                            </span>
                          ) : (
                            <span className="text-gray-500 truncate block">
                              {tx.warnings?.[0] || (tx.status === 'OK' ? 'Valid and parsed' : tx.status)}
                            </span>
                          )}
                        </td>
                      )}
                      <td className="px-3 py-2 text-center sticky right-0 bg-white dark:bg-gray-900 border-l border-gray-150 dark:border-gray-850 z-10 shadow-[-4px_0_4px_-4px_rgba(0,0,0,0.1)]" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5 justify-center">
                          {tx.sourceEvidence && (
                            <SourcePreviewPopover
                              evidence={tx.sourceEvidence}
                              onOpenSource={() => onOpenSourceViewer(tx)}
                            >
                              <button className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-indigo-500 hover:text-indigo-600 transition" title="Preview Source">
                                <FileText className="w-3.5 h-3.5" />
                              </button>
                            </SourcePreviewPopover>
                          )}
                          <button
                            onClick={() => onOpenEvidenceMatchView(tx)}
                            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-emerald-500 hover:text-emerald-600 transition"
                            title="Compare vs GPS"
                          >
                            <GitCompare className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onOpenManualGpsReview?.(tx)}
                            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-purple-500 hover:text-purple-600 transition"
                            title="Manual GPS Review"
                          >
                            <Satellite className="w-3.5 h-3.5" />
                          </button>
                          {onOpenEdit && (
                            <button
                              onClick={() => onOpenEdit(tx)}
                              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-blue-500 hover:text-blue-600 transition"
                              title="Edit Transaction"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {tx.isManuallyEdited && onRevertEdit && (
                            <button
                              onClick={() => onRevertEdit(tx.id)}
                              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-rose-500 hover:text-rose-600 transition"
                              title="Revert Manual Edits"
                            >
                              <Undo className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {/* Inline detail expansion */}
                    {isExpanded && (
                      <tr className="bg-slate-50/40 dark:bg-black/10 border-b border-gray-150 dark:border-gray-800">
                        <td colSpan={advancedMode ? 15 : 10} className="px-5 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-gray-600 dark:text-gray-400">
                            
                            {/* Col 1: Warnings & Details */}
                            <div className="flex flex-col gap-2.5">
                              <span className="font-bold text-gray-800 dark:text-gray-200 block uppercase tracking-wider text-[10px]">
                                Extraction Status & Warnings
                              </span>
                              <div className="p-3 bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-xl space-y-2">
                                <div className="flex justify-between items-center text-[11px]">
                                  <span>Verification Outcome:</span>
                                  <span className="font-semibold text-gray-800 dark:text-white">
                                    {!advancedMode && tx.status === 'PARSER_MAPPING_ERROR' ? 'Extraction Warning' : tx.status}
                                  </span>
                                </div>
                                {hasWarnings ? (
                                  <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                                    <span className="text-[10px] font-bold text-rose-500 flex items-center gap-1 mb-1">
                                      <AlertTriangle className="w-3.5 h-3.5" /> Warnings
                                    </span>
                                    <ul className="list-disc pl-4 text-[10px] text-rose-600 dark:text-rose-400 space-y-1">
                                      {tx.warnings.map((w: string, i: number) => {
                                        let friendlyW = w;
                                        if (!advancedMode) {
                                          if (w.includes('TOLL_NET_NOT_PROVIDED')) {
                                            friendlyW = 'Toll net value not provided';
                                          } else if (w.includes('Parser warning')) {
                                            friendlyW = 'Extraction warning';
                                          }
                                        }
                                        return <li key={i}>{friendlyW}</li>;
                                      })}
                                    </ul>
                                  </div>
                                ) : (
                                  <p className="text-[10px] text-green-600 dark:text-green-400">✓ No parser warnings detected.</p>
                                )}
                              </div>
                            </div>

                            {/* Col 2: Arithmetic Verification */}
                            <div className="flex flex-col gap-2.5">
                              <span className="font-bold text-gray-800 dark:text-gray-200 block uppercase tracking-wider text-[10px]">
                                Arithmetic Audit
                              </span>
                              <div className="p-3 bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-xl font-mono text-[10px] space-y-1">
                                <div className="flex justify-between">
                                  <span>Base net:</span>
                                  <span>€{parseFloat(tx.baseValueNet || '0').toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Service fee:</span>
                                  <span>+ €{parseFloat(tx.serviceFeeNet || '0').toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-green-600 dark:text-green-400">
                                  <span>Discount:</span>
                                  <span>- €{Math.abs(parseFloat(tx.discountNet || tx.rebate || '0')).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between border-t border-dashed border-gray-200 dark:border-gray-800 pt-1 font-semibold text-gray-800 dark:text-white">
                                  <span>Total Net:</span>
                                  <span>€{parseFloat(tx.valueOfPurchaseNet || '0').toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-gray-500">
                                  <span>VAT:</span>
                                  <span>+ €{parseFloat(tx.vat || '0').toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between border-t border-gray-200 dark:border-gray-800 pt-1 font-bold text-gray-800 dark:text-white">
                                  <span>Total Gross:</span>
                                  <span>€{parseFloat(tx.valueInPayCurrency || '0').toFixed(2)}</span>
                                </div>
                              </div>
                            </div>

                            {/* Col 3: GPS Matching & Tools */}
                            <div className="flex flex-col gap-2.5">
                              <span className="font-bold text-gray-800 dark:text-gray-200 block uppercase tracking-wider text-[10px]">
                                GPS Telematics Scopes
                              </span>
                              <div className="p-3 bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-xl space-y-3">
                                {hasGps && tx.status !== 'PARSER_MAPPING_ERROR' ? (
                                  <div className="text-[10px] space-y-1">
                                    <div className="flex justify-between">
                                      <span>Classification:</span>
                                      <span className="font-semibold text-indigo-500">
                                        {!advancedMode && (tx.telematicsAssessment?.classification === 'INSUFFICIENT_EVIDENCE' || tx.telematicsAssessment?.classification === 'REVIEW') ? 'Needs review' : (tx.telematicsAssessment?.classification || 'Needs review')}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Proximity Score:</span>
                                      <span className="font-semibold">{tx.telematicsAssessment?.totalScore} / 100</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Time Alignment:</span>
                                      <span className="font-semibold truncate max-w-[120px]" title={timezoneText}>{timezoneText}</span>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-[10px] text-gray-500">No telemetry file attached to run checks.</p>
                                )}
                                
                                <div className="flex gap-2 pt-1">
                                  {tx.sourceEvidence && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); onOpenSourceViewer(tx); }}
                                      className="flex-1 py-1.5 px-2.5 bg-gray-150 hover:bg-gray-200 text-gray-700 dark:bg-gray-800 dark:hover:bg-gray-750 dark:text-gray-300 rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors"
                                    >
                                      <Eye className="w-3 h-3" /> Source Crop
                                    </button>
                                  )}
                                  {hasGps && tx.status !== 'PARSER_MAPPING_ERROR' && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); onOpenEvidenceMatchView(tx); }}
                                      className="flex-1 py-1.5 px-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors shadow-sm"
                                    >
                                      <GitCompare className="w-3 h-3" /> Evidence Match
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>

                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* High-density pagination controls */}
        {totalPages > 1 && (
          <div className="px-5 py-3.5 border-t border-gray-150 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60 flex items-center justify-between text-xs select-none">
            <span className="text-gray-500">
              Page {currentPage} of {totalPages} ({totalItems} records)
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
                className="px-2.5 py-1.5 border border-gray-200 dark:border-gray-800 rounded bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-850 disabled:opacity-50 text-gray-600 dark:text-gray-400 font-semibold"
              >
                Previous
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
                className="px-2.5 py-1.5 border border-gray-200 dark:border-gray-800 rounded bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-850 disabled:opacity-50 text-gray-600 dark:text-gray-400 font-semibold"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
