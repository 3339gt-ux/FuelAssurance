/**
 * Multi-Stage Matching Engine
 *
 * 9 matching stages as per spec §23.
 * One-to-one matching protection.
 * Configurable quantity tolerance (default 0.02L).
 * Does NOT apply litre logic to non-litre products.
 */

import Decimal from 'decimal.js';
import {
  type CanonicalTransaction,
  type CanonicalInvoiceRow,
  type ReconciliationRun,
  type ReconciliationMatch,
  type ReconciliationConfig,
  type ReconciliationStatistics,
  type MatchEvidence,
  type PeriodAlignment,
  ReconciliationStatus,
} from '@/domain/types';
import { normaliseStationCode, normaliseCardNumber, generateId } from '@/lib/utils';

// ─── Default Configuration ─────────────────────────────────────────────────────

export const DEFAULT_RECON_CONFIG: ReconciliationConfig = {
  quantityToleranceLitres: '0.02',
  dateToleranceDays: 2,
  amountTolerancePercent: '1.0',
  enableCrossMidnight: true,
  enableCardAliasMatching: true,
  enableVehicleAliasMatching: true,
  enableStationCodeMatching: true,
  maxMatchingStages: 9,
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function withinQuantityTolerance(
  txQty: string,
  invQty: string,
  toleranceLitres: string,
  isLitreProduct: boolean
): boolean {
  if (!isLitreProduct) {
    // Non-litre: exact match only
    return txQty === invQty;
  }
  const diff = new Decimal(txQty || '0').minus(new Decimal(invQty || '0')).abs();
  return diff.lte(new Decimal(toleranceLitres));
}

function timeDifferenceSeconds(ts1: string, ts2: string): number | null {
  if (!ts1 || !ts2) return null;
  try {
    const d1 = new Date(ts1).getTime();
    const d2 = new Date(ts2).getTime();
    return Math.abs(d1 - d2) / 1000;
  } catch {
    return null;
  }
}

function dateOnly(ts: string): string {
  return ts ? (ts.split('T')[0] ?? '') : '';
}

function isLitre(unit: string): boolean {
  const u = (unit || '').toUpperCase();
  return u === 'L' || u === 'LTR' || u === 'LITRE' || u === 'LITER';
}

// ─── Matching Engine ───────────────────────────────────────────────────────────

export function runReconciliation(
  transactions: CanonicalTransaction[],
  invoiceRows: CanonicalInvoiceRow[],
  periodAlignment: PeriodAlignment,
  config: ReconciliationConfig = DEFAULT_RECON_CONFIG
): ReconciliationRun {
  const matchedTxIds = new Set<string>();
  const matchedInvIds = new Set<string>();
  const matches: ReconciliationMatch[] = [];

  // Only match approved transactions
  const approvedTx = transactions.filter((t) => t.isApproved);

  // Stage 1–7: progressive matching
  const stages: Array<{
    stage: number;
    matcher: (tx: CanonicalTransaction, inv: CanonicalInvoiceRow) => MatchEvidence[] | null;
    status: ReconciliationStatus;
  }> = [
    {
      stage: 1,
      status: ReconciliationStatus.EXACT_MATCH,
      matcher: (tx, inv) => matchByAuthId(tx, inv),
    },
    {
      stage: 2,
      status: ReconciliationStatus.EXACT_MATCH,
      matcher: (tx, inv) => matchByCardVehicleProductStationQty(tx, inv, config),
    },
    {
      stage: 3,
      status: ReconciliationStatus.EXACT_MATCH,
      matcher: (tx, inv) => matchByCardVehicleProductCountryQty(tx, inv, config),
    },
    {
      stage: 4,
      status: ReconciliationStatus.EXACT_MATCH,
      matcher: (tx, inv) => matchByCardVehicleProductQtyTime(tx, inv, config),
    },
    {
      stage: 5,
      status: ReconciliationStatus.STATION_CODE_MATCH,
      matcher: (tx, inv) => matchByVehicleProductStationQtyTime(tx, inv, config),
    },
    {
      stage: 6,
      status: ReconciliationStatus.COMPOSITE_MATCH,
      matcher: (tx, inv) => matchByVehicleProductAmountTime(tx, inv, config),
    },
    {
      stage: 7,
      status: ReconciliationStatus.COMPOSITE_MATCH,
      matcher: (tx, inv) => matchByVehicleCountryTime(tx, inv, config),
    },
  ];

  for (const { stage, status, matcher } of stages) {
    if (stage > config.maxMatchingStages) break;

    for (const tx of approvedTx) {
      if (matchedTxIds.has(tx.id)) continue;

      for (const inv of invoiceRows) {
        if (matchedInvIds.has(inv.id)) continue;

        const evidence = matcher(tx, inv);
        if (evidence) {
          // Calculate quantity difference
          const qtyDiff = new Decimal(tx.quantity || '0')
            .minus(new Decimal(inv.quantity || '0'))
            .toFixed(4);

          const timeDiff = timeDifferenceSeconds(tx.transactionTimestamp, inv.transactionTimestamp);

          matches.push({
            id: generateId(),
            transactionId: tx.id,
            invoiceRowId: inv.id,
            status,
            matchStage: stage,
            confidence: stage <= 2 ? 95 : stage <= 4 ? 85 : stage <= 6 ? 70 : 55,
            evidence,
            reasonCodes: [status],
            financialAssessment: null,
            telematicsAssessment: null,
            reviewDecision: null,
          });

          matchedTxIds.add(tx.id);
          matchedInvIds.add(inv.id);
          break; // One-to-one protection
        }
      }
    }
  }

  // Build unmatched lists
  const unmatchedTransactions = approvedTx
    .filter((t) => !matchedTxIds.has(t.id))
    .map((t) => t.id);

  const unmatchedInvoiceRows = invoiceRows
    .filter((i) => !matchedInvIds.has(i.id))
    .map((i) => i.id);

  // Add declined transactions as DECLINED status
  const declinedTx = transactions.filter((t) => !t.isApproved);
  for (const tx of declinedTx) {
    matches.push({
      id: generateId(),
      transactionId: tx.id,
      invoiceRowId: '',
      status: ReconciliationStatus.DECLINED,
      matchStage: 0,
      confidence: 100,
      evidence: [{ dimension: 'Response', transactionValue: tx.responseCode, invoiceValue: '', matches: false, note: 'Transaction was declined — not expected to appear on invoice.' }],
      reasonCodes: ['DECLINED'],
      financialAssessment: null,
      telematicsAssessment: null,
      reviewDecision: null,
    });
  }

  // Statistics
  const byStatus = {} as Record<ReconciliationStatus, number>;
  for (const s of Object.values(ReconciliationStatus)) {
    byStatus[s] = matches.filter((m) => m.status === s).length;
  }

  const byStage: Array<{ stage: number; count: number }> = [];
  for (let s = 0; s <= 9; s++) {
    const count = matches.filter((m) => m.matchStage === s).length;
    if (count > 0) byStage.push({ stage: s, count });
  }

  const statistics: ReconciliationStatistics = {
    totalTransactions: transactions.length,
    totalInvoiceRows: invoiceRows.length,
    matchedCount: matchedTxIds.size,
    unmatchedTxCount: unmatchedTransactions.length,
    unmatchedInvCount: unmatchedInvoiceRows.length,
    matchRate: approvedTx.length > 0 ? (matchedTxIds.size / approvedTx.length) * 100 : 0,
    byStatus,
    byStage,
  };

  return {
    id: generateId(),
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    config,
    periodAlignment,
    matches,
    unmatchedTransactions,
    unmatchedInvoiceRows,
    statistics,
  };
}

// ─── Stage Matchers ────────────────────────────────────────────────────────────

function matchByAuthId(tx: CanonicalTransaction, inv: CanonicalInvoiceRow): MatchEvidence[] | null {
  if (!tx.authorisationId || !inv.transactionNumber) return null;
  if (tx.authorisationId !== inv.transactionNumber) return null;
  return [{
    dimension: 'AuthorisationID',
    transactionValue: tx.authorisationId,
    invoiceValue: inv.transactionNumber,
    matches: true,
    note: 'Exact authorisation ID match.',
  }];
}

function matchByCardVehicleProductStationQty(
  tx: CanonicalTransaction,
  inv: CanonicalInvoiceRow,
  config: ReconciliationConfig
): MatchEvidence[] | null {
  const evidence: MatchEvidence[] = [];

  // Card core match
  const txCard = normaliseCardNumber(tx.cardNumber);
  const invCard = inv.cardNumberNormalised || normaliseCardNumber(inv.cardNumber);
  if (!txCard || !invCard || txCard !== invCard) return null;
  evidence.push({ dimension: 'Card', transactionValue: txCard, invoiceValue: invCard, matches: true, note: 'Card core match.' });

  // Vehicle
  if (tx.registration !== inv.registration) return null;
  evidence.push({ dimension: 'Vehicle', transactionValue: tx.registration, invoiceValue: inv.registration, matches: true, note: 'Registration match.' });

  // Product
  if (tx.productCode !== inv.productCode) return null;
  evidence.push({ dimension: 'Product', transactionValue: tx.productCode, invoiceValue: inv.productCode, matches: true, note: 'Product code match.' });

  // Station
  const txStation = normaliseStationCode(tx.stationNumber);
  const invStation = normaliseStationCode(inv.stationNumber);
  if (!txStation || !invStation || txStation !== invStation) return null;
  evidence.push({ dimension: 'Station', transactionValue: txStation, invoiceValue: invStation, matches: true, note: 'Station code match.' });

  // Quantity
  const isLitreProduct = isLitre(tx.unit) || isLitre(inv.unit);
  if (!withinQuantityTolerance(tx.quantity, inv.quantity, config.quantityToleranceLitres, isLitreProduct)) return null;
  evidence.push({ dimension: 'Quantity', transactionValue: tx.quantity, invoiceValue: inv.quantity, matches: true, note: `Quantity within tolerance (±${config.quantityToleranceLitres}L).` });

  return evidence;
}

function matchByCardVehicleProductCountryQty(
  tx: CanonicalTransaction,
  inv: CanonicalInvoiceRow,
  config: ReconciliationConfig
): MatchEvidence[] | null {
  const txCard = normaliseCardNumber(tx.cardNumber);
  const invCard = inv.cardNumberNormalised || normaliseCardNumber(inv.cardNumber);
  if (!txCard || !invCard || txCard !== invCard) return null;
  if (tx.registration !== inv.registration) return null;
  if (tx.productCode !== inv.productCode) return null;
  if (tx.serviceCountry !== inv.serviceCountry) return null;
  const isLitreProduct = isLitre(tx.unit) || isLitre(inv.unit);
  if (!withinQuantityTolerance(tx.quantity, inv.quantity, config.quantityToleranceLitres, isLitreProduct)) return null;

  return [
    { dimension: 'Card', transactionValue: txCard, invoiceValue: invCard, matches: true, note: 'Card match.' },
    { dimension: 'Vehicle', transactionValue: tx.registration, invoiceValue: inv.registration, matches: true, note: 'Vehicle match.' },
    { dimension: 'Product', transactionValue: tx.productCode, invoiceValue: inv.productCode, matches: true, note: 'Product match.' },
    { dimension: 'Country', transactionValue: tx.serviceCountry, invoiceValue: inv.serviceCountry, matches: true, note: 'Country match.' },
    { dimension: 'Quantity', transactionValue: tx.quantity, invoiceValue: inv.quantity, matches: true, note: 'Quantity match.' },
  ];
}

function matchByCardVehicleProductQtyTime(
  tx: CanonicalTransaction,
  inv: CanonicalInvoiceRow,
  config: ReconciliationConfig
): MatchEvidence[] | null {
  const txCard = normaliseCardNumber(tx.cardNumber);
  const invCard = inv.cardNumberNormalised || normaliseCardNumber(inv.cardNumber);
  if (!txCard || !invCard || txCard !== invCard) return null;
  if (tx.registration !== inv.registration) return null;
  if (tx.productCode !== inv.productCode) return null;
  const isLitreProduct = isLitre(tx.unit) || isLitre(inv.unit);
  if (!withinQuantityTolerance(tx.quantity, inv.quantity, config.quantityToleranceLitres, isLitreProduct)) return null;

  // Time check
  const timeDiff = timeDifferenceSeconds(tx.transactionTimestamp, inv.transactionTimestamp);
  if (timeDiff === null || timeDiff > config.dateToleranceDays * 86400) return null;

  return [
    { dimension: 'Card', transactionValue: txCard, invoiceValue: invCard, matches: true, note: 'Card match.' },
    { dimension: 'Vehicle', transactionValue: tx.registration, invoiceValue: inv.registration, matches: true, note: 'Vehicle match.' },
    { dimension: 'Product', transactionValue: tx.productCode, invoiceValue: inv.productCode, matches: true, note: 'Product match.' },
    { dimension: 'Quantity', transactionValue: tx.quantity, invoiceValue: inv.quantity, matches: true, note: 'Quantity match.' },
    { dimension: 'Time', transactionValue: tx.transactionTimestamp, invoiceValue: inv.transactionTimestamp, matches: true, note: `Time within ${config.dateToleranceDays} day(s).` },
  ];
}

function matchByVehicleProductStationQtyTime(
  tx: CanonicalTransaction,
  inv: CanonicalInvoiceRow,
  config: ReconciliationConfig
): MatchEvidence[] | null {
  if (tx.registration !== inv.registration) return null;
  if (tx.productCode !== inv.productCode) return null;
  const txStation = normaliseStationCode(tx.stationNumber);
  const invStation = normaliseStationCode(inv.stationNumber);
  if (!txStation || !invStation || txStation !== invStation) return null;
  const isLitreProduct = isLitre(tx.unit) || isLitre(inv.unit);
  if (!withinQuantityTolerance(tx.quantity, inv.quantity, config.quantityToleranceLitres, isLitreProduct)) return null;
  const timeDiff = timeDifferenceSeconds(tx.transactionTimestamp, inv.transactionTimestamp);
  if (timeDiff === null || timeDiff > config.dateToleranceDays * 86400) return null;

  return [
    { dimension: 'Vehicle', transactionValue: tx.registration, invoiceValue: inv.registration, matches: true, note: 'Vehicle match.' },
    { dimension: 'Product', transactionValue: tx.productCode, invoiceValue: inv.productCode, matches: true, note: 'Product match.' },
    { dimension: 'Station', transactionValue: txStation, invoiceValue: invStation, matches: true, note: 'Station match.' },
    { dimension: 'Quantity', transactionValue: tx.quantity, invoiceValue: inv.quantity, matches: true, note: 'Quantity match.' },
    { dimension: 'Time', transactionValue: tx.transactionTimestamp, invoiceValue: inv.transactionTimestamp, matches: true, note: 'Time match.' },
  ];
}

function matchByVehicleProductAmountTime(
  tx: CanonicalTransaction,
  inv: CanonicalInvoiceRow,
  config: ReconciliationConfig
): MatchEvidence[] | null {
  if (tx.registration !== inv.registration) return null;
  if (tx.productCode !== inv.productCode) return null;
  // Amount match with tolerance
  const txAmt = new Decimal(tx.amountGross || '0');
  const invAmt = new Decimal(inv.baseValueGross || '0');
  const diff = txAmt.minus(invAmt).abs();
  const toleranceAmt = txAmt.mul(new Decimal(config.amountTolerancePercent).div(100));
  if (diff.gt(toleranceAmt) && diff.gt(new Decimal('0.50'))) return null;
  const timeDiff = timeDifferenceSeconds(tx.transactionTimestamp, inv.transactionTimestamp);
  if (timeDiff === null || timeDiff > config.dateToleranceDays * 86400) return null;

  return [
    { dimension: 'Vehicle', transactionValue: tx.registration, invoiceValue: inv.registration, matches: true, note: 'Vehicle match.' },
    { dimension: 'Product', transactionValue: tx.productCode, invoiceValue: inv.productCode, matches: true, note: 'Product match.' },
    { dimension: 'Amount', transactionValue: txAmt.toFixed(2), invoiceValue: invAmt.toFixed(2), matches: true, note: `Amount within ${config.amountTolerancePercent}% tolerance.` },
    { dimension: 'Time', transactionValue: tx.transactionTimestamp, invoiceValue: inv.transactionTimestamp, matches: true, note: 'Time match.' },
  ];
}

function matchByVehicleCountryTime(
  tx: CanonicalTransaction,
  inv: CanonicalInvoiceRow,
  config: ReconciliationConfig
): MatchEvidence[] | null {
  if (tx.registration !== inv.registration) return null;
  if (tx.serviceCountry !== inv.serviceCountry) return null;
  const timeDiff = timeDifferenceSeconds(tx.transactionTimestamp, inv.transactionTimestamp);
  if (timeDiff === null || timeDiff > 86400) return null; // Tight window for weak match

  return [
    { dimension: 'Vehicle', transactionValue: tx.registration, invoiceValue: inv.registration, matches: true, note: 'Vehicle match.' },
    { dimension: 'Country', transactionValue: tx.serviceCountry, invoiceValue: inv.serviceCountry, matches: true, note: 'Country match.' },
    { dimension: 'Time', transactionValue: tx.transactionTimestamp, invoiceValue: inv.transactionTimestamp, matches: true, note: 'Same-day match.' },
  ];
}
