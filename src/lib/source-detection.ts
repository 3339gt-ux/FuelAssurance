import * as XLSX from 'xlsx';
import pdf from 'pdf-parse';
import {
  DKV_TRANSACTION_ALIASES,
  DKV_INVOICE_ALIASES,
  GPS_ALIASES,
  findBestMatch,
} from '@/domain/parsers/core/column-aliases';
import { detectHeaderRow } from '@/domain/parsers/core/schema-discovery';
import type { TransactionSourceType } from '@/types/transaction-batch';

export interface SourceDetectionCandidate {
  sourceType: TransactionSourceType;
  confidence: number;
  reason: string;
}

export interface SourceDetectionResult {
  fileName: string;
  mimeType: string;
  detected: SourceDetectionCandidate | null;
  candidates: SourceDetectionCandidate[];
  needsConfirmation: boolean;
}

const AS24_PDF_MARKERS = [
  'cards filling',
  'passango',
  'statement number',
  'total amount to be paid',
  'as24',
  'filling list',
];

function scoreHeaderMatches(headers: string[], aliasMap: Map<string, string[]>): number {
  let matched = 0;
  for (const h of headers) {
    if (findBestMatch(h, aliasMap)) matched++;
  }
  return headers.length > 0 ? matched / headers.length : 0;
}

function countMatchedFields(headers: string[], aliasMap: Map<string, string[]>, fields: string[]): number {
  const headerFields = new Set<string>();
  for (const h of headers) {
    const m = findBestMatch(h, aliasMap);
    if (m) headerFields.add(m.field);
  }
  return fields.filter((f) => headerFields.has(f)).length;
}

function detectSpreadsheetSource(rows: unknown[][]): SourceDetectionCandidate[] {
  if (!rows.length) return [];

  const headerRowIndex = detectHeaderRow(rows);
  const headers = (rows[headerRowIndex] || []).map((h) => String(h || '').trim()).filter(Boolean);
  const nonEmptyCols = headers.length;

  const dkvDailyScore = scoreHeaderMatches(headers, DKV_TRANSACTION_ALIASES);
  const dkvInvoiceScore = scoreHeaderMatches(headers, DKV_INVOICE_ALIASES);
  const gpsScore = scoreHeaderMatches(headers, GPS_ALIASES);

  const invoiceMarkers = countMatchedFields(headers, DKV_INVOICE_ALIASES, [
    'invoiceNumber',
    'baseValueNet',
    'valueOfPurchaseNet',
    'documentNumber',
  ]);
  const dailyMarkers = countMatchedFields(headers, DKV_TRANSACTION_ALIASES, [
    'authorisationTime',
    'response',
    'licencePlate',
  ]);
  const gpsMarkers = countMatchedFields(headers, GPS_ALIASES, ['vehicle', 'fuelLevel', 'km']);

  const candidates: SourceDetectionCandidate[] = [];

  if (invoiceMarkers >= 2 || (nonEmptyCols >= 28 && dkvInvoiceScore >= 0.25)) {
    candidates.push({
      sourceType: 'DKV Invoice-Period Excel',
      confidence: Math.min(0.98, 0.55 + invoiceMarkers * 0.1 + dkvInvoiceScore * 0.2),
      reason: `Invoice-period structure: ${nonEmptyCols} columns, invoice/base-value headers detected (${invoiceMarkers} markers).`,
    });
  }

  if (dailyMarkers >= 2 || (nonEmptyCols >= 10 && nonEmptyCols <= 24 && dkvDailyScore >= 0.3)) {
    candidates.push({
      sourceType: 'DKV Daily Transaction Excel',
      confidence: Math.min(0.95, 0.5 + dailyMarkers * 0.12 + dkvDailyScore * 0.2),
      reason: `Daily/authorisation structure: ${nonEmptyCols} columns, auth-time/response headers detected (${dailyMarkers} markers).`,
    });
  }

  if (gpsMarkers >= 2 || gpsScore >= 0.35) {
    candidates.push({
      sourceType: 'GPS / Telematics',
      confidence: Math.min(0.95, 0.45 + gpsMarkers * 0.15 + gpsScore * 0.25),
      reason: `Telematics structure: vehicle/fuel/odometer headers detected (${gpsMarkers} markers).`,
    });
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}

async function detectPdfSource(buffer: Buffer): Promise<SourceDetectionCandidate[]> {
  try {
    const data = await pdf(buffer);
    const text = (data.text || '').toLowerCase();
    
    // Specific check for DKV Invoice PDF
    if (text.includes('e-summary') && (text.includes('dkv euro service') || text.includes('dkv mobility'))) {
      return [{
        sourceType: 'DKV Invoice PDF',
        confidence: 0.98,
        reason: 'PDF contains DKV E-SUMMARY statement page and company identification.',
      }];
    }

    const hits = AS24_PDF_MARKERS.filter((m) => text.includes(m)).length;
    if (hits >= 2) {
      return [{
        sourceType: 'AS24 Invoice PDF',
        confidence: Math.min(0.99, 0.6 + hits * 0.08),
        reason: `PDF contains ${hits} AS24 statement/filling-list markers.`,
      }];
    }
    if (text.includes('dkv') && (text.includes('invoice') || text.includes('transaction'))) {
      return [{
        sourceType: 'DKV Invoice-Period Excel',
        confidence: 0.4,
        reason: 'PDF mentions DKV invoice/transaction but AS24 markers absent — confirm manually.',
      }];
    }
  } catch {
    // fall through
  }
  return [];
}

export function mapSourceTypeToProvider(
  sourceType: TransactionSourceType
): { provider: string; documentType: string } {
  switch (sourceType) {
    case 'AS24 Invoice PDF':
      return { provider: 'AS24', documentType: 'INVOICE' };
    case 'DKV Daily Transaction Excel':
      return { provider: 'DKV', documentType: 'TRANSACTION' };
    case 'DKV Invoice-Period Excel':
      return { provider: 'DKV', documentType: 'INVOICE' };
    case 'DKV Invoice PDF':
      return { provider: 'DKV', documentType: 'INVOICE' };
    case 'GPS / Telematics':
      return { provider: 'GPS', documentType: 'GPS' };
    default:
      return { provider: 'UNKNOWN', documentType: 'UNKNOWN' };
  }
}

export function mapLegacyTypeToSourceType(type: string): TransactionSourceType | null {
  const map: Record<string, TransactionSourceType> = {
    'AS24 Invoice (PDF)': 'AS24 Invoice PDF',
    'DKV Transactions': 'DKV Daily Transaction Excel',
    'DKV Invoice': 'DKV Invoice-Period Excel',
    'DKV Daily Transaction Excel': 'DKV Daily Transaction Excel',
    'DKV Invoice-Period Excel': 'DKV Invoice-Period Excel',
    'DKV Invoice (PDF)': 'DKV Invoice PDF',
    'GPS / Telematics': 'GPS / Telematics',
  };
  return map[type] ?? null;
}

export async function detectSourceType(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  userSpecifiedType?: string
): Promise<SourceDetectionResult> {
  const fileLower = fileName.toLowerCase();
  const isPdf = mimeType === 'application/pdf' || fileLower.endsWith('.pdf');
  const isSpreadsheet =
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel') ||
    fileLower.endsWith('.xlsx') ||
    fileLower.endsWith('.xls') ||
    fileLower.endsWith('.csv');

  let candidates: SourceDetectionCandidate[] = [];

  if (userSpecifiedType) {
    const mapped = mapLegacyTypeToSourceType(userSpecifiedType) ?? (userSpecifiedType as TransactionSourceType);
    candidates.push({
      sourceType: mapped,
      confidence: 1,
      reason: 'User confirmed source type.',
    });
  } else if (isPdf) {
    candidates = await detectPdfSource(buffer);
  } else if (isSpreadsheet) {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      if (sheetName) {
        const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName]!, { header: 1 });
        candidates = detectSpreadsheetSource(rows);
      }
    } catch {
      // empty candidates
    }
  }

  const top = candidates[0] ?? null;
  const second = candidates[1];
  const needsConfirmation =
    candidates.length === 0 ||
    (top !== null && top.confidence < 0.75) ||
    (top !== null && second !== undefined && top.confidence - second.confidence < 0.15);

  return {
    fileName,
    mimeType,
    detected: top,
    candidates,
    needsConfirmation,
  };
}