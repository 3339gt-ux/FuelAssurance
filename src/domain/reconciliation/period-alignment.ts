/**
 * Period Alignment Checker
 *
 * Compares transaction and invoice date ranges to classify the period relationship.
 * Blocks all-clear when periods don't overlap.
 */

import {
  type PeriodAlignment,
  type DateRange,
  type InvoicePeriod,
  PeriodOverlap,
} from '@/domain/types';

/**
 * Assess the alignment between transaction and invoice date ranges.
 */
export function assessPeriodAlignment(
  txDateRange: DateRange | null,
  invDateRange: DateRange | null,
  userPeriod?: InvoicePeriod | null
): PeriodAlignment {
  const warnings: string[] = [];

  if (!txDateRange || !invDateRange) {
    return {
      transactionDateRange: txDateRange || { earliest: '', latest: '' },
      invoiceDateRange: invDateRange || { earliest: '', latest: '' },
      userPeriod: userPeriod || null,
      overlap: PeriodOverlap.UNKNOWN,
      overlapDays: 0,
      warnings: ['One or both date ranges could not be determined.'],
      blocksAllClear: true,
    };
  }

  // Calculate overlap
  const txStart = new Date(txDateRange.earliest);
  const txEnd = new Date(txDateRange.latest);
  const invStart = new Date(invDateRange.earliest);
  const invEnd = new Date(invDateRange.latest);

  const overlapStart = new Date(Math.max(txStart.getTime(), invStart.getTime()));
  const overlapEnd = new Date(Math.min(txEnd.getTime(), invEnd.getTime()));
  const overlapMs = overlapEnd.getTime() - overlapStart.getTime();
  const overlapDays = overlapMs > 0 ? Math.ceil(overlapMs / 86_400_000) : 0;

  const txDays = Math.ceil((txEnd.getTime() - txStart.getTime()) / 86_400_000) + 1;
  const invDays = Math.ceil((invEnd.getTime() - invStart.getTime()) / 86_400_000) + 1;

  let overlap: PeriodOverlap;
  let blocksAllClear = false;

  if (overlapDays <= 0) {
    overlap = PeriodOverlap.NO_OVERLAP;
    blocksAllClear = true;
    warnings.push(
      `Transaction period (${txDateRange.earliest} to ${txDateRange.latest}) does not overlap ` +
      `with invoice period (${invDateRange.earliest} to ${invDateRange.latest}). ` +
      `A complete reconciliation is not possible.`
    );
  } else if (overlapDays >= Math.min(txDays, invDays) * 0.9) {
    overlap = PeriodOverlap.FULL_OVERLAP;
  } else {
    overlap = PeriodOverlap.PARTIAL_OVERLAP;
    blocksAllClear = true;
    warnings.push(
      `Only ${overlapDays} day(s) of overlap between transaction and invoice periods. ` +
      `Results outside the overlap are partial.`
    );
  }

  // User-specified period validation
  if (userPeriod) {
    const userStart = new Date(userPeriod.startDate);
    const userEnd = new Date(userPeriod.endDate);

    if (userStart > txEnd || userEnd < txStart) {
      warnings.push('User-specified period does not overlap with transaction file dates.');
    }
    if (userStart > invEnd || userEnd < invStart) {
      warnings.push('User-specified period does not overlap with invoice file dates.');
    }
  }

  return {
    transactionDateRange: txDateRange,
    invoiceDateRange: invDateRange,
    userPeriod: userPeriod || null,
    overlap,
    overlapDays,
    warnings,
    blocksAllClear,
  };
}
