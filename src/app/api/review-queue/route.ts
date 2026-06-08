import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const matches = db.select('reconciliation_matches');
    const transactions = db.select('transactions');
    const invoices = db.select('invoice_transactions');
    const decisions = db.select('review_decisions');

    // Items needing review are those with variances, unmatched, telematics unlikely, or mismatches
    const reviewItems = matches
      .filter((m: any) => m.status !== 'EXACT_MATCH' && m.status !== 'TELEMATICS_VERIFIED')
      .map((m: any) => {
        const tx = transactions.find((t: any) => t.id === m.transactionId) || null;
        const inv = invoices.find((i: any) => i.id === m.invoiceRowId) || null;
        const decision = decisions.find((d: any) => d.target_id === m.id) || null;
        return {
          ...m,
          transaction: tx,
          invoiceRow: inv,
          reviewDecision: decision,
        };
      });

    return NextResponse.json(reviewItems);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
