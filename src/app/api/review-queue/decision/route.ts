import { NextRequest, NextResponse } from 'next/server';
import { db, DEFAULT_USER_ID } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { matchId, status, reason, notes } = body;

    if (!matchId || !status) {
      return NextResponse.json({ error: 'Missing matchId or status' }, { status: 400 });
    }

    const matches = db.select('reconciliation_matches');
    const match = matches.find((m: any) => m.id === matchId);

    if (!match) {
      return NextResponse.json({ error: 'Match record not found' }, { status: 404 });
    }

    const previousStatus = match.status;

    // Check if decision already exists for this target
    const existingDecision = db.find(
      'review_decisions',
      (d: any) => d.target_id === matchId && d.target_type === 'RECONCILIATION_MATCH'
    );

    let decision;
    if (existingDecision) {
      decision = db.update('review_decisions', existingDecision.id, {
        previous_status: previousStatus,
        new_status: status,
        decision_reason: reason,
        notes,
        reviewed_by: DEFAULT_USER_ID,
        reviewed_at: new Date().toISOString(),
      });
    } else {
      decision = db.insert('review_decisions', {
        target_type: 'RECONCILIATION_MATCH',
        target_id: matchId,
        previous_status: previousStatus,
        new_status: status,
        decision_reason: reason,
        notes,
        reviewed_by: DEFAULT_USER_ID,
        reviewed_at: new Date().toISOString(),
      });
    }

    // Update the reconciliation match status
    db.update('reconciliation_matches', matchId, {
      status: status === 'approved' ? 'EXACT_MATCH' : 'AMOUNT_MISMATCH', // mimic resolved status
      reviewDecision: decision,
    });

    // Re-run pipeline is not needed immediately since we directly modified the match, but we log the audit
    db.logAudit(
      'REVIEW_DECISION',
      'RECONCILIATION_MATCH',
      matchId,
      `Submitted review decision: ${status.toUpperCase()}. Reason: ${reason}. Notes: ${notes || ''}`
    );

    return NextResponse.json({
      success: true,
      decision,
      updatedMatchStatus: status === 'approved' ? 'EXACT_MATCH' : 'AMOUNT_MISMATCH',
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
