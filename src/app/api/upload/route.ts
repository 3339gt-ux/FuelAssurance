import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import pdf from 'pdf-parse';
import { db, DEFAULT_ORG_ID, DEFAULT_USER_ID } from '@/lib/db';
import { runFullPipeline } from '@/lib/pipeline';
import { parseDKVTransactions } from '@/domain/parsers/dkv/dkv-transaction-parser';
import { parseDKVInvoice } from '@/domain/parsers/dkv/dkv-invoice-parser';
import { parseGPSFile } from '@/domain/parsers/gps/gps-parser';
import { parseStationWorkbook } from '@/domain/parsers/stations/station-parser';
import { parseAS24PDF } from '@/domain/parsers/as24/as24-pdf-parser';
import { generateUploadSummary, generateGpsSummary } from '@/lib/upload-summary';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const specifiedType = formData.get('type') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Compute SHA-256 Hash
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Check if file already exists (prevent duplicate upload)
    const existingFile = db.find('import_files', (f: any) => f.file_hash === hash);
    if (existingFile) {
      return NextResponse.json({
        message: 'File already imported previously',
        fileId: existingFile.id,
      });
    }

    const fileId = crypto.randomUUID();
    const fileName = file.name;
    const fileSize = file.size;
    const mimeType = file.type;

    let rowCount = 0;
    let pageCount = 1;
    let warningCount = 0;
    let errorCount = 0;
    let controlTotalStatus = 'not_applicable';
    let provider = 'UNKNOWN';
    let documentType = 'UNKNOWN';
    let parserVersion = '1.0.0';
    let warnings: string[] = [];
    let uploadSummary: any = null;
    let gpsSummary: any = null;

    const fileLower = fileName.toLowerCase();
    const isPDF = mimeType === 'application/pdf' || fileLower.endsWith('.pdf');

    // 1. Detect and parse file content
    if (isPDF || specifiedType === 'AS24 Invoice (PDF)') {
      provider = 'AS24';
      documentType = 'INVOICE';
      
      const pdfData = await pdf(buffer);
      pageCount = pdfData.numpages || 1;

      const result = parseAS24PDF(pdfData.text, fileId);
      rowCount = result.invoiceRows.length;
      warnings = []; // AS24 parsing runs warnings-free or warnings are in metadata statement
      warningCount = warnings.length;

      // Save raw rows trace
      const rowsToSave = result.invoiceRows.map((row: any, idx: number) => ({
        id: row.id || crypto.randomUUID(),
        import_file_id: fileId,
        sheet_name: 'PDF',
        source_row_number: row.importRowIndex || idx + 1,
        raw_data: row,
        normalised_data: row,
        status: 'imported',
        warnings: [],
      }));
      db.insertMany('import_rows', rowsToSave);

      // Save canonical invoice transactions
      db.insertMany('invoice_transactions', result.invoiceRows);

      uploadSummary = await generateUploadSummary(
        buffer,
        mimeType || 'application/pdf',
        fileName,
        'AS24',
        'INVOICE',
        pageCount,
        warnings,
        result.invoiceRows
      );

      // Run AS24 Control-Total Audit
      if (result.statement) {
        controlTotalStatus = 'matched';
        
        // Sum card filling list gross
        const cardFillingGross = result.invoiceRows
          .filter((r: any) => r.productCode !== 'PASSango')
          .reduce((sum: number, r: any) => sum + parseFloat(r.baseValueGross || '0'), 0);

        // Sum PASSango gross
        const passangoGross = result.invoiceRows
          .filter((r: any) => r.productCode === 'PASSango')
          .reduce((sum: number, r: any) => sum + parseFloat(r.baseValueGross || '0'), 0);

        // Recalculated total invoice gross
        const recalculatedGross = result.invoiceRows.reduce(
          (sum: number, r: any) => sum + parseFloat(r.baseValueGross || '0'),
          0
        );

        const statementGross = parseFloat(result.statement.totalGrossAmount || '0');
        const diff = Math.abs(recalculatedGross - statementGross);

        // Tolerance check (e.g. 5.00 for currency conversion or rounding differences)
        if (diff > 5.00) {
          controlTotalStatus = 'unmatched';
          warningCount++;
          warnings.push(
            `CONTROL_TOTAL_FAILURE: Recalculated gross total (€${recalculatedGross.toFixed(2)}) ` +
            `does not match printed invoice statement total (€${statementGross.toFixed(2)}) within €5.00 tolerance (diff: €${diff.toFixed(2)}).`
          );
        }

        // Store control total audit details in import file metadata
        db.update('import_files', fileId, {
          metadata: {
            statement: result.statement,
            recalculatedGross: recalculatedGross.toFixed(2),
            statementGross: statementGross.toFixed(2),
            differenceGross: diff.toFixed(2),
            cardFillingGross: cardFillingGross.toFixed(2),
            passangoGross: passangoGross.toFixed(2),
            controlTotalsAudit: {
              recalculatedGross: recalculatedGross.toFixed(2),
              statementGross: statementGross.toFixed(2),
              differenceGross: diff.toFixed(2),
              status: controlTotalStatus === 'matched' ? 'PASS' : 'CONTROL_TOTAL_FAILURE',
            },
            warnings, // include the control total failure warnings here
          },
        });
      }

    } else {
      // Parse XLSX / XLS Spreadsheet
      const workbook = XLSX.read(buffer, { type: 'buffer' });

      if (specifiedType === 'DKV Transactions' || fileLower.includes('ola') || fileLower.includes('transaction')) {
        provider = 'DKV';
        documentType = 'TRANSACTION';
        const worksheet = workbook.Sheets[workbook.SheetNames[0]!];
        const rawJsonRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet!, { header: 1 });
        
        const result = parseDKVTransactions(rawJsonRows, fileId);
        rowCount = result.transactions.length;
        warnings = result.warnings || [];
        warningCount = warnings.length;
        parserVersion = `Variant ${result.variant}`;

        // Save raw rows
        const rowsToSave = result.rawRows.map((row: any) => ({
          import_file_id: fileId,
          sheet_name: workbook.SheetNames[0],
          source_row_number: row.rowIndex,
          raw_data: row,
          normalised_data: row,
          status: 'imported',
          warnings: [],
        }));
        db.insertMany('import_rows', rowsToSave);

        // Save canonical transactions
        db.insertMany('transactions', result.transactions);

        uploadSummary = await generateUploadSummary(
          buffer,
          mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          fileName,
          'DKV',
          'TRANSACTION',
          workbook.SheetNames.length,
          warnings,
          result.transactions
        );

      } else if (specifiedType === 'DKV Invoice' || fileLower.includes('invoice') || fileLower.includes('transactions_report')) {
        provider = 'DKV';
        documentType = 'INVOICE';
        const worksheet = workbook.Sheets[workbook.SheetNames[0]!];
        const rawJsonRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet!, { header: 1 });
        
        const result = parseDKVInvoice(rawJsonRows, fileId);
        rowCount = result.invoiceRows.length;
        warnings = result.warnings || [];
        warningCount = warnings.length;

        // Save raw rows
        const rowsToSave = result.rawRows.map((row: any) => ({
          import_file_id: fileId,
          sheet_name: workbook.SheetNames[0],
          source_row_number: row.rowIndex,
          raw_data: row,
          normalised_data: row,
          status: 'imported',
          warnings: [],
        }));
        db.insertMany('import_rows', rowsToSave);

        // Save canonical invoice transactions
        db.insertMany('invoice_transactions', result.invoiceRows);

        uploadSummary = await generateUploadSummary(
          buffer,
          mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          fileName,
          'DKV',
          'INVOICE',
          workbook.SheetNames.length,
          warnings,
          result.invoiceRows
        );

      } else if (specifiedType === 'GPS / Telematics' || fileLower.includes('gps') || fileLower.includes('telematics')) {
        provider = 'GPS';
        documentType = 'GPS';
        const worksheet = workbook.Sheets[workbook.SheetNames[0]!];
        const rawJsonRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet!, { header: 1 });
        
        const result = parseGPSFile(rawJsonRows, fileId);
        rowCount = result.points.length;
        warnings = result.warnings || [];
        warningCount = warnings.length;

        // Save raw rows
        const rowsToSave = result.points.map((row: any, idx: number) => ({
          import_file_id: fileId,
          sheet_name: workbook.SheetNames[0],
          source_row_number: idx + 1,
          raw_data: row,
          normalised_data: row,
          status: 'imported',
          warnings: [],
        }));
        db.insertMany('import_rows', rowsToSave);

        // Save telematics points
        db.insertMany('telematics_points', result.points);

        gpsSummary = generateGpsSummary(result);

      } else if (specifiedType === 'Station Workbook' || fileLower.includes('station') || fileLower.includes('yard') || fileLower.includes('price')) {
        provider = 'STATION';
        documentType = 'STATION';
        
        const sheetData = new Map<string, unknown[][]>();
        for (const sName of workbook.SheetNames) {
          const ws = workbook.Sheets[sName!];
          const rows = XLSX.utils.sheet_to_json<unknown[]>(ws!, { header: 1 });
          sheetData.set(sName, rows);
        }

        const result = parseStationWorkbook(workbook.SheetNames, sheetData, fileId);
        rowCount = result.stations.length;
        warnings = result.warnings || [];
        warningCount = warnings.length;

        // Save raw rows
        const rowsToSave = result.rawRows.map((row: any, idx: number) => ({
          import_file_id: fileId,
          sheet_name: row.sourceSheet,
          source_row_number: idx + 1,
          raw_data: row,
          normalised_data: row,
          status: 'imported',
          warnings: [],
        }));
        db.insertMany('import_rows', rowsToSave);

        // Save approved stations to database
        db.insertMany('stations', result.stations);

        // Insert into station discounts / pricing rules if present
        result.stations.forEach((st: any) => {
          if (st.discount) {
            db.insert('discounts', {
              station_id: st.id,
              product_type: st.productType,
              discount_value: st.discount,
              rate_type: 'FIXED',
              effective_from: st.applicationDate || new Date().toISOString(),
              effective_to: null,
            });
          }
          if (st.costPerLitre) {
            db.insert('prices', {
              station_id: st.id,
              product_type: st.productType,
              price_ex_vat: st.costPerLitre,
              price_inc_vat: st.costPerLitre,
              price_date: st.applicationDate || new Date().toISOString(),
            });
          }
        });
      } else {
        return NextResponse.json({ error: 'Unsupported file format or type' }, { status: 400 });
      }
    }

    // 2. Create the file metadata record
    const status = warningCount > 0 ? 'completed_with_warnings' : 'completed';
    const importFile = db.insert('import_files', {
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
      import_status: status,
      row_count: rowCount,
      page_count: pageCount,
      warning_count: warningCount,
      error_count: errorCount,
      control_total_status: controlTotalStatus,
      metadata: {
        warnings,
        uploadSummary,
        gpsSummary,
        ...((db.find('import_files', (f: any) => f.id === fileId) || {}).metadata || {}),
      },
    });

    // 3. Trigger reconciliation pipeline to match newly uploaded data
    const pipelineResult = runFullPipeline();

    return NextResponse.json({
      message: 'Upload and parsing complete',
      fileId,
      importFile,
      uploadSummary,
      gpsSummary,
      pipelineResult: pipelineResult ? {
        runId: pipelineResult.run.id,
        matchedCount: pipelineResult.run.matched_count,
        matchRate: pipelineResult.run.match_rate,
        alignment: pipelineResult.alignment,
      } : null,
    });

  } catch (err: any) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
