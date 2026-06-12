import React, { useState, useEffect } from 'react';
import PDFPageRenderer from './PDFPageRenderer';
import { type SourceEvidence } from '@/domain/types';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  AlertTriangle,
  FileText,
  Grid,
  Satellite,
  Compass,
  Gauge,
  Clock,
  ExternalLink,
  ChevronRightSquare,
  Search,
} from 'lucide-react';

interface EvidenceMatchViewProps {
  isOpen: boolean;
  onClose: () => void;
  transactionId: string;
  onPrev?: () => void;
  onNext?: () => void;
}

export default function EvidenceMatchView({
  isOpen,
  onClose,
  transactionId,
  onPrev,
  onNext,
}: EvidenceMatchViewProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [excelData, setExcelData] = useState<any>(null);
  const [loadingExcel, setLoadingExcel] = useState(false);
  const [gpsTab, setGpsTab] = useState<'timeline' | 'scoring' | 'points'>('timeline');
  const [selectedGpsPoint, setSelectedGpsPoint] = useState<any>(null);
  const [gpsSearch, setGpsSearch] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    setLoading(true);
    setError(null);
    setExcelData(null);
    setSelectedGpsPoint(null);

    const fetchEvidence = async () => {
      try {
        const res = await fetch(`/api/telematics/evidence?transactionId=${transactionId}`);
        const result = await res.json();
        if (!active) return;
        
        if (result.success) {
          setData(result);
          const ev = result.transaction?.sourceEvidence;
          if (ev && (ev.sourceType === 'DKV_DAILY_XLS' || ev.sourceType === 'DKV_INVOICE_XLS' || ev.sourceType === 'GPS_XLS')) {
            fetchExcelRow(ev);
          }
        } else {
          setError(result.error || 'Failed to load match evidence');
        }
      } catch (err) {
        if (active) setError(String(err));
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchEvidence();

    // Escape listener & scroll lock
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    const prevActiveElement = document.activeElement as HTMLElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      active = false;
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
      if (prevActiveElement && typeof prevActiveElement.focus === 'function') {
        prevActiveElement.focus();
      }
    };
  }, [isOpen, transactionId, onClose]);

  const fetchExcelRow = async (ev: SourceEvidence) => {
    setLoadingExcel(true);
    try {
      const url = `/api/source-preview/excel?fileId=${ev.sourceFileId}&sheetName=${encodeURIComponent(ev.worksheetName || '')}&rowNumber=${ev.rowNumber}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setExcelData(data);
      }
    } catch (err) {
      console.error('Failed to load excel preview:', err);
    } finally {
      setLoadingExcel(false);
    }
  };

  if (!isOpen) return null;

  const isFuelTx = data?.transaction
    ? ['DIESEL', 'GNR', 'RED_DIESEL', 'ADBLUE'].includes(data.transaction.productType)
    : false;

  const fuelFactor = data?.assessment?.factors?.find((f: any) => f.dimension === 'FUEL_LEVEL_MOVEMENT');
  const hasFuelDetails = fuelFactor && fuelFactor.result !== 'SKIP';
  const fuelDetails = fuelFactor?.details;

  const getCellHighlightClass = (header: string): string => {
    const h = String(header || '').toLowerCase();
    if (h.includes('licence') || h.includes('plate') || h.includes('registration')) {
      return 'bg-purple-100 dark:bg-purple-950/40 text-purple-900 dark:text-purple-300 font-semibold';
    }
    if (h.includes('date') || h.includes('time')) {
      return 'bg-blue-100 dark:bg-blue-950/40 text-blue-900 dark:text-blue-300';
    }
    if (h.includes('quantity') || h.includes('qty') || h.includes('volume')) {
      return 'bg-amber-100 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 font-semibold';
    }
    if (h.includes('net') || h.includes('amount')) {
      return 'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-300 font-semibold';
    }
    return '';
  };

  // Find Gaps in GPS Points
  const getGpsGaps = () => {
    if (!data?.pointsInWindow || data.pointsInWindow.length < 2) return [];
    const gaps: Array<{ p1: any; p2: any; gapMin: number }> = [];
    for (let i = 0; i < data.pointsInWindow.length - 1; i++) {
      const p1 = data.pointsInWindow[i];
      const p2 = data.pointsInWindow[i + 1];
      const diffMs = new Date(p2.timestamp).getTime() - new Date(p1.timestamp).getTime();
      const diffMin = Math.round(diffMs / 60000);
      if (diffMin >= 30) {
        gaps.push({ p1, p2, gapMin: diffMin });
      }
    }
    return gaps;
  };

  const gpsGaps = getGpsGaps();

  // Search filtered points in window
  const getFilteredPoints = () => {
    if (!data?.pointsInWindow) return [];
    if (!gpsSearch) return data.pointsInWindow;
    return data.pointsInWindow.filter((p: any) =>
      p.locationAddress?.toLowerCase().includes(gpsSearch.toLowerCase()) ||
      p.timestamp?.includes(gpsSearch)
    );
  };

  const filteredPoints = getFilteredPoints();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 dark:bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      
      {/* Evidence Match Dashboard Panel */}
      <div className="w-[98%] max-w-[1380px] h-[95vh] bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Header toolbar */}
        <div className="px-6 py-3.5 border-b border-gray-150 dark:border-gray-850 flex items-center justify-between bg-gray-50/50 dark:bg-gray-850/50">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400 animate-pulse" />
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Evidence Match View
              </h3>
              <p className="text-[10px] text-gray-500">
                Auditor tool: overlap check between Invoice / Spreadsheet evidence and GPS Telematics
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Timeline overview strip */}
            {data && (
              <div className="hidden lg:flex items-center gap-2 bg-slate-105 dark:bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-200/50 dark:border-gray-700 text-[10px] font-mono select-none">
                <span className="text-gray-400">GPS Before</span>
                <ChevronRightSquare className="w-3.5 h-3.5 text-gray-300" />
                <span className="text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded">
                  Invoice Transaction (
                  {data.transaction?.registration || '—'} @{' '}
                  {data.transaction?.transactionTimestamp ? new Date(data.transaction.transactionTimestamp).toLocaleTimeString() : 'N/A'}
                  )
                </span>
                <ChevronRightSquare className="w-3.5 h-3.5 text-gray-300" />
                <span className="text-gray-400">GPS After</span>
              </div>
            )}

            {/* Navigation buttons */}
            {onPrev && onNext && (
              <div className="flex items-center gap-1 bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-lg p-0.5">
                <button
                  onClick={onPrev}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 rounded transition-colors"
                  title="Previous transaction"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[10px] font-bold text-gray-500 px-2.5">
                  Next/Prev Transaction
                </span>
                <button
                  onClick={onNext}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 rounded transition-colors"
                  title="Next transaction"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-xl transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content body split into 3 columns */}
        <div className="flex-1 flex overflow-hidden bg-gray-50 dark:bg-gray-950">
          
          {loading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-xs text-gray-500 font-medium">Reconciling evidence match records...</span>
            </div>
          )}

          {error && (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <AlertTriangle className="w-12 h-12 text-rose-500 mb-2" />
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Reconciliation evidence missing</p>
              <p className="text-xs text-gray-500 max-w-md mt-1">{error}</p>
            </div>
          )}

          {!loading && !error && data && (
            <div className="flex-1 grid grid-cols-1 xl:grid-cols-3 divide-x divide-gray-200 dark:divide-gray-800 overflow-hidden">
              
              {/* PANE 1: Invoice / Transaction Source */}
              <div className="flex flex-col bg-white dark:bg-gray-900 overflow-y-auto p-5 gap-4">
                <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-2.5">
                  <div className="p-1.5 bg-rose-50 dark:bg-rose-950/20 text-rose-500 rounded">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider block">
                      Pane 1 — Source Document Evidence
                    </span>
                    <span className="text-[10px] text-gray-400 block truncate max-w-[280px]">
                      File: {data.transaction?.sourceEvidence?.sourceFileName || 'N/A'}
                    </span>
                  </div>
                </div>

                {data.transaction?.sourceEvidence ? (
                  <div className="flex flex-col gap-3">
                    {data.transaction.sourceEvidence.sourceType === 'AS24_PDF' ||
                    data.transaction.sourceEvidence.sourceType === 'DKV_PDF' ? (
                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-[10px] text-gray-400">
                          <span>Page {data.transaction.sourceEvidence.pageNumber}</span>
                          <span className="text-indigo-500 font-medium">Original Page Crop</span>
                        </div>
                        {data.transaction.sourceEvidence.boundingBox ? (
                          <div className="w-full bg-gray-50 dark:bg-gray-950/40 rounded border border-gray-100 dark:border-gray-850 overflow-hidden">
                            <PDFPageRenderer
                              fileId={data.transaction.sourceEvidence.sourceFileId}
                              pageNumber={data.transaction.sourceEvidence.pageNumber}
                              boundingBox={data.transaction.sourceEvidence.boundingBox}
                              crop={true}
                              scale={1.4}
                              className="max-h-[160px]"
                            />
                          </div>
                        ) : (
                          <div className="p-3 bg-amber-50 dark:bg-amber-950/15 border border-amber-100 dark:border-amber-900/40 rounded text-[10px] text-amber-700 dark:text-amber-400 flex items-start gap-1">
                            <AlertTriangle className="w-3.5 shrink-0 mt-0.5" />
                            <span>Exact row highlight unavailable — showing source page and extracted text block.</span>
                          </div>
                        )}
                        <div className="bg-gray-50 dark:bg-gray-855 p-3 rounded-lg border border-gray-105 dark:border-gray-800/50">
                          <span className="text-[10px] text-gray-400 block font-semibold mb-1 uppercase tracking-wider">Raw Text Line:</span>
                          <p className="text-[10px] font-mono text-gray-700 dark:text-gray-300 leading-relaxed max-h-[100px] overflow-y-auto">
                            {data.transaction.sourceEvidence.rawText || 'No raw text extract'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-[10px] text-gray-400">
                          <span>Sheet: {data.transaction.sourceEvidence.worksheetName} • Row {data.transaction.sourceEvidence.rowNumber}</span>
                          <span className="text-emerald-500 font-medium">Spreadsheet Row Preview</span>
                        </div>

                        {loadingExcel && (
                          <div className="h-[100px] flex items-center justify-center bg-gray-55 dark:bg-gray-950/30 rounded border border-gray-100 dark:border-gray-800">
                            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                          </div>
                        )}

                        {!loadingExcel && excelData && (
                          <div className="overflow-x-auto border border-gray-150 dark:border-gray-800 rounded bg-gray-50 dark:bg-gray-950/40">
                            <table className="w-full text-left border-collapse text-[10px]">
                              <thead>
                                <tr className="bg-gray-100 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700/80 text-gray-600 dark:text-gray-400 font-medium">
                                  <th className="px-2 py-1 border-r border-gray-200 dark:border-gray-700">Row</th>
                                  {excelData.headerRow.map((col: string, idx: number) => (
                                    <th key={idx} className="px-2 py-1 border-r border-gray-200 dark:border-gray-700 font-medium max-w-[100px] truncate">
                                      {col}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {excelData.contextRows.map((contextRow: any) => {
                                  const isTarget = contextRow.rowIndex === data.transaction.sourceEvidence.rowNumber;
                                  return (
                                    <tr
                                      key={contextRow.rowIndex}
                                      className={`border-b border-gray-200/50 dark:border-gray-850 ${
                                        isTarget ? 'bg-amber-50/70 dark:bg-amber-950/20 font-medium' : 'text-gray-500'
                                      }`}
                                    >
                                      <td className="px-2 py-1 border-r border-gray-200 dark:border-gray-700 bg-gray-100/50 dark:bg-gray-800/40 text-center font-bold">
                                        {contextRow.rowIndex}
                                      </td>
                                      {excelData.headerRow.map((header: string, colIdx: number) => {
                                        const cellVal = contextRow.cells[colIdx];
                                        const hlClass = isTarget ? getCellHighlightClass(header) : '';
                                        return (
                                          <td
                                            key={colIdx}
                                            className={`px-2 py-1 border-r border-gray-200/50 dark:border-gray-800 max-w-[120px] truncate ${hlClass}`}
                                            title={cellVal ? String(cellVal) : ''}
                                          >
                                            {cellVal !== undefined && cellVal !== null ? String(cellVal) : ''}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Source Metadata grid */}
                    <div className="flex flex-col gap-2.5 mt-3">
                      <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300">
                        Source Fields Extracted
                      </span>
                      <div className="flex flex-col border border-gray-105 dark:border-gray-800 rounded-xl overflow-hidden font-mono text-[10px] bg-gray-50/30 dark:bg-gray-900/30">
                        {Object.entries(data.transaction.sourceEvidence.extractedFields)
                          .filter(([_, v]) => v !== undefined && v !== null && String(v).trim() !== '')
                          .map(([k, v]) => (
                            <div key={k} className="flex justify-between px-3 py-1.5 border-b border-gray-100 dark:border-gray-850">
                              <span className="text-gray-450 capitalize">{k.replace(/([A-Z])/g, ' $1')}:</span>
                              <span className="text-gray-800 dark:text-gray-200 font-semibold truncate max-w-[160px]" title={String(v)}>
                                {String(v)}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-6 text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-850 rounded-xl">
                    No source document coordinate details found on this batch row.
                  </div>
                )}
              </div>

              {/* PANE 2: Normalised Transaction */}
              <div className="flex flex-col bg-white dark:bg-gray-900 overflow-y-auto p-5 gap-4">
                <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-2.5">
                  <div className="p-1.5 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-505 rounded">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider block">
                      Pane 2 — Normalised Fields
                    </span>
                    <span className="text-[10px] text-gray-400 block">
                      Provider: {data.transaction?.provider || 'N/A'} • Status: {data.transaction?.status || 'OK'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  {/* Detailed Arithmetic comparison */}
                  {data.transaction && (
                    <div className="p-4 bg-indigo-50/20 dark:bg-indigo-950/10 border border-indigo-100/50 dark:border-indigo-900/30 rounded-xl">
                      <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-400 block mb-2">
                        Financial Arithmetic Audit
                      </span>
                      
                      <div className="flex flex-col gap-1.5 font-mono text-[10px] text-gray-650 dark:text-gray-400">
                        <div className="flex justify-between py-0.5 border-b border-gray-150/40 dark:border-gray-850">
                          <span>Base Value Net:</span>
                          <span className="text-gray-800 dark:text-gray-200">€{parseFloat(data.transaction.baseValueNet || '0').toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between py-0.5 border-b border-gray-150/40 dark:border-gray-850">
                          <span>Service Fee Net:</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">+ €{parseFloat(data.transaction.serviceFeeNet || '0').toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between py-0.5 border-b border-gray-150/40 dark:border-gray-850">
                          <span>Discount Net:</span>
                          <span className={`${parseFloat(data.transaction.discountNet || '0') <= 0 ? 'text-green-600 dark:text-green-400 font-bold' : 'text-gray-800'}`}>
                            {parseFloat(data.transaction.discountNet || '0') <= 0 ? '-' : '+'} €{Math.abs(parseFloat(data.transaction.discountNet || '0')).toFixed(2)}
                          </span>
                        </div>
                        
                        <div className="flex justify-between py-1 border-b border-dashed border-gray-255 dark:border-gray-800 text-gray-800 dark:text-white font-semibold">
                          <span>Total Net Value:</span>
                          <span>€{parseFloat(data.transaction.valueOfPurchaseNet || '0').toFixed(2)}</span>
                        </div>
                        
                        <div className="flex justify-between py-0.5 border-b border-gray-150/40 dark:border-gray-850">
                          <span>VAT Amount:</span>
                          <span className="text-gray-850 dark:text-gray-250">+ €{parseFloat(data.transaction.vat || '0').toFixed(2)}</span>
                        </div>
                        
                        <div className="flex justify-between py-1 bg-indigo-50 dark:bg-indigo-950/20 px-2 rounded text-gray-850 dark:text-white font-bold text-xs">
                          <span>Total Gross:</span>
                          <span>€{parseFloat(data.transaction.valueInPayCurrency || '0').toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Normalised canonical key values */}
                  <div className="flex flex-col gap-2.5">
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      Canonical Fields
                    </span>
                    <div className="flex flex-col border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden font-mono text-[10px] bg-gray-50/20 dark:bg-gray-900/10">
                      {[
                        { label: 'Vehicle Registration', val: data.transaction?.registration || data.transaction?.vehicleRegistration },
                        { label: 'Canonical Registration', val: data.transaction?.registration?.replace(/\s+/g, '')?.toUpperCase() },
                        { label: 'Card Number', val: data.transaction?.cardNumber },
                        { label: 'Transaction Timestamp', val: data.transaction?.transactionTimestamp || data.transaction?.transactionDateTime },
                        { label: 'Forecourt Name', val: data.transaction?.stationName || data.transaction?.forecourtName },
                        { label: 'Forecourt City', val: data.transaction?.stationCity },
                        { label: 'Service Country', val: data.transaction?.serviceCountry },
                        { label: 'Product Name', val: data.transaction?.productName },
                        { label: 'Product Type', val: data.transaction?.productType },
                        { label: 'Quantity', val: `${parseFloat(data.transaction?.quantity || data.transaction?.volume || '0').toFixed(2)} ${data.transaction?.unit || data.transaction?.volumeUnit || 'L'}` },
                        { label: 'Odometer Reading', val: `${data.transaction?.mileage || data.transaction?.mileageKm || '0'} km` },
                      ].map(({ label, val }) => (
                        <div key={label} className="flex justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-850">
                          <span className="text-gray-450 select-none">{label}:</span>
                          <span className="text-gray-900 dark:text-gray-200 font-bold truncate max-w-[160px]" title={val}>
                            {val || '--'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              </div>

              {/* PANE 3: GPS Evidence (Interactive version) */}
              <div className="flex flex-col bg-white dark:bg-gray-900 overflow-y-auto p-5 gap-4">
                <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-2.5">
                  <div className="p-1.5 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-505 rounded">
                    <Satellite className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider block">
                      Pane 3 — GPS Evidence
                    </span>
                    <span className="text-[10px] text-gray-400 block">
                      Telemetry Timeline Explorer & Audit Log
                    </span>
                  </div>
                </div>

                {/* Sub-tabs for GPS Explorer */}
                <div className="flex bg-gray-50 dark:bg-gray-800 rounded-lg p-0.5 text-[10px] font-semibold">
                  <button
                    onClick={() => setGpsTab('timeline')}
                    className={`flex-1 py-1 text-center rounded-md transition-all ${
                      gpsTab === 'timeline'
                        ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Standstills
                  </button>
                  <button
                    onClick={() => setGpsTab('points')}
                    className={`flex-1 py-1 text-center rounded-md transition-all ${
                      gpsTab === 'points'
                        ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Points Window ({filteredPoints.length})
                  </button>
                  <button
                    onClick={() => setGpsTab('scoring')}
                    className={`flex-1 py-1 text-center rounded-md transition-all ${
                      gpsTab === 'scoring'
                        ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Scoring Logic
                  </button>
                </div>

                <div className="flex flex-col gap-3">

                  {gpsTab === 'timeline' && (
                    <div className="space-y-3">
                      <div className="p-4 bg-gray-50 dark:bg-gray-850 border border-gray-100 dark:border-gray-800 rounded-xl space-y-3">
                        <span className="font-semibold text-gray-850 dark:text-gray-200 flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-indigo-505" />
                          GPS Standstill Timeline
                        </span>

                        <div className="space-y-3 relative border-l border-indigo-150 dark:border-indigo-950 ml-2 pl-4 py-1">
                          {/* Closest Before Point */}
                          {data.beforePoint ? (
                            <div className="relative cursor-pointer hover:bg-gray-100/50 p-1 rounded" onClick={() => setSelectedGpsPoint(data.beforePoint)}>
                              <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-slate-700 border-2 border-white dark:border-gray-900" />
                              <div className="text-[10px] text-gray-500 dark:text-gray-400">
                                <span className="font-semibold text-gray-700 dark:text-gray-300 block">
                                  Closest Point Before
                                </span>
                                <span className="block mt-0.5">
                                  Time: {new Date(data.beforePoint.timestamp).toLocaleString()} (
                                  {Math.round(Math.abs(new Date(data.beforePoint.timestamp).getTime() - new Date(data.transaction.transactionTimestamp).getTime()) / 60000)}m before)
                                </span>
                                <span className="flex items-center gap-2 mt-1 font-mono">
                                  <span>Gauge: {data.beforePoint.speedKmh} km/h</span>
                                  <span>Odometer: {data.beforePoint.odometerKm} km</span>
                                  {data.beforePoint.fuelLevelPercent !== null && (
                                    <span>Fuel: {Math.round(data.beforePoint.fuelLevelPercent)}%</span>
                                  )}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-[10px] text-gray-400">No telemetry point before transaction.</div>
                          )}

                          {/* Transaction Time marker */}
                          <div className="relative border-y border-dashed border-indigo-200 dark:border-indigo-900/60 py-2 my-2 bg-indigo-50/20 dark:bg-indigo-950/10 px-2 rounded">
                            <div className="absolute -left-[27px] top-1/2 -translate-y-1/2 p-1 bg-indigo-500 rounded-full text-white">
                              <Clock className="w-3.5 h-3.5" />
                            </div>
                            <div className="text-[10px] text-indigo-750 dark:text-indigo-400 font-semibold">
                              <span>Invoiced Transaction time</span>
                              <span className="block text-[11px] font-mono text-gray-800 dark:text-gray-200 mt-0.5">
                                {new Date(data.transaction.transactionTimestamp || data.transaction.transactionDateTime).toLocaleString()}
                              </span>
                            </div>
                          </div>

                          {/* Closest After Point */}
                          {data.afterPoint ? (
                            <div className="relative cursor-pointer hover:bg-gray-100/50 p-1 rounded" onClick={() => setSelectedGpsPoint(data.afterPoint)}>
                              <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-slate-700 border-2 border-white dark:border-gray-900" />
                              <div className="text-[10px] text-gray-500 dark:text-gray-400">
                                <span className="font-semibold text-gray-700 dark:text-gray-300 block">
                                  Closest Point After
                                </span>
                                <span className="block mt-0.5">
                                  Time: {new Date(data.afterPoint.timestamp).toLocaleString()} (
                                  {Math.round(Math.abs(new Date(data.afterPoint.timestamp).getTime() - new Date(data.transaction.transactionTimestamp).getTime()) / 60000)}m after)
                                </span>
                                <span className="flex items-center gap-2 mt-1 font-mono">
                                  <span>Gauge: {data.afterPoint.speedKmh} km/h</span>
                                  <span>Odometer: {data.afterPoint.odometerKm} km</span>
                                  {data.afterPoint.fuelLevelPercent !== null && (
                                    <span>Fuel: {Math.round(data.afterPoint.fuelLevelPercent)}%</span>
                                  )}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-[10px] text-gray-400">No telemetry point after transaction.</div>
                          )}
                        </div>
                      </div>

                      {/* Fuel level movements (if applicable) */}
                      {isFuelTx && hasFuelDetails && fuelDetails && (
                        <div className="p-4 bg-gray-50 dark:bg-gray-850 border border-gray-105 dark:border-gray-800 rounded-xl">
                          <span className="font-semibold text-gray-800 dark:text-gray-200 block mb-2.5">
                            Fuel Level Movement Audit
                          </span>
                          
                          <div className="grid grid-cols-2 gap-4 text-center text-xs">
                            <div className="bg-white dark:bg-gray-900 p-2 rounded border border-gray-200/50 dark:border-gray-800 font-mono">
                              <span className="text-[9px] text-gray-400 block uppercase">Fuel Before</span>
                              <span className="text-sm font-extrabold text-gray-805 dark:text-white">
                                {Math.round(fuelDetails.fuelBeforePercent || 0)}%
                              </span>
                              <span className="block text-[8px] text-gray-400">~{Math.round(((fuelDetails.fuelBeforePercent || 0)/100)*1200)}L</span>
                            </div>
                            <div className="bg-white dark:bg-gray-900 p-2 rounded border border-gray-200/50 dark:border-gray-800 font-mono">
                              <span className="text-[9px] text-gray-400 block uppercase">Fuel After</span>
                              <span className="text-sm font-extrabold text-gray-805 dark:text-white">
                                {Math.round(fuelDetails.fuelAfterPercent || 0)}%
                              </span>
                              <span className="block text-[8px] text-gray-400">~{Math.round(((fuelDetails.fuelAfterPercent || 0)/100)*1200)}L</span>
                            </div>
                          </div>

                          <div className="mt-3 text-[10px] text-gray-650 dark:text-gray-400 space-y-1 bg-white dark:bg-gray-900 p-2.5 rounded border border-gray-200/55 dark:border-gray-800 font-mono">
                            <div className="flex justify-between py-0.5">
                              <span>Observed Increase:</span>
                              <span className="font-semibold">+{Math.round(fuelDetails.observedIncreasePercent || 0)}% (~{Math.round(((fuelDetails.observedIncreasePercent || 0)/100)*1200)}L)</span>
                            </div>
                            <div className="flex justify-between py-0.5">
                              <span>Expected Increase:</span>
                              <span className="font-semibold">+{Math.round((parseFloat(data.transaction.quantity || '0') / 1200) * 100)}% ({parseFloat(data.transaction.quantity || '0').toFixed(1)}L)</span>
                            </div>
                            <div className="flex justify-between py-0.5">
                              <span>Tank Capacity:</span>
                              <span>1,200 L Standard</span>
                            </div>
                            {fuelDetails.sensorCeilingStatus === 'Capped' && (
                              <div className="mt-2 text-[9px] text-amber-500 bg-amber-500/10 p-1.5 rounded">
                                Sensor limit reached (100% capacity limit warning).
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Telemetry coverage gaps warning */}
                      {gpsGaps.length > 0 && (
                        <div className="p-3 bg-rose-50 dark:bg-rose-950/10 border border-rose-150/40 rounded-lg space-y-1.5 text-[10px]">
                          <span className="font-bold text-rose-700 dark:text-rose-400 flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            GPS Coverage Gap Warning ({gpsGaps.length})
                          </span>
                          <p className="text-rose-600 dark:text-rose-450 leading-normal">
                            Telemetry standstills contain a gap of over 30 minutes:
                          </p>
                          <ul className="list-disc pl-4 text-rose-500 flex flex-col gap-0.5 font-mono">
                            {gpsGaps.map((g, idx) => (
                              <li key={idx}>Gap: {g.gapMin} minutes (Time range: {new Date(g.p1.timestamp).toLocaleTimeString()} - {new Date(g.p2.timestamp).toLocaleTimeString()})</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {gpsTab === 'points' && (
                    <div className="space-y-3">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Search GPS timeline..."
                          value={gpsSearch}
                          onChange={(e) => setGpsSearch(e.target.value)}
                          className="w-full text-xs pl-8 pr-2 py-1 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-lg focus:outline-none"
                        />
                      </div>

                      <div className="max-h-[260px] overflow-y-auto border border-gray-150 dark:border-gray-800 rounded-xl divide-y divide-gray-100 dark:divide-gray-850">
                        {filteredPoints.length === 0 ? (
                          <div className="p-4 text-center text-gray-400 text-[10px]">No timeline points match search.</div>
                        ) : (
                          filteredPoints.map((pt: any, idx: number) => {
                            const isSelected = selectedGpsPoint?.id === pt.id;
                            const ptDate = new Date(pt.timestamp);
                            return (
                              <div
                                key={pt.id || idx}
                                onClick={() => setSelectedGpsPoint(pt)}
                                className={`p-2 cursor-pointer transition text-[10px] flex justify-between items-center ${
                                  isSelected ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-650' : 'hover:bg-gray-50/50'
                                }`}
                              >
                                <div>
                                  <span className="font-mono block font-semibold">
                                    {ptDate.toLocaleTimeString()} ({ptDate.toLocaleDateString()})
                                  </span>
                                  <span className="text-[9px] text-gray-400 block truncate max-w-[180px]">{pt.locationAddress || `${pt.latitude}, ${pt.longitude}`}</span>
                                </div>
                                <div className="text-right text-[9px] font-mono">
                                  <span className="block">{pt.speedKmh} km/h</span>
                                  {pt.fuelLevelPercent !== null && <span className="block text-emerald-500 font-semibold">{Math.round(pt.fuelLevelPercent)}% fuel</span>}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Display Selected Point Detailed Pane */}
                      {selectedGpsPoint && (
                        <div className="p-3 bg-indigo-50/30 dark:bg-indigo-950/20 border border-indigo-150/40 rounded-xl space-y-1.5 font-mono text-[9px]">
                          <span className="font-bold text-[10px] text-indigo-700 dark:text-indigo-400 block font-sans">GPS Node Inspector</span>
                          <div className="flex justify-between py-0.5 border-b border-gray-100 dark:border-gray-800">
                            <span>Timestamp (UTC):</span>
                            <span>{selectedGpsPoint.timestamp}</span>
                          </div>
                          <div className="flex justify-between py-0.5 border-b border-gray-100 dark:border-gray-800">
                            <span>Odometer:</span>
                            <span>{selectedGpsPoint.odometerKm} km</span>
                          </div>
                          <div className="flex justify-between py-0.5 border-b border-gray-100 dark:border-gray-800">
                            <span>Speed:</span>
                            <span>{selectedGpsPoint.speedKmh} km/h</span>
                          </div>
                          <div className="flex justify-between py-0.5 border-b border-gray-100 dark:border-gray-800">
                            <span>Fuel:</span>
                            <span>{selectedGpsPoint.fuelLevelPercent !== null ? `${Math.round(selectedGpsPoint.fuelLevelPercent)}%` : '—'}</span>
                          </div>
                          <div className="flex justify-between py-0.5 border-b border-gray-100 dark:border-gray-800">
                            <span>Location:</span>
                            <span className="truncate max-w-[160px]" title={selectedGpsPoint.locationAddress}>{selectedGpsPoint.locationAddress || 'N/A'}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {gpsTab === 'scoring' && (
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                        Checks & Rules Applied
                      </span>
                      {data.assessment.factors.map((factor: any) => (
                        <div
                          key={factor.dimension}
                          className={`p-3 rounded-lg border text-[10px] ${
                            factor.result === 'PASS'
                              ? 'bg-green-50/20 border-green-150/40 text-green-800 dark:text-green-400 dark:bg-green-950/10'
                              : factor.result === 'PARTIAL'
                              ? 'bg-amber-50/25 border-amber-150/30 text-amber-800 dark:text-amber-400 dark:bg-amber-950/10'
                              : factor.result === 'SKIP'
                              ? 'bg-gray-50 border-gray-150 text-gray-500 dark:text-gray-400 dark:bg-gray-800/40 dark:border-gray-800/50'
                              : 'bg-rose-50/20 border-rose-150/40 text-rose-800 dark:text-rose-400 dark:bg-rose-950/10'
                          }`}
                        >
                          <div className="flex justify-between font-semibold mb-1">
                            <span className="capitalize">{factor.dimension.replace(/_/g, ' ').toLowerCase()}</span>
                            <span>{factor.awardedPoints} / {factor.maxPoints} pts</span>
                          </div>
                          <p className="opacity-90">{factor.explanation}</p>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
}
