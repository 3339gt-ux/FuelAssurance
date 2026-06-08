/**
 * DKV Transaction Parser
 *
 * Handles BOTH variants:
 *   Variant 1 (12 columns): Licence plate through Response
 *   Variant 2 (21 columns): Same 12 + Customer ID through Authorization ID
 *
 * Auto-detects variant by column count.
 * Converts Excel serial dates to ISO timestamps.
 * Distinguishes approved (APP) from declined responses.
 */

import {
  type RawDKVTransaction,
  type CanonicalTransaction,
  ProductType,
  CardProvider,
  TimestampPrecision,
} from '@/domain/types';
import { excelDateToJSDate, normaliseStationCode, normaliseCardNumber, generateId } from '@/lib/utils';
import { DKV_TRANSACTION_ALIASES, findBestMatch } from '@/domain/parsers/core/column-aliases';
import { detectHeaderRow } from '@/domain/parsers/core/schema-discovery';

// ─── Product Type Detection ────────────────────────────────────────────────────

function detectProductType(productCode: string, productName: string, productGroup: string): ProductType {
  const code = (productCode || '').toUpperCase();
  const name = (productName || '').toUpperCase();
  const group = (productGroup || '').toUpperCase();

  if (code === 'WA0009' || name.includes('DIESEL') && !name.includes('ADBLUE') && !name.includes('RED')) {
    return ProductType.DIESEL;
  }
  if (code === 'WA0016' || name.includes('ADBLUE')) return ProductType.ADBLUE;
  if (name.includes('GNR') || name.includes('RED DIESEL')) return ProductType.GNR;
  if (name.includes('PARKING') || group.includes('PARKING')) return ProductType.PARKING;
  if (name.includes('TOLL') || name.includes('PASSANGO')) return ProductType.TOLL;
  if (name.includes('WASH') || name.includes('CLEAN')) return ProductType.WASH;
  if (group.includes('SERVICE FEE')) return ProductType.SERVICE_FEE;

  return ProductType.UNKNOWN;
}

// ─── Column Index Mapping ──────────────────────────────────────────────────────

interface ColumnMap {
  [key: string]: number;
}

function buildColumnMap(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  for (let i = 0; i < headers.length; i++) {
    const match = findBestMatch(String(headers[i] || ''), DKV_TRANSACTION_ALIASES);
    if (match && match.confidence >= 0.6) {
      map[match.field] = i;
    }
  }
  return map;
}

function cellStr(row: unknown[], index: number | undefined): string {
  if (index === undefined) return '';
  const val = row[index];
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function cellNum(row: unknown[], index: number | undefined): string {
  if (index === undefined) return '0';
  const val = row[index];
  if (val === null || val === undefined || val === '') return '0';
  return String(val);
}

// ─── Parse Function ────────────────────────────────────────────────────────────

export interface DKVTransactionParseResult {
  transactions: CanonicalTransaction[];
  rawRows: RawDKVTransaction[];
  variant: 1 | 2;
  detectedColumns: number;
  totalRows: number;
  approvedCount: number;
  declinedCount: number;
  warnings: string[];
}

/**
 * Parse a DKV transaction file (Ola_Report).
 * @param rows - Raw sheet data as 2D array (from xlsx)
 * @param fileId - Import file ID for traceability
 */
export function parseDKVTransactions(
  rows: unknown[][],
  fileId: string
): DKVTransactionParseResult {
  const warnings: string[] = [];

  // Detect header row
  const headerRowIndex = detectHeaderRow(rows);
  const headers = (rows[headerRowIndex] || []).map((h) => String(h || ''));
  const colMap = buildColumnMap(headers);

  // Detect variant by column count
  const detectedColumns = headers.filter((h) => h.trim() !== '').length;
  const variant: 1 | 2 = detectedColumns >= 18 ? 2 : 1;

  if (variant === 1 && detectedColumns < 10) {
    warnings.push(`Unusually low column count (${detectedColumns}) — check file structure.`);
  }

  const rawRows: RawDKVTransaction[] = [];
  const transactions: CanonicalTransaction[] = [];
  let approvedCount = 0;
  let declinedCount = 0;

  // Process data rows (skip header)
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row)) continue;

    // Skip empty rows
    const hasData = row.some((c) => c !== null && c !== undefined && c !== '');
    if (!hasData) continue;

    const licencePlate = cellStr(row, colMap['licencePlate']);
    if (!licencePlate) {
      warnings.push(`Row ${i + 1}: Missing licence plate — skipped.`);
      continue;
    }

    // Build raw row
    const raw: RawDKVTransaction = {
      rowIndex: i,
      licencePlate,
      authorisationTime: row[colMap['authorisationTime'] ?? -1],
      sales: cellNum(row, colMap['sales']),
      costGroup: cellStr(row, colMap['costGroup']),
      productGroup: cellStr(row, colMap['productGroup']),
      product: cellStr(row, colMap['product']),
      productCode: cellStr(row, colMap['productCode']),
      authorisationAmountGross: cellNum(row, colMap['authorisationAmountGross']),
      serviceCountry: cellStr(row, colMap['serviceCountry']),
      mileage: cellNum(row, colMap['mileage']),
      cardOrBoxNumber: cellStr(row, colMap['cardOrBoxNumber']),
      response: cellStr(row, colMap['response']),
      // Variant 2 extras
      ...(variant === 2
        ? {
            customerId: cellStr(row, colMap['customerId']),
            costCentre: cellStr(row, colMap['costCentre']),
            cardAddition: cellStr(row, colMap['cardAddition']),
            stationNumber: cellStr(row, colMap['stationNumber']),
            stationName: cellStr(row, colMap['stationName']),
            town: cellStr(row, colMap['town']),
            stationCategory: cellStr(row, colMap['stationCategory']),
            unit: cellStr(row, colMap['unit']),
            authorisationId: cellStr(row, colMap['authorisationId']),
          }
        : {}),
    };

    rawRows.push(raw);

    // Convert timestamp
    let transactionTimestamp = '';
    let transactionDate = '';
    let precision = TimestampPrecision.UNKNOWN;

    const timeVal = raw.authorisationTime;
    if (typeof timeVal === 'number' && timeVal > 0) {
      try {
        const jsDate = excelDateToJSDate(timeVal);
        transactionTimestamp = jsDate.toISOString();
        const splitDate = transactionTimestamp.split('T')[0];
        transactionDate = splitDate ?? '';
        // If fractional day is very small, it's date-only
        const fractional = timeVal - Math.floor(timeVal);
        precision = fractional > 0.0001 ? TimestampPrecision.EXACT : TimestampPrecision.DATE_ONLY;
      } catch {
        warnings.push(`Row ${i + 1}: Could not parse date value "${timeVal}".`);
      }
    }

    // Response handling
    const response = raw.response.toUpperCase();
    const isApproved = response === 'APP' || response === 'APPROVED' || response === '';

    if (isApproved) approvedCount++;
    else declinedCount++;

    const productType = detectProductType(raw.productCode, raw.product, raw.productGroup);

    const canonical: CanonicalTransaction = {
      id: generateId(),
      importFileId: fileId,
      importRowIndex: raw.rowIndex,
      registration: raw.licencePlate,
      cardNumber: raw.cardOrBoxNumber,
      cardNumberNormalised: normaliseCardNumber(raw.cardOrBoxNumber),
      transactionDate,
      transactionTimestamp,
      timestampPrecision: precision,
      stationNumber: raw.stationNumber || '',
      stationNumberNormalised: raw.stationNumber ? normaliseStationCode(raw.stationNumber) : '',
      stationName: raw.stationName || '',
      stationCity: raw.town || '',
      serviceCountry: raw.serviceCountry,
      productCode: raw.productCode,
      productGroup: raw.productGroup,
      productName: raw.product,
      productType,
      costGroup: raw.costGroup,
      quantity: raw.sales,
      unit: raw.unit || (productType === ProductType.DIESEL || productType === ProductType.ADBLUE || productType === ProductType.GNR ? 'L' : 'ST'),
      amountGross: raw.authorisationAmountGross,
      mileage: raw.mileage,
      authorisationId: raw.authorisationId || '',
      responseCode: raw.response,
      isApproved,
      customerId: raw.customerId || '',
      costCentre: raw.costCentre || '',
      cardAddition: raw.cardAddition || '',
      stationCategory: raw.stationCategory || '',
      provider: CardProvider.DKV,
    };

    transactions.push(canonical);
  }

  return {
    transactions,
    rawRows,
    variant,
    detectedColumns,
    totalRows: rawRows.length,
    approvedCount,
    declinedCount,
    warnings,
  };
}
