import { describe, it, expect } from 'vitest';
import { parseDKVInvoicePDF, type PdfItem } from '@/domain/parsers/dkv/dkv-invoice-pdf-parser';
import { ProductType } from '@/domain/types';

describe('DKV Invoice PDF Parser', () => {
  it('should return empty list if pagesData is empty', () => {
    const result = parseDKVInvoicePDF('some text', 'test-file-id', []);
    expect(result.invoiceRows).toEqual([]);
    expect(result.statement).toBeUndefined();
  });

  it('should parse DKV Summary Page and Transaction details correctly', () => {
    // 1. Synthetic Page 1 (Summary Statement Page)
    const page1Items: PdfItem[] = [
      { str: 'Customer number: ', x: 10, y: 10, width: 50, height: 10 },
      { str: '123456', x: 10, y: 15, width: 30, height: 10 },
      { str: 'Document number: ', x: 30, y: 10, width: 50, height: 10 },
      { str: '26/987654321/001', x: 30, y: 15, width: 80, height: 10 },
      { str: 'Document date: ', x: 50, y: 10, width: 50, height: 10 },
      { str: '11.06.2026', x: 50, y: 15, width: 50, height: 10 },
      { str: 'Total to be paid  321.35  EUR', x: 100, y: 50, width: 200, height: 10 },
    ];

    // 2. Synthetic Page 2 (Belgium transactions page)
    const page2Items: PdfItem[] = [
      // Country service header
      { str: 'For services and deliveries in Belgium', x: 10, y: 50, width: 200, height: 10 },
      // Invoice details
      { str: 'Invoice number:', x: 20, y: 50, width: 50, height: 10 },
      { str: '26/987654321/001', x: 20, y: 100, width: 80, height: 10 },
      { str: 'Invoice date:', x: 30, y: 50, width: 50, height: 10 },
      { str: '11.06.2026', x: 30, y: 100, width: 50, height: 10 },
      
      // Vehicle Header Row
      { str: 'VEHICLE: 252MH1819 CARD NO.: 704310.0112283273', x: 60, y: 50, width: 250, height: 10 },
      
      // Transaction row items grouped by x = 100
      { str: '04.05.2026', x: 100, y: 41.11, width: 40, height: 10 },
      { str: 'DIVERSE / OTHER', x: 100, y: 83.94, width: 60, height: 10 },
      { str: 'VEURNE', x: 100, y: 137.48, width: 40, height: 10 },
      { str: '1098093', x: 100, y: 196.70, width: 40, height: 10 },
      { str: '1234567', x: 100, y: 256.18, width: 40, height: 10 },
      { str: '14:14', x: 100, y: 292.74, width: 20, height: 10 },
      { str: '89600', x: 100, y: 325.89, width: 30, height: 10 },
      { str: 'GAZOLE', x: 100, y: 348.96, width: 40, height: 10 },
      { str: '10', x: 100, y: 426.59, width: 15, height: 10 },
      { str: 'LTR', x: 100, y: 445.33, width: 15, height: 10 },
      { str: '169.070', x: 100, y: 482.14, width: 30, height: 10 },
      { str: '1.90', x: 100, y: 520.31, width: 20, height: 10 },
      { str: '1.75', x: 100, y: 549.76, width: 20, height: 10 },
      { str: '295.66', x: 100, y: 592.59, width: 30, height: 10 },
      { str: '-37.20', x: 100, y: 631.49, width: 30, height: 10 },
      { str: '7.12', x: 100, y: 666.26, width: 20, height: 10 },
      { str: '265.58', x: 100, y: 702.35, width: 30, height: 10 },
      { str: '55.77', x: 100, y: 743.20, width: 20, height: 10 },
      { str: '321.35', x: 100, y: 788.01, width: 30, height: 10 },
    ];

    const pagesData = [
      { pageNum: 1, items: page1Items },
      { pageNum: 2, items: page2Items },
    ];

    const result = parseDKVInvoicePDF('some full text', 'file-123', pagesData);

    expect(result.statement).toBeDefined();
    expect(result.statement?.customerNumber).toBe('123456');
    expect(result.statement?.documentNumber).toBe('26/987654321/001');
    expect(result.statement?.documentDate).toBe('2026-06-11');
    expect(result.statement?.statementTotalPaymentCurrency).toBe('321.35');

    expect(result.invoiceRows.length).toBe(1);
    
    const row = result.invoiceRows[0]!;
    expect(row.registration).toBe('252MH1819');
    expect(row.cardNumber).toBe('704310.0112283273');
    expect(row.invoiceNumber).toBe('26/987654321/001');
    expect(row.invoiceDate).toBe('2026-06-11');
    expect(row.transactionDate).toBe('2026-05-04');
    expect(row.transactionTimestamp).toBe('2026-05-04T14:14:00.000Z');
    expect(row.productName).toBe('GAZOLE');
    expect(row.productType).toBe(ProductType.DIESEL);
    
    expect(row.quantity).toBe('169.07');
    expect(row.unit).toBe('LTR');
    expect(row.baseValueNet).toBe('295.66');
    expect(row.discountNet).toBe('-37.2');
    expect(row.serviceFeeNet).toBe('7.12');
    expect(row.valueOfPurchaseNet).toBe('265.58');
    expect(row.vat).toBe('55.77');
    expect(row.valueInPayCurrency).toBe('321.35');
    
    // Check arithmetic details matches expected values
    // 295.66 + 7.12 - 37.20 = 265.58
    expect(parseFloat(row.baseValueNet) + parseFloat(row.serviceFeeNet) + parseFloat(row.discountNet)).toBeCloseTo(265.58);
    // 265.58 + 55.77 = 321.35
    expect(parseFloat(row.valueOfPurchaseNet) + parseFloat(row.vat)).toBeCloseTo(321.35);

    // Source Evidence checks
    expect(row.sourceEvidence).toBeDefined();
    expect(row.sourceEvidence?.sourceType).toBe('DKV_PDF');
    expect(row.sourceEvidence?.pageNumber).toBe(2);
    expect(row.sourceEvidence?.boundingBox).toBeDefined();
    expect(row.sourceEvidence?.boundingBox?.width).toBeGreaterThan(0);
  });

  it('should mark parser warning/error if fuel quantity exceeds physical limit of 1250L', () => {
    const page1Items: PdfItem[] = [];
    const page2Items: PdfItem[] = [
      { str: 'For services and deliveries in Belgium', x: 10, y: 50, width: 200, height: 10 },
      { str: 'VEHICLE: 252MH1819 CARD NO.: 704310.0112283273', x: 60, y: 50, width: 250, height: 10 },
      
      // Transaction row items with quantity = 1500.000 (exceeds limit)
      { str: '04.05.2026', x: 100, y: 41.11, width: 40, height: 10 },
      { str: 'GAZOLE', x: 100, y: 348.96, width: 40, height: 10 },
      { str: 'LTR', x: 100, y: 445.33, width: 15, height: 10 },
      { str: '1500.000', x: 100, y: 482.14, width: 30, height: 10 },
      { str: '295.66', x: 100, y: 592.59, width: 30, height: 10 },
      { str: '0.00', x: 100, y: 631.49, width: 30, height: 10 },
      { str: '0.00', x: 100, y: 666.26, width: 20, height: 10 },
      { str: '295.66', x: 100, y: 702.35, width: 30, height: 10 },
      { str: '62.09', x: 100, y: 743.20, width: 20, height: 10 },
      { str: '357.75', x: 100, y: 788.01, width: 30, height: 10 },
    ];

    const pagesData = [
      { pageNum: 1, items: page1Items },
      { pageNum: 2, items: page2Items },
    ];

    const result = parseDKVInvoicePDF('some full text', 'file-123', pagesData);
    expect(result.invoiceRows.length).toBe(1);
    
    const row = result.invoiceRows[0]!;
    expect(row.status).toBe('PARSER_MAPPING_ERROR');
    expect(row.extractionConfidence).toBe(10);
    expect(row.warnings?.some(w => w.includes('PHYSICAL_LIMIT_EXCEEDED'))).toBe(true);
  });
});
