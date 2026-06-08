/**
 * Approved Station Workbook Parser
 *
 * Handles the multi-sheet station master file:
 *   Sheet 1: "Yard, DKV Prices" — country INHERITED from preceding rows
 *   Sheet 2: "Red Diesel (Fridge) Prices (AS24)"
 *   Sheet 3: "Diesel Prices (AS24)"
 *
 * Safely parses coordinates, handles text-formatted values,
 * and normalises station codes.
 */

import {
  type CanonicalStation,
  type RawStation,
  ProductType,
  CardProvider,
} from '@/domain/types';
import { normaliseStationCode, excelDateToJSDate, generateId } from '@/lib/utils';
import {
  STATION_YARD_DKV_ALIASES,
  STATION_AS24_ALIASES,
  findBestMatch,
} from '@/domain/parsers/core/column-aliases';
import { detectHeaderRow } from '@/domain/parsers/core/schema-discovery';

interface ColumnMap { [key: string]: number }

function buildMap(headers: string[], aliases: Map<string, string[]>): ColumnMap {
  const map: ColumnMap = {};
  for (let i = 0; i < headers.length; i++) {
    const match = findBestMatch(String(headers[i] || ''), aliases);
    if (match && match.confidence >= 0.5) {
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
  if (index === undefined) return '';
  const val = row[index];
  if (val === null || val === undefined || val === '') return '';
  return String(val).trim();
}

function parseCoord(value: string): number | null {
  if (!value) return null;
  // Strip spaces and non-breaking spaces
  const cleaned = value.replace(/[\s\u00A0]+/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseExcelDate(value: unknown): string {
  if (typeof value === 'number' && value > 0) {
    try {
      const splitDate = excelDateToJSDate(value).toISOString().split('T')[0];
      return splitDate ?? '';
    } catch { return ''; }
  }
  if (typeof value === 'string') return value.trim();
  return '';
}

export interface StationParseResult {
  stations: CanonicalStation[];
  rawRows: RawStation[];
  totalRows: number;
  sheetsProcessed: string[];
  countries: string[];
  warnings: string[];
}

/**
 * Parse the complete approved-station workbook.
 */
export function parseStationWorkbook(
  sheetNames: string[],
  sheetData: Map<string, unknown[][]>,
  fileId: string
): StationParseResult {
  const allStations: CanonicalStation[] = [];
  const allRawRows: RawStation[] = [];
  const warnings: string[] = [];
  const sheetsProcessed: string[] = [];
  const countrySet = new Set<string>();

  for (const sheetName of sheetNames) {
    const data = sheetData.get(sheetName);
    if (!data || data.length === 0) continue;

    const nameLower = sheetName.toLowerCase();

    if (nameLower.includes('yard') || nameLower.includes('dkv')) {
      sheetsProcessed.push(sheetName);
      const result = parseYardDKVSheet(data, sheetName, fileId);
      allStations.push(...result.stations);
      allRawRows.push(...result.rawRows);
      warnings.push(...result.warnings);
      result.stations.forEach((s) => { if (s.country) countrySet.add(s.country); });
    } else if (nameLower.includes('red diesel') || nameLower.includes('fridge') || nameLower.includes('gnr')) {
      sheetsProcessed.push(sheetName);
      const result = parseAS24Sheet(data, sheetName, fileId, 'RED_DIESEL_AS24', ProductType.GNR);
      allStations.push(...result.stations);
      allRawRows.push(...result.rawRows);
      warnings.push(...result.warnings);
      result.stations.forEach((s) => { if (s.country) countrySet.add(s.country); });
    } else if (nameLower.includes('diesel') || nameLower.includes('as24')) {
      sheetsProcessed.push(sheetName);
      const result = parseAS24Sheet(data, sheetName, fileId, 'DIESEL_AS24', ProductType.DIESEL);
      allStations.push(...result.stations);
      allRawRows.push(...result.rawRows);
      warnings.push(...result.warnings);
      result.stations.forEach((s) => { if (s.country) countrySet.add(s.country); });
    } else {
      warnings.push(`Sheet "${sheetName}" does not match known station format — skipped.`);
    }
  }

  return {
    stations: allStations,
    rawRows: allRawRows,
    totalRows: allRawRows.length,
    sheetsProcessed,
    countries: Array.from(countrySet).sort(),
    warnings,
  };
}

// ─── DKV Yard Sheet Parser ─────────────────────────────────────────────────────

function parseYardDKVSheet(
  rows: unknown[][],
  sheetName: string,
  fileId: string
): { stations: CanonicalStation[]; rawRows: RawStation[]; warnings: string[] } {
  const warnings: string[] = [];
  const headerRowIndex = detectHeaderRow(rows);
  const headers = (rows[headerRowIndex] || []).map((h) => String(h || ''));
  const colMap = buildMap(headers, STATION_YARD_DKV_ALIASES);

  // Country column — inherited from preceding rows
  const countryColIndex = colMap['country'] !== undefined ? colMap['country'] : 0;

  const stations: CanonicalStation[] = [];
  const rawRows: RawStation[] = [];
  let lastCountry = '';

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row)) continue;
    const hasData = row.some((c) => c !== null && c !== undefined && c !== '');
    if (!hasData) continue;

    // Country inheritance
    const countryCellVal = cellStr(row, countryColIndex);
    if (countryCellVal) {
      lastCountry = countryCellVal;
    }

    const stationCode = cellStr(row, colMap['stationCode']);
    if (!stationCode) continue; // Skip rows without station code

    const latStr = cellNum(row, colMap['latitude']);
    const lonStr = cellNum(row, colMap['longitude']);

    const raw: RawStation = {
      sourceSheet: 'YARD_DKV',
      country: lastCountry,
      pump: cellStr(row, colMap['pump']),
      stationCode,
      stationName: cellStr(row, colMap['pump']), // DKV uses PUMP as brand/name
      city: cellStr(row, colMap['city']),
      address: cellStr(row, colMap['address']),
      postCode: cellStr(row, colMap['postCode']),
      url: cellStr(row, colMap['url']),
      latitude: latStr,
      longitude: lonStr,
      product: 'DIESEL',
      cost: cellNum(row, colMap['cost']),
      serviceFeePercent: cellNum(row, colMap['serviceFeePercent']),
      discount: cellNum(row, colMap['discount']),
      exciseDutyRebate: cellNum(row, colMap['exciseDutyRebate']),
      netCostEurPerLitre: '',
      applicationDate: '',
    };

    rawRows.push(raw);

    const canonical: CanonicalStation = {
      id: generateId(),
      importFileId: fileId,
      stationCode,
      stationCodeNormalised: normaliseStationCode(stationCode),
      stationName: raw.pump,
      country: lastCountry,
      city: raw.city,
      address: raw.address,
      postCode: raw.postCode,
      latitude: parseCoord(latStr),
      longitude: parseCoord(lonStr),
      url: raw.url,
      product: 'DIESEL',
      productType: ProductType.DIESEL,
      costPerLitre: raw.cost,
      serviceFeePercent: raw.serviceFeePercent,
      discount: raw.discount,
      exciseDutyRebate: raw.exciseDutyRebate,
      netCostEurPerLitre: '',
      applicationDate: '',
      sourceSheet: 'YARD_DKV',
      provider: CardProvider.DKV,
    };

    stations.push(canonical);
  }

  return { stations, rawRows, warnings };
}

// ─── AS24 Sheet Parser ─────────────────────────────────────────────────────────

function parseAS24Sheet(
  rows: unknown[][],
  sheetName: string,
  fileId: string,
  sourceSheet: 'RED_DIESEL_AS24' | 'DIESEL_AS24',
  defaultProductType: ProductType
): { stations: CanonicalStation[]; rawRows: RawStation[]; warnings: string[] } {
  const warnings: string[] = [];
  const headerRowIndex = detectHeaderRow(rows);
  const headers = (rows[headerRowIndex] || []).map((h) => String(h || ''));
  const colMap = buildMap(headers, STATION_AS24_ALIASES);

  const stations: CanonicalStation[] = [];
  const rawRows: RawStation[] = [];

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row)) continue;
    const hasData = row.some((c) => c !== null && c !== undefined && c !== '');
    if (!hasData) continue;

    const stationCode = cellStr(row, colMap['stationCode']);
    if (!stationCode) continue;

    const appDateRaw = row[colMap['applicationDate'] ?? -1];
    const applicationDate = parseExcelDate(appDateRaw);
    const productRaw = cellStr(row, colMap['product']);

    const raw: RawStation = {
      sourceSheet,
      country: cellStr(row, colMap['country']),
      pump: '',
      stationCode,
      stationName: cellStr(row, colMap['stationName']),
      city: cellStr(row, colMap['address']), // AS24 uses "Address" as city
      address: '',
      postCode: cellStr(row, colMap['postCode']),
      url: '',
      latitude: '',
      longitude: '',
      product: productRaw || (defaultProductType === ProductType.GNR ? 'GNR' : 'DIESEL'),
      cost: '',
      serviceFeePercent: '',
      discount: '',
      exciseDutyRebate: '',
      netCostEurPerLitre: cellNum(row, colMap['netCostEurPerLitre']),
      applicationDate,
    };

    rawRows.push(raw);

    const canonical: CanonicalStation = {
      id: generateId(),
      importFileId: fileId,
      stationCode,
      stationCodeNormalised: normaliseStationCode(stationCode),
      stationName: raw.stationName,
      country: raw.country,
      city: raw.city,
      address: '',
      postCode: raw.postCode,
      latitude: null,
      longitude: null,
      url: '',
      product: raw.product,
      productType: defaultProductType,
      costPerLitre: '',
      serviceFeePercent: '',
      discount: '',
      exciseDutyRebate: '',
      netCostEurPerLitre: raw.netCostEurPerLitre,
      applicationDate,
      sourceSheet,
      provider: CardProvider.AS24,
    };

    stations.push(canonical);
  }

  return { stations, rawRows, warnings };
}
