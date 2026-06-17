import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { assessTransaction } from '@/domain/telematics/telematics-scorer';
import { normalizeRegistration } from '@/config/fleet-registry';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const transactionId = searchParams.get('transactionId');

    if (!transactionId) {
      return NextResponse.json({ error: 'transactionId parameter is required' }, { status: 400 });
    }

    // 1. Find transaction in either DKV transactions or invoice transactions
    let tx = db.find('transactions', (t: any) => t.id === transactionId);
    if (!tx) {
      tx = db.find('invoice_transactions', (t: any) => t.id === transactionId);
    }

    if (!tx) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    // 2. Fetch central stations to find matching station details
    const stationCode = tx.stationNumberNormalised || tx.forecourtCode || tx.stationNumber;
    const station = stationCode
      ? db.find('stations', (s: any) => s.stationCodeNormalised === stationCode || s.id === stationCode)
      : null;

    // 3. Fetch all telematics points for this vehicle
    const vehicleReg = tx.registration || tx.vehicleRegistration || '';
    const normReg = normalizeRegistration(vehicleReg);
    
    const allPoints = db.select('telematics_points', (p: any) => 
      normalizeRegistration(p.vehicleRegistration) === normReg
    );

    if (allPoints.length === 0) {
      return NextResponse.json({
        success: true,
        transaction: tx,
        assessment: {
          classification: 'INSUFFICIENT_EVIDENCE',
          totalScore: 0,
          factors: [],
          assessedAt: new Date().toISOString(),
        },
        pointsInWindow: [],
        beforePoint: null,
        afterPoint: null,
        station,
      });
    }

    // Sort points chronologically
    allPoints.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // 4. Compute assessment on demand
    const assessment = assessTransaction(tx, allPoints, station);

    // 5. Find closest points before and after
    const txTime = new Date(tx.transactionTimestamp || tx.transactionDateTime).getTime();
    let beforePoint: any = null;
    let afterPoint: any = null;
    let minBeforeDiff = Infinity;
    let minAfterDiff = Infinity;

    for (const pt of allPoints) {
      const ptTime = new Date(pt.timestamp).getTime();
      if (isNaN(ptTime)) continue;

      const diff = ptTime - txTime;
      if (diff <= 0) {
        // Point is before or at transaction
        const absDiff = Math.abs(diff);
        if (absDiff < minBeforeDiff) {
          minBeforeDiff = absDiff;
          beforePoint = pt;
        }
      } else {
        // Point is after transaction
        if (diff < minAfterDiff) {
          minAfterDiff = diff;
          afterPoint = pt;
        }
      }
    }

    // 6. Get points in the 3-hour session window (90 mins before to 120 mins after standstill/tx time)
    const windowStart = txTime - 90 * 60 * 1000;
    const windowEnd = txTime + 120 * 60 * 1000;
    const pointsInWindow = allPoints.filter((pt: any) => {
      const ptTime = new Date(pt.timestamp).getTime();
      return ptTime >= windowStart && ptTime <= windowEnd;
    });

    return NextResponse.json({
      success: true,
      transaction: tx,
      assessment,
      pointsInWindow: pointsInWindow.slice(0, 100), // Limit payload size
      beforePoint,
      afterPoint,
      station,
      allVehiclePoints: allPoints,
    });

  } catch (err: any) {
    console.error('Evidence API Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
