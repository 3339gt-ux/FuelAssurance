/**
 * Template Drift Detection
 *
 * Compares the structure of a newly uploaded file against previously accepted
 * files from the same provider to detect column additions, removals, renames,
 * reorderings, and type changes.
 */

import { DriftClassification, type DriftReport, type StructureFingerprint } from '@/domain/types';

/**
 * Compare two structure fingerprints and produce a drift report.
 */
export function compareStructure(
  current: StructureFingerprint,
  previous: StructureFingerprint
): DriftReport {
  const currentHeaders = current.headers.map((h) => h.toLowerCase().trim());
  const previousHeaders = previous.headers.map((h) => h.toLowerCase().trim());

  const currentSet = new Set(currentHeaders);
  const previousSet = new Set(previousHeaders);

  // Added columns
  const addedColumns = current.headers.filter(
    (_, i) => {
      const h = currentHeaders[i];
      return h !== undefined && !previousSet.has(h);
    }
  );

  // Removed columns
  const removedColumns = previous.headers.filter(
    (_, i) => {
      const h = previousHeaders[i];
      return h !== undefined && !currentSet.has(h);
    }
  );

  // Reordered columns (present in both but at different positions)
  const reorderedColumns: { header: string; oldIndex: number; newIndex: number; }[] = [];
  for (let i = 0; i < current.headers.length; i++) {
    const headerLow = currentHeaders[i];
    const headerVal = current.headers[i];
    if (headerLow === undefined || headerVal === undefined) continue;
    const prevIndex = previousHeaders.indexOf(headerLow);
    if (prevIndex !== -1 && prevIndex !== i) {
      reorderedColumns.push({
        header: headerVal,
        oldIndex: prevIndex,
        newIndex: i,
      });
    }
  }

  // Renamed columns (heuristic: same position, different header)
  const renamedColumns: { from: string; to: string; confidence: number; }[] = [];
  if (addedColumns.length > 0 && removedColumns.length > 0) {
    for (const added of addedColumns) {
      const addedIndex = current.headers.indexOf(added);
      for (const removed of removedColumns) {
        const removedIndex = previous.headers.indexOf(removed);
        if (addedIndex === removedIndex) {
          // Same position — likely a rename
          const similarity = computeSimilarity(
            added.toLowerCase(),
            removed.toLowerCase()
          );
          if (similarity > 0.4) {
            renamedColumns.push({
              from: removed,
              to: added,
              confidence: similarity,
            });
          }
        }
      }
    }
  }

  // Type changes for columns present in both
  const typeChanges: { header: string; oldType: string; newType: string; }[] = [];
  for (let i = 0; i < current.columnTypes.length; i++) {
    const ct = current.columnTypes[i];
    if (!ct) continue;
    const pt = previous.columnTypes.find(
      (p) => p.header.toLowerCase().trim() === ct.header.toLowerCase().trim()
    );
    if (pt && ct.inferredType !== pt.inferredType) {
      typeChanges.push({
        header: ct.header,
        oldType: pt.inferredType,
        newType: ct.inferredType,
      });
    }
  }

  return {
    addedColumns,
    removedColumns,
    renamedColumns,
    reorderedColumns,
    typeChanges,
    headerRowMoved: current.headerRow !== previous.headerRow,
    dataStartRowMoved: current.dataStartRow !== previous.dataStartRow,
    columnCountDelta: current.columnCount - previous.columnCount,
  };
}

/**
 * Classify a drift report into severity levels.
 */
export function classifyDrift(report: DriftReport): DriftClassification {
  // Breaking: required columns removed or header row moved
  if (report.removedColumns.length > 3 || report.headerRowMoved) {
    return DriftClassification.BREAKING;
  }

  // Major: columns removed or types changed significantly
  if (report.removedColumns.length > 0 || report.typeChanges.length > 2) {
    return DriftClassification.MAJOR;
  }

  // Minor: columns added or reordered
  if (
    report.addedColumns.length > 0 ||
    report.reorderedColumns.length > 0 ||
    report.renamedColumns.length > 0
  ) {
    return DriftClassification.MINOR;
  }

  // Cosmetic: only minor type changes
  if (report.typeChanges.length > 0 || report.dataStartRowMoved) {
    return DriftClassification.COSMETIC;
  }

  return DriftClassification.NONE;
}

/**
 * Simple string similarity using Jaccard index of character bigrams.
 */
function computeSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.substring(i, i + 2));

  const bigramsB = new Set<string>();
  for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.substring(i, i + 2));

  let intersection = 0;
  for (const bg of Array.from(bigramsA)) {
    if (bigramsB.has(bg)) intersection++;
  }

  return intersection / (bigramsA.size + bigramsB.size - intersection);
}
