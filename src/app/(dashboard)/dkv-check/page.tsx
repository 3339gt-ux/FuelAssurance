'use client';
import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload, ChevronRight, AlertTriangle, CheckCircle2, FileText, ArrowRight,
  ShieldAlert, Loader2, RefreshCw, XCircle, Info, Landmark, MapPin, Gauge, RotateCcw,
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import type {
  UploadResponse,
  UploadSummaryShape,
  GpsSummaryShape,
  SourceDetectionInfo,
  TransactionSourceType,
} from '@/types/upload';

// ─────────────────────────────────────────────────────────────────────────────
// Inline error panel — replaces all alert() calls
// ─────────────────────────────────────────────────────────────────────────────

interface UploadErrorPanelProps {
  fileName: string;
  fileType: string;
  stage: string;
  message: string;
  suggestedAction: string;
  onRetry: () => void;
}

function UploadErrorPanel({ fileName, fileType, stage, message, suggestedAction, onRetry }: UploadErrorPanelProps) {
  return (
    <div className="card border-red-200 bg-red-500/5 space-y-4 animate-slide-down" role="alert">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/10">
          <XCircle className="h-5 w-5 text-red-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-extrabold text-red-700 leading-tight">Upload failed</p>
          <p className="text-xs text-red-600 mt-0.5">{message}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-3xs">
        {[
          { label: 'File', val: fileName },
          { label: 'Type', val: fileType },
          { label: 'Failed stage', val: stage },
        ].map(({ label, val }) => (
          <div key={label} className="col-span-1">
            <span className="text-red-400 font-semibold uppercase tracking-wider">{label}</span>
            <p className="text-red-700 font-mono truncate">{val}</p>
          </div>
        ))}
      </div>
      {suggestedAction && (
        <div className="flex gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-200 text-xs text-amber-800">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
          <span>{suggestedAction}</span>
        </div>
      )}
      <button onClick={onRetry} className="btn btn-secondary w-full py-2.5 text-xs flex items-center justify-center gap-2">
        <RotateCcw className="h-3.5 w-3.5" /> Try again with a different file
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function DKVCheckPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Step 1: DKV File
  const [dkvFile, setDkvFile] = useState<File | null>(null);
  const [uploadSummary, setUploadSummary] = useState<(UploadSummaryShape & { fileId: string }) | null>(null);
  const [dkvError, setDkvError] = useState<UploadErrorPanelProps | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [detectionInfo, setDetectionInfo] = useState<SourceDetectionInfo | null>(null);
  const [detectedSourceType, setDetectedSourceType] = useState<TransactionSourceType | null>(null);

  // Step 2: GPS File
  const [gpsFile, setGpsFile] = useState<File | null>(null);
  const [gpsSummary, setGpsSummary] = useState<(GpsSummaryShape & { fileId: string }) | null>(null);
  const [gpsError, setGpsError] = useState<UploadErrorPanelProps | null>(null);

  // Step 3: Run Check Target
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [checkError, setCheckError] = useState<UploadErrorPanelProps | null>(null);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const resetDkv = () => {
    setDkvFile(null);
    setUploadSummary(null);
    setDkvError(null);
    setPendingFile(null);
    setDetectionInfo(null);
    setDetectedSourceType(null);
  };
  const resetGps = () => { setGpsFile(null); setGpsSummary(null); setGpsError(null); };

  const uploadDkvWithType = useCallback(async (file: File, confirmedType?: TransactionSourceType) => {
    const formData = new FormData();
    formData.append('file', file);
    if (confirmedType) {
      formData.append('confirmedType', confirmedType);
    }

    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    return res.json() as Promise<UploadResponse>;
  }, []);

  const processDkvUpload = useCallback(async (file: File, confirmedType?: TransactionSourceType) => {
    setDkvFile(file);
    setDkvError(null);
    setDetectionInfo(null);
    setIsProcessing(true);

    try {
      const data = await uploadDkvWithType(file, confirmedType);

      if ('success' in data && !data.success && data.code === 'CONFIRMATION_REQUIRED' && data.detection) {
        if (process.env.NEXT_PUBLIC_E2E_HOOKS === 'true' && data.detection.detected) {
          const retry = await uploadDkvWithType(file, data.detection.detected.sourceType);
          if ('success' in retry && retry.success && retry.uploadSummary) {
            setDkvFile(file);
            setUploadSummary({ fileId: retry.fileId, ...retry.uploadSummary });
            setDetectedSourceType(retry.sourceType ?? null);
            setPendingFile(null);
            return;
          }
        }
        setPendingFile(file);
        setDetectionInfo(data.detection);
        setDkvFile(null);
        return;
      }

      if ('success' in data && data.success && data.uploadSummary) {
        setUploadSummary({ fileId: data.fileId, ...data.uploadSummary });
        setDetectedSourceType(data.sourceType ?? null);
        setPendingFile(null);
      } else if ('success' in data && data.success && !data.uploadSummary) {
        setDkvError({
          fileName: file.name,
          fileType: 'DKV File',
          stage: 'summary-generation',
          message: data.summaryWarning || 'The file was imported but the upload summary could not be generated.',
          suggestedAction: 'The core import succeeded. You can view this batch in Transaction Batches.',
          onRetry: resetDkv,
        });
      } else if ('success' in data && !data.success) {
        setDkvError({
          fileName: file.name, fileType: 'DKV File', stage: data.stage,
          message: data.message, suggestedAction: data.suggestedAction, onRetry: resetDkv,
        });
        setDkvFile(null);
      } else {
        setDkvError({
          fileName: file.name, fileType: 'DKV File', stage: 'response',
          message: 'The server returned an unexpected response.',
          suggestedAction: 'Try uploading again.', onRetry: resetDkv,
        });
        setDkvFile(null);
      }
    } catch {
      setDkvError({
        fileName: file.name, fileType: 'DKV File', stage: 'file-read',
        message: 'The upload request failed — the server may be unreachable.',
        suggestedAction: 'Check that the development server is running on port 3993 and try again.',
        onRetry: resetDkv,
      });
      setDkvFile(null);
    } finally {
      setIsProcessing(false);
    }
  }, [uploadDkvWithType, resetDkv]);

  const confirmSourceType = useCallback(async (sourceType: TransactionSourceType) => {
    if (!pendingFile) return;
    await processDkvUpload(pendingFile, sourceType);
  }, [pendingFile, processDkvUpload]);

  // ── Dropzone: DKV File ─────────────────────────────────────────────────────
  const { getRootProps: getDkvProps, getInputProps: getDkvInput, isDragActive: dkvActive } = useDropzone({
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
      'application/pdf': ['.pdf'],
    },
    multiple: false,
    disabled: isProcessing,
    onDrop: (accepted) => {
      const file = accepted[0];
      if (file) void processDkvUpload(file);
    },
  });

  const { onChange: _dkvDropzoneOnChange, ...dkvInputProps } = getDkvInput();

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E_HOOKS === 'true') {
      (window as unknown as { __testUploadDkv?: (f: File) => Promise<void> }).__testUploadDkv = processDkvUpload;
    }
    return () => {
      delete (window as unknown as { __testUploadDkv?: (f: File) => Promise<void> }).__testUploadDkv;
    };
  }, [processDkvUpload]);

  // ── Dropzone: GPS ──────────────────────────────────────────────────────────
  const { getRootProps: getGpsProps, getInputProps: getGpsInput, isDragActive: gpsActive } = useDropzone({
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    multiple: false,
    disabled: isProcessing,
    onDrop: async (accepted) => {
      const file = accepted[0];
      if (!file) return;
      setGpsFile(file);
      setGpsError(null);
      setIsProcessing(true);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'GPS / Telematics');

      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data: UploadResponse = await res.json();

        if ('success' in data && data.success && data.gpsSummary) {
          setGpsSummary({ fileId: data.fileId, ...data.gpsSummary });
          setSelectedVehicle(data.gpsSummary.detectedCanonicalRegistration || '');
        } else if ('success' in data && data.success && !data.gpsSummary) {
          setGpsError({
            fileName: file.name, fileType: 'GPS / Telematics', stage: 'summary-generation',
            message: data.summaryWarning || 'The GPS file was imported but the summary could not be generated.',
            suggestedAction: 'The import succeeded. You can attach this file from the Transaction Batches workspace.',
            onRetry: resetGps,
          });
        } else if ('success' in data && !data.success) {
          setGpsError({
            fileName: file.name, fileType: 'GPS / Telematics', stage: data.stage,
            message: data.message, suggestedAction: data.suggestedAction, onRetry: resetGps,
          });
          setGpsFile(null);
        } else {
          setGpsError({
            fileName: file.name, fileType: 'GPS / Telematics', stage: 'response',
            message: 'The server returned an unexpected response.',
            suggestedAction: 'Try uploading again.', onRetry: resetGps,
          });
          setGpsFile(null);
        }
      } catch {
        setGpsError({
          fileName: file.name, fileType: 'GPS / Telematics', stage: 'file-read',
          message: 'The upload request failed — the server may be unreachable.',
          suggestedAction: 'Check that the development server is running on port 3993 and try again.',
          onRetry: resetGps,
        });
        setGpsFile(null);
      } finally {
        setIsProcessing(false);
      }
    },
  });

  // ── Run Check ──────────────────────────────────────────────────────────────
  const handleRunCheck = async () => {
    if (!uploadSummary?.fileId || !gpsSummary?.fileId || !selectedVehicle) return;
    setSubmitting(true);
    setCheckError(null);

    try {
      const res = await fetch('/api/check-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionFileId: uploadSummary.fileId,
          gpsFileId: gpsSummary.fileId,
          selectedVehicle,
          provider: 'DKV',
        }),
      });
      const data = await res.json();
      if (data.success && data.checkId) {
        router.push(`/batches?id=${uploadSummary.fileId}&tab=transactions`);
      } else {
        setCheckError({
          fileName: 'check-transactions', fileType: 'Verification', stage: 'check-execution',
          message: data.error || 'Check execution failed.',
          suggestedAction: 'Ensure both files are imported and the vehicle registration matches.',
          onRetry: () => setCheckError(null),
        });
      }
    } catch {
      setCheckError({
        fileName: 'check-transactions', fileType: 'Verification', stage: 'check-execution',
        message: 'Verification request failed — server unreachable.',
        suggestedAction: 'Check that the server is running and try again.',
        onRetry: () => setCheckError(null),
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6 text-slate-800 dark:text-surface-900 animate-fade-in">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-surface-950 tracking-tight">DKV Transaction Check</h1>
        <p className="text-xs text-slate-500 dark:text-surface-600 mt-1">Guided workflow to compare DKV charges against vehicle telemetry</p>
      </div>

      {/* Progress Indicators */}
      <div className="flex items-center gap-4 bg-slate-100 dark:bg-surface-55 p-3 rounded-xl border border-slate-200 dark:border-surface-300">
        {[
          { num: 1, label: 'Upload DKV' },
          { num: 2, label: 'Upload GPS' },
          { num: 3, label: 'Verification' },
        ].map((s) => (
          <div key={s.num} className="flex items-center gap-2 flex-1 justify-center">
            <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold ${
              step >= s.num ? 'bg-brand-600 text-white' : 'bg-slate-200 dark:bg-surface-200 text-slate-500 dark:text-surface-600'
            }`}>{s.num}</span>
            <span className={`text-2xs font-bold ${step === s.num ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400 dark:text-surface-600'}`}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Processing overlay */}
      {isProcessing && (
        <div className="card flex flex-col items-center justify-center py-16 space-y-3">
          <Loader2 className="h-8 w-8 text-brand-600 animate-spin" />
          <p className="text-xs text-slate-500">Processing and parsing file content…</p>
          <p className="text-3xs text-slate-400">This may take a few seconds for large files</p>
        </div>
      )}

      {!isProcessing && (
        <>
          {/* ── STEP 1: UPLOAD DKV ─────────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-6">
              {dkvError && <UploadErrorPanel {...dkvError} />}

              {detectionInfo && pendingFile && !uploadSummary ? (
                <div className="card space-y-4 border-amber-200 bg-amber-500/5 animate-slide-down">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-amber-900">Confirm source type</p>
                      <p className="text-xs text-amber-800 mt-1">
                        Structure detection for <span className="font-mono">{pendingFile.name}</span> needs your confirmation before parsing.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {detectionInfo.candidates.map((c) => (
                      <button
                        key={c.sourceType}
                        onClick={() => void confirmSourceType(c.sourceType)}
                        className="w-full text-left card p-3 hover:border-brand-400 hover:bg-brand-500/5 transition border border-slate-200"
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-800">{c.sourceType}</span>
                          <span className="badge bg-brand-500/10 text-brand-700 text-3xs">{Math.round(c.confidence * 100)}%</span>
                        </div>
                        <p className="text-3xs text-slate-500 mt-1">{c.reason}</p>
                      </button>
                    ))}
                  </div>
                  <button onClick={resetDkv} className="btn btn-secondary w-full text-xs py-2">Cancel</button>
                </div>
              ) : !uploadSummary && !dkvError ? (
                <div {...getDkvProps()} className={`card border-2 border-dashed flex flex-col items-center justify-center py-20 text-center cursor-pointer transition ${
                  dkvActive ? 'border-brand-500 bg-brand-500/5' : 'border-slate-350 dark:border-surface-300 hover:bg-slate-50 dark:hover:bg-surface-50'
                }`}>
                  <input
                    {...dkvInputProps}
                    data-testid="dkv-file-upload"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void processDkvUpload(file);
                    }}
                  />
                  <Upload className="h-10 w-10 text-slate-400 mb-3" />
                  <p className="text-sm font-bold text-slate-800 dark:text-surface-950">Drag and drop DKV report or PDF invoice here</p>
                  <p className="text-2xs text-slate-400 mt-1">Daily authorisation, weekly reports, invoice-period Excel sheets, or DKV PDF invoice (XLS, XLSX, CSV, PDF)</p>
                </div>
              ) : uploadSummary ? (
                <div className="space-y-6 animate-slide-down">
                  <div className="flex justify-between items-center bg-slate-100 dark:bg-surface-50 p-4 rounded-xl border border-slate-200 dark:border-surface-300">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-surface-950">File Upload Summary</h3>
                      <p className="text-3xs text-slate-500">Successfully loaded {uploadSummary.fileOverview.fileName}</p>
                    </div>
                    <button onClick={resetDkv} className="btn btn-secondary py-1.5 px-3 text-3xs font-semibold flex items-center gap-1">
                      <RefreshCw className="h-3 w-3" /> Re-upload
                    </button>
                  </div>

                  {detectedSourceType && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-brand-500/5 border border-brand-200 text-xs">
                      <CheckCircle2 className="h-4 w-4 text-brand-600" />
                      <span>Detected source: <strong>{detectedSourceType}</strong> — saved as reusable transaction batch</span>
                      <a href={`/batches?id=${uploadSummary.fileId}&tab=transactions`} className="ml-auto text-brand-700 font-semibold hover:underline">Open batch workspace →</a>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Provider', val: uploadSummary.fileOverview.provider },
                      { label: 'Document Type', val: detectedSourceType || uploadSummary.fileOverview.documentType },
                      { label: 'Sheets / Pages', val: uploadSummary.fileOverview.pageOrSheetCount },
                      { label: 'Total Rows', val: uploadSummary.fileOverview.totalTransactionRows },
                    ].map((item, idx) => (
                      <div key={idx} className="card p-3.5 space-y-1">
                        <span className="text-3xs font-semibold text-slate-400 uppercase tracking-wider">{item.label}</span>
                        <p className="text-xs font-bold text-slate-950">{item.val}</p>
                      </div>
                    ))}
                  </div>

                  {uploadSummary.fileOverview.parsingWarnings.length > 0 && (
                    <div className="flex gap-2.5 p-3.5 bg-amber-500/10 border border-amber-300 rounded-xl text-amber-700 text-xs">
                      <AlertTriangle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Parsing Warnings Detected</p>
                        <ul className="list-disc pl-4 mt-1 space-y-1">
                          {uploadSummary.fileOverview.parsingWarnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
                        </ul>
                      </div>
                    </div>
                  )}

                  {uploadSummary.fleetVehiclesFound.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fleet Vehicles Identified</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {uploadSummary.fleetVehiclesFound.map((v, idx) => (
                          <div key={idx} className="card p-4 space-y-3 border-l-4 border-l-brand-600">
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="text-xs font-black font-mono tracking-tight bg-slate-100 dark:bg-surface-200 px-2 py-0.5 rounded text-slate-800 dark:text-surface-950">{v.registration}</span>
                                <p className="text-3xs text-slate-400 mt-1">{v.make} {v.model}</p>
                              </div>
                              <span className="badge bg-brand-500/10 text-brand-600 text-3xs font-semibold">{v.chargeCount} charges</span>
                            </div>
                            <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-3xs text-slate-500">
                              <div>
                                <span className="block text-4xs font-bold text-slate-400 uppercase">Litres</span>
                                <span className="text-slate-800 font-medium">{Object.entries(v.fuelLitresByProduct).map(([p, l]) => `${l}L (${p})`).join(', ') || '0L'}</span>
                              </div>
                              <div>
                                <span className="block text-4xs font-bold text-slate-400 uppercase">Monetary Total</span>
                                <span className="text-slate-800 font-bold font-mono">{Object.entries(v.monetaryTotalsByCurrency).map(([c, a]: any) => `${c} ${a.toFixed(2)}`).join(', ')}</span>
                              </div>
                              <div className="col-span-2">
                                <span className="block text-4xs font-bold text-slate-400 uppercase">Countries / Regions</span>
                                <span className="text-slate-700 truncate block">{v.countries.join(', ')} ({v.stations.length} stations)</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {uploadSummary.chargeBreakdown.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Charge Category Breakdown</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {uploadSummary.chargeBreakdown.map((c, idx) => (
                          <div key={idx} className="card p-3.5 space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-bold text-slate-850">{c.category}</span>
                              <span className="badge bg-slate-100 dark:bg-surface-200 text-slate-600 text-4xs font-bold">{c.chargeCount} txs</span>
                            </div>
                            <div className="text-3xs text-slate-500 space-y-1">
                              <p><span className="text-slate-400">Total Qty:</span> {c.totalQuantity.toFixed(2)}</p>
                              <p><span className="text-slate-400">Total Amt:</span> {Object.entries(c.totalAmountByCurrency).map(([curr, val]: any) => `${curr} ${val.toFixed(2)}`).join(', ')}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {uploadSummary.nonFleetVehicles.length > 0 && (
                    <div className="space-y-2 p-4 bg-red-500/5 border border-red-200 rounded-xl">
                      <div className="flex items-center gap-1.5 text-red-600 font-bold text-xs">
                        <XCircle className="h-4.5 w-4.5" />
                        <span>Registrations found that are not on the current fleet list</span>
                      </div>
                      <div className="max-h-36 overflow-y-auto text-3xs text-slate-500 mt-2 space-y-1">
                        {uploadSummary.nonFleetVehicles.map((n, idx) => (
                          <div key={idx} className="flex justify-between border-b border-red-500/5 pb-1">
                            <span className="font-mono font-bold text-slate-700">{n.rawRegistration} (Normalized: {n.normalizedRegistration})</span>
                            <span className="text-slate-400">{n.source}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {uploadSummary.unassignedCharges.length > 0 && (
                    <div className="space-y-2 p-4 bg-slate-100 dark:bg-surface-50 border border-slate-200 rounded-xl">
                      <div className="flex items-center gap-1.5 text-slate-600 dark:text-surface-700 font-bold text-xs">
                        <Info className="h-4.5 w-4.5" />
                        <span>Unassigned charges (No registration found on row)</span>
                      </div>
                      <div className="max-h-36 overflow-y-auto text-3xs text-slate-500 mt-2 space-y-1 font-mono">
                        {uploadSummary.unassignedCharges.map((un, idx) => (
                          <div key={idx} className="flex justify-between border-b border-slate-200 pb-1">
                            <span>{un.date} - {un.productName} ({un.quantity}L) - {un.stationName}</span>
                            <span className="font-bold">{un.paymentCurrency} {parseFloat(un.amountGross).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button onClick={() => setStep(2)} className="btn btn-primary w-full text-xs font-semibold py-3 flex items-center justify-center gap-1">
                    Continue to Step 2: Upload GPS Telematics <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {/* ── STEP 2: UPLOAD GPS ─────────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-6">
              {gpsError && <UploadErrorPanel {...gpsError} />}

              {!gpsSummary && !gpsError ? (
                <div className="space-y-4">
                  <div {...getGpsProps()} className={`card border-2 border-dashed flex flex-col items-center justify-center py-20 text-center cursor-pointer transition ${
                    gpsActive ? 'border-brand-500 bg-brand-500/5' : 'border-slate-350 dark:border-surface-300 hover:bg-slate-50 dark:hover:bg-surface-50'
                  }`}>
                    <input {...getGpsInput()} />
                    <Upload className="h-10 w-10 text-slate-400 mb-3" />
                    <p className="text-sm font-bold text-slate-800 dark:text-surface-950">Drag and drop vehicle GPS report here</p>
                    <p className="text-2xs text-slate-400 mt-1">Supports XLS, XLSX formatted telemetry files</p>
                  </div>
                  <button onClick={() => setStep(1)} className="btn btn-secondary w-full py-2.5 text-xs">Back to Step 1: Upload Summary</button>
                </div>
              ) : gpsSummary ? (
                <div className="space-y-6 animate-slide-down">
                  <div className="flex justify-between items-center bg-slate-100 dark:bg-surface-50 p-4 rounded-xl border border-slate-200 dark:border-surface-300">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-surface-950">GPS Telemetry Summary</h3>
                      <p className="text-3xs text-slate-500">Successfully loaded {gpsFile?.name}</p>
                    </div>
                    <button onClick={resetGps} className="btn btn-secondary py-1.5 px-3 text-3xs font-semibold flex items-center gap-1">
                      <RefreshCw className="h-3 w-3" /> Re-upload
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="card p-3.5 space-y-1">
                      <span className="text-3xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1"><Landmark className="h-3 w-3" /> Detected Registration</span>
                      <p className="text-xs font-black font-mono text-brand-600 dark:text-brand-400">{gpsSummary.detectedCanonicalRegistration}</p>
                      <p className="text-4xs text-slate-400">Raw: {gpsSummary.rawRegistration}</p>
                    </div>
                    <div className="card p-3.5 space-y-1">
                      <span className="text-3xs font-semibold text-slate-400 uppercase tracking-wider">Vehicle Specs</span>
                      <p className="text-xs font-bold text-slate-950">{gpsSummary.make} - {gpsSummary.model}</p>
                    </div>
                    <div className="card p-3.5 space-y-1 col-span-2 md:col-span-1">
                      <span className="text-3xs font-semibold text-slate-400 uppercase tracking-wider">Date/Time Range</span>
                      <p className="text-3xs font-bold text-slate-900">{gpsSummary.dateRange}</p>
                    </div>
                    <div className="card p-3.5 space-y-1">
                      <span className="text-3xs font-semibold text-slate-400 uppercase tracking-wider">GPS Record Count</span>
                      <p className="text-xs font-bold text-slate-950">{gpsSummary.gpsRecordCount} logs</p>
                    </div>
                    <div className="card p-3.5 space-y-1">
                      <span className="text-3xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1"><MapPin className="h-3 w-3" /> Fuel level range</span>
                      <p className="text-xs font-bold text-slate-950">{gpsSummary.fuelLevelMin ?? 0}% to {gpsSummary.fuelLevelMax ?? 0}%</p>
                    </div>
                    <div className="card p-3.5 space-y-1">
                      <span className="text-3xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1"><Gauge className="h-3 w-3" /> Odometer range</span>
                      <p className="text-xs font-bold text-slate-950">{gpsSummary.odometerMin ?? 0} to {gpsSummary.odometerMax ?? 0} km</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className={`card p-4 flex items-center justify-between border-l-4 ${gpsSummary.locationEvidenceAvailable ? 'border-l-green-600 bg-green-500/5' : 'border-l-red-600 bg-red-500/5'}`}>
                      <span className="text-2xs font-bold text-slate-800">Location Evidence</span>
                      {gpsSummary.locationEvidenceAvailable
                        ? <span className="badge bg-green-500/10 text-green-700 text-3xs font-bold py-1 px-2.5 rounded-full flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Available</span>
                        : <span className="badge bg-red-500/10 text-red-700 text-3xs font-bold py-1 px-2.5 rounded-full flex items-center gap-1"><XCircle className="h-3 w-3" /> Missing</span>}
                    </div>
                    <div className={`card p-4 flex items-center justify-between border-l-4 ${gpsSummary.engineEvidenceAvailable ? 'border-l-green-600 bg-green-500/5' : 'border-l-red-600 bg-red-500/5'}`}>
                      <span className="text-2xs font-bold text-slate-800">Engine/Ignition Evidence</span>
                      {gpsSummary.engineEvidenceAvailable
                        ? <span className="badge bg-green-500/10 text-green-700 text-3xs font-bold py-1 px-2.5 rounded-full flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Available</span>
                        : <span className="badge bg-red-500/10 text-red-700 text-3xs font-bold py-1 px-2.5 rounded-full flex items-center gap-1"><XCircle className="h-3 w-3" /> Missing</span>}
                    </div>
                  </div>

                  {gpsSummary.warnings.length > 0 && (
                    <div className="flex gap-2.5 p-3.5 bg-amber-500/10 border border-amber-300 rounded-xl text-amber-700 text-xs">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">GPS Import Warnings</p>
                        <ul className="list-disc pl-4 mt-1 space-y-0.5">
                          {gpsSummary.warnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
                          {gpsSummary.warnings.length > 5 && <li>…and {gpsSummary.warnings.length - 5} more</li>}
                        </ul>
                      </div>
                    </div>
                  )}

                  {!gpsSummary.inRegistry ? (
                    <div className="flex gap-3 p-4 bg-red-500/10 border border-red-300 rounded-xl text-red-700 text-xs">
                      <ShieldAlert className="h-6 w-6 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-extrabold text-sm uppercase tracking-tight">Blocked: Vehicle is not in the fleet registry</p>
                        <p className="mt-1 font-medium">The registration found in the GPS file (<span className="font-mono font-bold">{gpsSummary.rawRegistration}</span>) is not recognized as a member of the allowed fleet list.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2.5 p-3.5 bg-green-500/10 border border-green-300 rounded-xl text-green-700 text-xs">
                      <CheckCircle2 className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Authorized Fleet Vehicle confirmed</p>
                        <p className="mt-0.5">Matched canonical registration <span className="font-mono font-bold">{gpsSummary.detectedCanonicalRegistration}</span> in the fleet allowlist.</p>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={() => setStep(1)} className="btn btn-secondary w-full py-3 text-xs">Back</button>
                    <button
                      onClick={() => { setSelectedVehicle(gpsSummary.detectedCanonicalRegistration); setStep(3); }}
                      className="btn btn-primary w-full py-3 text-xs font-semibold flex items-center justify-center gap-1"
                      disabled={!gpsSummary.inRegistry}
                    >
                      Continue to Step 3: Run Verification <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* ── STEP 3: RUN CHECK ─────────────────────────────────────────── */}
          {step === 3 && uploadSummary && gpsSummary && (
            <div className="card space-y-6">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-surface-950 tracking-tight border-b border-slate-200 dark:border-surface-300 pb-3">Confirm Check Ingestion Parameters</h3>

              <div className="space-y-3 text-xs border-b border-slate-200 dark:border-surface-300 pb-4">
                <div className="flex justify-between">
                  <span className="text-slate-400">Transaction Source File:</span>
                  <span className="font-mono font-bold text-slate-700 dark:text-surface-800">{dkvFile?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">GPS Telematics Source File:</span>
                  <span className="font-mono font-bold text-slate-700 dark:text-surface-800">{gpsFile?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Transactions Range:</span>
                  <span className="text-slate-750 font-bold">{uploadSummary.fileOverview.transactionDateRange}</span>
                </div>
              </div>

              {(() => {
                const sameVehicleTxsCount = uploadSummary.fleetVehiclesFound.find((v) => v.registration === selectedVehicle)?.chargeCount || 0;
                const otherVehicles = uploadSummary.fleetVehiclesFound.filter((v) => v.registration !== selectedVehicle);
                const otherTxsCount = otherVehicles.reduce((sum, v) => sum + v.chargeCount, 0);
                return (
                  <div className="space-y-4">
                    <div className="p-4 bg-brand-500/5 rounded-xl border border-brand-200 space-y-1.5 text-xs text-brand-850">
                      <p className="font-bold flex items-center gap-1"><Landmark className="h-4 w-4" /> Selected Vehicle comparison</p>
                      <p className="text-slate-500">Only transactions for <span className="font-mono font-bold text-brand-700">{selectedVehicle}</span> will be checked.</p>
                      <div className="pt-2 flex justify-between text-3xs font-mono">
                        <span>Transactions for {selectedVehicle}:</span>
                        <span className="font-bold">{sameVehicleTxsCount} transactions</span>
                      </div>
                      <div className="flex justify-between text-3xs font-mono">
                        <span>Excluded other vehicle charges:</span>
                        <span className="font-bold text-slate-500">{otherTxsCount} transactions ({otherVehicles.length} vehicles)</span>
                      </div>
                    </div>
                    {otherVehicles.length > 0 && (
                      <div className="text-3xs text-slate-400 italic">
                        * Charges for other fleet vehicles ({otherVehicles.map((v) => v.registration).join(', ')}) are excluded. Return to Step 2 and upload the matching GPS file to verify those.
                      </div>
                    )}
                  </div>
                );
              })()}

              {checkError && <UploadErrorPanel {...checkError} />}

              <div className="flex gap-2">
                <button onClick={() => setStep(2)} className="btn btn-secondary w-full py-3 text-xs" disabled={submitting}>Back</button>
                <button
                  onClick={handleRunCheck}
                  className="btn btn-primary w-full py-3 text-xs font-semibold flex items-center justify-center gap-1.5"
                  disabled={!selectedVehicle || submitting}
                >
                  {submitting
                    ? <><Loader2 className="h-4.5 w-4.5 animate-spin" /> Verifying…</>
                    : <>Verify Telematics <ArrowRight className="h-4.5 w-4.5" /></>}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
