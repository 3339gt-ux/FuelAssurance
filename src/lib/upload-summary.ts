import { getFleetVehicle, normalizeRegistration, isFleetVehicle } from '@/config/fleet-registry';
import { scanDocumentForRegistrations } from './document-scanner';
import { buildSimpleModeWarningSummary } from './warning-grouper';

export interface VehicleSummary {
  registration: string;
  make: string;
  model: string;
  chargeCount: number;
  dateRange: string;
  fuelLitresByProduct: { [product: string]: number };
  monetaryTotalsByCurrency: { [currency: string]: number };
  countries: string[];
  stations: string[];
  chargeCategories: string[];
}

export interface CategorySummary {
  category: string;
  chargeCount: number;
  totalQuantity: number;
  totalAmountByCurrency: { [currency: string]: number };
  relevantVehicles: string[];
}

export interface NonFleetVehicleSummary {
  rawRegistration: string;
  normalizedRegistration: string;
  source: string;
}

export interface UploadSummary {
  fileOverview: {
    provider: string;
    fileName: string;
    documentType: string;
    pageOrSheetCount: number;
    transactionDateRange: string;
    totalTransactionRows: number;
    parsingWarnings: string[];
    warningHeadline?: string;
    informationalWarningCount?: number;
    warningSummary?: {
      blocking: Array<{ code: string; level: string; message: string; count: number }>;
      review: Array<{ code: string; level: string; message: string; count: number }>;
      informational: Array<{ code: string; level: string; message: string; count: number }>;
      totalRaw: number;
      totalGrouped: number;
    };
  };
  fleetVehiclesFound: VehicleSummary[];
  chargeBreakdown: CategorySummary[];
  nonFleetVehicles: NonFleetVehicleSummary[];
  unassignedCharges: any[];
}

export function classifyCategory(row: any): string {
  const prodCode = (row.productCode || '').toUpperCase();
  const name = (row.productName || '').toUpperCase();
  const group = (row.productGroup || '').toUpperCase();
  const amt = parseFloat(row.amountGross || row.baseValueGross || '0');

  if (amt < 0) {
    if (name.includes('REFUND')) return 'Refund';
    return 'Credit';
  }

  if (prodCode === 'PASSANGO') return 'PASSango';
  if (prodCode === 'WA0009' || (name.includes('DIESEL') && !name.includes('ADBLUE') && !name.includes('RED') && !name.includes('GNR'))) return 'Diesel';
  if (prodCode === 'WA0016' || name.includes('ADBLUE') || name.includes('AD BLUE')) return 'AdBlue';
  if (name.includes('GNR') || name.includes('RED DIESEL') || name.includes('RED')) return 'GNR/red diesel';
  if (name.includes('PARKING') || group.includes('PARKING')) return 'Parking';
  if (name.includes('TOLL') || group.includes('TOLL') || name.includes('PASSANGO')) return 'Toll';
  if (name.includes('TUNNEL') || group.includes('TUNNEL')) return 'Tunnel';
  if (name.includes('WASH') || name.includes('CLEAN') || group.includes('CLEANING')) return 'Cleaning';
  if (group.includes('SERVICE FEE') || group.includes('SERVICE') || name.includes('SERVICE FEE')) return 'Service fee';
  
  return 'Other';
}

export async function generateUploadSummary(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
  provider: string,
  documentType: string,
  pageOrSheetCount: number,
  parsingWarnings: string[],
  canonicalRows: any[]
): Promise<UploadSummary> {
  // 1. Section-aware registration scan — reuse parsed rows, never greedy-regex rescan for AS24
  const scanResult = await scanDocumentForRegistrations(buffer, mimeType, fileName, {
    provider,
    canonicalRows,
    skipFullScan: provider === 'AS24' || canonicalRows.length > 0,
  });

  const warningSummary = buildSimpleModeWarningSummary(parsingWarnings);

  // 2. Non-fleet only when confidently extracted from recognised source fields
  const nonFleetVehicles: NonFleetVehicleSummary[] = scanResult.nonFleetVehicles
    .filter((v) => v.confident !== false)
    .map((v) => ({
      rawRegistration: v.raw,
      normalizedRegistration: v.normalized,
      source: v.source,
    }));

  // 3. Process canonical rows to build vehicle summaries and charge breakdowns
  const vehicleMap = new Map<string, any>();
  const categoryMap = new Map<string, CategorySummary>();
  const unassignedCharges: any[] = [];
  const allDates: string[] = [];

  canonicalRows.forEach((row) => {
    const rawReg = row.registration || '';
    const normReg = normalizeRegistration(rawReg);
    const date = row.transactionDate || '';
    if (date) allDates.push(date);

    const amount = parseFloat(row.paymentAmountExVat || row.baseValueNet || row.amountGross || row.baseValueGross || '0');
    const currency = row.paymentCurrency || 'EUR';
    const quantity = parseFloat(row.quantity || '0');
    const country = row.serviceCountry || 'IE';
    const station = row.stationName || 'Unknown Station';
    const category = classifyCategory(row);

    // If not in fleet registry, classify as unassigned or non-fleet charge
    if (!normReg || !isFleetVehicle(normReg)) {
      unassignedCharges.push({
        id: row.id,
        registration: rawReg,
        date: row.transactionDate,
        productName: row.productName || 'Unknown Product',
        quantity: row.quantity,
        amountGross: row.amountGross || row.baseValueGross || '0',
        paymentCurrency: currency,
        stationName: station,
        category,
      });
      return;
    }

    // Process Fleet Vehicle
    const vehicle = getFleetVehicle(normReg)!;
    if (!vehicleMap.has(normReg)) {
      vehicleMap.set(normReg, {
        registration: vehicle.registration,
        make: vehicle.make,
        model: vehicle.model,
        chargeCount: 0,
        dates: [] as string[],
        fuelLitresByProduct: {} as { [product: string]: number },
        monetaryTotalsByCurrency: {} as { [currency: string]: number },
        countries: new Set<string>(),
        stations: new Set<string>(),
        chargeCategories: new Set<string>(),
      });
    }

    const vSum = vehicleMap.get(normReg)!;
    vSum.chargeCount++;
    if (date) vSum.dates.push(date);
    vSum.countries.add(country);
    vSum.stations.add(station);
    vSum.chargeCategories.add(category);

    // Fuel litres grouping — skip toll/parking rows
    if (category === 'Diesel' || category === 'AdBlue' || category === 'GNR/red diesel') {
      const prodName = row.productName || category;
      const vol = parseFloat(row.volume || row.quantity || '0');
      if (!isNaN(vol) && vol > 0) {
        vSum.fuelLitresByProduct[prodName] = (vSum.fuelLitresByProduct[prodName] || 0) + vol;
      }
    }

    // Currency grouping
    vSum.monetaryTotalsByCurrency[currency] = (vSum.monetaryTotalsByCurrency[currency] || 0) + amount;

    // Process Category Breakdown
    if (!categoryMap.has(category)) {
      categoryMap.set(category, {
        category,
        chargeCount: 0,
        totalQuantity: 0,
        totalAmountByCurrency: {},
        relevantVehicles: [],
      });
    }

    const catSum = categoryMap.get(category)!;
    catSum.chargeCount++;
    catSum.totalQuantity += quantity;
    catSum.totalAmountByCurrency[currency] = (catSum.totalAmountByCurrency[currency] || 0) + amount;
    if (!catSum.relevantVehicles.includes(vehicle.registration)) {
      catSum.relevantVehicles.push(vehicle.registration);
    }
  });

  // Convert vehicleMap to array and format
  const fleetVehiclesFound: VehicleSummary[] = Array.from(vehicleMap.entries()).map(([reg, v]) => {
    v.dates.sort();
    const dateRange = v.dates.length > 0
      ? `${v.dates[0]} to ${v.dates[v.dates.length - 1]}`
      : 'No dates';
    return {
      registration: v.registration,
      make: v.make,
      model: v.model,
      chargeCount: v.chargeCount,
      dateRange,
      fuelLitresByProduct: v.fuelLitresByProduct,
      monetaryTotalsByCurrency: v.monetaryTotalsByCurrency,
      countries: Array.from(v.countries),
      stations: Array.from(v.stations),
      chargeCategories: Array.from(v.chargeCategories),
    };
  });

  const chargeBreakdown = Array.from(categoryMap.values());

  // Date range for file overview
  allDates.sort();
  const fileDateRange = allDates.length > 0
    ? `${allDates[0]} to ${allDates[allDates.length - 1]}`
    : 'Unknown';

  const displayWarnings = warningSummary.hasActionable
    ? [
        ...(warningSummary.headline ? [warningSummary.headline] : []),
        ...warningSummary.grouped.blocking.map((g) => `${g.code}: ${g.message}${g.count > 1 ? ` (${g.count}×)` : ''}`),
        ...warningSummary.grouped.review.map((g) => `${g.code}: ${g.message}${g.count > 1 ? ` (${g.count}×)` : ''}`),
      ]
    : [];

  return {
    fileOverview: {
      provider,
      fileName,
      documentType,
      pageOrSheetCount,
      transactionDateRange: fileDateRange,
      totalTransactionRows: canonicalRows.length,
      parsingWarnings: displayWarnings,
      warningSummary: warningSummary.grouped,
      warningHeadline: warningSummary.headline,
      informationalWarningCount: warningSummary.grouped.informational.reduce((s, g) => s + g.count, 0),
    },
    fleetVehiclesFound,
    chargeBreakdown,
    nonFleetVehicles,
    unassignedCharges,
  };
}

export function generateGpsSummary(result: any): any {
  const rawRegistration = result.vehicles[0] || '';
  const normalized = normalizeRegistration(rawRegistration);
  const vehicle = getFleetVehicle(normalized);

  const fuelLevels = result.points.map((p: any) => p.fuelLevelPercent).filter((f: any) => f !== null && !isNaN(f));
  const odometers = result.points.map((p: any) => p.odometerKm).filter((o: any) => o !== null && !isNaN(o));

  const hasLocation = result.points.some((p: any) => p.locationAddress || p.locationCity || p.locationTown);
  const hasEngine = result.points.some((p: any) => 
    p.activity?.toUpperCase().includes('IGNITION') || 
    p.activity?.toUpperCase().includes('ENGINE') || 
    p.info?.toUpperCase().includes('IGNITION')
  );

  const minFuel = fuelLevels.length > 0 ? Math.min(...fuelLevels) : null;
  const maxFuel = fuelLevels.length > 0 ? Math.max(...fuelLevels) : null;

  const minOdo = odometers.length > 0 ? Math.min(...odometers) : null;
  const maxOdo = odometers.length > 0 ? Math.max(...odometers) : null;

  const inRegistry = isFleetVehicle(normalized);

  return {
    rawRegistration,
    detectedCanonicalRegistration: inRegistry ? vehicle?.registration || normalized : normalized,
    make: vehicle?.make || 'Unknown Make',
    model: vehicle?.model || 'Unknown Model',
    dateRange: `${result.dateRange.earliest} to ${result.dateRange.latest}`,
    gpsRecordCount: result.points.length,
    fuelLevelMin: minFuel !== null ? parseFloat(minFuel.toFixed(2)) : null,
    fuelLevelMax: maxFuel !== null ? parseFloat(maxFuel.toFixed(2)) : null,
    odometerMin: minOdo !== null ? parseFloat(minOdo.toFixed(2)) : null,
    odometerMax: maxOdo !== null ? parseFloat(maxOdo.toFixed(2)) : null,
    locationEvidenceAvailable: hasLocation,
    engineEvidenceAvailable: hasEngine,
    inRegistry,
    warnings: result.warnings || [],
  };
}
