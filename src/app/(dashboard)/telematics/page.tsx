'use client';

import React, { useState, useEffect } from 'react';
import { MapPin, Search, Filter, AlertTriangle, CheckCircle2, ShieldAlert, Clock, Info } from 'lucide-react';

const classColors: Record<string, string> = {
  VERIFIED: 'badge-success',
  LIKELY: 'badge-success',
  REVIEW: 'badge-warning',
  UNLIKELY: 'badge-error',
  INSUFFICIENT_EVIDENCE: 'badge-info',
};

export default function TelematicsPage() {
  const [data, setData] = useState<any>({ assessments: [], pointsCount: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [factors, setFactors] = useState<any[]>([]);

  const fetchTelematics = () => {
    fetch('/api/telematics')
      .then((res) => res.json())
      .then((resData) => {
        setData(resData);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchTelematics();
  }, []);

  const handleOpenFactors = async (item: any) => {
    setSelectedItem(item);
    setFactors([]);
    try {
      const res = await fetch(`/api/telematics?matchId=${item.id}`);
      const d = await res.json();
      setFactors(d.ledgers || []);
    } catch (err) {
      console.error(err);
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
        <h1 className="text-2xl font-bold text-surface-900">Telematics Verification</h1>
        <p className="text-sm text-surface-500 mt-1">
          GPS and telematics analysis matching vehicle coordinates, odometer steps, and fuel level movements
        </p>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="card p-4">
          <p className="text-xs text-surface-500">Assessed Transactions</p>
          <p className="text-xl font-bold mt-1 text-surface-800">{data.assessments.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-surface-500">Total GPS Ingested Points</p>
          <p className="text-xl font-bold mt-1 text-brand-600">{data.pointsCount}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-surface-500">Classification Accuracy</p>
          <p className="text-xl font-bold mt-1 text-green-600">Deterministic Scorecard</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Table list */}
        <div className="lg:col-span-2 card overflow-hidden">
          {data.assessments.length === 0 ? (
            <div className="p-8 text-center text-surface-400">
              No telematics verification results. Upload a GPS/telematics excel and run reconciliation.
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-surface-50 border-b border-surface-200">
                <tr>
                  <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Vehicle</th>
                  <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Timestamp</th>
                  <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Product</th>
                  <th className="text-right text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Litres</th>
                  <th className="text-center text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Classification</th>
                  <th className="text-right text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200">
                {data.assessments.map((item: any) => (
                  <tr
                    key={item.id}
                    onClick={() => handleOpenFactors(item)}
                    className={`hover:bg-surface-50 transition cursor-pointer ${
                      selectedItem?.id === item.id ? 'bg-brand-50/20' : ''
                    }`}
                  >
                    <td className="px-5 py-3 text-sm font-semibold text-surface-800">
                      {item.transaction?.registration || '—'}
                    </td>
                    <td className="px-5 py-3 text-xs text-surface-500 font-mono">
                      {item.transaction?.transactionTimestamp
                        ? new Date(item.transaction.transactionTimestamp).toLocaleString()
                        : '—'}
                    </td>
                    <td className="px-5 py-3 text-sm text-surface-600">
                      {item.transaction?.productName || '—'}
                    </td>
                    <td className="px-5 py-3 text-sm text-surface-800 text-right font-mono">
                      {item.transaction?.quantity || '—'}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={`badge ${classColors[item.telematicsAssessment?.classification] || 'badge-info'} text-2xs`}>
                        {(item.telematicsAssessment?.classification || 'INSUFFICIENT_EVIDENCE').replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-sm font-medium text-surface-800">
                      {item.telematicsAssessment?.totalScore ?? 0} pts
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Factors Breakdown */}
        <div className="lg:col-span-1 space-y-4">
          <h3 className="text-sm font-semibold text-surface-800">Telematics Scorecard Details</h3>
          {selectedItem ? (
            <div className="card p-5 space-y-5">
              <div className="border-b border-surface-150 pb-3">
                <h4 className="font-bold text-surface-900">Vehicle: {selectedItem.transaction?.registration}</h4>
                <p className="text-2xs text-surface-400 mt-1">Transaction Ref: {selectedItem.transaction?.authorisationId || 'N/A'}</p>
              </div>

              {/* Score and Classification */}
              <div className="flex items-center justify-between bg-surface-50 p-3 rounded-xl border border-surface-150">
                <div>
                  <span className="text-3xs uppercase tracking-wider text-surface-400 font-semibold">Total Match Score</span>
                  <p className="text-lg font-bold text-surface-800">{selectedItem.telematicsAssessment?.totalScore ?? 0} / 100</p>
                </div>
                <span className={`badge ${classColors[selectedItem.telematicsAssessment?.classification] || 'badge-info'} text-xs`}>
                  {selectedItem.telematicsAssessment?.classification}
                </span>
              </div>

              {/* Factors */}
              <div className="space-y-3">
                <h5 className="text-xs font-bold text-surface-700 uppercase tracking-wider">Scoring Breakdown</h5>
                {factors.length === 0 ? (
                  <p className="text-xs text-surface-400">Loading factor ledgers...</p>
                ) : (
                  <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                    {factors.map((f: any) => (
                      <div key={f.id} className="border-b border-surface-100 pb-2 space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-surface-700">{f.factor.replace(/_/g, ' ')}</span>
                          <span className="text-brand-600">{f.awarded_points} / {f.max_points} pts</span>
                        </div>
                        <p className="text-3xs text-surface-400 font-mono">Rule: {f.rule_applied}</p>
                        <p className="text-2xs text-surface-600">Source: {f.raw_value} → {f.normalised_value}</p>
                        {f.supporting_evidence && (
                          <p className="text-green-600 text-3xs font-medium">✓ Supporting: {f.supporting_evidence}</p>
                        )}
                        {f.contradictory_evidence && (
                          <p className="text-red-600 text-3xs font-medium">✗ Discrepancy: {f.contradictory_evidence}</p>
                        )}
                        {f.missing_evidence && (
                          <p className="text-surface-400 text-3xs">⚠ Missing: {f.missing_evidence}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="card p-5 text-center text-surface-400 text-xs">
              <Info className="h-8 w-8 text-surface-300 mx-auto mb-2" />
              Select a transaction in the table to view its telematics factors, coordinates mappings, and fuel level analysis.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
