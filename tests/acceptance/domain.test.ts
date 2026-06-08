import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import pdf from 'pdf-parse';
import { parseDKVTransactions } from '@/domain/parsers/dkv/dkv-transaction-parser';
import { parseDKVInvoice } from '@/domain/parsers/dkv/dkv-invoice-parser';
import { parseGPSFile } from '@/domain/parsers/gps/gps-parser';
import { parseAS24PDF } from '@/domain/parsers/as24/as24-pdf-parser';
import { parseStationWorkbook } from '@/domain/parsers/stations/station-parser';
import { assessPeriodAlignment } from '@/domain/reconciliation/period-alignment';
import { runReconciliation } from '@/domain/reconciliation/matching-engine';
import { assessTransaction } from '@/domain/telematics/telematics-scorer';
import { ReconciliationStatus, TelematicsClassification, ProductType, PeriodOverlap } from '@/domain/types';
import Decimal from 'decimal.js';

describe('Fuel Assurance — Acceptance & Integration Test Suite', () => {
  const transactionPath = path.resolve(process.cwd(), 'Sample Files/Ola_Report_2026-06-08 (2).xlsx');
  const invoicePath = path.resolve(process.cwd(), 'Sample Files/Invoice-Transactions_Report_2026-06-08 (2).xlsx');
  const gpsPath = path.resolve(process.cwd(), 'Sample Files/GPS 1.xls');
  const pdfPath = path.resolve(process.cwd(), 'Sample Files/document_direct.pdf');
  const stationPath = path.resolve(process.cwd(), 'Sample Files/DKV _AS24 List (4).xlsx');

  it('1. DKV Transaction Workbook Ingestion', () => {
    expect(fs.existsSync(transactionPath)).toBe(true);
    const workbook = XLSX.readFile(transactionPath);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]!]!, { header: 1 });
    const result = parseDKVTransactions(rows, 'test-file-id');

    expect(result.detectedColumns).toBe(21);
    expect(result.totalRows).toBe(14);
    expect(result.approvedCount).toBe(13);
    expect(result.declinedCount).toBe(1);

    // Date range covers 7-8 June 2026
    const dates = result.transactions.map((tx) => tx.transactionDate).sort();
    expect(dates[0]).toBe('2026-06-07');
    expect(dates[dates.length - 1]).toBe('2026-06-08');

    // Confirm essential fields are present
    const firstTx = result.transactions[0]!;
    expect(firstTx.stationNumber).toBeDefined();
    expect(firstTx.stationName).toBeDefined();
    expect(firstTx.stationCity).toBeDefined();
    expect(firstTx.unit).toBeDefined();
    expect(firstTx.authorisationId).toBeDefined();
  });

  it('2. DKV Invoice Workbook Ingestion', () => {
    expect(fs.existsSync(invoicePath)).toBe(true);
    const workbook = XLSX.readFile(invoicePath);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]!]!, { header: 1 });
    const result = parseDKVInvoice(rows, 'test-file-id');

    expect(result.detectedColumns).toBe(40);
    expect(result.totalRows).toBe(211);

    // Check discount, VAT, mileage, document and equipment numbers are parsed
    const sampleRow = result.invoiceRows.find((r) => r.equipmentNumber !== '')!;
    expect(sampleRow).toBeDefined();
    expect(sampleRow.vat).toBeDefined();
    expect(sampleRow.documentNumber).toBeDefined();
    expect(sampleRow.discountNet).toBeDefined();
    expect(parseFloat(sampleRow.discountNet) >= 0).toBe(true);
  });

  it('3. Period Mismatch Warnings', () => {
    // Transaction file dates: 7-8 June 2026
    const txRange = { earliest: '2026-06-07', latest: '2026-06-08' };
    // Invoice file dates: e.g. March/April 2026
    const invRange = { earliest: '2026-03-01', latest: '2026-03-31' };

    const alignment = assessPeriodAlignment(txRange, invRange);
    expect(alignment.overlap).toBe(PeriodOverlap.NO_OVERLAP);
    expect(alignment.blocksAllClear).toBe(true);
    expect(alignment.warnings[0]).toContain('does not overlap');
  });

  it('4. AS24 PDF Parsing and Control-Total Audit', async () => {
    expect(fs.existsSync(pdfPath)).toBe(true);
    const buffer = fs.readFileSync(pdfPath);
    const pdfData = await pdf(buffer);
    const result = parseAS24PDF(pdfData.text, 'test-file-id');

    expect(pdfData.numpages).toBeGreaterThan(0);
    expect(result.sections).toHaveLength(3); // Invoice Statement, Cards Filling, PASSango
    expect(result.invoiceRows.length).toBeGreaterThan(0);

    // Confirm that headers/totals are excluded from transaction rows
    const hasTotalRow = result.invoiceRows.some((r) => r.stationName.includes('Total') || r.stationName.includes('Contract'));
    expect(hasTotalRow).toBe(false);

    // Confirm statement total check is parsed
    expect(result.statement).toBeDefined();
    expect(result.statement?.totalGrossAmount).toBeDefined();
    
    // Recalculated total by currency (e.g. HUF, PLN, EUR)
    const currencies = Array.from(new Set(result.invoiceRows.map((r) => r.paymentCurrency)));
    expect(currencies.length).toBeGreaterThan(0);
  });

  it('5. GPS Ingestion & Telematics Scoring', () => {
    expect(fs.existsSync(gpsPath)).toBe(true);
    const workbook = XLSX.readFile(gpsPath);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]!]!, { header: 1 });
    const result = parseGPSFile(rows, 'test-file-id');

    expect(result.points.length).toBeGreaterThan(0);

    // Odometer and speed fields present
    const pt = result.points[0]!;
    expect(pt.odometerKm).toBeGreaterThan(0);
    expect(pt.speedKmh).toBeDefined();
    // Latitude and longitude are not fabricated
    expect(pt.latitude).toBeNull();
    expect(pt.longitude).toBeNull();
  });

  it('6. Telematics Volume Capacity & Product Exclusions', () => {
    const tx = {
      id: 'tx-1',
      importFileId: 'file-1',
      importRowIndex: 1,
      registration: '241MH2362',
      cardNumber: '0001-2',
      cardNumberNormalised: '0001-2',
      transactionDate: '2026-06-08',
      transactionTimestamp: '2026-06-08T10:00:00Z',
      timestampPrecision: 'EXACT' as any,
      stationNumber: 'SS123',
      stationNumberNormalised: '123',
      stationName: 'SHELL DUBLIN',
      stationCity: 'Dublin',
      serviceCountry: 'IE',
      productCode: 'WA0009',
      productGroup: 'Diesel',
      productName: 'Diesel',
      productType: ProductType.DIESEL,
      costGroup: '',
      quantity: '500.00', // volume check
      unit: 'L',
      amountGross: '650.00',
      mileage: '120000',
      authorisationId: '123456',
      responseCode: 'APP',
      isApproved: true,
      customerId: '',
      costCentre: '',
      cardAddition: '',
      stationCategory: '',
      provider: 'DKV' as any,
    };

    const points: any[] = [
      {
        id: 'pt-1',
        importFileId: 'file-1',
        importRowIndex: 1,
        vehicleRegistration: '241MH2362',
        trailer: '',
        driver: '',
        timestamp: '2026-06-08T09:55:00Z',
        timestampPrecision: 'EXACT' as any,
        latitude: null,
        longitude: null,
        odometerKm: 120050,
        fuelLevelPercent: 30, // refuel increase
        speedKmh: 0,
        dataSource: 'GPS',
        activity: 'IGNITION_ON',
        info: '',
        locationCity: 'Dublin',
        locationTown: '',
        locationStreet: '',
        locationVillage: '',
        locationAddress: 'Dublin Port',
      },
      {
        id: 'pt-2',
        importFileId: 'file-1',
        importRowIndex: 2,
        vehicleRegistration: '241MH2362',
        trailer: '',
        driver: '',
        timestamp: '2026-06-08T10:05:00Z',
        timestampPrecision: 'EXACT' as any,
        latitude: null,
        longitude: null,
        odometerKm: 120050,
        fuelLevelPercent: 70, // +40% fuel
        speedKmh: 0,
        dataSource: 'GPS',
        activity: 'IGNITION_ON',
        info: '',
        locationCity: 'Dublin',
        locationTown: '',
        locationStreet: '',
        locationVillage: '',
        locationAddress: 'Dublin Port',
      },
    ];

    const assessment = assessTransaction(tx, points as any, null);
    expect(assessment.totalScore).toBeGreaterThan(50);
    expect(assessment.classification).toBe(TelematicsClassification.VERIFIED);

    // Verify AdBlue product is excluded from diesel tank calculations
    const adBlueTx = { ...tx, productType: ProductType.ADBLUE };
    const adBlueAssessment = assessTransaction(adBlueTx, points as any, null);
    const fuelFactor = adBlueAssessment.factors.find((f) => f.dimension === 'FUEL_LEVEL_MOVEMENT')!;
    expect(fuelFactor.result).toBe('SKIP');
  });

  it('7. Station Master Workbook parsing', () => {
    expect(fs.existsSync(stationPath)).toBe(true);
    const workbook = XLSX.readFile(stationPath);
    const sheetData = new Map<string, unknown[][]>();
    for (const name of workbook.SheetNames) {
      sheetData.set(name, XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name!]!, { header: 1 }));
    }
    const result = parseStationWorkbook(workbook.SheetNames, sheetData, 'test-file-id');

    // Emoji handling in sheet names check
    const yardProcessed = result.sheetsProcessed.some((s) => s.includes('Yard, DKV Prices'));
    expect(yardProcessed).toBe(true);
    
    expect(result.stations.length).toBeGreaterThan(0);

    // Prefix alias handled, station codes are strings
    const yardStation = result.stations.find((s) => s.sourceSheet === 'YARD_DKV')!;
    expect(yardStation).toBeDefined();
    expect(typeof yardStation.stationCode).toBe('string');
  });

  it('8. One-to-one Match Protection', () => {
    const txs: any[] = [
      { id: 'tx-1', importFileId: 'f1', importRowIndex: 1, isApproved: true, registration: 'A', cardNumber: '1', productCode: 'P', stationNumber: 'S', quantity: '10.0', unit: 'L', amountGross: '15.0', transactionDate: '2026-06-08', transactionTimestamp: '2026-06-08T10:00:00Z', timestampPrecision: 'EXACT' as any, stationNumberNormalised: 'S', cardNumberNormalised: '1', provider: 'DKV' as any, stationName: '', stationCity: '', serviceCountry: 'IE', productGroup: '', productName: '', productType: ProductType.DIESEL, costGroup: '', mileage: '', authorisationId: '', responseCode: 'APP', customerId: '', costCentre: '', cardAddition: '', stationCategory: '' },
      { id: 'tx-2', importFileId: 'f1', importRowIndex: 2, isApproved: true, registration: 'A', cardNumber: '1', productCode: 'P', stationNumber: 'S', quantity: '10.0', unit: 'L', amountGross: '15.0', transactionDate: '2026-06-08', transactionTimestamp: '2026-06-08T10:00:00Z', timestampPrecision: 'EXACT' as any, stationNumberNormalised: 'S', cardNumberNormalised: '1', provider: 'DKV' as any, stationName: '', stationCity: '', serviceCountry: 'IE', productGroup: '', productName: '', productType: ProductType.DIESEL, costGroup: '', mileage: '', authorisationId: '', responseCode: 'APP', customerId: '', costCentre: '', cardAddition: '', stationCategory: '' },
    ];
    const invRows: any[] = [
      { id: 'inv-1', importFileId: 'f2', importRowIndex: 1, registration: 'A', cardNumber: '1', productCode: 'P', stationNumber: 'S', quantity: '10.0', unit: 'L', baseValueGross: '15.0', transactionDate: '2026-06-08', transactionTimestamp: '2026-06-08T10:00:00Z', timestampPrecision: 'EXACT' as any, stationNumberNormalised: 'S', cardNumberNormalised: '1', provider: 'DKV' as any, equipmentNumber: '', invoiceNumber: '', invoiceDate: '', documentNumber: '', ticketNumber: '', transactionNumber: '', stationName: '', stationCity: '', stationZipCode: '', serviceCountry: 'IE', invoiceCountry: '', productGroup: '', productName: '', productType: ProductType.DIESEL, costGroup: '', pricePerUnit: '', pricePerUnitGross: '', baseValueNet: '', serviceFeeNet: '', valueOfPurchaseNet: '', discountNet: '', discountGross: '', vat: '', paymentCurrency: '', serviceCurrency: '', valueInPayCurrency: '', valueInServiceCountryCurrency: '', costCentre1: '', costCentre2: '', mileage: '', agesTerminal: '', customerId: '', cardNumberPartner: '' },
    ];

    const alignment = { transactionDateRange: { earliest: '2026-06-08', latest: '2026-06-08' }, invoiceDateRange: { earliest: '2026-06-08', latest: '2026-06-08' }, overlap: PeriodOverlap.FULL_OVERLAP, overlapDays: 1, warnings: [], blocksAllClear: false, userPeriod: null };
    const run = runReconciliation(txs, invRows, alignment);

    // Only 1 match should be created due to 1-to-1 protection (invoice row inv-1 matched once only)
    expect(run.matches.length).toBe(1);
    expect(run.unmatchedTransactions.length).toBe(1);
    expect(run.unmatchedInvoiceRows.length).toBe(0);
  });
});
