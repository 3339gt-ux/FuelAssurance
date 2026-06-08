/**
 * Normalisation Layer
 *
 * Transforms raw parser output into canonical domain types.
 * Delegates station code and card normalisation to utils.
 */

import {
  type RawDKVTransaction,
  type RawDKVInvoiceRow,
  type RawGPSPoint,
  type RawStation,
  type CanonicalTransaction,
  type CanonicalInvoiceRow,
  type CanonicalTelematicsPoint,
  type CanonicalStation,
  ProductType,
  CardProvider,
  TimestampPrecision,
} from '@/domain/types';
import {
  normaliseStationCode,
  normaliseCardNumber,
  excelDateToJSDate,
  generateId,
} from '@/lib/utils';

function safeTimestamp(raw: unknown): { ts: string; date: string; precision: TimestampPrecision } {
  if (typeof raw === 'number' && raw > 0) {
    try {
      const d = excelDateToJSDate(raw);
      const ts = d.toISOString();
      const fractional = raw - Math.floor(raw);
      return {
        ts,
        date: ts.split('T')[0] ?? '',
        precision: fractional > 0.0001 ? TimestampPrecision.EXACT : TimestampPrecision.DATE_ONLY,
      };
    } catch {
      return { ts: '', date: '', precision: TimestampPrecision.UNKNOWN };
    }
  }
  if (typeof raw === 'string' && raw) {
    return { ts: raw, date: raw.split('T')[0] ?? '', precision: TimestampPrecision.ESTIMATED };
  }
  return { ts: '', date: '', precision: TimestampPrecision.UNKNOWN };
}

function detectProduct(code: string, name: string, group: string): ProductType {
  const c = (code || '').toUpperCase();
  const n = (name || '').toUpperCase();
  if (c === 'WA0009' || (n.includes('DIESEL') && !n.includes('ADBLUE') && !n.includes('RED'))) return ProductType.DIESEL;
  if (c === 'WA0016' || n.includes('ADBLUE')) return ProductType.ADBLUE;
  if (n.includes('GNR') || n.includes('RED DIESEL')) return ProductType.GNR;
  if (n.includes('PARKING')) return ProductType.PARKING;
  if (n.includes('TOLL') || n.includes('PASSANGO')) return ProductType.TOLL;
  if (n.includes('WASH')) return ProductType.WASH;
  return ProductType.UNKNOWN;
}

export function normaliseTransaction(raw: RawDKVTransaction, fileId: string): CanonicalTransaction {
  const { ts, date, precision } = safeTimestamp(raw.authorisationTime);
  const resp = (raw.response || '').toUpperCase();

  return {
    id: generateId(),
    importFileId: fileId,
    importRowIndex: raw.rowIndex,
    registration: raw.licencePlate,
    cardNumber: raw.cardOrBoxNumber,
    cardNumberNormalised: normaliseCardNumber(raw.cardOrBoxNumber),
    transactionDate: date,
    transactionTimestamp: ts,
    timestampPrecision: precision,
    stationNumber: raw.stationNumber || '',
    stationNumberNormalised: normaliseStationCode(raw.stationNumber || ''),
    stationName: raw.stationName || '',
    stationCity: raw.town || '',
    serviceCountry: raw.serviceCountry,
    productCode: raw.productCode,
    productGroup: raw.productGroup,
    productName: raw.product,
    productType: detectProduct(raw.productCode, raw.product, raw.productGroup),
    costGroup: raw.costGroup,
    quantity: raw.sales,
    unit: raw.unit || 'L',
    amountGross: raw.authorisationAmountGross,
    mileage: raw.mileage,
    authorisationId: raw.authorisationId || '',
    responseCode: raw.response,
    isApproved: resp === 'APP' || resp === 'APPROVED' || resp === '',
    customerId: raw.customerId || '',
    costCentre: raw.costCentre || '',
    cardAddition: raw.cardAddition || '',
    stationCategory: raw.stationCategory || '',
    provider: CardProvider.DKV,
  };
}

export function normaliseInvoiceRow(raw: RawDKVInvoiceRow, fileId: string): CanonicalInvoiceRow {
  const { ts, date, precision } = safeTimestamp(raw.transactionTime);
  return {
    id: generateId(),
    importFileId: fileId,
    importRowIndex: raw.rowIndex,
    registration: raw.licencePlate,
    cardNumber: raw.cardBoxNo,
    cardNumberNormalised: raw.equipmentNumber || normaliseCardNumber(raw.cardBoxNo),
    equipmentNumber: raw.equipmentNumber,
    invoiceNumber: raw.invoiceNumber,
    invoiceDate: raw.invoiceDate,
    documentNumber: raw.documentNumber,
    ticketNumber: raw.ticketNumberDKV,
    transactionDate: date,
    transactionTimestamp: ts,
    timestampPrecision: precision,
    transactionNumber: raw.transactionNumber,
    stationNumber: raw.stationNumber,
    stationNumberNormalised: normaliseStationCode(raw.stationNumber),
    stationName: raw.stationName,
    stationCity: raw.stationCity,
    stationZipCode: raw.stationZipCode,
    serviceCountry: raw.serviceCountry,
    invoiceCountry: raw.invoiceCountry,
    productCode: raw.productCode,
    productGroup: raw.productGroup,
    productName: raw.product,
    productType: detectProduct(raw.productCode, raw.product, raw.productGroup),
    costGroup: raw.costGroup,
    quantity: raw.quantity,
    unit: raw.unit,
    pricePerUnit: raw.pricePerUnit,
    pricePerUnitGross: raw.pricePerUnitGross,
    baseValueNet: raw.baseValueNet,
    baseValueGross: raw.baseValueGross,
    serviceFeeNet: raw.serviceFeeNet,
    valueOfPurchaseNet: raw.valueOfPurchaseNet,
    discountNet: raw.discountNet,
    discountGross: raw.discountGross,
    vat: raw.vat,
    paymentCurrency: raw.paymentCurrency,
    serviceCurrency: raw.serviceCurrency,
    valueInPayCurrency: raw.valueInPayCurrency,
    valueInServiceCountryCurrency: raw.valueInServiceCountryCurrency,
    costCentre1: raw.costCentre1,
    costCentre2: raw.costCentre2,
    mileage: raw.mileage,
    agesTerminal: raw.agesTerminal,
    customerId: raw.customerId,
    cardNumberPartner: raw.cardBoxNoPartner,
    provider: CardProvider.DKV,
  };
}

export function normaliseTelematicsPoint(raw: RawGPSPoint, fileId: string): CanonicalTelematicsPoint {
  const { ts, precision } = safeTimestamp(raw.createdDate);
  return {
    id: generateId(),
    importFileId: fileId,
    importRowIndex: raw.rowIndex,
    vehicleRegistration: raw.vehicle,
    trailer: raw.trailer,
    driver: raw.driver,
    timestamp: ts,
    timestampPrecision: precision,
    fuelLevelPercent: raw.fuelLevel ? parseFloat(raw.fuelLevel) || null : null,
    odometerKm: raw.km ? parseFloat(raw.km) || null : null,
    speedKmh: raw.speed ? parseFloat(raw.speed) || null : null,
    dataSource: raw.dataSource,
    activity: raw.activity,
    info: raw.info,
    locationCity: raw.positionFromCity,
    locationTown: raw.positionFromTown,
    locationStreet: raw.positionFromStreet,
    locationVillage: raw.positionFromVillage,
    locationAddress: raw.positionFromAddress,
    latitude: null,
    longitude: null,
  };
}

export function normaliseStation(raw: RawStation, fileId: string): CanonicalStation {
  return {
    id: generateId(),
    importFileId: fileId,
    stationCode: raw.stationCode,
    stationCodeNormalised: normaliseStationCode(raw.stationCode),
    stationName: raw.stationName || raw.pump,
    country: raw.country,
    city: raw.city,
    address: raw.address,
    postCode: raw.postCode,
    latitude: raw.latitude ? parseFloat(raw.latitude.replace(',', '.')) || null : null,
    longitude: raw.longitude ? parseFloat(raw.longitude.replace(',', '.')) || null : null,
    url: raw.url,
    product: raw.product,
    productType: raw.product?.toUpperCase().includes('GNR') ? ProductType.GNR : ProductType.DIESEL,
    costPerLitre: raw.cost,
    serviceFeePercent: raw.serviceFeePercent,
    discount: raw.discount,
    exciseDutyRebate: raw.exciseDutyRebate,
    netCostEurPerLitre: raw.netCostEurPerLitre,
    applicationDate: raw.applicationDate,
    sourceSheet: raw.sourceSheet,
    provider: raw.sourceSheet === 'YARD_DKV' ? CardProvider.DKV : CardProvider.AS24,
  };
}
