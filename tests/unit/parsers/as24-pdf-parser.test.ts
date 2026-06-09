import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';
import { parseAS24PDF, splitRegAndOdo } from '@/domain/parsers/as24/as24-pdf-parser';
import { ProductType } from '@/domain/types';

describe('AS24 PDF Parser', () => {
  const pdfPath = path.resolve(__dirname, '../../../Sample Files/document_direct.pdf');

  it('should split registration and odometer correctly', () => {
    // 241 MH registrations (3 digits)
    expect(splitRegAndOdo('241 MH 236261000')).toEqual({
      registration: '241MH236',
      odometer: '261000'
    });
    expect(splitRegAndOdo('241 MH 2380')).toEqual({
      registration: '241MH238',
      odometer: '0'
    });
    expect(splitRegAndOdo('241 MH 269147910')).toEqual({
      registration: '241MH269',
      odometer: '147910'
    });

    // 252 MH registrations starting with 1 (4 digits)
    expect(splitRegAndOdo('252MH10700')).toEqual({
      registration: '252MH1070',
      odometer: '0'
    });
    expect(splitRegAndOdo('252MH145332000')).toEqual({
      registration: '252MH1453',
      odometer: '32000'
    });

    // 252 MH registrations starting with 7 or 8 (3 digits)
    expect(splitRegAndOdo('252MH7618')).toEqual({
      registration: '252MH761',
      odometer: '8'
    });
    expect(splitRegAndOdo('252MH8850')).toEqual({
      registration: '252MH885',
      odometer: '0'
    });
  });

  it('should parse the sample AS24 PDF successfully', async () => {
    expect(fs.existsSync(pdfPath)).toBe(true);
    
    const buffer = fs.readFileSync(pdfPath);
    const pdfData = await pdf(buffer);
    const result = parseAS24PDF(pdfData.text, 'test-file-id');

    expect(result).toBeDefined();
    expect(result.sections).toHaveLength(3);
    
    // Check invoice statement details
    expect(result.statement).toBeDefined();
    expect(result.statement?.invoiceNumber).toBe('5500PRF001465');
    expect(result.statement?.contractNumber).toBe('609851');
    expect(result.statement?.totalGrossAmount).toBe('40154.47');

    // Check parsed transaction rows
    expect(result.invoiceRows.length).toBeGreaterThan(0);
    
    // Find a diesel row and verify
    const dieselRows = result.invoiceRows.filter(r => r.productType === ProductType.DIESEL);
    expect(dieselRows.length).toBeGreaterThan(0);
    
    const sampleDiesel = dieselRows[0];
    expect(sampleDiesel).toBeDefined();
    if (!sampleDiesel) throw new Error('sampleDiesel is undefined');
    expect(sampleDiesel.importFileId).toBe('test-file-id');
    expect(sampleDiesel.invoiceNumber).toBe('5500PRF001465');
    expect(sampleDiesel.customerId).toBe('609851');
    expect(sampleDiesel.paymentCurrency).toBe('EUR'); // Payment currency should be EUR settled
    
    // Check PASSango toll rows
    const tollRows = result.invoiceRows.filter(r => r.productCode === 'PASSango');
    expect(tollRows.length).toBeGreaterThan(0);
    
    const sampleToll = tollRows[0];
    expect(sampleToll).toBeDefined();
    if (!sampleToll) throw new Error('sampleToll is undefined');
    expect(sampleToll.productType).toBe(ProductType.TOLL);
    expect(sampleToll.quantity).toBeDefined(); // distance in km
    expect(sampleToll.baseValueNet).toBeDefined();
  });

  describe('Coordinate-Aware & Plausibility Regression Tests', () => {
    it('should parse the Veszprem transaction from exact coordinate-like mock data', () => {
      // Mock pagesData representing row 10 and 11
      const mockPageItems = [
        // Header card/vehicle
        { str: ' * 0151-0 252MH1717', x: 15.6, y: 651.6, width: 10, height: 10 },
        { str: '82353', x: 240.5, y: 651.6, width: 10, height: 10 },
        // Detail row
        { str: '03 Diesel', x: 72.3, y: 645.9, width: 10, height: 10 },
        { str: '01', x: 103.4, y: 645.9, width: 10, height: 10 },
        { str: 'HUN 6609 VESZPREM', x: 116.2, y: 645.9, width: 10, height: 10 },
        { str: '04/05/2026 14:14', x: 193.5, y: 645.9, width: 10, height: 10 },
        { str: '89600', x: 240.5, y: 645.9, width: 10, height: 10 },
        { str: '4.28', x: 267.2, y: 645.9, width: 10, height: 10 },
        { str: '310.46', x: 290.3, y: 645.9, width: 10, height: 10 },
        { str: 'HUF', x: 311.7, y: 645.9, width: 10, height: 10 },
        { str: '716.498', x: 347.2, y: 645.9, width: 10, height: 10 },
        { str: '13.500', x: 383.8, y: 645.9, width: 10, height: 10 },
        { str: '175 153.00', x: 414.4, y: 645.9, width: 10, height: 10 },
        { str: '175 153.00', x: 448.4, y: 645.9, width: 10, height: 10 },
        { str: '47 291.00', x: 479.4, y: 645.9, width: 10, height: 10 },
        { str: '486.83', x: 528.3, y: 645.9, width: 10, height: 10 },
        { str: '618.27', x: 570.9, y: 645.9, width: 10, height: 10 },
      ];

      const pagesData = [{ pageNum: 4, items: mockPageItems }];
      // Set cards filling list indicator so the parser treats it as card filling list page
      mockPageItems.push({ str: 'Cards filling list', x: 300, y: 800, width: 10, height: 10 });
      mockPageItems.push({ str: 'Vehicle/Driver', x: 28.0, y: 666.8, width: 10, height: 10 });

      const result = parseAS24PDF('mock text', 'test-file-id', pagesData);

      expect(result.invoiceRows).toHaveLength(1);
      const row = result.invoiceRows[0]!;
      expect(row.registration).toBe('252MH1717');
      expect(row.cardNumber).toBe('0151-0');
      expect(row.productCode).toBe('03');
      expect(row.productName).toBe('Diesel');
      expect(row.pumpCode).toBe('01');
      expect(row.countryCode).toBe('HUN');
      expect(row.forecourtCode).toBe('6609');
      expect(row.forecourtName).toBe('VESZPREM');
      expect(row.transactionDate).toBe('2026-05-04');
      
      // Prove that it parsed these fields correctly and separately
      expect(row.mileageKm).toBe('89600');
      expect(row.litresPer100Km).toBe('4.28');
      expect(row.volume).toBe('310.46');
      expect(row.stationCurrency).toBe('HUF');
      expect(row.stationAmountExVat).toBe('175 153.00');
      expect(row.paymentCurrency).toBe('EUR');
      expect(row.paymentAmountExVat).toBe('486.83');
      expect(row.paymentAmountInclVat).toBe('618.27');

      // Prove that the parser never produces concatenated values
      expect(row.volume).not.toBe('896004.28310');
      expect(row.paymentAmountExVat).not.toBe('83618.27');
    });

    it('should validate and remap fuel volume exceeding 1,250L limit', () => {
      // Test direct valid volume
      const result1 = parseAS24PDF('mock text', 'test-file-id', [{
        pageNum: 4,
        items: [
          { str: 'Cards filling list', x: 300, y: 800, width: 10, height: 10 },
          { str: 'Vehicle/Driver', x: 28.0, y: 666.8, width: 10, height: 10 },
          { str: ' * 0151-0 252MH1717', x: 15.6, y: 651.6, width: 10, height: 10 },
          { str: '03 Diesel', x: 72.3, y: 645.9, width: 10, height: 10 },
          { str: '04/05/2026 14:14', x: 193.5, y: 645.9, width: 10, height: 10 },
          { str: '89600', x: 240.5, y: 645.9, width: 10, height: 10 },
          { str: '4.28', x: 267.2, y: 645.9, width: 10, height: 10 },
          { str: '896004.28310.46', x: 290.3, y: 645.9, width: 10, height: 10 }, // Concatenated volume
          { str: 'EUR', x: 311.7, y: 645.9, width: 10, height: 10 },
          { str: '10.00', x: 528.3, y: 645.9, width: 10, height: 10 },
          { str: '12.00', x: 570.9, y: 645.9, width: 10, height: 10 },
        ]
      }]);

      expect(result1.invoiceRows).toHaveLength(1);
      const row1 = result1.invoiceRows[0]!;
      // Confirms volume was safely remapped to 310.46
      expect(row1.volume).toBe('310.46');
      expect(row1.status).toBe('Needs field review');
      expect(row1.warnings?.[0]).toContain('PHYSICAL_LIMIT_EXCEEDED');

      // Test impossible volume that cannot be remapped
      const result2 = parseAS24PDF('mock text', 'test-file-id', [{
        pageNum: 4,
        items: [
          { str: 'Cards filling list', x: 300, y: 800, width: 10, height: 10 },
          { str: 'Vehicle/Driver', x: 28.0, y: 666.8, width: 10, height: 10 },
          { str: ' * 0151-0 252MH1717', x: 15.6, y: 651.6, width: 10, height: 10 },
          { str: '03 Diesel', x: 72.3, y: 645.9, width: 10, height: 10 },
          { str: '04/05/2026 14:14', x: 193.5, y: 645.9, width: 10, height: 10 },
          { str: '89600', x: 240.5, y: 645.9, width: 10, height: 10 },
          { str: '4.28', x: 267.2, y: 645.9, width: 10, height: 10 },
          { str: '99999.00', x: 290.3, y: 645.9, width: 10, height: 10 }, // Invalid volume
          { str: 'EUR', x: 311.7, y: 645.9, width: 10, height: 10 },
          { str: '10.00', x: 528.3, y: 645.9, width: 10, height: 10 },
          { str: '12.00', x: 570.9, y: 645.9, width: 10, height: 10 },
        ]
      }]);

      expect(result2.invoiceRows).toHaveLength(1);
      const row2 = result2.invoiceRows[0]!;
      expect(row2.volume).toBe('99999.00');
      expect(row2.status).toBe('PARSER_MAPPING_ERROR');
      expect(row2.extractionConfidence).toBe(30);
    });

    it('should validate financial ratio and catch concatenation of payment amounts', () => {
      const result = parseAS24PDF('mock text', 'test-file-id', [{
        pageNum: 4,
        items: [
          { str: 'Cards filling list', x: 300, y: 800, width: 10, height: 10 },
          { str: 'Vehicle/Driver', x: 28.0, y: 666.8, width: 10, height: 10 },
          { str: ' * 0151-0 252MH1717', x: 15.6, y: 651.6, width: 10, height: 10 },
          { str: '03 Diesel', x: 72.3, y: 645.9, width: 10, height: 10 },
          { str: '04/05/2026 14:14', x: 193.5, y: 645.9, width: 10, height: 10 },
          { str: '89600', x: 240.5, y: 645.9, width: 10, height: 10 },
          { str: '4.28', x: 267.2, y: 645.9, width: 10, height: 10 },
          { str: '310.46', x: 290.3, y: 645.9, width: 10, height: 10 },
          { str: 'HUF', x: 311.7, y: 645.9, width: 10, height: 10 },
          { str: '486.83', x: 528.3, y: 645.9, width: 10, height: 10 }, // Net amount
          { str: '83618.27', x: 570.9, y: 645.9, width: 10, height: 10 }, // Concatenated gross
        ]
      }]);

      expect(result.invoiceRows).toHaveLength(1);
      const row = result.invoiceRows[0]!;
      expect(row.status).toBe('PARSER_MAPPING_ERROR');
      expect(row.warnings?.[0]).toContain('FINANCIAL_VALIDATION_ERROR');
    });
  });
});

