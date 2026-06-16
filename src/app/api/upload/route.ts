import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import pdf from 'pdf-parse';
import { db, DEFAULT_USER_ID } from '@/lib/db';

import { parseDKVTransactions } from '@/domain/parsers/dkv/dkv-transaction-parser';
import { parseDKVInvoice } from '@/domain/parsers/dkv/dkv-invoice-parser';
import { parseGPSFile } from '@/domain/parsers/gps/gps-parser';
import { parseStationWorkbook } from '@/domain/parsers/stations/station-parser';
import { parseAS24PDF } from '@/domain/parsers/as24/as24-pdf-parser';
import { parseDKVInvoicePDF } from '@/domain/parsers/dkv/dkv-invoice-pdf-parser';
import { generateUploadSummary, generateGpsSummary } from '@/lib/upload-summary';
import type { UploadResponse } from '@/types/upload';
import { getCachedParse, setCachedParse, CURRENT_PARSER_VERSION } from '@/lib/parse-cache';
import {
  detectSourceType,
  mapLegacyTypeToSourceType,
  mapSourceTypeToProvider,
} from '@/lib/source-detection';
import { createTransactionBatch } from '@/lib/transaction-batch-service';
import type { TransactionSourceType } from '@/types/transaction-batch';

const IS_DEV = process.env.NODE_ENV !== 'production';

function stageError(
  stage: string,
  code: string,
  message: string,
  suggestedAction: string,
  err?: unknown
): NextResponse {
  const body: UploadResponse = {
    success: false,
    stage,
    code,
    message,
    suggestedAction,
    ...(IS_DEV && err ? { technicalDetails: String(err) } : {}),
  };
  return NextResponse.json(body, { status: 422 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Stage: file-read ────────────────────────────────────────────────────────
  let file: File;
  let specifiedType: string;
  let confirmedType: string;
  try {
    const formData = await req.formData();
    file = formData.get('file') as File;
    specifiedType = (formData.get('type') as string) || '';
    confirmedType = (formData.get('confirmedType') as string) || specifiedType;
    if (!file || !(file instanceof File)) {
      return stageError('file-read', 'NO_FILE', 'No file was attached to the request.', 'Ensure the file field is included in the form data.');
    }
  } catch (err) {
    return stageError('file-read', 'FORM_READ_FAILED', 'Could not read the uploaded form data.', 'Try uploading again. If this persists, check your network connection.', err);
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch (err) {
    return stageError('file-read', 'BUFFER_READ_FAILED', 'Could not read the file content.', 'The file may be corrupt or empty. Try re-exporting it from the source.', err);
  }

  const fileName = file.name;
  const fileSize = file.size;
  const mimeType = file.type || '';
  const fileLower = fileName.toLowerCase();
  const isPDF = mimeType === 'application/pdf' || fileLower.endsWith('.pdf');

  // ── Stage: type-detection (structure-based) ───────────────────────────────
  const detection = await detectSourceType(buffer, fileName, mimeType, confirmedType || undefined);

  if (!confirmedType && detection.needsConfirmation) {
    return NextResponse.json({
      success: false,
      stage: 'type-detection',
      code: 'CONFIRMATION_REQUIRED',
      message: detection.detected
        ? `Detected likely type: ${detection.detected.sourceType} (${Math.round(detection.detected.confidence * 100)}% confidence). Please confirm.`
        : `Could not confidently determine the file type for "${fileName}".`,
      suggestedAction: 'Review the detected possibilities and confirm the correct source type before import.',
      detection: {
        candidates: detection.candidates,
        detected: detection.detected,
        needsConfirmation: true,
      },
    }, { status: 422 });
  }

  let sourceType: TransactionSourceType | null =
    mapLegacyTypeToSourceType(confirmedType) ??
    (detection.detected?.sourceType ?? null);

  if (!sourceType && specifiedType === 'Station Workbook') {
    sourceType = null; // handled below
  }

  let provider = 'UNKNOWN';
  let documentType = 'UNKNOWN';

  if (sourceType) {
    const mapped = mapSourceTypeToProvider(sourceType);
    provider = mapped.provider;
    documentType = mapped.documentType;
  } else if (specifiedType === 'Station Workbook' || fileLower.includes('station') || fileLower.includes('yard') || fileLower.includes('price')) {
    provider = 'STATION';
    documentType = 'STATION';
  }

  if (provider === 'UNKNOWN') {
    return stageError(
      'type-detection',
      'UNKNOWN_FILE_TYPE',
      `The file "${fileName}" could not be matched to a supported type.`,
      'Confirm the source type (AS24 PDF, DKV daily, DKV invoice-period, or GPS) and try again.'
    );
  }

  // ── Stage: duplicate-check ──────────────────────────────────────────────────
  let hash: string;
  try {
    hash = crypto.createHash('sha256').update(buffer).digest('hex');
  } catch (err) {
    return stageError('file-read', 'HASH_FAILED', 'Could not compute file hash.', 'Try uploading again.', err);
  }

  const cached = getCachedParse(hash, CURRENT_PARSER_VERSION);
  if (cached) {
    const batch = db.find('transaction_batches', (b: any) => b.id === cached.fileId);
    const resolvedSourceType = batch?.sourceType || (cached.provider === 'AS24' ? 'AS24 Invoice PDF' : cached.provider === 'DKV' ? (isPDF ? 'DKV Invoice PDF' : cached.documentType === 'TRANSACTION' ? 'DKV Daily Transaction Excel' : 'DKV Invoice-Period Excel') : 'DKV Invoice-Period Excel');

    return NextResponse.json({
      success: true,
      fileId: cached.fileId,
      message: 'Parsed results loaded from cache',
      alreadyImported: true,
      provider: cached.provider,
      documentType: cached.documentType,
      uploadSummary: cached.uploadSummary as UploadResponse extends { uploadSummary?: infer U } ? U : never,
      gpsSummary: cached.gpsSummary as UploadResponse extends { gpsSummary?: infer U } ? U : never,
      sourceType: resolvedSourceType,
    } satisfies UploadResponse);
  }

  const existingFile = db.findImportByHash(hash) ?? db.find('import_files', (f: any) => f.file_hash === hash);
  if (existingFile) {
    // Re-build summaries from stored metadata so the UI always gets the full response
    const storedMeta = existingFile.metadata || {};
    const storedUploadSummary = storedMeta.uploadSummary || null;
    const storedGpsSummary = storedMeta.gpsSummary || null;
    const resolvedProvider = existingFile.provider || provider;
    const resolvedDocType = existingFile.document_type || documentType;
    const batch = db.find('transaction_batches', (b: any) => b.id === existingFile.id);
    const resolvedSourceType = batch?.sourceType || (resolvedProvider === 'AS24' ? 'AS24 Invoice PDF' : resolvedProvider === 'DKV' ? (existingFile.file_name?.toLowerCase().endsWith('.pdf') || isPDF ? 'DKV Invoice PDF' : resolvedDocType === 'TRANSACTION' ? 'DKV Daily Transaction Excel' : 'DKV Invoice-Period Excel') : 'DKV Invoice-Period Excel');

    return NextResponse.json({
      success: true,
      fileId: existingFile.id,
      message: 'File already imported previously',
      alreadyImported: true,
      provider: resolvedProvider,
      documentType: resolvedDocType,
      uploadSummary: storedUploadSummary,
      gpsSummary: storedGpsSummary,
      sourceType: resolvedSourceType,
    } satisfies UploadResponse);
  }

  const fileId = crypto.randomUUID();

  // ── Stage: core-parse ───────────────────────────────────────────────────────
  let rowCount = 0;
  let pageCount = 1;
  let warningCount = 0;
  let errorCount = 0;
  let controlTotalStatus = 'not_applicable';
  let parserVersion = '1.0.0';
  let warnings: string[] = [];
  let uploadSummary: any = null;
  let gpsSummary: any = null;
  let summaryWarning: string | undefined;
  let as24Statement: { statementNumber?: string; statementDate?: string } | undefined;

  if (isPDF) {
    // ── PDF Invoice Parsing ───────────────────────────────────────────────────
    const pagesData: any[] = [];
    let pdfData: any;

    try {
      const options = {
        pagerender: (pageData: any) => {
          return pageData.getTextContent().then((textContent: any) => {
            const items = textContent.items.map((item: any) => ({
              str: item.str,
              x: item.transform[4],
              y: item.transform[5],
              width: item.width,
              height: item.height,
            }));
            pagesData.push({ pageNum: pageData.pageIndex + 1, items });

            // Replicate standard text rendering
            let lastY: number | undefined;
            let text = '';
            for (const item of textContent.items) {
              if (lastY === item.transform[5] || lastY === undefined) {
                text += item.str;
              } else {
                text += '\n' + item.str;
              }
              lastY = item.transform[5];
            }
            return text;
          });
        },
      };
      pdfData = await pdf(buffer, options);
    } catch (err) {
      return stageError(
        'core-parse',
        'PDF_READ_FAILED',
        `The file "${fileName}" could not be read as a PDF.`,
        'Ensure the file is a valid PDF invoice, not a scanned image or password-protected file.',
        err
      );
    }

    pageCount = pdfData.numpages || 1;
    pagesData.sort((a, b) => a.pageNum - b.pageNum);

    let parseResult: any;
    if (provider === 'AS24') {
      try {
        parseResult = parseAS24PDF(pdfData.text, fileId, pagesData);
      } catch (err) {
        return stageError(
          'core-parse',
          'AS24_PARSE_FAILED',
          `The AS24 PDF parser failed on "${fileName}".`,
          'Check that the file is an AS24 invoice in a supported format (Cards Filling List or PASSango sections expected).',
          err
        );
      }
    } else if (provider === 'DKV') {
      try {
        parseResult = parseDKVInvoicePDF(pdfData.text, fileId, pagesData);
      } catch (err) {
        return stageError(
          'core-parse',
          'DKV_PDF_PARSE_FAILED',
          `The DKV PDF parser failed on "${fileName}".`,
          'Check that the file is a DKV PDF invoice in a supported format.',
          err
        );
      }
    } else {
      return stageError(
        'type-detection',
        'UNSUPPORTED_PDF_PROVIDER',
        `The PDF provider "${provider}" is not supported.`,
        'Only AS24 and DKV PDF invoices are supported.'
      );
    }

    if (!parseResult || parseResult.invoiceRows.length === 0) {
      return stageError(
        'core-parse',
        'PDF_NO_ROWS',
        `No transactions were found in "${fileName}".`,
        'Verify the file contains valid transactions. Empty invoices cannot be imported.'
      );
    }

    // Populate sourceFileName in sourceEvidence
    for (const row of parseResult.invoiceRows) {
      if (row.sourceEvidence) {
        (row.sourceEvidence as any).sourceFileName = fileName;
      }
    }

    rowCount = parseResult.invoiceRows.length;
    const rowWarnings = parseResult.invoiceRows.flatMap((r: any) => r.warnings || []);
    const errorRows = parseResult.invoiceRows.filter((r: any) => r.status === 'PARSER_MAPPING_ERROR');
    warnings = [...rowWarnings];
    warningCount = warnings.length;
    errorCount = errorRows.length;
    parserVersion = pagesData.length > 0 ? '2.0.0-coordinate' : '1.0.0-fallback';

    // Persist rows
    try {
      const rowsToSave = parseResult.invoiceRows.map((row: any, idx: number) => ({
        id: row.id || crypto.randomUUID(),
        import_file_id: fileId,
        sheet_name: 'PDF',
        source_row_number: row.importRowIndex || idx + 1,
        raw_data: row,
        normalised_data: row,
        status: 'imported',
        warnings: row.warnings || [],
      }));
      db.insertMany('import_rows', rowsToSave);
      db.insertMany('invoice_transactions', parseResult.invoiceRows);
    } catch (err) {
      return stageError('persistence', 'DB_INSERT_FAILED', 'Failed to save transaction rows to the database.', 'Check that the database file is writable.', err);
    }

    // ── summary-generation (optional — must not block import) ─────────────────
    try {
      uploadSummary = await generateUploadSummary(
        buffer, mimeType || 'application/pdf', fileName, provider as 'AS24' | 'DKV', 'INVOICE',
        pageCount, warnings, parseResult.invoiceRows
      );
    } catch (err) {
      summaryWarning = `Upload summary generation failed (${String(err).slice(0, 120)}). Core import succeeded.`;
      console.warn('Summary generation error (non-fatal):', err);
    }

    if (parseResult.statement) {
      as24Statement = {
        statementNumber: parseResult.statement.statementNumber || parseResult.statement.documentNumber,
        statementDate: parseResult.statement.statementDate || parseResult.statement.documentDate,
      };
    }

    // Control-total audit
    if (parseResult.statement) {
      try {
        if (provider === 'AS24') {
          const recalcGross = parseResult.invoiceRows.reduce(
            (sum: number, r: any) => sum + parseFloat(r.baseValueGross || '0'), 0
          );
          const stmtGross = parseFloat(parseResult.statement.totalGrossAmount || '0');
          const diff = Math.abs(recalcGross - stmtGross);
          controlTotalStatus = diff > 5.00 ? 'unmatched' : 'matched';
          if (diff > 5.00) {
            warningCount++;
            warnings.push(
              `CONTROL_TOTAL_FAILURE: Recalculated gross (€${recalcGross.toFixed(2)}) does not match statement total (€${stmtGross.toFixed(2)}) within €5.00 tolerance (diff: €${diff.toFixed(2)}).`
            );
          }
        } else if (provider === 'DKV') {
          const recalcGross = parseResult.invoiceRows.reduce(
            (sum: number, r: any) => sum + parseFloat(r.valueInPayCurrency || '0'), 0
          );
          const stmtGross = parseFloat(parseResult.statement.statementTotalPaymentCurrency || '0');
          const diff = Math.abs(recalcGross - stmtGross);
          controlTotalStatus = diff > 5.00 ? 'unmatched' : 'matched';
          if (diff > 5.00) {
            warningCount++;
            warnings.push(
              `CONTROL_TOTAL_FAILURE: Recalculated gross (€${recalcGross.toFixed(2)}) does not match statement total (€${stmtGross.toFixed(2)}) within €5.00 tolerance (diff: €${diff.toFixed(2)}).`
            );
          }
        }
      } catch {
        // Non-fatal
      }
    }

  } else if (provider === 'GPS') {
    // ── GPS / Telematics ──────────────────────────────────────────────────────
    let workbook: any;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch (err) {
      return stageError(
        'core-parse',
        'GPS_WORKBOOK_READ_FAILED',
        `The file "${fileName}" could not be read as a spreadsheet.`,
        'Ensure the file is a valid XLS or XLSX workbook, not a CSV or corrupted file.',
        err
      );
    }

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return stageError('core-parse', 'GPS_NO_SHEETS', `The workbook "${fileName}" contains no sheets.`, 'Ensure the GPS export contains at least one data sheet.');
    }

    const worksheet = workbook.Sheets[firstSheetName];
    let rawJsonRows: unknown[][];
    try {
      rawJsonRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet!, { header: 1 });
    } catch (err) {
      return stageError('core-parse', 'GPS_SHEET_READ_FAILED', `Could not read sheet "${firstSheetName}" from "${fileName}".`, 'Try re-exporting the GPS file from the telematics portal.', err);
    }

    let parseResult: any;
    try {
      parseResult = parseGPSFile(rawJsonRows, fileId);
    } catch (err) {
      return stageError('core-parse', 'GPS_PARSE_FAILED', `The GPS parser failed on "${fileName}".`, 'Check that the workbook has recognisable column headings (Vehicle, Date, Fuel Level, etc.).', err);
    }

    if (!parseResult || parseResult.points.length === 0) {
      return stageError(
        'core-parse',
        'GPS_NO_POINTS',
        `No GPS data points were extracted from "${fileName}".`,
        'Ensure the sheet contains a Vehicle column and at least one data row. The header row must be detectable.'
      );
    }

    rowCount = parseResult.points.length;
    warnings = parseResult.warnings || [];
    warningCount = warnings.length;
    pageCount = workbook.SheetNames.length;

    // Update sourceFileName in sourceEvidence
    for (const point of parseResult.points) {
      if (point.sourceEvidence) {
        (point.sourceEvidence as any).sourceFileName = fileName;
        (point.sourceEvidence as any).worksheetName = firstSheetName;
      }
    }

    // Persist rows
    try {
      const rowsToSave = parseResult.points.map((row: any, idx: number) => ({
        import_file_id: fileId,
        sheet_name: firstSheetName,
        source_row_number: idx + 1,
        raw_data: row,
        normalised_data: row,
        status: 'imported',
        warnings: [],
      }));
      db.insertMany('import_rows', rowsToSave);
      db.insertMany('telematics_points', parseResult.points);
    } catch (err) {
      return stageError('persistence', 'DB_INSERT_FAILED', 'Failed to save GPS points to the database.', 'Check that the database file is writable.', err);
    }

    // ── summary-generation (optional) ─────────────────────────────────────────
    try {
      gpsSummary = generateGpsSummary(parseResult);
    } catch (err) {
      summaryWarning = `GPS summary generation failed (${String(err).slice(0, 120)}). Core import succeeded.`;
      console.warn('GPS summary error (non-fatal):', err);
    }

  } else {
    // ── DKV / Station spreadsheet ─────────────────────────────────────────────
    let workbook: any;
    let parseResult: any;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch (err) {
      return stageError('core-parse', 'WORKBOOK_READ_FAILED', `The file "${fileName}" could not be read as a spreadsheet.`, 'Ensure the file is a valid XLS or XLSX workbook.', err);
    }

    const firstSheetName = workbook.SheetNames[0];
    pageCount = workbook.SheetNames.length;

    if (provider === 'DKV' && documentType === 'TRANSACTION') {
      const worksheet = workbook.Sheets[firstSheetName!];
      const rawJsonRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet!, { header: 1 });
      try {
        parseResult = parseDKVTransactions(rawJsonRows, fileId, firstSheetName || undefined);
      } catch (err) {
        return stageError('core-parse', 'DKV_TX_PARSE_FAILED', `The DKV transaction parser failed on "${fileName}".`, 'Ensure the file is a DKV transaction export in a supported format.', err);
      }
      rowCount = parseResult.transactions.length;
      warnings = parseResult.warnings || [];
      warningCount = warnings.length;
      parserVersion = `Variant ${parseResult.variant}`;

      // Update sourceFileName in sourceEvidence
      for (const tx of parseResult.transactions) {
        if (tx.sourceEvidence) {
          (tx.sourceEvidence as any).sourceFileName = fileName;
        }
      }

      try {
        db.insertMany('import_rows', parseResult.rawRows.map((row: any) => ({
          import_file_id: fileId, sheet_name: firstSheetName, source_row_number: row.rowIndex,
          raw_data: row, normalised_data: row, status: 'imported', warnings: [],
        })));
        db.insertMany('transactions', parseResult.transactions);
      } catch (err) {
        return stageError('persistence', 'DB_INSERT_FAILED', 'Failed to save DKV transactions to the database.', 'Check that the database file is writable.', err);
      }
      try {
        uploadSummary = await generateUploadSummary(buffer, mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileName, 'DKV', 'TRANSACTION', pageCount, warnings, parseResult.transactions);
      } catch (err) {
        summaryWarning = `Upload summary generation failed. Core import succeeded.`;
        console.warn('Summary error:', err);
      }

    } else if (provider === 'DKV' && documentType === 'INVOICE') {
      const worksheet = workbook.Sheets[firstSheetName!];
      const rawJsonRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet!, { header: 1 });
      let parseResult: any;
      try {
        parseResult = parseDKVInvoice(rawJsonRows, fileId, firstSheetName || undefined);
      } catch (err) {
        return stageError('core-parse', 'DKV_INV_PARSE_FAILED', `The DKV invoice parser failed on "${fileName}".`, 'Ensure the file is a DKV invoice export in a supported format.', err);
      }
      rowCount = parseResult.invoiceRows.length;
      warnings = parseResult.warnings || [];
      warningCount = warnings.length;

      // Update sourceFileName in sourceEvidence
      for (const row of parseResult.invoiceRows) {
        if (row.sourceEvidence) {
          (row.sourceEvidence as any).sourceFileName = fileName;
        }
      }

      try {
        db.insertMany('import_rows', parseResult.rawRows.map((row: any) => ({
          import_file_id: fileId, sheet_name: firstSheetName, source_row_number: row.rowIndex,
          raw_data: row, normalised_data: row, status: 'imported', warnings: [],
        })));
        db.insertMany('invoice_transactions', parseResult.invoiceRows);
      } catch (err) {
        return stageError('persistence', 'DB_INSERT_FAILED', 'Failed to save DKV invoice rows.', 'Check that the database file is writable.', err);
      }
      try {
        uploadSummary = await generateUploadSummary(buffer, mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileName, 'DKV', 'INVOICE', pageCount, warnings, parseResult.invoiceRows);
      } catch (err) {
        summaryWarning = `Upload summary generation failed. Core import succeeded.`;
        console.warn('Summary error:', err);
      }

    } else if (provider === 'STATION') {
      const sheetData = new Map<string, unknown[][]>();
      for (const sName of workbook.SheetNames) {
        const ws = workbook.Sheets[sName!];
        sheetData.set(sName, XLSX.utils.sheet_to_json<unknown[]>(ws!, { header: 1 }));
      }
      let parseResult: any;
      try {
        parseResult = parseStationWorkbook(workbook.SheetNames, sheetData, fileId);
      } catch (err) {
        return stageError('core-parse', 'STATION_PARSE_FAILED', `The station workbook parser failed on "${fileName}".`, 'Ensure the file is a valid station workbook.', err);
      }
      rowCount = parseResult.stations.length;
      warnings = parseResult.warnings || [];
      warningCount = warnings.length;
      try {
        db.insertMany('import_rows', parseResult.rawRows.map((row: any, idx: number) => ({
          import_file_id: fileId, sheet_name: row.sourceSheet, source_row_number: idx + 1,
          raw_data: row, normalised_data: row, status: 'imported', warnings: [],
        })));
        db.insertMany('stations', parseResult.stations);
        parseResult.stations.forEach((st: any) => {
          if (st.discount) db.insert('discounts', { station_id: st.id, product_type: st.productType, discount_value: st.discount, rate_type: 'FIXED', effective_from: st.applicationDate || new Date().toISOString(), effective_to: null });
          if (st.costPerLitre) db.insert('prices', { station_id: st.id, product_type: st.productType, price_ex_vat: st.costPerLitre, price_inc_vat: st.costPerLitre, price_date: st.applicationDate || new Date().toISOString() });
        });
      } catch (err) {
        return stageError('persistence', 'DB_INSERT_FAILED', 'Failed to save station records.', 'Check that the database file is writable.', err);
      }
    }
  }

  // ── Stage: persistence (import file record) ─────────────────────────────────
  const importStatus = warningCount > 0 ? 'completed_with_warnings' : 'completed';
  let importFile: any;
  try {
    importFile = db.insert('import_files', {
      id: fileId,
      file_name: fileName,
      provider,
      document_type: documentType,
      file_hash: hash,
      file_size: fileSize,
      mime_type: mimeType || (isPDF ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
      upload_date: new Date().toISOString(),
      uploaded_by: DEFAULT_USER_ID,
      parser_version: parserVersion,
      import_status: importStatus,
      row_count: rowCount,
      page_count: pageCount,
      warning_count: warningCount,
      error_count: errorCount,
      control_total_status: controlTotalStatus,
      metadata: {
        warnings,
        uploadSummary,
        gpsSummary,
      },
    });
  } catch (err) {
    return stageError('persistence', 'IMPORT_FILE_INSERT_FAILED', 'Failed to save the import file record.', 'Check that the database file is writable and not locked.', err);
  }

  // ── Stage: transaction-batch creation ───────────────────────────────────────
  if (provider === 'DKV' || provider === 'AS24') {
    try {
      const rows = provider === 'DKV'
        ? (documentType === 'TRANSACTION'
          ? db.select('transactions', (t: any) => t.importFileId === fileId)
          : db.select('invoice_transactions', (t: any) => t.importFileId === fileId))
        : db.select('invoice_transactions', (t: any) => t.importFileId === fileId);

      const batchSourceType: TransactionSourceType =
        sourceType ??
        (provider === 'AS24'
          ? 'AS24 Invoice PDF'
          : documentType === 'TRANSACTION'
            ? 'DKV Daily Transaction Excel'
            : 'DKV Invoice-Period Excel');

      createTransactionBatch({
        batchId: fileId,
        sourceType: batchSourceType,
        originalFileName: fileName,
        fileHash: hash,
        buffer,
        parserVersion: parserVersion || CURRENT_PARSER_VERSION,
        warnings,
        rows,
        ...(as24Statement ? { statement: as24Statement } : {}),
        uploadSummary,
      });
    } catch (err) {
      console.warn('Batch creation failed (non-fatal):', err);
    }
  }

  setCachedParse({
    fileHash: hash,
    parserVersion: parserVersion || CURRENT_PARSER_VERSION,
    provider,
    documentType,
    fileId,
    rowCount,
    pageCount,
    warnings,
    uploadSummary,
    gpsSummary,
    cachedAt: new Date().toISOString(),
  });

  // ── Stage: response ─────────────────────────────────────────────────────────
  const batchSourceType: TransactionSourceType | undefined =
    sourceType ??
    (provider === 'AS24'
      ? 'AS24 Invoice PDF'
      : provider === 'DKV'
        ? documentType === 'TRANSACTION'
          ? 'DKV Daily Transaction Excel'
          : 'DKV Invoice-Period Excel'
        : undefined);

  const successBody: UploadResponse = {
    success: true,
    fileId,
    message: 'Upload and parsing complete',
    alreadyImported: false,
    provider,
    documentType,
    uploadSummary,
    gpsSummary,
    ...(summaryWarning ? { summaryWarning } : {}),
    ...(batchSourceType ? { sourceType: batchSourceType } : {}),
    ...(provider === 'DKV' || provider === 'AS24' ? { batchId: fileId } : {}),
    importFile,
  };

  return NextResponse.json(successBody);
}
