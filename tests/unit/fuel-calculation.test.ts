import { describe, it, expect } from 'vitest';
import { assessTransaction } from '@/domain/telematics/telematics-scorer';
import { ProductType, TelematicsClassification, ConfidenceDimension, TimestampPrecision, CardProvider } from '@/domain/types';

describe('Fuel Telematics Scorer — Regression & Edge Cases', () => {
  const defaultTx = {
    id: 'tx-test',
    importFileId: 'f1',
    importRowIndex: 1,
    registration: '252MH1715',
    cardNumber: '7043100111747092',
    cardNumberNormalised: '7043100111747092',
    transactionDate: '2026-06-09',
    transactionTimestamp: '2026-06-09T03:15:00Z',
    timestampPrecision: TimestampPrecision.EXACT,
    stationNumber: 'SS12345',
    stationNumberNormalised: '12345',
    stationName: 'PMO Veurne',
    stationCity: 'Veurne',
    serviceCountry: 'BE',
    productCode: 'WA0009',
    productGroup: 'Diesel fuel',
    productName: 'Diesel',
    productType: ProductType.DIESEL,
    costGroup: 'Fuel costs',
    quantity: '706.04',
    unit: 'L',
    amountGross: '1200.00',
    mileage: '100000',
    authorisationId: 'auth-123',
    responseCode: 'APP',
    isApproved: true,
    customerId: 'cust-123',
    costCentre: 'cc-123',
    cardAddition: '',
    stationCategory: '',
    provider: CardProvider.DKV,
  };

  it('1. Telemetry reordering, baseline median 30%, post-fill 100%, sensor ceiling, 58.8% vs 70%', () => {
    // Telemetry points provided newest-first (descending)
    const descendingPoints = [
      {
        id: 'p5',
        importFileId: 'f2',
        importRowIndex: 5,
        vehicleRegistration: '252MH1715',
        trailer: '',
        driver: '',
        timestamp: '2026-06-09T03:25:00Z',
        timestampPrecision: TimestampPrecision.EXACT,
        fuelLevelPercent: 100,
        odometerKm: 100000,
        speedKmh: 50,
        dataSource: 'GPS',
        activity: 'Driving',
        info: '',
        locationCity: 'Veurne',
        locationTown: '',
        locationStreet: '',
        locationVillage: '',
        locationAddress: '',
        latitude: null,
        longitude: null,
      },
      {
        id: 'p4',
        importFileId: 'f2',
        importRowIndex: 4,
        vehicleRegistration: '252MH1715',
        trailer: '',
        driver: '',
        timestamp: '2026-06-09T03:20:00Z',
        timestampPrecision: TimestampPrecision.EXACT,
        fuelLevelPercent: 100,
        odometerKm: 100000,
        speedKmh: 0,
        dataSource: 'GPS',
        activity: 'Standstill',
        info: 'Engine ON',
        locationCity: 'Veurne',
        locationTown: '',
        locationStreet: '',
        locationVillage: '',
        locationAddress: '',
        latitude: null,
        longitude: null,
      },
      {
        id: 'p3',
        importFileId: 'f2',
        importRowIndex: 3,
        vehicleRegistration: '252MH1715',
        trailer: '',
        driver: '',
        timestamp: '2026-06-09T03:17:05Z',
        timestampPrecision: TimestampPrecision.EXACT,
        fuelLevelPercent: 100,
        odometerKm: 100000,
        speedKmh: 0,
        dataSource: 'GPS',
        activity: 'Standstill',
        info: 'Engine ON',
        locationCity: 'Veurne',
        locationTown: '',
        locationStreet: '',
        locationVillage: '',
        locationAddress: '',
        latitude: null,
        longitude: null,
      },
      {
        id: 'p2',
        importFileId: 'f2',
        importRowIndex: 2,
        vehicleRegistration: '252MH1715',
        trailer: '',
        driver: '',
        timestamp: '2026-06-09T03:14:39Z',
        timestampPrecision: TimestampPrecision.EXACT,
        fuelLevelPercent: 30,
        odometerKm: 100000,
        speedKmh: 0,
        dataSource: 'GPS',
        activity: 'Standstill',
        info: 'Engine OFF',
        locationCity: 'Veurne',
        locationTown: '',
        locationStreet: '',
        locationVillage: '',
        locationAddress: '',
        latitude: null,
        longitude: null,
      },
      {
        id: 'p1',
        importFileId: 'f2',
        importRowIndex: 1,
        vehicleRegistration: '252MH1715',
        trailer: '',
        driver: '',
        timestamp: '2026-06-09T03:10:00Z',
        timestampPrecision: TimestampPrecision.EXACT,
        fuelLevelPercent: 28,
        odometerKm: 100000,
        speedKmh: 0,
        dataSource: 'GPS',
        activity: 'Standstill',
        info: 'Engine OFF',
        locationCity: 'Veurne',
        locationTown: '',
        locationStreet: '',
        locationVillage: '',
        locationAddress: '',
        latitude: null,
        longitude: null,
      },
    ];

    const result = assessTransaction(defaultTx, descendingPoints, null);

    const fuelFactor = result.factors.find(f => f.dimension === ConfidenceDimension.FUEL_LEVEL_MOVEMENT)!;
    expect(fuelFactor).toBeDefined();
    expect(fuelFactor.result).toBe('PASS');
    expect(fuelFactor.awardedPoints).toBe(25);
    
    // Details assertions
    const details = fuelFactor.details;
    expect(details).toBeDefined();
    expect(details.baselineFuelPercent).toBeCloseTo(29, 0); // median of [28, 30] is 29
    expect(details.postFillFuelPercent).toBe(100);
    expect(details.observedIncreasePercent).toBeCloseTo(71, 0); // 100 - 29 = 71
    expect(details.expectedIncreasePercent).toBeCloseTo(58.83, 1);
    expect(details.sensorCeilingStatus).toBe('Capped');

    // Score consistency
    const volumeFactor = result.factors.find(f => f.dimension === ConfidenceDimension.VOLUME_CONSISTENCY)!;
    expect(volumeFactor.result).toBe('PASS');
    expect(volumeFactor.awardedPoints).toBe(10); // volume gets full points due to ceiling
  });

  it('2. Ascending order and duplicate timestamps merge', () => {
    const ascendingPoints = [
      {
        id: 'p1',
        importFileId: 'f2',
        importRowIndex: 1,
        vehicleRegistration: '252MH1715',
        trailer: '',
        driver: '',
        timestamp: '2026-06-09T03:10:00Z',
        timestampPrecision: TimestampPrecision.EXACT,
        fuelLevelPercent: 28,
        odometerKm: 100000,
        speedKmh: 0,
        dataSource: 'GPS',
        activity: 'Standstill',
        info: '',
        locationCity: 'Veurne',
        locationTown: '',
        locationStreet: '',
        locationVillage: '',
        locationAddress: '',
        latitude: null,
        longitude: null,
      },
      // Duplicate timestamp with p1
      {
        id: 'p1-dup',
        importFileId: 'f2',
        importRowIndex: 1,
        vehicleRegistration: '252MH1715',
        trailer: '',
        driver: '',
        timestamp: '2026-06-09T03:10:00Z',
        timestampPrecision: TimestampPrecision.EXACT,
        fuelLevelPercent: null,
        odometerKm: null,
        speedKmh: 0,
        dataSource: 'GPS',
        activity: 'Standstill',
        info: 'Ignition OFF',
        locationCity: 'Veurne',
        locationTown: '',
        locationStreet: '',
        locationVillage: '',
        locationAddress: '',
        latitude: null,
        longitude: null,
      },
      {
        id: 'p2',
        importFileId: 'f2',
        importRowIndex: 2,
        vehicleRegistration: '252MH1715',
        trailer: '',
        driver: '',
        timestamp: '2026-06-09T03:20:00Z',
        timestampPrecision: TimestampPrecision.EXACT,
        fuelLevelPercent: 95,
        odometerKm: 100000,
        speedKmh: 0,
        dataSource: 'GPS',
        activity: 'Standstill',
        info: '',
        locationCity: 'Veurne',
        locationTown: '',
        locationStreet: '',
        locationVillage: '',
        locationAddress: '',
        latitude: null,
        longitude: null,
      }
    ];

    const result = assessTransaction(defaultTx, ascendingPoints, null);
    const fuelFactor = result.factors.find(f => f.dimension === ConfidenceDimension.FUEL_LEVEL_MOVEMENT)!;
    expect(fuelFactor.result).toBe('PASS');
    expect(fuelFactor.details.observedIncreasePercent).toBe(67); // 95 - 28 = 67
  });

  it('3. Multiple transactions stop aggregation', () => {
    const tx1 = { ...defaultTx, id: 'tx-1', quantity: '400.00' };
    const tx2 = { ...defaultTx, id: 'tx-2', quantity: '306.04' };

    const points = [
      {
        id: 'p1',
        importFileId: 'f2',
        importRowIndex: 1,
        vehicleRegistration: '252MH1715',
        trailer: '',
        driver: '',
        timestamp: '2026-06-09T03:10:00Z',
        timestampPrecision: TimestampPrecision.EXACT,
        fuelLevelPercent: 30,
        odometerKm: 100000,
        speedKmh: 0,
        dataSource: 'GPS',
        activity: 'Standstill',
        info: '',
        locationCity: 'Veurne',
        locationTown: '',
        locationStreet: '',
        locationVillage: '',
        locationAddress: '',
        latitude: null,
        longitude: null,
      },
      {
        id: 'p2',
        importFileId: 'f2',
        importRowIndex: 2,
        vehicleRegistration: '252MH1715',
        trailer: '',
        driver: '',
        timestamp: '2026-06-09T03:20:00Z',
        timestampPrecision: TimestampPrecision.EXACT,
        fuelLevelPercent: 90,
        odometerKm: 100000,
        speedKmh: 0,
        dataSource: 'GPS',
        activity: 'Standstill',
        info: '',
        locationCity: 'Veurne',
        locationTown: '',
        locationStreet: '',
        locationVillage: '',
        locationAddress: '',
        latitude: null,
        longitude: null,
      }
    ];

    // Aggregating tx1 and tx2. Total quantity = 706.04L
    const result = assessTransaction(tx1, points, null, undefined, [tx1, tx2]);
    const fuelFactor = result.factors.find(f => f.dimension === ConfidenceDimension.FUEL_LEVEL_MOVEMENT)!;
    expect(fuelFactor.details.transactionLitres).toBe(706.04);
    expect(fuelFactor.details.expectedIncreasePercent).toBeCloseTo(58.83, 1);
  });

  it('4. Exclude AdBlue from diesel tank calculations', () => {
    const adblueTx = {
      ...defaultTx,
      id: 'tx-adblue',
      productType: ProductType.ADBLUE,
      productName: 'AdBlue',
      quantity: '40.00',
    };

    const points = [
      {
        id: 'p1',
        importFileId: 'f2',
        importRowIndex: 1,
        vehicleRegistration: '252MH1715',
        trailer: '',
        driver: '',
        timestamp: '2026-06-09T03:10:00Z',
        timestampPrecision: TimestampPrecision.EXACT,
        fuelLevelPercent: 30,
        odometerKm: 100000,
        speedKmh: 0,
        dataSource: 'GPS',
        activity: 'Standstill',
        info: '',
        locationCity: 'Veurne',
        locationTown: '',
        locationStreet: '',
        locationVillage: '',
        locationAddress: '',
        latitude: null,
        longitude: null,
      },
      {
        id: 'p2',
        importFileId: 'f2',
        importRowIndex: 2,
        vehicleRegistration: '252MH1715',
        trailer: '',
        driver: '',
        timestamp: '2026-06-09T03:20:00Z',
        timestampPrecision: TimestampPrecision.EXACT,
        fuelLevelPercent: 90,
        odometerKm: 100000,
        speedKmh: 0,
        dataSource: 'GPS',
        activity: 'Standstill',
        info: '',
        locationCity: 'Veurne',
        locationTown: '',
        locationStreet: '',
        locationVillage: '',
        locationAddress: '',
        latitude: null,
        longitude: null,
      }
    ];

    const result = assessTransaction(adblueTx, points, null);
    const fuelFactor = result.factors.find(f => f.dimension === ConfidenceDimension.FUEL_LEVEL_MOVEMENT)!;
    expect(fuelFactor.result).toBe('SKIP');
  });
});
