/**
 * Schema Discovery Engine
 *
 * Dynamically inspects file structure at import time:
 * - Detects header rows
 * - Determines used data range
 * - Matches columns to canonical fields via fuzzy/alias matching
 * - Assesses mapping confidence
 */

import type {
  CanonicalFieldDef,
  ColumnMapping,
  SheetInfo,
  MappingAssessment,
  ColumnTypeInfo,
  StructureFingerprint,
} from '@/domain/types';

/**
 * Scan the first N rows to find the most likely header row.
 * A header row is one where most cells are non-empty strings.
 */
export function detectHeaderRow(rows: unknown[][], maxScan = 20): number {
  let bestRow = 0;
  let bestScore = 0;

  const scanLimit = Math.min(rows.length, maxScan);
  for (let i = 0; i < scanLimit; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row)) continue;

    let stringCount = 0;
    let nonEmptyCount = 0;
    for (const cell of row) {
      if (cell !== null && cell !== undefined && cell !== '') {
        nonEmptyCount++;
        if (typeof cell === 'string' && isNaN(Number(cell))) {
          stringCount++;
        }
      }
    }

    // Score: proportion of cells that are non-numeric strings × cell count
    const score = nonEmptyCount > 0 ? (stringCount / nonEmptyCount) * nonEmptyCount : 0;
    if (score > bestScore) {
      bestScore = score;
      bestRow = i;
    }
  }

  return bestRow;
}

/**
 * Determine the used data range in a sheet.
 */
export function detectUsedRange(rows: unknown[][]): {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
} {
  let startRow = 0;
  let endRow = rows.length - 1;
  let startCol = 0;
  let endCol = 0;

  // Find first non-empty row
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row && row.some((c: unknown) => c !== null && c !== undefined && c !== '')) {
      startRow = i;
      break;
    }
  }

  // Find last non-empty row
  for (let i = rows.length - 1; i >= startRow; i--) {
    const row = rows[i];
    if (row && row.some((c: unknown) => c !== null && c !== undefined && c !== '')) {
      endRow = i;
      break;
    }
  }

  // Find column extents
  for (let i = startRow; i <= endRow; i++) {
    const row = rows[i];
    if (!row) continue;
    for (let j = row.length - 1; j >= 0; j--) {
      if (row[j] !== null && row[j] !== undefined && row[j] !== '') {
        if (j > endCol) endCol = j;
        break;
      }
    }
  }

  return { startRow, endRow, startCol, endCol };
}

/**
 * Extract sheet metadata from raw workbook data.
 */
export function detectSheets(
  sheetNames: string[],
  sheetData: Map<string, unknown[][]>
): SheetInfo[] {
  return sheetNames.map((name, index) => {
    const data = sheetData.get(name) || [];
    const rowCount = data.length;
    const columnCount = data.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
    const isEmpty = data.every(
      (row) => !row || row.every((c: unknown) => c === null || c === undefined || c === '')
    );
    const headerRow = isEmpty ? null : detectHeaderRow(data);

    return { index, name, rowCount, columnCount, isEmpty, headerRow };
  });
}

/**
 * Match source column headers to canonical fields using exact and fuzzy alias matching.
 */
export function matchColumns(
  headers: string[],
  canonicalFields: CanonicalFieldDef[],
  aliases: Map<string, string[]>
): ColumnMapping[] {
  const mappings: ColumnMapping[] = [];
  const usedIndices = new Set<number>();

  for (const field of canonicalFields) {
    const fieldAliases = aliases.get(field.fieldName) || [];
    const allNames = [field.fieldName, ...fieldAliases];

    let bestMatch: { index: number; confidence: number; alias: string; isExact: boolean } | null = null;

    for (let i = 0; i < headers.length; i++) {
      if (usedIndices.has(i)) continue;
      const header = (headers[i] || '').trim();
      if (!header) continue;

      const headerLower = header.toLowerCase().replace(/[\s_\-]+/g, '');

      for (const alias of allNames) {
        const aliasLower = alias.toLowerCase().replace(/[\s_\-]+/g, '');

        // Exact match
        if (headerLower === aliasLower) {
          if (!bestMatch || 1.0 > bestMatch.confidence) {
            bestMatch = { index: i, confidence: 1.0, alias, isExact: true };
          }
          break;
        }

        // Contains match
        if (headerLower.includes(aliasLower) || aliasLower.includes(headerLower)) {
          const conf = Math.min(headerLower.length, aliasLower.length) /
            Math.max(headerLower.length, aliasLower.length);
          if (!bestMatch || conf > bestMatch.confidence) {
            bestMatch = { index: i, confidence: Math.max(0.6, conf), alias, isExact: false };
          }
        }
      }
    }

    if (bestMatch) {
      usedIndices.add(bestMatch.index);
      mappings.push({
        canonicalField: field.fieldName,
        sourceColumnIndex: bestMatch.index,
        sourceHeader: headers[bestMatch.index] || '',
        confidence: bestMatch.confidence,
        matchedAlias: bestMatch.alias,
        isExact: bestMatch.isExact,
      });
    }
  }

  return mappings;
}

/**
 * Assess how confident the mapping is overall.
 */
export function assessMappingConfidence(
  mappings: ColumnMapping[],
  canonicalFields: CanonicalFieldDef[]
): MappingAssessment {
  const requiredFields = canonicalFields.filter((f) => f.required);
  const mappedRequired = requiredFields.filter((f) =>
    mappings.some((m) => m.canonicalField === f.fieldName && m.confidence >= 0.7)
  );
  const missing = requiredFields
    .filter((f) => !mappings.some((m) => m.canonicalField === f.fieldName))
    .map((f) => f.fieldName);

  const warnings: string[] = [];
  for (const m of mappings) {
    if (m.confidence < 0.8 && m.confidence >= 0.6) {
      warnings.push(`Low-confidence match: "${m.sourceHeader}" → ${m.canonicalField} (${Math.round(m.confidence * 100)}%)`);
    }
  }

  const avgConfidence =
    mappings.length > 0
      ? mappings.reduce((sum, m) => sum + m.confidence, 0) / mappings.length
      : 0;

  const requiredCoverage = requiredFields.length > 0
    ? mappedRequired.length / requiredFields.length
    : 1;

  return {
    confidence: Math.min(avgConfidence, requiredCoverage),
    mappedCount: mappings.length,
    requiredMappedCount: mappedRequired.length,
    totalRequired: requiredFields.length,
    missing,
    warnings,
  };
}

/**
 * Infer column types from sample data.
 */
export function inferColumnTypes(
  rows: unknown[][],
  headerRow: number,
  maxSamples = 50
): ColumnTypeInfo[] {
  const headers = (rows[headerRow] || []) as string[];
  const dataRows = rows.slice(headerRow + 1, headerRow + 1 + maxSamples);
  const result: ColumnTypeInfo[] = [];

  for (let col = 0; col < headers.length; col++) {
    const samples: string[] = [];
    let nullCount = 0;
    let numberCount = 0;
    let dateCount = 0;
    let stringCount = 0;

    for (const row of dataRows) {
      const cell = row?.[col];
      if (cell === null || cell === undefined || cell === '') {
        nullCount++;
        continue;
      }
      const str = String(cell);
      samples.push(str.slice(0, 100));

      if (typeof cell === 'number') numberCount++;
      else if (/^\d{4}-\d{2}-\d{2}/.test(str)) dateCount++;
      else stringCount++;
    }

    const total = dataRows.length;
    const nonNull = total - nullCount;
    let inferredType: ColumnTypeInfo['inferredType'] = 'string';

    if (nonNull === 0) inferredType = 'empty';
    else if (numberCount > nonNull * 0.8) inferredType = 'number';
    else if (dateCount > nonNull * 0.8) inferredType = 'date';
    else if (stringCount > nonNull * 0.8) inferredType = 'string';
    else inferredType = 'mixed';

    result.push({
      index: col,
      header: String(headers[col] || ''),
      inferredType,
      nullPercentage: total > 0 ? nullCount / total : 0,
      sampleValues: samples.slice(0, 5),
    });
  }

  return result;
}

/**
 * Create a structure fingerprint for drift detection.
 */
export function createFingerprint(
  sheetName: string,
  rows: unknown[][],
  headerRow: number
): StructureFingerprint {
  const headers = ((rows[headerRow] || []) as unknown[]).map((h) => String(h || ''));
  const columnTypes = inferColumnTypes(rows, headerRow);

  return {
    headerRow,
    headers,
    columnCount: headers.length,
    dataStartRow: headerRow + 1,
    sampleRowCount: Math.min(rows.length - headerRow - 1, 50),
    columnTypes,
    sheetName,
    generatedAt: new Date().toISOString(),
  };
}
