import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get('fileId') || searchParams.get('batchId');
  const sheetName = searchParams.get('sheetName');
  const rowNumberStr = searchParams.get('rowNumber');

  if (!fileId) {
    return NextResponse.json({ error: 'fileId or batchId is required' }, { status: 400 });
  }

  // Find file record to locate path
  const fileRecord = db.find('import_files', (f: any) => f.id === fileId);
  const batchRecord = db.find('transaction_batches', (b: any) => b.batchId === fileId || b.id === fileId);

  const fileHash = fileRecord?.file_hash || batchRecord?.fileHash;
  const fileName = fileRecord?.file_name || batchRecord?.originalFileName;

  if (!fileHash || !fileName) {
    return NextResponse.json({ error: 'File metadata not found' }, { status: 404 });
  }

  const ext = path.extname(fileName) || '.bin';
  const safeName = `${fileHash.slice(0, 16)}${ext}`;
  const fullPath = path.join(process.cwd(), 'private-uploads', safeName);

  if (!fs.existsSync(fullPath)) {
    return NextResponse.json({ error: 'Physical file not found' }, { status: 404 });
  }

  try {
    const workbook = XLSX.readFile(fullPath);
    const targetSheetName = sheetName || workbook.SheetNames[0];
    if (!targetSheetName) {
      return NextResponse.json({ error: 'No sheets found in workbook' }, { status: 400 });
    }

    const worksheet = workbook.Sheets[targetSheetName];
    if (!worksheet) {
      return NextResponse.json({ error: `Sheet "${targetSheetName}" not found` }, { status: 400 });
    }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1 });

    if (rowNumberStr) {
      const targetRowIndex = parseInt(rowNumberStr, 10) - 1; // Convert 1-indexed to 0-indexed
      if (isNaN(targetRowIndex) || targetRowIndex < 0 || targetRowIndex >= rows.length) {
        return NextResponse.json({ error: 'Invalid rowNumber' }, { status: 400 });
      }

      // Detect header row index
      let headerRowIndex = 0;
      for (let i = 0; i < Math.min(20, rows.length); i++) {
        const r = rows[i];
        if (Array.isArray(r)) {
          // simple detection: if row contains DKV/AS24 headers or is non-empty
          const text = r.map(String).join(' ').toLowerCase();
          if (
            text.includes('registration') ||
            text.includes('licence') ||
            text.includes('card') ||
            text.includes('date') ||
            text.includes('product')
          ) {
            headerRowIndex = i;
            break;
          }
        }
      }

      const headerRow = rows[headerRowIndex] || [];
      
      // Get context rows around target row (e.g. index targetRowIndex - 2 to targetRowIndex + 2)
      const contextRows: { rowIndex: number; cells: unknown[] }[] = [];
      const start = Math.max(headerRowIndex + 1, targetRowIndex - 2);
      const end = Math.min(rows.length - 1, targetRowIndex + 2);

      for (let idx = start; idx <= end; idx++) {
        if (rows[idx]) {
          contextRows.push({
            rowIndex: idx + 1, // 1-indexed
            cells: rows[idx]!,
          });
        }
      }

      return NextResponse.json({
        success: true,
        fileName,
        sheetName: targetSheetName,
        headerRowIndex: headerRowIndex + 1,
        headerRow,
        targetRowIndex: targetRowIndex + 1,
        targetRow: rows[targetRowIndex],
        contextRows,
      });
    }

    return NextResponse.json({
      success: true,
      fileName,
      sheetName: targetSheetName,
      sheetNames: workbook.SheetNames,
      rows,
    });
  } catch (err) {
    console.error('Error reading excel preview:', err);
    return NextResponse.json({ error: 'Failed to parse Excel file preview' }, { status: 500 });
  }
}
