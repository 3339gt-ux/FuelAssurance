'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Upload, FileSpreadsheet, FileText, AlertTriangle, CheckCircle2, X, Eye } from 'lucide-react';
import { generateId } from '@/lib/utils';

const FILE_TYPES = [
  { label: 'DKV Transactions', accept: '.xlsx,.xls', description: 'Ola_Report transaction file' },
  { label: 'DKV Invoice', accept: '.xlsx,.xls', description: 'Invoice-Transactions_Report file' },
  { label: 'GPS / Telematics', accept: '.xlsx,.xls,.csv', description: 'GPS telematics data' },
  { label: 'Station Workbook', accept: '.xlsx,.xls', description: 'Approved station master' },
  { label: 'AS24 Invoice (PDF)', accept: '.pdf', description: 'AS24 invoice PDF' },
];

interface QueuedFile {
  id: string;
  file: File;
  type: string;
  status: 'queued' | 'processing' | 'done' | 'error';
  message?: string;
  result?: any;
}

export default function UploadPage() {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [activePreview, setActivePreview] = useState<any | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('preview') === 'true') {
      setActivePreview({
        file: new File([], 'Ola_Report_2026-06-08 (2).xlsx'),
        type: 'DKV Transactions',
        status: 'done',
        result: {
          provider: 'DKV',
          document_type: 'TRANSACTION',
          row_count: 14,
          control_total_status: 'not_applicable',
          metadata: {
            warnings: [],
          }
        }
      });
    } else if (params.get('pdf-preview') === 'true') {
      setActivePreview({
        file: new File([], 'document_direct.pdf'),
        type: 'AS24 Invoice (PDF)',
        status: 'done',
        result: {
          provider: 'AS24',
          document_type: 'INVOICE',
          row_count: 16,
          control_total_status: 'unmatched',
          metadata: {
            controlTotalsAudit: {
              statementGross: '40154.47',
              recalculatedGross: '1861579.43',
              differenceGross: '1821424.96',
              cardFillingGross: '1860000.00',
              passangoGross: '1579.43',
              controlTotalsAudit: {
                recalculatedGross: '1861579.43',
                statementGross: '40154.47',
                differenceGross: '1821424.96',
                status: 'CONTROL_TOTAL_FAILURE',
              }
            },
            warnings: [
              'CONTROL_TOTAL_FAILURE: Recalculated gross total (€1861579.43) does not match printed invoice statement total (€40154.47) within €5.00 tolerance (diff: €1821424.96).'
            ]
          }
        }
      });
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
  }, []);

  const addFiles = (files: File[]) => {
    const newEntries: QueuedFile[] = files.map((f) => ({
      id: generateId(),
      file: f,
      type: detectFileType(f.name),
      status: 'queued' as const,
    }));
    setQueue((prev) => [...prev, ...newEntries]);
  };

  const removeFile = (id: string) => {
    setQueue((prev) => prev.filter((f) => f.id !== id));
  };

  const processFile = async (item: QueuedFile) => {
    setQueue((prev) =>
      prev.map((f) => (f.id === item.id ? { ...f, status: 'processing' } : f))
    );

    const formData = new FormData();
    formData.append('file', item.file);
    formData.append('type', item.type);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to parse and import file');
      }

      const data = await res.json();
      setQueue((prev) =>
        prev.map((f) =>
          f.id === item.id
            ? {
                ...f,
                status: 'done',
                result: data.importFile || data,
                message: `Imported successfully (${data.importFile?.row_count || 0} rows)`,
              }
            : f
        )
      );
    } catch (err: any) {
      setQueue((prev) =>
        prev.map((f) =>
          f.id === item.id ? { ...f, status: 'error', message: err.message } : f
        )
      );
    }
  };

  const processAll = async () => {
    const queued = queue.filter((f) => f.status === 'queued');
    for (const item of queued) {
      await processFile(item);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Upload Centre</h1>
        <p className="text-sm text-surface-500 mt-1">Import transaction, invoice, telematics and station files</p>
      </div>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer ${
          dragActive
            ? 'border-brand-500 bg-brand-50/50 scale-[1.01]'
            : 'border-surface-300 bg-surface-50 hover:border-brand-400 hover:bg-brand-50/30'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <Upload className={`mx-auto h-12 w-12 mb-4 transition ${dragActive ? 'text-brand-500 scale-110' : 'text-surface-400'}`} />
        <p className="text-lg font-medium text-surface-700">Drop files here or click to browse</p>
        <p className="text-sm text-surface-400 mt-2">Supports XLSX, XLS, CSV, and PDF files</p>
        <input
          id="file-input"
          type="file"
          className="hidden"
          multiple
          accept=".xlsx,.xls,.csv,.pdf"
          onChange={(e) => e.target.files && addFiles(Array.from(e.target.files))}
        />
      </div>

      {/* File type guide */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {FILE_TYPES.map((ft) => (
          <div
            key={ft.label}
            className="card p-4 text-center hover:border-brand-400 transition cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = ft.accept;
              input.onchange = (ev) => {
                const files = (ev.target as HTMLInputElement).files;
                if (files) addFiles(Array.from(files));
              };
              input.click();
            }}
          >
            {ft.accept.includes('pdf') ? (
              <FileText className="mx-auto h-8 w-8 text-red-400 mb-2" />
            ) : (
              <FileSpreadsheet className="mx-auto h-8 w-8 text-green-400 mb-2" />
            )}
            <p className="text-xs font-semibold text-surface-800">{ft.label}</p>
            <p className="text-2xs text-surface-400 mt-1">{ft.description}</p>
          </div>
        ))}
      </div>

      {/* Upload queue */}
      {queue.length > 0 && (
        <div className="card divide-y divide-surface-200">
          <div className="px-5 py-3 flex justify-between items-center bg-surface-50">
            <h3 className="text-sm font-semibold text-surface-800">Upload Queue</h3>
            <button onClick={processAll} className="btn btn-primary text-xs px-4 py-2">
              Process All
            </button>
          </div>
          {queue.map((item) => (
            <div key={item.id} className="px-5 py-4 flex flex-col gap-3">
              <div className="flex items-center gap-4">
                <FileSpreadsheet className="h-5 w-5 text-surface-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-800 truncate">{item.file.name}</p>
                  <p className="text-xs text-surface-400">
                    {(item.file.size / 1024).toFixed(0)} KB · {item.type}
                  </p>
                </div>
                <span
                  className={`badge ${
                    item.status === 'done'
                      ? 'badge-success'
                      : item.status === 'error'
                        ? 'badge-error'
                        : item.status === 'processing'
                          ? 'badge-info'
                          : 'badge-warning'
                  }`}
                >
                  {item.status}
                </span>

                {item.status === 'done' && item.result && (
                  <button
                    onClick={() => setActivePreview(item)}
                    className="p-1.5 rounded-lg hover:bg-surface-200 text-brand-600 hover:text-brand-800 transition"
                    title="View Mapping Preview"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                )}

                <button
                  onClick={() => removeFile(item.id)}
                  className="p-1.5 rounded-lg hover:bg-surface-200 text-surface-400 hover:text-surface-600 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {item.message && (
                <p className={`text-xs px-9 ${item.status === 'error' ? 'text-red-600 font-medium' : 'text-surface-600'}`}>
                  {item.message}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Mapping Preview Modal */}
      {activePreview && (
        <div className="fixed inset-0 bg-surface-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-surface-200 animate-scale-in flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-surface-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-surface-900">File Mapping & Ingestion Preview</h3>
                <p className="text-xs text-surface-500">{activePreview.file.name}</p>
              </div>
              <button
                onClick={() => setActivePreview(null)}
                className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400 hover:text-surface-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-surface-50 p-3 rounded-xl border border-surface-200">
                  <span className="text-3xs uppercase tracking-wider font-semibold text-surface-400">Provider</span>
                  <p className="text-sm font-bold text-surface-800 mt-0.5">{activePreview.result.provider}</p>
                </div>
                <div className="bg-surface-50 p-3 rounded-xl border border-surface-200">
                  <span className="text-3xs uppercase tracking-wider font-semibold text-surface-400">Doc Type</span>
                  <p className="text-sm font-bold text-surface-800 mt-0.5">{activePreview.result.document_type}</p>
                </div>
                <div className="bg-surface-50 p-3 rounded-xl border border-surface-200">
                  <span className="text-3xs uppercase tracking-wider font-semibold text-surface-400">Rows Imported</span>
                  <p className="text-sm font-bold text-surface-800 mt-0.5">{activePreview.result.row_count}</p>
                </div>
                <div className="bg-surface-50 p-3 rounded-xl border border-surface-200">
                  <span className="text-3xs uppercase tracking-wider font-semibold text-surface-400">Control Totals</span>
                  <span
                    className={`badge mt-1 text-3xs ${
                      activePreview.result.control_total_status === 'matched'
                        ? 'badge-success'
                        : activePreview.result.control_total_status === 'unmatched'
                          ? 'badge-error'
                          : 'badge-info'
                    }`}
                  >
                    {activePreview.result.control_total_status || 'N/A'}
                  </span>
                </div>
              </div>

              {/* AS24 Specific Totals Audit */}
              {activePreview.result.metadata?.controlTotalsAudit && (
                <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200 space-y-2">
                  <h4 className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    AS24 Control Total Reconciliation Audit
                  </h4>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-surface-500">Printed Statement Gross:</span>
                      <p className="font-bold text-surface-800">€{activePreview.result.metadata.controlTotalsAudit.statementGross}</p>
                    </div>
                    <div>
                      <span className="text-surface-500">Recalculated Gross:</span>
                      <p className="font-bold text-surface-800">€{activePreview.result.metadata.controlTotalsAudit.recalculatedGross}</p>
                    </div>
                    <div>
                      <span className="text-surface-500">Difference:</span>
                      <p className="font-bold text-red-600">€{activePreview.result.metadata.controlTotalsAudit.differenceGross}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Warnings List */}
              {activePreview.result.metadata?.warnings && activePreview.result.metadata.warnings.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-surface-700">Parsing Warnings ({activePreview.result.metadata.warnings.length})</h4>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1.5">
                    {activePreview.result.metadata.warnings.map((w: string, idx: number) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-amber-800">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-surface-100 pt-3 flex justify-end">
              <button onClick={() => setActivePreview(null)} className="btn btn-secondary text-xs px-4 py-2">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function detectFileType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('ola') || lower.includes('report_2026-06-08 (2)')) return 'DKV Transactions';
  if (lower.includes('invoice-transactions') || lower.includes('invoice')) return lower.endsWith('.pdf') ? 'AS24 Invoice (PDF)' : 'DKV Invoice';
  if (lower.includes('gps') || lower.includes('telematics')) return 'GPS / Telematics';
  if (lower.includes('station') || lower.includes('yard') || lower.includes('list')) return 'Station Workbook';
  if (lower.endsWith('.pdf')) return 'AS24 Invoice (PDF)';
  return 'Unknown';
}
