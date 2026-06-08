import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const runs = db.select('reconciliation_runs');
    const matches = db.select('reconciliation_matches');
    const transactions = db.select('transactions');
    const invoices = db.select('invoice_transactions');
    const decisions = db.select('review_decisions');

    // Enrich matches with related entity details for the UI to consume directly
    const enrichedMatches = matches.map((match: any) => {
      const tx = transactions.find((t: any) => t.id === match.transactionId) || null;
      const inv = invoices.find((i: any) => i.id === match.invoiceRowId) || null;
      const decision = decisions.find((d: any) => d.target_id === match.id) || null;
      return {
        ...match,
        transaction: tx,
        invoiceRow: inv,
        reviewDecision: decision,
      };
    });

    return NextResponse.json({
      runs,
      matches: enrichedMatches,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
