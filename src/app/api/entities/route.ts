import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');

    if (!type) {
      return NextResponse.json({ error: 'Missing type parameter' }, { status: 400 });
    }

    if (type === 'transactions') {
      return NextResponse.json(db.select('transactions'));
    }
    if (type === 'invoice_transactions') {
      return NextResponse.json(db.select('invoice_transactions'));
    }
    if (type === 'stations') {
      return NextResponse.json(db.select('stations'));
    }
    if (type === 'vehicles') {
      return NextResponse.json(db.select('vehicles'));
    }
    if (type === 'cards') {
      return NextResponse.json(db.select('cards'));
    }

    return NextResponse.json({ error: 'Invalid entity type requested' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
