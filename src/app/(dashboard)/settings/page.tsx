'use client';

import React, { useState } from 'react';
import { Save, ShieldCheck, Scale, BadgePercent } from 'lucide-react';

export default function SettingsPage() {
  const [qtyTolerance, setQtyTolerance] = useState('0.02');
  const [dateTolerance, setDateTolerance] = useState('1');
  const [priceTolerance, setPriceTolerance] = useState('0.5');
  const [vatTolerance, setVatTolerance] = useState('0.1');

  const [weightTime, setWeightTime] = useState(25);
  const [weightLoc, setWeightLoc] = useState(25);
  const [weightFuel, setWeightFuel] = useState(25);
  const [weightStop, setWeightStop] = useState(10);
  const [weightVol, setWeightVol] = useState(10);
  const [weightOdo, setWeightOdo] = useState(5);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    alert('System settings updated and saved successfully.');
  };

  const totalWeight = weightTime + weightLoc + weightFuel + weightStop + weightVol + weightOdo;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-surface-950">System Settings</h1>
        <p className="text-sm text-surface-500 mt-1">Configure global matching tolerances, financial audits, and telematics verification weights</p>
      </div>

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tolerances */}
        <div className="lg:col-span-2 space-y-6">
          <div className="border border-surface-300 rounded-xl bg-surface-50 p-5 space-y-4 shadow-glow-sm">
            <h3 className="text-xs font-bold text-surface-950 uppercase tracking-wider flex items-center gap-1.5">
              <BadgePercent className="h-4 w-4 text-brand-500" /> Reconciliation Tolerances
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-2xs font-semibold text-surface-500 uppercase tracking-wider block mb-1">Fuel Quantity Tolerance (Litres)</label>
                <input
                  type="number"
                  step="0.001"
                  className="input text-xs"
                  value={qtyTolerance}
                  onChange={(e) => setQtyTolerance(e.target.value)}
                />
                <span className="text-3xs text-surface-500 mt-1 block">Default: 0.02 L. Max allowable mismatch on diesel quantity.</span>
              </div>

              <div>
                <label className="text-2xs font-semibold text-surface-500 uppercase tracking-wider block mb-1">Transaction Date Window (Days)</label>
                <input
                  type="number"
                  className="input text-xs"
                  value={dateTolerance}
                  onChange={(e) => setDateTolerance(e.target.value)}
                />
                <span className="text-3xs text-surface-500 mt-1 block">Allowable delay between DKV transaction and invoice row.</span>
              </div>

              <div>
                <label className="text-2xs font-semibold text-surface-500 uppercase tracking-wider block mb-1">Net Unit Price Variance Tolerance (%)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input text-xs"
                  value={priceTolerance}
                  onChange={(e) => setPriceTolerance(e.target.value)}
                />
                <span className="text-3xs text-surface-500 mt-1 block">Percentage limit for net cost unit variances.</span>
              </div>

              <div>
                <label className="text-2xs font-semibold text-surface-500 uppercase tracking-wider block mb-1">VAT Discrepancy Tolerance (%)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input text-xs"
                  value={vatTolerance}
                  onChange={(e) => setVatTolerance(e.target.value)}
                />
                <span className="text-3xs text-surface-500 mt-1 block">Allowed rounding variance on invoice VAT rows.</span>
              </div>
            </div>
          </div>

          {/* Telematics Weights */}
          <div className="border border-surface-300 rounded-xl bg-surface-50 p-5 space-y-4 shadow-glow-sm">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-surface-950 uppercase tracking-wider flex items-center gap-1.5">
                <Scale className="h-4 w-4 text-brand-500" /> Telematics Score Weights
              </h3>
              <span className={`text-2xs font-semibold uppercase ${totalWeight === 100 ? 'text-status-verified' : 'text-status-unlikely'}`}>
                Total Weight: {totalWeight}% {totalWeight !== 100 && '(Must equal 100%)'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-2xs font-semibold text-surface-500 uppercase tracking-wider block mb-1">Time Proximity (Max 25)</label>
                <input
                  type="number"
                  className="input text-xs"
                  value={weightTime}
                  onChange={(e) => setWeightTime(parseInt(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className="text-2xs font-semibold text-surface-500 uppercase tracking-wider block mb-1">Location Proximity (Max 25)</label>
                <input
                  type="number"
                  className="input text-xs"
                  value={weightLoc}
                  onChange={(e) => setWeightLoc(parseInt(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className="text-2xs font-semibold text-surface-500 uppercase tracking-wider block mb-1">Fuel Level Movement (Max 25)</label>
                <input
                  type="number"
                  className="input text-xs"
                  value={weightFuel}
                  onChange={(e) => setWeightFuel(parseInt(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className="text-2xs font-semibold text-surface-500 uppercase tracking-wider block mb-1">Stop / Engine Behaviour (Max 10)</label>
                <input
                  type="number"
                  className="input text-xs"
                  value={weightStop}
                  onChange={(e) => setWeightStop(parseInt(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className="text-2xs font-semibold text-surface-500 uppercase tracking-wider block mb-1">Volume Consistency (Max 10)</label>
                <input
                  type="number"
                  className="input text-xs"
                  value={weightVol}
                  onChange={(e) => setWeightVol(parseInt(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className="text-2xs font-semibold text-surface-500 uppercase tracking-wider block mb-1">Odometer Consistency (Max 5)</label>
                <input
                  type="number"
                  className="input text-xs"
                  value={weightOdo}
                  onChange={(e) => setWeightOdo(parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Action Panel */}
        <div className="border border-surface-300 rounded-xl bg-surface-50 p-5 space-y-4 h-fit">
          <h3 className="text-xs font-bold text-surface-950 uppercase tracking-wider">Save Changes</h3>
          <p className="text-xs text-surface-500">Updating settings takes effect immediately for all subsequent reconciliation runs.</p>
          <button
            type="submit"
            className="btn btn-primary w-full py-2.5 text-xs flex items-center justify-center gap-2 font-semibold"
            disabled={totalWeight !== 100}
          >
            <Save className="h-4 w-4" /> Save Configuration
          </button>
        </div>
      </form>
    </div>
  );
}
