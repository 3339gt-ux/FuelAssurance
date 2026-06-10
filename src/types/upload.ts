/**
 * Shared types for the /api/upload endpoint request and response.
 * Used by both the API route and the client pages so they cannot drift.
 */

import type { TransactionSourceType } from '@/types/transaction-batch';

export type UploadFileType =
  | 'AS24 Invoice (PDF)'
  | 'DKV Transactions'
  | 'DKV Invoice'
  | 'GPS / Telematics'
  | 'Station Workbook';

export type { TransactionSourceType };

export interface SourceDetectionInfo {
  candidates: Array<{ sourceType: TransactionSourceType; confidence: number; reason: string }>;
  detected: { sourceType: TransactionSourceType; confidence: number; reason: string } | null;
  needsConfirmation: boolean;
}

/** Structured error returned when a stage fails. */
export interface UploadError {
  success: false;
  stage: string;
  code: string;
  message: string;
  suggestedAction: string;
  detection?: SourceDetectionInfo;
  /** Only present in development */
  technicalDetails?: string;
}

/** Returned when the file was successfully imported (new or pre-existing). */
export interface UploadSuccess {
  success: true;
  fileId: string;
  message: string;
  alreadyImported: boolean;
  provider: string;
  documentType: string;
  sourceType?: TransactionSourceType;
  batchId?: string;
  uploadSummary?: UploadSummaryShape | null;
  gpsSummary?: GpsSummaryShape | null;
  summaryWarning?: string;
  pipelineResult?: any;
  /** Legacy field kept for backward-compatibility — may be removed in future. */
  importFile?: any;
}

export type UploadResponse = UploadSuccess | UploadError;

/** Mirrors the shape returned by generateUploadSummary() */
export interface UploadSummaryShape {
  fileOverview: {
    provider: string;
    fileName: string;
    documentType: string;
    pageOrSheetCount: number;
    transactionDateRange: string;
    totalTransactionRows: number;
    parsingWarnings: string[];
    warningHeadline?: string;
    informationalWarningCount?: number;
    warningSummary?: {
      blocking: Array<{ code: string; message: string; count: number }>;
      review: Array<{ code: string; message: string; count: number }>;
      informational: Array<{ code: string; message: string; count: number }>;
    };
  };
  fleetVehiclesFound: Array<{
    registration: string;
    make: string;
    model: string;
    chargeCount: number;
    dateRange: string;
    fuelLitresByProduct: Record<string, number>;
    monetaryTotalsByCurrency: Record<string, number>;
    countries: string[];
    stations: string[];
    chargeCategories: string[];
  }>;
  chargeBreakdown: Array<{
    category: string;
    chargeCount: number;
    totalQuantity: number;
    totalAmountByCurrency: Record<string, number>;
    relevantVehicles: string[];
  }>;
  nonFleetVehicles: Array<{
    rawRegistration: string;
    normalizedRegistration: string;
    source: string;
  }>;
  unassignedCharges: any[];
}

/** Mirrors the shape returned by generateGpsSummary() */
export interface GpsSummaryShape {
  rawRegistration: string;
  detectedCanonicalRegistration: string;
  make: string;
  model: string;
  dateRange: string;
  gpsRecordCount: number;
  fuelLevelMin: number | null;
  fuelLevelMax: number | null;
  odometerMin: number | null;
  odometerMax: number | null;
  locationEvidenceAvailable: boolean;
  engineEvidenceAvailable: boolean;
  inRegistry: boolean;
  warnings: string[];
}
