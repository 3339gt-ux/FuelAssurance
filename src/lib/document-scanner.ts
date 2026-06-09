import * as XLSX from 'xlsx';
import pdf from 'pdf-parse';
import { isFleetVehicle, normalizeRegistration, FLEET_VEHICLES } from '@/config/fleet-registry';
import {
  extractAS24RegistrationsFromText,
  extractRegistrationsFromCanonicalRows,
} from '@/domain/parsers/as24/registration-extractor';

export interface ScannedRegistration {
  raw: string;
  normalized: string;
  source: string;
  confident?: boolean;
}

export interface ScanResult {
  fleetVehicles: ScannedRegistration[];
  nonFleetVehicles: ScannedRegistration[];
}

const FLEET_SET = new Set(FLEET_VEHICLES.map((v) => v.normalized));

/**
 * Token-boundary fleet registry lookup — fallback only when structured fields fail.
 */
function scanForExactFleetTokens(text: string, source: string): ScannedRegistration[] {
  const found: ScannedRegistration[] = [];
  const seen = new Set<string>();

  for (const reg of FLEET_SET) {
    const pattern = new RegExp(`(?:^|[^A-Z0-9])(${reg})(?:[^A-Z0-9]|$)`, 'gi');
    if (pattern.test(text)) {
      const key = `${reg}|${source}`;
      if (!seen.has(key)) {
        seen.add(key);
        found.push({ raw: reg, normalized: reg, source, confident: true });
      }
    }
  }

  return found;
}

export async function scanDocumentForRegistrations(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
  options?: {
    provider?: string;
    canonicalRows?: Array<{ registration?: string; vehicleRegistration?: string; extractionConfidence?: number; sourcePage?: number }>;
    skipFullScan?: boolean;
  }
): Promise<ScanResult> {
  const fleetVehicles: ScannedRegistration[] = [];
  const nonFleetVehicles: ScannedRegistration[] = [];
  const seenFleet = new Set<string>();
  const seenNonFleet = new Set<string>();

  const addResult = (item: ScannedRegistration, inFleet: boolean) => {
    const key = `${item.normalized}|${item.source}`;
    if (inFleet) {
      if (!seenFleet.has(key)) {
        seenFleet.add(key);
        fleetVehicles.push(item);
      }
    } else if (item.confident !== false) {
      if (!seenNonFleet.has(key)) {
        seenNonFleet.add(key);
        nonFleetVehicles.push(item);
      }
    }
  };

  if (options?.canonicalRows && options.canonicalRows.length > 0) {
    const extracted = extractRegistrationsFromCanonicalRows(options.canonicalRows);
    for (const item of extracted) {
      addResult(
        { raw: item.raw, normalized: item.normalized, source: item.source, confident: item.confident },
        isFleetVehicle(item.normalized)
      );
    }
    if (options.skipFullScan) {
      return { fleetVehicles, nonFleetVehicles };
    }
  }

  const isPDF = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
  const isAS24 = options?.provider === 'AS24' || fileName.toLowerCase().includes('as24');

  if (isPDF && isAS24) {
    try {
      const pdfData = await pdf(buffer);
      const text = pdfData.text.replace(/\xA0/g, ' ');
      const sectionRegs = extractAS24RegistrationsFromText(text);
      for (const item of sectionRegs) {
        addResult(
          { raw: item.raw, normalized: item.normalized, source: item.source, confident: item.confident },
          isFleetVehicle(item.normalized)
        );
      }
      return { fleetVehicles, nonFleetVehicles };
    } catch (err) {
      console.error('Error scanning AS24 PDF for registrations:', err);
      return { fleetVehicles, nonFleetVehicles };
    }
  }

  if (isPDF) {
    try {
      const pdfData = await pdf(buffer);
      const tokens = scanForExactFleetTokens(pdfData.text, 'PDF fleet token match');
      for (const item of tokens) {
        addResult(item, true);
      }
    } catch (err) {
      console.error('Error scanning PDF for registrations:', err);
    }
    return { fleetVehicles, nonFleetVehicles };
  }

  // Spreadsheet: row-level exact fleet token scan only
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const rawJsonRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
      rawJsonRows.forEach((row, rowIndex) => {
        if (!row || !Array.isArray(row)) return;
        const rowText = row.map((cell) => (cell === null || cell === undefined) ? '' : String(cell)).join(' ');
        const tokens = scanForExactFleetTokens(rowText, `Sheet '${sheetName}', Row ${rowIndex + 1}`);
        for (const item of tokens) {
          addResult(item, true);
        }
        const norm = normalizeRegistration(rowText);
        if (norm && norm.length >= 6 && norm.length <= 12 && !FLEET_SET.has(norm)) {
          const regCol = row.find((cell) => {
            const n = normalizeRegistration(String(cell ?? ''));
            return n.length >= 6 && n.length <= 12;
          });
          if (regCol) {
            const n = normalizeRegistration(String(regCol));
            if (!isFleetVehicle(n)) {
              addResult(
                { raw: String(regCol), normalized: n, source: `Sheet '${sheetName}', Row ${rowIndex + 1}`, confident: true },
                false
              );
            }
          }
        }
      });
    }
  } catch (err) {
    console.error('Error scanning spreadsheet for registrations:', err);
  }

  return { fleetVehicles, nonFleetVehicles };
}