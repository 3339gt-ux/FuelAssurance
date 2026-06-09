import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { assessTransaction } from '@/domain/telematics/telematics-scorer';
import { TelematicsClassification, ProductType } from '@/domain/types';
import { normalizeRegistration } from '@/config/fleet-registry';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { transactionFileId, gpsFileId, selectedVehicle, provider } = body;

    if (!transactionFileId || !gpsFileId || !selectedVehicle || !provider) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Fetch file meta records
    const txFile = db.find('import_files', (f: any) => f.id === transactionFileId);
    const gpsFile = db.find('import_files', (f: any) => f.id === gpsFileId);

    if (!txFile || !gpsFile) {
      return NextResponse.json({ error: 'File records not found' }, { status: 404 });
    }

    // 2. Fetch raw transactions or invoice rows for the file
    let rawTxs = db.select('transactions', (t: any) => t.importFileId === transactionFileId);
    if (rawTxs.length === 0) {
      // Could be DKV Invoice or AS24 PDF Invoice stored in invoice_transactions
      rawTxs = db.select('invoice_transactions', (t: any) => t.importFileId === transactionFileId);
    }

    // Filter by selected vehicle (normalize registrations to compare)
    const normSelected = normalizeRegistration(selectedVehicle);
    const vehicleTxs = rawTxs.filter((tx: any) => {
      return normalizeRegistration(tx.registration) === normSelected;
    });

    if (vehicleTxs.length === 0) {
      return NextResponse.json({
        error: `No transactions found in this file for vehicle ${selectedVehicle}.`
      }, { status: 400 });
    }

    // 3. Fetch GPS points
    const gpsPoints = db.select('telematics_points', (pt: any) => pt.importFileId === gpsFileId);

    // 4. Perform assessments for each transaction
    let supported = 0;
    let likelySupported = 0;
    let reviewRequired = 0;
    let unsupported = 0;
    let insufficient = 0;

    const results = vehicleTxs.map((tx: any) => {
      // Map invoice row fields to canonical transaction if needed
      const canonicalTx = {
        id: tx.id,
        importFileId: tx.importFileId,
        importRowIndex: tx.importRowIndex || 0,
        registration: tx.registration || '',
        cardNumber: tx.cardNumber || tx.cardNumberNormalised || '',
        cardNumberNormalised: tx.cardNumberNormalised || '',
        transactionDate: tx.transactionDate || '',
        transactionTimestamp: tx.transactionTimestamp || tx.transactionDate + 'T12:00:00Z',
        timestampPrecision: tx.timestampPrecision || 'EXACT',
        stationNumber: tx.stationNumber || '',
        stationNumberNormalised: tx.stationNumberNormalised || '',
        stationName: tx.stationName || '',
        stationCity: tx.stationCity || '',
        serviceCountry: tx.serviceCountry || 'IE',
        productCode: tx.productCode || '',
        productGroup: tx.productGroup || '',
        productName: tx.productName || '',
        productType: tx.productType || ProductType.UNKNOWN,
        costGroup: tx.costGroup || '',
        quantity: tx.quantity || '0.00',
        unit: tx.unit || 'L',
        amountGross: tx.amountGross || tx.baseValueGross || '0.00',
        mileage: tx.mileage || '',
        authorisationId: tx.authorisationId || '',
        responseCode: tx.responseCode || 'APP',
        isApproved: tx.isApproved !== undefined ? tx.isApproved : true,
        customerId: tx.customerId || '',
        costCentre: tx.costCentre || '',
        cardAddition: tx.cardAddition || '',
        stationCategory: tx.stationCategory || '',
        provider: provider,
      };

      const assessment = assessTransaction(canonicalTx as any, gpsPoints as any, null, undefined, vehicleTxs as any);
      
      // Map classification to simple user-friendly status
      let simpleStatus = 'Review required';
      if (assessment.classification === TelematicsClassification.VERIFIED) {
        simpleStatus = 'Supported';
        supported++;
      } else if (assessment.classification === TelematicsClassification.LIKELY) {
        simpleStatus = 'Likely supported';
        likelySupported++;
      } else if (assessment.classification === TelematicsClassification.UNLIKELY) {
        simpleStatus = 'Not supported';
        unsupported++;
      } else if (assessment.classification === TelematicsClassification.INSUFFICIENT_EVIDENCE) {
        simpleStatus = 'Insufficient GPS evidence';
        insufficient++;
      } else {
        reviewRequired++;
      }

      // Generate a simple, friendly explanation sentence based on the factors
      let friendlyReason = 'Transaction details require auditor review.';
      const timeFactor = assessment.factors.find((f) => f.dimension === 'TIME_PROXIMITY');
      const locFactor = assessment.factors.find((f) => f.dimension === 'LOCATION_PROXIMITY');
      const fuelFactor = assessment.factors.find((f) => f.dimension === 'FUEL_LEVEL_MOVEMENT');

      if (simpleStatus === 'Supported') {
        if (fuelFactor && fuelFactor.result === 'PASS') {
          friendlyReason = `Supported — Vehicle was stopped at the invoiced station and fuel level increased after the transaction.`;
        } else {
          friendlyReason = `Supported — Vehicle telemetry confirms location and timing proximity within limits.`;
        }
      } else if (simpleStatus === 'Likely supported') {
        friendlyReason = `Likely supported — Vehicle was detected nearby during the transaction window.`;
      } else if (simpleStatus === 'Insufficient GPS evidence') {
        friendlyReason = `Insufficient GPS evidence — No telematics points recorded during the transaction timeframe.`;
      } else if (simpleStatus === 'Not supported') {
        friendlyReason = `Not supported — Vehicle was located at a different station/area during this transaction.`;
      }

      return {
        id: tx.id,
        transactionDate: canonicalTx.transactionDate,
        transactionTimestamp: canonicalTx.transactionTimestamp,
        productName: canonicalTx.productName || 'Fuel',
        productType: canonicalTx.productType,
        stationName: canonicalTx.stationName || 'Unknown Station',
        stationCity: canonicalTx.stationCity || '',
        quantity: canonicalTx.quantity,
        unit: canonicalTx.unit,
        amountGross: canonicalTx.amountGross,
        simpleStatus,
        confidence: assessment.totalScore,
        friendlyReason,
        factors: assessment.factors.map((f: any) => ({
          factorName: f.dimension.replace(/_/g, ' '),
          maxPoints: f.maxPoints,
          awardedPoints: f.awardedPoints,
          sourceValue: f.sourceValue,
          normalisedValue: f.normalisedValue,
          ruleApplied: f.rule,
          result: f.result,
          explanation: f.explanation,
        })),
        timezoneApplied: 'UTC',
        toleranceApplied: '2 hours',
      };
    });

    // Calculate other fleet vehicles and transactions excluded from the check
    const otherTxs = rawTxs.filter((tx: any) => {
      const normReg = normalizeRegistration(tx.registration);
      return normReg !== normSelected && normReg !== '';
    });
    const otherVehicles = Array.from(new Set(otherTxs.map((t: any) => normalizeRegistration(t.registration)).filter(Boolean)));

    // 5. Save simple check run to database
    const checkId = crypto.randomUUID();
    const simpleCheck = db.insert('simple_checks', {
      id: checkId,
      provider,
      vehicle: selectedVehicle,
      check_date: new Date().toISOString(),
      transaction_file_name: txFile.file_name,
      gps_file_name: gpsFile.file_name,
      total_transactions: vehicleTxs.length,
      supported_count: supported,
      likely_supported_count: likelySupported,
      review_required_count: reviewRequired,
      unsupported_count: unsupported,
      insufficient_evidence_count: insufficient,
      excluded_vehicles: otherVehicles,
      excluded_transactions_count: otherTxs.length,
      results,
    });

    return NextResponse.json({
      success: true,
      checkId,
      simpleCheck,
    });

  } catch (err: any) {
    console.error('Check transactions error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (id) {
      const check = db.find('simple_checks', (c: any) => c.id === id);
      if (!check) {
        return NextResponse.json({ error: 'Check not found' }, { status: 404 });
      }
      return NextResponse.json({ check });
    }

    const checks = db.select('simple_checks');
    // Sort by check_date descending
    const sorted = [...checks].sort((a: any, b: any) => 
      new Date(b.check_date).getTime() - new Date(a.check_date).getTime()
    );

    return NextResponse.json({ checks: sorted });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing check id' }, { status: 400 });
    }

    const success = db.delete('simple_checks', id);
    if (!success) {
      return NextResponse.json({ error: 'Check not found or delete failed' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
