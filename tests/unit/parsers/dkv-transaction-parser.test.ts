import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { parseDKVTransactions } from '@/domain/parsers/dkv/dkv-transaction-parser';
import { ProductType } from '@/domain/types';

describe('DKV Transaction Parser', () => {
  const sample1Path = path.resolve(__dirname, '../../../Sample Files/Ola_Report_2026-06-08 (1).xlsx');
  const sample2Path = path.resolve(__dirname, '../../../Sample Files/Ola_Report_2026-06-08 (2).xlsx');
  const syntheticPath = path.resolve(__dirname, '../../fixtures/synthetic-dkv-daily.xlsx');

  it('should parse DKV Transaction Variant 1 (12 columns) successfully', () => {
    const filePath = fs.existsSync(sample1Path) ? sample1Path : syntheticPath;
    expect(fs.existsSync(filePath)).toBe(true);

    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    expect(sheetName).toBeDefined();

    const worksheet = workbook.Sheets[sheetName!];
    expect(worksheet).toBeDefined();

    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet!, { header: 1 });
    const result = parseDKVTransactions(rows, 'test-file-id-1');

    expect(result).toBeDefined();
    expect(result.transactions.length).toBeGreaterThan(0);
    expect(result.variant).toBe(1);

    // Verify some canonical properties on the first transaction
    const tx = result.transactions[0];
    expect(tx).toBeDefined();
    if (tx) {
      expect(tx.importFileId).toBe('test-file-id-1');
      expect(tx.registration).toBeDefined();
      expect(tx.cardNumber).toBeDefined();
      expect(tx.productType).toBeDefined();
      expect(tx.transactionDate).toBeDefined();
    }
  });

  it('should parse DKV Transaction Variant 2 (21 columns) successfully', () => {
    expect(fs.existsSync(sample2Path)).toBe(true);

    const workbook = XLSX.readFile(sample2Path);
    const sheetName = workbook.SheetNames[0];
    expect(sheetName).toBeDefined();

    const worksheet = workbook.Sheets[sheetName!];
    expect(worksheet).toBeDefined();

    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet!, { header: 1 });
    const result = parseDKVTransactions(rows, 'test-file-id-2');

    expect(result).toBeDefined();
    expect(result.transactions.length).toBeGreaterThan(0);
    expect(result.variant).toBe(2);

    // Verify fields specific to Variant 2
    const tx = result.transactions[0];
    expect(tx).toBeDefined();
    if (tx) {
      expect(tx.importFileId).toBe('test-file-id-2');
      expect(tx.customerId).toBeDefined();
      expect(tx.stationNumber).toBeDefined();
      expect(tx.authorisationId).toBeDefined();
    }
  });
});
