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
    expect(sampleDiesel.paymentCurrency).toBe('HUF');
    
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
});
