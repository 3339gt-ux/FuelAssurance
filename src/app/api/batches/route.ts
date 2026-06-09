import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const batches = db.select('transaction_batches');
    const sorted = [...batches].sort((a: any, b: any) => 
      new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
    );
    return NextResponse.json({ batches: sorted });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
