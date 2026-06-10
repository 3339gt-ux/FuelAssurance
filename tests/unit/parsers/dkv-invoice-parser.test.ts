import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { parseDKVInvoice } from '@/domain/parsers/dkv/dkv-invoice-parser';

describe('DKV Invoice Parser', () => {
  const samplePath = path.resolve(__dirname, '../../../Sample Files/Invoice-Transactions_Report_2026-06-08 (2).xlsx');
  const syntheticPath = path.resolve(__dirname, '../../fixtures/synthetic-dkv-invoice-period.xlsx');

  it('should parse DKV Invoice successfully', () => {
    const filePath = fs.existsSync(samplePath) ? samplePath : syntheticPath;
    expect(fs.existsSync(filePath)).toBe(true);

    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    expect(sheetName).toBeDefined();

    const worksheet = workbook.Sheets[sheetName!];
    expect(worksheet).toBeDefined();

    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet!, { header: 1 });
    const result = parseDKVInvoice(rows, 'test-invoice-file-id');

    expect(result).toBeDefined();
    expect(result.invoiceRows.length).toBeGreaterThan(0);

    const row = result.invoiceRows[0];
    expect(row).toBeDefined();
    if (row) {
      expect(row.importFileId).toBe('test-invoice-file-id');
      expect(row.invoiceNumber).toBeDefined();
      expect(row.invoiceDate).toBeDefined();
      expect(row.registration).toBeDefined();
      expect(row.cardNumber).toBeDefined();
      expect(row.baseValueNet).toBeDefined();
      expect(row.baseValueGross).toBeDefined();
    }
  });
});
