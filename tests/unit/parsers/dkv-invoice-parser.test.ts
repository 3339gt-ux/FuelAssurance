import { describe, it, expect } from 'vitest';
import fs from 'fs';
import * as XLSX from 'xlsx';
import { parseDKVInvoice } from '@/domain/parsers/dkv/dkv-invoice-parser';
import { resolveFixtureOrSample } from '../../helpers/fixtures';

describe('DKV Invoice Parser', () => {
  it('should parse DKV Invoice successfully', () => {
    const filePath = resolveFixtureOrSample('synthetic-dkv-invoice-period.xlsx', 'Invoice-Transactions_Report_2026-06-08 (2).xlsx');
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
