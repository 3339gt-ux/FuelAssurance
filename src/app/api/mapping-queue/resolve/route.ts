import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runFullPipeline } from '@/lib/pipeline';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, value, action, targetId, name, provider, effectiveFrom, effectiveTo, reason } = body;

    if (!type || !value || !action) {
      return NextResponse.json({ error: 'Missing type, value, or action' }, { status: 400 });
    }

    if (action === 'create') {
      if (type === 'VEHICLE') {
        db.insert('vehicles', {
          registration: value,
          make: name || 'Generic',
          model: 'Unknown',
          active: true,
        });
      } else if (type === 'CARD') {
        db.insert('cards', {
          card_number: value,
          card_number_normalised: value,
          provider: provider || 'DKV',
          active: true,
        });
      } else if (type === 'STATION') {
        db.insert('stations', {
          station_code: value,
          station_code_normalised: value,
          station_name: name || `Station ${value}`,
          country: 'IE', // fallback
          city: 'Unknown',
          address: 'Unknown',
          active: true,
          stationCodeNormalised: value,
        });
      }
    } else if (action === 'alias') {
      if (!targetId) {
        return NextResponse.json({ error: 'Missing targetId for alias action' }, { status: 400 });
      }

      if (type === 'VEHICLE') {
        db.insert('vehicle_aliases', {
          vehicle_id: targetId,
          alias_registration: value,
          effective_from: effectiveFrom || new Date().toISOString(),
          effective_to: effectiveTo || null,
        });
      } else if (type === 'CARD') {
        // Create card assignment
        db.insert('card_assignments', {
          card_id: targetId,
          vehicle_id: name || '', // name could store vehicleId here
          effective_from: effectiveFrom || new Date().toISOString(),
          effective_to: effectiveTo || null,
        });
      } else if (type === 'STATION') {
        db.insert('station_aliases', {
          station_id: targetId,
          alias_code: value,
        });
      }
    } else if (action === 'exclude') {
      db.insert('review_decisions', {
        target_type: 'MAPPING_EXCLUDE',
        target_id: `${type}-${value}`,
        previous_status: 'unmapped',
        new_status: 'excluded',
        decision_reason: reason || 'Excluded from mapping by user',
        notes: `Value: ${value}, Type: ${type}`,
      });
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Log the resolve action to audit trail
    db.logAudit(
      'MAPPING_RESOLVE',
      type,
      value,
      `Resolved unmapped ${type} '${value}' via ${action}. Reason/Notes: ${reason || ''}`
    );

    // Re-run the reconciliation pipeline so that affected transactions match
    const pipelineResult = runFullPipeline();

    return NextResponse.json({
      success: true,
      message: `${type} mapping resolved successfully`,
      pipelineResult: pipelineResult ? {
        runId: pipelineResult.run.id,
        matchedCount: pipelineResult.run.matched_count,
        matchRate: pipelineResult.run.match_rate,
      } : null,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
