import React, { useState, useEffect, useRef } from 'react';
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
  CheckCircle,
  HelpCircle,
  XCircle,
  Maximize2,
  Minimize2,
  Volume2,
  Calendar,
  MapPin,
  Flame,
  Settings,
  Check,
  Flag,
  PenTool,
  Info
} from 'lucide-react';

interface EvidenceMatchViewProps {
  isOpen: boolean;
  onClose: () => void;
  transactionId: string;
  onPrev?: () => void;
  onNext?: () => void;
  advancedMode?: boolean;
}

export default function EvidenceMatchView({
  isOpen,
  onClose,
  transactionId,
  onPrev,
  onNext,
  advancedMode = false,
}: EvidenceMatchViewProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [excelData, setExcelData] = useState<any>(null);
  const [loadingExcel, setLoadingExcel] = useState(false);
  const [gpsSearch, setGpsSearch] = useState('');
  
  // Interactive PDF scale and GPS config
  const [zoomScale, setZoomScale] = useState(1.0);
  const [timeWindowMinutes, setTimeWindowMinutes] = useState<number>(30);
  const [showFullGpsSource, setShowFullGpsSource] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [reviewerNote, setReviewerNote] = useState('');
  const [manualStatus, setManualStatus] = useState<string | null>(null);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  const pdfRendererRef = useRef<any>(null);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    setLoading(true);
    setError(null);
    setExcelData(null);
    setReviewerNote('');
    setManualStatus(null);
    setActionMessage(null);

    const fetchEvidence = async () => {
      try {
        const res = await fetch(`/api/telematics/evidence?transactionId=${transactionId}&windowMinutes=${timeWindowMinutes}`);
        const result = await res.json();
        if (!active) return;
        
        if (result.success) {
          setData(result);
          // Sync existing note and manual classification override if present
          if (result.transaction) {
            setReviewerNote(result.transaction.reviewerNote || '');
            setManualStatus(result.transaction.telematicsOverrideStatus || null);
          }
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
  }, [isOpen, transactionId, timeWindowMinutes, onClose]);

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

  const handleUpdateStatus = async (status: string) => {
    if (status === 'overridden' && !reviewerNote.trim()) {
      setActionMessage('Manual reviewer note required for override.');
      return;
    }

    try {
      const res = await fetch(`/api/transactions/${transactionId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telematicsOverrideStatus: status,
          reviewerNote: reviewerNote
        })
      });
      const resData = await res.json();
      if (resData.success) {
        setManualStatus(status);
        setActionMessage(`Status updated to: ${status}`);
        setTimeout(() => setActionMessage(null), 3000);
      } else {
        setActionMessage(resData.error || 'Failed to update transaction status');
      }
    } catch (err) {
      setActionMessage('Network error updating status');
    }
  };

  if (!isOpen) return null;

  const tx = data?.transaction;
  const assessment = data?.assessment;
  const station = data?.station;
  const beforePoint = data?.beforePoint;
  const afterPoint = data?.afterPoint;

  const isFuelTx = tx ? ['DIESEL', 'GNR', 'RED_DIESEL', 'ADBLUE'].includes(tx.productType) : false;
  const isAdBlue = tx?.productType === 'ADBLUE';
  const isService = tx ? ['PARKING', 'TOLL', 'WASH', 'SERVICE_FEE', 'PASSANGO'].includes(tx.productType) : false;

  const fuelFactor = assessment?.factors?.find((f: any) => f.dimension === 'FUEL_LEVEL_MOVEMENT');
  const hasFuelDetails = fuelFactor && fuelFactor.result !== 'SKIP';
  const fuelDetails = fuelFactor?.details;

  // Filtered points inside window
  const getFilteredPoints = () => {
    if (!data?.pointsInWindow) return [];
    
    // Sort points by distance to tx time for displaying window first
    const txTime = new Date(tx?.transactionTimestamp || tx?.transactionDateTime).getTime();
    let pts = [...data.pointsInWindow];
    
    if (gpsSearch) {
      pts = pts.filter((p: any) =>
        (p.locationAddress || '').toLowerCase().includes(gpsSearch.toLowerCase()) ||
        (p.timestamp || '').includes(gpsSearch)
      );
    }
    return pts;
  };

  const filteredPoints = getFilteredPoints();

  // Nearest point computation (at or closest to transaction time)
  const getNearestPoint = () => {
    if (!data?.pointsInWindow || data.pointsInWindow.length === 0) return null;
    const txTime = new Date(tx?.transactionTimestamp || tx?.transactionDateTime).getTime();
    let nearest = null;
    let minDiff = Infinity;
    for (const pt of data.pointsInWindow) {
      const diff = Math.abs(new Date(pt.timestamp).getTime() - txTime);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = pt;
      }
    }
    return { point: nearest, diffMinutes: Math.round(minDiff / 60000) };
  };

  const nearestInfo = getNearestPoint();

  const getGpsStatusText = (classification: string) => {
    if (advancedMode) return classification || 'NO GPS';
    const cl = String(classification || '').toUpperCase();
    if (cl === 'VERIFIED') return 'Verified';
    if (cl === 'LIKELY') return 'Likely';
    if (cl === 'REVIEW' || cl === 'INSUFFICIENT_EVIDENCE') return 'Needs review';
    if (cl === 'UNLIKELY') return 'Unlikely';
    return 'No GPS';
  };

  const getGpsPlainEnglishSummary = () => {
    if (!nearestInfo?.point) {
      return {
        title: "No GPS evidence found for this transaction",
        desc: `No GPS telemetry logs were found covering this vehicle's registration (${tx?.registration || 'N/A'}) near the transaction timestamp.`,
        reasons: [
          "No GPS file uploaded for this vehicle",
          "GPS file does not cover this date range",
          "Vehicle registration differs between invoice and GPS",
          "Timezone/date format may need review"
        ],
        actions: ["Upload GPS file", "Check vehicle registration mapping", "Mark for manual review"]
      };
    }

    const diffStr = nearestInfo.diffMinutes === 0
      ? 'at the exact same time'
      : `${nearestInfo.diffMinutes} minutes ${new Date(nearestInfo.point.timestamp).getTime() < new Date(tx.transactionTimestamp).getTime() ? 'before' : 'after'} invoice time`;

    const loc = nearestInfo.point.locationAddress || `${nearestInfo.point.latitude}, ${nearestInfo.point.longitude}`;
    const cl = assessment?.classification || 'REVIEW';

    if (cl === 'VERIFIED') {
      const fuelBefore = beforePoint?.fuelLevelPercent !== undefined ? Math.round(beforePoint.fuelLevelPercent) : null;
      const fuelAfter = afterPoint?.fuelLevelPercent !== undefined ? Math.round(afterPoint.fuelLevelPercent) : null;
      const fuelDiff = (fuelBefore !== null && fuelAfter !== null) ? (fuelAfter - fuelBefore) : null;

      return {
        title: "GPS supports this transaction",
        desc: `Vehicle was near ${loc} ${diffStr}.` + 
          (fuelDiff && fuelDiff > 0 ? ` Fuel increased from ${fuelBefore}% to ${fuelAfter}% within the review window.` : '')
      };
    }

    if (cl === 'LIKELY') {
      return {
        title: "GPS likely supports this transaction",
        desc: `Vehicle was detected nearby (${loc}) ${diffStr}. Proximity and timestamps align.`
      };
    }

    if (cl === 'UNLIKELY') {
      return {
        title: "GPS conflicts with this transaction",
        desc: `Vehicle was located at ${loc} ${diffStr}, which differs from the invoice location.`
      };
    }

    return {
      title: "GPS evidence requires review",
      desc: `A GPS point was found near the transaction time (${diffStr} at ${loc}), but it could not be fully verified (e.g. speed was too high, or fuel level didn't show a clear change).`
    };
  };

  const getStatusColor = (classification: string) => {
    switch (classification) {
      case 'VERIFIED': return 'text-green-700 bg-green-500/10 dark:text-green-400 dark:bg-green-950/20 border-green-200 dark:border-green-900/50';
      case 'LIKELY': return 'text-indigo-700 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/50';
      case 'REVIEW': return 'text-amber-700 bg-amber-500/10 dark:text-amber-400 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50';
      case 'UNLIKELY': return 'text-rose-700 bg-rose-500/10 dark:text-rose-400 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50';
      default: return 'text-gray-500 bg-gray-100 dark:text-gray-400 dark:bg-gray-800 border-gray-200 dark:border-gray-700';
    }
  };

  const getStatusIcon = (classification: string) => {
    switch (classification) {
      case 'VERIFIED': return <CheckCircle className="w-4 h-4 text-green-500 animate-bounce" />;
      case 'LIKELY': return <CheckCircle className="w-4 h-4 text-indigo-500" />;
      case 'REVIEW': return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'UNLIKELY': return <XCircle className="w-4 h-4 text-rose-500" />;
      default: return <HelpCircle className="w-4 h-4 text-gray-400" />;
    }
  };

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 dark:bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-[98%] max-w-[1440px] h-[96vh] bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Header Toolbar */}
        <div className="px-6 py-3 border-b border-gray-150 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-850/50">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <div>
              <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight">
                {tx ? `Vehicle ${tx.registration || 'N/A'} · ${tx.productName || tx.productType || 'N/A'} · ${parseFloat(tx.quantity || '0').toFixed(2)} L · ${getGpsStatusText(manualStatus || assessment?.classification || 'INSUFFICIENT_EVIDENCE')}` : 'Evidence Match View'}
              </h3>
              <p className="text-[10px] text-gray-500">
                Auditor tool: overlap check between Invoice / Spreadsheet evidence and GPS Telematics
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick transaction navigation */}
            {onPrev && onNext && (
              <div className="flex items-center gap-1 bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-lg p-0.5">
                <button
                  onClick={onPrev}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 rounded transition-colors"
                  title="Previous transaction"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[10px] font-bold text-gray-500 px-2 select-none">
                  Transaction
                </span>
                <button
                  onClick={onNext}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 rounded transition-colors"
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
          <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-950">
            
            {/* 1. Transaction Evidence Header Strip */}
            <div className="bg-white dark:bg-gray-900 border-b border-gray-150 dark:border-gray-800 p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 text-xs shadow-sm">
              <div>
                <span className="text-[10px] text-gray-400 block font-semibold uppercase tracking-wider">Vehicle</span>
                <span className="font-mono font-extrabold text-gray-900 dark:text-white">{tx?.registration || 'N/A'}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block font-semibold uppercase tracking-wider">Invoice Time (Local)</span>
                <span className="font-mono text-gray-800 dark:text-gray-200">
                  {tx?.transactionTimestamp ? new Date(tx.transactionTimestamp).toLocaleString() : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block font-semibold uppercase tracking-wider">Product / Quantity</span>
                <span className="font-semibold text-gray-850 dark:text-gray-150">
                  {tx?.productName || tx?.productType} / {tx?.quantity ? parseFloat(tx.quantity).toFixed(2) : '0'} L
                </span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block font-semibold uppercase tracking-wider">Invoice Station</span>
                <span className="text-gray-800 dark:text-gray-200 font-semibold truncate block" title={tx?.stationName || tx?.stationCity}>
                  {tx?.stationName || tx?.stationCity || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block font-semibold uppercase tracking-wider">GPS Time Window</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <select
                    value={timeWindowMinutes}
                    onChange={(e) => setTimeWindowMinutes(Number(e.target.value))}
                    className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                  >
                    <option value={15}>±15 min</option>
                    <option value={30}>±30 min</option>
                    <option value={60}>±60 min</option>
                    <option value={120}>±2 hours</option>
                  </select>
                </div>
              </div>
              <div className="col-span-2 flex items-center gap-2 border-l border-gray-100 dark:border-gray-800 pl-3">
                <div className={`px-2 py-1 rounded border flex items-center gap-1.5 ${getStatusColor(manualStatus || assessment?.classification || 'INSUFFICIENT_EVIDENCE')}`}>
                  {getStatusIcon(manualStatus || assessment?.classification || 'INSUFFICIENT_EVIDENCE')}
                  <span className="font-extrabold uppercase text-[10px] tracking-wider">
                    {getGpsStatusText(manualStatus || assessment?.classification || 'INSUFFICIENT_EVIDENCE')}
                  </span>
                </div>
                {(advancedMode || showTechnicalDetails) && (
                  <div className="text-[10px] text-gray-500">
                    Score: <span className="font-bold font-mono">{assessment?.totalScore || 0}/100</span>
                  </div>
                )}
              </div>
            </div>

            {/* 2. 50/50 Dual Panel layout */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-200 dark:divide-gray-800 overflow-hidden">
              
              {/* LEFT SIDE: INVOICE / SOURCE PANEL */}
              <div className="flex flex-col bg-white dark:bg-gray-900 overflow-y-auto p-5 gap-4">
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-rose-50 dark:bg-rose-950/20 text-rose-500 rounded">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-wider block">
                        INVOICE SAYS
                      </span>
                      <span className="text-[10px] text-gray-400 block truncate max-w-[280px]">
                        File: {tx?.sourceEvidence?.sourceFileName || 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* Zoom controls for PDF */}
                  {tx?.sourceEvidence && (tx.sourceEvidence.sourceType === 'AS24_PDF' || tx.sourceEvidence.sourceType === 'DKV_PDF') && (
                    <div className="flex items-center gap-1.5 bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded p-0.5 scale-90">
                      <button
                        onClick={() => setZoomScale(z => Math.max(0.5, z - 0.2))}
                        className="p-1 hover:bg-gray-150 dark:hover:bg-gray-800 text-gray-500 rounded text-[9px] font-bold"
                      >
                        Out
                      </button>
                      <span className="text-[9px] font-mono">{Math.round(zoomScale * 100)}%</span>
                      <button
                        onClick={() => setZoomScale(z => Math.min(2.5, z + 0.2))}
                        className="p-1 hover:bg-gray-150 dark:hover:bg-gray-800 text-gray-500 rounded text-[9px] font-bold"
                      >
                        In
                      </button>
                    </div>
                  )}
                </div>

                {tx?.sourceEvidence ? (
                  <div className="flex flex-col gap-4">
                    {/* PDF canvas or Excel row preview */}
                    {tx.sourceEvidence.sourceType === 'AS24_PDF' || tx.sourceEvidence.sourceType === 'DKV_PDF' ? (
                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-[10px] text-gray-400">
                          <span>Page {tx.sourceEvidence.pageNumber}</span>
                          <span className="text-indigo-500 font-medium">Original Page Crop</span>
                        </div>
                        {tx.sourceEvidence.boundingBox ? (
                          <div className="w-full bg-gray-50 dark:bg-gray-950/40 rounded border border-gray-150 dark:border-gray-850 overflow-hidden">
                            <PDFPageRenderer
                              ref={pdfRendererRef}
                              fileId={tx.sourceEvidence.sourceFileId}
                              pageNumber={tx.sourceEvidence.pageNumber}
                              boundingBox={tx.sourceEvidence.boundingBox}
                              crop={true}
                              zoomScale={zoomScale}
                              scale={1.4}
                              className="max-h-[180px]"
                            />
                          </div>
                        ) : (
                          <div className="p-3 bg-amber-50 dark:bg-amber-950/15 border border-amber-100 dark:border-amber-900/40 rounded text-[10px] text-amber-750 dark:text-amber-400 flex items-start gap-1">
                            <AlertTriangle className="w-3.5 shrink-0 mt-0.5" />
                            <span>Exact row highlight unavailable — showing source page and extracted text block.</span>
                          </div>
                        )}
                        <div className="bg-gray-50 dark:bg-gray-850 p-2.5 rounded-lg border border-gray-150 dark:border-gray-800/80">
                          <span className="text-[9px] text-gray-400 block font-semibold mb-1 uppercase tracking-wider">Raw Text Line:</span>
                          <p className="text-[10px] font-mono text-gray-750 dark:text-gray-300 leading-relaxed max-h-[80px] overflow-y-auto">
                            {tx.sourceEvidence.rawText || 'No raw text extract'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-[10px] text-gray-400">
                          <span>Sheet: {tx.sourceEvidence.worksheetName} • Row {tx.sourceEvidence.rowNumber}</span>
                          <span className="text-emerald-500 font-medium">Spreadsheet Row Preview</span>
                        </div>

                        {loadingExcel && (
                          <div className="h-[100px] flex items-center justify-center bg-gray-50 dark:bg-gray-955 rounded border border-gray-100 dark:border-gray-800">
                            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                          </div>
                        )}

                        {!loadingExcel && excelData && (
                          <div className="overflow-x-auto border border-gray-150 dark:border-gray-800 rounded bg-gray-50 dark:bg-gray-950/40">
                            <table className="w-full text-left border-collapse text-[10px]">
                              <thead>
                                <tr className="bg-gray-100 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-750 text-gray-600 dark:text-gray-400 font-medium">
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
                                  const isTarget = contextRow.rowIndex === tx.sourceEvidence.rowNumber;
                                  return (
                                    <tr
                                      key={contextRow.rowIndex}
                                      className={`border-b border-gray-150 dark:border-gray-850 ${
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

                    {/* Leftside extracted parameters lists */}
                    <div className="space-y-2">
                      <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300">
                        Parsed Invoice Properties
                      </span>
                      <div className="grid grid-cols-2 gap-3 text-[10px] font-mono">
                        <div className="bg-gray-50 dark:bg-gray-850 p-2.5 rounded border border-gray-150 dark:border-gray-800">
                          <span className="text-[9px] text-gray-400 block font-semibold">Base Net:</span>
                          <span className="text-gray-800 dark:text-gray-200">€{parseFloat(tx.baseValueNet || '0').toFixed(2)}</span>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-850 p-2.5 rounded border border-gray-150 dark:border-gray-800">
                          <span className="text-[9px] text-gray-400 block font-semibold">Service Fee:</span>
                          <span className="text-gray-800 dark:text-gray-200">€{parseFloat(tx.serviceFeeNet || '0').toFixed(2)}</span>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-850 p-2.5 rounded border border-gray-150 dark:border-gray-800">
                          <span className="text-[9px] text-gray-400 block font-semibold">Discount:</span>
                          <span className="text-gray-800 dark:text-gray-200">€{parseFloat(tx.discountNet || '0').toFixed(2)}</span>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-850 p-2.5 rounded border border-gray-150 dark:border-gray-800">
                          <span className="text-[9px] text-gray-400 block font-semibold">VAT:</span>
                          <span className="text-gray-800 dark:text-gray-200">€{parseFloat(tx.vat || '0').toFixed(2)}</span>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-850 p-2.5 rounded border border-gray-150 dark:border-gray-800 col-span-2 flex justify-between font-sans">
                          <span className="text-gray-500 font-medium">Gross Total charged:</span>
                          <span className="font-extrabold text-gray-900 dark:text-white">€{parseFloat(tx.valueInPayCurrency || '0').toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-6 text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl">
                    No source document details found.
                  </div>
                )}
              </div>

              {/* RIGHT SIDE: GPS / VEHICLE TELEMATICS PANEL */}
              <div className="flex flex-col bg-white dark:bg-gray-900 overflow-y-auto p-5 gap-4">
                
                <div className="flex items-center justify-between border-b border-gray-150 dark:border-gray-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500 rounded">
                      <Satellite className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider block">
                        GPS SAYS
                      </span>
                      <span className="text-[10px] text-gray-400 block">
                        Physical location & fuel levels at transaction timestamp
                      </span>
                    </div>
                  </div>

                  {nearestInfo?.point && (
                    <button
                      onClick={() => setShowFullGpsSource(!showFullGpsSource)}
                      className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold hover:underline bg-indigo-50 dark:bg-indigo-950/30 px-2 py-1 rounded"
                    >
                      {showFullGpsSource ? 'Close Source Rows' : 'Open GPS Source Rows'}
                    </button>
                  )}
                </div>

                {!showFullGpsSource ? (
                  <div className="space-y-4">
                    {/* Plain English GPS Answer Card */}
                    {(() => {
                      const summary = getGpsPlainEnglishSummary();
                      const isNoGps = !nearestInfo?.point;
                      const cl = assessment?.classification || 'REVIEW';
                      return (
                        <div className={`p-4 rounded-xl border ${
                          isNoGps
                            ? 'bg-rose-50 border-rose-250 text-rose-950 dark:bg-rose-950/20 dark:border-rose-900/50 dark:text-rose-200'
                            : (cl === 'VERIFIED' || cl === 'LIKELY')
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-950 dark:bg-emerald-950/20 dark:border-emerald-900/50 dark:text-emerald-200'
                            : 'bg-amber-50 border-amber-200 text-amber-950 dark:bg-amber-950/20 dark:border-amber-900/50 dark:text-amber-200'
                        }`}>
                          <h4 className="font-bold text-xs uppercase tracking-wider mb-1 flex items-center gap-1.5">
                            {summary.title}
                          </h4>
                          <p className="text-[11px] leading-relaxed">{summary.desc}</p>
                          
                          {isNoGps && (
                            <div className="mt-3 text-[10px] space-y-2">
                              <p className="font-semibold">Possible reasons:</p>
                              <ul className="list-disc pl-4 space-y-0.5">
                                {summary.reasons?.map((r, i) => <li key={i}>{r}</li>)}
                              </ul>
                              <p className="font-semibold pt-1">Next actions:</p>
                              <div className="flex gap-2 pt-0.5">
                                <span className="px-2.5 py-1 bg-white dark:bg-gray-850 rounded border border-gray-200 dark:border-gray-850 font-semibold text-gray-700 dark:text-gray-300">Upload GPS</span>
                                <span className="px-2.5 py-1 bg-white dark:bg-gray-850 rounded border border-gray-200 dark:border-gray-850 font-semibold text-gray-700 dark:text-gray-300">Check vehicle mapping</span>
                                <span className="px-2.5 py-1 bg-white dark:bg-gray-850 rounded border border-gray-200 dark:border-gray-850 font-semibold text-gray-700 dark:text-gray-300">Mark for review</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* GPS WINDOW TIMELINE TABLE (Only if GPS point exists) */}
                    {nearestInfo?.point && (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-gray-700 dark:text-gray-300">
                            GPS window around transaction time
                          </span>
                          <div className="relative">
                            <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-gray-450" />
                            <input
                              type="text"
                              placeholder="Filter GPS..."
                              value={gpsSearch}
                              onChange={(e) => setGpsSearch(e.target.value)}
                              className="text-[10px] pl-6 pr-2 py-0.5 border border-gray-200 dark:border-gray-750 bg-gray-50 dark:bg-gray-800 rounded focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="border border-gray-150 dark:border-gray-800 rounded-xl overflow-hidden max-h-[220px] overflow-y-auto">
                          <table className="w-full text-left border-collapse text-[10px]">
                            <thead>
                              <tr className="bg-gray-100 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-750 font-semibold text-gray-500">
                                <th className="px-2 py-1.5 w-16">Relation</th>
                                <th className="px-2 py-1.5">GPS Time</th>
                                <th className="px-2 py-1.5 text-right">Δ min</th>
                                <th className="px-2 py-1.5">Location</th>
                                <th className="px-2 py-1.5 text-right">Fuel %</th>
                                <th className="px-2 py-1.5 text-right">KM</th>
                                <th className="px-2 py-1.5 text-right">Speed</th>
                                <th className="px-2 py-1.5">Activity</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredPoints.length === 0 ? (
                                <tr>
                                  <td colSpan={8} className="text-center p-4 text-gray-400">No GPS rows found in window.</td>
                                </tr>
                              ) : (
                                filteredPoints.map((pt: any, idx: number) => {
                                  const ptTime = new Date(pt.timestamp).getTime();
                                  const txTime = new Date(tx.transactionTimestamp).getTime();
                                  const diffMin = Math.round((ptTime - txTime) / 60000);
                                  const isNearest = nearestInfo?.point?.id === pt.id;
                                  
                                  let relation = 'Window';
                                  if (isNearest) relation = 'Nearest';
                                  else if (diffMin < 0) relation = 'Before';
                                  else if (diffMin > 0) relation = 'After';

                                  return (
                                    <tr
                                      key={pt.id || idx}
                                      className={`border-b border-gray-100 dark:border-gray-850 hover:bg-gray-50 dark:hover:bg-gray-800/40 ${isNearest ? 'bg-indigo-50/50 dark:bg-indigo-950/20 font-semibold' : ''}`}
                                    >
                                      <td className="px-2 py-1.5">
                                        <span className={`px-1 rounded text-[9px] ${isNearest ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-550'}`}>
                                          {relation}
                                        </span>
                                      </td>
                                      <td className="px-2 py-1.5 font-mono">{new Date(pt.timestamp).toLocaleTimeString()}</td>
                                      <td className={`px-2 py-1.5 text-right font-mono ${diffMin < 0 ? 'text-blue-500' : diffMin > 0 ? 'text-amber-500' : 'text-green-500 font-bold'}`}>
                                        {diffMin > 0 ? `+${diffMin}` : diffMin}
                                      </td>
                                      <td className="px-2 py-1.5 truncate max-w-[120px]" title={pt.locationAddress}>{pt.locationAddress || 'N/A'}</td>
                                      <td className="px-2 py-1.5 text-right font-mono font-semibold text-emerald-600">
                                        {pt.fuelLevelPercent !== null ? `${Math.round(pt.fuelLevelPercent)}%` : '—'}
                                      </td>
                                      <td className="px-2 py-1.5 text-right font-mono">{pt.odometerKm ?? '—'}</td>
                                      <td className="px-2 py-1.5 text-right font-mono">{pt.speedKmh ?? '—'}</td>
                                      <td className="px-2 py-1.5 truncate max-w-[80px]" title={pt.activity}>{pt.activity || '—'}</td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* PRODUCT-SPECIFIC ENGINE COMPARISON DETAILS */}
                    {nearestInfo?.point && isFuelTx && (advancedMode || showTechnicalDetails) && (
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-150 dark:border-gray-800 p-4 space-y-2 text-xs">
                        <span className="font-bold block text-[10px] text-slate-500 uppercase tracking-wider">
                          Product-Specific Validation Scope
                        </span>
                        {!isAdBlue ? (
                          <div className="grid grid-cols-2 gap-3 pt-1">
                            <div className="bg-white dark:bg-gray-900 border rounded p-2.5 space-y-1">
                              <span className="text-[9px] text-gray-400 block font-semibold">Expected fuel movement:</span>
                              <span className="font-mono text-indigo-600 dark:text-indigo-400 font-semibold block">
                                +{Math.round((parseFloat(tx.quantity || '0') / 1200) * 100)}%
                              </span>
                              <span className="text-[8px] text-gray-400 block font-sans">For {parseFloat(tx.quantity || '0').toFixed(1)}L fill in 1,200L tank</span>
                            </div>
                            <div className="bg-white dark:bg-gray-900 border rounded p-2.5 space-y-1">
                              <span className="text-[9px] text-gray-400 block font-semibold">Observed fuel movement:</span>
                              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 block">
                                {fuelDetails?.observedIncreasePercent !== undefined ? `+${Math.round(fuelDetails.observedIncreasePercent)}%` : '—'}
                              </span>
                              <span className="text-[8px] text-gray-400 block font-sans">
                                {fuelDetails ? `Stable reading ${Math.round(fuelDetails.fuelBeforePercent)}% → ${Math.round(fuelDetails.fuelAfterPercent)}%` : 'No sensor level data'}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100 rounded text-[10px] flex items-start gap-1.5">
                            <Info className="w-3.5 shrink-0 mt-0.5 text-indigo-500" />
                            <span>
                              <strong>AdBlue product matched:</strong> Diesel tank fuel movement level checks are not enforced for AdBlue fills. Validation is based on location proximity and stop timeline event checks.
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  // FULL GPS SOURCE VIEWER TAB OVERLAY
                  <div className="space-y-3 flex-1 flex flex-col overflow-hidden">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-gray-500">File: {data.assessment?.configSnapshot?.gpsFileName || 'Raw Telemetry source'}</span>
                      <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-mono font-bold text-slate-500">
                        {data.pointsInWindow?.length || 0} Total Records Cached
                      </span>
                    </div>

                    <div className="flex-1 overflow-auto border border-gray-200 dark:border-gray-800 rounded-xl bg-gray-55 dark:bg-gray-950/40">
                      <table className="w-full text-left border-collapse text-[10px] table-fixed">
                        <thead className="sticky top-0 z-20 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-750">
                          <tr className="text-gray-600 font-semibold">
                            <th className="px-2 py-1.5 w-12 text-center">Row</th>
                            <th className="px-2 py-1.5 w-32">Timestamp</th>
                            <th className="px-2 py-1.5">Location Address</th>
                            <th className="px-2 py-1.5 w-16 text-right">Speed</th>
                            <th className="px-2 py-1.5 w-16 text-right">Odometer</th>
                            <th className="px-2 py-1.5 w-14 text-right">Fuel %</th>
                            <th className="px-2 py-1.5 w-24">Activity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.pointsInWindow?.map((pt: any, idx: number) => {
                            const isScored = pt.id === nearestInfo?.point?.id || pt.id === beforePoint?.id || pt.id === afterPoint?.id;
                            return (
                              <tr
                                key={pt.id || idx}
                                className={`border-b border-gray-150 dark:border-gray-850 hover:bg-gray-50 ${isScored ? 'bg-amber-50/65 dark:bg-amber-950/20 font-medium' : 'text-gray-600'}`}
                              >
                                <td className="px-2 py-1.5 text-center font-bold">{idx + 1}</td>
                                <td className="px-2 py-1.5 font-mono">{pt.timestamp}</td>
                                <td className="px-2 py-1.5 truncate" title={pt.locationAddress}>{pt.locationAddress || `${pt.latitude}, ${pt.longitude}`}</td>
                                <td className="px-2 py-1.5 text-right font-mono">{pt.speedKmh} km/h</td>
                                <td className="px-2 py-1.5 text-right font-mono">{pt.odometerKm}</td>
                                <td className="px-2 py-1.5 text-right font-mono">{pt.fuelLevelPercent !== null ? `${Math.round(pt.fuelLevelPercent)}%` : '—'}</td>
                                <td className="px-2 py-1.5 truncate" title={pt.activity}>{pt.activity || '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                  {/* 3. Bottom Audit Decisions & Notes Explanation Bar */}
            <div className="bg-white dark:bg-gray-900 border-t border-gray-150 dark:border-gray-800 p-4 space-y-4 shadow-inner">
              <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="flex-1 text-xs text-gray-650 dark:text-gray-400 space-y-1">
                  <span className="font-extrabold uppercase text-[10px] text-indigo-650 dark:text-indigo-400 block tracking-wider">
                    DECISION: {getGpsStatusText(manualStatus || assessment?.classification || 'INSUFFICIENT_EVIDENCE')}
                  </span>
                  <p className="leading-relaxed text-[11px] font-medium text-gray-800 dark:text-gray-200">
                    {manualStatus
                      ? `Manual Overruled decision status active: ${manualStatus.toUpperCase()}.`
                      : assessment?.factors?.find((f: any) => f.dimension === 'FUEL_LEVEL_MOVEMENT')?.explanation ||
                        'Location proximity verified near transaction time.'}
                  </p>
                </div>

                {/* Status Update / Action panel */}
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                  <div className="flex-1 sm:w-64">
                    <input
                      type="text"
                      placeholder="Enter manual auditor note..."
                      value={reviewerNote}
                      onChange={(e) => setReviewerNote(e.target.value)}
                      className="w-full text-xs px-3 py-1.5 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdateStatus('Validated')}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-sm transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" /> Mark Supported
                    </button>
                    <button
                      onClick={() => handleUpdateStatus('Needs field review')}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-sm transition-colors"
                    >
                      <Flag className="w-3.5 h-3.5" /> Flag Issue
                    </button>
                    <button
                      onClick={() => handleUpdateStatus('overridden')}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-sm transition-colors"
                    >
                      <PenTool className="w-3.5 h-3.5" /> Override with reason
                    </button>
                  </div>
                </div>
              </div>

              {/* Show Technical details toggle */}
              <div className="pt-2 border-t border-gray-100 dark:border-gray-800 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                    className="text-[10px] text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 hover:underline font-bold flex items-center gap-1"
                  >
                    <span>{showTechnicalDetails ? 'Hide technical evidence' : 'Show technical evidence'}</span>
                  </button>
                  {showTechnicalDetails && (
                    <span className="text-[9px] text-gray-400 font-mono">
                      Algorithm Version: v1.4 • Matching Window: {timeWindowMinutes} mins
                    </span>
                  )}
                </div>

                {showTechnicalDetails && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs bg-gray-50 dark:bg-gray-850 p-4 rounded-xl border border-gray-150 dark:border-gray-800 animate-in fade-in duration-200">
                    <div className="space-y-2">
                      <span className="font-bold text-gray-700 dark:text-gray-300 block uppercase tracking-wider text-[10px]">
                        Scoring Breakdown
                      </span>
                      <div className="space-y-1.5 font-mono text-[11px]">
                        <div className="flex justify-between">
                          <span>Proximity Score:</span>
                          <span className="font-bold">{assessment?.totalScore || 0} / 100</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Time Alignment:</span>
                          <span className="font-bold">UTC Timeline</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="font-bold text-gray-700 dark:text-gray-300 block uppercase tracking-wider text-[10px]">
                        Confidence Checks
                      </span>
                      <div className="flex flex-col gap-2">
                        {assessment?.factors?.map((factor: any) => (
                          <div
                            key={factor.dimension}
                            className={`p-2.5 rounded-lg border text-[10px] ${
                              factor.result === 'PASS'
                                ? 'bg-green-50/25 border-green-150/40 text-green-800 dark:text-green-450 dark:bg-green-950/10'
                                : factor.result === 'PARTIAL'
                                ? 'bg-amber-50/25 border-amber-150/30 text-amber-800 dark:text-amber-450 dark:bg-amber-950/10'
                                : factor.result === 'SKIP'
                                ? 'bg-gray-100 border-gray-200 text-gray-500 dark:text-gray-400 dark:bg-gray-800/40 dark:border-gray-800/50'
                                : 'bg-rose-50/25 border-rose-150/40 text-rose-800 dark:text-rose-450 dark:bg-rose-950/10'
                            }`}
                          >
                            <div className="flex justify-between font-semibold mb-1">
                              <span className="capitalize">{factor.dimension.replace(/_/g, ' ').toLowerCase()}</span>
                              <span>{factor.awardedPoints} / {factor.maxPoints} pts</span>
                            </div>
                            <p className="opacity-95">{factor.explanation}</p>
                            <p className="opacity-60 font-mono text-[8px] mt-1">Rule: {factor.rule}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>          </div>
            </div>

            {actionMessage && (
              <div className="px-6 py-2 bg-indigo-50 dark:bg-indigo-950/65 text-indigo-750 dark:text-indigo-300 border-t border-indigo-100 text-center font-bold font-mono text-[10px]">
                {actionMessage}
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
}
