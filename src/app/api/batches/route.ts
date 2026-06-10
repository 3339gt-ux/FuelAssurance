import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const batches = db.select('transaction_batches').map((b: any) => ({
      ...b,
      id: b.id || b.batchId,
      filename: b.filename || b.originalFileName,
      uploadDate: b.uploadDate || b.uploadedAt,
      vehicles: b.vehicles || b.vehiclesFound || [],
      vehicleStatuses: b.vehicleStatuses || b.vehicleCheckStatuses || {},
      checkResults: b.checkResults || b.verificationResults || {},
      parsingWarnings: b.parsingWarnings || b.warnings || [],
      sourceType: b.sourceType,
    }));
    const sorted = [...batches].sort((a: any, b: any) =>
      new Date(b.uploadDate || b.uploadedAt).getTime() - new Date(a.uploadDate || a.uploadedAt).getTime()
    );
    return NextResponse.json({ batches: sorted });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
