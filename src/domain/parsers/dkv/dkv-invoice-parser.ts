/**
 * DKV Invoice Parser
 *
 * Parses the 40-column DKV invoice transaction report.
 * Preserves ALL columns including blank optional ones.
 * Uses Equipment number as preferred card core.
 * Handles negative values (credits/discounts) correctly.
 */

import {
  type RawDKVInvoiceRow,
  type CanonicalInvoiceRow,
  ProductType,
  CardProvider,
  TimestampPrecision,
} from '@/domain/types';
import { excelDateToJSDate, normaliseStationCode, normaliseCardNumber, generateId } from '@/lib/utils';
import { DKV_INVOICE_ALIASES, findBestMatch } from '@/domain/parsers/core/column-aliases';
import { detectHeaderRow } from '@/domain/parsers/core/schema-discovery';

interface ColumnMap { [key: string]: number }

function buildColumnMap(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  for (let i = 0; i < headers.length; i++) {
    const match = findBestMatch(String(headers[i] || ''), DKV_INVOICE_ALIASES);
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

function detectProductType(code: string, name: string, group: string): ProductType {
  const c = (code || '').toUpperCase();
  const n = (name || '').toUpperCase();
  const g = (group || '').toUpperCase();

  if (c === 'WA0009' || (n.includes('DIESEL') && !n.includes('ADBLUE') && !n.includes('RED'))) return ProductType.DIESEL;
  if (c === 'WA0016' || n.includes('ADBLUE')) return ProductType.ADBLUE;
  if (n.includes('GNR') || n.includes('RED DIESEL')) return ProductType.GNR;
  if (n.includes('PARKING') || g.includes('PARKING')) return ProductType.PARKING;
  if (n.includes('TOLL') || n.includes('PASSANGO')) return ProductType.TOLL;
  if (n.includes('WASH') || n.includes('CLEAN')) return ProductType.WASH;
  if (g.includes('SERVICE FEE') || g.includes('SERVICE')) return ProductType.SERVICE_FEE;
  return ProductType.UNKNOWN;
}

export interface DKVInvoiceParseResult {
  invoiceRows: CanonicalInvoiceRow[];
  rawRows: RawDKVInvoiceRow[];
  detectedColumns: number;
  totalRows: number;
  dateRange: { earliest: string; latest: string };
  warnings: string[];
}

/**
 * Parse a DKV invoice transaction file.
 */
export function parseDKVInvoice(
  rows: unknown[][],
  fileId: string,
  sheetName?: string
): DKVInvoiceParseResult {
  const warnings: string[] = [];
  const headerRowIndex = detectHeaderRow(rows);
  const headers = (rows[headerRowIndex] || []).map((h) => String(h || ''));
  const colMap = buildColumnMap(headers);
  const detectedColumns = headers.filter((h) => h.trim() !== '').length;

  if (detectedColumns < 30) {
    warnings.push(`Expected ~40 columns but detected ${detectedColumns}. Some fields may be unmapped.`);
  }

  const rawRows: RawDKVInvoiceRow[] = [];
  const invoiceRows: CanonicalInvoiceRow[] = [];
  let earliest = '';
  let latest = '';

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row)) continue;
    const hasData = row.some((c) => c !== null && c !== undefined && c !== '');
    if (!hasData) continue;

    const raw: RawDKVInvoiceRow = {
      rowIndex: i,
      transactionTime: row[colMap['transactionTime'] ?? -1],
      stationName: cellStr(row, colMap['stationName']),
      stationCity: cellStr(row, colMap['stationCity']),
      stationNumber: cellStr(row, colMap['stationNumber']),
      transactionNumber: cellStr(row, colMap['transactionNumber']),
      serviceCountry: cellStr(row, colMap['serviceCountry']),
      costGroup: cellStr(row, colMap['costGroup']),
      productGroup: cellStr(row, colMap['productGroup']),
      product: cellStr(row, colMap['product']),
      productCode: cellStr(row, colMap['productCode']),
      paymentCurrency: cellStr(row, colMap['paymentCurrency']),
      unit: cellStr(row, colMap['unit']),
      quantity: cellNum(row, colMap['quantity']),
      pricePerUnit: cellNum(row, colMap['pricePerUnit']),
      baseValueNet: cellNum(row, colMap['baseValueNet']),
      serviceFeeNet: cellNum(row, colMap['serviceFeeNet']),
      valueOfPurchaseNet: cellNum(row, colMap['valueOfPurchaseNet']),
      serviceCurrency: cellStr(row, colMap['serviceCurrency']),
      valueInPayCurrency: cellNum(row, colMap['valueInPayCurrency']),
      valueInServiceCountryCurrency: cellNum(row, colMap['valueInServiceCountryCurrency']),
      vat: cellNum(row, colMap['vat']),
      pricePerUnitGross: cellNum(row, colMap['pricePerUnitGross']),
      discountNet: cellNum(row, colMap['discountNet']),
      licencePlate: cellStr(row, colMap['licencePlate']),
      cardBoxNo: cellStr(row, colMap['cardBoxNo']),
      cardBoxNoPartner: cellStr(row, colMap['cardBoxNoPartner']),
      invoiceDate: cellStr(row, colMap['invoiceDate']),
      documentNumber: cellStr(row, colMap['documentNumber']),
      invoiceNumber: cellStr(row, colMap['invoiceNumber']),
      ticketNumberDKV: cellStr(row, colMap['ticketNumberDKV']),
      stationZipCode: cellStr(row, colMap['stationZipCode']),
      baseValueGross: cellNum(row, colMap['baseValueGross']),
      costCentre1: cellStr(row, colMap['costCentre1']),
      costCentre2: cellStr(row, colMap['costCentre2']),
      invoiceCountry: cellStr(row, colMap['invoiceCountry']),
      mileage: cellNum(row, colMap['mileage']),
      discountGross: cellNum(row, colMap['discountGross']),
      agesTerminal: cellStr(row, colMap['agesTerminal']),
      customerId: cellStr(row, colMap['customerId']),
      equipmentNumber: cellStr(row, colMap['equipmentNumber']),
    };

    rawRows.push(raw);

    // Convert timestamp
    let transactionTimestamp = '';
    let transactionDate = '';
    let precision = TimestampPrecision.UNKNOWN;

    const timeVal = raw.transactionTime;
    if (typeof timeVal === 'number' && timeVal > 0) {
      try {
        const jsDate = excelDateToJSDate(timeVal);
        transactionTimestamp = jsDate.toISOString();
        const splitDate = transactionTimestamp.split('T')[0];
        transactionDate = splitDate ?? '';
        const fractional = timeVal - Math.floor(timeVal);
        precision = fractional > 0.0001 ? TimestampPrecision.EXACT : TimestampPrecision.DATE_ONLY;
      } catch {
        warnings.push(`Row ${i + 1}: Could not parse transaction time "${timeVal}".`);
      }
    }

    // Track date range
    if (transactionDate) {
      if (!earliest || transactionDate < earliest) earliest = transactionDate;
      if (!latest || transactionDate > latest) latest = transactionDate;
    }

    // Invoice date
    let invoiceDateStr = '';
    const invDateVal = raw.invoiceDate;
    if (typeof invDateVal === 'string' && invDateVal) {
      invoiceDateStr = invDateVal;
    } else if (typeof row[colMap['invoiceDate'] ?? -1] === 'number') {
      try {
        const d = excelDateToJSDate(row[colMap['invoiceDate']!] as number);
        const splitInvDate = d.toISOString().split('T')[0];
        invoiceDateStr = splitInvDate ?? '';
      } catch { /* keep empty */ }
    }

    // Card number — use Equipment number as preferred core
    const cardRaw = raw.cardBoxNo;
    const equipmentNumber = raw.equipmentNumber;
    const cardCore = equipmentNumber || normaliseCardNumber(cardRaw);

    const productType = detectProductType(raw.productCode, raw.product, raw.productGroup);

    const sourceEvidence = {
      sourceFileId: fileId,
      sourceFileName: '',
      sourceType: 'DKV_INVOICE_XLS' as const,
      worksheetName: sheetName || 'Sheet1',
      rowNumber: i + 1,
      extractedFields: {
        registration: raw.licencePlate,
        cardBoxNo: raw.cardBoxNo,
        transactionTime: raw.transactionTime,
        stationName: raw.stationName,
        product: raw.product,
        quantity: raw.quantity,
        valueOfPurchaseNet: raw.valueOfPurchaseNet,
      },
      confidence: 100,
      parserVersion: '1.0.0',
    };

    const canonical: CanonicalInvoiceRow = {
      id: generateId(),
      importFileId: fileId,
      importRowIndex: raw.rowIndex,
      registration: raw.licencePlate,
      cardNumber: cardRaw,
      cardNumberNormalised: cardCore,
      equipmentNumber,
      invoiceNumber: raw.invoiceNumber,
      invoiceDate: invoiceDateStr,
      documentNumber: raw.documentNumber,
      ticketNumber: raw.ticketNumberDKV,
      transactionDate,
      transactionTimestamp,
      timestampPrecision: precision,
      transactionNumber: raw.transactionNumber,
      stationNumber: raw.stationNumber,
      stationNumberNormalised: normaliseStationCode(raw.stationNumber),
      stationName: raw.stationName,
      stationCity: raw.stationCity,
      stationZipCode: raw.stationZipCode,
      serviceCountry: raw.serviceCountry,
      invoiceCountry: raw.invoiceCountry,
      productCode: raw.productCode,
      productGroup: raw.productGroup,
      productName: raw.product,
      productType,
      costGroup: raw.costGroup,
      quantity: raw.quantity,
      unit: raw.unit,
      pricePerUnit: raw.pricePerUnit,
      pricePerUnitGross: raw.pricePerUnitGross,
      baseValueNet: raw.baseValueNet,
      baseValueGross: raw.baseValueGross,
      serviceFeeNet: raw.serviceFeeNet,
      valueOfPurchaseNet: raw.valueOfPurchaseNet,
      discountNet: raw.discountNet,
      discountGross: raw.discountGross,
      vat: raw.vat,
      paymentCurrency: raw.paymentCurrency,
      serviceCurrency: raw.serviceCurrency,
      valueInPayCurrency: raw.valueInPayCurrency,
      valueInServiceCountryCurrency: raw.valueInServiceCountryCurrency,
      costCentre1: raw.costCentre1,
      costCentre2: raw.costCentre2,
      mileage: raw.mileage,
      agesTerminal: raw.agesTerminal,
      customerId: raw.customerId,
      cardNumberPartner: raw.cardBoxNoPartner,
      provider: CardProvider.DKV,
      sourceEvidence,
    };

    invoiceRows.push(canonical);
  }

  return {
    invoiceRows,
    rawRows,
    detectedColumns,
    totalRows: rawRows.length,
    dateRange: { earliest, latest },
    warnings,
  };
}
