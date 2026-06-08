/**
 * Reasoning Ledger
 *
 * Creates an immutable, auditable ledger of every factor, evidence item,
 * and decision. Manual decisions preserve machine results.
 */

import {
  type ReasoningLedger,
  type ReasoningFactor,
  type EvidenceItem,
  type RuleSetVersion,
  type ReviewDecision,
  type MachineResult,
} from '@/domain/types';
import { generateId } from '@/lib/utils';

/**
 * Create a new reasoning ledger from computed factors.
 */
export function createLedger(
  entityType: 'MATCH' | 'TRANSACTION' | 'INVOICE_ROW',
  entityId: string,
  factors: ReasoningFactor[],
  ruleSetVersion: RuleSetVersion,
  supporting: EvidenceItem[] = [],
  contradictory: EvidenceItem[] = [],
  missing: string[] = []
): ReasoningLedger {
  // Calculate machine result
  const totalScore = factors.reduce((sum, f) => sum + f.awardedPoints, 0);
  const maxScore = factors
    .filter((f) => f.result !== 'SKIP' && f.result !== 'N_A')
    .reduce((sum, f) => sum + f.maxPoints, 0);

  const normalisedScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

  let classification: string;
  if (normalisedScore >= 85) classification = 'HIGH_CONFIDENCE';
  else if (normalisedScore >= 70) classification = 'MEDIUM_CONFIDENCE';
  else if (normalisedScore >= 45) classification = 'LOW_CONFIDENCE';
  else classification = 'VERY_LOW_CONFIDENCE';

  const machineResult: MachineResult = {
    totalScore,
    maxScore,
    classification,
    confidence: normalisedScore,
    generatedAt: new Date().toISOString(),
  };

  return {
    id: generateId(),
    entityType,
    entityId,
    factors,
    supportingEvidence: supporting,
    contradictoryEvidence: contradictory,
    missingEvidence: missing,
    ruleSetVersion,
    machineResult,
    manualDecision: null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Apply a manual review decision to a ledger, preserving the machine result.
 */
export function applyManualDecision(
  ledger: ReasoningLedger,
  decision: ReviewDecision
): ReasoningLedger {
  return {
    ...ledger,
    manualDecision: {
      ...decision,
      preserveMachineResult: true,
    },
  };
}

/**
 * Convert telematics factor results to reasoning factors.
 */
export function telematicsToReasoningFactors(
  factors: Array<{
    dimension: string;
    maxPoints: number;
    awardedPoints: number;
    sourceValue: string;
    normalisedValue: string;
    rule: string;
    result: string;
    explanation: string;
  }>
): ReasoningFactor[] {
  return factors.map((f) => ({
    factorName: f.dimension,
    sourceValue: f.sourceValue,
    normalisedValue: f.normalisedValue,
    rule: f.rule,
    maxPoints: f.maxPoints,
    awardedPoints: f.awardedPoints,
    result: f.result as ReasoningFactor['result'],
    explanation: f.explanation,
  }));
}

/**
 * Convert financial variances to reasoning factors.
 */
export function financialToReasoningFactors(
  variances: Array<{
    field: string;
    formula: string;
    sourceValue: string;
    expectedValue: string;
    difference: string;
    withinTolerance: boolean;
    explanation: string;
  }>
): ReasoningFactor[] {
  return variances.map((v) => ({
    factorName: v.field,
    sourceValue: v.sourceValue,
    normalisedValue: v.expectedValue,
    rule: v.formula,
    maxPoints: 10,
    awardedPoints: v.withinTolerance ? 10 : 0,
    result: v.withinTolerance ? ('PASS' as const) : ('FAIL' as const),
    explanation: v.explanation,
  }));
}
