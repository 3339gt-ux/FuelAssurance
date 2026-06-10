import { describe, it, expect } from 'vitest';
import fs from 'fs';
import * as XLSX from 'xlsx';
import { parseStationWorkbook } from '@/domain/parsers/stations/station-parser';
import { resolveFixtureOrSample } from '../../helpers/fixtures';

describe('Station Master Workbook Parser', () => {
  it('should parse DKV / AS24 station list successfully', () => {
    const filePath = resolveFixtureOrSample('synthetic-station-workbook.xlsx', 'DKV _AS24 List (4).xlsx');
    expect(fs.existsSync(filePath)).toBe(true);

    const workbook = XLSX.readFile(filePath);
    const sheetData = new Map<string, unknown[][]>();

    for (const name of workbook.SheetNames) {
      const ws = workbook.Sheets[name];
      if (ws) {
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
        sheetData.set(name, rows);
      }
    }

    const result = parseStationWorkbook(workbook.SheetNames, sheetData, 'test-station-file-id');

    expect(result).toBeDefined();
    expect(result.stations.length).toBeGreaterThan(0);
    expect(result.sheetsProcessed.length).toBeGreaterThan(0);

    // DKV Yard Stations check
    const dkvStations = result.stations.filter((s) => s.sourceSheet === 'YARD_DKV');
    expect(dkvStations.length).toBeGreaterThan(0);
    const dkvS = dkvStations[0];
    expect(dkvS).toBeDefined();
    if (dkvS) {
      expect(dkvS.latitude).not.toBeNull();
      expect(dkvS.longitude).not.toBeNull();
      expect(dkvS.country).toBeDefined(); // should inherit from preceding rows
    }

    // AS24 Diesel Stations check
    const as24Stations = result.stations.filter((s) => s.sourceSheet === 'DIESEL_AS24');
    expect(as24Stations.length).toBeGreaterThan(0);
    const as24S = as24Stations[0];
    expect(as24S).toBeDefined();
    if (as24S) {
      expect(as24S.stationCode).toBeDefined();
      expect(as24S.netCostEurPerLitre).toBeDefined();
    }
  });
});
