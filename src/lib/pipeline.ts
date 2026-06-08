import { db } from './db';
import { runReconciliation } from '@/domain/reconciliation/matching-engine';
import { assessPeriodAlignment } from '@/domain/reconciliation/period-alignment';
import { assessTransaction } from '@/domain/telematics/telematics-scorer';
import { ReconciliationStatus, TelematicsClassification, ProductType } from '@/domain/types';

export function runFullPipeline() {
  const transactions = db.select('transactions');
  const invoiceRows = db.select('invoice_transactions');
  const points = db.select('telematics_points');
  const stations = db.select('stations');

  if (transactions.length === 0 && invoiceRows.length === 0) {
    return null;
  }

  // Calculate Date Ranges
  const getMinMaxDates = (dates: string[]) => {
    const valid = dates.filter(Boolean).sort();
    if (valid.length === 0) return null;
    return { earliest: valid[0]!, latest: valid[valid.length - 1]! };
  };

  const txDateRange = getMinMaxDates(transactions.map((t) => t.transactionDate));
  const invDateRange = getMinMaxDates(invoiceRows.map((i) => i.transactionDate));

  // Assess Period Alignment
  const alignment = assessPeriodAlignment(txDateRange, invDateRange);

  // Run matching engine
  const config = {
    quantityToleranceLitres: '0.02',
    dateToleranceDays: 2,
    amountTolerancePercent: '1.0',
    enableCrossMidnight: true,
    enableCardAliasMatching: true,
    enableVehicleAliasMatching: true,
    enableStationCodeMatching: true,
    maxMatchingStages: 9,
  };

  const reconRun = runReconciliation(transactions, invoiceRows, alignment, config);

  // For each match, evaluate telematics and reasoning ledger
  const enrichedMatches = reconRun.matches.map((match) => {
    const tx = transactions.find((t) => t.id === match.transactionId);
    if (!tx) return match;

    const station = stations.find(
      (s) => s.stationCodeNormalised === tx.stationNumberNormalised
    ) || null;

    // Assess Telematics
    const telematics = assessTransaction(tx, points, station);

    // Save reasoning ledgers for this match
    const ledgerEntries = telematics.factors.map((factor) => {
      const ledgerEntry = {
        id: crypto.randomUUID(),
        match_id: match.id,
        transaction_id: tx.id,
        factor: factor.dimension,
        raw_value: String(factor.sourceValue || ''),
        normalised_value: String(factor.normalisedValue || ''),
        rule_applied: factor.rule,
        max_points: factor.maxPoints,
        awarded_points: factor.awardedPoints,
        supporting_evidence: factor.result === 'PASS' ? factor.explanation : '',
        contradictory_evidence: factor.result === 'FAIL' ? factor.explanation : '',
        missing_evidence: factor.result === 'SKIP' ? factor.explanation : '',
        rule_set_version: '1.0.0',
        final_score: telematics.totalScore,
        classification: telematics.classification,
        timezone_applied: 'UTC',
        tolerance_applied: '2 hours',
      };
      // Write to db cache directly or collect to bulk insert
      return ledgerEntry;
    });

    // Write ledgers to db
    db.insertMany('reasoning_ledgers', ledgerEntries);

    // Update match with telematics assessment
    return {
      ...match,
      telematicsAssessment: {
        classification: telematics.classification,
        totalScore: telematics.totalScore,
        assessedAt: telematics.assessedAt,
      },
    };
  });

  // Re-calculate statistics by telematics
  const finalMatches = enrichedMatches.map((m) => {
    // If exact match but telematics fails, mark as TELEMATICS_UNLIKELY, etc.
    let status = m.status;
    if (m.telematicsAssessment) {
      if (m.telematicsAssessment.classification === TelematicsClassification.VERIFIED ||
          m.telematicsAssessment.classification === TelematicsClassification.LIKELY) {
        status = ReconciliationStatus.TELEMATICS_VERIFIED;
      } else if (m.telematicsAssessment.classification === TelematicsClassification.UNLIKELY) {
        status = ReconciliationStatus.TELEMATICS_UNLIKELY;
      } else if (m.telematicsAssessment.classification === TelematicsClassification.INSUFFICIENT_EVIDENCE) {
        status = ReconciliationStatus.NO_TELEMATICS;
      }
    }

    // Apply period mismatch check if alignment blocksAllClear
    if (alignment.blocksAllClear && status !== ReconciliationStatus.DECLINED) {
      status = ReconciliationStatus.PERIOD_MISMATCH;
    }

    return { ...m, status };
  });

  // Clear previous runs and matches for this period
  db.truncate('reconciliation_runs');
  db.truncate('reconciliation_matches');
  db.truncate('reasoning_ledgers');

  // Insert new run
  const runRow = {
    id: reconRun.id,
    period_start: alignment.transactionDateRange.earliest,
    period_end: alignment.transactionDateRange.latest,
    run_date: new Date().toISOString(),
    run_by: 'e5c1a7b0-84a2-4a1e-84b2-9a7e8a9f0b12',
    status: alignment.blocksAllClear ? 'period_mismatch' : 'completed',
    matched_count: reconRun.statistics.matchedCount,
    total_count: reconRun.statistics.totalTransactions,
    match_rate: reconRun.statistics.matchRate,
    total_discrepancy: '0.00',
  };

  db.insert('reconciliation_runs', runRow);

  const matchesWithRunId = finalMatches.map((m) => ({
    ...m,
    run_id: reconRun.id,
  }));
  db.insertMany('reconciliation_matches', matchesWithRunId);

  return {
    run: runRow,
    matches: matchesWithRunId,
    alignment,
  };
}
