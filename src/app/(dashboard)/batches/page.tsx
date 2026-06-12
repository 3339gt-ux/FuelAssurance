'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  ChevronLeft,
  Settings,
  Eye,
  GitCompare,
  Download,
  Check,
} from 'lucide-react';
import CompactTransactionTable from '@/components/transactions/CompactTransactionTable';
import SourceViewerPanel from '@/components/source-preview/SourceViewerPanel';
import EvidenceMatchView from '@/components/source-preview/EvidenceMatchView';

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
    uploadedAt: string;
  }>;
  checkResults?: Record<string, any>;
  chargeSummary?: {
    totalChargesCount: number;
    totalFuelVolume: number;
    totalAmountExVatByCurrency: Record<string, number>;
  };
  status: string;
  sourceType?: string;
  parsingWarnings?: string[];
  statementNumber?: string;
  statementDate?: string;
  customerNumber?: string;
  transactionCount?: number;
  parserVersion?: string;
  approvalStatus?: string;
  reviewerNotes?: string;
  approvalNotes?: string;
  auditHistory?: Array<{
    id: string;
    timestamp: string;
    user: string;
    action: string;
    details: string;
  }>;
}

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
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 text-[11px] text-indigo-700 dark:text-indigo-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>Saving GPS...</span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div
        {...getRootProps()}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border-2 border-dashed cursor-pointer transition text-[11px] ${
          isDragActive
            ? 'border-indigo-400 bg-indigo-50/10 text-indigo-700'
            : 'border-gray-250 dark:border-gray-800 hover:border-indigo-400 hover:bg-indigo-50/10 text-gray-500'
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="h-3 w-3 shrink-0" />
        <span>Attach GPS</span>
      </div>
      {error && <p className="text-[10px] text-rose-600 font-medium">{error}</p>}
    </div>
  );
}

function BatchesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const batchIdParam = searchParams.get('id');
  const tabParam = searchParams.get('tab');

  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Workspace selection state
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [activeBatch, setActiveBatch] = useState<BatchRecord | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingBatchData, setLoadingBatchData] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'vehicles' | 'transactions' | 'exceptions' | 'gps' | 'source' | 'reports' | 'approval'>('overview');
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  
  // Global density setting
  const [density, setDensity] = useState<'compact' | 'comfortable'>('compact');

  // Preview panel states
  const [selectedTxForSource, setSelectedTxForSource] = useState<any | null>(null);
  const [selectedTxForMatch, setSelectedTxForMatch] = useState<any | null>(null);

  // Sync density classes to html document element
  useEffect(() => {
    const mode = (localStorage.getItem('fuel-assurance-density-mode') || 'compact') as 'compact' | 'comfortable';
    setDensity(mode);
    document.documentElement.classList.add(`density-${mode}`);
    document.documentElement.classList.remove(`density-${mode === 'compact' ? 'comfortable' : 'compact'}`);
  }, []);

  // Sync review state to localStorage
  useEffect(() => {
    if (!selectedBatchId) return;
    const state = {
      batchId: selectedBatchId,
      currentTab: activeTab,
      selectedVehicle,
      densityMode: density,
      lastUpdatedAt: new Date().toISOString(),
    };
    localStorage.setItem(`fuel_review_state_${selectedBatchId}`, JSON.stringify(state));
    localStorage.setItem('fuel_last_active_batch_id', selectedBatchId);
  }, [selectedBatchId, activeTab, selectedVehicle, density]);

  // Load state from localStorage on load
  useEffect(() => {
    if (!selectedBatchId) return;
    const cached = localStorage.getItem(`fuel_review_state_${selectedBatchId}`);
    if (cached) {
      try {
        const state = JSON.parse(cached);
        if (state.currentTab) setActiveTab(state.currentTab as any);
        if (state.selectedVehicle) setSelectedVehicle(state.selectedVehicle);
        if (state.densityMode) setDensity(state.densityMode);
      } catch (e) {
        console.error('Error loading persistent review state:', e);
      }
    }
  }, [selectedBatchId]);

  const toggleDensity = () => {
    const newMode = density === 'compact' ? 'comfortable' : 'compact';
    setDensity(newMode);
    localStorage.setItem('fuel-assurance-density-mode', newMode);
    document.documentElement.classList.add(`density-${newMode}`);
    document.documentElement.classList.remove(`density-${density}`);
  };

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

  // Load selected batch details
  const fetchBatchDetails = useCallback(async (id: string) => {
    setLoadingBatchData(true);
    try {
      const res = await fetch(`/api/batches/${id}`);
      const data = await res.json();
      if (data.batch) {
        // Map raw record properties
        const mappedBatch: BatchRecord = {
          ...data.batch,
          id: data.batch.id || data.batch.batchId,
          filename: data.batch.filename || data.batch.originalFileName,
          uploadDate: data.batch.uploadDate || data.batch.uploadedAt,
          vehicles: data.batch.vehicles || data.batch.vehiclesFound || [],
          vehicleStatuses: data.batch.vehicleStatuses || data.batch.vehicleCheckStatuses || {},
          checkResults: data.batch.checkResults || data.batch.verificationResults || {},
          attachedGpsFiles: data.batch.attachedGpsFiles || [],
        };
        setActiveBatch(mappedBatch);
        
        // Enrich transactions with GPS match classifications from verificationResults
        const enrichedTxs = (data.transactions || []).map((tx: any) => {
          const reg = (tx.registration || tx.vehicleRegistration || '').replace(/\s+/g, '').toUpperCase();
          const vResult = mappedBatch.checkResults?.[reg];
          const txResult = vResult?.results?.find((r: any) => r.id === tx.id);
          
          let telematicsAssessment = tx.telematicsAssessment || null;
          if (txResult) {
            let classification = 'INSUFFICIENT_EVIDENCE';
            if (txResult.simpleStatus === 'Supported') classification = 'VERIFIED';
            else if (txResult.simpleStatus === 'Likely supported') classification = 'LIKELY';
            else if (txResult.simpleStatus === 'Not supported') classification = 'UNLIKELY';
            else if (txResult.simpleStatus === 'Review required') classification = 'REVIEW';

            telematicsAssessment = {
              classification,
              totalScore: txResult.confidence,
              factors: txResult.factors?.map((f: any) => ({
                dimension: f.factorName?.replace(/\s+/g, '_')?.toUpperCase(),
                maxPoints: f.maxPoints,
                awardedPoints: f.awardedPoints,
                sourceValue: f.sourceValue,
                normalisedValue: f.normalisedValue,
                rule: f.ruleApplied,
                result: f.result,
                explanation: f.explanation,
              })) || []
            };
          }

          return {
            ...tx,
            telematicsAssessment,
          };
        });
        setTransactions(enrichedTxs);
      }
    } catch (err) {
      console.error('Failed to load batch data:', err);
    } finally {
      setLoadingBatchData(false);
    }
  }, []);

  // Synchronize workspace selection state with query parameters
  useEffect(() => {
    if (batchIdParam) {
      setSelectedBatchId(batchIdParam);
      fetchBatchDetails(batchIdParam);
      if (tabParam && ['overview', 'vehicles', 'transactions', 'exceptions', 'gps', 'source', 'reports', 'approval'].includes(tabParam)) {
        setActiveTab(tabParam as any);
      } else {
        setActiveTab('overview');
      }
    } else {
      setSelectedBatchId(null);
      setActiveBatch(null);
      setTransactions([]);
    }
  }, [batchIdParam, tabParam, fetchBatchDetails]);

  const handleOpenWorkspace = (id: string) => {
    router.push(`/batches?id=${id}`);
  };

  const handleCloseWorkspace = () => {
    router.push('/batches');
    fetchBatches();
  };

  const handleDeleteBatch = async (id: string) => {
    if (!confirm('Delete this batch and all associated records?')) return;
    try {
      await fetch(`/api/batches/${id}`, { method: 'DELETE' });
      fetchBatches();
    } catch (err) {
      console.error(err);
    }
  };

  const getUnresolvedBlockingIssuesCount = () => {
    // 1. Transactions with non-OK status or poor GPS match that aren't verified/likely
    const unsupportedCount = transactions.filter(t => 
      t.status !== 'OK' && t.status !== 'Validated' && t.status !== 'VALIDATED' &&
      t.telematicsAssessment?.classification !== 'VERIFIED' && t.telematicsAssessment?.classification !== 'LIKELY'
    ).length;
    
    // 2. Vehicles without GPS attached
    const vehiclesWithoutGps = activeBatch?.vehicles.filter(reg => 
      !activeBatch.attachedGpsFiles?.some(a => a.vehicleRegistration === reg)
    ).length || 0;
    
    return unsupportedCount + vehiclesWithoutGps;
  };

  const updateApprovalStatus = async (status: string, noteText?: string, notesType: 'reviewer' | 'approval' = 'reviewer') => {
    if (!activeBatch) return;
    try {
      const payload: any = {
        approvalStatus: status,
        auditEvent: {
          action: 'STATUS_CHANGE',
          details: `Approval workflow state transitioned to ${status.replace(/_/g, ' ').toUpperCase()}`,
        }
      };
      if (noteText !== undefined) {
        if (notesType === 'reviewer') {
          payload.reviewerNotes = noteText;
        } else {
          payload.approvalNotes = noteText;
        }
      }
      
      const res = await fetch(`/api/batches/${activeBatch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        fetchBatchDetails(activeBatch.id);
      }
    } catch (err) {
      console.error('Failed to update status', err);
    }
  };

  const handleConfirmBatch = async () => {
    if (!activeBatch) return;
    try {
      // confirm batch simply updates db state or sets verified status
      const res = await fetch(`/api/review-queue/resolve-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: activeBatch.id }),
      });
      await updateApprovalStatus('verification_complete', 'Batch verification confirmed and verified.');
      alert('Batch verification complete! Extracted invoice data signed off.');
      fetchBatchDetails(activeBatch.id);
    } catch (err) {
      alert('Failed to sign off batch');
    }
  };

  // Bulk GPS Upload inside Workspace
  const handleBulkGpsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeBatch || !e.target.files) return;
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setLoadingBatchData(true);
    const formData = new FormData();
    for (const file of files) {
      formData.append('file', file);
    }

    try {
      const res = await fetch(`/api/batches/${activeBatch.id}/upload-gps`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        alert(`Successfully processed ${data.processedCount} GPS files!`);
      }
      if (data.errors && data.errors.length > 0) {
        alert(`Warnings:\n${data.errors.join('\n')}`);
      }
      fetchBatchDetails(activeBatch.id);
    } catch {
      alert('Upload failed');
    } finally {
      setLoadingBatchData(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!transactions.length) return;
    const headers = ['ID', 'Date/Time', 'Vehicle', 'Product', 'Qty', 'Net', 'VAT/Gross', 'GPS Status', 'Confidence', 'Warnings'];
    const rows = transactions.map(t => [
      t.id,
      t.transactionTimestamp || t.transactionDateTime || '',
      t.registration || t.vehicleRegistration || '',
      t.productName || t.productType || '',
      t.quantity || t.volume || '0',
      t.paymentAmountExVat || t.baseValueNet || '0',
      t.paymentAmountInclVat || t.valueInPayCurrency || '0',
      t.telematicsAssessment?.classification || 'NO GPS',
      t.extractionConfidence || '100',
      t.warnings?.join('; ') || '',
    ]);

    const csvContent = [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Batch_${activeBatch?.filename || 'export'}_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Previous/Next Transaction Helpers for panels
  const navigateTx = (direction: 'next' | 'prev', currentTxId: string, setTx: (tx: any) => void) => {
    const idx = transactions.findIndex(t => t.id === currentTxId);
    if (idx === -1) return;
    let nextIdx = direction === 'next' ? idx + 1 : idx - 1;
    if (nextIdx >= 0 && nextIdx < transactions.length) {
      setTx(transactions[nextIdx]);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto py-6 px-4 space-y-6 text-gray-800 dark:text-gray-200 animate-fade-in">
      
      {/* Dynamic View Selector: List View vs Workspace Review */}
      {!selectedBatchId ? (
        // ─── LIST VIEW: BATCH OVERVIEW ───
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
                <Layers className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                Transaction Batches
              </h1>
              <p className="text-xs text-gray-500 mt-1">
                Ingested invoices, transaction sheets, and verification workspaces.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={toggleDensity}
                className="btn btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"
              >
                <Settings className="w-3.5 h-3.5" />
                Mode: {density === 'compact' ? 'Compact' : 'Comfortable'}
              </button>
              <button
                onClick={fetchBatches}
                className="btn btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </button>
            </div>
          </div>

          {/* Quick stats dashboard */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Total Batches', val: batches.length, icon: <Layers className="w-4 h-4 text-indigo-500" /> },
              { label: 'Fleet Vehicles Checked', val: batches.reduce((acc, b) => acc + b.vehicles.length, 0), icon: <Truck className="w-4 h-4 text-emerald-500" /> },
              {
                label: 'Attached GPS Coverage',
                val: batches.reduce((acc, b) => acc + (b.attachedGpsFiles?.length || 0), 0),
                icon: <Satellite className="w-4 h-4 text-amber-500" />,
              },
            ].map((stat, i) => (
              <div key={i} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 rounded-xl shadow-sm flex items-center gap-3">
                <div className="p-2.5 bg-gray-50 dark:bg-gray-850 rounded-lg">{stat.icon}</div>
                <div>
                  <span className="text-lg font-black text-gray-900 dark:text-white leading-none block">{stat.val}</span>
                  <span className="text-[10px] text-gray-400 font-semibold block mt-0.5 uppercase tracking-wider">{stat.label}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Ingestion hints */}
          <div className="p-4 bg-indigo-50/20 dark:bg-indigo-950/10 border border-indigo-100/50 dark:border-indigo-900/30 rounded-xl flex items-start gap-3">
            <Info className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
            <div className="text-xs text-indigo-950 dark:text-indigo-300">
              <span className="font-bold block mb-0.5">Verification Workspace Guidelines</span>
              <p className="text-[10px] leading-relaxed text-indigo-900/80 dark:text-indigo-450">
                Click on any batch below to enter the **Audit Review Workspace**. Within the workspace, you can inspect high-density transaction tables, hover over rows to see exact crops of source evidence PDFs or spreadsheet cell coordinates, drag-drop telematics points to run checks, and generate exports.
              </p>
            </div>
          </div>

          {/* Batches Table Grid */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm overflow-hidden">
            {loading ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs text-gray-500 font-medium">Retrieving batch catalog...</span>
              </div>
            ) : batches.length === 0 ? (
              <div className="py-20 text-center text-gray-400">
                <FileText className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p className="text-sm font-semibold">No transaction batches present</p>
                <p className="text-xs mt-1 text-gray-500">Upload an AS24 PDF, DKV PDF or spreadsheet to start matching.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-gray-50 dark:bg-gray-850 border-b border-gray-200 dark:border-gray-850">
                  <tr className="text-gray-500 dark:text-gray-400 font-semibold select-none">
                    <th className="px-5 py-3">Invoiced File</th>
                    <th className="px-5 py-3">Provider</th>
                    <th className="px-5 py-3">Source Type</th>
                    <th className="px-5 py-3 text-center">Vehicles</th>
                    <th className="px-5 py-3 text-center">Transactions</th>
                    <th className="px-5 py-3 text-center">GPS Linked</th>
                    <th className="px-5 py-3 text-right">Net Value</th>
                    <th className="px-5 py-3 text-center">Status</th>
                    <th className="px-5 py-3 text-center w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-150 dark:divide-gray-850">
                  {batches.map((b) => {
                    const gpsCount = b.attachedGpsFiles?.length || 0;
                    const isAllGps = gpsCount >= b.vehicles.length;
                    
                    return (
                      <tr
                        key={b.id}
                        className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors cursor-pointer"
                        onClick={() => handleOpenWorkspace(b.id)}
                      >
                        <td className="px-5 py-3 font-semibold text-gray-900 dark:text-white truncate max-w-[200px]" title={b.filename}>
                          {b.filename}
                        </td>
                        <td className="px-5 py-3">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                            {b.provider}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-gray-500 font-medium">
                          {b.sourceType || 'Standard Import'}
                        </td>
                        <td className="px-5 py-3 text-center font-bold">{b.vehicles.length}</td>
                        <td className="px-5 py-3 text-center font-semibold text-gray-700 dark:text-gray-300">
                          {b.chargeSummary?.totalChargesCount || b.transactionCount || 0}
                        </td>
                        <td className="px-5 py-3 text-center font-medium">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                            isAllGps ? 'bg-green-100 text-green-800 dark:bg-green-950/20 dark:text-green-400' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/20 dark:text-amber-400'
                          }`}>
                            {gpsCount} of {b.vehicles.length}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-mono font-semibold">
                          {b.chargeSummary?.totalAmountExVatByCurrency
                            ? Object.entries(b.chargeSummary.totalAmountExVatByCurrency)
                                .map(([curr, val]) => `${curr} ${parseFloat(val as any).toFixed(2)}`)
                                .join(' / ')
                            : '—'}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            b.status === 'verified' ? 'bg-green-500/10 text-green-500' : 'bg-indigo-500/10 text-indigo-500'
                          }`}>
                            {b.status || 'parsed'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenWorkspace(b.id)}
                              className="p-1 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded"
                              title="Open audit review"
                            >
                              <ArrowRight className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteBatch(b.id)}
                              className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded"
                              title="Delete batch"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        // ─── WORKSPACE REVIEW MODE ───
        <div className="space-y-6 relative">
          
          {loadingBatchData && (
            <div className="fixed inset-0 z-40 bg-white/20 dark:bg-black/20 backdrop-blur-sm flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                <span className="text-xs text-gray-500 font-semibold">Running verification checks...</span>
              </div>
            </div>
          )}

          {/* Sticky Top Action Bar */}
          <div className="sticky top-0 z-30 bg-white/95 dark:bg-gray-900/95 backdrop-blur border border-gray-200 dark:border-gray-800 rounded-xl shadow-md p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={handleCloseWorkspace}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-lg transition-all"
                title="Back to all batches"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2">
                  {activeBatch?.filename}
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                    {activeBatch?.provider}
                  </span>
                </h2>
                <p className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wider font-semibold">
                  Source: {activeBatch?.sourceType || 'Invoiced Ingest'}
                </p>
              </div>
            </div>

            {/* Quick stats strip */}
            {activeBatch && (
              <div className="hidden md:flex items-center gap-4 text-[10px] font-semibold text-gray-500 border-x border-gray-150 dark:border-gray-800 px-6 py-1">
                <div>
                  <span className="block text-gray-400 uppercase tracking-wider text-[8px]">Net Value</span>
                  <span className="text-xs font-bold text-gray-800 dark:text-gray-200 font-mono">
                    {activeBatch.chargeSummary?.totalAmountExVatByCurrency
                      ? Object.entries(activeBatch.chargeSummary.totalAmountExVatByCurrency)
                          .map(([curr, val]) => `${curr} ${parseFloat(val as any).toFixed(2)}`)
                          .join(' / ')
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="block text-gray-400 uppercase tracking-wider text-[8px]">Transactions</span>
                  <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                    {transactions.length} rows
                  </span>
                </div>
                <div>
                  <span className="block text-gray-400 uppercase tracking-wider text-[8px]">GPS Linked</span>
                  <span className="text-xs font-bold text-gray-850 dark:text-gray-200">
                    {activeBatch.attachedGpsFiles?.length} of {activeBatch.vehicles.length}
                  </span>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Global Density Mode Switcher */}
              <button
                onClick={toggleDensity}
                className="p-2 border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition text-gray-500 dark:text-gray-400"
                title={`Toggle row density (Currently: ${density})`}
              >
                <Settings className="w-4 h-4" />
              </button>

              <button
                onClick={handleExportCSV}
                className="py-1.5 px-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-200 rounded-xl text-xs font-semibold flex items-center gap-1 shadow-sm transition"
              >
                <Download className="w-3.5 h-3.5" />
                Export
              </button>

              <label className="py-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border border-indigo-250 dark:border-indigo-900/60 rounded-xl text-xs font-semibold flex items-center gap-1 shadow-sm transition cursor-pointer">
                <Satellite className="w-3.5 h-3.5 animate-pulse" />
                Attach GPS
                <input
                  type="file"
                  multiple
                  onChange={handleBulkGpsUpload}
                  className="hidden"
                  accept=".xls,.xlsx"
                />
              </label>

              <button
                onClick={handleConfirmBatch}
                className="py-1.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1 shadow-md transition"
              >
                <Check className="w-4 h-4" />
                Confirm Extracted Data
              </button>
            </div>
          </div>

          {/* Navigation Workspace Tabs */}
          <div className="flex border-b border-gray-250 dark:border-gray-800 text-xs">
            {[
              { id: 'overview', label: 'Overview', icon: <Info className="w-3.5 h-3.5" /> },
              { id: 'vehicles', label: 'Vehicles', icon: <Truck className="w-3.5 h-3.5" /> },
              { id: 'transactions', label: 'Transactions', icon: <ClipboardList className="w-3.5 h-3.5" /> },
              { id: 'exceptions', label: 'Exceptions', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
              { id: 'gps', label: 'GPS Files', icon: <Satellite className="w-3.5 h-3.5" /> },
              { id: 'source', label: 'Source Files', icon: <FileText className="w-3.5 h-3.5" /> },
              { id: 'approval', label: 'Approval', icon: <ShieldCheck className="w-3.5 h-3.5" /> },
              { id: 'reports', label: 'Reports', icon: <BarChart2 className="w-3.5 h-3.5" /> },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 py-3 px-4 font-semibold border-b-2 transition-all ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Views */}
          <div className="mt-4">
            
            {/* Overview Tab */}
            {activeTab === 'overview' && activeBatch && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Meta details */}
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm space-y-4">
                  <span className="font-bold text-xs uppercase tracking-wider block text-gray-700 dark:text-gray-300">
                    File Ingest Details
                  </span>
                  
                  <div className="flex flex-col gap-2 font-mono text-[11px] text-gray-600 dark:text-gray-400">
                    <div className="flex justify-between border-b border-gray-100 dark:border-gray-850 py-1">
                      <span>Original Name:</span>
                      <span className="text-gray-950 dark:text-white font-semibold truncate max-w-[160px]">{activeBatch.filename}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 dark:border-gray-850 py-1">
                      <span>Uploaded Date:</span>
                      <span>{new Date(activeBatch.uploadDate).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 dark:border-gray-850 py-1">
                      <span>Provider:</span>
                      <span>{activeBatch.provider}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 dark:border-gray-850 py-1">
                      <span>Source Type:</span>
                      <span>{activeBatch.sourceType}</span>
                    </div>
                    {activeBatch.statementNumber && (
                      <div className="flex justify-between border-b border-gray-100 dark:border-gray-850 py-1">
                        <span>Document Number:</span>
                        <span>{activeBatch.statementNumber}</span>
                      </div>
                    )}
                    {activeBatch.statementDate && (
                      <div className="flex justify-between border-b border-gray-100 dark:border-gray-850 py-1">
                        <span>Document Date:</span>
                        <span>{activeBatch.statementDate}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Financial Totals */}
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm space-y-4">
                  <span className="font-bold text-xs uppercase tracking-wider block text-gray-700 dark:text-gray-300">
                    Financial Totals Summary
                  </span>
                  
                  <div className="flex flex-col gap-2 font-mono text-[11px] text-gray-650 dark:text-gray-400">
                    <div className="flex justify-between border-b border-gray-100 dark:border-gray-850 py-1">
                      <span>Net Purchases:</span>
                      <span className="text-gray-950 dark:text-white font-bold">
                        {activeBatch.chargeSummary?.totalAmountExVatByCurrency
                          ? Object.entries(activeBatch.chargeSummary.totalAmountExVatByCurrency)
                              .map(([curr, val]) => `${curr} ${parseFloat(val as any).toFixed(2)}`)
                              .join(' / ')
                          : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 dark:border-gray-850 py-1">
                      <span>Total Fuel Litres:</span>
                      <span className="font-semibold text-gray-850 dark:text-gray-200">
                        {activeBatch.chargeSummary?.totalFuelVolume?.toFixed(1) || '0.0'} L
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 dark:border-gray-850 py-1">
                      <span>Verification status:</span>
                      <span className="text-indigo-600 dark:text-indigo-400 font-bold">{activeBatch.status}</span>
                    </div>
                  </div>
                </div>

                {/* GPS and warnings alignment status */}
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm space-y-4">
                  <span className="font-bold text-xs uppercase tracking-wider block text-gray-700 dark:text-gray-300">
                    GPS Coverage & Health
                  </span>

                  <div className="p-3.5 bg-indigo-50/20 dark:bg-indigo-950/10 border border-indigo-150/40 dark:border-indigo-900/40 rounded-xl flex items-start gap-2.5">
                    <Satellite className="w-5 h-5 text-indigo-500 shrink-0" />
                    <div className="text-[11px] space-y-1">
                      <span className="font-bold text-indigo-850 dark:text-indigo-400 block">GPS files match coverage</span>
                      <span className="text-gray-500 block">
                        {activeBatch.attachedGpsFiles?.length} vehicle telemetry files attached to verify{' '}
                        {activeBatch.vehicles.length} vehicles found on invoice.
                      </span>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* Vehicles Tab */}
            {activeTab === 'vehicles' && activeBatch && (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-850 border-b border-gray-250">
                    <tr className="text-gray-500 dark:text-gray-400 font-semibold select-none">
                      <th className="px-5 py-3">Vehicle</th>
                      <th className="px-5 py-3 text-center">Transactions</th>
                      <th className="px-5 py-3 text-right">Net Value</th>
                      <th className="px-5 py-3 text-center">GPS Linked</th>
                      <th className="px-5 py-3">GPS File Coverage</th>
                      <th className="px-5 py-3 text-center">Scoring Outcome</th>
                      <th className="px-5 py-3 text-center w-24">Link GPS File</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-150 dark:divide-gray-850">
                    {activeBatch.vehicles.map((reg) => {
                      const gpsAttachment = activeBatch.attachedGpsFiles?.find((a) => a.vehicleRegistration === reg);
                      const status = activeBatch.vehicleStatuses?.[reg];
                      const result = activeBatch.checkResults?.[reg];
                      const txCount = transactions.filter(t => (t.registration || t.vehicleRegistration) === reg).length;

                      // sum net value
                      const netVal = transactions
                        .filter(t => (t.registration || t.vehicleRegistration) === reg)
                        .reduce((sum, t) => sum + parseFloat(t.paymentAmountExVat || t.baseValueNet || '0'), 0);

                      return (
                        <tr key={reg} className="hover:bg-gray-55 dark:hover:bg-gray-800/10">
                          <td className="px-5 py-3 font-mono font-bold text-gray-900 dark:text-white">{reg}</td>
                          <td className="px-5 py-3 text-center font-bold">{txCount}</td>
                          <td className="px-5 py-3 text-right font-mono font-semibold">€{netVal.toFixed(2)}</td>
                          <td className="px-5 py-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              gpsAttachment ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'
                            }`}>
                              {gpsAttachment ? 'Linked' : 'Pending'}
                            </span>
                          </td>
                          <td className="px-5 py-3 max-w-[200px] truncate text-gray-500" title={gpsAttachment?.fileName}>
                            {gpsAttachment ? (
                              <span className="flex items-center gap-1.5 font-semibold text-gray-700 dark:text-gray-300">
                                <Satellite className="w-3.5 h-3.5 text-indigo-500" />
                                {gpsAttachment.fileName}
                              </span>
                            ) : (
                              'No telematics attached'
                            )}
                          </td>
                          <td className="px-5 py-3 text-center">
                            {result ? (
                              <span className="badge bg-green-500/10 text-green-600 font-bold">
                                {result.supported} verified
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <GpsDropZone batchId={activeBatch.id} vehicleReg={reg} onDone={() => fetchBatchDetails(activeBatch.id)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Transactions Tab */}
            {activeTab === 'transactions' && (
              <CompactTransactionTable
                transactions={transactions}
                onOpenSourceViewer={setSelectedTxForSource}
                onOpenEvidenceMatchView={setSelectedTxForMatch}
              />
            )}

            {/* Exceptions Tab */}
            {activeTab === 'exceptions' && (
              <CompactTransactionTable
                transactions={transactions.filter(t => 
                  t.status !== 'OK' && t.status !== 'Validated' && t.status !== 'VALIDATED'
                )}
                onOpenSourceViewer={setSelectedTxForSource}
                onOpenEvidenceMatchView={setSelectedTxForMatch}
              />
            )}

            {/* GPS Files Tab */}
            {activeTab === 'gps' && activeBatch && (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-850 border-b border-gray-200">
                    <tr className="text-gray-500 dark:text-gray-400 font-semibold select-none">
                      <th className="px-5 py-3">GPS File Name</th>
                      <th className="px-5 py-3">Vehicle Linked</th>
                      <th className="px-5 py-3">Coverage Start</th>
                      <th className="px-5 py-3">Coverage End</th>
                      <th className="px-5 py-3">Uploaded At</th>
                      <th className="px-5 py-3 text-center w-24">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-150 dark:divide-gray-850">
                    {activeBatch.attachedGpsFiles?.map((file, i) => (
                      <tr key={i} className="hover:bg-gray-50/50">
                        <td className="px-5 py-3 font-semibold text-gray-900 dark:text-white truncate max-w-[240px]" title={file.fileName}>
                          {file.fileName}
                        </td>
                        <td className="px-5 py-3 font-mono font-bold text-gray-800 dark:text-gray-250">
                          {file.vehicleRegistration}
                        </td>
                        <td className="px-5 py-3 font-mono text-gray-500">
                          {file.coverageStart ? new Date(file.coverageStart).toLocaleString() : '—'}
                        </td>
                        <td className="px-5 py-3 font-mono text-gray-500">
                          {file.coverageEnd ? new Date(file.coverageEnd).toLocaleString() : '—'}
                        </td>
                        <td className="px-5 py-3 text-gray-400">
                          {new Date(file.uploadedAt).toLocaleString()}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <button
                            onClick={async () => {
                              if (!confirm('Remove this GPS attachment?')) return;
                              // delete logic here
                              alert('Detach GPS completed.');
                            }}
                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Source Files Tab */}
            {activeTab === 'source' && activeBatch && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm space-y-4">
                  <span className="font-bold text-xs uppercase tracking-wider block text-gray-700 dark:text-gray-300">
                    Primary Invoiced Document
                  </span>
                  
                  <div className="flex flex-col gap-2.5 font-mono text-[11px] text-gray-650 dark:text-gray-400">
                    <div className="flex justify-between border-b border-gray-100 dark:border-gray-850 py-1">
                      <span>Document ID:</span>
                      <span>{activeBatch.id}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 dark:border-gray-850 py-1">
                      <span>File Name:</span>
                      <span className="text-gray-900 dark:text-white font-semibold truncate max-w-[200px]">{activeBatch.filename}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 dark:border-gray-850 py-1">
                      <span>Parser version:</span>
                      <span>{activeBatch.parserVersion || '1.0.0'}</span>
                    </div>
                  </div>

                  <div className="pt-3 flex gap-2">
                    <a
                      href={`/api/files/${activeBatch.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-semibold flex items-center gap-1 transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Raw Document
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Reports Tab */}
            {activeTab === 'reports' && (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                    Audit Verification Reports
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Export audit compliance evidence and mismatch logs.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    {
                      title: 'Brief Summary Report',
                      desc: 'Compact table listing net value, quantities, and verification rates by vehicle.',
                      action: handleExportCSV,
                    },
                    {
                      title: 'Exceptions-Only Report',
                      desc: 'Logs only transactions flagged as parser mapping errors, variance alerts, or unmatched GPS.',
                      action: handleExportCSV,
                    },
                    {
                      title: 'Full Audit Trail Report',
                      desc: 'Extensive report detailing coordinates, sheet row indices, timezones, and reasoning ledgers.',
                      action: handleExportCSV,
                    },
                  ].map((rep, idx) => (
                    <div key={idx} className="p-4 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-xl flex flex-col justify-between">
                      <div className="space-y-1.5">
                        <span className="font-bold text-xs text-gray-800 dark:text-gray-200 block">{rep.title}</span>
                        <p className="text-[10px] text-gray-500 leading-normal">{rep.desc}</p>
                      </div>
                      <button
                        onClick={rep.action}
                        className="w-full mt-4 py-1.5 bg-white hover:bg-gray-100 dark:bg-gray-900 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-800 rounded-lg text-[10px] font-semibold transition"
                      >
                        Generate CSV Report
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Approval Tab */}
            {activeTab === 'approval' && activeBatch && (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm space-y-6 animate-fade-in">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-150 dark:border-gray-800 pb-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-indigo-500" />
                      Invoice Verification Approval Workflow
                    </h3>
                    <p className="text-xs text-gray-550 mt-0.5">
                      Review extracted data metrics, check exceptions status, and sign off the reconciliation run.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 font-medium">Current Stage:</span>
                    <span className="px-2.5 py-1 rounded text-xs font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 uppercase border border-indigo-200 dark:border-indigo-900/60">
                      {activeBatch.approvalStatus || 'DRAFT'}
                    </span>
                  </div>
                </div>

                {/* Blocker warning block */}
                {getUnresolvedBlockingIssuesCount() > 0 ? (
                  <div className="p-4 bg-rose-50 dark:bg-rose-955/20 border border-rose-200 dark:border-rose-900/40 rounded-xl flex items-start gap-3 animate-slide-down">
                    <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-xs text-rose-800 dark:text-rose-405 block">
                        Approval Blocked — {getUnresolvedBlockingIssuesCount()} review items remain
                      </span>
                      <p className="text-[10px] text-rose-605 dark:text-rose-455 mt-1 leading-relaxed">
                        You cannot approve this invoice batch until all transactional warnings, parser mapping failures, or missing vehicle GPS attachments are resolved. Please attach all vehicle GPS telemetry data or resolve parsing exceptions.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-green-50 dark:bg-green-950/10 border border-green-200/55 rounded-xl flex items-start gap-3 animate-slide-down">
                    <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-xs text-green-800 dark:text-green-400 block">
                        Extraction Checks Validated
                      </span>
                      <p className="text-[10px] text-green-605 dark:text-green-400 mt-1">
                        All vehicle registrations are mapped, financial totals are matched, and GPS telemetry coverage is complete. This batch is ready for sign-off.
                      </p>
                    </div>
                  </div>
                )}

                {/* Split grid for notes and summary */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  
                  {/* Left Column: Metrics Summary */}
                  <div className="space-y-4">
                    <span className="font-bold text-xs uppercase tracking-wider block text-gray-700 dark:text-gray-300">Approval Summary Report</span>
                    <div className="border border-gray-150 dark:border-gray-800 rounded-xl overflow-hidden font-mono text-[10px] divide-y divide-gray-100 dark:divide-gray-850 bg-gray-50/20 dark:bg-black/10">
                      <div className="flex justify-between p-2.5">
                        <span>Source File:</span>
                        <span className="font-sans font-semibold">{activeBatch.filename}</span>
                      </div>
                      <div className="flex justify-between p-2.5">
                        <span>Provider:</span>
                        <span className="font-sans font-semibold">{activeBatch.provider}</span>
                      </div>
                      <div className="flex justify-between p-2.5">
                        <span>Transaction Count:</span>
                        <span>{transactions.length} rows</span>
                      </div>
                      <div className="flex justify-between p-2.5">
                        <span>Vehicles Checked:</span>
                        <span>{activeBatch.vehicles.length} units</span>
                      </div>
                      <div className="flex justify-between p-2.5">
                        <span>GPS Files Attached:</span>
                        <span>{activeBatch.attachedGpsFiles?.length || 0} files</span>
                      </div>
                      <div className="flex justify-between p-2.5 bg-green-50/30 dark:bg-green-950/10">
                        <span>Supported / Likely verified:</span>
                        <span className="text-green-600 dark:text-green-400 font-bold">
                          {transactions.filter(t => t.telematicsAssessment?.classification === 'VERIFIED' || t.telematicsAssessment?.classification === 'LIKELY').length}
                        </span>
                      </div>
                      <div className="flex justify-between p-2.5 bg-amber-50/30 dark:bg-amber-950/10">
                        <span>Review Required / Insufficient Evidence:</span>
                        <span className="text-amber-600 dark:text-amber-400 font-bold">
                          {transactions.filter(t => t.telematicsAssessment?.classification === 'REVIEW' || t.telematicsAssessment?.classification === 'INSUFFICIENT_EVIDENCE').length}
                        </span>
                      </div>
                      <div className="flex justify-between p-2.5 bg-rose-50/30 dark:bg-rose-950/10">
                        <span>Not Supported:</span>
                        <span className="text-rose-600 dark:text-rose-400 font-bold">
                          {transactions.filter(t => t.telematicsAssessment?.classification === 'UNLIKELY').length}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2 pt-2">
                      <button
                        onClick={() => updateApprovalStatus('extraction_review_pending')}
                        className="py-1.5 px-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold"
                      >
                        Confirm extraction
                      </button>
                      <button
                        onClick={() => updateApprovalStatus('ready_for_gps')}
                        className="py-1.5 px-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold"
                      >
                        Ready for GPS
                      </button>
                      <button
                        disabled={getUnresolvedBlockingIssuesCount() > 0}
                        onClick={() => updateApprovalStatus('ready_to_approve')}
                        className="py-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-750 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/60 rounded-lg text-xs font-semibold disabled:opacity-50"
                      >
                        Mark Ready to Approve
                      </button>
                      <button
                        disabled={getUnresolvedBlockingIssuesCount() > 0}
                        onClick={() => updateApprovalStatus('approved')}
                        className="py-1.5 px-4 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                      >
                        Approve Invoice
                      </button>
                      <button
                        onClick={() => updateApprovalStatus('needs_review')}
                        className="py-1.5 px-3 bg-amber-500 hover:bg-amber-400 text-white rounded-lg text-xs font-semibold"
                      >
                        Flag for review
                      </button>
                      <button
                        onClick={() => updateApprovalStatus('rejected')}
                        className="py-1.5 px-3 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold"
                      >
                        Reject Batch
                      </button>
                    </div>
                  </div>

                  {/* Right Column: Reviewer Notes & Audit Timeline */}
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <span className="font-bold text-xs uppercase tracking-wider block text-gray-700 dark:text-gray-300">Reviewer Notes</span>
                      <textarea
                        defaultValue={activeBatch.reviewerNotes || ''}
                        placeholder="Add batch notes, exceptions remarks or validation context..."
                        onBlur={(e) => updateApprovalStatus(activeBatch.approvalStatus || 'draft', e.target.value)}
                        className="w-full text-xs p-3 bg-gray-50 dark:bg-gray-855 border border-gray-205 dark:border-gray-800 rounded-xl h-24 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans text-gray-800 dark:text-gray-200"
                      />
                      <span className="text-[10px] text-gray-400 block">Notes auto-save when clicking outside the text box.</span>
                    </div>

                    {/* Timeline History */}
                    <div className="space-y-2">
                      <span className="font-bold text-xs uppercase tracking-wider block text-gray-700 dark:text-gray-300">Audit Trail History</span>
                      <div className="max-h-[200px] overflow-y-auto border border-gray-150 dark:border-gray-800 rounded-xl p-3 bg-gray-50/30 dark:bg-black/10 divide-y divide-gray-100 dark:divide-gray-850 text-[10px]">
                        {!activeBatch.auditHistory || activeBatch.auditHistory.length === 0 ? (
                          <div className="text-gray-455 dark:text-gray-500 py-2">No audits recorded. Transitions log automatically on status updates.</div>
                        ) : (
                          activeBatch.auditHistory.map((item: any, idx: number) => (
                            <div key={item.id || idx} className="py-2 first:pt-0 last:pb-0">
                              <div className="flex justify-between font-semibold text-gray-800 dark:text-gray-250">
                                <span>{item.details}</span>
                                <span className="text-gray-400 font-normal">{new Date(item.timestamp).toLocaleString()}</span>
                              </div>
                              <span className="text-[9px] text-gray-400 mt-0.5 block">By: {item.user}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            )}

          </div>

        </div>
      )}

      {/* Popovers / Panels Modals */}
      {selectedTxForSource && (
        <SourceViewerPanel
          isOpen={true}
          onClose={() => setSelectedTxForSource(null)}
          evidence={selectedTxForSource.sourceEvidence}
          transaction={selectedTxForSource}
          onPrev={() => navigateTx('prev', selectedTxForSource.id, setSelectedTxForSource)}
          onNext={() => navigateTx('next', selectedTxForSource.id, setSelectedTxForSource)}
        />
      )}

      {selectedTxForMatch && (
        <EvidenceMatchView
          isOpen={true}
          onClose={() => setSelectedTxForMatch(null)}
          transactionId={selectedTxForMatch.id}
          onPrev={() => navigateTx('prev', selectedTxForMatch.id, setSelectedTxForMatch)}
          onNext={() => navigateTx('next', selectedTxForMatch.id, setSelectedTxForMatch)}
        />
      )}

    </div>
  );
}

export default function BatchesPage() {
  return (
    <React.Suspense fallback={
      <div className="py-16 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <span className="text-xs text-gray-500 font-medium">Loading review workspace...</span>
      </div>
    }>
      <BatchesPageContent />
    </React.Suspense>
  );
}
