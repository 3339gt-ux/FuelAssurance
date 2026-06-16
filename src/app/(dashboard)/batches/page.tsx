'use client';
import React, { useState, useEffect, useCallback, Suspense } from 'react';
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
  Undo,
  Calendar,
  MapPin,
  Flame,
  Search,
  Settings2,
  Activity,
  UserCheck,
  PenTool
} from 'lucide-react';
import CompactTransactionTable from '@/components/transactions/CompactTransactionTable';
import SourceViewerPanel from '@/components/source-preview/SourceViewerPanel';
import EvidenceMatchView from '@/components/source-preview/EvidenceMatchView';
import PDFPageRenderer from '@/components/source-preview/PDFPageRenderer';
import { normalizeRegistration } from '@/config/fleet-registry';
import { groupWarnings } from '@/lib/warning-grouper';

interface GPSAttachment {
  fileName: string;
  fileHash: string;
  vehicleRegistration: string;
  uploadedAt: string;
  coverageStart: string;
  coverageEnd: string;
  gpsRecordCount?: number;
  fuelLevelMin?: number;
  fuelLevelMax?: number;
  odometerMin?: number;
  odometerMax?: number;
  warnings?: string[];
}

interface BatchRecord {
  id: string;
  provider: string;
  filename: string;
  uploadDate: string;
  vehicles: string[];
  vehicleStatuses?: Record<string, string>;
  attachedGpsFiles?: GPSAttachment[];
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

interface FailedImport {
  id: string;
  fileName: string;
  errorReason: string;
  technicalDetails?: string;
  timestamp: string;
  provider: string;
}

function BatchesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const batchIdParam = searchParams.get('id');
  
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [failedImports, setFailedImports] = useState<FailedImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Workspace selection state
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [activeBatch, setActiveBatch] = useState<BatchRecord | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingBatchData, setLoadingBatchData] = useState(false);
  
  // Stepper workflow step: 1 (Upload) | 2 (Review Extracted) | 3 (Upload GPS) | 4 (Compare) | 5 (Approve/Flag)
  const [activeStep, setActiveStep] = useState<number>(1);
  const [selectedTransaction, setSelectedTransaction] = useState<any | null>(null);
  const [selectedTxEvidence, setSelectedTxEvidence] = useState<any>(null);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [timeWindowMinutes, setTimeWindowMinutes] = useState<number>(30);
  const [gpsSearch, setGpsSearch] = useState('');
  const [recomputingRowId, setRecomputingRowId] = useState<string | null>(null);
  
  // Edit dialog state
  const [editingTransaction, setEditingTransaction] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  
  // Global modes
  const [density, setDensity] = useState<'compact' | 'comfortable'>('compact');
  const [advancedMode, setAdvancedMode] = useState<boolean>(false);
  const [showGuide, setShowGuide] = useState<boolean>(true);
  const [showFullGpsSource, setShowFullGpsSource] = useState<boolean>(false);

  // Modals for E2E tests
  const [selectedTxForSource, setSelectedTxForSource] = useState<any | null>(null);
  const [selectedTxForMatch, setSelectedTxForMatch] = useState<any | null>(null);

  // Sync density classes to html document element
  useEffect(() => {
    const mode = (localStorage.getItem('fuel-assurance-density-mode') || 'compact') as 'compact' | 'comfortable';
    setDensity(mode);
    document.documentElement.classList.add(`density-${mode}`);
    document.documentElement.classList.remove(`density-${mode === 'compact' ? 'comfortable' : 'compact'}`);

    const adv = localStorage.getItem('fuel-assurance-advanced-mode') === 'true';
    setAdvancedMode(adv);

    const guideDismissed = localStorage.getItem('fuel-assurance-dismiss-guide') === 'true';
    if (guideDismissed) {
      setShowGuide(false);
    }
  }, []);

  const handleDismissGuide = () => {
    setShowGuide(false);
    localStorage.setItem('fuel-assurance-dismiss-guide', 'true');
  };

  const toggleDensity = () => {
    const newMode = density === 'compact' ? 'comfortable' : 'compact';
    setDensity(newMode);
    localStorage.setItem('fuel-assurance-density-mode', newMode);
    document.documentElement.classList.add(`density-${newMode}`);
    document.documentElement.classList.remove(`density-${density}`);
  };

  const toggleAdvancedMode = () => {
    const next = !advancedMode;
    setAdvancedMode(next);
    localStorage.setItem('fuel-assurance-advanced-mode', String(next));
  };

  // Fetch batches & failed imports
  const fetchBatches = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/batches');
      const data = await res.json();
      setBatches(data.batches || []);
      
      // Load failed imports from localStorage
      const cachedFailed = localStorage.getItem('fuel_assurance_failed_imports');
      if (cachedFailed) {
        setFailedImports(JSON.parse(cachedFailed));
      }
    } catch {
      setError('Could not load batches catalog');
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
        
        // Enrich transactions
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
              assessedAt: mappedBatch.uploadDate,
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

        // Keep selected transaction reference updated
        if (selectedTransaction) {
          const updatedTx = enrichedTxs.find((t: any) => t.id === selectedTransaction.id);
          if (updatedTx) setSelectedTransaction(updatedTx);
        }
      }
    } catch (err) {
      console.error('Failed to load batch data:', err);
    } finally {
      setLoadingBatchData(false);
    }
  }, [selectedTransaction]);

  // Synchronize workspace selection state with query parameters
  useEffect(() => {
    if (batchIdParam) {
      setSelectedBatchId(batchIdParam);
      fetchBatchDetails(batchIdParam);
      // Auto transition to Step 2 when batch loaded
      setActiveStep((s) => (s === 1 ? 2 : s));
    } else {
      setSelectedBatchId(null);
      setActiveBatch(null);
      setTransactions([]);
      setSelectedTransaction(null);
      setActiveStep(1);
    }
  }, [batchIdParam]);

  // Fetch telemetry evidence for selected transaction in Step 4
  useEffect(() => {
    if (activeStep !== 4 || !selectedTransaction) {
      setSelectedTxEvidence(null);
      return;
    }
    
    let active = true;
    setLoadingEvidence(true);
    
    fetch(`/api/telematics/evidence?transactionId=${selectedTransaction.id}&windowMinutes=${timeWindowMinutes}`)
      .then((res) => res.json())
      .then((result) => {
        if (!active) return;
        if (result.success) {
          setSelectedTxEvidence(result);
        } else {
          console.error(result.error);
        }
        setLoadingEvidence(false);
      })
      .catch((err) => {
        console.error(err);
        if (active) setLoadingEvidence(false);
      });
      
    return () => { active = false; };
  }, [selectedTransaction, activeStep, timeWindowMinutes]);

  // Handle invoice file drops in Step 1
  const onDropInvoice = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setLoading(true);
    setError('');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success && data.fileId) {
        router.push(`/batches?id=${data.fileId}`);
      } else {
        // Parse failure
        const failed: FailedImport = {
          id: Math.random().toString(),
          fileName: file.name,
          errorReason: data.message || 'The file could not be mapped to a supported structure.',
          technicalDetails: data.technicalDetails || 'Coordinates or columns matching failed.',
          timestamp: new Date().toISOString(),
          provider: file.name.toLowerCase().includes('as24') ? 'AS24' : 'DKV'
        };
        const updatedFailed = [failed, ...failedImports];
        setFailedImports(updatedFailed);
        localStorage.setItem('fuel_assurance_failed_imports', JSON.stringify(updatedFailed));
        setError(failed.errorReason);
      }
    } catch (err: any) {
      setError('Connection to parsing server failed.');
    } finally {
      setLoading(false);
    }
  }, [failedImports, router]);

  const { getRootProps: getInvoiceProps, getInputProps: getInvoiceInput, isDragActive: invoiceDrag } = useDropzone({
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/pdf': ['.pdf'],
    },
    multiple: false,
    onDrop: onDropInvoice,
  });

  // Handle multiple GPS files drop in Step 3
  const onDropGps = useCallback(async (files: File[]) => {
    if (!activeBatch) return;
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
        await fetchBatchDetails(activeBatch.id);
      } else {
        alert(data.error || 'GPS upload failed.');
      }
    } catch {
      alert('Failed to connect to GPS upload API.');
    } finally {
      setLoadingBatchData(false);
    }
  }, [activeBatch, fetchBatchDetails]);

  const { getRootProps: getGpsProps, getInputProps: getGpsInput, isDragActive: gpsDrag } = useDropzone({
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    multiple: true,
    onDrop: onDropGps,
  });

  // Transaction manual edits saving
  const handleOpenEdit = (tx: any) => {
    setEditingTransaction(tx);
    setEditForm({
      registration: tx.registration || tx.vehicleRegistration || '',
      transactionDate: tx.transactionDate || '',
      transactionTimestamp: tx.transactionTimestamp || tx.transactionDateTime || '',
      productName: tx.productName || '',
      productType: tx.productType || '',
      stationCity: tx.stationCity || '',
      stationName: tx.stationName || '',
      quantity: tx.quantity || tx.volume || '',
      unit: tx.unit || tx.volumeUnit || 'L',
      baseValueNet: tx.baseValueNet || tx.valueOfPurchaseNet || tx.paymentAmountExVat || '',
      discountNet: tx.discountNet || tx.rebate || '',
      serviceFeeNet: tx.serviceFeeNet || '',
      vat: tx.vat || '',
      valueInPayCurrency: tx.valueInPayCurrency || tx.paymentAmountInclVat || tx.baseValueGross || tx.amountGross || '',
      paymentCurrency: tx.paymentCurrency || 'EUR',
      transactionNumber: tx.transactionNumber || tx.ticketNumber || '',
      reviewerNote: tx.reviewerNote || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingTransaction) return;
    setRecomputingRowId(editingTransaction.id);
    try {
      const res = await fetch(`/api/transactions/${editingTransaction.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (data.success) {
        await fetchBatchDetails(activeBatch!.id);
        setEditingTransaction(null);
      } else {
        alert(data.error || 'Failed to save edits.');
      }
    } catch {
      alert('Save request failed.');
    } finally {
      setRecomputingRowId(null);
    }
  };

  const handleRevertRow = async (txId: string) => {
    setRecomputingRowId(txId);
    try {
      const res = await fetch(`/api/transactions/${txId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revert: true }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchBatchDetails(activeBatch!.id);
        if (editingTransaction && editingTransaction.id === txId) {
          setEditingTransaction(null);
        }
      }
    } catch {
      alert('Revert request failed.');
    } finally {
      setRecomputingRowId(null);
    }
  };

  const handleRowOverride = async (txId: string, status: string, note: string) => {
    try {
      const res = await fetch(`/api/transactions/${txId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telematicsOverrideStatus: status, reviewerNote: note }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchBatchDetails(activeBatch!.id);
      }
    } catch {
      alert('Status override request failed.');
    }
  };

  // Stepper validation checkers
  const getUnresolvedBlockingIssuesCount = () => {
    const unsupportedCount = transactions.filter(t => 
      t.status !== 'OK' && t.status !== 'Validated' && t.status !== 'VALIDATED' &&
      t.telematicsAssessment?.classification !== 'VERIFIED' && t.telematicsAssessment?.classification !== 'LIKELY' &&
      t.telematicsOverrideStatus !== 'Marked Supported' && t.telematicsOverrideStatus !== 'Manually Approved'
    ).length;
    
    const vehiclesWithoutGps = activeBatch?.vehicles.filter(reg => 
      !activeBatch.attachedGpsFiles?.some(a => normalizeRegistration(a.vehicleRegistration) === normalizeRegistration(reg))
    ).length || 0;
    
    return unsupportedCount + vehiclesWithoutGps;
  };

  const updateApprovalStatus = async (status: string, noteText?: string) => {
    if (!activeBatch) return;
    try {
      const payload: any = {
        approvalStatus: status,
        auditEvent: {
          action: 'STATUS_CHANGE',
          details: `Approval workflow state transitioned to ${status.replace(/_/g, ' ').toUpperCase()}`,
        }
      };
      if (noteText) {
        payload.reviewerNotes = noteText;
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
    await updateApprovalStatus('verification_complete', 'Batch verification confirmed and verified.');
    alert('Verification signed off! Extracted invoice data confirmed.');
  };

  const handleExportCSV = () => {
    if (!transactions.length) return;
    const headers = ['ID', 'Date/Time', 'Vehicle', 'Product', 'Qty', 'Net', 'VAT/Gross', 'GPS Status', 'Confidence', 'Manually Edited', 'Override Status'];
    const rows = transactions.map(t => [
      t.id,
      t.transactionTimestamp || t.transactionDateTime || '',
      t.registration || t.vehicleRegistration || '',
      t.productName || t.productType || '',
      parseFloat(t.quantity || t.volume || '0').toFixed(2),
      parseFloat(t.paymentAmountExVat || t.baseValueNet || '0').toFixed(2),
      parseFloat(t.paymentAmountInclVat || t.valueInPayCurrency || '0').toFixed(2),
      t.telematicsAssessment?.classification || 'NO GPS',
      t.extractionConfidence || '100',
      t.isManuallyEdited ? 'Yes' : 'No',
      t.telematicsOverrideStatus || 'None'
    ]);

    const csvContent = [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `FuelAssurance_Batch_${activeBatch?.filename || 'export'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper values for currency sums
  const formatExVatSum = (batch: BatchRecord) => {
    if (!batch.chargeSummary?.totalAmountExVatByCurrency) return '—';
    return Object.entries(batch.chargeSummary.totalAmountExVatByCurrency)
      .map(([curr, val]) => `${curr} ${parseFloat(val as any).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
      .join(' / ');
  };

  return (
    <div className="max-w-[1600px] mx-auto py-4 px-4 space-y-4 text-slate-800 dark:text-slate-200 animate-fade-in">
      
      {/* ─── WORKSPACE STEPPER HEADER ─── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-4">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2 tracking-tight">
              <Layers className="h-5.5 w-5.5 text-indigo-600 dark:text-indigo-400" />
              Fuel Assurance Review Workspace
            </h1>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Verify fuel invoices and transaction sheets against vehicle GPS telemetry logs.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Advanced mode switch */}
            <button
              onClick={toggleAdvancedMode}
              className={`py-1 px-2.5 rounded-lg text-2xs font-semibold flex items-center gap-1 border transition-all ${
                advancedMode 
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-glow' 
                  : 'bg-white border-slate-200 hover:border-slate-350 dark:bg-slate-800 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
              title="Toggle Advanced auditor tools"
            >
              <Settings2 className="w-3.5 h-3.5" />
              Advanced Mode: {advancedMode ? 'Active' : 'Off'}
            </button>
            <button
              onClick={toggleDensity}
              className="py-1 px-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-2xs font-semibold text-slate-600 dark:text-slate-300"
            >
              Density: {density === 'compact' ? 'Compact' : 'Comfortable'}
            </button>
          </div>
        </div>

        {/* Visual Stepper bar */}
        <div className="grid grid-cols-5 gap-2 mt-4 text-xs font-bold text-center">
          {[
            { step: 1, label: '1. Upload Invoice', desc: 'DKV Excel, PDF or AS24 PDF' },
            { step: 2, label: '2. Review Extraction', desc: 'Verify parsed transactions' },
            { step: 3, label: '3. Upload GPS', desc: 'Attach vehicle telemetry' },
            { step: 4, label: '4. Compare GPS', desc: 'Validate overlap evidence' },
            { step: 5, label: '5. Approve / Flag', desc: 'Sign-off audit run' },
          ].map((s) => {
            const isClickable = activeBatch !== null || s.step === 1;
            const isActive = activeStep === s.step;
            const isCompleted = activeBatch !== null && s.step < activeStep;
            return (
              <button
                key={s.step}
                disabled={!isClickable}
                onClick={() => {
                  setActiveStep(s.step);
                  setSelectedTransaction(null);
                }}
                className={`p-2 rounded-xl border-2 text-left transition ${
                  isActive
                    ? 'border-indigo-600 bg-indigo-50/20 text-indigo-700 dark:text-indigo-400'
                    : isCompleted
                    ? 'border-emerald-600/40 bg-emerald-50/5 text-emerald-700 dark:text-emerald-500'
                    : 'border-slate-100 dark:border-slate-800 text-slate-400'
                } disabled:opacity-55`}
              >
                <span className="block text-[11px] font-black">{s.label}</span>
                <span className="block text-[9px] text-slate-450 mt-0.5 font-normal truncate">{s.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── STICKY ACTION BAR (ONLY IF BATCH LOADED) ─── */}
      {activeBatch && (
        <div className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-800 rounded-2xl shadow-md p-3.5 flex flex-wrap items-center justify-between gap-4 animate-slide-down">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/batches')}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 rounded-lg transition"
              title="Close workspace"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                {activeBatch.filename}
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400">
                  {activeBatch.provider}
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-semibold truncate max-w-[150px]">
                  {activeBatch.sourceType}
                </span>
              </h2>
              <div className="flex items-center gap-2 text-[9px] text-slate-400 font-semibold uppercase mt-0.5 tracking-wider">
                <span>Value: {formatExVatSum(activeBatch)}</span>
                <span>•</span>
                <span>Txs: {transactions.length} rows</span>
                <span>•</span>
                <span>GPS files: {activeBatch.attachedGpsFiles?.length || 0}</span>
                <span>•</span>
                <span>Issues: {getUnresolvedBlockingIssuesCount()} unresolved</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                router.push('/batches');
                setActiveStep(1);
              }}
              className="py-1 px-3 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-2xs font-semibold text-slate-600 dark:text-slate-300"
            >
              Upload More
            </button>
            <button
              onClick={handleConfirmBatch}
              className="py-1 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-2xs font-semibold flex items-center gap-1 transition shadow-sm"
            >
              <Check className="w-3 h-3" />
              Confirm Extracted Data
            </button>
            <button
              onClick={() => setActiveStep(3)}
              className={`py-1 px-3 border rounded-lg text-2xs font-semibold ${
                activeStep === 3 ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Upload GPS
            </button>
            <button
              onClick={() => setActiveStep(4)}
              className={`py-1 px-3 border rounded-lg text-2xs font-semibold ${
                activeStep === 4 ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Run Comparison
            </button>
            <button
              onClick={() => setActiveStep(5)}
              className={`py-1 px-3 border rounded-lg text-2xs font-semibold ${
                activeStep === 5 ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Approve / Flag
            </button>
            <button
              onClick={handleExportCSV}
              className="py-1 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 rounded-lg text-2xs font-semibold flex items-center gap-1 transition"
            >
              <Download className="w-3 h-3" />
              Export
            </button>
            <button
              onClick={toggleDensity}
              className="p-1 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400"
              title={`Toggle row density (Currently: ${density})`}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {activeBatch && showGuide && (
        <div className="bg-indigo-50 dark:bg-indigo-950/45 border border-indigo-150 dark:border-indigo-800/40 rounded-2xl p-3 px-4 flex items-start justify-between gap-3 text-xs leading-normal animate-fade-in shadow-sm">
          <div className="flex gap-2">
            <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-extrabold text-indigo-950 dark:text-indigo-300">What to do next:</span>
              <ol className="list-decimal pl-4 mt-0.5 space-y-0.5 text-indigo-900/90 dark:text-indigo-350 text-[11px]">
                <li>Check the extracted transactions in the list on the left.</li>
                <li>Upload GPS files for the vehicles under Step 3 (Upload GPS).</li>
                <li>Click <strong>Compare</strong> (or click a row) on rows needing review to check proximity evidence.</li>
                <li>Approve the invoice when all issues are resolved.</li>
              </ol>
            </div>
          </div>
          <button
            onClick={handleDismissGuide}
            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ─── STEP 1: UPLOAD INVOICE (NO BATCH SELECTED) ─── */}
      {activeStep === 1 && !selectedBatchId && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          
          {/* Left / Middle: Ingestion Dropzone & Warnings */}
          <div className="lg:col-span-2 space-y-4">
            
            {error && (
              <div className="p-4 bg-rose-500/5 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400 rounded-2xl flex items-start gap-3">
                <XCircle className="w-5 h-5 mt-0.5 shrink-0" />
                <div>
                  <span className="font-bold text-sm block">Invoice structure match failed</span>
                  <p className="text-xs mt-0.5 leading-normal">{error}</p>
                </div>
              </div>
            )}

            <div
              {...getInvoiceProps()}
              className={`border-2 border-dashed rounded-2xl flex flex-col items-center justify-center py-20 text-center cursor-pointer transition-all ${
                invoiceDrag
                  ? 'border-indigo-500 bg-indigo-50/10'
                  : 'border-slate-250 dark:border-slate-800 hover:border-indigo-400 hover:bg-slate-50/20'
              }`}
            >
              <input {...getInvoiceInput()} />
              <Upload className="h-10 w-10 text-slate-400 mb-3" />
              <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                Drop invoice or transaction file here
              </p>
              <p className="text-2xs text-slate-500 mt-1 max-w-sm leading-normal">
                Supports **DKV PDF Invoices**, **DKV Excel reports** (Daily Authorization & Invoice-Period), and **AS24 PDF Invoices**.
              </p>
            </div>

            {/* Failed Imports Table */}
            {failedImports.length > 0 && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <span className="text-xs font-bold text-rose-600 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    Failed Imports queue
                  </span>
                  <button
                    onClick={() => {
                      setFailedImports([]);
                      localStorage.removeItem('fuel_assurance_failed_imports');
                    }}
                    className="text-2xs text-slate-400 hover:text-slate-650"
                  >
                    Clear all failed
                  </button>
                </div>
                <div className="space-y-2.5 max-h-48 overflow-y-auto">
                  {failedImports.map((fail) => (
                    <div key={fail.id} className="p-3 bg-rose-500/5 border border-rose-200/50 rounded-xl text-xs space-y-1">
                      <div className="flex justify-between font-bold text-slate-900 dark:text-white">
                        <span>{fail.fileName}</span>
                        <span className="text-3xs text-slate-400 font-normal">
                          {new Date(fail.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">{fail.errorReason}</p>
                      {fail.technicalDetails && (
                        <details className="mt-1 text-3xs text-slate-400 cursor-pointer">
                          <summary>View technical details</summary>
                          <pre className="mt-1 p-2 bg-slate-900 text-slate-300 rounded font-mono truncate whitespace-pre-wrap max-w-full">
                            {fail.technicalDetails}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Panel: Continued Reviews */}
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-450 block">
                Continue In-Progress Reviews
              </span>
              {loading ? (
                <div className="py-6 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : batches.length === 0 ? (
                <p className="text-2xs text-slate-500 text-center py-6">No active verification batches found.</p>
              ) : (
                <div className="space-y-2 max-h-[360px] overflow-y-auto">
                  {batches.map((b) => (
                    <div
                      key={b.id}
                      onClick={() => router.push(`/batches?id=${b.id}`)}
                      className="p-3 bg-slate-50/50 hover:bg-slate-100/50 dark:bg-slate-850/50 dark:hover:bg-slate-800/50 border border-slate-150 dark:border-slate-800 rounded-xl cursor-pointer transition flex flex-col gap-1"
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-extrabold text-xs text-slate-900 dark:text-white truncate max-w-[160px]">{b.filename}</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50/50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 uppercase">
                          {b.provider}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-slate-450 font-mono mt-0.5">
                        <span>{new Date(b.uploadDate).toLocaleDateString()}</span>
                        <span>{b.transactionCount || 0} rows</span>
                      </div>
                      <div className="flex items-center justify-between text-[9px] mt-1.5">
                        <span className="text-slate-400">GPS: {b.attachedGpsFiles?.length || 0} vehicles</span>
                        <span className="text-indigo-500 hover:underline flex items-center gap-0.5 font-bold">
                          Continue <ArrowRight className="w-2.5 h-2.5" />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      {/* ─── CORE WORKSPACE LAYOUT (LEFT/RIGHT SPLIT) ─── */}
      {activeBatch && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          
          {/* ───────────────── LEFT PANEL: INVOICED TRANSACTIONS ───────────────── */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-4 flex flex-col gap-4 overflow-hidden min-h-[75vh]">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-450 flex items-center gap-1">
                <ClipboardList className="w-4 h-4 text-indigo-500" />
                Extracted Invoice Transactions
              </span>
              <span className="text-2xs text-slate-400 font-mono">
                {transactions.length} records parsed
              </span>
            </div>

            <div className="flex-1 overflow-x-auto">
              <CompactTransactionTable
                transactions={transactions}
                onOpenSourceViewer={(tx) => setSelectedTxForSource(tx)}
                onOpenEvidenceMatchView={(tx) => {
                  setSelectedTransaction(tx);
                  setSelectedTxForMatch(tx);
                  setActiveStep(4); // navigate to comparison step
                }}
                selectedVehicle={selectedTransaction?.registration}
                advancedMode={advancedMode}
                onSelectTransaction={setSelectedTransaction}
                onOpenEdit={handleOpenEdit}
                onRevertEdit={handleRevertRow}
              />
            </div>

            {/* STEP 4 SOURCE PREVIEW (UNDER THE TABLE ON THE LEFT) */}
            {activeStep === 4 && selectedTransaction && (
              <div className="border-t border-slate-150 dark:border-slate-800 pt-3 space-y-2">
                <div className="flex justify-between items-center text-[10px] text-slate-400">
                  <span className="font-bold uppercase tracking-wider text-slate-500">
                    Source Document Evidence Highlight
                  </span>
                  <span>
                    File: {selectedTransaction.sourceEvidence?.sourceFileName || 'N/A'} (Page/Row: {selectedTransaction.sourceEvidence?.pageNumber || selectedTransaction.sourceEvidence?.rowNumber})
                  </span>
                </div>
                
                {selectedTransaction.sourceEvidence ? (
                  <div className="bg-slate-50 dark:bg-slate-950/40 rounded-xl p-3 border border-slate-200 dark:border-slate-800 space-y-2">
                    {selectedTransaction.sourceEvidence.sourceType?.includes('PDF') ? (
                      <div className="w-full bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800 overflow-hidden flex justify-center py-4">
                        <PDFPageRenderer
                          fileId={selectedTransaction.sourceEvidence.sourceFileId}
                          pageNumber={selectedTransaction.sourceEvidence.pageNumber}
                          boundingBox={selectedTransaction.sourceEvidence.boundingBox}
                          crop={true}
                          scale={1.3}
                        />
                      </div>
                    ) : (
                      <div className="p-3 bg-white dark:bg-slate-900 border rounded-xl font-mono text-3xs space-y-1 overflow-x-auto leading-normal">
                        <div className="text-slate-450 border-b border-slate-100 pb-1 mb-1 font-bold">EXCEL SHEET: {selectedTransaction.sourceEvidence.worksheetName} · ROW: {selectedTransaction.sourceEvidence.rowNumber}</div>
                        <div>Line Raw Content:</div>
                        <p className="bg-slate-50 dark:bg-slate-850 p-2 rounded text-slate-800 dark:text-slate-200 whitespace-pre">{selectedTransaction.sourceEvidence.rawText || 'No raw line capture available.'}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center p-4 text-slate-400 border border-dashed rounded-xl">
                    No precise bounding coordinates found.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ───────────────── RIGHT PANEL: DYNAMIC STEPS ───────────────── */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-4 flex flex-col gap-4 overflow-hidden min-h-[75vh]">
            
            {/* Reconciliation & Approval Status Widget */}
            <div className="bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3.5 shadow-sm shrink-0">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black uppercase text-slate-450 tracking-wider">Approval status</span>
                <span className={`px-2.5 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                  getUnresolvedBlockingIssuesCount() > 0 
                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/30 dark:text-rose-400 font-sans' 
                    : 'bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-400 font-sans'
                }`}>
                  {getUnresolvedBlockingIssuesCount() > 0 ? 'Not ready' : 'Ready to approve'}
                </span>
              </div>
              
              <div className="grid grid-cols-3 gap-2.5 text-center font-mono select-none">
                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-xl p-2">
                  <span className="text-[8px] text-slate-400 block uppercase font-sans font-bold">Need review</span>
                  <span className="text-sm font-extrabold text-amber-600 block mt-0.5">{getUnresolvedBlockingIssuesCount()}</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-xl p-2">
                  <span className="text-[8px] text-slate-400 block uppercase font-sans font-bold">Approved</span>
                  <span className="text-sm font-extrabold text-green-600 block mt-0.5">
                    {transactions.filter(t => t.telematicsOverrideStatus === 'Marked Supported').length}
                  </span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-xl p-2">
                  <span className="text-[8px] text-slate-400 block uppercase font-sans font-bold">Flagged</span>
                  <span className="text-sm font-extrabold text-rose-600 block mt-0.5">
                    {transactions.filter(t => t.telematicsOverrideStatus === 'Flagged Mismatch').length}
                  </span>
                </div>
              </div>
              
              {getUnresolvedBlockingIssuesCount() > 0 ? (
                <div className="p-2.5 bg-rose-500/5 border border-rose-200/50 rounded-xl text-rose-700 dark:text-rose-400 text-[10px] leading-relaxed">
                  <strong>Approval blocked:</strong> Resolve or override the {getUnresolvedBlockingIssuesCount()} unresolved item{getUnresolvedBlockingIssuesCount() === 1 ? '' : 's'} before approving this run.
                </div>
              ) : null}
              
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setActiveStep(4)}
                  className="flex-1 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:hover:bg-indigo-950/60 border border-indigo-200/50 text-indigo-750 dark:text-indigo-400 rounded-xl text-2xs font-bold transition"
                >
                  Review issues
                </button>
                <button
                  onClick={() => setActiveStep(5)}
                  disabled={getUnresolvedBlockingIssuesCount() > 0}
                  className="flex-1 py-1.5 bg-green-605 hover:bg-green-500 disabled:opacity-40 text-white rounded-xl text-2xs font-bold transition"
                >
                  Approve invoice
                </button>
                <button
                  onClick={() => setActiveStep(5)}
                  className="py-1.5 px-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-2xs font-bold transition"
                >
                  Flag invoice
                </button>
                <button
                  onClick={handleExportCSV}
                  className="py-1.5 px-3 bg-slate-100 hover:bg-slate-205 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-750 text-slate-750 dark:text-slate-300 rounded-xl text-2xs font-bold transition"
                  title="Export CSV report"
                >
                  Export report
                </button>
              </div>
            </div>
            
            {/* STEP 2: REVIEW EXTRACTION DETAILS */}
            {activeStep === 2 && (
              <div className="space-y-4 animate-fade-in flex-1 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-450">
                      Step 2: Review Extraction Summary
                    </span>
                    <span className="px-2 py-0.5 rounded text-3xs font-extrabold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 border border-indigo-200/50">
                      EXTRACTION CONFIRMED
                    </span>
                  </div>

                  {(() => {
                    const allRawWarnings = [
                      ...(activeBatch.parsingWarnings || []),
                      ...transactions.flatMap(t => t.warnings || [])
                    ];
                    
                    if (allRawWarnings.length === 0) return null;
                    
                    const grouped = groupWarnings(allRawWarnings);
                    const allGroupedWarnings = [
                      ...grouped.blocking,
                      ...grouped.review,
                      ...grouped.informational
                    ];
                    
                    return (
                      <div className="space-y-2.5">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-350 flex items-center gap-1">
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                          Grouped Extraction & Parser Warnings ({allRawWarnings.length})
                        </span>
                        <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                          {allGroupedWarnings.map((g, idx) => {
                            const isBlocking = g.level === 'blocking';
                            const isReview = g.level === 'review';
                            
                            // Map technical code to user friendly plain English if advancedMode is off
                            let friendlyMessage = g.message;
                            if (!advancedMode) {
                              if (g.code === 'TOLL_NET_NOT_PROVIDED') {
                                friendlyMessage = 'Toll rows did not include a separate payment net value.';
                              } else if (g.code === 'PARSER_MAPPING_ERROR') {
                                friendlyMessage = 'Some fields could not be parsed automatically.';
                              }
                            }
                            
                            return (
                              <div
                                key={idx}
                                className={`p-3 border rounded-xl text-2xs space-y-1.5 leading-normal ${
                                  isBlocking
                                    ? 'bg-rose-50/50 border-rose-200 text-rose-805 dark:bg-rose-955/20 dark:border-rose-900/50 dark:text-rose-400'
                                    : isReview
                                    ? 'bg-amber-50/50 border-amber-200 text-amber-805 dark:bg-amber-955/20 dark:border-amber-900/50 dark:text-amber-400'
                                    : 'bg-slate-50/50 border-slate-200 text-slate-700 dark:bg-slate-850/50 dark:border-slate-800 dark:text-slate-400'
                                }`}
                              >
                                <div className="flex justify-between items-center">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`font-black uppercase text-[8px] px-1.5 py-0.5 rounded tracking-wider ${
                                      isBlocking
                                        ? 'bg-rose-200 text-rose-800 dark:bg-rose-950/40 dark:text-rose-405'
                                        : isReview
                                        ? 'bg-amber-205 text-amber-800 dark:bg-amber-950/40 dark:text-amber-405'
                                        : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-350'
                                    }`}>
                                      {g.level === 'blocking' ? 'Blocks Approval' : g.level === 'review' ? 'Needs Review' : 'Info'}
                                    </span>
                                    {advancedMode && (
                                      <span className="font-bold font-mono text-[9px] text-slate-450">
                                        {g.code}
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-mono text-[10px] font-bold text-slate-500">
                                    {g.count} row{g.count === 1 ? '' : 's'}
                                  </span>
                                </div>
                                
                                <p className="text-2xs font-semibold">{friendlyMessage}</p>
                                
                                <div className="text-[9px] opacity-80 mt-1">
                                  {isBlocking
                                    ? '⚠️ Resolve or override with manual notes before batch approval.'
                                    : isReview
                                    ? '🔍 Suggested manual check of transaction crop.'
                                    : 'ℹ️ Tolerated parser anomaly. Review is optional.'}
                                </div>
                                
                                <details className="text-[9px] mt-1 text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 cursor-pointer">
                                  <summary className="font-semibold select-none hover:underline">
                                    {advancedMode ? 'Show technical details' : 'View affected rows'}
                                  </summary>
                                  <div className="mt-1.5 p-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded font-mono text-[9px] max-h-24 overflow-y-auto space-y-1">
                                    {g.examples.map((ex, i) => (
                                      <div key={i} className="border-b last:border-b-0 py-0.5 select-all border-slate-100 dark:border-slate-800 text-slate-605 dark:text-slate-350">
                                        {ex}
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-slate-50/50 dark:bg-slate-850/50 border border-slate-150 dark:border-slate-800 rounded-xl space-y-1">
                      <span className="text-[10px] text-slate-400 block font-semibold">PROVIDER</span>
                      <span className="font-extrabold text-slate-900 dark:text-white">{activeBatch.provider}</span>
                    </div>
                    <div className="p-3 bg-slate-50/50 dark:bg-slate-850/50 border border-slate-150 dark:border-slate-800 rounded-xl space-y-1">
                      <span className="text-[10px] text-slate-400 block font-semibold">DOCUMENT NO.</span>
                      <span className="font-extrabold font-mono text-slate-900 dark:text-white truncate block">{activeBatch.statementNumber || '—'}</span>
                    </div>
                    <div className="p-3 bg-slate-50/50 dark:bg-slate-850/50 border border-slate-150 dark:border-slate-800 rounded-xl space-y-1">
                      <span className="text-[10px] text-slate-400 block font-semibold">TOTAL MONETARY VALUE (EX VAT)</span>
                      <span className="font-extrabold font-mono text-slate-900 dark:text-white">{formatExVatSum(activeBatch)}</span>
                    </div>
                    <div className="p-3 bg-slate-50/50 dark:bg-slate-850/50 border border-slate-150 dark:border-slate-800 rounded-xl space-y-1">
                      <span className="text-[10px] text-slate-400 block font-semibold">TOTAL VOLUMETRIC QUANTITY</span>
                      <span className="font-extrabold font-mono text-slate-900 dark:text-white">
                        {activeBatch.chargeSummary?.totalFuelVolume ? activeBatch.chargeSummary.totalFuelVolume.toFixed(2) : '0.00'} L
                      </span>
                    </div>
                  </div>

                  {/* Vehicles Identified list */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Truck className="w-4 h-4 text-slate-450" />
                      Invoiced Fleet Vehicles Identified ({activeBatch.vehicles.length})
                    </span>
                    <div className="border border-slate-150 dark:border-slate-800 rounded-xl overflow-hidden text-2xs">
                      <div className="w-full text-left">
                        <div className="grid grid-cols-4 bg-slate-50 dark:bg-slate-850 text-slate-500 font-semibold border-b border-slate-150 select-none p-2 text-xs">
                          <div>Registration</div>
                          <div className="text-right">Transactions</div>
                          <div className="text-center">GPS Linked</div>
                          <div className="text-right">Scoring</div>
                        </div>
                        <div className="divide-y divide-slate-100 dark:divide-slate-850 font-mono">
                          {activeBatch.vehicles.map((reg) => {
                            const gpsAttachment = activeBatch.attachedGpsFiles?.find(
                              (a) => normalizeRegistration(a.vehicleRegistration) === normalizeRegistration(reg)
                            );
                            const result = activeBatch.checkResults?.[reg.replace(/\s+/g, '').toUpperCase()];
                            const txCount = transactions.filter(t => normalizeRegistration(t.registration || t.vehicleRegistration) === normalizeRegistration(reg)).length;
                            return (
                              <div key={reg} className="grid grid-cols-4 hover:bg-slate-50/50 p-2 items-center text-xs">
                                <div className="font-bold text-slate-955 dark:text-white truncate">{reg}</div>
                                <div className="text-right">{txCount}</div>
                                <div className="text-center font-sans">
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                    gpsAttachment ? 'bg-green-150 text-green-700 dark:bg-green-950/20' : 'bg-amber-150 text-amber-700'
                                  }`}>
                                    {gpsAttachment ? 'Linked' : 'Pending'}
                                  </span>
                                </div>
                                <div className="text-right font-sans text-slate-500">
                                  {result ? `${result.supported} / ${txCount} OK` : '—'}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2.5 pt-4 border-t border-slate-150 dark:border-slate-800">
                  <button
                    onClick={() => setActiveStep(3)}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md flex items-center justify-center gap-1 transition"
                  >
                    Upload GPS Files <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: UPLOAD GPS MULTIPLE FILES */}
            {activeStep === 3 && (
              <div className="space-y-4 animate-fade-in flex-1 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-450">
                      Step 3: Ingest Vehicle GPS Data
                    </span>
                    <span className="text-3xs text-slate-400 font-bold uppercase">
                      {activeBatch.attachedGpsFiles?.length || 0} files attached
                    </span>
                  </div>

                  <div
                    {...getGpsProps()}
                    className={`border-2 border-dashed rounded-2xl flex flex-col items-center justify-center py-10 text-center cursor-pointer transition-all ${
                      gpsDrag
                        ? 'border-indigo-500 bg-indigo-50/10'
                        : 'border-slate-250 dark:border-slate-800 hover:border-indigo-400 hover:bg-slate-50/20'
                    }`}
                  >
                    <input {...getGpsInput()} />
                    <Satellite className="h-8 w-8 text-slate-400 mb-2 animate-pulse" />
                    <p className="text-xs font-extrabold text-slate-900 dark:text-white">
                      Drag and drop telematics Excel log files here
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Supports multiple vehicle GPS logs upload (XLS, XLSX)
                    </p>
                  </div>

                  {/* Attached GPS Files summary */}
                  {activeBatch.attachedGpsFiles && activeBatch.attachedGpsFiles.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Linked GPS Telemetry logs
                      </span>
                      <div className="space-y-2 max-h-56 overflow-y-auto">
                        {activeBatch.attachedGpsFiles.map((file, i) => (
                          <div key={i} className="p-3 bg-slate-50/50 border border-slate-150 dark:border-slate-800 rounded-xl text-2xs space-y-1 relative">
                            <div className="flex justify-between font-bold text-slate-900 dark:text-white">
                              <span className="truncate max-w-[200px]" title={file.fileName}>{file.fileName}</span>
                              <span className="font-mono text-indigo-600 dark:text-indigo-400">{file.vehicleRegistration}</span>
                            </div>
                            <div className="text-[10px] text-slate-450 font-mono space-y-0.5">
                              <div>Coverage: {file.coverageStart ? new Date(file.coverageStart).toLocaleDateString() : '—'} to {file.coverageEnd ? new Date(file.coverageEnd).toLocaleDateString() : '—'}</div>
                              {file.gpsRecordCount && <div>Records: {file.gpsRecordCount} points</div>}
                              {file.fuelLevelMin !== undefined && (
                                <div>Sensors: fuel {file.fuelLevelMin}%-{file.fuelLevelMax}%, odometer {file.odometerMin}-{file.odometerMax} km</div>
                              )}
                            </div>
                            <button
                              onClick={async () => {
                                if (!confirm('Detach this GPS file?')) return;
                                // remove attachment from batch
                                const nextFiles = activeBatch.attachedGpsFiles?.filter((_, idx) => idx !== i);
                                const vehicleStatuses = { ...(activeBatch.vehicleStatuses || {}) };
                                delete vehicleStatuses[file.vehicleRegistration];
                                const checkResults = { ...(activeBatch.checkResults || {}) };
                                delete checkResults[file.vehicleRegistration];
                                
                                await fetch(`/api/batches/${activeBatch.id}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    attachedGpsFiles: nextFiles,
                                    vehicleStatuses,
                                    vehicleCheckStatuses: vehicleStatuses,
                                    checkResults,
                                    verificationResults: checkResults,
                                  })
                                });
                                fetchBatchDetails(activeBatch.id);
                              }}
                              className="absolute right-2.5 top-2.5 p-1 text-slate-400 hover:text-red-500 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2.5 pt-4 border-t border-slate-150 dark:border-slate-800">
                  <button
                    onClick={() => setActiveStep(4)}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md flex items-center justify-center gap-1 transition"
                  >
                    Run Verification Comparison <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: SIDE-BY-SIDE COMPARE */}
            {activeStep === 4 && (
              <div className="space-y-4 animate-fade-in flex-1 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-450">
                      Step 4: GPS Evidence Reconciliation
                    </span>
                    {selectedTransaction && (
                      <span className={`px-2 py-0.5 rounded text-3xs font-extrabold ${
                        selectedTransaction.telematicsAssessment?.classification === 'VERIFIED'
                          ? 'bg-green-150 text-green-700'
                          : 'bg-amber-150 text-amber-700'
                      }`}>
                        {selectedTransaction.telematicsAssessment?.classification || 'NO GPS'}
                      </span>
                    )}
                  </div>

                  {!selectedTransaction ? (
                    <div className="py-20 text-center text-slate-400 space-y-2">
                      <Satellite className="w-10 h-10 mx-auto text-slate-300 animate-bounce" />
                      <p className="text-xs font-semibold">Select a transaction on the left</p>
                      <p className="text-[10px] text-slate-500">We will extract the corresponding timeline logs, odometer records, and fuel tank levels.</p>
                    </div>
                  ) : loadingEvidence ? (
                    <div className="py-20 text-center text-slate-400 space-y-2">
                      <Loader2 className="w-8 h-8 mx-auto text-indigo-500 animate-spin" />
                      <p className="text-xs font-semibold">Extracting telemetry logs...</p>
                    </div>
                  ) : selectedTxEvidence ? (
                    advancedMode ? (
                      <div className="space-y-4 text-xs">
                      
                      {/* Nearest Point Card */}
                      <div className="bg-slate-50 dark:bg-slate-850 border border-slate-150 dark:border-slate-800 rounded-xl p-3.5 space-y-2">
                        <span className="font-extrabold text-[10px] text-slate-450 uppercase tracking-wider block flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-indigo-500" />
                          Vehicle Position at Transaction Date
                        </span>

                        {selectedTxEvidence.beforePoint || selectedTxEvidence.afterPoint ? (
                          <div className="space-y-2 text-2xs leading-normal">
                            <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-1">
                              <span className="text-slate-400">Transaction Time:</span>
                              <span className="font-mono font-bold text-slate-700 dark:text-slate-350">
                                {new Date(selectedTransaction.transactionTimestamp || selectedTransaction.transactionDateTime).toLocaleString()}
                              </span>
                            </div>

                            {/* Nearest point details */}
                            {(() => {
                              const pts = selectedTxEvidence.pointsInWindow || [];
                              const txTime = new Date(selectedTransaction.transactionTimestamp || selectedTransaction.transactionDateTime).getTime();
                              let nearest = null;
                              let minDiff = Infinity;
                              for (const pt of pts) {
                                const diff = Math.abs(new Date(pt.timestamp).getTime() - txTime);
                                if (diff < minDiff) {
                                  minDiff = diff;
                                  nearest = pt;
                                }
                              }
                              if (!nearest) nearest = selectedTxEvidence.beforePoint || selectedTxEvidence.afterPoint;
                              const diffMins = Math.round(Math.abs(new Date(nearest.timestamp).getTime() - txTime) / 60000);
                              return (
                                <>
                                  <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-1">
                                    <span className="text-slate-400">Nearest Point time:</span>
                                    <span className="font-mono text-slate-700 dark:text-slate-350">
                                      {new Date(nearest.timestamp).toLocaleString()} ({diffMins} min diff)
                                    </span>
                                  </div>
                                  <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-1">
                                    <span className="text-slate-400">Address / Location:</span>
                                    <span className="font-bold text-slate-900 dark:text-white truncate max-w-[200px] text-right" title={nearest.locationAddress}>
                                      {nearest.locationAddress || `${nearest.latitude}, ${nearest.longitude}`}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-3 gap-2 pt-1.5 font-mono text-[10px] text-center select-none">
                                    <div className="bg-white dark:bg-slate-900 border border-slate-150 rounded p-1">
                                      <span className="text-[7px] text-slate-400 block uppercase">Speed</span>
                                      <span className="font-extrabold">{nearest.speedKmh ?? '0'} km/h</span>
                                    </div>
                                    <div className="bg-white dark:bg-slate-900 border border-slate-150 rounded p-1">
                                      <span className="text-[7px] text-slate-400 block uppercase">Odometer</span>
                                      <span className="font-extrabold">{nearest.odometerKm ?? '0'} km</span>
                                    </div>
                                    <div className="bg-white dark:bg-slate-900 border border-slate-150 rounded p-1">
                                      <span className="text-[7px] text-slate-400 block uppercase">Fuel Level</span>
                                      <span className="font-extrabold text-emerald-600">
                                        {nearest.fuelLevelPercent !== null ? `${Math.round(nearest.fuelLevelPercent)}%` : '—'}
                                      </span>
                                    </div>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        ) : (
                          <div className="p-2.5 bg-rose-50 dark:bg-rose-955/20 border border-rose-200/50 rounded-lg text-2xs text-rose-700 leading-normal">
                            <span className="font-extrabold block mb-0.5">No matching GPS points found</span>
                            <p className="text-3xs text-rose-600">The GPS file does not appear to cover the date range of this transaction ({selectedTransaction.transactionDate}). Check for gaps in the telematics files or link a different GPS spreadsheet.</p>
                          </div>
                        )}
                      </div>

                      {/* Expected vs Observed fuel movement (diesel only) */}
                      {['DIESEL', 'GNR', 'RED_DIESEL'].includes(selectedTransaction.productType) && (
                        <div className="p-3 bg-slate-50/50 dark:bg-slate-850/50 border border-slate-150 dark:border-slate-800 rounded-xl space-y-2">
                          <span className="font-bold text-[10px] text-slate-500 uppercase tracking-wider block">Fuel Movement Diagnostics</span>
                          <div className="grid grid-cols-2 gap-3 text-2xs font-mono">
                            <div className="bg-white dark:bg-slate-900 border border-slate-150 rounded p-2">
                              <span className="text-[8px] text-slate-450 block font-sans">Expected fill volume:</span>
                              <span className="font-bold text-indigo-600 font-mono">
                                +{Math.round((parseFloat(selectedTransaction.quantity || selectedTransaction.volume || '0') / 1200) * 100)}%
                              </span>
                              <span className="text-[8px] text-slate-400 block font-sans mt-0.5">For {parseFloat(selectedTransaction.quantity || selectedTransaction.volume || '0').toFixed(2)}L in 1200L tank</span>
                            </div>
                            <div className="bg-white dark:bg-slate-900 border border-slate-150 rounded p-2">
                              <span className="text-[8px] text-slate-450 block font-sans">Observed level increase:</span>
                              {(() => {
                                const fuelFactor = selectedTxEvidence.assessment?.factors?.find((f: any) => f.dimension === 'FUEL_LEVEL_MOVEMENT');
                                const details = fuelFactor?.details;
                                return (
                                  <>
                                    <span className="font-bold text-emerald-600">
                                      {details?.observedIncreasePercent !== undefined ? `+${Math.round(details.observedIncreasePercent)}%` : '—'}
                                    </span>
                                    <span className="text-[8px] text-slate-400 block font-sans mt-0.5">
                                      {details ? `Stable reading ${Math.round(details.baselineFuelPercent)}% → ${Math.round(details.postFillFuelPercent)}%` : 'No sensor level logs'}
                                    </span>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* GPS window control */}
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-700 dark:text-slate-350">GPS Time Window:</span>
                        <select
                          value={timeWindowMinutes}
                          onChange={(e) => setTimeWindowMinutes(Number(e.target.value))}
                          className="bg-slate-50 dark:bg-slate-800 border border-slate-250 dark:border-slate-700 rounded-lg px-2.5 py-1 text-2xs"
                        >
                          <option value={15}>±15 minutes</option>
                          <option value={30}>±30 minutes (Default)</option>
                          <option value={60}>±60 minutes</option>
                          <option value={120}>±2 hours</option>
                        </select>
                      </div>

                      {/* Timeline table */}
                      <div className="space-y-1.5">
                        <span className="font-bold text-[10px] text-slate-450 uppercase tracking-wider block">GPS log timeline</span>
                        <div className="border border-slate-150 dark:border-slate-800 rounded-xl overflow-hidden max-h-36 overflow-y-auto">
                          <table className="w-full text-left border-collapse text-3xs">
                            <thead>
                              <tr className="bg-slate-50 dark:bg-slate-850 text-slate-500 font-semibold border-b border-slate-150">
                                <th className="p-1.5">Time</th>
                                <th className="p-1.5">Address</th>
                                <th className="p-1.5 text-right">Fuel</th>
                                <th className="p-1.5 text-right">KM</th>
                                <th className="p-1.5 text-right">Speed</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-850 font-mono">
                              {selectedTxEvidence.pointsInWindow?.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="p-3 text-center text-slate-400">No logs in window.</td>
                                </tr>
                              ) : (
                                selectedTxEvidence.pointsInWindow.map((pt: any, i: number) => (
                                  <tr key={i} className="hover:bg-slate-50/50">
                                    <td className="p-1.5 whitespace-nowrap">{new Date(pt.timestamp).toLocaleTimeString()}</td>
                                    <td className="p-1.5 truncate max-w-[120px]" title={pt.locationAddress}>{pt.locationAddress || `${pt.latitude}, ${pt.longitude}`}</td>
                                    <td className="p-1.5 text-right">{pt.fuelLevelPercent !== null ? `${Math.round(pt.fuelLevelPercent)}%` : '—'}</td>
                                    <td className="p-1.5 text-right">{pt.odometerKm ?? '—'}</td>
                                    <td className="p-1.5 text-right">{pt.speedKmh ?? '—'}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Score explanation sentence */}
                      <div className="p-3 bg-indigo-50/20 border border-indigo-150 dark:border-indigo-900/30 rounded-xl text-3xs leading-relaxed text-indigo-950 dark:text-indigo-300">
                        <span className="font-extrabold block mb-0.5 uppercase tracking-wider text-[8px] text-indigo-500">Scoring Engine Explanation:</span>
                        <p>{selectedTxEvidence.assessment?.friendlyReason || selectedTxEvidence.assessment?.factors?.[0]?.explanation || 'No confirmed match found. Vehicles registrations/times mismatch.'}</p>
                      </div>

                      {/* Auditor overrides notes & actions */}
                      <div className="space-y-2 border-t border-slate-150 dark:border-slate-800 pt-3">
                        <span className="font-bold text-[10px] text-slate-500 uppercase tracking-wider block">Auditor Override Decisions</span>
                        <textarea
                          value={selectedTransaction.reviewerNote || ''}
                          placeholder="Provide audit override reason or mapping notes..."
                          onChange={(e) => {
                            const note = e.target.value;
                            setSelectedTransaction({ ...selectedTransaction, reviewerNote: note });
                          }}
                          onBlur={(e) => {
                            handleRowOverride(selectedTransaction.id, selectedTransaction.telematicsOverrideStatus || 'Review', e.target.value);
                          }}
                          className="w-full text-2xs p-2 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                          rows={2}
                        />
                        <div className="flex gap-1.5 flex-wrap">
                          <button
                            onClick={() => handleRowOverride(selectedTransaction.id, 'Marked Supported', selectedTransaction.reviewerNote || 'Verified override')}
                            className="py-1 px-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-3xs font-semibold"
                          >
                            Mark Supported
                          </button>
                          <button
                            onClick={() => handleRowOverride(selectedTransaction.id, 'Flagged Mismatch', selectedTransaction.reviewerNote || 'Flagged issue')}
                            className="py-1 px-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-3xs font-semibold"
                          >
                            Flag Issue
                          </button>
                          <button
                            onClick={() => handleRowOverride(selectedTransaction.id, 'Needs Follow Up', selectedTransaction.reviewerNote || '')}
                            className="py-1 px-2.5 bg-amber-500 hover:bg-amber-400 text-white rounded-lg text-3xs font-semibold"
                          >
                            Follow Up
                          </button>
                        </div>
                      </div>

                    </div>
                  ) : (
                    // ─── SIMPLE MODE SELECTED TRANSACTION PANEL ───
                    <div className="space-y-4 text-xs animate-fade-in">
                      
                      {/* If no GPS log files cover this vehicle/date, render a clean empty state card */}
                      {!selectedTxEvidence.beforePoint && !selectedTxEvidence.afterPoint && (!selectedTxEvidence.pointsInWindow || selectedTxEvidence.pointsInWindow.length === 0) ? (
                        <div className="bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 text-center space-y-4">
                          <div className="w-10 h-10 bg-rose-50 dark:bg-rose-955/20 rounded-full flex items-center justify-center mx-auto">
                            <Satellite className="w-5 h-5 text-rose-500" />
                          </div>
                          <div className="space-y-1">
                            <span className="font-extrabold text-xs text-slate-850 dark:text-white block">No GPS evidence found for this transaction</span>
                            <p className="text-[11px] text-slate-500 leading-normal max-w-sm mx-auto">
                              No telemetry coordinates were found near the transaction timestamp.
                            </p>
                          </div>
                          
                          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-3 text-left space-y-1.5 text-[10px] text-slate-600 dark:text-slate-400">
                            <span className="font-bold block text-slate-700 dark:text-slate-350">Possible reasons:</span>
                            <ul className="list-disc pl-4 space-y-1">
                              <li>No GPS telematics file uploaded for registration <strong className="font-mono text-slate-900 dark:text-white">{selectedTransaction.registration || selectedTransaction.vehicleRegistration}</strong></li>
                              <li>The linked GPS files do not cover this date/time range</li>
                              <li>Vehicle registration mismatch between invoice and GPS log name</li>
                              <li>Timezone offsets or timestamp formats differ between provider and telemetry</li>
                            </ul>
                          </div>
                          
                          <div className="flex gap-2 justify-center pt-2">
                            <button
                              onClick={() => setActiveStep(3)}
                              className="px-3 py-1.5 bg-indigo-650 hover:bg-indigo-500 text-white rounded-lg text-2xs font-semibold shadow-sm transition"
                            >
                              Upload GPS
                            </button>
                            <button
                              onClick={() => setActiveStep(2)}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-350 rounded-lg text-2xs font-semibold transition"
                            >
                              Check mapping
                            </button>
                            <button
                              onClick={() => handleRowOverride(selectedTransaction.id, 'Needs Follow Up', 'No GPS telemetry found')}
                              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-white rounded-lg text-2xs font-semibold transition"
                            >
                              Mark for review
                            </button>
                          </div>
                        </div>
                      ) : (
                        // Summary Card
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3.5 shadow-sm">
                          <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                            <span className="font-bold text-slate-850 dark:text-white text-sm">Selected transaction</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                              selectedTransaction.telematicsAssessment?.classification === 'VERIFIED'
                                ? 'bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-400'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-955/30 dark:text-amber-400'
                            }`}>
                              {selectedTransaction.telematicsAssessment?.classification === 'VERIFIED' ? 'Verified' : 'Needs review'}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs font-sans">
                            <div>
                              <span className="text-slate-400 block text-[9px] font-semibold uppercase tracking-wider font-sans">Vehicle</span>
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{selectedTransaction.registration || selectedTransaction.vehicleRegistration || '—'}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[9px] font-semibold uppercase tracking-wider font-sans">Time</span>
                              <span className="font-mono text-slate-800 dark:text-slate-200">
                                {selectedTransaction.transactionTimestamp
                                  ? new Date(selectedTransaction.transactionTimestamp).toISOString().replace('T', ' ').slice(0, 16)
                                  : selectedTransaction.transactionDateTime || '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[9px] font-semibold uppercase tracking-wider font-sans">Product</span>
                              <span className="text-slate-800 dark:text-slate-200">{selectedTransaction.productName || selectedTransaction.productType || '—'}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[9px] font-semibold uppercase tracking-wider font-sans">Qty</span>
                              <span className="font-mono font-semibold text-slate-800 dark:text-slate-205">
                                {parseFloat(selectedTransaction.quantity || selectedTransaction.volume || '0').toFixed(2)} L
                              </span>
                            </div>
                            <div className="col-span-2">
                              <span className="text-slate-400 block text-[9px] font-semibold uppercase tracking-wider font-sans">Net Amount</span>
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-205">
                                €{parseFloat(selectedTransaction.paymentAmountExVat || selectedTransaction.baseValueNet || selectedTransaction.valueOfPurchaseNet || '0').toFixed(2)}
                              </span>
                            </div>
                            <div className="col-span-2 border-t border-slate-100 dark:border-slate-800 pt-2">
                              <span className="text-slate-400 block text-[9px] font-semibold uppercase tracking-wider font-sans">GPS Result</span>
                              <span className="font-semibold text-slate-805 dark:text-slate-200 leading-normal block">
                                {selectedTransaction.telematicsAssessment?.classification === 'VERIFIED'
                                  ? 'GPS supports this transaction. Vehicle was near the forecourt.'
                                  : 'No GPS evidence found near invoice time.'}
                              </span>
                            </div>
                            <div className="col-span-2">
                              <span className="text-slate-400 block text-[9px] font-semibold uppercase tracking-wider font-sans">Recommended Action</span>
                              <span className="text-indigo-600 dark:text-indigo-400 font-bold block">
                                {selectedTransaction.telematicsAssessment?.classification === 'VERIFIED'
                                  ? 'Verify details and approve'
                                  : 'Upload GPS file or review manually'}
                              </span>
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="flex flex-col gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                            <button
                              onClick={() => setSelectedTxForMatch(selectedTransaction)}
                              className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold flex items-center justify-center gap-1.5 shadow-sm text-xs transition"
                            >
                              <GitCompare className="w-4 h-4" /> Compare invoice vs GPS
                            </button>
                            <div className="flex gap-2">
                              {selectedTransaction.sourceEvidence && (
                                  <button
                                    onClick={() => setSelectedTxForSource(selectedTransaction)}
                                    className="flex-1 py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-350 rounded-xl font-semibold flex items-center justify-center gap-1 text-2xs transition"
                                  >
                                    <Eye className="w-3.5 h-3.5" /> Open source
                                  </button>
                                )}
                              <button
                                onClick={() => setShowFullGpsSource(!showFullGpsSource)}
                                className="flex-1 py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-350 rounded-xl font-semibold flex items-center justify-center gap-1 text-2xs transition"
                              >
                                <Satellite className="w-3.5 h-3.5" /> {showFullGpsSource ? 'Hide GPS window' : 'Open GPS window'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* No GPS match details shown inline if no match exists but coordinates DO exist in files */}
                      {selectedTransaction.telematicsAssessment?.classification !== 'VERIFIED' && (selectedTxEvidence.beforePoint || selectedTxEvidence.afterPoint || selectedTxEvidence.pointsInWindow?.length > 0) && (
                        <div className="bg-slate-50 dark:bg-slate-850 border border-slate-150 dark:border-slate-800 rounded-2xl p-3.5 space-y-2">
                          <span className="font-extrabold text-[10px] text-slate-450 uppercase tracking-wider block flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-indigo-505" />
                            Where was this vehicle at invoice time?
                          </span>
                          <div className="text-2xs leading-normal text-slate-650 dark:text-slate-400 space-y-1.5">
                            <p className="font-semibold text-rose-600 dark:text-rose-400">No GPS point found within ±30 minutes.</p>
                            {(() => {
                              const pts = selectedTxEvidence.pointsInWindow || [];
                              if (pts.length > 0) {
                                return <p>Nearest available GPS point: {new Date(pts[0].timestamp).toLocaleString()}</p>;
                              }
                              if (selectedTxEvidence.beforePoint) {
                                return <p>Nearest available GPS point: {new Date(selectedTxEvidence.beforePoint.timestamp).toLocaleString()} (Before window)</p>;
                              }
                              if (selectedTxEvidence.afterPoint) {
                                return <p>Nearest available GPS point: {new Date(selectedTxEvidence.afterPoint.timestamp).toLocaleString()} (After window)</p>;
                              }
                              return null;
                            })()}
                          </div>
                        </div>
                      )}

                      {/* GPS window timeline table shown under "Open GPS window" */}
                      {showFullGpsSource && (
                        <div className="space-y-1.5 animate-fade-in">
                          <span className="font-bold text-[10px] text-slate-455 uppercase tracking-wider block">GPS log timeline</span>
                          <div className="border border-slate-150 dark:border-slate-800 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                            <table className="w-full text-left border-collapse text-3xs">
                              <thead>
                                <tr className="bg-slate-50 dark:bg-slate-850 text-slate-550 font-semibold border-b border-slate-150">
                                  <th className="p-1.5">Time</th>
                                  <th className="p-1.5">Address</th>
                                  <th className="p-1.5 text-right">Fuel</th>
                                  <th className="p-1.5 text-right">KM</th>
                                  <th className="p-1.5 text-right">Speed</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-850 font-mono">
                                {selectedTxEvidence.pointsInWindow?.length === 0 ? (
                                  <tr>
                                    <td colSpan={5} className="p-3 text-center text-slate-450">No logs in window.</td>
                                  </tr>
                                ) : (
                                  selectedTxEvidence.pointsInWindow.map((pt: any, i: number) => (
                                    <tr key={i} className="hover:bg-slate-50/50">
                                      <td className="p-1.5 whitespace-nowrap">{new Date(pt.timestamp).toLocaleTimeString()}</td>
                                      <td className="p-1.5 truncate max-w-[120px]" title={pt.locationAddress}>{pt.locationAddress || `${pt.latitude}, ${pt.longitude}`}</td>
                                      <td className="p-1.5 text-right">{pt.fuelLevelPercent !== null ? `${Math.round(pt.fuelLevelPercent)}%` : '—'}</td>
                                      <td className="p-1.5 text-right">{pt.odometerKm ?? '—'}</td>
                                      <td className="p-1.5 text-right">{pt.speedKmh ?? '—'}</td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Auditor overrides notes & actions */}
                      <div className="space-y-2 border-t border-slate-155 dark:border-slate-800 pt-3">
                        <span className="font-bold text-[10px] text-slate-505 uppercase tracking-wider block">Auditor Override Decisions</span>
                        <textarea
                          value={selectedTransaction.reviewerNote || ''}
                          placeholder="Provide audit override reason or mapping notes..."
                          onChange={(e) => {
                            const note = e.target.value;
                            setSelectedTransaction({ ...selectedTransaction, reviewerNote: note });
                          }}
                          onBlur={(e) => {
                            handleRowOverride(selectedTransaction.id, selectedTransaction.telematicsOverrideStatus || 'Review', e.target.value);
                          }}
                          className="w-full text-2xs p-2 bg-slate-50 dark:bg-slate-855 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                          rows={2}
                        />
                        <div className="flex gap-1.5 flex-wrap">
                          <button
                            onClick={() => handleRowOverride(selectedTransaction.id, 'Marked Supported', selectedTransaction.reviewerNote || 'Verified override')}
                            className="py-1 px-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-3xs font-semibold"
                          >
                            Mark Supported
                          </button>
                          <button
                            onClick={() => handleRowOverride(selectedTransaction.id, 'Flagged Mismatch', selectedTransaction.reviewerNote || 'Flagged issue')}
                            className="py-1 px-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-3xs font-semibold"
                          >
                            Flag Issue
                          </button>
                          <button
                            onClick={() => handleRowOverride(selectedTransaction.id, 'Needs Follow Up', selectedTransaction.reviewerNote || '')}
                            className="py-1 px-2.5 bg-amber-500 hover:bg-amber-400 text-white rounded-lg text-3xs font-semibold"
                          >
                            Follow Up
                          </button>
                        </div>
                      </div>

                    </div>
                  )
                ) : null}

                  {/* Advanced settings preview inside Step 4 */}
                  {advancedMode && (
                    <div className="bg-slate-50 dark:bg-slate-850 p-4 border border-slate-250 dark:border-slate-800 rounded-2xl space-y-3.5 text-2xs">
                      <span className="font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-wider flex items-center gap-1">
                        <Settings className="w-3.5 h-3.5" />
                        Advanced Scorer dials
                      </span>
                      <div className="space-y-2">
                        <div>
                          <label className="block text-slate-550 mb-0.5">Location Radius tolerance:</label>
                          <select disabled className="w-full text-3xs p-1 bg-white border rounded">
                            <option>5.0 km (Default) — Coming soon — not active yet</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-slate-550 mb-0.5">Timezone assumption:</label>
                          <select disabled className="w-full text-3xs p-1 bg-white border rounded">
                            <option>UTC (Default) — Coming soon — not active yet</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2.5 pt-4 border-t border-slate-150 dark:border-slate-800">
                  <button
                    onClick={() => setActiveStep(5)}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md flex items-center justify-center gap-1 transition"
                  >
                    Continue to Approve / Flag <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 5: APPROVE / FLAG BATCH SIGN-OFF */}
            {activeStep === 5 && (
              <div className="space-y-4 animate-fade-in flex-1 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-450">
                      Step 5: Batch Approval Sign-off
                    </span>
                    <span className="px-2.5 py-0.5 rounded text-3xs font-extrabold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 border border-indigo-200/50 uppercase">
                      {activeBatch.approvalStatus || 'draft'}
                    </span>
                  </div>

                  {getUnresolvedBlockingIssuesCount() > 0 ? (
                    <div className="p-3 bg-rose-50 dark:bg-rose-955/20 border border-rose-200/50 rounded-xl flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                      <div className="text-2xs leading-normal">
                        <span className="font-extrabold text-rose-800 block">
                          Batch approval blocked — {getUnresolvedBlockingIssuesCount()} items remain
                        </span>
                        <p className="text-[11px] text-rose-600 mt-1 leading-normal">
                          You cannot approve this invoice reconciliation run until all vehicle GPS logs are linked and warnings or parser exceptions are manually resolved/flagged with comments.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-green-50 dark:bg-green-950/15 border border-green-200/50 rounded-xl flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                      <div className="text-2xs leading-normal">
                        <span className="font-extrabold text-green-800 block">
                          Reconciliation check complete
                        </span>
                        <p className="text-[11px] text-green-600 mt-0.5">
                          All invoiced vehicles are matched, totals verify, and exceptions are resolved. This run is ready to sign off.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Summary list */}
                  <div className="border border-slate-150 dark:border-slate-800 rounded-xl overflow-hidden font-mono text-[10px] divide-y divide-slate-100 dark:divide-slate-850">
                    <div className="flex justify-between p-2">
                      <span className="text-slate-450 select-none">Total transactions:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{transactions.length} rows</span>
                    </div>
                    <div className="flex justify-between p-2">
                      <span className="text-slate-450 select-none">Vehicles checked:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{activeBatch.vehicles.length} units</span>
                    </div>
                    <div className="flex justify-between p-2">
                      <span className="text-slate-450 select-none">GPS Log coverage linked:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{activeBatch.attachedGpsFiles?.length || 0} files</span>
                    </div>
                    <div className="flex justify-between p-2">
                      <span className="text-slate-450 select-none">Supported / Likely supported:</span>
                      <span className="text-green-600 font-bold">
                        {transactions.filter(t => t.telematicsAssessment?.classification === 'VERIFIED' || t.telematicsAssessment?.classification === 'LIKELY' || t.telematicsOverrideStatus === 'Marked Supported').length}
                      </span>
                    </div>
                    <div className="flex justify-between p-2">
                      <span className="text-slate-450 select-none">Manual overrides / notes added:</span>
                      <span className="text-indigo-600 font-bold">
                        {transactions.filter(t => t.telematicsOverrideStatus).length} rows
                      </span>
                    </div>
                  </div>

                  {/* Reviewer Note area */}
                  <div className="space-y-1">
                    <span className="text-2xs font-bold text-slate-700 dark:text-slate-300">Auditor Sign-off Notes:</span>
                    <textarea
                      value={activeBatch.reviewerNotes || ''}
                      placeholder="Add final compliance sign-off remarks, exception logs, or reviewer details..."
                      onChange={(e) => setActiveBatch({ ...activeBatch, reviewerNotes: e.target.value })}
                      onBlur={(e) => updateApprovalStatus(activeBatch.approvalStatus || 'draft', e.target.value)}
                      className="w-full text-2xs p-2.5 bg-slate-50 dark:bg-slate-855 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                      rows={2}
                    />
                    <span className="text-[9px] text-slate-400 block select-none">Auto-saves when focus moves away.</span>
                  </div>

                  {/* Audit History Log */}
                  <div className="space-y-1.5">
                    <span className="text-2xs font-bold text-slate-750 dark:text-slate-350 block">Audit Trail transitions log</span>
                    <div className="max-h-[140px] overflow-y-auto border border-slate-150 dark:border-slate-800 rounded-xl p-2 bg-slate-50/50 dark:bg-slate-900/40 text-[9px] divide-y divide-slate-100 dark:divide-slate-850">
                      {!activeBatch.auditHistory || activeBatch.auditHistory.length === 0 ? (
                        <div className="text-slate-400 py-1.5 text-center">No audit logs recorded. Status transitions log automatically.</div>
                      ) : (
                        activeBatch.auditHistory.map((item, idx) => (
                          <div key={idx} className="py-1.5 flex justify-between gap-2 first:pt-0 last:pb-0">
                            <div>
                              <span className="font-semibold text-slate-700 dark:text-slate-300 block">{item.details}</span>
                              <span className="text-[8px] text-slate-450 mt-0.5">Auditor: {item.user}</span>
                            </div>
                            <span className="text-slate-400 whitespace-nowrap font-mono">{new Date(item.timestamp).toLocaleTimeString()}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-4 border-t border-slate-150 dark:border-slate-800">
                  <button
                    disabled={getUnresolvedBlockingIssuesCount() > 0}
                    onClick={handleConfirmBatch}
                    className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold shadow-md flex items-center justify-center gap-1 transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Approve Invoice
                  </button>
                  <button
                    onClick={() => updateApprovalStatus('needs_review')}
                    className="py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                  >
                    Flag review
                  </button>
                  <button
                    onClick={() => updateApprovalStatus('rejected')}
                    className="py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            )}

          </div>

        </div>
      )}

      {/* ─── INLINE EDIT TRANSACTION POPUP DIALOG ─── */}
      {editingTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-[650px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto animate-zoom-in">
            <div className="flex justify-between items-center border-b border-slate-150 dark:border-slate-850 pb-2">
              <span className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                <PenTool className="w-5 h-5 text-indigo-600" />
                Edit extracted transaction fields
              </span>
              <button
                onClick={() => setEditingTransaction(null)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 rounded-lg"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              
              <div className="space-y-1">
                <label className="block text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Vehicle Registration:</label>
                <input
                  type="text"
                  value={editForm.registration}
                  onChange={(e) => setEditForm({ ...editForm, registration: e.target.value })}
                  className="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 font-mono text-[11px]"
                />
                {editingTransaction.originalValues?.registration !== undefined && (
                  <span className="text-[10px] text-indigo-600 block">Original: {editingTransaction.originalValues.registration}</span>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Product / Item category:</label>
                <input
                  type="text"
                  value={editForm.productName}
                  onChange={(e) => setEditForm({ ...editForm, productName: e.target.value })}
                  className="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50"
                />
                {editingTransaction.originalValues?.productName !== undefined && (
                  <span className="text-[10px] text-indigo-600 block">Original: {editingTransaction.originalValues.productName}</span>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Station City:</label>
                <input
                  type="text"
                  value={editForm.stationCity}
                  onChange={(e) => setEditForm({ ...editForm, stationCity: e.target.value })}
                  className="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50"
                />
                {editingTransaction.originalValues?.stationCity !== undefined && (
                  <span className="text-[10px] text-indigo-600 block">Original: {editingTransaction.originalValues.stationCity}</span>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Station / Forecourt Name:</label>
                <input
                  type="text"
                  value={editForm.stationName}
                  onChange={(e) => setEditForm({ ...editForm, stationName: e.target.value })}
                  className="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50"
                />
                {editingTransaction.originalValues?.stationName !== undefined && (
                  <span className="text-[10px] text-indigo-600 block">Original: {editingTransaction.originalValues.stationName}</span>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Date (YYYY-MM-DD):</label>
                <input
                  type="text"
                  value={editForm.transactionDate}
                  onChange={(e) => setEditForm({ ...editForm, transactionDate: e.target.value })}
                  className="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 font-mono text-[11px]"
                />
                {editingTransaction.originalValues?.transactionDate !== undefined && (
                  <span className="text-[10px] text-indigo-600 block">Original: {editingTransaction.originalValues.transactionDate}</span>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Timestamp (Local/ISO):</label>
                <input
                  type="text"
                  value={editForm.transactionTimestamp}
                  onChange={(e) => setEditForm({ ...editForm, transactionTimestamp: e.target.value })}
                  className="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 font-mono text-[11px]"
                />
                {editingTransaction.originalValues?.transactionTimestamp !== undefined && (
                  <span className="text-[10px] text-indigo-600 block">Original: {editingTransaction.originalValues.transactionTimestamp}</span>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Quantity / Volumetric litres:</label>
                <input
                  type="text"
                  value={editForm.quantity}
                  onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                  className="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 font-mono text-[11px]"
                />
                {editingTransaction.originalValues?.quantity !== undefined && (
                  <span className="text-[10px] text-indigo-600 block">Original: {editingTransaction.originalValues.quantity}</span>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Total Net amount:</label>
                <input
                  type="text"
                  value={editForm.baseValueNet}
                  onChange={(e) => setEditForm({ ...editForm, baseValueNet: e.target.value })}
                  className="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 font-mono text-[11px]"
                />
                {editingTransaction.originalValues?.baseValueNet !== undefined && (
                  <span className="text-[10px] text-indigo-600 block">Original: {editingTransaction.originalValues.baseValueNet}</span>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Discount net value:</label>
                <input
                  type="text"
                  value={editForm.discountNet}
                  onChange={(e) => setEditForm({ ...editForm, discountNet: e.target.value })}
                  className="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 font-mono text-[11px]"
                />
                {editingTransaction.originalValues?.discountNet !== undefined && (
                  <span className="text-[10px] text-indigo-600 block">Original: {editingTransaction.originalValues.discountNet}</span>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500 font-semibold uppercase tracking-wider text-[10px]">VAT value:</label>
                <input
                  type="text"
                  value={editForm.vat}
                  onChange={(e) => setEditForm({ ...editForm, vat: e.target.value })}
                  className="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 font-mono text-[11px]"
                />
                {editingTransaction.originalValues?.vat !== undefined && (
                  <span className="text-[10px] text-indigo-600 block">Original: {editingTransaction.originalValues.vat}</span>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Gross / Billing amount:</label>
                <input
                  type="text"
                  value={editForm.valueInPayCurrency}
                  onChange={(e) => setEditForm({ ...editForm, valueInPayCurrency: e.target.value })}
                  className="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 font-mono text-[11px]"
                />
                {editingTransaction.originalValues?.valueInPayCurrency !== undefined && (
                  <span className="text-[10px] text-indigo-600 block">Original: {editingTransaction.originalValues.valueInPayCurrency}</span>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Billing Currency:</label>
                <input
                  type="text"
                  value={editForm.paymentCurrency}
                  onChange={(e) => setEditForm({ ...editForm, paymentCurrency: e.target.value })}
                  className="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 font-mono text-[11px]"
                />
              </div>

            </div>

            <div className="flex gap-2 pt-4 border-t border-slate-150 dark:border-slate-850">
              <button
                onClick={handleSaveEdit}
                disabled={recomputingRowId !== null}
                className="btn btn-primary flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                {recomputingRowId === editingTransaction.id ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Recalculating scores...</>
                ) : (
                  <>Save corrected fields</>
                )}
              </button>
              
              {editingTransaction.isManuallyEdited && (
                <button
                  onClick={() => handleRevertRow(editingTransaction.id)}
                  disabled={recomputingRowId !== null}
                  className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-350 border border-slate-200 dark:border-slate-750 rounded-xl text-xs font-semibold flex items-center gap-1"
                >
                  <Undo className="w-4 h-4" />
                  Revert to Extracted
                </button>
              )}

              <button
                onClick={() => setEditingTransaction(null)}
                className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-350 border border-slate-200 dark:border-slate-750 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── E2E COMPATIBILITY BACKWARD MODALS ─── */}
      {selectedTxForSource && (
        <SourceViewerPanel
          isOpen={true}
          onClose={() => setSelectedTxForSource(null)}
          evidence={selectedTxForSource.sourceEvidence}
          transaction={selectedTxForSource}
        />
      )}

      {selectedTxForMatch && (
        <EvidenceMatchView
          isOpen={true}
          onClose={() => setSelectedTxForMatch(null)}
          transactionId={selectedTxForMatch.id}
          advancedMode={advancedMode}
        />
      )}

    </div>
  );
}

export default function BatchesPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-indigo-600"></div>
      </div>
    }>
      <BatchesPageContent />
    </Suspense>
  );
}
