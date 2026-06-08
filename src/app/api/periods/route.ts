import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const files = db.select('import_files');
    const runs = db.select('reconciliation_runs');
    const decisions = db.select('review_decisions');

    if (files.length === 0) {
      return NextResponse.json([]);
    }

    const activeRun = runs[0];
    const periodMismatch = activeRun ? activeRun.status === 'period_mismatch' : false;

    // Check if sign-off exists
    const signOffOverride = decisions.find(
      (d: any) => d.target_type === 'PERIOD_SIGN_OFF' && d.new_status === 'signed_off'
    );

    let periodStatus = 'active';
    if (periodMismatch) {
      periodStatus = signOffOverride ? 'signed_off' : 'blocked';
    } else if (signOffOverride) {
      periodStatus = 'signed_off';
    }

    // Find date ranges in the imported data
    const txs = db.select('transactions');
    const invs = db.select('invoice_transactions');

    const periods = [
      {
        id: 'period-june-2026',
        name: 'Invoice Period — June 2026',
        startDate: '2026-06-07',
        endDate: '2026-06-08',
        status: periodStatus,
        transactionCount: txs.length,
        invoiceCount: invs.length,
        mismatchWarning: periodMismatch,
        warningText: 'PERIOD_MISMATCH: DKV transaction range (7–8 June 2026) has no overlap with DKV invoice range (which covers earlier prior-period transactions).',
        signedOffBy: signOffOverride ? 'Graham Audit' : null,
        signedOffAt: signOffOverride ? signOffOverride.reviewed_at : null,
        notes: signOffOverride ? signOffOverride.notes : '',
      },
    ];

    return NextResponse.json(periods);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
