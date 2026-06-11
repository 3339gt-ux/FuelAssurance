/**
 * GPS / Telematics Parser
 *
 * Parses the generic GPS telematics workbook (15 columns).
 * TEXT-LOCATION ONLY — does NOT fabricate coordinates.
 * Converts Excel serial dates.
 * Parses Speed as number (comes as string like "0.0").
 */

import {
  type RawGPSPoint,
  type CanonicalTelematicsPoint,
  TimestampPrecision,
} from '@/domain/types';
import { excelDateToJSDate, generateId } from '@/lib/utils';
import { GPS_ALIASES, findBestMatch } from '@/domain/parsers/core/column-aliases';
import { detectHeaderRow } from '@/domain/parsers/core/schema-discovery';

interface ColumnMap { [key: string]: number }

function buildColumnMap(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  for (let i = 0; i < headers.length; i++) {
    const match = findBestMatch(String(headers[i] || ''), GPS_ALIASES);
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

export interface GPSParseResult {
  points: CanonicalTelematicsPoint[];
  rawRows: RawGPSPoint[];
  detectedColumns: number;
  totalRows: number;
  vehicles: string[];
  dateRange: { earliest: string; latest: string };
  warnings: string[];
}

/**
 * Parse a GPS/telematics workbook.
 */
export function parseGPSFile(
  rows: unknown[][],
  fileId: string,
  sheetName?: string
): GPSParseResult {
  const warnings: string[] = [];
  const headerRowIndex = detectHeaderRow(rows);
  const headers = (rows[headerRowIndex] || []).map((h) => String(h || ''));
  const colMap = buildColumnMap(headers);
  const detectedColumns = headers.filter((h) => h.trim() !== '').length;

  const rawRows: RawGPSPoint[] = [];
  const points: CanonicalTelematicsPoint[] = [];
  const vehicleSet = new Set<string>();
  let earliest = '';
  let latest = '';

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row)) continue;
    const hasData = row.some((c) => c !== null && c !== undefined && c !== '');
    if (!hasData) continue;

    const vehicle = cellStr(row, colMap['vehicle']);
    if (!vehicle) continue;

    vehicleSet.add(vehicle);

    const raw: RawGPSPoint = {
      rowIndex: i,
      vehicle,
      trailer: cellStr(row, colMap['trailer']),
      createdDate: row[colMap['createdDate'] ?? -1],
      dataSource: cellStr(row, colMap['dataSource']),
      fuelLevel: cellStr(row, colMap['fuelLevel']),
      km: cellStr(row, colMap['km']),
      speed: cellStr(row, colMap['speed']),
      driver: cellStr(row, colMap['driver']),
      activity: cellStr(row, colMap['activity']),
      info: cellStr(row, colMap['info']),
      positionFromCity: cellStr(row, colMap['positionFromCity']),
      positionFromTown: cellStr(row, colMap['positionFromTown']),
      positionFromStreet: cellStr(row, colMap['positionFromStreet']),
      positionFromVillage: cellStr(row, colMap['positionFromVillage']),
      positionFromAddress: cellStr(row, colMap['positionFromAddress']),
    };

    rawRows.push(raw);

    // Convert timestamp
    let timestamp = '';
    let precision = TimestampPrecision.UNKNOWN;

    const dateVal = raw.createdDate;
    if (typeof dateVal === 'number' && dateVal > 0) {
      try {
        const jsDate = excelDateToJSDate(dateVal);
        timestamp = jsDate.toISOString();
        const fractional = dateVal - Math.floor(dateVal);
        precision = fractional > 0.0001 ? TimestampPrecision.EXACT : TimestampPrecision.DATE_ONLY;
      } catch {
        warnings.push(`Row ${i + 1}: Could not parse date value "${dateVal}".`);
      }
    }

    // Track date range
    const dateOnly = timestamp ? timestamp.split('T')[0] : '';
    if (dateOnly) {
      if (!earliest || dateOnly < earliest) earliest = dateOnly;
      if (!latest || dateOnly > latest) latest = dateOnly;
    }

    // Parse numeric fields
    const fuelLevel = raw.fuelLevel ? parseFloat(raw.fuelLevel) : null;
    const km = raw.km ? parseFloat(raw.km) : null;
    const speed = raw.speed ? parseFloat(raw.speed) : null;

    const sourceEvidence = {
      sourceFileId: fileId,
      sourceFileName: '',
      sourceType: 'GPS_XLS' as const,
      worksheetName: sheetName || 'Sheet1',
      rowNumber: i + 1,
      extractedFields: {
        vehicle: raw.vehicle,
        createdDate: raw.createdDate,
        fuelLevel: raw.fuelLevel,
        km: raw.km,
        speed: raw.speed,
        activity: raw.activity,
      },
      confidence: 100,
      parserVersion: '1.0.0',
    };

    const point: CanonicalTelematicsPoint = {
      id: generateId(),
      importFileId: fileId,
      importRowIndex: raw.rowIndex,
      vehicleRegistration: raw.vehicle,
      trailer: raw.trailer,
      driver: raw.driver,
      timestamp,
      timestampPrecision: precision,
      fuelLevelPercent: fuelLevel !== null && !isNaN(fuelLevel) ? fuelLevel : null,
      odometerKm: km !== null && !isNaN(km) ? km : null,
      speedKmh: speed !== null && !isNaN(speed) ? speed : null,
      dataSource: raw.dataSource,
      activity: raw.activity,
      info: raw.info,
      locationCity: raw.positionFromCity,
      locationTown: raw.positionFromTown,
      locationStreet: raw.positionFromStreet,
      locationVillage: raw.positionFromVillage,
      locationAddress: raw.positionFromAddress,
      // NO fabricated coordinates
      latitude: null,
      longitude: null,
      sourceEvidence,
    };

    points.push(point);
  }

  return {
    points,
    rawRows,
    detectedColumns,
    totalRows: rawRows.length,
    vehicles: Array.from(vehicleSet).sort(),
    dateRange: { earliest, latest },
    warnings,
  };
}
