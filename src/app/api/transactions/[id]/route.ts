import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { assessTransaction } from '@/domain/telematics/telematics-scorer';
import { normalizeRegistration } from '@/config/fleet-registry';
import { ProductType } from '@/domain/types';

// Helper to re-assess a vehicle's transactions in a batch
async function recomputeVehicleAssessments(batchId: string, vehicleReg: string) {
  const batch = db.find('transaction_batches', (b: any) => b.id === batchId);
  if (!batch) return;

  const cleanReg = vehicleReg.replace(/\s+/g, '').toUpperCase();
  const normReg = normalizeRegistration(vehicleReg);

  // 1. Load all transactions for this vehicle in the batch
  let rawTxs = db.select('transactions', (t: any) => t.importFileId === batchId);
  if (rawTxs.length === 0) {
    rawTxs = db.select('invoice_transactions', (t: any) => t.importFileId === batchId);
  }
  const vehicleTxs = rawTxs.filter((tx: any) => normalizeRegistration(tx.registration || tx.vehicleRegistration) === normReg);

  // 2. Find if there is an attached GPS file for this vehicle
  const gpsAttachment = batch.attachedGpsFiles?.find(
    (a: any) => normalizeRegistration(a.vehicleRegistration) === normReg
  );

  let gpsPoints: any[] = [];
  if (gpsAttachment) {
    const gpsFile = db.find('import_files', (f: any) => f.file_hash === gpsAttachment.fileHash);
    if (gpsFile) {
      gpsPoints = db.select('telematics_points', (pt: any) => pt.importFileId === gpsFile.id);
    }
  }

  // 3. Compute assessments
  let supported = 0;
  let likelySupported = 0;
  let reviewRequired = 0;
  let unsupported = 0;
  let insufficient = 0;

  const provider = batch.provider || 'DKV';

  const results = vehicleTxs.map((tx: any) => {
    const canonicalTx = {
      id: tx.id,
      importFileId: tx.importFileId,
      importRowIndex: tx.importRowIndex || 0,
      registration: tx.registration || tx.vehicleRegistration || '',
      cardNumber: tx.cardNumber || tx.cardNumberNormalised || '',
      cardNumberNormalised: tx.cardNumberNormalised || '',
      transactionDate: tx.transactionDate || '',
      transactionTimestamp: tx.transactionTimestamp || tx.transactionDateTime || tx.transactionDate + 'T12:00:00Z',
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
      quantity: tx.quantity || tx.volume || '0.00',
      unit: tx.unit || tx.volumeUnit || 'L',
      amountGross: tx.amountGross || tx.baseValueGross || tx.valueOfPurchaseNet || '0.00',
      mileage: tx.mileage || tx.mileageKm || '',
      authorisationId: tx.authorisationId || '',
      responseCode: tx.responseCode || 'APP',
      isApproved: tx.isApproved !== undefined ? tx.isApproved : true,
      customerId: tx.customerId || '',
      costCentre: tx.costCentre || '',
      cardAddition: tx.cardAddition || '',
      stationCategory: tx.stationCategory || '',
      provider: provider,
    };

    if (gpsPoints.length === 0) {
      // Return insufficient result manually
      return {
        id: tx.id,
        transactionDate: canonicalTx.transactionDate,
        transactionTimestamp: canonicalTx.transactionTimestamp,
        productName: canonicalTx.productName,
        productType: canonicalTx.productType,
        stationName: canonicalTx.stationName,
        stationCity: canonicalTx.stationCity,
        quantity: canonicalTx.quantity,
        unit: canonicalTx.unit,
        amountGross: canonicalTx.amountGross,
        simpleStatus: 'Insufficient GPS evidence',
        confidence: 0,
        friendlyReason: 'No GPS telemetry file linked for vehicle ' + vehicleReg,
        factors: [],
      };
    }

    const assessment = assessTransaction(canonicalTx as any, gpsPoints as any, null, undefined, vehicleTxs as any);

    let simpleStatus = 'Review required';
    if (assessment.classification === 'VERIFIED') {
      simpleStatus = 'Supported';
      supported++;
    } else if (assessment.classification === 'LIKELY') {
      simpleStatus = 'Likely supported';
      likelySupported++;
    } else if (assessment.classification === 'UNLIKELY') {
      simpleStatus = 'Not supported';
      unsupported++;
    } else if (assessment.classification === 'INSUFFICIENT_EVIDENCE') {
      simpleStatus = 'Insufficient GPS evidence';
      insufficient++;
    } else {
      reviewRequired++;
    }

    let friendlyReason = 'Transaction details require auditor review.';
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
      productName: canonicalTx.productName,
      productType: canonicalTx.productType,
      stationName: canonicalTx.stationName,
      stationCity: canonicalTx.stationCity,
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

  // 4. Update check results in the batch
  const vehicleStatuses = { ...(batch.vehicleStatuses || batch.vehicleCheckStatuses || {}) };
  const checkResults = { ...(batch.checkResults || batch.verificationResults || {}) };

  const hasMappingErrors = vehicleTxs.some((tx: any) => tx.status === 'PARSER_MAPPING_ERROR');
  vehicleStatuses[cleanReg] = hasMappingErrors ? 'Review required' : 'Check completed';

  checkResults[cleanReg] = {
    results,
    supported,
    likelySupported,
    unsupported,
    insufficient,
    reviewRequired,
  };

  db.update('transaction_batches', batchId, {
    vehicleStatuses,
    vehicleCheckStatuses: vehicleStatuses,
    checkResults,
    verificationResults: checkResults,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const body = await req.json();

    // 1. Find transaction
    let tx = db.find('transactions', (t: any) => t.id === id);
    let table: 'transactions' | 'invoice_transactions' = 'transactions';

    if (!tx) {
      tx = db.find('invoice_transactions', (t: any) => t.id === id);
      table = 'invoice_transactions';
    }

    if (!tx) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    const batchId = tx.importFileId;
    const oldReg = tx.registration || tx.vehicleRegistration;

    const originalValues = tx.originalValues || {};
    const updatedFields: any = { ...body };
    const finalUpdate: any = {};

    if (body.revert) {
      // Revert action: restore original fields
      if (tx.isManuallyEdited && tx.originalValues) {
        Object.assign(finalUpdate, tx.originalValues);
        finalUpdate.isManuallyEdited = false;
        finalUpdate.originalValues = null;
      }
    } else {
      // Normal update: track changed fields
      const editableFields = [
        'registration',
        'vehicleRegistration',
        'transactionDate',
        'transactionTimestamp',
        'transactionDateTime',
        'productName',
        'productType',
        'stationCity',
        'stationName',
        'quantity',
        'volume',
        'unit',
        'volumeUnit',
        'baseValueNet',
        'valueOfPurchaseNet',
        'paymentAmountExVat',
        'discountNet',
        'rebate',
        'serviceFeeNet',
        'vat',
        'valueInPayCurrency',
        'paymentAmountInclVat',
        'baseValueGross',
        'amountGross',
        'paymentCurrency',
        'serviceCurrency',
        'transactionNumber',
        'ticketNumber',
        'reviewerNote',
      ];

      for (const field of editableFields) {
        if (updatedFields[field] !== undefined && updatedFields[field] !== tx[field]) {
          // If original values doesn't have it, save the old value
          if (originalValues[field] === undefined) {
            originalValues[field] = tx[field] === undefined ? '' : tx[field];
          }
          finalUpdate[field] = updatedFields[field];
        }
      }

      if (Object.keys(finalUpdate).length > 0) {
        finalUpdate.isManuallyEdited = true;
        finalUpdate.originalValues = originalValues;
      }
    }

    // Update DB row
    const updated = db.update(table, id, finalUpdate);

    // Audit Log Edit
    db.logAudit(
      body.revert ? 'REVERT_EDIT' : 'MANUAL_EDIT',
      table,
      id,
      body.revert ? `Reverted manual edits for transaction ${id}` : `Manually edited transaction ${id}`
    );

    // 2. Recompute assessments if we have a batch ID
    if (batchId) {
      const newReg = updated.registration || updated.vehicleRegistration;
      
      // Re-run for the old vehicle
      if (oldReg) {
        await recomputeVehicleAssessments(batchId, oldReg);
      }
      
      // If vehicle registration changed, re-run for the new vehicle as well
      if (newReg && newReg !== oldReg) {
        await recomputeVehicleAssessments(batchId, newReg);
      }
    }

    return NextResponse.json({ success: true, transaction: updated });
  } catch (err: any) {
    console.error('Transaction update error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
