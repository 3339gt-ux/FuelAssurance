import React, { useState, useRef, useEffect } from 'react';
import PDFPageRenderer from './PDFPageRenderer';
import { type SourceEvidence } from '@/domain/types';
import { HelpCircle, AlertTriangle, FileText, Grid, Sparkles, ExternalLink } from 'lucide-react';

interface SourcePreviewPopoverProps {
  evidence?: SourceEvidence;
  onOpenSource: () => void;
  children: React.ReactNode;
}

export default function SourcePreviewPopover({
  evidence,
  onOpenSource,
  children,
}: SourcePreviewPopoverProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [excelData, setExcelData] = useState<any>(null);
  const [loadingExcel, setLoadingExcel] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const hoverTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);

    const rect = e.currentTarget.getBoundingClientRect();
    const tooltipWidth = 420;
    
    // Position below the row, centered or aligned left
    let left = rect.left + window.scrollX;
    if (left + tooltipWidth > window.innerWidth) {
      left = window.innerWidth - tooltipWidth - 20;
    }
    
    setCoords({
      top: rect.bottom + window.scrollY + 6,
      left: Math.max(10, left),
    });

    hoverTimeout.current = setTimeout(() => {
      setVisible(true);
      if (evidence && (evidence.sourceType === 'DKV_DAILY_XLS' || evidence.sourceType === 'DKV_INVOICE_XLS' || evidence.sourceType === 'GPS_XLS')) {
        fetchExcelRow();
      }
    }, 250); // 250ms debounce before showing
  };

  const handleMouseLeave = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => {
      setVisible(false);
    }, 150); // Small grace period
  };

  const fetchExcelRow = async () => {
    if (!evidence) return;
    setLoadingExcel(true);
    try {
      const url = `/api/source-preview/excel?fileId=${evidence.sourceFileId}&sheetName=${encodeURIComponent(evidence.worksheetName || '')}&rowNumber=${evidence.rowNumber}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setExcelData(data);
      }
    } catch (err) {
      console.error('Failed to fetch Excel preview row:', err);
    } finally {
      setLoadingExcel(false);
    }
  };

  useEffect(() => {
    return () => {
      if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    };
  }, []);

  if (!evidence) return <>{children}</>;

  const isPDF = evidence.sourceType === 'AS24_PDF' || evidence.sourceType === 'DKV_PDF';
  const isExcel = !isPDF;

  // Determine highlighted columns indices for Excel
  const getHighlightType = (headerStr: string): 'reg' | 'datetime' | 'product' | 'qty' | 'net' | 'gross' | 'location' | null => {
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

  const getCellHighlightClass = (header: string): string => {
    const type = getHighlightType(header);
    switch (type) {
      case 'reg': return 'bg-purple-100/80 dark:bg-purple-950/40 text-purple-900 dark:text-purple-300 font-semibold';
      case 'datetime': return 'bg-blue-100/80 dark:bg-blue-950/40 text-blue-900 dark:text-blue-300';
      case 'product': return 'bg-green-100/80 dark:bg-green-950/40 text-green-900 dark:text-green-300';
      case 'qty': return 'bg-amber-100/80 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 font-semibold';
      case 'net': return 'bg-indigo-100/80 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-300 font-semibold';
      case 'gross': return 'bg-pink-100/80 dark:bg-pink-950/40 text-pink-900 dark:text-pink-300';
      case 'location': return 'bg-cyan-100/80 dark:bg-cyan-950/40 text-cyan-900 dark:text-cyan-300';
      default: return '';
    }
  };

  return (
    <div
      ref={triggerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="inline-block"
    >
      {children}

      {visible && (
        <div
          style={{
            position: 'absolute',
            top: coords.top,
            left: coords.left,
            zIndex: 1000,
          }}
          className="w-[440px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-2xl p-4 animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-auto"
          onMouseEnter={() => {
            if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
            setVisible(true);
          }}
          onMouseLeave={handleMouseLeave}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2 mb-3">
            <div className="flex items-center gap-2">
              {isPDF ? (
                <FileText className="w-4 h-4 text-rose-500" />
              ) : (
                <Grid className="w-4 h-4 text-emerald-500" />
              )}
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 max-w-[200px] truncate">
                {evidence.sourceFileName || 'Source File'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                Conf: {evidence.confidence}%
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenSource();
                  setVisible(false);
                }}
                className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 transition-colors"
              >
                <span>Open</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Content Body */}
          <div className="mb-3">
            {isPDF ? (
              <div>
                <div className="flex justify-between items-center text-[10px] text-gray-500 mb-1.5">
                  <span>Page {evidence.pageNumber}</span>
                  {evidence.boundingBox ? (
                    <span className="text-indigo-500 font-medium">Row crop highlighted</span>
                  ) : (
                    <span className="text-amber-500 font-medium">Page-level source only</span>
                  )}
                </div>

                {evidence.boundingBox ? (
                  <div className="w-full bg-gray-50 dark:bg-gray-950/40 rounded border border-gray-100 dark:border-gray-800 overflow-hidden">
                    <PDFPageRenderer
                      fileId={evidence.sourceFileId}
                      pageNumber={evidence.pageNumber || 1}
                      boundingBox={evidence.boundingBox}
                      crop={true}
                      scale={1.3}
                      className="max-h-[140px]"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 p-2 bg-gray-50 dark:bg-gray-950/40 rounded border border-gray-100 dark:border-gray-800">
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Page-level source only — exact row highlight unavailable.
                    </span>
                    <div className="text-[10px] font-mono text-gray-600 dark:text-gray-400 line-clamp-4 leading-relaxed bg-white dark:bg-black/20 p-1.5 rounded border border-gray-200/50 dark:border-gray-800/50 max-h-[80px] overflow-y-auto">
                      {evidence.rawText || 'No raw text available'}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="flex justify-between items-center text-[10px] text-gray-500 mb-1.5">
                  <span>Sheet: {evidence.worksheetName} • Row {evidence.rowNumber}</span>
                  <span className="text-emerald-500 font-medium">Excel cell highlights</span>
                </div>

                {loadingExcel && (
                  <div className="h-[90px] flex items-center justify-center bg-gray-50 dark:bg-gray-950/30 rounded border border-gray-100 dark:border-gray-800">
                    <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}

                {!loadingExcel && excelData && (
                  <div className="overflow-x-auto border border-gray-100 dark:border-gray-800 rounded bg-gray-50 dark:bg-gray-950/40 max-h-[160px] overflow-y-auto">
                    <table className="w-full text-left border-collapse text-[10px]">
                      <thead>
                        <tr className="bg-gray-100 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700/80 text-gray-600 dark:text-gray-400 font-medium">
                          <th className="px-2 py-1 border-r border-gray-200 dark:border-gray-700">Row</th>
                          {excelData.headerRow.map((col: string, idx: number) => (
                            <th key={idx} className="px-2 py-1 border-r border-gray-200 dark:border-gray-700 font-medium max-w-[100px] truncate">
                              {col || `Col ${idx + 1}`}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {excelData.contextRows.map((contextRow: any) => {
                          const isTarget = contextRow.rowIndex === evidence.rowNumber;
                          return (
                            <tr
                              key={contextRow.rowIndex}
                              className={`border-b border-gray-200/50 dark:border-gray-850 ${
                                isTarget ? 'bg-amber-50/70 dark:bg-amber-950/20 font-medium' : 'text-gray-500 dark:text-gray-500'
                              }`}
                            >
                              <td className="px-2 py-1 border-r border-gray-200 dark:border-gray-700 bg-gray-100/50 dark:bg-gray-800/40 text-center font-semibold">
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
          </div>

          {/* Quick Extracted Summary */}
          <div className="bg-gray-50 dark:bg-gray-850 p-2.5 rounded-lg border border-gray-100 dark:border-gray-800/50 text-[11px] text-gray-600 dark:text-gray-400">
            <span className="font-semibold text-gray-700 dark:text-gray-300 block mb-1">Parsed fields:</span>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px]">
              {Object.entries(evidence.extractedFields)
                .filter(([_, v]) => v !== undefined && v !== null && String(v).trim() !== '')
                .slice(0, 6) // limit to top 6 fields
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-gray-200/40 dark:border-gray-800/40 py-0.5">
                    <span className="text-gray-500 dark:text-gray-500 capitalize">{k.replace(/([A-Z])/g, ' $1')}:</span>
                    <span className="text-gray-800 dark:text-gray-300 font-medium truncate max-w-[100px]" title={String(v)}>
                      {String(v)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
