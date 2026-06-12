import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const body = await req.json();

    // Look in transactions
    let tx = db.find('transactions', (t: any) => t.id === id);
    let table: 'transactions' | 'invoice_transactions' = 'transactions';
    
    if (!tx) {
      tx = db.find('invoice_transactions', (t: any) => t.id === id);
      table = 'invoice_transactions';
    }

    if (!tx) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    const updatedData: any = {};
    if (body.telematicsOverrideStatus !== undefined) {
      updatedData.telematicsOverrideStatus = body.telematicsOverrideStatus;
    }
    if (body.reviewerNote !== undefined) {
      updatedData.reviewerNote = body.reviewerNote;
    }

    const updated = db.update(table, id, updatedData);
    return NextResponse.json({ success: true, transaction: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
