import React, { useState, useEffect } from 'react';
import { type CanonicalTelematicsPoint, TelematicsClassification } from '@/domain/types';
import {
  Satellite,
  Clock,
  Compass,
  Gauge,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  HelpCircle,
} from 'lucide-react';

interface GPSEvidencePanelProps {
  transactionId: string;
}

export default function GPSEvidencePanel({ transactionId }: GPSEvidencePanelProps) {
  const [evidence, setEvidence] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const fetchEvidence = async () => {
      try {
        const res = await fetch(`/api/telematics/evidence?transactionId=${transactionId}`);
        const data = await res.json();
        if (!active) return;
        if (data.success) {
          setEvidence(data);
        } else {
          setError(data.error || 'Failed to load telematics evidence');
        }
      } catch (err) {
        if (active) setError(String(err));
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchEvidence();

    return () => {
      active = false;
    };
  }, [transactionId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 gap-2.5">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-xs text-gray-500 font-medium">Querying GPS telemetry cache...</span>
      </div>
    );
  }

  if (error || !evidence) {
    return (
      <div className="p-4 text-center bg-gray-50 dark:bg-gray-950/20 border border-gray-200 dark:border-gray-800 rounded-xl">
        <p className="text-xs text-gray-500 font-medium">GPS evidence unavailable</p>
        <p className="text-[10px] text-gray-400 mt-1">{error || 'No telemetry points available for vehicle'}</p>
      </div>
    );
  }

  const { transaction, assessment, pointsInWindow, beforePoint, afterPoint } = evidence;
  const isFuelTx = ['DIESEL', 'GNR', 'RED_DIESEL', 'ADBLUE'].includes(transaction.productType);

  const getStatusColor = (classification: string) => {
    switch (classification) {
      case 'VERIFIED': return 'text-green-700 bg-green-500/10 dark:text-green-400 dark:bg-green-950/20 border-green-200 dark:border-green-900/50';
      case 'LIKELY': return 'text-indigo-700 bg-indigo-50/70 dark:text-indigo-400 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/50';
      case 'REVIEW': return 'text-amber-700 bg-amber-500/10 dark:text-amber-400 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50';
      case 'UNLIKELY': return 'text-rose-700 bg-rose-500/10 dark:text-rose-400 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50';
      default: return 'text-gray-500 bg-gray-100 dark:text-gray-400 dark:bg-gray-800 border-gray-200 dark:border-gray-700';
    }
  };

  const getStatusIcon = (classification: string) => {
    switch (classification) {
      case 'VERIFIED': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'LIKELY': return <CheckCircle className="w-4 h-4 text-indigo-500" />;
      case 'REVIEW': return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'UNLIKELY': return <XCircle className="w-4 h-4 text-rose-500" />;
      default: return <HelpCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  // Find fuel movement values if available
  const fuelFactor = assessment?.factors?.find((f: any) => f.dimension === 'FUEL_LEVEL_MOVEMENT');
  const hasFuelDetails = fuelFactor && fuelFactor.result !== 'SKIP';
  const fuelDetails = fuelFactor?.details;

  return (
    <div className="flex flex-col gap-4 text-xs">
      
      {/* Classification Card */}
      <div className={`p-4 rounded-xl border flex items-center justify-between ${getStatusColor(assessment.classification)}`}>
        <div className="flex items-center gap-2">
          {getStatusIcon(assessment.classification)}
          <div>
            <span className="font-bold text-xs uppercase block tracking-wider">
              {assessment.classification.replace(/_/g, ' ')}
            </span>
            <span className="text-[10px] opacity-80">
              Score: {assessment.totalScore} / 100 • {assessment.factors.filter((f: any) => f.result !== 'SKIP').length} checks run
            </span>
          </div>
        </div>
        <div className="text-right">
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/40 dark:bg-black/20">
            {transaction.registration}
          </span>
        </div>
      </div>

      {/* Fuel movement breakdown card */}
      {isFuelTx && (
        <div className="p-4 bg-gray-50 dark:bg-gray-850 border border-gray-100 dark:border-gray-800 rounded-xl">
          <span className="font-semibold text-gray-800 dark:text-gray-200 block mb-2.5">
            Fuel Tank Level Analysis
          </span>

          {hasFuelDetails && fuelDetails ? (
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="bg-white dark:bg-gray-900 p-2 rounded border border-gray-200/60 dark:border-gray-800">
                <span className="text-[10px] text-gray-400 block uppercase">Fuel Before</span>
                <span className="text-lg font-extrabold text-gray-800 dark:text-white">
                  {Math.round(fuelDetails.fuelBeforePercent || 0)}%
                </span>
                <span className="text-[9px] text-gray-500 block">
                  ~{Math.round(((fuelDetails.fuelBeforePercent || 0) / 100) * 1200)} Litres
                </span>
              </div>
              <div className="bg-white dark:bg-gray-900 p-2 rounded border border-gray-200/60 dark:border-gray-800">
                <span className="text-[10px] text-gray-400 block uppercase">Fuel After</span>
                <span className="text-lg font-extrabold text-gray-800 dark:text-white">
                  {Math.round(fuelDetails.fuelAfterPercent || 0)}%
                </span>
                <span className="text-[9px] text-gray-500 block">
                  ~{Math.round(((fuelDetails.fuelAfterPercent || 0) / 100) * 1200)} Litres
                </span>
              </div>

              <div className="col-span-2 text-left pt-2 border-t border-gray-200/40 dark:border-gray-800/40 space-y-1.5 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-gray-500">Observed Increase:</span>
                  <span className="font-semibold text-gray-800 dark:text-white">
                    +{Math.round(fuelDetails.observedIncreasePercent || 0)}% (
                    {Math.round(((fuelDetails.observedIncreasePercent || 0) / 100) * 1200)}L)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Expected (from Invoice):</span>
                  <span className="font-semibold text-gray-800 dark:text-white">
                    +{Math.round((parseFloat(transaction.quantity || '0') / 1200) * 100)}% (
                    {parseFloat(transaction.quantity || '0').toFixed(2)} L)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Tank Capacity Used:</span>
                  <span className="font-semibold text-gray-800 dark:text-white">1,200 Litres (Actros standard)</span>
                </div>
                {fuelDetails.sensorCeilingStatus === 'Capped' && (
                  <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-950/15 border border-amber-100 dark:border-amber-900/40 rounded text-[9px] text-amber-700 dark:text-amber-400 flex items-start gap-1">
                    <AlertTriangle className="w-3 shrink-0 mt-0.5" />
                    <span>
                      <strong>Sensor ceiling warning:</strong> Fuel level reached 100% capacity limit. Actual fill volume might be capped by sensor limits.
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-2 text-gray-500 text-[10px] leading-relaxed">
              {fuelFactor?.explanation || 'No fuel movement analysis available for this point.'}
            </div>
          )}
        </div>
      )}

      {/* Standstill / Stop Timeline segment */}
      <div className="p-4 bg-gray-50 dark:bg-gray-850 border border-gray-100 dark:border-gray-800 rounded-xl space-y-3">
        <span className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-1">
          <Clock className="w-4 h-4 text-indigo-500" />
           standstills & Time alignment
        </span>

        <div className="space-y-3 relative border-l border-indigo-150 dark:border-indigo-950 ml-2 pl-4 py-1">
          {/* Before point */}
          {beforePoint ? (
            <div className="relative">
              <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-slate-700 border-2 border-white dark:border-gray-900" />
              <div className="text-[10px] text-gray-500 dark:text-gray-400">
                <span className="font-semibold text-gray-700 dark:text-gray-300 block">
                  GPS Point Before Refueling
                </span>
                <span className="block mt-0.5">
                  Time: {new Date(beforePoint.timestamp).toLocaleTimeString()} (
                  {Math.round(Math.abs(new Date(beforePoint.timestamp).getTime() - new Date(transaction.transactionTimestamp).getTime()) / 60000)}m before)
                </span>
                <span className="flex items-center gap-2 mt-1">
                  <span className="flex items-center gap-0.5"><Gauge className="w-3 h-3" /> {beforePoint.speedKmh} km/h</span>
                  <span className="flex items-center gap-0.5"><Compass className="w-3 h-3" /> {beforePoint.odometerKm} km</span>
                  {beforePoint.fuelLevelPercent !== null && (
                    <span className="flex items-center gap-0.5"><Activity className="w-3 h-3" /> {Math.round(beforePoint.fuelLevelPercent)}% fuel</span>
                  )}
                </span>
                {beforePoint.locationAddress && (
                  <span className="block mt-1 italic truncate max-w-[260px] text-[9px]">{beforePoint.locationAddress}</span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-[10px] text-gray-400">No telemetry point before transaction.</div>
          )}

          {/* Transaction Time */}
          <div className="relative border-y border-dashed border-indigo-200 dark:border-indigo-900/60 py-2 my-2 bg-indigo-50/20 dark:bg-indigo-950/10 px-2 rounded">
            <div className="absolute -left-[27px] top-1/2 -translate-y-1/2 p-1 bg-indigo-500 rounded-full text-white">
              <Clock className="w-3 h-3" />
            </div>
            <div className="text-[10px] text-indigo-700 dark:text-indigo-400 font-semibold">
              <span>Transaction Invoiced Timestamp</span>
              <span className="block text-[11px] font-mono text-gray-800 dark:text-gray-200 mt-0.5">
                {new Date(transaction.transactionTimestamp || transaction.transactionDateTime).toLocaleTimeString()}
              </span>
              <span className="text-[9px] font-normal text-gray-500 block">
                Forecourt: {transaction.stationCity || transaction.stationName}
              </span>
            </div>
          </div>

          {/* After point */}
          {afterPoint ? (
            <div className="relative">
              <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-slate-700 border-2 border-white dark:border-gray-900" />
              <div className="text-[10px] text-gray-500 dark:text-gray-400">
                <span className="font-semibold text-gray-700 dark:text-gray-300 block">
                  GPS Point After Refueling
                </span>
                <span className="block mt-0.5">
                  Time: {new Date(afterPoint.timestamp).toLocaleTimeString()} (
                  {Math.round(Math.abs(new Date(afterPoint.timestamp).getTime() - new Date(transaction.transactionTimestamp).getTime()) / 60000)}m after)
                </span>
                <span className="flex items-center gap-2 mt-1">
                  <span className="flex items-center gap-0.5"><Gauge className="w-3 h-3" /> {afterPoint.speedKmh} km/h</span>
                  <span className="flex items-center gap-0.5"><Compass className="w-3 h-3" /> {afterPoint.odometerKm} km</span>
                  {afterPoint.fuelLevelPercent !== null && (
                    <span className="flex items-center gap-0.5"><Activity className="w-3 h-3" /> {Math.round(afterPoint.fuelLevelPercent)}% fuel</span>
                  )}
                </span>
                {afterPoint.locationAddress && (
                  <span className="block mt-1 italic truncate max-w-[260px] text-[9px]">{afterPoint.locationAddress}</span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-[10px] text-gray-400">No telemetry point after transaction.</div>
          )}

        </div>
      </div>

      {/* Explanatory ledger breakdown list */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 block">
          Confidence Checks Breakdown
        </span>
        <div className="flex flex-col gap-2">
          {assessment.factors.map((factor: any) => (
            <div
              key={factor.dimension}
              className={`p-3 rounded-lg border text-[11px] ${
                factor.result === 'PASS'
                  ? 'bg-green-50/20 border-green-150/40 text-green-800 dark:text-green-400 dark:bg-green-950/10'
                  : factor.result === 'PARTIAL'
                  ? 'bg-amber-50/25 border-amber-150/30 text-amber-800 dark:text-amber-400 dark:bg-amber-950/10'
                  : factor.result === 'SKIP'
                  ? 'bg-gray-50 border-gray-100 text-gray-500 dark:text-gray-400 dark:bg-gray-800/40 dark:border-gray-800/50'
                  : 'bg-rose-50/20 border-rose-150/40 text-rose-800 dark:text-rose-400 dark:bg-rose-950/10'
              }`}
            >
              <div className="flex justify-between font-semibold mb-1">
                <span className="capitalize">{factor.dimension.replace(/_/g, ' ').toLowerCase()}</span>
                <span>{factor.awardedPoints} / {factor.maxPoints} pts</span>
              </div>
              <p className="text-[10px] opacity-90">{factor.explanation}</p>
              <p className="text-[9px] opacity-60 font-mono mt-1">Rule: {factor.rule}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
