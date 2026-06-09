import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import pdf from 'pdf-parse';
import { db, DEFAULT_USER_ID } from '@/lib/db';
import { runFullPipeline } from '@/lib/pipeline';
import { parseDKVTransactions } from '@/domain/parsers/dkv/dkv-transaction-parser';
import { parseDKVInvoice } from '@/domain/parsers/dkv/dkv-invoice-parser';
import { parseGPSFile } from '@/domain/parsers/gps/gps-parser';
import { parseStationWorkbook } from '@/domain/parsers/stations/station-parser';
import { parseAS24PDF } from '@/domain/parsers/as24/as24-pdf-parser';
import { generateUploadSummary, generateGpsSummary } from '@/lib/upload-summary';
import type { UploadResponse } from '@/types/upload';

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
  try {
    const formData = await req.formData();
    file = formData.get('file') as File;
    specifiedType = (formData.get('type') as string) || '';
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

  // ── Stage: type-detection ───────────────────────────────────────────────────
  let provider = 'UNKNOWN';
  let documentType = 'UNKNOWN';

  if (isPDF || specifiedType === 'AS24 Invoice (PDF)') {
    provider = 'AS24';
    documentType = 'INVOICE';
  } else if (specifiedType === 'GPS / Telematics' || fileLower.includes('gps') || fileLower.includes('telematics')) {
    provider = 'GPS';
    documentType = 'GPS';
  } else if (specifiedType === 'DKV Transactions' || fileLower.includes('ola') || fileLower.includes('transaction')) {
    provider = 'DKV';
    documentType = 'TRANSACTION';
  } else if (specifiedType === 'DKV Invoice' || fileLower.includes('invoice') || fileLower.includes('transactions_report')) {
    provider = 'DKV';
    documentType = 'INVOICE';
  } else if (specifiedType === 'Station Workbook' || fileLower.includes('station') || fileLower.includes('yard') || fileLower.includes('price')) {
    provider = 'STATION';
    documentType = 'STATION';
  }

  if (provider === 'UNKNOWN') {
    return stageError('type-detection', 'UNKNOWN_FILE_TYPE', `The file "${fileName}" could not be matched to a supported type.`, 'Use the type selector to specify the file type, or ensure the filename contains a recognisable keyword (gps, invoice, ola, station).');
  }

  // ── Stage: duplicate-check ──────────────────────────────────────────────────
  let hash: string;
  try {
    hash = crypto.createHash('sha256').update(buffer).digest('hex');
  } catch (err) {
    return stageError('file-read', 'HASH_FAILED', 'Could not compute file hash.', 'Try uploading again.', err);
  }

  const existingFile = db.find('import_files', (f: any) => f.file_hash === hash);
  if (existingFile) {
    // Re-build summaries from stored metadata so the UI always gets the full response
    const storedMeta = existingFile.metadata || {};
    const storedUploadSummary = storedMeta.uploadSummary || null;
    const storedGpsSummary = storedMeta.gpsSummary || null;

    return NextResponse.json({
      success: true,
      fileId: existingFile.id,
      message: 'File already imported previously',
      alreadyImported: true,
      provider: existingFile.provider || provider,
      documentType: existingFile.document_type || documentType,
      uploadSummary: storedUploadSummary,
      gpsSummary: storedGpsSummary,
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

  if (provider === 'AS24') {
    // ── AS24 PDF ──────────────────────────────────────────────────────────────
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
        'AS24_PDF_READ_FAILED',
        `The file "${fileName}" could not be read as a PDF.`,
        'Ensure the file is a valid AS24 PDF invoice, not a scanned image or password-protected file.',
        err
      );
    }

    pageCount = pdfData.numpages || 1;
    pagesData.sort((a, b) => a.pageNum - b.pageNum);

    let parseResult: any;
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

    if (!parseResult || parseResult.invoiceRows.length === 0) {
      return stageError(
        'core-parse',
        'AS24_NO_ROWS',
        `No transactions were found in "${fileName}".`,
        'Verify the file contains a Cards Filling List or PASSango section. Empty invoices cannot be imported.'
      );
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
        buffer, mimeType || 'application/pdf', fileName, 'AS24', 'INVOICE',
        pageCount, warnings, parseResult.invoiceRows
      );
    } catch (err) {
      summaryWarning = `Upload summary generation failed (${String(err).slice(0, 120)}). Core import succeeded.`;
      console.warn('Summary generation error (non-fatal):', err);
    }

    // AS24 control-total audit
    if (parseResult.statement) {
      try {
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
      } catch {
        // Non-fatal — control total audit is advisory
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
      let parseResult: any;
      try {
        parseResult = parseDKVTransactions(rawJsonRows, fileId);
      } catch (err) {
        return stageError('core-parse', 'DKV_TX_PARSE_FAILED', `The DKV transaction parser failed on "${fileName}".`, 'Ensure the file is a DKV transaction export in a supported format.', err);
      }
      rowCount = parseResult.transactions.length;
      warnings = parseResult.warnings || [];
      warningCount = warnings.length;
      parserVersion = `Variant ${parseResult.variant}`;
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
        parseResult = parseDKVInvoice(rawJsonRows, fileId);
      } catch (err) {
        return stageError('core-parse', 'DKV_INV_PARSE_FAILED', `The DKV invoice parser failed on "${fileName}".`, 'Ensure the file is a DKV invoice export in a supported format.', err);
      }
      rowCount = parseResult.invoiceRows.length;
      warnings = parseResult.warnings || [];
      warningCount = warnings.length;
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
        ? (documentType === 'TRANSACTION' ? db.select('transactions', (t: any) => t.importFileId === fileId) : db.select('invoice_transactions', (t: any) => t.importFileId === fileId))
        : db.select('invoice_transactions', (t: any) => t.importFileId === fileId);

      const uniqueVehicles = Array.from(new Set(
        rows.map((r: any) => {
          const reg = r.registration || r.vehicleRegistration || '';
          return reg.replace(/\s+/g, '').toUpperCase();
        }).filter(Boolean)
      ));

      const dates = rows.map((r: any) => r.transactionDate).filter(Boolean).sort();
      const earliest = dates[0] ?? '';
      const latest = dates[dates.length - 1] ?? '';

      let totalFuelVolume = 0;
      const totalAmountExVatByCurrency: Record<string, number> = {};
      for (const row of rows) {
        const vol = parseFloat(row.volume || row.quantity || '0');
        if (!isNaN(vol)) {
          const pt = row.productType;
          if (pt === 'DIESEL' || pt === 'ADBLUE' || pt === 'GNR' || pt === 'RED_DIESEL') totalFuelVolume += vol;
        }
        const curr = row.paymentCurrency || row.serviceCurrency || 'EUR';
        const amt = parseFloat(row.paymentAmountExVat || row.baseValueNet || '0');
        if (!isNaN(amt)) totalAmountExVatByCurrency[curr] = (totalAmountExVatByCurrency[curr] || 0) + amt;
      }
      for (const key of Object.keys(totalAmountExVatByCurrency)) {
        totalAmountExVatByCurrency[key] = parseFloat(totalAmountExVatByCurrency[key]!.toFixed(2));
      }

      const vehicleStatuses: Record<string, string> = {};
      for (const v of uniqueVehicles) vehicleStatuses[v] = 'GPS not attached';

      db.insert('transaction_batches', {
        id: fileId,
        provider,
        filename: fileName,
        fileHash: hash,
        uploadDate: new Date().toISOString(),
        dateRange: { earliest, latest },
        vehicles: uniqueVehicles,
        attachedGpsFiles: [],
        vehicleStatuses,
        checkResults: {},
        parsingWarnings: warnings,
        parserVersion,
        chargeSummary: {
          totalChargesCount: rows.length,
          totalFuelVolume: parseFloat(totalFuelVolume.toFixed(2)),
          totalAmountExVatByCurrency,
        },
      });
    } catch (err) {
      // Non-fatal — batch creation failure should not block the import response
      console.warn('Batch creation failed (non-fatal):', err);
    }
  }

  // ── Stage: pipeline ─────────────────────────────────────────────────────────
  let pipelineResult: any = null;
  try {
    const pr = runFullPipeline();
    if (pr) {
      pipelineResult = {
        runId: pr.run.id,
        matchedCount: pr.run.matched_count,
        matchRate: pr.run.match_rate,
        alignment: pr.alignment,
      };
    }
  } catch {
    // Non-fatal
  }

  // ── Stage: response ─────────────────────────────────────────────────────────
  return NextResponse.json({
    success: true,
    fileId,
    message: 'Upload and parsing complete',
    alreadyImported: false,
    provider,
    documentType,
    uploadSummary,
    gpsSummary,
    ...(summaryWarning ? { summaryWarning } : {}),
    pipelineResult,
    // Legacy fields for backward compatibility during transition
    importFile,
  } satisfies UploadResponse);
}
