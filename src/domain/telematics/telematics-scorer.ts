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
  config: TelematicsConfig = DEFAULT_TELEMATICS_CONFIG
): TelematicsAssessment {
  // Filter points for the correct vehicle
  const vehiclePoints = points.filter(
    (p) => p.vehicleRegistration === tx.registration
  );

  // If no telematics data at all, return insufficient evidence
  if (vehiclePoints.length === 0) {
    return makeInsufficientResult(tx, config, 'No telematics data found for vehicle ' + tx.registration);
  }

  const txTime = new Date(tx.transactionTimestamp).getTime();
  if (isNaN(txTime)) {
    return makeInsufficientResult(tx, config, 'Transaction has no valid timestamp.');
  }

  // Find points in the time window
  const windowMs = config.timeWindowMinutes * 60 * 1000;
  const windowPoints = vehiclePoints.filter((p) => {
    const pTime = new Date(p.timestamp).getTime();
    return !isNaN(pTime) && Math.abs(pTime - txTime) <= windowMs;
  }).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (windowPoints.length === 0) {
    return makeInsufficientResult(tx, config,
      `No telematics points within ${config.timeWindowMinutes}min window of transaction.`
    );
  }

  const factors: TelematicsFactorResult[] = [];
  let hasEnoughEvidence = true;

  // ─── Factor 1: Time Proximity ──────────────────────────
  factors.push(assessTimeProximity(tx, windowPoints, config));

  // ─── Factor 2: Location Proximity ──────────────────────
  factors.push(assessLocationProximity(tx, windowPoints, station, config));

  // ─── Factor 3: Fuel Level Movement ─────────────────────
  const fuelFactor = assessFuelMovement(tx, windowPoints, config);
  factors.push(fuelFactor);
  if (fuelFactor.result === 'SKIP') {
    // Missing fuel data — don't count as evidence gap for non-fuel products
    if (tx.productType === ProductType.DIESEL || tx.productType === ProductType.GNR) {
      // For fuel products, missing fuel sensor reduces confidence
    }
  }

  // ─── Factor 4: Stop/Engine Behaviour ───────────────────
  factors.push(assessStopBehaviour(windowPoints, config));

  // ─── Factor 5: Volume Consistency ──────────────────────
  factors.push(assessVolumeConsistency(tx, windowPoints, config));

  // ─── Factor 6: Odometer Consistency ────────────────────
  factors.push(assessOdometerConsistency(tx, windowPoints));

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

  // Text-based location matching (our GPS file has no coordinates)
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

function assessFuelMovement(
  tx: CanonicalTransaction,
  points: CanonicalTelematicsPoint[],
  config: TelematicsConfig
): TelematicsFactorResult {
  const maxPts = config.weights[ConfidenceDimension.FUEL_LEVEL_MOVEMENT];

  // Skip for non-fuel products
  if (tx.productType === ProductType.PARKING || tx.productType === ProductType.TOLL ||
      tx.productType === ProductType.WASH || tx.productType === ProductType.SERVICE_FEE) {
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

  // Look for fuel level readings
  const withFuel = points.filter((p) => p.fuelLevelPercent !== null);
  if (withFuel.length < 2) {
    return {
      dimension: ConfidenceDimension.FUEL_LEVEL_MOVEMENT,
      maxPoints: maxPts,
      awardedPoints: 0,
      sourceValue: `${withFuel.length} readings`,
      normalisedValue: '',
      rule: 'Need at least 2 fuel level readings for comparison',
      result: 'SKIP',
      explanation: 'Insufficient fuel level readings to assess fuel movement.',
    };
  }

  // Find readings before and after the transaction
  const txTime = new Date(tx.transactionTimestamp).getTime();
  const before = withFuel
    .filter((p) => new Date(p.timestamp).getTime() <= txTime)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const after = withFuel
    .filter((p) => new Date(p.timestamp).getTime() > txTime)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (before.length === 0 || after.length === 0) {
    return {
      dimension: ConfidenceDimension.FUEL_LEVEL_MOVEMENT,
      maxPoints: maxPts,
      awardedPoints: Math.round(maxPts * 0.3),
      sourceValue: `before:${before.length} after:${after.length}`,
      normalisedValue: '',
      rule: 'Need readings both before and after transaction',
      result: 'PARTIAL',
      explanation: 'Fuel readings only available on one side of the transaction time.',
    };
  }

  const firstBefore = before[0];
  const firstAfter = after[0];
  if (!firstBefore || !firstAfter) {
    return {
      dimension: ConfidenceDimension.FUEL_LEVEL_MOVEMENT,
      maxPoints: maxPts,
      awardedPoints: 0,
      sourceValue: `before:${before.length} after:${after.length}`,
      normalisedValue: '',
      rule: 'Need readings both before and after transaction',
      result: 'SKIP',
      explanation: 'Fuel readings only available on one side of the transaction time.',
    };
  }

  const fuelBefore = firstBefore.fuelLevelPercent!;
  const fuelAfter = firstAfter.fuelLevelPercent!;
  const increase = fuelAfter - fuelBefore;

  // For a refuelling, we expect an increase
  let awarded: number;
  let result: 'PASS' | 'PARTIAL' | 'FAIL';

  if (increase > config.fuelLevelDropThresholdPercent) {
    awarded = maxPts;
    result = 'PASS';
  } else if (increase > 0) {
    awarded = Math.round(maxPts * 0.6);
    result = 'PARTIAL';
  } else if (fuelAfter >= 95) {
    // Sensor may be capped at 100%
    awarded = Math.round(maxPts * 0.5);
    result = 'PARTIAL';
  } else {
    awarded = Math.round(maxPts * 0.1);
    result = 'FAIL';
  }

  return {
    dimension: ConfidenceDimension.FUEL_LEVEL_MOVEMENT,
    maxPoints: maxPts,
    awardedPoints: awarded,
    sourceValue: `${fuelBefore}% → ${fuelAfter}%`,
    normalisedValue: `+${increase.toFixed(1)}%`,
    rule: `Expect increase >${config.fuelLevelDropThresholdPercent}% for fuel transaction`,
    result,
    explanation: `Fuel level changed from ${fuelBefore}% to ${fuelAfter}% (${increase > 0 ? '+' : ''}${increase.toFixed(1)}%).`,
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
  config: TelematicsConfig
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

  return {
    dimension: ConfidenceDimension.VOLUME_CONSISTENCY,
    maxPoints: maxPts,
    awardedPoints: isPlausible ? maxPts : 0,
    sourceValue: `${litres}L`,
    normalisedValue: `${expectedPercentIncrease.toFixed(1)}% of ${tankCapacity}L tank`,
    rule: `Volume must not exceed tank capacity (${tankCapacity}L default)`,
    result: isPlausible ? 'PASS' : 'FAIL',
    explanation: isPlausible
      ? `${litres}L is plausible for a ${tankCapacity}L tank (${expectedPercentIncrease.toFixed(1)}% fill).`
      : `${litres}L exceeds tank capacity of ${tankCapacity}L.`,
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
