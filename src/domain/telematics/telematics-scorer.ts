/**
 * Telematics Scoring Engine
 *
 * Deterministic, versioned, configurable scoring model.
 * Factor weights: time(25), location(25), fuel(25), stop(10), volume(10), odometer(5)
 * Classifications: VERIFIED(85-100), LIKELY(70-84), REVIEW(45-69), UNLIKELY(0-44), INSUFFICIENT_EVIDENCE
 *
 * Supports text-location matching (no coordinate fabrication).
 * Product-specific rules for diesel, AdBlue, GNR, parking, toll.
 */

import {
  type CanonicalTransaction,
  type CanonicalTelematicsPoint,
  type CanonicalStation,
  type TelematicsAssessment,
  type TelematicsFactorResult,
  type TelematicsConfig,
  TelematicsClassification,
  ConfidenceDimension,
  ProductType,
} from '@/domain/types';
import { generateId, normaliseStationCode } from '@/lib/utils';
import { normalizeRegistration } from '@/config/fleet-registry';

// ─── Default Configuration ─────────────────────────────────────────────────────

export const DEFAULT_TELEMATICS_CONFIG: TelematicsConfig = {
  timeWindowMinutes: 120,
  locationRadiusKm: 5,
  fuelLevelDropThresholdPercent: 3,
  stopDurationMinutes: 5,
  sessionGapMinutes: 30,
  weights: {
    [ConfidenceDimension.TIME_PROXIMITY]: 25,
    [ConfidenceDimension.LOCATION_PROXIMITY]: 25,
    [ConfidenceDimension.FUEL_LEVEL_MOVEMENT]: 25,
    [ConfidenceDimension.STOP_ENGINE_BEHAVIOUR]: 10,
    [ConfidenceDimension.VOLUME_CONSISTENCY]: 10,
    [ConfidenceDimension.ODOMETER_CONSISTENCY]: 5,
  },
};

function classify(score: number, hasEnoughEvidence: boolean): TelematicsClassification {
  if (!hasEnoughEvidence) return TelematicsClassification.INSUFFICIENT_EVIDENCE;
  if (score >= 85) return TelematicsClassification.VERIFIED;
  if (score >= 70) return TelematicsClassification.LIKELY;
  if (score >= 45) return TelematicsClassification.REVIEW;
  return TelematicsClassification.UNLIKELY;
}

// ─── Core Assessment Function ──────────────────────────────────────────────────

/**
 * Assess a transaction against telematics data.
 */
export function assessTransaction(
  tx: CanonicalTransaction,
  points: CanonicalTelematicsPoint[],
  station: CanonicalStation | null,
  config: TelematicsConfig = DEFAULT_TELEMATICS_CONFIG,
  allVehicleTransactions?: CanonicalTransaction[]
): TelematicsAssessment {
  // Filter points for the correct vehicle (using normalized comparison)
  const normTxReg = normalizeRegistration(tx.registration);
  let vehiclePoints = points.filter(
    (p) => normalizeRegistration(p.vehicleRegistration) === normTxReg
  );

  // If no telematics data at all, return insufficient evidence
  if (vehiclePoints.length === 0) {
    return makeInsufficientResult(tx, config, 'No telematics data found for vehicle ' + tx.registration);
  }

  // Sort telemetry points in ascending timestamp order
  vehiclePoints.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Deduplicate identical timestamp/event points without losing relevant engine, ignition or location evidence.
  const pointMap = new Map<string, CanonicalTelematicsPoint>();
  for (const pt of vehiclePoints) {
    if (!pt.timestamp) continue;
    const ts = new Date(pt.timestamp).toISOString();
    if (pointMap.has(ts)) {
      const existing = pointMap.get(ts)!;
      const merged: CanonicalTelematicsPoint = {
        ...existing,
        fuelLevelPercent: existing.fuelLevelPercent !== null ? existing.fuelLevelPercent : pt.fuelLevelPercent,
        odometerKm: existing.odometerKm !== null ? existing.odometerKm : pt.odometerKm,
        speedKmh: existing.speedKmh !== null ? existing.speedKmh : pt.speedKmh,
        activity: [existing.activity, pt.activity].filter(Boolean).join('; '),
        info: [existing.info, pt.info].filter(Boolean).join('; '),
        locationCity: existing.locationCity || pt.locationCity,
        locationTown: existing.locationTown || pt.locationTown,
        locationStreet: existing.locationStreet || pt.locationStreet,
        locationVillage: existing.locationVillage || pt.locationVillage,
        locationAddress: existing.locationAddress || pt.locationAddress,
        latitude: existing.latitude !== null ? existing.latitude : pt.latitude,
        longitude: existing.longitude !== null ? existing.longitude : pt.longitude,
      };
      pointMap.set(ts, merged);
    } else {
      pointMap.set(ts, pt);
    }
  }
  vehiclePoints = Array.from(pointMap.values());

  const txTime = new Date(tx.transactionTimestamp).getTime();
  if (isNaN(txTime)) {
    return makeInsufficientResult(tx, config, 'Transaction has no valid timestamp.');
  }

  // Find points in the time window (using standard timeWindowMinutes for standard window checks)
  const windowMs = config.timeWindowMinutes * 60 * 1000;
  const windowPoints = vehiclePoints.filter((p) => {
    const pTime = new Date(p.timestamp).getTime();
    return !isNaN(pTime) && Math.abs(pTime - txTime) <= windowMs;
  });

  if (windowPoints.length === 0 && tx.productType !== ProductType.PARKING && tx.productType !== ProductType.TOLL) {
    // If no points in standard window, but we are checking fuel, we might find a timezone-shifted session in vehiclePoints.
  }

  const factors: TelematicsFactorResult[] = [];
  let hasEnoughEvidence = true;

  // ─── Factor 1: Time Proximity ──────────────────────────
  factors.push(assessTimeProximity(tx, windowPoints.length > 0 ? windowPoints : vehiclePoints, config));

  // ─── Factor 2: Location Proximity ──────────────────────
  factors.push(assessLocationProximity(tx, windowPoints.length > 0 ? windowPoints : vehiclePoints, station, config));

  // ─── Factor 3: Fuel Level Movement ─────────────────────
  const fuelFactor = assessFuelMovement(tx, vehiclePoints, config, allVehicleTransactions);
  factors.push(fuelFactor);

  // Extract variables for volume consistency to check sensor ceiling
  const sensorCeilingReached = fuelFactor.details?.sensorCeilingStatus === 'Capped';
  const observedIncreasePercent = fuelFactor.details?.observedIncreasePercent || 0;

  // ─── Factor 4: Stop/Engine Behaviour ───────────────────
  factors.push(assessStopBehaviour(windowPoints.length > 0 ? windowPoints : vehiclePoints, config));

  // ─── Factor 5: Volume Consistency ──────────────────────
  factors.push(assessVolumeConsistency(tx, windowPoints.length > 0 ? windowPoints : vehiclePoints, config, sensorCeilingReached, observedIncreasePercent));

  // ─── Factor 6: Odometer Consistency ────────────────────
  factors.push(assessOdometerConsistency(tx, windowPoints.length > 0 ? windowPoints : vehiclePoints));

  // Calculate total score
  const totalScore = factors.reduce((sum, f) => sum + f.awardedPoints, 0);
  const maxPossible = factors
    .filter((f) => f.result !== 'SKIP')
    .reduce((sum, f) => sum + f.maxPoints, 0);

  // If too many factors skipped, flag insufficient evidence
  const skippedWeight = factors
    .filter((f) => f.result === 'SKIP')
    .reduce((sum, f) => sum + f.maxPoints, 0);
  if (skippedWeight > 50) hasEnoughEvidence = false;

  // Normalise score to 0-100
  const normalisedScore = maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 0;
  const classification = classify(normalisedScore, hasEnoughEvidence);

  return {
    transactionId: tx.id,
    classification,
    totalScore: normalisedScore,
    factors,
    sessionId: null,
    assessedAt: new Date().toISOString(),
    configSnapshot: config,
  };
}

// ─── Factor Assessors ──────────────────────────────────────────────────────────

function assessTimeProximity(
  tx: CanonicalTransaction,
  points: CanonicalTelematicsPoint[],
  config: TelematicsConfig
): TelematicsFactorResult {
  const maxPts = config.weights[ConfidenceDimension.TIME_PROXIMITY];
  const txTime = new Date(tx.transactionTimestamp).getTime();

  let minDiff = Infinity;
  for (const p of points) {
    const diff = Math.abs(new Date(p.timestamp).getTime() - txTime);
    if (diff < minDiff) minDiff = diff;
  }

  const minDiffMinutes = minDiff / 60000;
  let awarded: number;
  let result: 'PASS' | 'PARTIAL' | 'FAIL';

  if (minDiffMinutes <= 15) {
    awarded = maxPts;
    result = 'PASS';
  } else if (minDiffMinutes <= 60) {
    awarded = Math.round(maxPts * 0.7);
    result = 'PARTIAL';
  } else if (minDiffMinutes <= config.timeWindowMinutes) {
    awarded = Math.round(maxPts * 0.3);
    result = 'PARTIAL';
  } else {
    awarded = 0;
    result = 'FAIL';
  }

  return {
    dimension: ConfidenceDimension.TIME_PROXIMITY,
    maxPoints: maxPts,
    awardedPoints: awarded,
    sourceValue: tx.transactionTimestamp,
    normalisedValue: `${Math.round(minDiffMinutes)}min from nearest point`,
    rule: `Full points if ≤15min, partial if ≤${config.timeWindowMinutes}min`,
    result,
    explanation: `Nearest telematics point is ${Math.round(minDiffMinutes)} minutes from transaction time.`,
  };
}

function assessLocationProximity(
  tx: CanonicalTransaction,
  points: CanonicalTelematicsPoint[],
  station: CanonicalStation | null,
  config: TelematicsConfig
): TelematicsFactorResult {
  const maxPts = config.weights[ConfidenceDimension.LOCATION_PROXIMITY];

  // Text-based location matching
  const stationCity = (tx.stationCity || tx.stationName || '').toLowerCase();
  const stationCountry = (tx.serviceCountry || '').toLowerCase();

  if (!stationCity && !stationCountry) {
    return {
      dimension: ConfidenceDimension.LOCATION_PROXIMITY,
      maxPoints: maxPts,
      awardedPoints: 0,
      sourceValue: '',
      normalisedValue: '',
      rule: 'Text location matching against station city/country',
      result: 'SKIP',
      explanation: 'No station location available for comparison.',
    };
  }

  // Check if any nearby point mentions the station city or country
  let bestMatch = 0;
  let bestPointLocation = '';

  for (const p of points) {
    const allLocationText = [
      p.locationCity, p.locationTown, p.locationStreet,
      p.locationVillage, p.locationAddress,
    ].join(' ').toLowerCase();

    let score = 0;
    if (stationCity && allLocationText.includes(stationCity)) score += 0.7;
    if (stationCountry && allLocationText.includes(stationCountry)) score += 0.3;

    // Also check station name segments
    if (station) {
      const stName = station.stationName.toLowerCase();
      const stCity = station.city.toLowerCase();
      if (stName && allLocationText.includes(stName)) score += 0.5;
      if (stCity && allLocationText.includes(stCity)) score += 0.5;
    }

    if (score > bestMatch) {
      bestMatch = Math.min(score, 1.0);
      bestPointLocation = allLocationText.slice(0, 100);
    }
  }

  const awarded = Math.round(maxPts * bestMatch);
  const result: 'PASS' | 'PARTIAL' | 'FAIL' = bestMatch >= 0.7 ? 'PASS' : bestMatch >= 0.3 ? 'PARTIAL' : 'FAIL';

  return {
    dimension: ConfidenceDimension.LOCATION_PROXIMITY,
    maxPoints: maxPts,
    awardedPoints: awarded,
    sourceValue: stationCity,
    normalisedValue: bestPointLocation,
    rule: 'Text match of station city/name against telematics location fields',
    result,
    explanation: bestMatch > 0
      ? `Location text match confidence: ${Math.round(bestMatch * 100)}%.`
      : 'No location text match found in nearby telematics points.',
  };
}

function getMedian(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function assessFuelMovement(
  tx: CanonicalTransaction,
  vehiclePoints: CanonicalTelematicsPoint[],
  config: TelematicsConfig,
  allVehicleTransactions?: CanonicalTransaction[]
): TelematicsFactorResult {
  const maxPts = config.weights[ConfidenceDimension.FUEL_LEVEL_MOVEMENT];

  // Skip for non-fuel products
  if (tx.productType === ProductType.PARKING || tx.productType === ProductType.TOLL ||
      tx.productType === ProductType.WASH || tx.productType === ProductType.SERVICE_FEE ||
      tx.productType === ProductType.PASSANGO) {
    return {
      dimension: ConfidenceDimension.FUEL_LEVEL_MOVEMENT,
      maxPoints: maxPts,
      awardedPoints: 0,
      sourceValue: tx.productType,
      normalisedValue: '',
      rule: 'Fuel level not applicable for this product type',
      result: 'SKIP',
      explanation: `Product type "${tx.productType}" does not involve fuel — fuel level check skipped.`,
    };
  }

  // Skip for AdBlue — don't compare to diesel tank sensor
  if (tx.productType === ProductType.ADBLUE) {
    return {
      dimension: ConfidenceDimension.FUEL_LEVEL_MOVEMENT,
      maxPoints: maxPts,
      awardedPoints: 0,
      sourceValue: 'ADBLUE',
      normalisedValue: '',
      rule: 'AdBlue excluded from diesel tank sensor comparison',
      result: 'SKIP',
      explanation: 'AdBlue litres not compared to diesel fuel sensor. Separate AdBlue sensor would be needed.',
    };
  }

  // Find pivotPoint: stationary point closest to transaction time
  const txTime = new Date(tx.transactionTimestamp).getTime();
  const alignmentWindowMs = 180 * 60 * 1000; // +/- 180 minutes to align timezone

  const stationCity = (tx.stationCity || tx.stationName || '').toLowerCase();
  const getLocScore = (p: CanonicalTelematicsPoint) => {
    const allLocationText = [
      p.locationCity, p.locationTown, p.locationStreet,
      p.locationVillage, p.locationAddress,
    ].join(' ').toLowerCase();
    let score = 0;
    if (stationCity && allLocationText.includes(stationCity)) score += 2;
    if (tx.stationName && allLocationText.includes(tx.stationName.toLowerCase())) score += 1;
    return score;
  };

  const nearbyPoints = vehiclePoints.filter((p) => {
    const pTime = new Date(p.timestamp).getTime();
    return !isNaN(pTime) && Math.abs(pTime - txTime) <= alignmentWindowMs;
  });

  const stationaryPoints = nearbyPoints.filter((p) => {
    const speed = p.speedKmh;
    const act = (p.activity || '').toLowerCase();
    const info = (p.info || '').toLowerCase();
    return (speed !== null && speed <= 1) ||
      act.includes('standstill') || act.includes('stop') || act.includes('rest') || act.includes('off') ||
      info.includes('standstill') || info.includes('stop') || info.includes('rest') || info.includes('off');
  });

  let pivotPoint: CanonicalTelematicsPoint | null = null;
  if (stationaryPoints.length > 0) {
    // Prefer points with location match
    const withLoc = stationaryPoints.filter(p => getLocScore(p) > 0);
    const candidates = withLoc.length > 0 ? withLoc : stationaryPoints;
    
    // Pick the one closest to txTime
    let minDiff = Infinity;
    for (const p of candidates) {
      const diff = Math.abs(new Date(p.timestamp).getTime() - txTime);
      if (diff < minDiff) {
        minDiff = diff;
        pivotPoint = p;
      }
    }
  }

  if (!pivotPoint && nearbyPoints.length > 0) {
    let minDiff = Infinity;
    for (const p of nearbyPoints) {
      const diff = Math.abs(new Date(p.timestamp).getTime() - txTime);
      if (diff < minDiff) {
        minDiff = diff;
        pivotPoint = p;
      }
    }
  }

  const alignedTxTime = pivotPoint ? new Date(pivotPoint.timestamp).getTime() : txTime;

  // Build the session window: 90 min before to 120 min after aligned time
  const windowStart = alignedTxTime - 90 * 60 * 1000;
  const windowEnd = alignedTxTime + 120 * 60 * 1000;

  const sessionPoints = vehiclePoints.filter((p) => {
    const pTime = new Date(p.timestamp).getTime();
    return !isNaN(pTime) && pTime >= windowStart && pTime <= windowEnd;
  });

  const excludedPoints = vehiclePoints.filter((p) => {
    const pTime = new Date(p.timestamp).getTime();
    return !isNaN(pTime) && (pTime < windowStart || pTime > windowEnd);
  });

  const withFuel = sessionPoints.filter((p) => p.fuelLevelPercent !== null);

  if (withFuel.length < 2) {
    return {
      dimension: ConfidenceDimension.FUEL_LEVEL_MOVEMENT,
      maxPoints: maxPts,
      awardedPoints: 0,
      sourceValue: `${withFuel.length} readings`,
      normalisedValue: '',
      rule: 'Need at least 2 fuel level readings in session for comparison',
      result: 'SKIP',
      explanation: 'Insufficient fuel level readings in the session to assess fuel movement.',
      details: {
        transactionTimestamp: tx.transactionTimestamp,
        timezoneApplied: 'Aligned to telemetry standstill',
        sessionStart: new Date(windowStart).toISOString(),
        sessionEnd: new Date(windowEnd).toISOString(),
        pointsUsedCount: sessionPoints.length,
        pointsExcludedCount: excludedPoints.length,
        reasonForExclusion: 'Outside session window',
        finalFuelScore: 0,
        plainEnglishConclusion: 'Insufficient telemetry points to verify fuel movement.',
      }
    };
  }

  // Find the largest positive jump in fuelPoints
  let maxDiff = -1;
  let bestPreIdx = -1;
  let bestPostIdx = -1;

  for (let a = 0; a < withFuel.length; a++) {
    for (let b = a + 1; b < withFuel.length; b++) {
      const diff = withFuel[b]!.fuelLevelPercent! - withFuel[a]!.fuelLevelPercent!;
      if (diff > maxDiff) {
        maxDiff = diff;
        bestPreIdx = a;
        bestPostIdx = b;
      }
    }
  }

  // Default values if no positive jump
  let baselineFuelPercent = withFuel[0]!.fuelLevelPercent!;
  let postFillFuelPercent = withFuel[withFuel.length - 1]!.fuelLevelPercent!;
  let observedIncreasePercent = postFillFuelPercent - baselineFuelPercent;
  let baselineTimestamp = withFuel[0]!.timestamp;
  let postFillTimestamp = withFuel[withFuel.length - 1]!.timestamp;

  if (maxDiff > 0 && bestPreIdx !== -1 && bestPostIdx !== -1) {
    // Pre-jump points: stationary/pre-restart points before the post-jump index
    const preJumpPoints = withFuel.slice(0, bestPostIdx);
    const preJumpStationary = preJumpPoints.filter(p => {
      const speed = p.speedKmh;
      const act = (p.activity || '').toLowerCase();
      return (speed !== null && speed <= 1) || act.includes('standstill') || act.includes('stop') || act.includes('rest') || act.includes('off');
    });
    const baselineCandidates = preJumpStationary.length > 0 ? preJumpStationary : preJumpPoints;
    baselineFuelPercent = getMedian(baselineCandidates.map(p => p.fuelLevelPercent!));
    baselineTimestamp = baselineCandidates[baselineCandidates.length - 1]!.timestamp || withFuel[bestPreIdx]!.timestamp;

    // Post-jump points: first few points starting from post-jump index
    const postJumpPoints = withFuel.slice(bestPostIdx);
    postFillFuelPercent = getMedian(postJumpPoints.slice(0, 5).map(p => p.fuelLevelPercent!));
    postFillTimestamp = postJumpPoints[0]!.timestamp;

    observedIncreasePercent = postFillFuelPercent - baselineFuelPercent;
  }

  // Aggregate diesel litres for multiple transactions in the same stop window
  let aggregatedLitres = parseFloat(tx.quantity || '0');
  if (allVehicleTransactions) {
    const sameSessionTxs = allVehicleTransactions.filter((other) => {
      if (other.id === tx.id) return false;
      if (other.productType !== ProductType.DIESEL && other.productType !== ProductType.GNR) return false;
      const otherTime = new Date(other.transactionTimestamp).getTime();
      return otherTime >= windowStart && otherTime <= windowEnd;
    });
    for (const sTx of sameSessionTxs) {
      aggregatedLitres += parseFloat(sTx.quantity || '0');
    }
  }

  const tankCapacity = 1200; // 1200L default Actros
  const expectedPercentIncrease = (aggregatedLitres / tankCapacity) * 100;
  const difference = Math.abs(observedIncreasePercent - expectedPercentIncrease);
  const sensorCeilingReached = postFillFuelPercent >= 99.5;

  let awarded: number;
  let result: 'PASS' | 'PARTIAL' | 'FAIL';

  if (observedIncreasePercent > config.fuelLevelDropThresholdPercent) {
    awarded = maxPts;
    result = 'PASS';
  } else if (observedIncreasePercent > 0) {
    awarded = Math.round(maxPts * 0.6);
    result = 'PARTIAL';
  } else if (sensorCeilingReached) {
    awarded = Math.round(maxPts * 0.5);
    result = 'PARTIAL';
  } else {
    awarded = 0;
    result = 'FAIL';
  }

  const plainEnglishConclusion = `Fuel movement detected. The stable fuel reading increased from approximately ${Math.round(baselineFuelPercent)}% before refuelling to ${Math.round(postFillFuelPercent)}% after the vehicle restarted, an observed increase of ${Math.round(observedIncreasePercent)} percentage points. The ${aggregatedLitres.toFixed(2)}-litre transaction represents approximately ${expectedPercentIncrease.toFixed(1)}% of the configured 1,200-litre tank. The vehicle was at ${tx.stationCity || tx.stationName || 'the station'} and was stationary during the event. ${sensorCeilingReached ? 'The sensor reached its 100% ceiling, so exact volume agreement cannot be confirmed, but the telemetry strongly supports a refuelling event.' : 'The telemetry supports the refuelling event.'}`;

  return {
    dimension: ConfidenceDimension.FUEL_LEVEL_MOVEMENT,
    maxPoints: maxPts,
    awardedPoints: awarded,
    sourceValue: `${Math.round(baselineFuelPercent)}% → ${Math.round(postFillFuelPercent)}%`,
    normalisedValue: `+${observedIncreasePercent.toFixed(1)}%`,
    rule: `Expect increase >${config.fuelLevelDropThresholdPercent}% for fuel transaction`,
    result,
    explanation: plainEnglishConclusion,
    details: {
      transactionTimestamp: tx.transactionTimestamp,
      timezoneApplied: pivotPoint ? 'Aligned to telemetry standstill' : 'UTC',
      sessionStart: new Date(windowStart).toISOString(),
      sessionEnd: new Date(windowEnd).toISOString(),
      baselineTimestamp,
      baselineFuelPercent: parseFloat(baselineFuelPercent.toFixed(2)),
      postFillTimestamp,
      postFillFuelPercent: parseFloat(postFillFuelPercent.toFixed(2)),
      observedIncreasePercent: parseFloat(observedIncreasePercent.toFixed(2)),
      transactionLitres: parseFloat(aggregatedLitres.toFixed(2)),
      tankCapacity,
      expectedIncreasePercent: parseFloat(expectedPercentIncrease.toFixed(2)),
      differencePercent: parseFloat(difference.toFixed(2)),
      sensorCeilingStatus: sensorCeilingReached ? 'Capped' : 'Normal',
      pointsUsedCount: sessionPoints.length,
      pointsExcludedCount: excludedPoints.length,
      reasonForExclusion: 'Outside session window',
      finalFuelScore: awarded,
      plainEnglishConclusion,
    }
  };
}

function assessStopBehaviour(
  points: CanonicalTelematicsPoint[],
  config: TelematicsConfig
): TelematicsFactorResult {
  const maxPts = config.weights[ConfidenceDimension.STOP_ENGINE_BEHAVIOUR];

  // Look for low/zero speed and standstill activity
  const stoppedPoints = points.filter((p) =>
    (p.speedKmh !== null && p.speedKmh <= 1) ||
    (p.activity || '').toLowerCase().includes('standstill') ||
    (p.activity || '').toLowerCase().includes('rest') ||
    (p.activity || '').toLowerCase().includes('stop')
  );

  if (stoppedPoints.length === 0) {
    return {
      dimension: ConfidenceDimension.STOP_ENGINE_BEHAVIOUR,
      maxPoints: maxPts,
      awardedPoints: 0,
      sourceValue: '0 stopped points',
      normalisedValue: '',
      rule: 'Look for zero speed or standstill activity',
      result: 'FAIL',
      explanation: 'No stationary/stopped points detected in the time window.',
    };
  }

  // Check duration of stop
  const awarded = stoppedPoints.length >= 2 ? maxPts : Math.round(maxPts * 0.7);
  const firstStop = stoppedPoints[0];
  return {
    dimension: ConfidenceDimension.STOP_ENGINE_BEHAVIOUR,
    maxPoints: maxPts,
    awardedPoints: awarded,
    sourceValue: `${stoppedPoints.length} stopped points`,
    normalisedValue: firstStop ? firstStop.activity || 'stationary' : 'stationary',
    rule: 'Expect vehicle to be stopped during refuelling',
    result: stoppedPoints.length >= 2 ? 'PASS' : 'PARTIAL',
    explanation: `${stoppedPoints.length} telematics point(s) show vehicle stationary/at rest.`,
  };
}

function assessVolumeConsistency(
  tx: CanonicalTransaction,
  points: CanonicalTelematicsPoint[],
  config: TelematicsConfig,
  sensorCeilingReached?: boolean,
  observedIncreasePercent?: number
): TelematicsFactorResult {
  const maxPts = config.weights[ConfidenceDimension.VOLUME_CONSISTENCY];

  // Skip non-fuel
  if (tx.productType !== ProductType.DIESEL && tx.productType !== ProductType.GNR) {
    return {
      dimension: ConfidenceDimension.VOLUME_CONSISTENCY,
      maxPoints: maxPts,
      awardedPoints: 0,
      sourceValue: tx.productType,
      normalisedValue: '',
      rule: 'Volume consistency only for fuel products',
      result: 'SKIP',
      explanation: 'Volume consistency check skipped for non-diesel product.',
    };
  }

  // Use default 1200L tank if no vehicle-specific config
  const tankCapacity = 1200;
  const litres = parseFloat(tx.quantity || '0');
  if (litres <= 0) {
    return {
      dimension: ConfidenceDimension.VOLUME_CONSISTENCY,
      maxPoints: maxPts,
      awardedPoints: 0,
      sourceValue: tx.quantity,
      normalisedValue: '',
      rule: 'Quantity must be positive',
      result: 'SKIP',
      explanation: 'Transaction quantity is zero or negative.',
    };
  }

  const expectedPercentIncrease = (litres / tankCapacity) * 100;
  const isPlausible = litres <= tankCapacity;

  let awarded = isPlausible ? maxPts : 0;
  let explanation = '';
  let result: 'PASS' | 'PARTIAL' | 'FAIL' = isPlausible ? 'PASS' : 'FAIL';

  if (sensorCeilingReached && isPlausible) {
    explanation = `${litres}L is plausible; sensor reached 100% ceiling. Expected ${expectedPercentIncrease.toFixed(1)}% fill vs observed ${observedIncreasePercent?.toFixed(1)}% (capped).`;
  } else if (isPlausible) {
    explanation = `${litres}L is plausible for a ${tankCapacity}L tank (${expectedPercentIncrease.toFixed(1)}% fill).`;
  } else {
    explanation = `${litres}L exceeds tank capacity of ${tankCapacity}L.`;
  }

  return {
    dimension: ConfidenceDimension.VOLUME_CONSISTENCY,
    maxPoints: maxPts,
    awardedPoints: awarded,
    sourceValue: `${litres}L`,
    normalisedValue: `${expectedPercentIncrease.toFixed(1)}% of ${tankCapacity}L tank`,
    rule: `Volume must not exceed tank capacity (${tankCapacity}L default)`,
    result,
    explanation,
  };
}

function assessOdometerConsistency(
  tx: CanonicalTransaction,
  points: CanonicalTelematicsPoint[]
): TelematicsFactorResult {
  const maxPts = 5; // Odometer consistency weight

  const txMileage = parseFloat(tx.mileage || '0');
  if (txMileage <= 0) {
    return {
      dimension: ConfidenceDimension.ODOMETER_CONSISTENCY,
      maxPoints: maxPts,
      awardedPoints: 0,
      sourceValue: '0',
      normalisedValue: '',
      rule: 'Compare transaction mileage to telematics odometer',
      result: 'SKIP',
      explanation: 'No mileage recorded on transaction.',
    };
  }

  const withOdometer = points.filter((p) => p.odometerKm !== null && p.odometerKm > 0);
  if (withOdometer.length === 0) {
    return {
      dimension: ConfidenceDimension.ODOMETER_CONSISTENCY,
      maxPoints: maxPts,
      awardedPoints: 0,
      sourceValue: `tx: ${txMileage}`,
      normalisedValue: '',
      rule: 'Compare transaction mileage to telematics odometer',
      result: 'SKIP',
      explanation: 'No odometer readings in telematics data.',
    };
  }

  // Find closest odometer reading
  const closest = withOdometer[Math.floor(withOdometer.length / 2)];
  if (!closest) {
    return {
      dimension: ConfidenceDimension.ODOMETER_CONSISTENCY,
      maxPoints: maxPts,
      awardedPoints: 0,
      sourceValue: `tx: ${txMileage}`,
      normalisedValue: '',
      rule: 'Compare transaction mileage to telematics odometer',
      result: 'SKIP',
      explanation: 'No odometer reading available.',
    };
  }
  const diff = Math.abs(txMileage - closest.odometerKm!);
  const isConsistent = diff < 500; // Allow up to 500km difference

  return {
    dimension: ConfidenceDimension.ODOMETER_CONSISTENCY,
    maxPoints: maxPts,
    awardedPoints: isConsistent ? maxPts : Math.round(maxPts * 0.3),
    sourceValue: `tx: ${txMileage}`,
    normalisedValue: `gps: ${closest.odometerKm}`,
    rule: 'Odometer difference should be <500km (data quality indicator)',
    result: isConsistent ? 'PASS' : 'PARTIAL',
    explanation: `Transaction mileage ${txMileage}km vs telematics ${closest.odometerKm}km (diff: ${diff}km). ` +
      (isConsistent ? 'Consistent.' : 'Discrepancy treated as data quality warning, not fraud indicator.'),
  };
}

// ─── Helper ────────────────────────────────────────────────────────────────────

function makeInsufficientResult(
  tx: CanonicalTransaction,
  config: TelematicsConfig,
  reason: string
): TelematicsAssessment {
  return {
    transactionId: tx.id,
    classification: TelematicsClassification.INSUFFICIENT_EVIDENCE,
    totalScore: 0,
    factors: Object.values(ConfidenceDimension).map((dim) => ({
      dimension: dim,
      maxPoints: config.weights[dim],
      awardedPoints: 0,
      sourceValue: '',
      normalisedValue: '',
      rule: '',
      result: 'SKIP' as const,
      explanation: reason,
    })),
    sessionId: null,
    assessedAt: new Date().toISOString(),
    configSnapshot: config,
  };
}
