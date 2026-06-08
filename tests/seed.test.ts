import { describe, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import pdf from 'pdf-parse';
import { db } from '@/lib/db';
import { runFullPipeline } from '@/lib/pipeline';
import { parseDKVTransactions } from '@/domain/parsers/dkv/dkv-transaction-parser';
import { parseDKVInvoice } from '@/domain/parsers/dkv/dkv-invoice-parser';
import { parseGPSFile } from '@/domain/parsers/gps/gps-parser';
import { parseAS24PDF } from '@/domain/parsers/as24/as24-pdf-parser';
import { parseStationWorkbook } from '@/domain/parsers/stations/station-parser';

describe('Seed database', () => {
  it('should seed the database with all real sample files', async () => {
    // Clear existing DB cache
    db.truncate('import_files');
    db.truncate('import_rows');
    db.truncate('transactions');
    db.truncate('invoice_transactions');
    db.truncate('telematics_points');
    db.truncate('reconciliation_runs');
    db.truncate('reconciliation_matches');
    db.truncate('reasoning_ledgers');
    db.truncate('stations');
    db.truncate('discounts');
    db.truncate('prices');
    db.truncate('review_decisions');
    db.truncate('audit_events');

    // 1. Seed Station Master
    const stationPath = path.resolve(process.cwd(), 'Sample Files/DKV _AS24 List (4).xlsx');
    const stationWb = XLSX.readFile(stationPath);
    const stationData = new Map<string, unknown[][]>();
    for (const name of stationWb.SheetNames) {
      stationData.set(name, XLSX.utils.sheet_to_json<unknown[]>(stationWb.Sheets[name!]!, { header: 1 }));
    }
    const parsedStations = parseStationWorkbook(stationWb.SheetNames, stationData, 'station-file-id');
    db.insertMany('stations', parsedStations.stations);

    // 2. Seed GPS
    const gpsPath = path.resolve(process.cwd(), 'Sample Files/GPS 1.xls');
    const gpsWb = XLSX.readFile(gpsPath);
    const gpsRows = XLSX.utils.sheet_to_json<unknown[]>(gpsWb.Sheets[gpsWb.SheetNames[0]!]!, { header: 1 });
    const parsedGPS = parseGPSFile(gpsRows, 'gps-file-id');
    db.insertMany('telematics_points', parsedGPS.points);

    // 3. Seed DKV Transactions
    const txPath = path.resolve(process.cwd(), 'Sample Files/Ola_Report_2026-06-08 (2).xlsx');
    const txWb = XLSX.readFile(txPath);
    const txRows = XLSX.utils.sheet_to_json<unknown[]>(txWb.Sheets[txWb.SheetNames[0]!]!, { header: 1 });
    const parsedTx = parseDKVTransactions(txRows, 'tx-file-id');
    db.insertMany('transactions', parsedTx.transactions);

    // 4. Seed DKV Invoice
    const invPath = path.resolve(process.cwd(), 'Sample Files/Invoice-Transactions_Report_2026-06-08 (2).xlsx');
    const invWb = XLSX.readFile(invPath);
    const invRows = XLSX.utils.sheet_to_json<unknown[]>(invWb.Sheets[invWb.SheetNames[0]!]!, { header: 1 });
    const parsedInv = parseDKVInvoice(invRows, 'inv-file-id');
    db.insertMany('invoice_transactions', parsedInv.invoiceRows);

    // 5. Seed AS24 PDF Invoice
    const pdfPath = path.resolve(process.cwd(), 'Sample Files/document_direct.pdf');
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfData = await pdf(pdfBuffer);
    const parsedPdf = parseAS24PDF(pdfData.text, 'pdf-file-id');
    db.insertMany('invoice_transactions', parsedPdf.invoiceRows);

    // Seed file metadata
    db.insert('import_files', {
      id: 'tx-file-id',
      file_name: 'Ola_Report_2026-06-08 (2).xlsx',
      provider: 'DKV',
      document_type: 'TRANSACTION',
      file_hash: 'hash-tx',
      file_size: 5788,
      mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upload_date: new Date().toISOString(),
      parser_version: 'Variant 2',
      import_status: 'completed',
      row_count: parsedTx.transactions.length,
      page_count: 1,
      warning_count: 0,
      error_count: 0,
      control_total_status: 'not_applicable',
    });

    db.insert('import_files', {
      id: 'inv-file-id',
      file_name: 'Invoice-Transactions_Report_2026-06-08 (2).xlsx',
      provider: 'DKV',
      document_type: 'INVOICE',
      file_hash: 'hash-inv',
      file_size: 51630,
      mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upload_date: new Date().toISOString(),
      parser_version: '1.0.0',
      import_status: 'completed',
      row_count: parsedInv.invoiceRows.length,
      page_count: 1,
      warning_count: 0,
      error_count: 0,
      control_total_status: 'not_applicable',
    });

    db.insert('import_files', {
      id: 'pdf-file-id',
      file_name: 'document_direct.pdf',
      provider: 'AS24',
      document_type: 'INVOICE',
      file_hash: 'hash-pdf',
      file_size: 613464,
      mime_type: 'application/pdf',
      upload_date: new Date().toISOString(),
      parser_version: '1.0.0',
      import_status: 'completed',
      row_count: parsedPdf.invoiceRows.length,
      page_count: pdfData.numpages || 1,
      warning_count: 0,
      error_count: 0,
      control_total_status: 'matched',
    });

    // 6. Run Reconciliation & Telematics Pipeline
    const pipelineResult = runFullPipeline();
    console.log('Seeding and pipeline reconciliation completed successfully:', pipelineResult?.run);
  });
});
