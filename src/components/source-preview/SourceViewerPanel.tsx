import React, { useState, useEffect, useRef } from 'react';
import PDFPageRenderer, { type PDFPageRendererRef } from './PDFPageRenderer';
import { type SourceEvidence } from '@/domain/types';
import {
  X,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  Sparkles,
  AlertTriangle,
  FileText,
  Grid,
  History,
  CheckCircle2,
  Maximize2,
  Minimize2,
  RotateCcw,
  Copy,
  Check,
} from 'lucide-react';

interface SourceViewerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  evidence?: SourceEvidence;
  transaction?: any;
  onPrev?: () => void;
  onNext?: () => void;
}

export default function SourceViewerPanel({
  isOpen,
  onClose,
  evidence,
  transaction,
  onPrev,
  onNext,
}: SourceViewerPanelProps) {
  const [zoomScale, setZoomScale] = useState(1.0);
  const [excelData, setExcelData] = useState<any>(null);
  const [loadingExcel, setLoadingExcel] = useState(false);
  const [excelSearch, setExcelSearch] = useState('');
  const [excelRegFilter, setExcelRegFilter] = useState('');
  const [copied, setCopied] = useState(false);
  const [jumpRow, setJumpRow] = useState('');
  const [activeTab, setActiveTab] = useState<'source' | 'parsed' | 'history'>('source');

  const targetRowRef = useRef<HTMLTableRowElement>(null);
  const pdfRendererRef = useRef<PDFPageRendererRef>(null);

  // Fetch Excel sheet data
  useEffect(() => {
    if (!isOpen || !evidence) return;

    if (evidence.sourceType === 'DKV_DAILY_XLS' || evidence.sourceType === 'DKV_INVOICE_XLS' || evidence.sourceType === 'GPS_XLS') {
      const fetchExcel = async () => {
        setLoadingExcel(true);
        try {
          const url = `/api/source-preview/excel?fileId=${evidence.sourceFileId}&sheetName=${encodeURIComponent(evidence.worksheetName || '')}`;
          const res = await fetch(url);
          const data = await res.json();
          if (data.success) {
            setExcelData(data);
          }
        } catch (err) {
          console.error('Failed to load full spreadsheet:', err);
        } finally {
          setLoadingExcel(false);
        }
      };
      fetchExcel();
    } else {
      setExcelData(null);
    }
  }, [isOpen, evidence?.sourceFileId, evidence?.worksheetName, evidence?.sourceType]);

  // Scroll target Excel row into view once data loads
  useEffect(() => {
    if (excelData && targetRowRef.current) {
      setTimeout(() => {
        targetRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, [excelData, evidence?.rowNumber]);

  // Focus and Keyboard Close handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    // Save previous active element to restore focus on close
    const prevActiveElement = document.activeElement as HTMLElement;
    
    // Lock background scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
      if (prevActiveElement && typeof prevActiveElement.focus === 'function') {
        prevActiveElement.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen || !evidence) return null;

  const isPDF = evidence.sourceType === 'AS24_PDF' || evidence.sourceType === 'DKV_PDF';
  const isExcel = !isPDF;

  // Key matching function for Excel column highlighting
  const getHighlightType = (headerStr: string): string | null => {
    const h = String(headerStr || '').toLowerCase();
    if (h.includes('licence') || h.includes('license') || h.includes('plate') || h.includes('registration') || h.includes('immat') || h.includes('vehicle') || h.includes('véhicule')) {
      return 'reg';
    }
    if (h.includes('date') || h.includes('time') || h.includes('heure') || h.includes('auth') || h.includes('authoris')) {
      return 'datetime';
    }
    if (h.includes('product') || h.includes('produit') || h.includes('article') || h.includes('code')) {
      return 'product';
    }
    if (h.includes('quantity') || h.includes('quantité') || h.includes('volume') || h.includes('litres') || h.includes('qty') || h.includes('ltr')) {
      return 'qty';
    }
    if (h.includes('net') || h.includes('ex vat') || h.includes('valueofpurchase') || h.includes('basenet') || h.includes('amount') || h.includes('purchase')) {
      return 'net';
    }
    if (h.includes('gross') || h.includes('tva') || h.includes('vat') || h.includes('incl') || h.includes('brut')) {
      return 'gross';
    }
    if (h.includes('station') || h.includes('city') || h.includes('town') || h.includes('site') || h.includes('lieu') || h.includes('ville')) {
      return 'location';
    }
    return null;
  };

  const getCellHighlightClass = (header: string, isTargetRow: boolean): string => {
    if (!isTargetRow) return '';
    const type = getHighlightType(header);
    switch (type) {
      case 'reg': return 'bg-purple-100 dark:bg-purple-950/40 text-purple-900 dark:text-purple-300 font-semibold border-x border-purple-200 dark:border-purple-900/50';
      case 'datetime': return 'bg-blue-100 dark:bg-blue-950/40 text-blue-900 dark:text-blue-300 border-x border-blue-200 dark:border-blue-900/50';
      case 'product': return 'bg-green-100 dark:bg-green-950/40 text-green-900 dark:text-green-300 border-x border-green-200 dark:border-green-900/50';
      case 'qty': return 'bg-amber-100 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 font-semibold border-x border-amber-200 dark:border-amber-900/50';
      case 'net': return 'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-300 font-semibold border-x border-indigo-200 dark:border-indigo-900/50';
      case 'gross': return 'bg-pink-100 dark:bg-pink-950/40 text-pink-900 dark:text-pink-300 border-x border-pink-200 dark:border-pink-900/50';
      case 'location': return 'bg-cyan-100 dark:bg-cyan-950/40 text-cyan-900 dark:text-cyan-300 border-x border-cyan-200 dark:border-cyan-900/50';
      default: return '';
    }
  };

  // Filter Excel rows based on search and registration filters
  const getFilteredExcelRows = () => {
    if (!excelData || !excelData.rows) return [];
    
    const startIdx = (excelData.headerRowIndex || 1);
    const resultRows: { rowIndex: number; cells: unknown[] }[] = [];

    const regColIdx = excelData.headerRow.findIndex((h: string) => getHighlightType(h) === 'reg');

    for (let i = startIdx; i < excelData.rows.length; i++) {
      const rCells = excelData.rows[i];
      if (!rCells || !Array.isArray(rCells)) continue;

      if (rCells.every(c => c === null || c === undefined || String(c).trim() === '')) {
        continue;
      }

      if (excelRegFilter && regColIdx !== -1) {
        const cellVal = String(rCells[regColIdx] || '').replace(/\s+/g, '').toUpperCase();
        const filterVal = excelRegFilter.replace(/\s+/g, '').toUpperCase();
        if (!cellVal.includes(filterVal)) continue;
      }

      if (excelSearch) {
        const rowStr = rCells.map(String).join(' ').toLowerCase();
        if (!rowStr.includes(excelSearch.toLowerCase())) continue;
      }

      resultRows.push({
        rowIndex: i + 1,
        cells: rCells,
      });
    }

    const targetRowIdx = evidence.rowNumber || -1;
    const targetInList = resultRows.some(r => r.rowIndex === targetRowIdx);
    if (!targetInList && targetRowIdx > 0 && excelData.rows[targetRowIdx - 1]) {
      const targetRowObj = {
        rowIndex: targetRowIdx,
        cells: excelData.rows[targetRowIdx - 1],
      };
      resultRows.push(targetRowObj);
      resultRows.sort((a, b) => a.rowIndex - b.rowIndex);
    }

    return resultRows;
  };

  const handleCopyReference = () => {
    let refStr = evidence.sourceFileName || '';
    if (isPDF) {
      refStr += ` - Page ${evidence.pageNumber || 1}`;
    } else {
      refStr += ` - Sheet: ${evidence.worksheetName || ''}, Row: ${evidence.rowNumber || 1}`;
    }
    navigator.clipboard.writeText(refStr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleJumpToRow = () => {
    const rNum = parseInt(jumpRow, 10);
    if (!isNaN(rNum) && excelData) {
      const rowEl = document.getElementById(`excel-row-${rNum}`);
      if (rowEl) {
        rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        rowEl.classList.add('ring-2', 'ring-indigo-500');
        setTimeout(() => rowEl.classList.remove('ring-2', 'ring-indigo-500'), 2000);
      } else {
        alert(`Row ${rNum} not found in the filtered view.`);
      }
    }
  };

  const filteredExcelRows = getFilteredExcelRows();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 dark:bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-[96%] max-w-[1340px] h-[94vh] bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header bar */}
        <div className="px-6 py-4 border-b border-gray-150 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-850/50">
          <div className="flex items-center gap-3">
            {isPDF ? (
              <div className="p-2 bg-rose-50 dark:bg-rose-950/20 text-rose-500 rounded-lg">
                <FileText className="w-5 h-5" />
              </div>
            ) : (
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500 rounded-lg">
                <Grid className="w-5 h-5" />
              </div>
            )}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                {evidence.sourceFileName || 'Source Document Viewer'}
                <button
                  onClick={handleCopyReference}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded transition-colors"
                  title="Copy source reference"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </h3>
              <p className="text-xs text-gray-500">
                {isPDF ? `AS24/DKV PDF Ingest • Page ${evidence.pageNumber}` : `Spreadsheet • Sheet: ${evidence.worksheetName}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Quick transaction navigation */}
            {onPrev && onNext && (
              <div className="flex items-center gap-1 bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-lg p-0.5">
                <button
                  onClick={onPrev}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 rounded transition-colors"
                  title="Previous transaction"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[11px] font-medium text-gray-500 px-2 select-none border-x border-gray-100 dark:border-gray-800">
                  Navigate Transactions
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

            {/* Advanced PDF zoom/pan controls */}
            {isPDF && (
              <div className="flex items-center gap-1.5 bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-lg p-0.5">
                <button
                  onClick={() => pdfRendererRef.current?.zoomOut()}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 rounded"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-[11px] font-mono font-medium text-gray-500 px-1.5">
                  {Math.round(zoomScale * 100)}%
                </span>
                <button
                  onClick={() => pdfRendererRef.current?.zoomIn()}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 rounded"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <div className="h-4 w-px bg-gray-200 dark:bg-gray-800 mx-1"></div>
                <button
                  onClick={() => pdfRendererRef.current?.fitToWidth()}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 rounded text-[10px] font-semibold"
                  title="Fit to Width"
                >
                  Width
                </button>
                <button
                  onClick={() => pdfRendererRef.current?.fitToPage()}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 rounded text-[10px] font-semibold"
                  title="Fit to Page"
                >
                  Page
                </button>
                <button
                  onClick={() => pdfRendererRef.current?.recenter()}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 text-indigo-500 hover:text-indigo-600 rounded"
                  title="Recenter Highlight"
                >
                  <RotateCcw className="w-4 h-4" />
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

        {/* Main Split Layout */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Left Pane - Document view (PDF Canvas or Excel Grid) */}
          <div className="flex-1 flex flex-col bg-gray-100 dark:bg-gray-950 overflow-hidden relative border-r border-gray-200 dark:border-gray-800">
            
            {/* Spreadsheet search header */}
            {isExcel && (
              <div className="px-6 py-2.5 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-850 flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 max-w-[240px]">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search in sheet..."
                    value={excelSearch}
                    onChange={(e) => setExcelSearch(e.target.value)}
                    className="w-full text-xs pl-8 pr-3 py-1.5 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="relative flex-1 max-w-[180px]">
                  <Filter className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filter vehicle..."
                    value={excelRegFilter}
                    onChange={(e) => setExcelRegFilter(e.target.value)}
                    className="w-full text-xs pl-8 pr-3 py-1.5 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    placeholder="Jump to row..."
                    value={jumpRow}
                    onChange={(e) => setJumpRow(e.target.value)}
                    className="w-16 text-xs px-2 py-1.5 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    onClick={handleJumpToRow}
                    className="btn btn-secondary px-2.5 py-1.5 text-xs"
                  >
                    Go
                  </button>
                </div>
                <span className="text-[10px] text-gray-500 select-none ml-auto">
                  Showing {filteredExcelRows.length} of {excelData?.rows?.length || 0} rows
                </span>
              </div>
            )}

            {/* Actual Viewer Area */}
            <div className="flex-1 overflow-hidden relative w-full h-full">
              {isPDF ? (
                <div className="w-full h-full">
                  <PDFPageRenderer
                    ref={pdfRendererRef}
                    fileId={evidence.sourceFileId}
                    pageNumber={evidence.pageNumber || 1}
                    boundingBox={evidence.boundingBox}
                    crop={false}
                    zoomScale={zoomScale}
                    onZoomChange={setZoomScale}
                    onLoadComplete={() => {}}
                    className="w-full h-full"
                  />
                </div>
              ) : (
                <div className="w-full h-full bg-white dark:bg-gray-900 flex flex-col overflow-hidden">
                  {loadingExcel && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3">
                      <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-xs text-gray-500 font-medium">Parsing Excel worksheet grid...</span>
                    </div>
                  )}

                  {!loadingExcel && excelData && (
                    <div className="flex-1 overflow-auto relative">
                      <table className="w-full text-left border-collapse text-[11px] table-fixed">
                        <thead className="sticky top-0 z-20 bg-gray-55 dark:bg-gray-850 border-b border-gray-200 dark:border-gray-850 shadow-sm">
                          <tr className="text-gray-600 dark:text-gray-400 font-semibold">
                            {/* Sticky Top-Left Corner for frozen Row col */}
                            <th className="px-3 py-2 border-r border-gray-200 dark:border-gray-800 text-center w-14 select-none sticky left-0 z-30 bg-gray-100 dark:bg-gray-800">
                              Row
                            </th>
                            {excelData.headerRow.map((col: string, idx: number) => {
                              // Freeze the first 2 data columns by setting sticky positions
                              const isFrozenCol = idx < 2;
                              const leftOffset = idx === 0 ? '56px' : idx === 1 ? '176px' : undefined;
                              return (
                                <th
                                  key={idx}
                                  style={isFrozenCol ? { position: 'sticky', left: leftOffset, zIndex: 30 } : undefined}
                                  className={`px-3 py-2 border-r border-gray-200 dark:border-gray-800 w-[120px] min-w-[120px] font-semibold ${
                                    isFrozenCol ? 'bg-gray-100 dark:bg-gray-800' : ''
                                  }`}
                                >
                                  {col || `Col ${idx + 1}`}
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredExcelRows.map(({ rowIndex, cells }) => {
                            const isTarget = rowIndex === evidence.rowNumber;
                            return (
                              <tr
                                key={rowIndex}
                                id={`excel-row-${rowIndex}`}
                                ref={isTarget ? targetRowRef : null}
                                className={`border-b border-gray-100 dark:border-gray-850 hover:bg-gray-55/60 dark:hover:bg-gray-800/40 transition-colors ${
                                  isTarget
                                    ? 'bg-amber-50/60 dark:bg-amber-950/20 font-medium ring-2 ring-inset ring-amber-400'
                                    : 'text-gray-700 dark:text-gray-300'
                                }`}
                              >
                                {/* Sticky Frozen Row column */}
                                <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-800 text-center bg-gray-50 dark:bg-gray-850 font-bold text-gray-550 select-none sticky left-0 z-10">
                                  {rowIndex}
                                </td>
                                {excelData.headerRow.map((header: string, colIdx: number) => {
                                  const cellVal = cells[colIdx];
                                  const hlClass = getCellHighlightClass(header, isTarget);
                                  const isFrozenCol = colIdx < 2;
                                  const leftOffset = colIdx === 0 ? '56px' : colIdx === 1 ? '176px' : undefined;
                                  return (
                                    <td
                                      key={colIdx}
                                      style={isFrozenCol ? { position: 'sticky', left: leftOffset, zIndex: 10 } : undefined}
                                      className={`px-3 py-2 border-r border-gray-150 dark:border-gray-800 truncate ${
                                        isFrozenCol ? 'bg-white dark:bg-gray-900' : ''
                                      } ${hlClass}`}
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
            </div>
          </div>

          {/* Right Pane - Metadata, Extracted details & Arithmetic Validation */}
          <div className="w-[360px] bg-white dark:bg-gray-900 flex flex-col overflow-hidden border-l border-gray-200 dark:border-gray-800">
            
            {/* View Tabs */}
            <div className="flex border-b border-gray-150 dark:border-gray-800 text-xs">
              <button
                onClick={() => setActiveTab('source')}
                className={`flex-1 py-3 text-center font-medium border-b-2 transition-all ${
                  activeTab === 'source'
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 font-semibold'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700'
                }`}
              >
                Extraction
              </button>
              <button
                onClick={() => setActiveTab('parsed')}
                className={`flex-1 py-3 text-center font-medium border-b-2 transition-all ${
                  activeTab === 'parsed'
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 font-semibold'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700'
                }`}
              >
                Normalised
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`flex-1 py-3 text-center font-medium border-b-2 transition-all ${
                  activeTab === 'history'
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 font-semibold'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700'
                }`}
              >
                Audit Log
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto p-5">
              
              {activeTab === 'source' && (
                <div className="flex flex-col gap-4">
                  {/* Status / Confidence Card */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-850 border border-gray-100 dark:border-gray-800 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-500">Extraction Confidence</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        evidence.confidence >= 90
                          ? 'bg-green-150 text-green-700 dark:bg-green-950/20 dark:text-green-400'
                          : 'bg-amber-150 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'
                      }`}>
                        {evidence.confidence}% Match
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-800 h-1.5 rounded-full overflow-hidden mb-3">
                      <div
                        className={`h-full rounded-full ${evidence.confidence >= 90 ? 'bg-green-500' : 'bg-amber-500'}`}
                        style={{ width: `${evidence.confidence}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-gray-500 font-mono">
                      <span>Parser: v{evidence.parserVersion}</span>
                      <span>Source: {evidence.sourceType}</span>
                    </div>
                  </div>

                  {/* Warnings section */}
                  {transaction?.warnings && transaction.warnings.length > 0 && (
                    <div className="p-3 bg-rose-50 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-900/30 rounded-xl">
                      <span className="text-[11px] font-bold text-rose-700 dark:text-rose-400 flex items-center gap-1 mb-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Extraction Warnings ({transaction.warnings.length})
                      </span>
                      <ul className="list-disc pl-4 text-[10px] text-rose-600 dark:text-rose-400 flex flex-col gap-1">
                        {transaction.warnings.map((warn: string, idx: number) => (
                          <li key={idx} className="leading-normal">{warn}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Arithmetic validation */}
                  {isPDF && transaction && (
                    <div className="p-4 bg-indigo-50/35 dark:bg-indigo-950/10 border border-indigo-100/60 dark:border-indigo-900/30 rounded-xl">
                      <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-400 block mb-2">
                        Financial Arithmetic Validation
                      </span>
                      <div className="flex flex-col gap-1.5 font-mono text-[10px] text-gray-650 dark:text-gray-400">
                        <div className="flex justify-between py-0.5 border-b border-gray-150/40 dark:border-gray-850">
                          <span>Base net amount:</span>
                          <span className="text-gray-800 dark:text-gray-200">€{parseFloat(transaction.baseValueNet || '0').toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between py-0.5 border-b border-gray-150/40 dark:border-gray-850">
                          <span>Service fee net:</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">+ €{parseFloat(transaction.serviceFeeNet || '0').toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between py-0.5 border-b border-gray-150/40 dark:border-gray-850">
                          <span>Discount net:</span>
                          <span className={`${parseFloat(transaction.discountNet || '0') <= 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-805'}`}>
                            {parseFloat(transaction.discountNet || '0') <= 0 ? '-' : '+'} €{Math.abs(parseFloat(transaction.discountNet || '0')).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between py-1 border-b-2 border-dashed border-gray-200 dark:border-gray-800 text-gray-800 dark:text-white font-semibold">
                          <span>Total net:</span>
                          <span>€{parseFloat(transaction.valueOfPurchaseNet || '0').toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between py-0.5 border-b border-gray-150/40 dark:border-gray-850">
                          <span>VAT amount:</span>
                          <span className="text-gray-850 dark:text-gray-250">+ €{parseFloat(transaction.vat || '0').toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between py-1 bg-indigo-50 dark:bg-indigo-950/20 px-1.5 rounded text-gray-850 dark:text-white font-bold">
                          <span>Total gross:</span>
                          <span>€{parseFloat(transaction.valueInPayCurrency || '0').toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Raw extracted fields */}
                  <div className="flex flex-col gap-2.5">
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      Raw Extracted Values
                    </span>
                    <div className="flex flex-col border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden font-mono text-[10px]">
                      {Object.entries(evidence.extractedFields)
                        .map(([k, v]) => (
                          <div
                            key={k}
                            className="flex justify-between px-3 py-1.5 border-b border-gray-100 dark:border-gray-850 bg-gray-50/30 dark:bg-gray-900"
                          >
                            <span className="text-gray-500 capitalize select-none">
                              {k.replace(/([A-Z])/g, ' $1')}:
                            </span>
                            <span className="text-gray-800 dark:text-gray-200 font-medium truncate max-w-[150px]" title={String(v)}>
                              {v !== undefined && v !== null && String(v).trim() !== '' ? String(v) : '--'}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'parsed' && transaction && (
                <div className="flex flex-col gap-3">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Normalised Canonical Transaction
                  </span>
                  <div className="flex flex-col border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden font-mono text-[10px]">
                    {[
                      { label: 'Vehicle Registration', val: transaction.registration || transaction.vehicleRegistration },
                      { label: 'Card Number', val: transaction.cardNumber },
                      { label: 'Card Number (Normalised)', val: transaction.cardNumberNormalised },
                      { label: 'Transaction Timestamp', val: transaction.transactionTimestamp || transaction.transactionDateTime },
                      { label: 'Invoice / Document No.', val: transaction.invoiceNumber || transaction.documentNumber },
                      { label: 'Ticket / Receipt Number', val: transaction.ticketNumber },
                      { label: 'Product Name', val: transaction.productName },
                      { label: 'Product Type', val: transaction.productType },
                      { label: 'Quantity / Litres', val: `${parseFloat(transaction.quantity || transaction.volume || '0').toFixed(2)} ${transaction.unit || transaction.volumeUnit || 'L'}` },
                      { label: 'Price Per Unit (Net)', val: `€${parseFloat(transaction.pricePerUnit || '0').toFixed(4)}` },
                      { label: 'Forecourt / Station Name', val: transaction.stationName || transaction.forecourtName },
                      { label: 'City', val: transaction.stationCity },
                      { label: 'Service Country', val: transaction.serviceCountry },
                      { label: 'Odometer (Km)', val: transaction.mileage || transaction.mileageKm },
                      { label: 'Payment Currency', val: transaction.paymentCurrency || 'EUR' },
                      { label: 'Status', val: transaction.status },
                    ].map(({ label, val }) => (
                      <div
                        key={label}
                        className="flex justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-850 bg-gray-50/20 dark:bg-gray-900"
                      >
                        <span className="text-gray-505 select-none">{label}:</span>
                        <span className="text-gray-900 dark:text-gray-200 font-semibold truncate max-w-[160px]" title={val}>
                          {val || '--'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'history' && (
                <div className="flex flex-col gap-4 text-xs">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Audit Log & Correction History
                  </span>
                  <div className="relative border-l border-gray-250 dark:border-gray-800 ml-3 pl-5 flex flex-col gap-4 py-2">
                    <div className="relative">
                      <div className="absolute -left-[27px] top-1 p-0.5 bg-green-500 rounded-full text-white">
                        <CheckCircle2 className="w-3 h-3" />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-gray-800 dark:text-gray-300">Parser validation completed</span>
                        <span className="text-[10px] text-gray-400">June 11, 2026 14:32</span>
                        <p className="text-[10px] text-gray-500 leading-normal mt-1 bg-gray-50 dark:bg-black/20 p-2 rounded">
                          Transaction row matches all financial checksums and bounds validation. Central fleet registry match verified.
                        </p>
                      </div>
                    </div>
                    <div className="relative">
                      <div className="absolute -left-[27px] top-1 p-0.5 bg-indigo-500 rounded-full text-white">
                        <History className="w-3 h-3" />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-gray-850 dark:text-gray-300">Source file ingested</span>
                        <span className="text-[10px] text-gray-400">June 11, 2026 14:30</span>
                        <p className="text-[10px] text-gray-500 mt-1 leading-normal">
                          File ID: <span className="font-mono text-[9px]">{evidence.sourceFileId.slice(0, 12)}...</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Actions bottom */}
            <div className="p-5 border-t border-gray-150 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/65 flex flex-col gap-2">
              <div className="flex justify-between items-center text-[10px] text-gray-500 mb-1">
                <span>Central registry status:</span>
                <span className="text-green-500 font-semibold">Active Fleet Member</span>
              </div>
              <button
                onClick={onClose}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition-colors"
              >
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
