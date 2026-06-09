'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import {
  Layers,
  Upload,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Truck,
  FileText,
  Clock,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Trash2,
  Info,
  ShieldCheck,
  Satellite,
  BarChart2,
  ArrowRight,
  ClipboardList,
} from 'lucide-react';

interface VehicleStatus {
  registration: string;
  chargeCount: number;
  gpsAttached?: boolean;
  gpsFileName?: string;
  gpsStatus?: string;
  checkStatus?: string;
  checkResults?: any;
}

interface BatchRecord {
  id: string;
  provider: string;
  filename: string;
  uploadDate: string;
  vehicles: string[];
  vehicleStatuses?: Record<string, string>;
  attachedGpsFiles?: Array<{
    vehicleRegistration: string;
    fileName: string;
    coverageStart: string;
    coverageEnd: string;
  }>;
  checkResults?: Record<string, any>;
  chargeSummary?: {
    totalChargesCount: number;
    totalFuelVolume: number;
    totalAmountExVatByCurrency: Record<string, number>;
  };
  status: string;
}

const statusColor = (status?: string) => {
  if (!status) return 'bg-slate-100 dark:bg-surface-200 text-slate-500';
  if (status === 'Check completed') return 'bg-green-500/10 text-green-700';
  if (status === 'Review required') return 'bg-amber-500/10 text-amber-700';
  if (status === 'GPS coverage incomplete') return 'bg-orange-500/10 text-orange-700';
  return 'bg-slate-100 dark:bg-surface-200 text-slate-500';
};

const checkStatusIcon = (status?: string) => {
  if (status === 'Check completed') return <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />;
  if (status === 'Review required') return <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />;
  if (status === 'GPS coverage incomplete') return <Info className="h-3.5 w-3.5 text-orange-600" />;
  return <Satellite className="h-3.5 w-3.5 text-slate-400" />;
};

function GpsDropZone({ batchId, vehicleReg, onDone }: { batchId: string; vehicleReg: string; onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setLoading(true);
    setError('');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`/api/batches/${batchId}/upload-gps`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        onDone();
      } else {
        setError(data.errors?.[0] || data.error || 'GPS upload failed');
      }
    } catch {
      setError('Upload request failed');
    } finally {
      setLoading(false);
    }
  }, [batchId, onDone]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    multiple: false,
    onDrop,
  });

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-500/5 border border-brand-200 text-xs text-brand-700">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>Processing GPS file…</span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div
        {...getRootProps()}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed cursor-pointer transition text-xs ${
          isDragActive
            ? 'border-brand-400 bg-brand-500/5 text-brand-700'
            : 'border-slate-300 dark:border-surface-300 hover:border-brand-400 hover:bg-brand-500/5 text-slate-500'
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="h-3 w-3 shrink-0" />
        <span>Drop GPS file for {vehicleReg}</span>
      </div>
      {error && <p className="text-3xs text-red-600 font-medium">{error}</p>}
    </div>
  );
}

function VehicleResultSummary({ result }: { result: any }) {
  if (!result) return null;
  const { supported = 0, likelySupported = 0, unsupported = 0, insufficient = 0, reviewRequired = 0, results = [] } = result;
  const total = supported + likelySupported + unsupported + insufficient + reviewRequired;

  return (
    <div className="mt-3 space-y-2">
      <div className="grid grid-cols-5 gap-1 text-center">
        {[
          { label: 'Supported', val: supported, color: 'text-green-700 bg-green-500/10' },
          { label: 'Likely', val: likelySupported, color: 'text-brand-700 bg-brand-500/10' },
          { label: 'Insufficient', val: insufficient, color: 'text-slate-600 bg-slate-100 dark:bg-surface-200' },
          { label: 'Not Supported', val: unsupported, color: 'text-red-700 bg-red-500/10' },
          { label: 'Review', val: reviewRequired, color: 'text-amber-700 bg-amber-500/10' },
        ].map((item) => (
          <div key={item.label} className={`rounded-lg p-1.5 ${item.color}`}>
            <p className="text-base font-black">{item.val}</p>
            <p className="text-3xs font-medium leading-tight">{item.label}</p>
          </div>
        ))}
      </div>
      {results.length > 0 && (
        <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg border border-slate-200 dark:border-surface-300 divide-y divide-slate-100 dark:divide-surface-200">
          {results.map((r: any, i: number) => (
            <div key={i} className="px-3 py-1.5 flex justify-between items-center gap-2 text-3xs">
              <div className="flex-1 min-w-0">
                <span className="font-mono text-slate-600">{r.transactionDate}</span>
                <span className="mx-1.5 text-slate-300">·</span>
                <span className="text-slate-700 truncate">{r.stationName || 'Unknown'}</span>
                <span className="mx-1.5 text-slate-300">·</span>
                <span className="font-medium text-slate-600">{parseFloat(r.quantity || '0').toFixed(1)}L</span>
              </div>
              <span className={`shrink-0 badge text-3xs font-semibold px-2 py-0.5 rounded-full ${
                r.simpleStatus === 'Supported' ? 'bg-green-500/10 text-green-700' :
                r.simpleStatus === 'Likely supported' ? 'bg-brand-500/10 text-brand-700' :
                r.simpleStatus === 'Not supported' ? 'bg-red-500/10 text-red-700' :
                'bg-amber-500/10 text-amber-700'
              }`}>
                {r.simpleStatus}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BatchCard({ batch, onRefresh }: { batch: BatchRecord; onRefresh: () => void }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const vehicleStatuses = batch.vehicleStatuses || {};
  const attachedGpsFiles = batch.attachedGpsFiles || [];
  const checkResults = batch.checkResults || {};

  const checkedCount = Object.values(vehicleStatuses).filter((s) => s === 'Check completed').length;
  const pendingCount = batch.vehicles.length - attachedGpsFiles.length;
  const hasIssues = Object.values(vehicleStatuses).some((s) => s === 'Review required' || s === 'GPS coverage incomplete');

  const handleDelete = async () => {
    if (!confirm('Delete this batch and all its data?')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/batches/${batch.id}`, { method: 'DELETE' });
      if (res.ok) onRefresh();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={`card overflow-hidden border-l-4 transition-all ${
      checkedCount === batch.vehicles.length ? 'border-l-green-600' :
      hasIssues ? 'border-l-amber-500' :
      'border-l-brand-600'
    }`}>
      {/* Batch Header */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-surface-100 transition"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="badge bg-brand-500/10 text-brand-700 text-3xs font-bold px-2 py-0.5 rounded">
              {batch.provider}
            </span>
            <span className="text-sm font-bold text-slate-900 dark:text-surface-950 truncate">{batch.filename}</span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-3xs text-slate-400 flex-wrap">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(batch.uploadDate).toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <Truck className="h-3 w-3" />
              {batch.vehicles.length} vehicles
            </span>
            {batch.chargeSummary && (
              <span className="flex items-center gap-1">
                <ClipboardList className="h-3 w-3" />
                {batch.chargeSummary.totalChargesCount} transactions
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Status pills */}
          <div className="hidden sm:flex gap-1.5">
            {checkedCount > 0 && (
              <span className="badge bg-green-500/10 text-green-700 text-3xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {checkedCount} checked
              </span>
            )}
            {pendingCount > 0 && (
              <span className="badge bg-slate-100 dark:bg-surface-200 text-slate-500 text-3xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                <Satellite className="h-3 w-3" />
                {pendingCount} pending GPS
              </span>
            )}
            {hasIssues && (
              <span className="badge bg-amber-500/10 text-amber-700 text-3xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Needs review
              </span>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
            disabled={deleting}
            className="p-1.5 rounded hover:bg-red-500/10 text-slate-400 hover:text-red-600 transition"
            title="Delete batch"
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
          {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        </div>
      </div>

      {/* Expanded Vehicle Grid */}
      {expanded && (
        <div className="border-t border-slate-200 dark:border-surface-300 p-4 space-y-3 animate-slide-down">
          <h4 className="text-xs font-bold text-slate-500 dark:text-surface-600 uppercase tracking-wider flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5" />
            Fleet Vehicles in Batch
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {batch.vehicles.map((reg) => {
              const gpsAttachment = attachedGpsFiles.find((a: any) => a.vehicleRegistration === reg);
              const status = vehicleStatuses[reg];
              const result = checkResults[reg];

              return (
                <div
                  key={reg}
                  className={`rounded-xl border p-3 space-y-2 ${
                    status === 'Check completed' ? 'border-green-200 bg-green-500/3' :
                    status === 'Review required' ? 'border-amber-200 bg-amber-500/3' :
                    status === 'GPS coverage incomplete' ? 'border-orange-200 bg-orange-500/3' :
                    'border-slate-200 dark:border-surface-300'
                  }`}
                >
                  {/* Vehicle header */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black font-mono tracking-tight text-slate-800 dark:text-surface-950 bg-slate-100 dark:bg-surface-200 px-2 py-0.5 rounded">
                      {reg}
                    </span>
                    <div className="flex items-center gap-1">
                      {checkStatusIcon(status)}
                      {status && (
                        <span className={`text-3xs font-semibold px-2 py-0.5 rounded-full ${statusColor(status)}`}>
                          {status}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* GPS attachment info */}
                  {gpsAttachment ? (
                    <div className="flex items-start gap-1.5 text-3xs text-slate-500 bg-slate-50 dark:bg-surface-100 rounded-lg px-2.5 py-2">
                      <Satellite className="h-3 w-3 text-brand-600 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-700 truncate">{gpsAttachment.fileName}</p>
                        <p className="text-4xs text-slate-400">
                          {gpsAttachment.coverageStart ? new Date(gpsAttachment.coverageStart).toLocaleDateString() : '—'} –{' '}
                          {gpsAttachment.coverageEnd ? new Date(gpsAttachment.coverageEnd).toLocaleDateString() : '—'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <GpsDropZone batchId={batch.id} vehicleReg={reg} onDone={onRefresh} />
                  )}

                  {/* Results summary */}
                  {result && <VehicleResultSummary result={result} />}

                  {/* View results link */}
                  {result && (
                    <button
                      onClick={() => router.push(`/batches/${batch.id}/vehicle/${encodeURIComponent(reg)}`)}
                      className="btn btn-secondary w-full text-3xs py-1.5 flex items-center justify-center gap-1 mt-1"
                    >
                      View Full Results <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bulk GPS upload hint */}
          {pendingCount > 0 && (
            <BulkGpsDropZone batchId={batch.id} onDone={onRefresh} pendingCount={pendingCount} />
          )}
        </div>
      )}
    </div>
  );
}

function BulkGpsDropZone({ batchId, pendingCount, onDone }: { batchId: string; pendingCount: number; onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [processed, setProcessed] = useState(0);

  const onDrop = useCallback(async (files: File[]) => {
    setLoading(true);
    setErrors([]);
    setProcessed(0);
    const formData = new FormData();
    for (const file of files) {
      formData.append('file', file);
    }
    try {
      const res = await fetch(`/api/batches/${batchId}/upload-gps`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.processedCount > 0) {
        setProcessed(data.processedCount);
        onDone();
      }
      if (data.errors?.length > 0) {
        setErrors(data.errors);
      }
    } catch {
      setErrors(['Upload request failed']);
    } finally {
      setLoading(false);
    }
  }, [batchId, onDone]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    multiple: true,
    onDrop,
  });

  return (
    <div className="space-y-2">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition ${
          isDragActive
            ? 'border-brand-400 bg-brand-500/5'
            : 'border-slate-200 dark:border-surface-300 hover:border-brand-400 hover:bg-brand-500/5'
        }`}
      >
        <input {...getInputProps()} />
        {loading ? (
          <div className="flex items-center justify-center gap-2 text-xs text-brand-700">
            <Loader2 className="h-4 w-4 animate-spin" />
            Processing GPS files…
          </div>
        ) : (
          <>
            <Upload className="h-5 w-5 text-slate-400 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-700 dark:text-surface-800">
              Drag GPS files here to check all {pendingCount} remaining vehicles at once
            </p>
            <p className="text-3xs text-slate-400 mt-1">
              Drop multiple XLS / XLSX files — each file will be matched to its vehicle automatically
            </p>
          </>
        )}
      </div>
      {errors.length > 0 && (
        <div className="space-y-1 text-3xs text-amber-700 bg-amber-500/5 border border-amber-200 rounded-xl px-3 py-2">
          <p className="font-bold flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Upload warnings:</p>
          {errors.map((e, i) => <p key={i}>• {e}</p>)}
        </div>
      )}
    </div>
  );
}

export default function BatchesPage() {
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/batches');
      const data = await res.json();
      setBatches(data.batches || []);
    } catch {
      setError('Could not load batches');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6 text-slate-800 dark:text-surface-900 animate-fade-in">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-surface-950 tracking-tight flex items-center gap-2">
            <Layers className="h-6 w-6 text-brand-600" />
            Transaction Batches
          </h1>
          <p className="text-xs text-slate-500 dark:text-surface-600 mt-1">
            Manage uploaded invoice batches and attach GPS telematics files per vehicle
          </p>
        </div>
        <button
          onClick={fetchBatches}
          className="btn btn-secondary py-2 px-3 text-xs flex items-center gap-1.5"
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Workflow hint */}
      <div className="bg-brand-500/5 border border-brand-200 rounded-xl px-4 py-3 flex items-start gap-3">
        <Info className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
        <div className="text-xs text-brand-900 dark:text-brand-200 space-y-1">
          <p className="font-bold">How batches work</p>
          <p className="text-brand-700 dark:text-brand-300 text-3xs">
            Each time you upload an AS24 invoice or DKV file, a transaction batch is created automatically.
            Expand a batch below, then drop a GPS telematics file for each vehicle to run the verification check.
            You can drop multiple GPS files at once — each will be matched to its vehicle automatically.
          </p>
        </div>
      </div>

      {/* Loading / error */}
      {loading && (
        <div className="card flex flex-col items-center justify-center py-16 space-y-3">
          <Loader2 className="h-8 w-8 text-brand-600 animate-spin" />
          <p className="text-xs text-slate-500">Loading batches…</p>
        </div>
      )}

      {!loading && error && (
        <div className="card flex items-center gap-3 text-red-700 text-sm p-5">
          <XCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && batches.length === 0 && (
        <div className="card flex flex-col items-center justify-center py-20 space-y-4 text-center">
          <div className="h-16 w-16 rounded-2xl bg-slate-100 dark:bg-surface-200 flex items-center justify-center">
            <FileText className="h-8 w-8 text-slate-400" />
          </div>
          <div className="space-y-1">
            <p className="text-base font-bold text-slate-700 dark:text-surface-800">No transaction batches yet</p>
            <p className="text-xs text-slate-400 max-w-xs">
              Upload an AS24 PDF invoice or DKV file from the AS24 Check or DKV Check pages to create your first batch.
            </p>
          </div>
          <div className="flex gap-2">
            <a href="/as24-check" className="btn btn-primary text-xs py-2 px-4 flex items-center gap-1.5">
              <Upload className="h-3.5 w-3.5" />
              Upload AS24 Invoice
            </a>
            <a href="/dkv-check" className="btn btn-secondary text-xs py-2 px-4 flex items-center gap-1.5">
              <Upload className="h-3.5 w-3.5" />
              Upload DKV File
            </a>
          </div>
        </div>
      )}

      {!loading && !error && batches.length > 0 && (
        <div className="space-y-4">
          {/* Summary stats bar */}
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: 'Total Batches',
                val: batches.length,
                icon: <Layers className="h-4 w-4 text-brand-600" />,
                color: 'bg-brand-500/5 border-brand-200',
              },
              {
                label: 'Total Vehicles',
                val: batches.reduce((acc, b) => acc + b.vehicles.length, 0),
                icon: <Truck className="h-4 w-4 text-green-600" />,
                color: 'bg-green-500/5 border-green-200',
              },
              {
                label: 'Pending GPS',
                val: batches.reduce((acc, b) => {
                  const attached = (b.attachedGpsFiles || []).length;
                  return acc + Math.max(0, b.vehicles.length - attached);
                }, 0),
                icon: <Satellite className="h-4 w-4 text-amber-600" />,
                color: 'bg-amber-500/5 border-amber-200',
              },
            ].map((stat) => (
              <div key={stat.label} className={`card border p-4 flex items-center gap-3 ${stat.color}`}>
                {stat.icon}
                <div>
                  <p className="text-xl font-black text-slate-900 dark:text-surface-950 leading-none">{stat.val}</p>
                  <p className="text-3xs text-slate-500 font-medium mt-0.5">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Batch list */}
          <div className="space-y-3">
            {batches.map((batch) => (
              <BatchCard key={batch.id} batch={batch} onRefresh={fetchBatches} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
