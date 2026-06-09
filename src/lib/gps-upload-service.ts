import * as XLSX from 'xlsx';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { parseGPSFile } from '@/domain/parsers/gps/gps-parser';
import { generateGpsSummary } from '@/lib/upload-summary';

export interface GpsUploadResult {
  success: boolean;
  fileId?: string;
  alreadyImported?: boolean;
  gpsSummary?: ReturnType<typeof generateGpsSummary>;
  summaryWarning?: string;
  error?: {
    stage: string;
    code: string;
    message: string;
    suggestedAction: string;
  };
}

export async function ingestGpsFile(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<GpsUploadResult> {
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const existing = db.find('import_files', (f: { file_hash: string }) => f.file_hash === hash);
  if (existing) {
    const storedMeta = existing.metadata || {};
    return {
      success: true,
      fileId: existing.id,
      alreadyImported: true,
      gpsSummary: storedMeta.gpsSummary ?? null,
    };
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch {
    return {
      success: false,
      error: {
        stage: 'core-parse',
        code: 'GPS_WORKBOOK_READ_FAILED',
        message: `The file "${fileName}" could not be read as a spreadsheet.`,
        suggestedAction: 'Ensure the file is a valid XLS or XLSX workbook.',
      },
    };
  }

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return {
      success: false,
      error: {
        stage: 'core-parse',
        code: 'GPS_NO_SHEETS',
        message: `The workbook "${fileName}" contains no sheets.`,
        suggestedAction: 'Ensure the GPS export contains at least one data sheet.',
      },
    };
  }

  const worksheet = workbook.Sheets[firstSheetName]!;
  const rawJsonRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1 });
  const fileId = crypto.randomUUID();

  let parseResult: ReturnType<typeof parseGPSFile>;
  try {
    parseResult = parseGPSFile(rawJsonRows, fileId);
  } catch {
    return {
      success: false,
      error: {
        stage: 'core-parse',
        code: 'GPS_PARSE_FAILED',
        message: `The GPS parser failed on "${fileName}".`,
        suggestedAction: 'Check that the workbook has recognisable column headings.',
      },
    };
  }

  if (!parseResult.points.length) {
    return {
      success: false,
      error: {
        stage: 'core-parse',
        code: 'GPS_NO_POINTS',
        message: `No GPS data points were extracted from "${fileName}".`,
        suggestedAction: 'Ensure the sheet contains a Vehicle column and at least one data row.',
      },
    };
  }

  const gpsSummary = generateGpsSummary(parseResult);

  db.insertMany('import_rows', parseResult.points.map((row, idx) => ({
    import_file_id: fileId,
    sheet_name: firstSheetName,
    source_row_number: idx + 1,
    raw_data: row,
    normalised_data: row,
    status: 'imported',
    warnings: [],
  })));
  db.insertMany('telematics_points', parseResult.points);

  db.insert('import_files', {
    id: fileId,
    file_name: fileName,
    provider: 'GPS',
    document_type: 'GPS',
    file_hash: hash,
    file_size: buffer.length,
    mime_type: mimeType || 'application/vnd.ms-excel',
    upload_date: new Date().toISOString(),
    parser_version: '1.0.0',
    import_status: 'completed',
    row_count: parseResult.points.length,
    page_count: workbook.SheetNames.length,
    warning_count: parseResult.warnings?.length ?? 0,
    metadata: {
      gpsSummary,
      telematicsSummary: {
        pointCount: parseResult.points.length,
        vehicle: gpsSummary.detectedCanonicalRegistration,
        dateRange: gpsSummary.dateRange,
      },
    },
  });

  return {
    success: true,
    fileId,
    alreadyImported: false,
    gpsSummary,
  };
}