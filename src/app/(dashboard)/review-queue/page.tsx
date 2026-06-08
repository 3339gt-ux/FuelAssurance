'use client';

import React, { useState, useEffect } from 'react';
import { ClipboardCheck, CheckCircle2, AlertTriangle, X, Search, ShieldCheck } from 'lucide-react';

export default function ReviewQueuePage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [overrideNotes, setOverrideNotes] = useState('');

  const fetchReview = () => {
    fetch('/api/review-queue')
      .then((res) => res.json())
      .then((data) => {
        setItems(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchReview();
  }, []);

  const handleOverride = async (status: 'approved' | 'escalated') => {
    if (!selectedItem) return;
    try {
      const res = await fetch('/api/review-queue/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: selectedItem.id,
          status,
          reason: 'Manual Auditor Override',
          notes: overrideNotes,
        }),
      });

      if (!res.ok) throw new Error('Override failed');

      setOverrideNotes('');
      setSelectedItem(null);
      fetchReview();
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
        <h1 className="text-2xl font-bold text-surface-900">Review Queue</h1>
        <p className="text-sm text-surface-500 mt-1">Review flagged matches, price variances, and telematics scoring discrepancies</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-sm font-semibold text-surface-800">Pending Reviews ({items.length})</h3>

          {items.length === 0 ? (
            <div className="card p-8 text-center text-surface-400">
              ✓ All clear! There are no pending reviews in the queue.
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`card p-4 cursor-pointer transition flex items-center justify-between border-2 ${
                    selectedItem?.id === item.id ? 'border-brand-500 bg-brand-50/10' : 'border-surface-200 hover:border-surface-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-amber-50 text-amber-600 mt-0.5">
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-surface-850">
                          {item.transaction?.registration || item.invoiceRow?.registration || 'Unknown Vehicle'}
                        </span>
                        <span className="badge badge-warning text-3xs font-bold uppercase">{item.status}</span>
                      </div>
                      <p className="text-xs text-surface-600 mt-1 font-mono">
                        TX Qty: {item.transaction?.quantity || '0'}L vs INV Qty: {item.invoiceRow?.quantity || '0'}L
                      </p>
                      <p className="text-2xs text-surface-400 mt-0.5">
                        Station: {item.transaction?.stationName || item.invoiceRow?.stationName || 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column: resolution details */}
        <div className="lg:col-span-1 space-y-4">
          <h3 className="text-sm font-semibold text-surface-800">Auditor Action Console</h3>

          {selectedItem ? (
            <div className="card p-5 space-y-5 animate-fade-in">
              <div>
                <span className="text-3xs uppercase tracking-wider text-surface-450 font-bold">Selected Match</span>
                <h4 className="text-sm font-bold text-surface-800 mt-0.5">
                  {selectedItem.transaction?.registration || selectedItem.invoiceRow?.registration}
                </h4>
                <p className="text-xs text-surface-500 mt-1 font-mono">
                  Card: {selectedMatchLabel(selectedItem)}
                </p>
              </div>

              <div className="border-t border-surface-150 pt-3 space-y-2">
                <span className="text-xs font-semibold text-surface-700 block">Variance Breakdown</span>
                <div className="bg-surface-50 p-3 rounded-xl border border-surface-200 text-xs space-y-1 font-mono">
                  <p className="flex justify-between">
                    <span className="text-surface-500">TX Gross:</span>
                    <span>€{parseFloat(selectedItem.transaction?.amountGross || '0').toFixed(2)}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="text-surface-500">INV Gross:</span>
                    <span>€{parseFloat(selectedItem.invoiceRow?.baseValueGross || '0').toFixed(2)}</span>
                  </p>
                  <p className="flex justify-between font-bold border-t border-surface-200 pt-1 text-red-600">
                    <span>Difference:</span>
                    <span>
                      €{(
                        parseFloat(selectedItem.transaction?.amountGross || '0') -
                        parseFloat(selectedItem.invoiceRow?.baseValueGross || '0')
                      ).toFixed(2)}
                    </span>
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-surface-700 mb-1">Decision Justification / Notes</label>
                  <textarea
                    rows={3}
                    value={overrideNotes}
                    onChange={(e) => setOverrideNotes(e.target.value)}
                    placeholder="Enter manual auditor comments justifying approval or escalation..."
                    className="w-full rounded-lg border border-surface-300 p-2.5 text-xs focus:border-brand-500 focus:ring-brand-500"
                    required
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleOverride('escalated')}
                    className="flex-1 btn btn-secondary text-xs py-2 flex items-center justify-center gap-1.5"
                  >
                    <AlertTriangle className="h-4 w-4" />
                    Escalate
                  </button>
                  <button
                    onClick={() => handleOverride('approved')}
                    className="flex-1 btn btn-primary text-xs py-2 flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Approve Override
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="card p-5 text-center text-surface-400 text-xs">
              Select a pending review from the list to approve or escalate.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function selectedMatchLabel(item: any) {
  return item.transaction?.cardNumber || item.invoiceRow?.cardNumberNormalised || 'N/A';
}
