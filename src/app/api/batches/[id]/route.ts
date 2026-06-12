import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const batch = db.find('transaction_batches', (b: any) => b.id === id);
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    // Fetch associated transactions
    let transactions = db.select('transactions', (t: any) => t.importFileId === id);
    if (transactions.length === 0) {
      transactions = db.select('invoice_transactions', (t: any) => t.importFileId === id);
    }

    return NextResponse.json({ batch, transactions });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const body = await req.json();

    const batch = db.find('transaction_batches', (b: any) => b.id === id);
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    const updatedData: any = {};
    if (body.approvalStatus !== undefined) updatedData.approvalStatus = body.approvalStatus;
    if (body.status !== undefined) updatedData.status = body.status;
    if (body.reviewerNotes !== undefined) updatedData.reviewerNotes = body.reviewerNotes;
    if (body.approvalNotes !== undefined) updatedData.approvalNotes = body.approvalNotes;
    
    if (body.auditEvent) {
      updatedData.auditHistory = [
        ...(batch.auditHistory || []),
        {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toISOString(),
          user: 'Graham Auditor',
          ...body.auditEvent,
        }
      ];
    }

    const updated = db.update('transaction_batches', id, updatedData);
    return NextResponse.json({ success: true, batch: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const batch = db.find('transaction_batches', (b: any) => b.id === id);
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    // Delete records
    db.delete('transaction_batches', id);
    db.delete('import_files', id);
    
    // Delete import_rows
    const rows = db.getTable('import_rows');
    const rowsToDelete = rows.filter((r: any) => r.import_file_id === id);
    for (const r of rowsToDelete) {
      db.delete('import_rows', r.id);
    }

    // Delete transactions / invoice transactions
    const txs = db.getTable('transactions');
    const txsToDelete = txs.filter((t: any) => t.importFileId === id);
    for (const t of txsToDelete) {
      db.delete('transactions', t.id);
    }

    const invs = db.getTable('invoice_transactions');
    const invsToDelete = invs.filter((t: any) => t.importFileId === id);
    for (const t of invsToDelete) {
      db.delete('invoice_transactions', t.id);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
