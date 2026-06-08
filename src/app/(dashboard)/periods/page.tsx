'use client';

import React, { useState, useEffect } from 'react';
import { Calendar, AlertTriangle, CheckCircle2, Lock, ShieldAlert, FileSignature } from 'lucide-react';

export default function PeriodsPage() {
  const [periods, setPeriods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [signOffNotes, setSignOffNotes] = useState('');
  const [activePeriod, setActivePeriod] = useState<any | null>(null);

  const fetchPeriods = () => {
    fetch('/api/periods')
      .then((res) => res.json())
      .then((data) => {
        setPeriods(data);
        if (data.length > 0) setActivePeriod(data[0]);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchPeriods();
  }, []);

  const handleSignOff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePeriod) return;

    try {
      const res = await fetch('/api/periods/sign-off', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodId: activePeriod.id,
          notes: signOffNotes,
        }),
      });

      if (!res.ok) throw new Error('Sign-off override failed');
      
      setSignOffNotes('');
      fetchPeriods();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-brand-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Invoice Periods</h1>
        <p className="text-sm text-surface-500 mt-1">Manage invoice cycles, verify period alignment, and execute formal sign-offs</p>
      </div>

      {periods.length === 0 ? (
        <div className="card p-8 text-center text-surface-400">
          No periods detected. Please upload transaction and invoice files to generate billing periods.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left panel: list of periods */}
          <div className="lg:col-span-1 space-y-4">
            <h3 className="text-sm font-semibold text-surface-800">Available Periods</h3>
            {periods.map((p) => (
              <div
                key={p.id}
                onClick={() => setActivePeriod(p)}
                className={`card p-4 cursor-pointer transition border-2 ${
                  activePeriod?.id === p.id ? 'border-brand-500 bg-brand-50/10' : 'border-surface-200 hover:border-surface-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-surface-400 font-mono">
                    {p.startDate} — {p.endDate}
                  </span>
                  <span
                    className={`badge text-3xs ${
                      p.status === 'signed_off'
                        ? 'badge-success'
                        : p.status === 'blocked'
                          ? 'badge-error'
                          : 'badge-warning'
                    }`}
                  >
                    {p.status.toUpperCase()}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-surface-800 mt-2">{p.name}</h4>
                <p className="text-2xs text-surface-500 mt-1">
                  {p.transactionCount} transactions · {p.invoiceCount} invoices
                </p>
              </div>
            ))}
          </div>

          {/* Right panel: details and sign-off */}
          <div className="lg:col-span-2 space-y-6">
            {activePeriod && (
              <div className="card p-6 space-y-6">
                <div className="flex items-center justify-between border-b border-surface-150 pb-4">
                  <div>
                    <h2 className="text-lg font-bold text-surface-900">{activePeriod.name}</h2>
                    <p className="text-xs text-surface-500">Reconciliation & Assurance Status</p>
                  </div>
                  <Calendar className="h-5 w-5 text-surface-400" />
                </div>

                {/* Warning Card */}
                {activePeriod.mismatchWarning && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
                    <ShieldAlert className="h-6 w-6 text-red-600 shrink-0" />
                    <div>
                      <h4 className="text-sm font-bold text-red-900">Period Mismatch Warning Active</h4>
                      <p className="text-xs text-red-700 mt-1">
                        {activePeriod.warningText}
                      </p>
                      <p className="text-2xs text-red-600 font-medium mt-2">
                        CRITICAL: Complete &quot;All Clear&quot; reconciliation is blocked. Only partial analysis is permitted unless a formal authorized override adjustment is submitted below.
                      </p>
                    </div>
                  </div>
                )}

                {/* Sign-off Info */}
                {activePeriod.status === 'signed_off' ? (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex gap-3">
                    <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
                    <div>
                      <h4 className="text-sm font-bold text-green-900">Period Signed Off Successfully</h4>
                      <p className="text-xs text-green-700 mt-1">
                        Signed off by <strong>{activePeriod.signedOffBy}</strong> on {new Date(activePeriod.signedOffAt).toLocaleString()}
                      </p>
                      {activePeriod.notes && (
                        <div className="mt-2 text-2xs bg-white/60 p-2 rounded border border-green-150 text-surface-700">
                          <strong>Override adjustment notes:</strong> {activePeriod.notes}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-surface-800 flex items-center gap-1.5">
                      <FileSignature className="h-4 w-4 text-brand-600" />
                      Invoice Period Sign-Off Approval
                    </h3>
                    <p className="text-xs text-surface-500">
                      Signing off will freeze reconciliation matches, record an audit entry, and release summary reports for accounting.
                    </p>

                    <form onSubmit={handleSignOff} className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-surface-700 mb-1.5">
                          Adjustment / Sign-off Comments (Required for mismatch override)
                        </label>
                        <textarea
                          rows={3}
                          value={signOffNotes}
                          onChange={(e) => setSignOffNotes(e.target.value)}
                          placeholder="Provide audit justification or details of any adjustment workflow..."
                          className="w-full rounded-xl border border-surface-300 p-3 text-sm focus:border-brand-500 focus:ring-brand-500"
                          required={activePeriod.status === 'blocked'}
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          className={`btn flex items-center gap-1.5 text-xs px-4 py-2 ${
                            activePeriod.status === 'blocked' ? 'btn-danger' : 'btn-primary'
                          }`}
                        >
                          <Lock className="h-4 w-4" />
                          {activePeriod.status === 'blocked' ? 'Override & Sign Off Period' : 'Approve & Sign Off Period'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
