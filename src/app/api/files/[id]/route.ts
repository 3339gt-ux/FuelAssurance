import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const { id } = params;

  // Find file in database
  const fileRecord = db.find('import_files', (f: any) => f.id === id);
  const batchRecord = db.find('transaction_batches', (b: any) => b.batchId === id || b.id === id);

  const fileHash = fileRecord?.file_hash || batchRecord?.fileHash;
  const fileName = fileRecord?.file_name || batchRecord?.originalFileName;
  const mimeType = fileRecord?.mime_type || (fileName?.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  if (!fileHash || !fileName) {
    return NextResponse.json(
      { error: 'File not found in database metadata' },
      { status: 404 }
    );
  }

  const ext = path.extname(fileName) || '.bin';
  const safeName = `${fileHash.slice(0, 16)}${ext}`;
  const fullPath = path.join(process.cwd(), 'private-uploads', safeName);

  if (!fs.existsSync(fullPath)) {
    return NextResponse.json(
      { error: 'File missing from storage' },
      { status: 404 }
    );
  }

  try {
    const fileBuffer = fs.readFileSync(fullPath);
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to read file from storage' },
      { status: 500 }
    );
  }
}
