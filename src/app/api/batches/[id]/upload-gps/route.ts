import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import { db, DEFAULT_USER_ID } from '@/lib/db';
import { parseGPSFile } from '@/domain/parsers/gps/gps-parser';
import { assessTransaction } from '@/domain/telematics/telematics-scorer';
import { TelematicsClassification, ProductType } from '@/domain/types';
import { normalizeRegistration } from '@/config/fleet-registry';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id: batchId } = params;
    const batch = db.find('transaction_batches', (b: any) => b.id === batchId);
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    const formData = await req.formData();
    const files = formData.getAll('file') as File[];

    if (files.length === 0) {
      return NextResponse.json({ error: 'No GPS files uploaded' }, { status: 400 });
    }

    const attachedGpsFiles = [...(batch.attachedGpsFiles || [])];
    const vehicleStatuses = { ...(batch.vehicleStatuses || {}) };
    const checkResults = { ...(batch.checkResults || {}) };

    let processedCount = 0;
    const errors: string[] = [];

    // Fetch batch transactions
    let batchTxs = db.select('transactions', (t: any) => t.importFileId === batchId);
    if (batchTxs.length === 0) {
      batchTxs = db.select('invoice_transactions', (t: any) => t.importFileId === batchId);
    }

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');

      // Check if file hash already imported in import_files (prevent duplicates)
      const existingFile = db.find('import_files', (f: any) => f.file_hash === hash);
      let fileId = existingFile ? existingFile.id : crypto.randomUUID();

      // Parse the GPS file
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]!];
      const rawJsonRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet!, { header: 1 });
      
      const result = parseGPSFile(rawJsonRows, fileId);
      if (result.points.length === 0) {
        errors.push(`File ${file.name} has no valid GPS points.`);
        continue;
      }

      // Detect vehicle registration from points
      const firstPoint = result.points[0];
      const gpsReg = firstPoint ? firstPoint.vehicleRegistration : '';
      const cleanGpsReg = gpsReg.replace(/\s+/g, '').toUpperCase();

      if (!cleanGpsReg) {
        errors.push(`File ${file.name} has no vehicle registration defined in data.`);
        continue;
      }

      // Check if this vehicle is found in the batch
      const isVehicleInBatch = batch.vehicles.some(
        (v: string) => normalizeRegistration(v) === normalizeRegistration(cleanGpsReg)
      );

      if (!isVehicleInBatch) {
        errors.push(`Vehicle ${gpsReg} from GPS file ${file.name} is not present in this transaction batch.`);
        continue;
      }

      // Save GPS file as import file metadata if it doesn't exist yet
      if (!existingFile) {
        db.insert('import_files', {
          id: fileId,
          file_name: file.name,
          provider: 'GPS',
          document_type: 'GPS',
          file_hash: hash,
          file_size: file.size,
          mime_type: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          upload_date: new Date().toISOString(),
          uploaded_by: DEFAULT_USER_ID,
          parser_version: '1.0.0',
          import_status: 'completed',
          row_count: result.points.length,
          page_count: 1,
          warning_count: 0,
          error_count: 0,
          metadata: {
            gpsSummary: {
              pointCount: result.points.length,
              vehicle: cleanGpsReg,
            }
          }
        });

        // Save raw telematics points
        db.insertMany('telematics_points', result.points);
      }

      // Get GPS point timestamps
      const timestamps = result.points.map((p: any) => p.timestamp).filter(Boolean).sort();
      const coverageStart = timestamps[0] || '';
      const coverageEnd = timestamps[timestamps.length - 1] || '';

      // Check if we need to replace/update existing GPS attachment for this vehicle
      const existingAttachmentIdx = attachedGpsFiles.findIndex(
        (a: any) => normalizeRegistration(a.vehicleRegistration) === normalizeRegistration(cleanGpsReg)
      );

      const attachmentInfo = {
        fileName: file.name,
        fileHash: hash,
        vehicleRegistration: cleanGpsReg,
        uploadedAt: new Date().toISOString(),
        coverageStart,
        coverageEnd,
      };

      if (existingAttachmentIdx !== -1) {
        attachedGpsFiles[existingAttachmentIdx] = attachmentInfo;
      } else {
        attachedGpsFiles.push(attachmentInfo);
      }

      // Run vehicle checks
      const vehicleTxs = batchTxs.filter((tx: any) => {
        const reg = tx.registration || tx.vehicleRegistration || '';
        return normalizeRegistration(reg) === normalizeRegistration(cleanGpsReg);
      });

      // Check date coverage overlap
      const txDates = vehicleTxs.map((tx: any) => tx.transactionDate).filter(Boolean).sort();
      const txStart = txDates[0] || '';
      const txEnd = txDates[txDates.length - 1] || '';

      const overlap = (coverageStart <= txEnd && coverageEnd >= txStart);

      if (!overlap) {
        vehicleStatuses[cleanGpsReg] = 'GPS coverage incomplete';
        checkResults[cleanGpsReg] = null;
        processedCount++;
        continue;
      }

      // Run assessments
      let supported = 0;
      let likelySupported = 0;
      let reviewRequired = 0;
      let unsupported = 0;
      let insufficient = 0;

      const results = vehicleTxs.map((tx: any) => {
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
          provider: batch.provider,
        };

        if (tx.status === 'PARSER_MAPPING_ERROR') {
          reviewRequired++;
          return {
            id: tx.id,
            transactionDate: canonicalTx.transactionDate,
            transactionTimestamp: canonicalTx.transactionTimestamp,
            productName: canonicalTx.productName || 'Fuel',
            productType: canonicalTx.productType,
            stationName: canonicalTx.stationName || 'Unknown Station',
            quantity: canonicalTx.quantity,
            amountGross: canonicalTx.amountGross,
            simpleStatus: 'Review required',
            confidence: 0,
            friendlyReason: `Needs field review — volume (${tx.volume}L) exceeds physical fleet capacity limit (1250L) or financial validation failed.`,
            factors: [],
            status: 'PARSER_MAPPING_ERROR',
            warnings: tx.warnings || [],
          };
        }

        const assessment = assessTransaction(canonicalTx as any, result.points as any, null, undefined, vehicleTxs as any);

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

        let friendlyReason = 'Transaction details require auditor review.';
        const fuelFactor = assessment.factors.find((f) => f.dimension === 'FUEL_LEVEL_MOVEMENT');

        if (simpleStatus === 'Supported') {
          if (fuelFactor && fuelFactor.result === 'PASS') {
            friendlyReason = `Supported — Vehicle stopped at the station and fuel level increased after restart.`;
          } else {
            friendlyReason = `Supported — Vehicle telemetry confirms location and timing proximity.`;
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
          quantity: canonicalTx.quantity,
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
        };
      });

      const hasMappingErrors = vehicleTxs.some((tx: any) => tx.status === 'PARSER_MAPPING_ERROR');
      
      vehicleStatuses[cleanGpsReg] = hasMappingErrors ? 'Review required' : 'Check completed';
      checkResults[cleanGpsReg] = {
        results,
        supported,
        likelySupported,
        unsupported,
        insufficient,
        reviewRequired,
      };

      processedCount++;
    }

    // Update batch in DB
    db.update('transaction_batches', batchId, {
      attachedGpsFiles,
      vehicleStatuses,
      checkResults,
    });

    return NextResponse.json({
      success: true,
      processedCount,
      errors,
      attachedGpsFiles,
      vehicleStatuses,
    });

  } catch (err: any) {
    console.error('GPS attachment error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
