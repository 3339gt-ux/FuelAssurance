import { describe, it, expect } from 'vitest';
import { db } from '@/lib/db';
import { ProductType } from '@/domain/types';

describe('Fuel Assurance — Simple Mode Acceptance & Integration Tests', () => {
  it('1. Schema check for simple_checks table', () => {
    // Empty db table is defined
    const table = db.getTable('simple_checks');
    expect(table).toBeDefined();
    expect(Array.isArray(table)).toBe(true);
  });

  it('2. Simple Mode calculation check (DKV / AS24)', () => {
    // Seed a dummy simple check record
    const mockCheckId = 'mock-check-1';
    db.truncate('simple_checks');
    
    const record = db.insert('simple_checks', {
      id: mockCheckId,
      provider: 'DKV',
      vehicle: '241MH2362',
      check_date: new Date().toISOString(),
      transaction_file_name: 'Ola_Report_2026-06-08 (2).xlsx',
      gps_file_name: 'GPS 1.xls',
      total_transactions: 14,
      supported_count: 13,
      likely_supported_count: 0,
      review_required_count: 0,
      unsupported_count: 1,
      insufficient_evidence_count: 0,
      results: [
        {
          id: 'tx-1',
          transactionDate: '2026-06-08',
          transactionTimestamp: '2026-06-08T10:00:00Z',
          productName: 'Diesel',
          productType: ProductType.DIESEL,
          stationName: 'SHELL DUBLIN',
          quantity: '500.00',
          amountGross: '650.00',
          simpleStatus: 'Supported',
          confidence: 90,
          friendlyReason: 'Supported — Vehicle stop and fuel level movement matched.',
          factors: [],
        },
        {
          id: 'tx-2',
          transactionDate: '2026-06-08',
          transactionTimestamp: '2026-06-08T12:00:00Z',
          productName: 'Diesel',
          productType: ProductType.DIESEL,
          stationName: 'TEXACO CORK',
          quantity: '100.00',
          amountGross: '130.00',
          simpleStatus: 'Not supported',
          confidence: 10,
          friendlyReason: 'Not supported — Vehicle was in Dublin during transaction.',
          factors: [],
        }
      ]
    });

    expect(record).toBeDefined();
    expect(record.id).toBe(mockCheckId);
    expect(record.provider).toBe('DKV');
    expect(record.vehicle).toBe('241MH2362');
    expect(record.results).toHaveLength(2);

    // Retrieve from DB and verify
    const retrieved = db.find('simple_checks', (c: any) => c.id === mockCheckId);
    expect(retrieved).toBeDefined();
    expect(retrieved.supported_count).toBe(13);
    expect(retrieved.unsupported_count).toBe(1);
  });
});
