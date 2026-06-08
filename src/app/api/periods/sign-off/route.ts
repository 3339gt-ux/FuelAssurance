import { NextRequest, NextResponse } from 'next/server';
import { db, DEFAULT_USER_ID } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { periodId, notes } = body;

    if (!periodId) {
      return NextResponse.json({ error: 'Missing periodId' }, { status: 400 });
    }

    // Record the period sign-off decision
    const decision = db.insert('review_decisions', {
      target_type: 'PERIOD_SIGN_OFF',
      target_id: periodId,
      previous_status: 'blocked',
      new_status: 'signed_off',
      decision_reason: 'Authorised adjustment/override of period mismatch',
      notes: notes || 'Manual period reconciliation override.',
      reviewed_by: DEFAULT_USER_ID,
      reviewed_at: new Date().toISOString(),
    });

    db.logAudit(
      'PERIOD_SIGN_OFF',
      'INVOICE_PERIOD',
      periodId,
      `Signed off invoice period '${periodId}'. Notes: ${notes || ''}`
    );

    return NextResponse.json({
      success: true,
      decision,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
