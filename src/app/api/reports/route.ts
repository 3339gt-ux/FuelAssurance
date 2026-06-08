import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const transactions = db.select('transactions');
    const invoiceRows = db.select('invoice_transactions');
    const matches = db.select('reconciliation_matches');
    const runs = db.select('reconciliation_runs');

    const totalTxCount = transactions.length;
    const totalInvCount = invoiceRows.length;

    const matchedCount = matches.filter((m: any) => m.invoiceRowId).length;
    const matchRate = totalTxCount > 0 ? (matchedCount / totalTxCount) * 100 : 0;

    // Financial calculations
    const totalGrossTx = transactions.reduce((sum: number, t: any) => sum + parseFloat(t.amountGross || '0'), 0);
    const totalGrossInv = invoiceRows.reduce((sum: number, i: any) => sum + parseFloat(i.baseValueGross || '0'), 0);

    const exceptions = matches.filter((m: any) => m.status !== 'EXACT_MATCH' && m.status !== 'TELEMATICS_VERIFIED');

    return NextResponse.json({
      summary: {
        totalTransactions: totalTxCount,
        totalInvoiceRows: totalInvCount,
        matchedCount,
        matchRate: parseFloat(matchRate.toFixed(2)),
        totalGrossTx: totalGrossTx.toFixed(2),
        totalGrossInv: totalGrossInv.toFixed(2),
        exceptionsCount: exceptions.length,
      },
      exceptions: exceptions.map((e: any) => {
        const tx = transactions.find((t: any) => t.id === e.transactionId) || null;
        const inv = invoiceRows.find((i: any) => i.id === e.invoiceRowId) || null;
        return {
          ...e,
          transaction: tx,
          invoiceRow: inv,
        };
      }),
      runs,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
