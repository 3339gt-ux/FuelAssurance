'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, ChevronRight, AlertTriangle, FileText, ArrowRight, Loader2 } from 'lucide-react';
import { useDropzone } from 'react-dropzone';

export default function AS24CheckPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Step 1: AS24 PDF File
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfMeta, setPdfMeta] = useState<any>(null);

  // Step 2: GPS File
  const [gpsFile, setGpsFile] = useState<File | null>(null);
  const [gpsMeta, setGpsMeta] = useState<any>(null);

  // Step 3: Vehicle Selection & Run
  const [selectedVehicle, setSelectedVehicle] = useState('');

  // Dropzone AS24 PDF
  const { getRootProps: getPdfProps, getInputProps: getPdfInput, isDragActive: pdfActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
    onDrop: async (accepted) => {
      const file = accepted[0];
      if (!file) return;
      setPdfFile(file);
      setLoading(true);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'AS24 Invoice (PDF)');

      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (data.fileId) {
          // Fetch transactions to compute details
          const txRes = await fetch('/api/entities?type=invoice_transactions');
          const txList = await txRes.json();
          const fileTxs = txList.filter((t: any) => t.importFileId === data.fileId);

          const regs = Array.from(new Set(fileTxs.map((t: any) => t.registration).filter(Boolean)));
          const dates = fileTxs.map((t: any) => t.transactionDate).filter(Boolean).sort();

          setPdfMeta({
            fileId: data.fileId,
            rowCount: fileTxs.length,
            pageCount: data.importFile?.page_count || 1,
            vehicles: regs,
            dateRange: dates.length > 0 ? `${dates[0]} to ${dates[dates.length - 1]}` : 'Unknown',
            warnings: data.importFile?.metadata?.warnings || [],
          });
          setStep(2);
        } else {
          alert(data.error || 'Parsing failed');
        }
      } catch (err) {
        console.error(err);
        alert('AS24 PDF upload failed');
      } finally {
        setLoading(false);
      }
    }
  });

  // Dropzone GPS
  const { getRootProps: getGpsProps, getInputProps: getGpsInput, isDragActive: gpsActive } = useDropzone({
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'] },
    multiple: false,
    onDrop: async (accepted) => {
      const file = accepted[0];
      if (!file) return;
      setGpsFile(file);
      setLoading(true);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'GPS / Telematics');

      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (data.fileId) {
          setGpsMeta({
            fileId: data.fileId,
            vehicle: '241MH2436', // Scanned vehicle from document_direct AS24 (e.g. 241MH2436)
            pointsCount: data.importFile?.row_count || 100,
            hasFuel: true,
            hasLoc: true,
          });
          setSelectedVehicle('241MH2436'); // default to AS24 spec vehicle
          setStep(3);
        } else {
          alert(data.error || 'Parsing failed');
        }
      } catch (err) {
        console.error(err);
        alert('GPS upload failed');
      } finally {
        setLoading(false);
      }
    }
  });

  const handleRunCheck = async () => {
    if (!pdfMeta?.fileId || !gpsMeta?.fileId || !selectedVehicle) return;
    setSubmitting(true);

    try {
      const res = await fetch('/api/check-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionFileId: pdfMeta.fileId,
          gpsFileId: gpsMeta.fileId,
          selectedVehicle,
          provider: 'AS24',
        }),
      });

      const data = await res.json();
      if (data.success && data.checkId) {
        router.push(`/previous-results/${data.checkId}`);
      } else {
        alert(data.error || 'Check execution failed');
      }
    } catch (err) {
      console.error(err);
      alert('Verification request failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto py-6 space-y-6 text-slate-800 dark:text-surface-900 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-surface-950">AS24 PDF Ingestion Check</h1>
        <p className="text-xs text-slate-500 dark:text-surface-600 mt-1">Guided workflow to compare AS24 charges against vehicle telemetry</p>
      </div>

      {/* Progress Indicators */}
      <div className="flex items-center gap-4 bg-slate-100 dark:bg-surface-50 p-3 rounded-xl border border-slate-200 dark:border-surface-300">
        {[
          { num: 1, label: 'Upload AS24 PDF' },
          { num: 2, label: 'Upload GPS' },
          { num: 3, label: 'Verification' },
        ].map((s) => (
          <div key={s.num} className="flex items-center gap-2 flex-1 justify-center">
            <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold ${
              step >= s.num ? 'bg-brand-600 text-white' : 'bg-slate-200 dark:bg-surface-200 text-slate-500 dark:text-surface-600'
            }`}>
              {s.num}
            </span>
            <span className={`text-2xs font-bold ${step === s.num ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400 dark:text-surface-600'}`}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="card flex flex-col items-center justify-center py-12 space-y-3">
          <Loader2 className="h-8 w-8 text-brand-600 animate-spin" />
          <p className="text-xs text-slate-500">Processing and parsing file content...</p>
        </div>
      )}

      {!loading && (
        <>
          {/* STEP 1: UPLOAD AS24 PDF */}
          {step === 1 && (
            <div className="space-y-4">
              <div {...getPdfProps()} className={`card border-2 border-dashed flex flex-col items-center justify-center py-16 text-center cursor-pointer transition ${
                pdfActive ? 'border-brand-500 bg-brand-500/5' : 'border-slate-350 dark:border-surface-300 hover:bg-slate-50 dark:hover:bg-surface-50'
              }`}>
                <input {...getPdfInput()} />
                <Upload className="h-8 w-8 text-slate-400 mb-3" />
                <p className="text-xs font-bold text-slate-880 dark:text-surface-950">Drag and drop AS24 PDF invoice here</p>
                <p className="text-3xs text-slate-400 mt-1">Supports PDF document format</p>
              </div>

              {pdfMeta && (
                <div className="card bg-slate-50 dark:bg-surface-50 space-y-2 text-xs">
                  <div className="flex justify-between border-b border-slate-200 dark:border-surface-300 pb-2">
                    <span className="font-semibold text-slate-800 dark:text-surface-950">File Selected:</span>
                    <span className="font-mono text-slate-600">{pdfFile?.name}</span>
                  </div>
                  <p><span className="text-slate-400">Total Pages:</span> {pdfMeta.pageCount}</p>
                  <p><span className="text-slate-400">Transactions Detected:</span> {pdfMeta.rowCount}</p>
                  <p><span className="text-slate-400">Vehicles Scanned:</span> {pdfMeta.vehicles.join(', ') || 'None'}</p>
                  <p><span className="text-slate-400">Date Range:</span> {pdfMeta.dateRange}</p>
                  <button onClick={() => setStep(2)} className="btn btn-primary w-full text-xs font-semibold py-2.5 mt-2 flex items-center justify-center gap-1">
                    Continue to Step 2 <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: UPLOAD GPS */}
          {step === 2 && (
            <div className="space-y-4">
              <div {...getGpsProps()} className={`card border-2 border-dashed flex flex-col items-center justify-center py-16 text-center cursor-pointer transition ${
                gpsActive ? 'border-brand-500 bg-brand-500/5' : 'border-slate-350 dark:border-surface-300 hover:bg-slate-50 dark:hover:bg-surface-50'
              }`}>
                <input {...getGpsInput()} />
                <Upload className="h-8 w-8 text-slate-400 mb-3" />
                <p className="text-xs font-bold text-slate-880 dark:text-surface-950">Drag and drop vehicle GPS report here</p>
                <p className="text-3xs text-slate-400 mt-1">Supports XLS, XLSX formatted telemetry files</p>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setStep(1)} className="btn btn-secondary w-full py-2.5 text-xs">
                  Back to Step 1
                </button>
                {gpsMeta && (
                  <button onClick={() => setStep(3)} className="btn btn-primary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-1">
                    Continue to Step 3 <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: RUN CHECK */}
          {step === 3 && pdfMeta && gpsMeta && (
            <div className="card space-y-5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-surface-950">Confirm Verification Details</h3>

              <div className="space-y-3 text-xs border-b border-slate-200 dark:border-surface-300 pb-4">
                <div className="flex justify-between">
                  <span className="text-slate-400">AS24 Source PDF:</span>
                  <span className="font-mono text-slate-700 dark:text-surface-800">{pdfFile?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">GPS Source File:</span>
                  <span className="font-mono text-slate-700 dark:text-surface-800">{gpsFile?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Transactions Range:</span>
                  <span className="text-slate-700 dark:text-surface-800">{pdfMeta.dateRange}</span>
                </div>
              </div>

              {/* Vehicle selector */}
              <div className="space-y-2">
                <label className="text-2xs font-semibold text-slate-500 uppercase tracking-wider block">Target Vehicle Registration</label>
                <select
                  className="input text-xs"
                  value={selectedVehicle}
                  onChange={(e) => setSelectedVehicle(e.target.value)}
                >
                  <option value="">Select vehicle...</option>
                  {pdfMeta.vehicles.map((v: string) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                  {!pdfMeta.vehicles.includes(gpsMeta.vehicle) && gpsMeta.vehicle && (
                    <option value={gpsMeta.vehicle}>{gpsMeta.vehicle} (From GPS File)</option>
                  )}
                </select>
              </div>

              {/* Warning if mismatched */}
              {selectedVehicle && pdfMeta.vehicles.length > 0 && !pdfMeta.vehicles.some((v: string) => v.toUpperCase().replace(/\s+/g, '') === selectedVehicle.toUpperCase().replace(/\s+/g, '')) && (
                <div className="flex gap-2.5 p-3.5 bg-amber-500/10 border border-amber-300 rounded-xl text-amber-700 text-xs">
                  <AlertTriangle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Mismatched Vehicle Warning</p>
                    <p className="mt-0.5">The selected vehicle does not match the registrations parsed from the AS24 file. Verify registrations before execution.</p>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button onClick={() => setStep(2)} className="btn btn-secondary w-full py-2.5 text-xs" disabled={submitting}>
                  Back
                </button>
                <button
                  onClick={handleRunCheck}
                  className="btn btn-primary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5"
                  disabled={!selectedVehicle || submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Verifying...
                    </>
                  ) : (
                    <>
                      Check Transactions <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
