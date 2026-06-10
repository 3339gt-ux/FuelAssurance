import { db } from '@/lib/db';
import { storeSourceFile } from '@/lib/file-storage';
import type { TransactionBatchRecord, TransactionSourceType } from '@/types/transaction-batch';
import { mapSourceTypeToProvider } from '@/lib/source-detection';

function buildSummaries(rows: any[]) {
  const productSummaries: Record<string, { count: number; volume: number }> = {};
  const currencySummaries: Record<string, { amountExVat: number; amountInclVat: number }> = {};
  const discountSummaries: Record<string, number> = {};
  const serviceFeeSummaries: Record<string, number> = {};
  const vatSummaries: Record<string, number> = {};

  for (const row of rows) {
    const product = row.productName || row.productType || 'Unknown';
    const vol = parseFloat(row.volume || row.quantity || '0');
    if (!productSummaries[product]) productSummaries[product] = { count: 0, volume: 0 };
    productSummaries[product]!.count++;
    if (!isNaN(vol)) productSummaries[product]!.volume += vol;

    const curr = row.paymentCurrency || row.serviceCurrency || 'EUR';
    const exVat = parseFloat(row.paymentAmountExVat || row.baseValueNet || row.valueOfPurchaseNet || '0');
    const inclVat = parseFloat(row.paymentAmountInclVat || row.baseValueGross || row.amountGross || '0');
    if (!currencySummaries[curr]) currencySummaries[curr] = { amountExVat: 0, amountInclVat: 0 };
    if (!isNaN(exVat)) currencySummaries[curr]!.amountExVat += exVat;
    if (!isNaN(inclVat)) currencySummaries[curr]!.amountInclVat += inclVat;

    const discount = parseFloat(row.discountNet || row.rebate || '0');
    if (!isNaN(discount) && discount !== 0) {
      discountSummaries[curr] = (discountSummaries[curr] || 0) + discount;
    }
    const fee = parseFloat(row.serviceFeeNet || '0');
    if (!isNaN(fee) && fee !== 0) {
      serviceFeeSummaries[curr] = (serviceFeeSummaries[curr] || 0) + fee;
    }
    const vat = parseFloat(row.vat || row.stationVatAmount || '0');
    if (!isNaN(vat) && vat !== 0) {
      vatSummaries[curr] = (vatSummaries[curr] || 0) + vat;
    }
  }

  return {
    productSummaries: Object.entries(productSummaries).map(([name, v]) => ({ name, ...v })),
    currencySummaries: Object.entries(currencySummaries).map(([currency, v]) => ({
      currency,
      amountExVat: parseFloat(v.amountExVat.toFixed(2)),
      amountInclVat: parseFloat(v.amountInclVat.toFixed(2)),
    })),
    discountSummaries: Object.entries(discountSummaries).map(([currency, total]) => ({
      currency,
      total: parseFloat(total.toFixed(2)),
    })),
    serviceFeeSummaries: Object.entries(serviceFeeSummaries).map(([currency, total]) => ({
      currency,
      total: parseFloat(total.toFixed(2)),
    })),
    vatSummaries: Object.entries(vatSummaries).map(([currency, total]) => ({
      currency,
      total: parseFloat(total.toFixed(2)),
    })),
  };
}

export interface CreateBatchParams {
  batchId: string;
  sourceType: TransactionSourceType;
  originalFileName: string;
  fileHash: string;
  buffer: Buffer;
  parserVersion: string;
  warnings: string[];
  rows: any[];
  statement?: {
    statementNumber?: string | undefined;
    statementDate?: string | undefined;
  } | undefined;
  uploadSummary?: any;
}

export function createTransactionBatch(params: CreateBatchParams): TransactionBatchRecord {
  const { provider } = mapSourceTypeToProvider(params.sourceType);
  const storedFileReference = storeSourceFile(params.fileHash, params.originalFileName, params.buffer);

  const uniqueVehicles = Array.from(
    new Set(
      params.rows
        .map((r) => (r.registration || r.vehicleRegistration || '').replace(/\s+/g, '').toUpperCase())
        .filter(Boolean)
    )
  );

  const dates = params.rows.map((r) => r.transactionDate).filter(Boolean).sort();
  const sourceDateMin = dates[0] ?? '';
  const sourceDateMax = dates[dates.length - 1] ?? '';

  const invoiceNumbers = Array.from(new Set(params.rows.map((r) => r.invoiceNumber).filter(Boolean)));
  const invoiceDates = Array.from(new Set(params.rows.map((r) => r.invoiceDate).filter(Boolean)));
  const documentNumbers = Array.from(new Set(params.rows.map((r) => r.documentNumber).filter(Boolean)));

  let totalFuelVolume = 0;
  const totalAmountExVatByCurrency: Record<string, number> = {};
  for (const row of params.rows) {
    const vol = parseFloat(row.volume || row.quantity || '0');
    if (!isNaN(vol)) {
      const pt = row.productType;
      if (pt === 'DIESEL' || pt === 'ADBLUE' || pt === 'GNR' || pt === 'RED_DIESEL') totalFuelVolume += vol;
    }
    const curr = row.paymentCurrency || row.serviceCurrency || 'EUR';
    const amt = parseFloat(row.paymentAmountExVat || row.baseValueNet || row.valueOfPurchaseNet || '0');
    if (!isNaN(amt)) totalAmountExVatByCurrency[curr] = (totalAmountExVatByCurrency[curr] || 0) + amt;
  }
  for (const key of Object.keys(totalAmountExVatByCurrency)) {
    totalAmountExVatByCurrency[key] = parseFloat(totalAmountExVatByCurrency[key]!.toFixed(2));
  }

  const vehicleCheckStatuses: Record<string, string> = {};
  for (const v of uniqueVehicles) vehicleCheckStatuses[v] = 'GPS not attached';

  const summaries = buildSummaries(params.rows);

  const batch: TransactionBatchRecord = {
    batchId: params.batchId,
    provider: provider as 'AS24' | 'DKV',
    sourceType: params.sourceType,
    originalFileName: params.originalFileName,
    fileHash: params.fileHash,
    storedFileReference,
    uploadedAt: new Date().toISOString(),
    parserVersion: params.parserVersion,
    ...(params.statement?.statementNumber ? { statementNumber: params.statement.statementNumber } : {}),
    ...(params.statement?.statementDate ? { statementDate: params.statement.statementDate } : {}),
    ...(invoiceNumbers.length ? { invoiceNumbers } : {}),
    ...(invoiceDates.length ? { invoiceDates } : {}),
    ...(documentNumbers.length ? { documentNumbers } : {}),
    sourceDateMin,
    sourceDateMax,
    transactionCount: params.rows.length,
    vehiclesFound: uniqueVehicles,
    vehicleSummaries: params.uploadSummary?.fleetVehiclesFound,
    productSummaries: summaries.productSummaries,
    currencySummaries: summaries.currencySummaries,
    discountSummaries: summaries.discountSummaries,
    serviceFeeSummaries: summaries.serviceFeeSummaries,
    vatSummaries: summaries.vatSummaries,
    warnings: params.warnings,
    attachedGpsFiles: [],
    vehicleCheckStatuses,
    verificationResults: {},
    processingStatus: 'parsed',
    // Legacy mirror fields
    id: params.batchId,
    filename: params.originalFileName,
    uploadDate: new Date().toISOString(),
    vehicles: uniqueVehicles,
    vehicleStatuses: vehicleCheckStatuses,
    checkResults: {},
    parsingWarnings: params.warnings,
    chargeSummary: {
      totalChargesCount: params.rows.length,
      totalFuelVolume: parseFloat(totalFuelVolume.toFixed(2)),
      totalAmountExVatByCurrency,
    },
  };

  const existing = db.find('transaction_batches', (b: any) => b.batchId === params.batchId || b.id === params.batchId);
  if (existing) {
    db.update('transaction_batches', existing.id, batch);
  } else {
    db.insert('transaction_batches', batch);
  }

  return batch;
}

export function getTransactionBatch(batchId: string): TransactionBatchRecord | null {
  const row = db.find('transaction_batches', (b: any) => b.batchId === batchId || b.id === batchId);
  return row ?? null;
}