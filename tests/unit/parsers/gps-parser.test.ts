import { describe, it, expect } from 'vitest';
import fs from 'fs';
import * as XLSX from 'xlsx';
import { parseGPSFile } from '@/domain/parsers/gps/gps-parser';
import { resolveFixtureOrSample } from '../../helpers/fixtures';

describe('GPS Telematics Parser', () => {
  it('should parse GPS telematics file successfully', () => {
    const filePath = resolveFixtureOrSample('synthetic-gps.xlsx', 'GPS 1.xls');
    expect(fs.existsSync(filePath)).toBe(true);

    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    expect(sheetName).toBeDefined();

    const worksheet = workbook.Sheets[sheetName!];
    expect(worksheet).toBeDefined();

    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet!, { header: 1 });
    const result = parseGPSFile(rows, 'test-gps-file-id');

    expect(result).toBeDefined();
    expect(result.points.length).toBeGreaterThan(0);

    const point = result.points[0];
    expect(point).toBeDefined();
    if (point) {
      expect(point.importFileId).toBe('test-gps-file-id');
      expect(point.vehicleRegistration).toBeDefined();
      expect(point.timestamp).toBeDefined();
      expect(point.fuelLevelPercent).toBeDefined();
      expect(point.odometerKm).toBeDefined();
      expect(point.locationCity).toBeDefined();
      // Verify no coordinate fabrication
      expect(point.latitude).toBeNull();
      expect(point.longitude).toBeNull();
    }
  });
});
