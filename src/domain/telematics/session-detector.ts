/**
 * Refuelling Session Detector
 *
 * Groups multiple transactions during one stop at a station.
 * Associates AdBlue with visit but excludes from diesel tank calculations.
 * Uses configurable time windows.
 */

import {
  type CanonicalTelematicsPoint,
  type CanonicalTransaction,
  type RefuellingSession,
  ProductType,
} from '@/domain/types';
import { generateId } from '@/lib/utils';

export interface SessionDetectorConfig {
  sessionGapMinutes: number; // Max gap between transactions in same session
  minimumStopMinutes: number; // Minimum stop duration
}

const DEFAULT_SESSION_CONFIG: SessionDetectorConfig = {
  sessionGapMinutes: 30,
  minimumStopMinutes: 3,
};

/**
 * Detect refuelling sessions by grouping nearby transactions at the same station.
 */
export function detectSessions(
  points: CanonicalTelematicsPoint[],
  transactions: CanonicalTransaction[],
  config: SessionDetectorConfig = DEFAULT_SESSION_CONFIG
): RefuellingSession[] {
  if (transactions.length === 0) return [];

  // Sort transactions by vehicle then time
  const sorted = [...transactions]
    .filter((t) => t.isApproved && t.transactionTimestamp)
    .sort((a, b) => {
      if (a.registration !== b.registration) return a.registration.localeCompare(b.registration);
      return a.transactionTimestamp.localeCompare(b.transactionTimestamp);
    });

  const sessions: RefuellingSession[] = [];
  let currentGroup: CanonicalTransaction[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const tx = sorted[i];
    if (!tx) continue;

    if (currentGroup.length === 0) {
      currentGroup.push(tx);
      continue;
    }

    const last = currentGroup[currentGroup.length - 1];
    if (!last) continue;

    // Same vehicle and same station and within time gap?
    const sameVehicle = tx.registration === last.registration;
    const sameStation = tx.stationNumberNormalised !== '' && last.stationNumberNormalised !== '' &&
      tx.stationNumberNormalised === last.stationNumberNormalised;

    const timeDiffMs = Math.abs(
      new Date(tx.transactionTimestamp).getTime() -
      new Date(last.transactionTimestamp).getTime()
    );
    const withinGap = timeDiffMs <= config.sessionGapMinutes * 60 * 1000;

    if (sameVehicle && sameStation && withinGap) {
      currentGroup.push(tx);
    } else {
      // Close current group and start new one
      if (currentGroup.length >= 1) {
        sessions.push(buildSession(currentGroup, points));
      }
      currentGroup = [tx];
    }
  }

  // Final group
  if (currentGroup.length >= 1) {
    sessions.push(buildSession(currentGroup, points));
  }

  return sessions;
}

function buildSession(
  txGroup: CanonicalTransaction[],
  allPoints: CanonicalTelematicsPoint[]
): RefuellingSession {
  const firstTx = txGroup[0];
  if (!firstTx) throw new Error("Empty transaction group in buildSession");
  const vehicle = firstTx.registration;
  const station = firstTx.stationNumberNormalised;

  // Time bounds
  const times = txGroup.map((t) => new Date(t.transactionTimestamp).getTime());
  const startTime = new Date(Math.min(...times)).toISOString();
  const endTime = new Date(Math.max(...times)).toISOString();

  // Separate diesel from AdBlue
  const dieselTxs = txGroup.filter((t) =>
    t.productType === ProductType.DIESEL || t.productType === ProductType.GNR
  );
  const adblueTxs = txGroup.filter((t) => t.productType === ProductType.ADBLUE);

  const totalDiesel = dieselTxs.reduce((sum, t) => sum + parseFloat(t.quantity || '0'), 0);
  const totalAdblue = adblueTxs.reduce((sum, t) => sum + parseFloat(t.quantity || '0'), 0);

  // Find nearby telematics points
  const startMs = Math.min(...times) - 30 * 60 * 1000; // 30min before
  const endMs = Math.max(...times) + 30 * 60 * 1000; // 30min after

  const nearbyPoints = allPoints.filter((p) => {
    if (p.vehicleRegistration !== vehicle) return false;
    const pTime = new Date(p.timestamp).getTime();
    return !isNaN(pTime) && pTime >= startMs && pTime <= endMs;
  });

  // Fuel levels
  const withFuel = nearbyPoints.filter((p) => p.fuelLevelPercent !== null);
  const firstWithFuel = withFuel[0];
  const lastWithFuel = withFuel[withFuel.length - 1];
  const fuelBefore = firstWithFuel ? firstWithFuel.fuelLevelPercent : null;
  const fuelAfter = lastWithFuel ? lastWithFuel.fuelLevelPercent : null;

  const products = Array.from(new Set(txGroup.map((t) => t.productType)));

  return {
    id: generateId(),
    vehicleRegistration: vehicle,
    startTime,
    endTime,
    stationCode: station,
    transactionIds: txGroup.map((t) => t.id),
    telematicsPointIds: nearbyPoints.map((p) => p.id),
    fuelLevelBefore: fuelBefore,
    fuelLevelAfter: fuelAfter,
    totalQuantity: (totalDiesel + totalAdblue).toFixed(2),
    products,
  };
}
