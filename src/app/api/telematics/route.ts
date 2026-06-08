import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const matchId = searchParams.get('matchId');

    if (matchId) {
      const ledgers = db.select('reasoning_ledgers', (l: any) => l.match_id === matchId);
      return NextResponse.json({ ledgers });
    }

    const matches = db.select('reconciliation_matches');
    const transactions = db.select('transactions');
    const points = db.select('telematics_points');

    // Filter matches that have a telematics assessment
    const telematicsMatches = matches
      .filter((m: any) => m.telematicsAssessment !== null)
      .map((m: any) => {
        const tx = transactions.find((t: any) => t.id === m.transactionId) || null;
        return {
          ...m,
          transaction: tx,
        };
      });

    return NextResponse.json({
      assessments: telematicsMatches,
      pointsCount: points.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
