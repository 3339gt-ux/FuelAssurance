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
import { geocodeText } from '@/lib/geocoder';

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
  const [rightPanelTab, setRightPanelTab] = useState<'comparison' | 'gps_upload' | 'manual_review'>('comparison');

  // Modals for E2E tests
  const [selectedTxForSource, setSelectedTxForSource] = useState<any | null>(null);
  const [selectedTxForMatch, setSelectedTxForMatch] = useState<any | null>(null);

  // Catchall redesign state variables
  const [approximateMapSettings, setApproximateMapSettings] = useState<'on' | 'off'>('on');
  const [bulkGeocodeSettings, setBulkGeocodeSettings] = useState<'on' | 'off'>('off');
  const [showManualGpsReview, setShowManualGpsReview] = useState<boolean>(false);
  const [manualVehicle, setManualVehicle] = useState('');
  const [manualDate, setManualDate] = useState('');
  const [manualTime, setManualTime] = useState('');
  const [manualWindow, setManualWindow] = useState('30');
  const [manualLocationSearch, setManualLocationSearch] = useState('');
  const [manualResults, setManualResults] = useState<any[]>([]);
  const [selectedGpsRow, setSelectedGpsRow] = useState<any | null>(null);
  const [manualReviewNote, setManualReviewNote] = useState('');
  const [showAdvancedExtraction, setShowAdvancedExtraction] = useState<boolean>(false);
  const [geocodedCoords, setGeocodedCoords] = useState<{ lat: number | null; lon: number | null; type: string; source: string; combinedText?: string } | null>(null);
  const [manualGeocodedCoords, setManualGeocodedCoords] = useState<{ lat: number | null; lon: number | null; type: string; source: string; combinedText?: string } | null>(null);

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

        // Keep selected transaction reference updated, or select first unresolved
        if (selectedTransaction) {
          const updatedTx = enrichedTxs.find((t: any) => t.id === selectedTransaction.id);
          if (updatedTx) setSelectedTransaction(updatedTx);
        } else if (enrichedTxs.length > 0) {
          const firstUnresolved = enrichedTxs.find((t: any) => 
            t.status !== 'OK' && t.status !== 'Validated' && t.status !== 'VALIDATED' &&
            t.telematicsAssessment?.classification !== 'VERIFIED' && t.telematicsAssessment?.classification !== 'LIKELY' &&
            t.telematicsOverrideStatus !== 'Marked Supported' && t.telematicsOverrideStatus !== 'Manually Approved'
          );
          setSelectedTransaction(firstUnresolved || enrichedTxs[0]);
        }

        // Set right panel tab state based on GPS files availability
        if (mappedBatch.attachedGpsFiles && mappedBatch.attachedGpsFiles.length > 0) {
          setRightPanelTab('comparison');
        } else {
          setRightPanelTab('gps_upload');
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
      // Auto transition to Step 4 comparison workspace
      setActiveStep(4);
    } else {
      setSelectedBatchId(null);
      setActiveBatch(null);
      setTransactions([]);
      setSelectedTransaction(null);
      setActiveStep(1);
    }
  }, [batchIdParam, fetchBatchDetails]);

  const buildCombinedLocationText = (pt: any) => {
    if (!pt) return '';
    const street = pt.locationStreet || pt.positionFromStreet || pt.street || pt.Street || '';
    const village = pt.locationVillage || pt.positionFromVillage || pt.village || pt.Village || '';
    const town = pt.locationTown || pt.positionFromTown || pt.town || pt.Town || '';
    const city = pt.locationCity || pt.positionFromCity || pt.city || pt.City || '';
    const address = pt.locationAddress || pt.positionFromAddress || pt.address || pt.Address || pt.location || pt.Location || pt.position || pt.Position || '';
    const country = pt.country || pt.Country || '';
    const region = pt.region || pt.Region || '';
    
    return [
      street,
      village,
      town,
      city,
      address,
      country,
      region
    ].map(s => String(s || '').trim()).filter(Boolean).join(", ");
  };

  // Synchronize manual review states on transaction change
  useEffect(() => {
    if (selectedTransaction) {
      setManualVehicle(selectedTransaction.registration || selectedTransaction.vehicleRegistration || '');
      const timestamp = selectedTransaction.transactionTimestamp || selectedTransaction.transactionDateTime;
      if (timestamp) {
        const d = new Date(timestamp);
        if (!isNaN(d.getTime())) {
          setManualDate(d.toISOString().slice(0, 10));
          setManualTime(d.toTimeString().slice(0, 5));
        }
      }
      setManualReviewNote(selectedTransaction.reviewerNote || '');
      if (selectedTransaction.manualGpsReview) {
        setManualReviewNote(selectedTransaction.manualGpsReview.note || '');
      }
    }
  }, [selectedTransaction]);

  // Geocode the nearest point of the selected transaction
  useEffect(() => {
    if (!selectedTransaction || !selectedTxEvidence) {
      setGeocodedCoords(null);
      return;
    }

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

    if (!nearest) {
      setGeocodedCoords({ lat: null, lon: null, type: 'unavailable', source: 'none' });
      return;
    }

    // Level 1: exact GPS coordinates available
    if (
      nearest.latitude !== null &&
      nearest.latitude !== undefined &&
      nearest.longitude !== null &&
      nearest.longitude !== undefined &&
      !isNaN(nearest.latitude) &&
      !isNaN(nearest.longitude)
    ) {
      setGeocodedCoords({
        lat: nearest.latitude,
        lon: nearest.longitude,
        type: 'exact',
        source: 'gps_log',
        combinedText: buildCombinedLocationText(nearest)
      });
      return;
    }

    // Level 2: geocode from text if setting is enabled
    const combinedText = buildCombinedLocationText(nearest);
    if (!combinedText) {
      setGeocodedCoords({ lat: null, lon: null, type: 'text_only', source: 'none' });
      return;
    }

    if (approximateMapSettings === 'off') {
      setGeocodedCoords({ lat: null, lon: null, type: 'text_only', source: 'none', combinedText });
      return;
    }

    let active = true;
    geocodeText(combinedText)
      .then((res) => {
        if (!active) return;
        if (res) {
          setGeocodedCoords({
            lat: res.lat,
            lon: res.lon,
            type: 'approximate',
            source: res.source,
            combinedText
          });
        } else {
          setGeocodedCoords({
            lat: null,
            lon: null,
            type: 'text_only',
            source: 'none',
            combinedText
          });
        }
      })
      .catch((err) => {
        console.error('Geocoding error:', err);
        if (active) setGeocodedCoords({ lat: null, lon: null, type: 'text_only', source: 'none', combinedText });
      });

    return () => { active = false; };
  }, [selectedTransaction, selectedTxEvidence, approximateMapSettings]);

  // Geocode the manually clicked GPS row
  useEffect(() => {
    if (!selectedGpsRow) {
      setManualGeocodedCoords(null);
      return;
    }

    // Level 1: exact
    if (
      selectedGpsRow.latitude !== null &&
      selectedGpsRow.latitude !== undefined &&
      selectedGpsRow.longitude !== null &&
      selectedGpsRow.longitude !== undefined &&
      !isNaN(selectedGpsRow.latitude) &&
      !isNaN(selectedGpsRow.longitude)
    ) {
      setManualGeocodedCoords({
        lat: selectedGpsRow.latitude,
        lon: selectedGpsRow.longitude,
        type: 'exact',
        source: 'gps_log',
        combinedText: buildCombinedLocationText(selectedGpsRow)
      });
      return;
    }

    const combinedText = buildCombinedLocationText(selectedGpsRow);
    if (!combinedText) {
      setManualGeocodedCoords({ lat: null, lon: null, type: 'text_only', source: 'none' });
      return;
    }

    let active = true;
    geocodeText(combinedText)
      .then((res) => {
        if (!active) return;
        if (res) {
          setManualGeocodedCoords({
            lat: res.lat,
            lon: res.lon,
            type: 'approximate',
            source: res.source,
            combinedText
          });
        } else {
          setManualGeocodedCoords({
            lat: null,
            lon: null,
            type: 'text_only',
            source: 'none',
            combinedText
          });
        }
      })
      .catch(() => {
        if (active) setManualGeocodedCoords({ lat: null, lon: null, type: 'text_only', source: 'none', combinedText });
      });

    return () => { active = false; };
  }, [selectedGpsRow]);

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
      'text/csv': ['.csv'],
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

  const handleManualSearch = () => {
    if (!selectedTxEvidence || !selectedTxEvidence.allVehiclePoints) {
      setManualResults([]);
      return;
    }
    
    let pts = [...selectedTxEvidence.allVehiclePoints];
    
    // Filter by vehicle registration (normalized)
    if (manualVehicle) {
      const normSearchVeh = normalizeRegistration(manualVehicle);
      pts = pts.filter(p => normalizeRegistration(p.vehicleRegistration) === normSearchVeh);
    }
    
    // Filter by date & time window
    if (manualDate && manualTime) {
      const searchDateTimeStr = `${manualDate}T${manualTime}:00`;
      const searchTime = new Date(searchDateTimeStr).getTime();
      if (!isNaN(searchTime)) {
        pts = pts.filter(p => {
          const ptTime = new Date(p.timestamp).getTime();
          if (isNaN(ptTime)) return false;
          
          const diffMs = Math.abs(ptTime - searchTime);
          if (manualWindow === '15') return diffMs <= 15 * 60 * 1000;
          if (manualWindow === '30') return diffMs <= 30 * 60 * 1000;
          if (manualWindow === '60') return diffMs <= 60 * 60 * 1000;
          if (manualWindow === '120') return diffMs <= 120 * 60 * 1000;
          if (manualWindow === 'day') {
            const ptDate = new Date(p.timestamp).toISOString().slice(0, 10);
            return ptDate === manualDate;
          }
          return true;
        });
      }
    }
    
    // Filter by location contains
    if (manualLocationSearch) {
      const locSearch = manualLocationSearch.toLowerCase().trim();
      pts = pts.filter(p => {
        const combined = buildCombinedLocationText(p).toLowerCase();
        return combined.includes(locSearch);
      });
    }
    
    // Sort chronologically or by proximity to invoice time
    const txTime = new Date(selectedTransaction.transactionTimestamp || selectedTransaction.transactionDateTime).getTime();
    pts.sort((a, b) => {
      const diffA = Math.abs(new Date(a.timestamp).getTime() - txTime);
      const diffB = Math.abs(new Date(b.timestamp).getTime() - txTime);
      return diffA - diffB;
    });
    
    setManualResults(pts);
  };

  const handleSaveManualReview = async (decision: 'supports' | 'does_not_support' | 'needs_follow_up', useWindow = false) => {
    if (!manualReviewNote.trim()) {
      alert('Please enter a manual reviewer note describing the evidence.');
      return;
    }
    
    const selectedRowIds = selectedGpsRow ? [selectedGpsRow.id] : [];
    
    const manualReview = {
      transactionId: selectedTransaction.id,
      selectedGpsRowIds: useWindow ? (manualResults.map(r => r.id)) : selectedRowIds,
      decision,
      note: manualReviewNote,
      reviewer: 'Auditor',
      reviewedAt: new Date().toISOString(),
      locationEvidenceType: manualGeocodedCoords?.type || 'text_only'
    };
    
    let overrideStatus = 'Needs Review';
    if (decision === 'supports') overrideStatus = 'Marked Supported';
    else if (decision === 'does_not_support') overrideStatus = 'Flagged Mismatch';
    else if (decision === 'needs_follow_up') overrideStatus = 'Needs Follow Up';
    
    try {
      const res = await fetch(`/api/transactions/${selectedTransaction.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telematicsOverrideStatus: overrideStatus,
          reviewerNote: manualReviewNote,
          manualGpsReview: manualReview
        }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchBatchDetails(activeBatch!.id);
        setSelectedTransaction((prev: any) => prev ? {
          ...prev,
          telematicsOverrideStatus: overrideStatus,
          reviewerNote: manualReviewNote,
          manualGpsReview: manualReview
        } : null);
        alert('Manual review decision saved successfully!');
      }
    } catch (err) {
      alert('Failed to save manual review.');
    }
  };

  const getNextActionText = () => {
    if (!activeBatch) return '';
    if (!activeBatch.attachedGpsFiles || activeBatch.attachedGpsFiles.length === 0) {
      return 'Upload GPS data';
    }
    const unresolvedCount = getUnresolvedBlockingIssuesCount();
    if (unresolvedCount > 0) {
      return 'Review GPS issues';
    }
    return 'Approve invoice';
  };

  const handleReviewFirstIssue = () => {
    if (!transactions.length) return;
    const firstUnresolved = transactions.find((t: any) => 
      t.status !== 'OK' && t.status !== 'Validated' && t.status !== 'VALIDATED' &&
      t.telematicsAssessment?.classification !== 'VERIFIED' && t.telematicsAssessment?.classification !== 'LIKELY' &&
      t.telematicsOverrideStatus !== 'Marked Supported' && t.telematicsOverrideStatus !== 'Manually Approved'
    );
    setSelectedTransaction(firstUnresolved || transactions[0]);
    setRightPanelTab('comparison');
  };

  const getGpsSaysText = () => {
    if (!selectedTransaction) return 'No transaction selected.';
    if (selectedTransaction.telematicsOverrideStatus === 'Marked Supported') {
      return `Vehicle GPS history manually supported: ${selectedTransaction.reviewerNote || 'Approved override'}`;
    }
    if (selectedTransaction.telematicsOverrideStatus === 'Flagged Mismatch') {
      return `Vehicle GPS history flagged as mismatch: ${selectedTransaction.reviewerNote || 'Flagged issue'}`;
    }
    if (selectedTransaction.telematicsOverrideStatus === 'Needs Follow Up') {
      return `Needs follow-up review: ${selectedTransaction.reviewerNote || 'Pending details'}`;
    }
    if (!selectedTxEvidence) return 'Loading GPS data...';
    
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
    
    if (!nearest) {
      return 'No GPS point found within ±30 minutes. Try a wider window, upload more GPS, or manually review GPS history.';
    }

    const diffMins = Math.round(Math.abs(new Date(nearest.timestamp).getTime() - txTime) / 60000);
    const isBefore = new Date(nearest.timestamp).getTime() < txTime;
    const diffText = `${diffMins} minutes ${isBefore ? 'before' : 'after'}`;

    const location = buildCombinedLocationText(nearest) || selectedTransaction.stationCity || selectedTransaction.stationName || 'the forecourt';

    // Check fuel levels
    let fuelInfo = '';
    const fuels = pts.map((p: any) => p.fuelLevelPercent).filter((f: any) => f !== null && f !== undefined);
    if (fuels.length > 1) {
      const minF = Math.round(Math.min(...fuels));
      const maxF = Math.round(Math.max(...fuels));
      if (maxF > minF) {
        fuelInfo = ` Fuel increased from ${minF}% to ${maxF}%.`;
      } else {
        fuelInfo = ` Fuel level was stable at ${minF}%.`;
      }
    } else if (nearest.fuelLevelPercent !== null && nearest.fuelLevelPercent !== undefined) {
      fuelInfo = ` Fuel level was ${Math.round(nearest.fuelLevelPercent)}%.`;
    }

    if (selectedTransaction.telematicsAssessment?.classification === 'VERIFIED' || selectedTransaction.telematicsAssessment?.classification === 'LIKELY') {
      return `Vehicle was near ${location} ${diffMins} minutes ${isBefore ? 'before' : 'after'} the invoice time.${fuelInfo}`;
    }

    return `No GPS point found near this time. Nearest available point: ${diffMins}m away at ${location}.`;
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

  const getFriendlySource = (batch: BatchRecord | null) => {
    if (!batch) return 'Unknown Source';
    if (batch.provider === 'AS24') {
      return 'AS24 Invoice PDF';
    }
    if (batch.provider === 'DKV') {
      if (batch.sourceType?.includes('PDF') || batch.filename?.toLowerCase().endsWith('.pdf')) {
        return 'DKV Invoice PDF';
      }
      return 'DKV Excel';
    }
    return batch.sourceType || batch.provider;
  };

  const getBatchDateRange = () => {
    if (!transactions.length) return '—';
    const dates = transactions
      .map(t => t.transactionTimestamp || t.transactionDateTime || t.transactionDate)
      .map(d => new Date(d))
      .filter(d => !isNaN(d.getTime()));
    if (!dates.length) return '—';
    const minD = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxD = new Date(Math.max(...dates.map(d => d.getTime())));
    const format = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    };
    return `${format(minD)} – ${format(maxD)}`;
  };

  return (
    <div className="max-w-[1600px] mx-auto py-4 px-4 space-y-4 text-slate-800 dark:text-slate-200 animate-fade-in">      {/* ─── WORKSPACE TOP BAR (Current job + next action + actions) ─── */}
      {activeBatch ? (
        <div className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-800 rounded-2xl shadow-md p-4 flex flex-wrap items-center justify-between gap-4 animate-slide-down">
          {/* Left side: Job details & next action */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/batches')}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 rounded-lg transition"
              title="Close workspace"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-550 dark:text-slate-400">
                <span className="font-extrabold text-slate-900 dark:text-white text-sm">
                  {activeBatch.provider} Statement
                </span>
                <span>·</span>
                <span>{transactions.length} transactions</span>
                <span>·</span>
                <span>{activeBatch.attachedGpsFiles?.length || 0} GPS files</span>
                <span>·</span>
                <span className={getUnresolvedBlockingIssuesCount() > 0 ? 'text-amber-600 font-extrabold bg-amber-50 dark:bg-amber-950/20 px-2 py-0.5 rounded' : 'text-green-600 font-extrabold bg-green-50 dark:bg-green-950/20 px-2 py-0.5 rounded'}>
                  {getUnresolvedBlockingIssuesCount()} need review
                </span>
              </div>
              <div className="text-[11px] font-extrabold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 mt-1">
                <ArrowRight className="w-3.5 h-3.5" />
                {getNextActionText()}
              </div>
            </div>
          </div>

          {/* Right side: Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setRightPanelTab('gps_upload')}
              className={`py-1.5 px-3 border rounded-lg text-2xs font-extrabold transition ${
                rightPanelTab === 'gps_upload'
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-750 dark:bg-indigo-950/20 dark:text-indigo-400 font-sans'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              Upload GPS
            </button>
            <button
              onClick={async () => {
                setLoadingBatchData(true);
                await fetchBatchDetails(activeBatch.id);
                alert('Checks updated successfully!');
              }}
              className="py-1.5 px-3 border border-slate-200 dark:border-slate-700 text-slate-650 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-2xs font-extrabold transition"
            >
              Run check
            </button>
            <button
              onClick={handleReviewFirstIssue}
              className="py-1.5 px-3 bg-amber-500 hover:bg-amber-400 text-white rounded-lg text-2xs font-extrabold transition shadow-sm"
            >
              Review issues
            </button>
            <button
              onClick={handleConfirmBatch}
              className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-2xs font-extrabold transition shadow-sm"
            >
              Confirm Extracted Data
            </button>
            <button
              disabled={getUnresolvedBlockingIssuesCount() > 0}
              onClick={handleConfirmBatch}
              className="py-1.5 px-3 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-2xs font-extrabold transition shadow-sm"
            >
              Approve
            </button>
            <button
              onClick={handleExportCSV}
              className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 rounded-lg text-2xs font-extrabold transition"
            >
              Export
            </button>

            {/* Toggle row density button for E2E tests compatibility */}
            <button
              onClick={toggleDensity}
              className="p-1.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400"
              title={`Toggle row density (Currently: ${density})`}
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Advanced mode switch */}
            <div className="h-6 w-px bg-slate-250 dark:bg-slate-800 mx-1"></div>
            <button
              onClick={toggleAdvancedMode}
              className={`py-1.5 px-2.5 rounded-lg text-2xs font-extrabold flex items-center gap-1 border transition-all ${
                advancedMode 
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-glow' 
                  : 'bg-white border-slate-200 hover:border-slate-350 dark:bg-slate-800 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
              title="Toggle Advanced Mode"
            >
              <Settings2 className="w-3.5 h-3.5" />
              {advancedMode ? 'Advanced Mode: ON' : 'Advanced Mode: OFF'}
            </button>
          </div>
        </div>
      ) : (
        /* If no batch loaded, show standard title/stepper for ingestion step */
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
              <button
                onClick={toggleAdvancedMode}
                className={`py-1 px-2.5 rounded-lg text-2xs font-semibold flex items-center gap-1 border transition-all ${
                  advancedMode 
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-glow' 
                    : 'bg-white border-slate-200 hover:border-slate-350 dark:bg-slate-800 dark:border-slate-700 text-slate-650 dark:text-slate-300'
                }`}
                title="Toggle Advanced Mode"
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
                Upload invoice or transaction file
              </p>
              <p className="text-2xs text-slate-500 mt-1 max-w-sm leading-normal">
                Supports DKV PDF, DKV Excel, AS24 PDF
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
                onOpenManualGpsReview={(tx) => {
                  setSelectedTransaction(tx);
                  setActiveStep(4);
                  setShowManualGpsReview(true);
                }}
                selectedVehicle={selectedTransaction?.registration}
                advancedMode={advancedMode}
                onSelectTransaction={(tx) => {
                  setSelectedTransaction(tx);
                  if (activeStep !== 4) setActiveStep(4);
                }}
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

                {/* Extracted Values Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-2xs bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-xl p-3 mt-2">
                  <div>
                    <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[9px]">Date/time</span>
                    <strong className="text-slate-850 dark:text-slate-200 font-mono">
                      {selectedTransaction.transactionTimestamp
                        ? new Date(selectedTransaction.transactionTimestamp).toISOString().replace('T', ' ').slice(0, 16)
                        : selectedTransaction.transactionDateTime || '—'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[9px]">Vehicle</span>
                    <strong className="text-slate-855 dark:text-slate-200 font-mono">{selectedTransaction.registration || selectedTransaction.vehicleRegistration || '—'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[9px]">Product</span>
                    <strong className="text-slate-855 dark:text-slate-200">{selectedTransaction.productName || selectedTransaction.productType || '—'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[9px]">Volume</span>
                    <strong className="text-slate-855 dark:text-slate-200 font-mono">{parseFloat(selectedTransaction.quantity || selectedTransaction.volume || '0').toFixed(2)} L</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[9px]">Net Amount</span>
                    <strong className="text-slate-855 dark:text-slate-200 font-mono">€{parseFloat(selectedTransaction.paymentAmountExVat || selectedTransaction.baseValueNet || selectedTransaction.valueOfPurchaseNet || '0').toFixed(2)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[9px]">VAT/Gross</span>
                    <strong className="text-slate-855 dark:text-slate-200 font-mono">€{parseFloat(selectedTransaction.paymentAmountInclVat || selectedTransaction.valueInPayCurrency || '0').toFixed(2)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[9px]">Discount</span>
                    <strong className="text-emerald-600 dark:text-emerald-400 font-mono">€{parseFloat(selectedTransaction.discountNet || selectedTransaction.rebate || '0').toFixed(2)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-semibold uppercase tracking-wider text-[9px]">Location</span>
                    <strong className="text-slate-855 dark:text-slate-200">{selectedTransaction.stationCity || selectedTransaction.stationName || '—'}</strong>
                  </div>
                </div>

                <div className="pt-2 text-right">
                  <button
                    onClick={() => setShowAdvancedExtraction(!showAdvancedExtraction)}
                    className="text-2xs text-indigo-500 hover:text-indigo-600 font-semibold"
                  >
                    {showAdvancedExtraction ? 'Hide advanced extraction details' : 'Show advanced extraction details'}
                  </button>
                </div>

                {showAdvancedExtraction && (
                  <div className="bg-slate-50 dark:bg-slate-850 p-2.5 rounded-xl border font-mono text-[9px] max-h-36 overflow-y-auto space-y-1">
                    <pre>{JSON.stringify(selectedTransaction.sourceEvidence?.extractedFields || selectedTransaction, null, 2)}</pre>
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

                  {/* Invoice Metadata Card */}
                  <div className="bg-slate-50 dark:bg-slate-850/50 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div><span className="text-slate-400 font-medium">File:</span> <strong className="text-slate-800 dark:text-slate-250 font-mono block truncate" title={activeBatch.filename}>{activeBatch.filename}</strong></div>
                      <div><span className="text-slate-400 font-medium">Source:</span> <strong className="text-slate-800 dark:text-slate-250 block">{getFriendlySource(activeBatch)}</strong></div>
                      <div><span className="text-slate-400 font-medium">Transactions extracted:</span> <strong className="text-slate-800 dark:text-slate-250 block">{transactions.length}</strong></div>
                      <div><span className="text-slate-400 font-medium">Vehicles detected:</span> <strong className="text-slate-800 dark:text-slate-250 block">{activeBatch.vehicles.length}</strong></div>
                      <div className="col-span-2"><span className="text-slate-400 font-medium">Date range:</span> <strong className="text-slate-800 dark:text-slate-250 block font-mono">{getBatchDateRange()}</strong></div>
                    </div>
                    <div className="border-t border-slate-200 dark:border-slate-800 pt-2 mt-2">
                      <span className="text-slate-400 font-medium">Next step:</span> <strong className="text-indigo-600 dark:text-indigo-400 font-sans">Upload GPS file(s)</strong>
                    </div>
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

                  {/* Invoice Metadata Card */}
                  <div className="bg-slate-50 dark:bg-slate-850/50 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div><span className="text-slate-400 font-medium">File:</span> <strong className="text-slate-800 dark:text-slate-250 font-mono block truncate" title={activeBatch.filename}>{activeBatch.filename}</strong></div>
                      <div><span className="text-slate-400 font-medium">Source:</span> <strong className="text-slate-800 dark:text-slate-250 block">{getFriendlySource(activeBatch)}</strong></div>
                      <div><span className="text-slate-400 font-medium">Transactions extracted:</span> <strong className="text-slate-800 dark:text-slate-250 block">{transactions.length}</strong></div>
                      <div><span className="text-slate-400 font-medium">Vehicles detected:</span> <strong className="text-slate-800 dark:text-slate-250 block">{activeBatch.vehicles.length}</strong></div>
                      <div className="col-span-2"><span className="text-slate-400 font-medium">Date range:</span> <strong className="text-slate-800 dark:text-slate-250 block font-mono">{getBatchDateRange()}</strong></div>
                    </div>
                    <div className="border-t border-slate-200 dark:border-slate-800 pt-2 mt-2">
                      <span className="text-slate-400 font-medium">Next step:</span> <strong className="text-indigo-600 dark:text-indigo-400 font-sans">Upload GPS file(s)</strong>
                    </div>
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
                    <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                      Upload GPS file(s)
                    </p>
                    <p className="text-2xs text-slate-500 mt-0.5">
                      One file or multiple vehicle files accepted
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
                {!selectedTransaction ? (
                  <div className="py-20 text-center text-slate-400 space-y-2">
                    <Satellite className="w-10 h-10 mx-auto text-slate-350 animate-bounce" />
                    <p className="text-xs font-semibold">Select a transaction on the left</p>
                    <p className="text-[10px] text-slate-500">We will extract the corresponding timeline logs, odometer records, and fuel tank levels.</p>
                  </div>
                ) : loadingEvidence ? (
                  <div className="py-20 text-center text-slate-400 space-y-2">
                    <Loader2 className="w-8 h-8 mx-auto text-indigo-500 animate-spin" />
                    <p className="text-xs font-semibold">Extracting telemetry logs...</p>
                  </div>
                ) : (
                  <div className="space-y-4 flex-1 flex flex-col justify-between">
                    <div className="space-y-4">
                      {/* Tab Navigation */}
                      <div className="flex border-b border-slate-100 dark:border-slate-800 text-xs font-semibold select-none mb-3">
                        <button
                          onClick={() => setRightPanelTab('comparison')}
                          className={`flex-1 pb-2 text-center border-b-2 transition ${
                            rightPanelTab === 'comparison'
                              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-extrabold'
                              : 'border-transparent text-slate-400 hover:text-slate-600'
                          }`}
                        >
                          Comparison
                        </button>
                        <button
                          onClick={() => setRightPanelTab('manual_review')}
                          className={`flex-1 pb-2 text-center border-b-2 transition ${
                            rightPanelTab === 'manual_review'
                              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-extrabold'
                              : 'border-transparent text-slate-400 hover:text-slate-600'
                          }`}
                        >
                          Manual GPS Review
                        </button>
                        <button
                          onClick={() => setRightPanelTab('gps_upload')}
                          className={`flex-1 pb-2 text-center border-b-2 transition ${
                            rightPanelTab === 'gps_upload'
                              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-extrabold'
                              : 'border-transparent text-slate-400 hover:text-slate-600'
                          }`}
                        >
                          Ingest GPS
                        </button>
                      </div>

                      {/* Tab 1: comparison */}
                      {rightPanelTab === 'comparison' && (
                        <div className="space-y-4 animate-fade-in text-xs">
                          {/* Card 1 — Invoice says */}
                          <div className="bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-2">
                            <h3 className="font-extrabold text-[11px] uppercase tracking-wider text-slate-450">Invoice says</h3>
                            <div className="grid grid-cols-2 gap-y-1.5 text-2xs">
                              <div><span className="text-slate-400">Vehicle:</span> <strong className="font-mono text-slate-800 dark:text-slate-200">{selectedTransaction.registration || selectedTransaction.vehicleRegistration || '—'}</strong></div>
                              <div><span className="text-slate-400">Time:</span> <strong className="font-mono text-slate-800 dark:text-slate-200">{selectedTransaction.transactionTimestamp ? new Date(selectedTransaction.transactionTimestamp).toISOString().replace('T', ' ').slice(0, 16) : selectedTransaction.transactionDateTime || '—'}</strong></div>
                              <div><span className="text-slate-400">Product:</span> <strong className="text-slate-805 dark:text-slate-250">{selectedTransaction.productName || selectedTransaction.productType || '—'}</strong></div>
                              <div><span className="text-slate-400">Volume:</span> <strong className="font-mono text-slate-805 dark:text-slate-250">{parseFloat(selectedTransaction.quantity || selectedTransaction.volume || '0').toFixed(2)} L</strong></div>
                              <div><span className="text-slate-400">Net:</span> <strong className="font-mono text-slate-805 dark:text-slate-250">€{parseFloat(selectedTransaction.paymentAmountExVat || selectedTransaction.baseValueNet || selectedTransaction.valueOfPurchaseNet || '0').toFixed(2)}</strong></div>
                              <div><span className="text-slate-400">Discount:</span> <strong className="font-mono text-emerald-650 dark:text-emerald-400">€{parseFloat(selectedTransaction.discountNet || selectedTransaction.rebate || '0').toFixed(2)}</strong></div>
                              <div className="col-span-2"><span className="text-slate-400">Location:</span> <strong className="text-slate-805 dark:text-slate-250">{selectedTransaction.stationCity || selectedTransaction.stationName || '—'}</strong></div>
                            </div>

                            {selectedTransaction.sourceEvidence && (
                              <div className="border-t border-slate-200 dark:border-slate-800 pt-2 mt-2">
                                {selectedTransaction.sourceEvidence.sourceType?.includes('PDF') ? (
                                  <div className="w-full bg-white dark:bg-slate-900 rounded border border-slate-150 dark:border-slate-800 overflow-hidden flex justify-center py-2">
                                    <PDFPageRenderer
                                      fileId={selectedTransaction.sourceEvidence.sourceFileId}
                                      pageNumber={selectedTransaction.sourceEvidence.pageNumber}
                                      boundingBox={selectedTransaction.sourceEvidence.boundingBox}
                                      crop={true}
                                      scale={1.1}
                                    />
                                  </div>
                                ) : (
                                  <div className="p-2 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded font-mono text-[9px] truncate max-w-full">
                                    {selectedTransaction.sourceEvidence.rawText || 'No source details.'}
                                  </div>
                                )}
                                <div className="text-right mt-1.5">
                                  <button
                                    onClick={() => setSelectedTxForSource(selectedTransaction)}
                                    className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-250 rounded text-3xs font-bold text-indigo-600 dark:text-indigo-400 dark:bg-slate-850 dark:hover:bg-slate-800 transition"
                                  >
                                    Open source
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Card 2 — GPS says */}
                          <div className="bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-2">
                            <h3 className="font-extrabold text-[11px] uppercase tracking-wider text-slate-450">GPS says</h3>
                            
                            <p className="text-2xs font-bold text-slate-805 dark:text-slate-200 leading-normal bg-white dark:bg-slate-900 p-2 border border-slate-150 dark:border-slate-800 rounded-lg">
                              {getGpsSaysText()}
                            </p>

                            {geocodedCoords && geocodedCoords.lat && geocodedCoords.lon ? (
                              <div className="space-y-1 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-xl p-1.5 shadow-sm">
                                <div className="flex justify-between items-center text-[9px] text-slate-400 px-0.5 pb-0.5">
                                  <span className="font-semibold uppercase tracking-wider flex items-center gap-1">
                                    <MapPin className="w-3 h-3 text-indigo-500" />
                                    {geocodedCoords.type === 'exact' ? 'Exact location from GPS coordinates' : 'Approximate location from GPS text'}
                                  </span>
                                </div>
                                <iframe
                                  width="100%"
                                  height="120"
                                  frameBorder="0"
                                  scrolling="no"
                                  marginHeight={0}
                                  marginWidth={0}
                                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${geocodedCoords.lon - 0.01}%2C${geocodedCoords.lat - 0.005}%2C${geocodedCoords.lon + 0.01}%2C${geocodedCoords.lat + 0.005}&layer=mapnik&marker=${geocodedCoords.lat}%2C${geocodedCoords.lon}`}
                                  className="rounded border border-slate-150"
                                ></iframe>
                                {geocodedCoords.type === 'approximate' && (
                                  <p className="text-[9px] text-amber-600 dark:text-amber-400 font-medium leading-normal px-0.5">
                                    ⚠️ This is approximate. The GPS file did not provide exact coordinates.
                                  </p>
                                )}
                              </div>
                            ) : (
                              <div className="p-3 bg-white dark:bg-slate-900 border rounded-xl text-center text-3xs text-slate-400 font-sans space-y-1">
                                <MapPin className="w-6 h-6 text-slate-350 mx-auto" />
                                <strong className="text-slate-605 block">
                                  {geocodedCoords?.type === 'text_only' ? 'Location text only — map marker unavailable' : 'Map unavailable'}
                                </strong>
                                {geocodedCoords?.combinedText && (
                                  <p className="text-slate-500 font-semibold">{geocodedCoords.combinedText}</p>
                                )}
                              </div>
                            )}

                            <div className="flex gap-2 justify-end mt-1.5">
                              <button
                                onClick={() => setRightPanelTab('manual_review')}
                                className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-250 rounded text-3xs font-bold text-indigo-650 transition"
                              >
                                Search GPS history
                              </button>
                              <button
                                title="Compare vs GPS"
                                onClick={() => setSelectedTxForMatch(selectedTransaction)}
                                className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-250 rounded text-3xs font-bold text-indigo-650 transition"
                              >
                                Full comparison
                              </button>
                            </div>
                          </div>

                          {/* Card 3 — Decision */}
                          <div className="bg-slate-50 dark:bg-slate-850 border border-slate-205 dark:border-slate-800 rounded-xl p-3.5 space-y-2">
                            <h3 className="font-extrabold text-[11px] uppercase tracking-wider text-slate-455">Decision</h3>
                            
                            <div className="flex items-center justify-between">
                              <span className="text-2xs font-semibold text-slate-655">Current status:</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                selectedTransaction.telematicsOverrideStatus ? 'bg-indigo-50 text-indigo-705 border border-indigo-200 dark:bg-indigo-950/20' :
                                selectedTransaction.telematicsAssessment?.classification === 'VERIFIED' ? 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-955/10' :
                                selectedTransaction.telematicsAssessment?.classification === 'LIKELY' ? 'bg-green-50 text-green-705 border border-green-200 dark:bg-green-955/10' :
                                'bg-amber-50 text-amber-705 border border-amber-200 dark:bg-amber-955/10'
                              }`}>
                                {selectedTransaction.telematicsOverrideStatus ? selectedTransaction.telematicsOverrideStatus :
                                 selectedTransaction.telematicsAssessment?.classification === 'VERIFIED' ? 'Supported' :
                                 selectedTransaction.telematicsAssessment?.classification === 'LIKELY' ? 'Likely supported' : 'Needs review'}
                              </span>
                            </div>

                            <div className="text-2xs text-slate-550 leading-normal">
                              <strong>Reason:</strong> {
                                selectedTransaction.telematicsOverrideStatus ? `Auditor override: ${selectedTransaction.reviewerNote || 'None'}` :
                                selectedTransaction.telematicsAssessment?.classification === 'VERIFIED' ? 'GPS confirmation matching transaction time and location.' :
                                selectedTransaction.telematicsAssessment?.classification === 'LIKELY' ? 'Close match found within the window.' :
                                'GPS does not confirm this transaction yet.'
                              }
                            </div>

                            <div className="space-y-1 pt-1.5 border-t border-slate-200 dark:border-slate-800">
                              <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">Auditor notes (Required for override)</label>
                              <textarea
                                value={manualReviewNote}
                                placeholder="Type auditor notes / reason for override here..."
                                onChange={(e) => {
                                  setManualReviewNote(e.target.value);
                                  setSelectedTransaction({ ...selectedTransaction, reviewerNote: e.target.value });
                                }}
                                className="w-full text-2xs p-2 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                rows={2}
                              />
                            </div>

                            <div className="flex gap-2 pt-1">
                              <button
                                onClick={() => handleRowOverride(selectedTransaction.id, 'Marked Supported', manualReviewNote)}
                                disabled={!manualReviewNote.trim()}
                                className="flex-1 py-1.5 bg-green-600 hover:bg-green-505 disabled:opacity-45 disabled:cursor-not-allowed text-white rounded-xl text-3xs font-extrabold transition shadow-sm"
                              >
                                Mark supported
                              </button>
                              <button
                                onClick={() => handleRowOverride(selectedTransaction.id, 'Flagged Mismatch', manualReviewNote)}
                                disabled={!manualReviewNote.trim()}
                                className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-505 disabled:opacity-45 disabled:cursor-not-allowed text-white rounded-xl text-3xs font-extrabold transition shadow-sm"
                              >
                                Flag issue
                              </button>
                              <button
                                onClick={() => handleRowOverride(selectedTransaction.id, 'Needs Follow Up', manualReviewNote)}
                                disabled={!manualReviewNote.trim()}
                                className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-45 disabled:cursor-not-allowed text-white rounded-xl text-3xs font-extrabold transition"
                              >
                                Follow up
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Tab 2: manual_review */}
                      {rightPanelTab === 'manual_review' && (
                        <div className="space-y-4 text-xs animate-fade-in">
                          <div className="bg-slate-50 dark:bg-slate-855 border border-slate-205 dark:border-slate-800 rounded-2xl p-3.5 space-y-3 shadow-sm">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                              <div>
                                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Vehicle</label>
                                <select
                                  value={manualVehicle}
                                  onChange={(e) => setManualVehicle(e.target.value)}
                                  className="w-full text-xs p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none"
                                >
                                  <option value="">Select Vehicle</option>
                                  {activeBatch.vehicles.map(v => (
                                    <option key={v} value={v}>{v}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Date</label>
                                <input
                                  type="date"
                                  value={manualDate}
                                  onChange={(e) => setManualDate(e.target.value)}
                                  className="w-full text-xs p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Time</label>
                                <input
                                  type="time"
                                  value={manualTime}
                                  onChange={(e) => setManualTime(e.target.value)}
                                  className="w-full text-xs p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Window</label>
                                <select
                                  value={manualWindow}
                                  onChange={(e) => setManualWindow(e.target.value)}
                                  className="w-full text-xs p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none"
                                >
                                  <option value="15">±15 minutes</option>
                                  <option value="30">±30 minutes</option>
                                  <option value="60">±60 minutes</option>
                                  <option value="120">±2 hours</option>
                                  <option value="day">Full day</option>
                                </select>
                              </div>
                              <div className="col-span-2">
                                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Location contains</label>
                                <input
                                  type="text"
                                  placeholder="City, street, or country..."
                                  value={manualLocationSearch}
                                  onChange={(e) => setManualLocationSearch(e.target.value)}
                                  className="w-full text-xs p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none"
                                />
                              </div>
                            </div>

                            <button
                              onClick={handleManualSearch}
                              className="w-full py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-sm transition"
                            >
                              <Search className="w-4 h-4" /> Search GPS History
                            </button>
                          </div>

                          {manualResults.length > 0 && (
                            <div className="space-y-1.5">
                              <span className="font-bold text-[10px] text-slate-450 uppercase tracking-wider block">GPS History Search Results ({manualResults.length})</span>
                              <div className="border border-slate-150 dark:border-slate-800 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                                <table className="w-full text-left border-collapse text-3xs">
                                  <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-850 text-slate-505 font-semibold border-b border-slate-150">
                                      <th className="p-1.5">Time</th>
                                      <th className="p-1.5">Difference</th>
                                      <th className="p-1.5">Location</th>
                                      <th className="p-1.5 text-right">Fuel</th>
                                      <th className="p-1.5 text-right">KM</th>
                                      <th className="p-1.5">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-850 font-mono">
                                    {manualResults.map((pt: any) => {
                                      const ptTime = new Date(pt.timestamp).getTime();
                                      const txTime = new Date(selectedTransaction.transactionTimestamp || selectedTransaction.transactionDateTime).getTime();
                                      const diffMins = Math.round((ptTime - txTime) / 60000);
                                      const diffText = diffMins === 0 ? 'exact match' : diffMins < 0 ? `${Math.abs(diffMins)}m before` : `${diffMins}m after`;
                                      const isSelected = selectedGpsRow?.id === pt.id;
                                      
                                      return (
                                        <tr
                                          key={pt.id}
                                          onClick={() => setSelectedGpsRow(pt)}
                                          className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/30 cursor-pointer ${
                                            isSelected ? 'bg-purple-50/30 dark:bg-purple-950/20 font-bold border-l-2 border-l-purple-500' : ''
                                          }`}
                                        >
                                          <td className="p-1.5 whitespace-nowrap">{new Date(pt.timestamp).toLocaleTimeString()}</td>
                                          <td className="p-1.5 whitespace-nowrap font-sans">{diffText}</td>
                                          <td className="p-1.5 truncate max-w-[140px]" title={buildCombinedLocationText(pt)}>{buildCombinedLocationText(pt)}</td>
                                          <td className="p-1.5 text-right">{pt.fuelLevelPercent !== null ? `${Math.round(pt.fuelLevelPercent)}%` : '—'}</td>
                                          <td className="p-1.5 text-right">{pt.odometerKm ?? '—'}</td>
                                          <td className="p-1.5 whitespace-nowrap font-sans">{pt.activity || (pt.speedKmh > 0 ? 'driving' : 'stopped')}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {selectedGpsRow && manualGeocodedCoords && (
                            <div className="bg-slate-50 dark:bg-slate-855 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 space-y-2.5 shadow-sm animate-fade-in">
                              <div className="flex justify-between items-center">
                                <span className="text-[10px] uppercase font-bold text-slate-450">Selected Point Detail</span>
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                  manualGeocodedCoords.type === 'exact' ? 'bg-green-100 text-green-800 dark:bg-green-950/20' :
                                  manualGeocodedCoords.type === 'approximate' ? 'bg-amber-100 text-amber-800 dark:bg-amber-955/20' : 'bg-slate-100 text-slate-700 dark:text-slate-355'
                                }`}>
                                  {manualGeocodedCoords.type === 'exact' ? 'Exact Coordinate' :
                                   manualGeocodedCoords.type === 'approximate' ? 'Approximate GPS location from text' : 'Text location only'}
                                </span>
                              </div>

                              {manualGeocodedCoords.lat && manualGeocodedCoords.lon ? (
                                <div className="space-y-1">
                                  <iframe
                                    width="100%"
                                    height="150"
                                    frameBorder="0"
                                    scrolling="no"
                                    marginHeight={0}
                                    marginWidth={0}
                                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${manualGeocodedCoords.lon - 0.01}%2C${manualGeocodedCoords.lat - 0.005}%2C${manualGeocodedCoords.lon + 0.01}%2C${manualGeocodedCoords.lat + 0.005}&layer=mapnik&marker=${manualGeocodedCoords.lat}%2C${manualGeocodedCoords.lon}`}
                                    className="rounded-xl border border-slate-200 dark:border-slate-805"
                                  ></iframe>
                                  {manualGeocodedCoords.type === 'approximate' && (
                                    <p className="text-[9px] text-amber-600 dark:text-amber-400 font-sans leading-normal">
                                      ⚠️ This is approximate. The GPS file did not provide exact coordinates.
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <div className="p-3 bg-slate-100 dark:bg-slate-900 border rounded-xl text-center text-3xs text-slate-400 font-sans">
                                  {manualGeocodedCoords.type === 'text_only' ? 'Location text only — map marker unavailable' : 'Map unavailable'}
                                </div>
                              )}

                              <div className="text-3xs font-mono grid grid-cols-2 gap-1.5 bg-white dark:bg-slate-900 border rounded-xl p-2">
                                <div><span className="text-slate-400 font-sans">Time:</span> {new Date(selectedGpsRow.timestamp).toLocaleTimeString()}</div>
                                <div><span className="text-slate-400 font-sans">Odometer:</span> {selectedGpsRow.odometerKm ?? '—'} km</div>
                                <div><span className="text-slate-400 font-sans">Fuel:</span> {selectedGpsRow.fuelLevelPercent !== null ? `${Math.round(selectedGpsRow.fuelLevelPercent)}%` : '—'}</div>
                                <div><span className="text-slate-400 font-sans">Status:</span> {selectedGpsRow.activity || 'Standstill'}</div>
                                <div className="col-span-2 truncate"><span className="text-slate-400 font-sans">Text:</span> {manualGeocodedCoords.combinedText || '—'}</div>
                              </div>
                            </div>
                          )}

                          <div className="space-y-2 border-t border-slate-150 dark:border-slate-800 pt-3 mt-1">
                            <label className="font-extrabold text-[10px] text-slate-500 uppercase tracking-wider block">
                              Manual Review Note (Required for Override)
                            </label>
                            {!manualReviewNote.trim() && (
                              <div className="text-[10px] text-rose-500 font-semibold mb-1">
                                ⚠️ Reviewer note is required before manually supporting or overriding.
                              </div>
                            )}
                            <textarea
                              value={manualReviewNote}
                              placeholder="Provide manual review explanation, reason for override, or verification notes..."
                              onChange={(e) => {
                                setManualReviewNote(e.target.value);
                                setSelectedTransaction({ ...selectedTransaction, reviewerNote: e.target.value });
                              }}
                              className="w-full text-2xs p-2 bg-slate-50 dark:bg-slate-855 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-purple-500 font-sans"
                              rows={2}
                            />

                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSaveManualReview('supports', false)}
                                disabled={!manualReviewNote.trim()}
                                className="flex-grow py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-2xs font-bold transition shadow-sm"
                              >
                                Use as supporting evidence
                              </button>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSaveManualReview('does_not_support', false)}
                                disabled={!manualReviewNote.trim()}
                                className="flex-1 py-1 bg-rose-600 hover:bg-rose-505 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-3xs font-bold transition"
                              >
                                Flag as mismatch
                              </button>
                              <button
                                onClick={() => handleSaveManualReview('needs_follow_up', false)}
                                disabled={!manualReviewNote.trim()}
                                className="flex-1 py-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-3xs font-bold transition"
                              >
                                Needs follow-up
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Tab 3: gps_upload */}
                      {rightPanelTab === 'gps_upload' && (
                        <div className="space-y-4 animate-fade-in text-xs">
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
                            <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                              Upload GPS file(s)
                            </p>
                            <p className="text-2xs text-slate-500 mt-0.5">
                              One file or multiple vehicle files accepted
                            </p>
                          </div>

                          {activeBatch.attachedGpsFiles && activeBatch.attachedGpsFiles.length > 0 && (
                            <div className="space-y-2">
                              <span className="text-xs font-bold text-slate-705 dark:text-slate-350">
                                Linked GPS Telemetry logs
                              </span>
                              <div className="space-y-2 max-h-56 overflow-y-auto">
                                {activeBatch.attachedGpsFiles.map((file, i) => (
                                  <div key={i} className="p-3 bg-slate-50/50 border border-slate-150 dark:border-slate-800 rounded-xl text-2xs space-y-1 relative">
                                    <div className="flex justify-between font-bold text-slate-900 dark:text-white">
                                      <span className="truncate max-w-[200px]" title={file.fileName}>{file.fileName}</span>
                                      <span className="font-mono text-indigo-650 dark:text-indigo-400">{file.vehicleRegistration}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-450 font-mono space-y-0.5">
                                      <div>Coverage: {file.coverageStart ? new Date(file.coverageStart).toLocaleDateString() : '—'} to {file.coverageEnd ? new Date(file.coverageEnd).toLocaleDateString() : '—'}</div>
                                      {file.gpsRecordCount && <div>Records: {file.gpsRecordCount} points</div>}
                                    </div>
                                    <button
                                      onClick={async () => {
                                        if (!confirm('Detach this GPS file?')) return;
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
                      )}
                    </div>
                  </div>
                )}
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
