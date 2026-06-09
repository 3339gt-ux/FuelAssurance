import { NextRequest, NextResponse } from 'next/server';
import pdf from 'pdf-parse';
import { db } from '@/lib/db';
import { parseAS24PDF } from '@/domain/parsers/as24/as24-pdf-parser';
import { assessTransaction } from '@/domain/telematics/telematics-scorer';
import { TelematicsClassification, ProductType } from '@/domain/types';
import { normalizeRegistration } from '@/config/fleet-registry';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const batch = db.find('transaction_batches', (b: any) => b.id === id);
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Parse the PDF using coordinates
    const pagesData: any[] = [];
    const options = {
      pagerender: (pageData: any) => {
        return pageData.getTextContent().then((textContent: any) => {
          const items = textContent.items.map((item: any) => ({
            str: item.str,
            x: item.transform[4],
            y: item.transform[5],
            width: item.width,
            height: item.height,
          }));
          pagesData.push({
            pageNum: pageData.pageIndex + 1,
            items,
          });
          
          let lastY: number | undefined;
          let text = '';
          for (const item of textContent.items) {
            if (lastY === item.transform[5] || lastY === undefined) {
              text += item.str;
            } else {
              text += '\n' + item.str;
            }
            lastY = item.transform[5];
          }
          return text;
        });
      }
    };

    const pdfData = await pdf(buffer, options);
    pagesData.sort((a, b) => a.pageNum - b.pageNum);

    const result = parseAS24PDF(pdfData.text, id, pagesData);

    // Save previous analysis summary for audit/history
    const auditHistory = [
      ...(batch.auditHistory || []),
      {
        reprocessedAt: new Date().toISOString(),
        previousVersion: batch.parserVersion || '1.0.0-fallback',
        previousChargeSummary: batch.chargeSummary,
        previousWarnings: batch.parsingWarnings || [],
      }
    ];

    // Remove old transactions for this batch ID
    const invs = db.getTable('invoice_transactions');
    const invsToDelete = invs.filter((t: any) => t.importFileId === id);
    for (const t of invsToDelete) {
      db.delete('invoice_transactions', t.id);
    }

    // Insert new parsed transactions
    db.insertMany('invoice_transactions', result.invoiceRows);

    // Re-calculate dates, vehicles
    const uniqueVehicles = Array.from(
      new Set(
        result.invoiceRows.map((r: any) => {
          const reg = r.registration || r.vehicleRegistration || '';
          return reg.replace(/\s+/g, '').toUpperCase();
        }).filter(Boolean)
      )
    );

    const dates = result.invoiceRows.map((r: any) => r.transactionDate).filter(Boolean).sort();
    const earliest = dates[0] || '';
    const latest = dates[dates.length - 1] || '';

    let totalFuelVolume = 0;
    const totalAmountExVatByCurrency: Record<string, number> = {};
    for (const row of result.invoiceRows) {
      const vol = parseFloat(row.volume || row.quantity || '0');
      if (!isNaN(vol)) {
        if (row.productType === 'DIESEL' || row.productType === 'ADBLUE' || row.productType === 'GNR') {
          totalFuelVolume += vol;
        }
      }
      const curr = row.paymentCurrency || 'EUR';
      const amt = parseFloat(row.paymentAmountExVat || '0');
      if (!isNaN(amt)) {
        totalAmountExVatByCurrency[curr] = (totalAmountExVatByCurrency[curr] || 0) + amt;
      }
    }
    for (const key of Object.keys(totalAmountExVatByCurrency)) {
      totalAmountExVatByCurrency[key] = parseFloat(totalAmountExVatByCurrency[key]!.toFixed(2));
    }

    // Re-run checks if GPS files were already attached
    const attachedGpsFiles = batch.attachedGpsFiles || [];
    const vehicleStatuses = { ...(batch.vehicleStatuses || {}) };
    const checkResults = { ...(batch.checkResults || {}) };

    // Set statuses for new/existing vehicles
    for (const v of uniqueVehicles) {
      if (!vehicleStatuses[v]) {
        vehicleStatuses[v] = 'GPS not attached';
      }
    }

    // Re-run for each attached GPS file
    for (const att of attachedGpsFiles) {
      const vReg = att.vehicleRegistration;
      const gpsPoints = db.select('telematics_points', (pt: any) => normalizeRegistration(pt.vehicleRegistration) === normalizeRegistration(vReg));
      
      const vehicleTxs = result.invoiceRows.filter((tx: any) => {
        const reg = tx.registration || tx.vehicleRegistration || '';
        return normalizeRegistration(reg) === normalizeRegistration(vReg);
      });

      if (vehicleTxs.length === 0 || gpsPoints.length === 0) continue;

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
          cardNumber: tx.cardNumber || '',
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

        const assessment = assessTransaction(canonicalTx as any, gpsPoints as any, null, undefined, vehicleTxs as any);

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
      vehicleStatuses[vReg] = hasMappingErrors ? 'Review required' : 'Check completed';
      checkResults[vReg] = {
        results,
        supported,
        likelySupported,
        unsupported,
        insufficient,
        reviewRequired,
      };
    }

    const rowWarnings = result.invoiceRows.flatMap(row => row.warnings || []);

    db.update('transaction_batches', id, {
      parserVersion: '2.0.0-coordinate',
      requiresReprocessing: false,
      dateRange: { earliest, latest },
      vehicles: uniqueVehicles,
      vehicleStatuses,
      checkResults,
      parsingWarnings: rowWarnings,
      chargeSummary: {
        totalChargesCount: result.invoiceRows.length,
        totalFuelVolume: parseFloat(totalFuelVolume.toFixed(2)),
        totalAmountExVatByCurrency,
      },
      auditHistory,
    });

    db.logAudit('REPROCESS_BATCH', 'transaction_batches', id, `Reprocessed batch ${id} to version 2.0.0-coordinate`);

    return NextResponse.json({
      success: true,
      batch: db.find('transaction_batches', (b: any) => b.id === id),
    });

  } catch (err: any) {
    console.error('Reprocess batch error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
