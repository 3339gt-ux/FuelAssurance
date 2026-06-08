import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { parseGPSFile } from '@/domain/parsers/gps/gps-parser';

describe('GPS Telematics Parser', () => {
  const samplePath = path.resolve(__dirname, '../../../Sample Files/GPS 1.xls');

  it('should parse GPS telematics file successfully', () => {
    expect(fs.existsSync(samplePath)).toBe(true);

    const workbook = XLSX.readFile(samplePath);
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
