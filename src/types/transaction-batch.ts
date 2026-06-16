/**
 * Persistent Transaction Batch — reusable source upload with GPS attachments.
 */

export type TransactionSourceType =
  | 'AS24 Invoice PDF'
  | 'DKV Daily Transaction Excel'
  | 'DKV Invoice-Period Excel'
  | 'DKV Invoice PDF'
  | 'GPS / Telematics';

export type BatchProcessingStatus =
  | 'parsed'
  | 'confirmed'
  | 'gps_partial'
  | 'checks_running'
  | 'checks_complete'
  | 'error';

export interface GpsAttachment {
  fileName: string;
  fileHash: string;
  fileId?: string;
  vehicleRegistration: string;
  uploadedAt: string;
  coverageStart: string;
  coverageEnd: string;
}

export interface VehicleCheckStatus {
  registration: string;
  status: string;
  gpsAttached: boolean;
  lastCheckedAt?: string;
}

export interface TransactionBatchRecord {
  batchId: string;
  provider: 'AS24' | 'DKV';
  sourceType: TransactionSourceType;
  originalFileName: string;
  fileHash: string;
  storedFileReference: string;
  uploadedAt: string;
  parserVersion: string;
  statementNumber?: string;
  statementDate?: string;
  invoiceNumbers?: string[];
  invoiceDates?: string[];
  documentNumbers?: string[];
  sourceDateMin?: string;
  sourceDateMax?: string;
  transactionCount: number;
  vehiclesFound: string[];
  transactions?: unknown[];
  vehicleSummaries?: unknown[];
  productSummaries?: unknown[];
  currencySummaries?: unknown[];
  discountSummaries?: unknown[];
  serviceFeeSummaries?: unknown[];
  vatSummaries?: unknown[];
  warnings: string[];
  corrections?: unknown[];
  attachedGpsFiles: GpsAttachment[];
  vehicleCheckStatuses: Record<string, string>;
  verificationResults: Record<string, unknown>;
  processingStatus: BatchProcessingStatus;
  /** Legacy fields kept for backward compatibility */
  id?: string;
  filename?: string;
  uploadDate?: string;
  vehicles?: string[];
  vehicleStatuses?: Record<string, string>;
  checkResults?: Record<string, unknown>;
  parsingWarnings?: string[];
  chargeSummary?: {
    totalChargesCount: number;
    totalFuelVolume: number;
    totalAmountExVatByCurrency: Record<string, number>;
  };
}