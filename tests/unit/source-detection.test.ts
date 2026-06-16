import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { detectSourceType, mapSourceTypeToProvider } from '@/lib/source-detection';

const fixturesDir = path.resolve(__dirname, '../fixtures');

describe('Source type detection', () => {
  it('detects DKV daily transactions from structure', async () => {
    const buffer = fs.readFileSync(path.join(fixturesDir, 'synthetic-dkv-daily.xlsx'));
    const result = await detectSourceType(buffer, 'report.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(result.detected?.sourceType).toBe('DKV Daily Transaction Excel');
    expect(result.needsConfirmation).toBe(false);
  });

  it('detects DKV invoice-period from structure', async () => {
    const buffer = fs.readFileSync(path.join(fixturesDir, 'synthetic-dkv-invoice-period.xlsx'));
    const result = await detectSourceType(buffer, 'invoice.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(result.detected?.sourceType).toBe('DKV Invoice-Period Excel');
    expect(result.candidates.some((c) => c.sourceType === 'DKV Invoice-Period Excel')).toBe(true);
  });

  it('detects GPS telematics from structure', async () => {
    const buffer = fs.readFileSync(path.join(fixturesDir, 'synthetic-gps.xlsx'));
    const result = await detectSourceType(buffer, 'telemetry.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(result.detected?.sourceType).toBe('GPS / Telematics');
  });

  it('maps source types to provider routing', () => {
    expect(mapSourceTypeToProvider('DKV Daily Transaction Excel')).toEqual({ provider: 'DKV', documentType: 'TRANSACTION' });
    expect(mapSourceTypeToProvider('DKV Invoice-Period Excel')).toEqual({ provider: 'DKV', documentType: 'INVOICE' });
    expect(mapSourceTypeToProvider('AS24 Invoice PDF')).toEqual({ provider: 'AS24', documentType: 'INVOICE' });
  });
});