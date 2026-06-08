/**
 * Financial Validation Engine
 *
 * Uses Decimal.js for all financial calculations.
 * Validates each invoice row's pricing, fees, discounts, VAT.
 * Never uses binary floating-point equality.
 */

import Decimal from 'decimal.js';
import {
  type CanonicalInvoiceRow,
  type FinancialAssessment,
  type FinancialVariance,
  type FinancialConfig,
  type StationPrice,
} from '@/domain/types';
import { generateId } from '@/lib/utils';

export const DEFAULT_FINANCIAL_CONFIG: FinancialConfig = {
  quantityPriceTolerancePercent: '0.5',
  vatTolerancePercent: '1.0',
  feeTolerancePercent: '2.0',
  discountTolerancePercent: '1.0',
  currencyConversionTolerancePercent: '2.0',
  roundingToleranceAbsolute: '0.02',
};

function d(val: string | number): Decimal {
  try {
    return new Decimal(val || 0);
  } catch {
    return new Decimal(0);
  }
}

function checkVariance(
  fieldName: string,
  sourceValue: string,
  expectedValue: string,
  formula: string,
  tolerancePercent: string,
  roundingTol: string
): FinancialVariance {
  const src = d(sourceValue);
  const exp = d(expectedValue);
  const diff = src.minus(exp).abs();

  // Within tolerance?
  const absTol = d(roundingTol);
  const percentTol = exp.abs().mul(d(tolerancePercent).div(100));
  const tolerance = Decimal.max(absTol, percentTol);
  const withinTolerance = diff.lte(tolerance);

  let reasonCode = '';
  let explanation = '';

  if (withinTolerance) {
    if (diff.isZero()) {
      reasonCode = 'EXACT';
      explanation = `${fieldName} matches exactly.`;
    } else {
      reasonCode = 'WITHIN_TOLERANCE';
      explanation = `${fieldName} differs by ${diff.toFixed(4)} — within tolerance of ${tolerance.toFixed(4)}.`;
    }
  } else {
    reasonCode = 'VARIANCE';
    explanation = `${fieldName} differs by ${diff.toFixed(4)} — exceeds tolerance of ${tolerance.toFixed(4)}.`;
  }

  return {
    field: fieldName,
    formula,
    sourceValue: src.toFixed(4),
    expectedValue: exp.toFixed(4),
    difference: diff.toFixed(4),
    toleranceApplied: tolerance.toFixed(4),
    withinTolerance,
    reasonCode,
    explanation,
  };
}

/**
 * Validate all financial fields on an invoice row.
 */
export function validateInvoiceRow(
  row: CanonicalInvoiceRow,
  stationPrice?: StationPrice | null,
  config: FinancialConfig = DEFAULT_FINANCIAL_CONFIG
): FinancialAssessment {
  const variances: FinancialVariance[] = [];
  const qty = d(row.quantity);
  const ppu = d(row.pricePerUnit);
  const ppuGross = d(row.pricePerUnitGross);
  const baseNet = d(row.baseValueNet);
  const baseGross = d(row.baseValueGross);
  const vat = d(row.vat);
  const serviceFee = d(row.serviceFeeNet);
  const purchaseNet = d(row.valueOfPurchaseNet);
  const discountNet = d(row.discountNet);
  const discountGross = d(row.discountGross);

  // 1. Quantity × Unit Price ≈ Base Value Net
  const expectedBaseNet = qty.mul(ppu);
  variances.push(checkVariance(
    'Base Value Net',
    row.baseValueNet,
    expectedBaseNet.toFixed(4),
    'Quantity × Price per unit',
    config.quantityPriceTolerancePercent,
    config.roundingToleranceAbsolute
  ));

  // 2. Base Net + VAT ≈ Base Gross
  const expectedBaseGross = baseNet.plus(vat);
  variances.push(checkVariance(
    'Base Value Gross',
    row.baseValueGross,
    expectedBaseGross.toFixed(4),
    'Base Value Net + VAT',
    config.vatTolerancePercent,
    config.roundingToleranceAbsolute
  ));

  // 3. Base Net + Service Fee - Discount ≈ Value of Purchase Net
  const expectedPurchaseNet = baseNet.plus(serviceFee).minus(discountNet.abs());
  variances.push(checkVariance(
    'Value of Purchase Net',
    row.valueOfPurchaseNet,
    expectedPurchaseNet.toFixed(4),
    'Base Value Net + Service Fee - |Discount Net|',
    config.feeTolerancePercent,
    config.roundingToleranceAbsolute
  ));

  // 4. Price per unit gross ≈ Price per unit + (VAT / Quantity)
  if (!qty.isZero()) {
    const expectedPPUGross = ppu.plus(vat.div(qty));
    variances.push(checkVariance(
      'Price per unit gross',
      row.pricePerUnitGross,
      expectedPPUGross.toFixed(4),
      'Price per unit + (VAT ÷ Quantity)',
      config.vatTolerancePercent,
      config.roundingToleranceAbsolute
    ));
  }

  // 5. Station price check (if available)
  if (stationPrice) {
    const expectedPrice = d(stationPrice.netCostPerLitre);
    variances.push(checkVariance(
      'Approved Station Price',
      row.pricePerUnit,
      expectedPrice.toFixed(4),
      'Station master net cost per litre',
      config.quantityPriceTolerancePercent,
      config.roundingToleranceAbsolute
    ));

    // Discount check
    if (stationPrice.discount && stationPrice.discount !== '0') {
      const expectedDiscount = qty.mul(d(stationPrice.discount)).abs();
      variances.push(checkVariance(
        'Expected Discount',
        discountNet.abs().toFixed(4),
        expectedDiscount.toFixed(4),
        'Quantity × Station discount rate',
        config.discountTolerancePercent,
        config.roundingToleranceAbsolute
      ));
    }
  }

  // Overall assessment
  const isValid = variances.every((v) => v.withinTolerance);
  const totalVariance = variances
    .filter((v) => !v.withinTolerance)
    .reduce((sum, v) => sum.plus(d(v.difference)), new Decimal(0));

  return {
    invoiceRowId: row.id,
    isValid,
    variances,
    totalVarianceNet: totalVariance.toFixed(4),
    checkedAt: new Date().toISOString(),
    configSnapshot: config,
  };
}
