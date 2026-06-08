import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const files = db.select('import_files');
    // Sort by upload date descending
    const sorted = [...files].sort(
      (a, b) => new Date(b.upload_date).getTime() - new Date(a.upload_date).getTime()
    );
    return NextResponse.json(sorted);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
