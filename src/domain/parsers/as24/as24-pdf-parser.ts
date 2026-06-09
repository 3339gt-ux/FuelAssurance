/**
 * AS24 PDF Invoice Parser
 *
 * Extracts and parses transaction details from AS24 PDF invoice statements.
 * Features:
 *   1. Coordinate-aware PDF table parsing using text token positions (prevents token concatenation).
 *   2. Plausibility validation for fuel volume (1,250 litres ceiling with auto-remapping).
 *   3. Field-level financial validation (ex-VAT net payment amount ratio check).
 *   4. Stateful page continuation (carries current card, vehicle, and odometer across page breaks).
 *   5. Clearly versioned fallback parser when coordinates are unavailable.
 */

import {
  type PdfSection,
  type AS24InvoiceStatement,
  type ControlTotal,
  type CanonicalInvoiceRow,
  ProductType,
  CardProvider,
  TimestampPrecision,
  type FinancialFieldMetadata,
} from '@/domain/types';
import { generateId, normaliseCardNumber, normaliseStationCode } from '@/lib/utils';

export interface PdfItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MAX_FLEET_FUEL_CAPACITY_LITRES = 1250;
export const PARSER_VERSION_COORDINATE = '2.0.0-coordinate';
export const PARSER_VERSION_FALLBACK = '1.0.0-fallback';

// Helper: parse DD/MM/YYYY date string to YYYY-MM-DD
function parseDateStr(str: string): string {
  const m = str.trim().match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

// Helper: parse HH:MM time string
function parseTimeStr(str: string): string {
  const m = str.trim().match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : '';
}

/**
 * Split a concatenated registration + odometer string using domain-specific rules.
 */
export function splitRegAndOdo(raw: string): { registration: string; odometer: string } {
  const cleaned = raw.trim();

  // Try 241 pattern: 241 MH \d{3} followed by odometer (all 241s in sample are 3-digit sequence)
  const m241 = cleaned.match(/^(241\s*MH\s*(\d{3}))(\d*)$/i);
  if (m241) {
    const reg = m241[1];
    const odo = m241[3];
    return {
      registration: reg ? reg.replace(/\s+/g, '') : '',
      odometer: odo || '0',
    };
  }

  // Try 252 pattern:
  // - 4 digits if starts with 1: 252 MH 1\d{3}
  // - 3 digits if starts with 7 or 8: 252 MH [78]\d{2}
  const m252_1 = cleaned.match(/^(252\s*MH\s*(1\d{3}))(\d*)$/i);
  if (m252_1) {
    const reg = m252_1[1];
    const odo = m252_1[3];
    return {
      registration: reg ? reg.replace(/\s+/g, '') : '',
      odometer: odo || '0',
    };
  }

  const m252_78 = cleaned.match(/^(252\s*MH\s*([78]\d{2}))(\d*)$/i);
  if (m252_78) {
    const reg = m252_78[1];
    const odo = m252_78[3];
    return {
      registration: reg ? reg.replace(/\s+/g, '') : '',
      odometer: odo || '0',
    };
  }

  // Fallback
  const digitsOnly = cleaned.replace(/\D/g, '');
  if (digitsOnly.length > 8) {
    const odoLen = digitsOnly.length - 8;
    return {
      registration: cleaned.slice(0, -odoLen).replace(/\s+/g, ''),
      odometer: cleaned.slice(-odoLen),
    };
  }

  return {
    registration: cleaned.replace(/\s+/g, ''),
    odometer: '0',
  };
}

/**
 * Extract 7 numbers from the right side of a string representing card filling transaction details.
 * Decimal positions (right to left): 2, 2, 2, 2, 2, 3, remaining (2 or 3)
 */
function parseRightSide(str: string): {
  unitPrice: string;
  rebate: string;
  netPrice: string;
  exclVat: string;
  vat: string;
  amountExVat: string;
  amountInclVat: string;
} {
  const decPlaces = [2, 2, 2, 2, 2, 3];
  const parts: string[] = [];
  let currentStr = str.trim();

  for (const dec of decPlaces) {
    const lastDotIdx = currentStr.lastIndexOf('.');
    if (lastDotIdx === -1) {
      parts.push('0');
      continue;
    }

    const endIdx = lastDotIdx + 1 + dec;
    let startIdx = lastDotIdx;
    while (startIdx > 0) {
      const char = currentStr[startIdx - 1];
      if (char !== undefined && ((char >= '0' && char <= '9') || char === ' ' || char === '\xA0')) {
        startIdx--;
      } else {
        break;
      }
    }

    const numStr = currentStr.slice(startIdx, endIdx).replace(/[\s\xA0]+/g, '');
    parts.push(numStr);
    currentStr = currentStr.slice(0, startIdx).trim();
  }

  parts.push(currentStr.replace(/[\s\xA0]+/g, ''));

  return {
    unitPrice: parts[6] || '0',
    rebate: parts[5] || '0',
    netPrice: parts[4] || '0',
    exclVat: parts[3] || '0',
    vat: parts[2] || '0',
    amountExVat: parts[1] || '0',
    amountInclVat: parts[0] || '0',
  };
}

/**
 * Heuristic volume remapper to separate concatenated adjacent fields (e.g. mileage, consumption, volume).
 */
export function attemptVolumeRemap(
  rawVolumeStr: string,
  mileageStr?: string,
  consumptionStr?: string
): string | null {
  const cleaned = rawVolumeStr.replace(/[\s,]+/g, '');

  const val = parseFloat(cleaned);
  if (!isNaN(val) && val > 0 && val <= MAX_FLEET_FUEL_CAPACITY_LITRES) {
    return cleaned;
  }

  // If we have a pattern like 896004.28310.46 or 896004.28310
  if (mileageStr) {
    const mil = mileageStr.replace(/[\s,]+/g, '');
    if (cleaned.startsWith(mil)) {
      let rest = cleaned.slice(mil.length);
      if (consumptionStr) {
        const cons = consumptionStr.trim();
        if (rest.startsWith(cons)) {
          rest = rest.slice(cons.length);
        } else {
          const consNoDot = cons.replace(/\./g, '');
          if (rest.startsWith(consNoDot)) {
            rest = rest.slice(consNoDot.length);
          }
        }
      }
      const parsedRest = parseFloat(rest);
      if (!isNaN(parsedRest) && parsedRest > 0 && parsedRest <= MAX_FLEET_FUEL_CAPACITY_LITRES) {
        return rest;
      }
    }
  }

  // Handle multiple decimal dots
  const dotCount = (cleaned.match(/\./g) || []).length;
  if (dotCount >= 2) {
    const parts = cleaned.split('.');
    if (parts.length >= 3) {
      const volCandidate = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
      const parsedCand = parseFloat(volCandidate);
      if (!isNaN(parsedCand) && parsedCand > 0 && parsedCand <= MAX_FLEET_FUEL_CAPACITY_LITRES) {
        return volCandidate;
      }
    }
  }

  // Retrieve decimal number from end
  const decimalMatch = cleaned.match(/(\d+\.\d+)$/);
  if (decimalMatch) {
    const parsed = parseFloat(decimalMatch[1]!);
    if (parsed > 0 && parsed <= MAX_FLEET_FUEL_CAPACITY_LITRES) {
      return decimalMatch[1]!;
    }
  }

  return null;
}

/**
 * Validate fuel volume is within physically plausible limits.
 */
export function validateAndRemapVolume(
  rawVolume: string,
  mileageStr?: string,
  consumptionStr?: string
): {
  volume: string;
  status: string;
  warnings: string[];
} {
  const original = rawVolume.trim();
  const cleaned = original.replace(/[\s,]+/g, '');
  const parsed = parseFloat(cleaned);

  if (!isNaN(parsed) && parsed > 0 && parsed <= MAX_FLEET_FUEL_CAPACITY_LITRES) {
    return {
      volume: cleaned,
      status: 'OK',
      warnings: [],
    };
  }

  const remapped = attemptVolumeRemap(original, mileageStr, consumptionStr);
  if (remapped) {
    return {
      volume: remapped,
      status: 'Needs field review',
      warnings: [
        `PHYSICAL_LIMIT_EXCEEDED: Volume "${original}" exceeded the ceiling of ${MAX_FLEET_FUEL_CAPACITY_LITRES}L. ` +
        `Remapped to "${remapped}" from adjacent fields.`
      ],
    };
  }

  return {
    volume: cleaned,
    status: 'PARSER_MAPPING_ERROR',
    warnings: [
      `PHYSICAL_LIMIT_EXCEEDED: Volume "${original}" exceeds the physical fleet capacity ceiling of ${MAX_FLEET_FUEL_CAPACITY_LITRES} litres.`
    ],
  };
}

/**
 * Validate Net and Gross financials and make sure they are not concatenated.
 */
export function validateFinancials(
  exVat: string,
  inclVat: string,
  currency: string
): {
  status: string;
  warnings: string[];
} {
  const net = parseFloat(exVat.replace(/[\s,]+/g, ''));
  const gross = parseFloat(inclVat.replace(/[\s,]+/g, ''));

  if (isNaN(net) || !isFinite(net) || net <= 0) {
    return {
      status: 'PARSER_MAPPING_ERROR',
      warnings: [`FINANCIAL_VALIDATION_ERROR: Payment amount ex VAT "${exVat}" is invalid or non-positive.`],
    };
  }

  if (isNaN(gross) || !isFinite(gross) || gross <= 0) {
    return {
      status: 'PARSER_MAPPING_ERROR',
      warnings: [`FINANCIAL_VALIDATION_ERROR: Payment amount incl VAT "${inclVat}" is invalid or non-positive.`],
    };
  }

  // Plausible VAT rates are 0% to 30%. Net to Gross ratio should be between 1.0 and 1.35.
  const ratio = gross / net;
  if (ratio < 0.95 || ratio > 1.35) {
    return {
      status: 'PARSER_MAPPING_ERROR',
      warnings: [
        `FINANCIAL_VALIDATION_ERROR: Plausibility ratio check failed. ` +
        `Gross/Net ratio is ${ratio.toFixed(3)} (outside standard 1.0 to 1.35 range). ` +
        `exVAT: ${exVat}, inclVAT: ${inclVat}.`
      ],
    };
  }

  return {
    status: 'OK',
    warnings: [],
  };
}

/**
 * Detect sections in raw PDF text.
 */
export function detectSections(text: string): PdfSection[] {
  const normalized = text.replace(/\xA0/g, ' ');
  const sections: PdfSection[] = [];

  const cardsIdx = normalized.toUpperCase().indexOf('CARDS FILLING LIST');
  const passangoIdx = normalized.toUpperCase().indexOf('PASSANGO : TRANSACTION REPORT');

  const statementEnd = cardsIdx !== -1 ? cardsIdx : (passangoIdx !== -1 ? passangoIdx : normalized.length);
  sections.push({
    type: 'INVOICE_STATEMENT',
    startOffset: 0,
    endOffset: statementEnd,
    text: text.slice(0, statementEnd),
    pageNumber: 1,
  });

  if (cardsIdx !== -1) {
    const cardsEnd = passangoIdx !== -1 ? passangoIdx : normalized.length;
    sections.push({
      type: 'CARD_FILLING_LIST',
      startOffset: cardsIdx,
      endOffset: cardsEnd,
      text: text.slice(cardsIdx, cardsEnd),
      pageNumber: null,
    });
  }

  if (passangoIdx !== -1) {
    sections.push({
      type: 'PASSANGO',
      startOffset: passangoIdx,
      endOffset: normalized.length,
      text: text.slice(passangoIdx),
      pageNumber: null,
    });
  }

  return sections;
}

/**
 * Parse Invoice Statement section.
 */
export function parseInvoiceStatement(text: string): AS24InvoiceStatement {
  const normalized = text.replace(/\xA0/g, ' ');
  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);

  let invoiceNumber = '';
  let invoiceDate = '';
  let customerNumber = '';
  let vatNumber = '';
  let customerName = '';

  const controlTotals: ControlTotal[] = [];

  // Parse header details
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (line.startsWith('Num. :')) invoiceNumber = line.split(':')[1]?.trim() || '';
    if (line.startsWith('Date :')) invoiceDate = parseDateStr(line.split(':')[1]?.trim() || '');
    if (line.startsWith('Customer number :')) customerNumber = line.split(':')[1]?.trim() || '';
    if (line.startsWith('VAT Number :')) vatNumber = line.split(':')[1]?.trim() || '';
    if (line === 'CUSTOMER') {
      const nextLine = lines[i + 1];
      if (nextLine) customerName = nextLine;
    }
  }

  // Parse statement lines to construct country control totals
  const itemRegex = /^(.+?)([0-9]{4}[A-Z]{3}[0-9]+)(EUR|GBP|HUF|PLN)([\d\s\.,]+)$/;
  for (const line of lines) {
    const match = line.match(itemRegex);
    if (match) {
      const label = match[1]?.trim() || '';
      const numString = (match[4] || '').replace(/[\s\xA0]+/g, '');
      
      const decPlaces = [2, 2, 2, 2];
      const numbers: string[] = [];
      let temp = numString;
      
      for (const dec of decPlaces) {
        const lastDot = temp.lastIndexOf('.');
        if (lastDot === -1) {
          numbers.push('0');
          continue;
        }
        const end = lastDot + 1 + dec;
        let start = lastDot;
        while (start > 0) {
          const char = temp[start - 1];
          if (char !== undefined && ((char >= '0' && char <= '9') || char === '.')) {
            start--;
          } else {
            break;
          }
        }
        numbers.push(temp.slice(start, end));
        temp = temp.slice(0, start);
      }
      
      controlTotals.push({
        category: 'COUNTRY',
        label,
        quantity: '1',
        netAmount: numbers[3] || '0',
        grossAmount: numbers[1] || '0',
      });
    }
  }

  // Calculate final totals
  let totalNet = '0';
  let totalGross = '0';
  const totalLine = lines.find((l) => l.includes('Total incl.VAT Euro') || l.includes('Total to be paid'));
  if (totalLine) {
    const grossMatch = totalLine.match(/Euro\s*([\d\s\.,]+)/i);
    if (grossMatch) {
      totalGross = grossMatch[1]?.replace(/[\s\xA0]+/g, '') || '0';
    }
  }

  return {
    invoiceNumber,
    invoiceDate,
    contractNumber: customerNumber,
    customerName,
    totalNetAmount: totalNet,
    totalVatAmount: '0',
    totalGrossAmount: totalGross,
    currency: 'EUR',
    periodStart: '',
    periodEnd: '',
    controlTotals,
  };
}

function detectProductType(code: string, name: string): ProductType {
  const c = code.toUpperCase();
  const n = name.toUpperCase();
  if (c === '03' || n.includes('DIESEL')) return ProductType.DIESEL;
  if (c === '10' || n.includes('AD BLUE') || n.includes('ADBLUE')) return ProductType.ADBLUE;
  if (c === '01' || n.includes('GNR') || n.includes('RED DIESEL')) return ProductType.GNR;
  if (c === 'PK' || n.includes('PARKING')) return ProductType.PARKING;
  if (c === '32' || c === 'PO' || n.includes('TOLL') || n.includes('PASSANGO')) return ProductType.TOLL;
  return ProductType.UNKNOWN;
}

/**
 * Versioned fallback parser (used when coordinates are unavailable).
 */
export function parseCardFillingListFallback(text: string, fileId: string): CanonicalInvoiceRow[] {
  const normalized = text.replace(/\xA0/g, ' ');
  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);

  const rows: CanonicalInvoiceRow[] = [];
  
  let currentCard = '';
  let currentReg = '';
  let currentOdometer = '';
  
  let lastProductCode = '';
  let lastProductName = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    if (
      line.includes('Cards filling list') ||
      line.includes('Vehicle/Driver') ||
      line.includes('Card Registration') ||
      line.includes('Total card') ||
      line.includes('Total contract') ||
      line.includes('Customer number') ||
      line.includes('Page ') ||
      line.startsWith('###')
    ) {
      continue;
    }

    const cardHeaderMatch = line.match(/^\s*\*\s*([\d\-]+)\s+(IE-\s*)?([0-9]{3}\s*[A-Z]{1,2}\s*[0-9]+.*)$/i);
    if (cardHeaderMatch) {
      currentCard = (cardHeaderMatch[1] || '').trim();
      const rawRegOdo = (cardHeaderMatch[3] || '').trim();
      const parsedReg = splitRegAndOdo(rawRegOdo);
      currentReg = parsedReg.registration;
      currentOdometer = parsedReg.odometer;
      continue;
    }

    const lineRegex = /^\s*(?:\*\s*)?(?:([A-Z0-9]{2})\s+([A-Za-z\s\*]+?)\s*)?(?:(\d{2})?\s*([A-Z]{3})\s+(\w{4})\s+)/i;
    const match = line.match(lineRegex);
    if (!match) continue;

    const matchedProdCode = match[1] || '';
    const matchedProdName = match[2] || '';
    const pump = match[3] || '';
    const country = match[4] || '';
    const stationCode = match[5] || '';

    let productCode = '';
    let productName = '';

    if (matchedProdCode && matchedProdName) {
      productCode = matchedProdCode;
      productName = matchedProdName.trim();
    } else {
      productCode = lastProductCode;
      productName = lastProductName;
    }

    lastProductCode = productCode;
    lastProductName = productName;

    const remaining = line.slice(match[0].length);
    const dateIndex = remaining.search(/\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/);
    if (dateIndex === -1) continue;

    const stationName = remaining.slice(0, dateIndex).trim();
    const dateStr = remaining.slice(dateIndex, dateIndex + 16);
    const dateISO = parseDateStr(dateStr.slice(0, 10));
    const timestampISO = `${dateISO}T${parseTimeStr(dateStr.slice(11))}:00.000Z`;

    const rightSide = remaining.slice(dateIndex + 16).trim();
    const currencyMatch = rightSide.match(/(EUR|GBP|HUF|PLN)/i);
    if (!currencyMatch || currencyMatch.index === undefined) continue;

    const currency = currencyMatch[1];
    if (!currency) continue;
    const leftOfCurrency = rightSide.slice(0, currencyMatch.index).trim();
    const rightOfCurrency = rightSide.slice(currencyMatch.index + currency.length).trim();

    let quantity = '0';
    let mileage = currentOdometer;

    const leftDecimals = leftOfCurrency.match(/(\d+\.\d+)/g);
    if (leftDecimals && leftDecimals.length >= 1) {
      const qVal = leftDecimals[leftDecimals.length - 1];
      if (qVal) quantity = qVal;
      const firstDecimal = leftDecimals[0];
      if (firstDecimal) {
        const intPart = leftOfCurrency.slice(0, leftOfCurrency.indexOf(firstDecimal)).replace(/\D/g, '');
        if (intPart) {
          mileage = intPart;
        }
      }
    }

    const rightNums = parseRightSide(rightOfCurrency);
    const productType = detectProductType(productCode, productName);

    // Run physical & financial validations in fallback
    const volVal = validateAndRemapVolume(quantity, mileage, '0');
    const finVal = validateFinancials(rightNums.amountExVat, rightNums.amountInclVat, 'EUR');

    const warningList = [
      'COORDINATES_UNAVAILABLE: Page parsed using fallback string match parser. Field boundaries are uncertain.',
      ...volVal.warnings,
      ...finVal.warnings,
    ];

    const finalStatus = volVal.status === 'PARSER_MAPPING_ERROR' || finVal.status === 'PARSER_MAPPING_ERROR'
      ? 'PARSER_MAPPING_ERROR'
      : 'Needs field review';

    const confidence = volVal.status === 'PARSER_MAPPING_ERROR' || finVal.status === 'PARSER_MAPPING_ERROR'
      ? 10
      : 50;

    rows.push({
      id: generateId(),
      importFileId: fileId,
      importRowIndex: i,
      registration: currentReg,
      cardNumber: currentCard,
      cardNumberNormalised: normaliseCardNumber(currentCard),
      equipmentNumber: '',
      invoiceNumber: '',
      invoiceDate: '',
      documentNumber: '',
      ticketNumber: '',
      transactionDate: dateISO,
      transactionTimestamp: timestampISO,
      timestampPrecision: TimestampPrecision.EXACT,
      transactionNumber: '',
      stationNumber: stationCode,
      stationNumberNormalised: normaliseStationCode(stationCode),
      stationName,
      stationCity: '',
      stationZipCode: '',
      serviceCountry: country,
      invoiceCountry: '',
      productCode,
      productGroup: '',
      productName,
      productType,
      costGroup: '',
      quantity: volVal.volume,
      unit: productType === ProductType.TOLL ? 'ST' : 'L',
      pricePerUnit: rightNums.unitPrice,
      pricePerUnitGross: rightNums.unitPrice,
      baseValueNet: rightNums.amountExVat,
      baseValueGross: rightNums.amountInclVat,
      serviceFeeNet: '0',
      valueOfPurchaseNet: rightNums.amountExVat,
      discountNet: rightNums.rebate,
      discountGross: '0',
      vat: rightNums.vat,
      paymentCurrency: 'EUR', // Primary payment currency is always EUR settled
      serviceCurrency: currency, // Station currency
      valueInPayCurrency: rightNums.amountInclVat,
      valueInServiceCountryCurrency: rightNums.amountInclVat,
      costCentre1: '',
      costCentre2: '',
      mileage,
      agesTerminal: '',
      customerId: '',
      cardNumberPartner: '',
      provider: CardProvider.AS24,
      vehicleRegistration: currentReg,
      pumpCode: pump,
      countryCode: country,
      forecourtCode: stationCode,
      forecourtName: stationName,
      transactionDateTime: dateStr,
      mileageKm: mileage,
      litresPer100Km: leftDecimals && leftDecimals.length > 1 ? leftDecimals[0] : '0',
      volume: volVal.volume,
      volumeUnit: 'L',
      stationCurrency: currency,
      unitPriceVatIncluded: rightNums.unitPrice,
      rebate: rightNums.rebate,
      stationAmountExVat: rightNums.netPrice,
      stationVatAmount: rightNums.vat,
      paymentAmountExVat: rightNums.amountExVat,
      paymentAmountInclVat: rightNums.amountInclVat,
      sourcePage: 0,
      extractionConfidence: confidence,
      status: finalStatus,
      warnings: warningList,
      financialMetadata: {
        paymentAmountExVat: {
          sourceHeading: 'Amount ex. VAT (fallback)',
          currency: 'EUR',
          isNet: true,
          isPaymentCurrency: true,
          parserConfidence: confidence,
          isFallback: true,
        },
        volume: {
          sourceHeading: 'Volume (fallback)',
          currency: 'L',
          isNet: true,
          isPaymentCurrency: false,
          parserConfidence: confidence,
          isFallback: true,
        }
      }
    });
  }

  return rows;
}

/**
 * Fallback parser for PASSango electronic toll report.
 */
export function parsePASSangoSectionFallback(text: string, fileId: string): CanonicalInvoiceRow[] {
  const normalized = text.replace(/\xA0/g, ' ');
  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);

  const rows: CanonicalInvoiceRow[] = [];
  
  let currentReg = '';
  let currentObuId = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    if (
      line.includes('PASSango : Transaction') ||
      line.includes('Registration nbr') ||
      line.includes('Maximum Gross') ||
      line.includes('Total IE-') ||
      line.includes('Page ') ||
      line.startsWith('###')
    ) {
      continue;
    }

    const regMatch = line.match(/^\s*(IE-\s*(?:241MH\d{3}|252MH(?:1\d{3}|[78]\d{2})))/i);
    const startsWithDate = line.match(/^\s*(\d{2}\/\d{2}\/\d{4})/);

    if (regMatch) {
      const regVal = regMatch[1];
      if (regVal) {
        currentReg = regVal.replace(/\s+/g, '');
        const rest = line.slice(line.indexOf(regVal) + regVal.length).trim();
        const obuMatch = rest.match(/^(\d{10})/);
        currentObuId = obuMatch ? obuMatch[1] || '' : '';
      }
    }

    if (regMatch || startsWithDate) {
      const dateMatch = line.match(/(\d{2}\/\d{2}\/\d{4})/);
      if (!dateMatch || dateMatch.index === undefined) continue;

      const dateStr = dateMatch[1];
      if (!dateStr) continue;
      const dateISO = parseDateStr(dateStr);

      const rightPart = line.slice(dateMatch.index + 10).trim();
      const refMatch = rightPart.match(/^(\d{4}-[A-Z]{3}-\d+)/);
      if (!refMatch) continue;

      const reference = refMatch[1];
      if (!reference) continue;
      const detailPart = rightPart.slice(reference.length).trim();

      const numStartMatch = detailPart.match(/([\d\.\s,]+)$/);
      if (!numStartMatch) continue;

      const regionName = detailPart.slice(0, numStartMatch.index).trim();
      const numStringVal = numStartMatch[1];
      if (!numStringVal) continue;
      const numString = numStringVal.trim();

      const decPlaces = [2, 2];
      const parts: string[] = [];
      let temp = numString.replace(/[\s\xA0]+/g, '');

      for (const dec of decPlaces) {
        const lastDot = temp.lastIndexOf('.');
        if (lastDot === -1) {
          parts.push('0');
          continue;
        }
        const end = lastDot + 1 + dec;
        let start = lastDot;
        while (start > 0) {
          const char = temp[start - 1];
          if (char !== undefined && ((char >= '0' && char <= '9') || char === '.')) {
            start--;
          } else {
            break;
          }
        }
        parts.push(temp.slice(start, end));
        temp = temp.slice(0, start);
      }

      const distance = temp || '0';
      const netAmount = parts[1] || '0';
      const grossAmount = parts[0] || '0';

      const finVal = validateFinancials(netAmount, grossAmount, 'EUR');

      rows.push({
        id: generateId(),
        importFileId: fileId,
        importRowIndex: i,
        registration: currentReg.replace(/^IE-/, ''),
        cardNumber: currentObuId,
        cardNumberNormalised: normaliseCardNumber(currentObuId),
        equipmentNumber: '',
        invoiceNumber: '',
        invoiceDate: '',
        documentNumber: '',
        ticketNumber: reference,
        transactionDate: dateISO,
        transactionTimestamp: `${dateISO}T00:00:00.000Z`,
        timestampPrecision: TimestampPrecision.DATE_ONLY,
        transactionNumber: reference,
        stationNumber: '',
        stationNumberNormalised: '',
        stationName: regionName,
        stationCity: '',
        stationZipCode: '',
        serviceCountry: 'BEL',
        invoiceCountry: '',
        productCode: 'PASSango',
        productGroup: 'Toll',
        productName: 'PASSango Toll',
        productType: ProductType.TOLL,
        costGroup: '',
        quantity: distance,
        unit: 'KM',
        pricePerUnit: '0',
        pricePerUnitGross: '0',
        baseValueNet: netAmount,
        baseValueGross: grossAmount,
        serviceFeeNet: '0',
        valueOfPurchaseNet: netAmount,
        discountNet: '0',
        discountGross: '0',
        vat: '0',
        paymentCurrency: 'EUR',
        serviceCurrency: 'EUR',
        valueInPayCurrency: grossAmount,
        valueInServiceCountryCurrency: grossAmount,
        costCentre1: '',
        costCentre2: '',
        mileage: '0',
        agesTerminal: '',
        customerId: '',
        cardNumberPartner: '',
        provider: CardProvider.AS24,
        warnings: [
          'COORDINATES_UNAVAILABLE: PASSango page parsed using fallback string match parser.',
          ...finVal.warnings
        ],
        status: finVal.status,
      });
    }
  }

  return rows;
}

export interface AS24ParseResult {
  invoiceRows: CanonicalInvoiceRow[];
  statement?: AS24InvoiceStatement | undefined;
  sections: PdfSection[];
  totalRows: number;
}

/**
 * Coordinate-aware extraction logic.
 */
function parseAS24PDFCoordinate(
  pagesData: Array<{ pageNum: number; items: PdfItem[] }>,
  fileId: string,
  statement?: AS24InvoiceStatement
): CanonicalInvoiceRow[] {
  const rows: CanonicalInvoiceRow[] = [];

  // Stateful tracking across pages
  let currentCard = '';
  let currentReg = '';
  let currentCardOdometer = '';
  let currentObuId = '';
  let lastProductCode = '';
  let lastProductName = '';

  for (const page of pagesData) {
    // 1. Group items by Y coordinate (tolerance 3.0)
    const yRows: PdfItem[][] = [];
    const sortedItems = [...page.items].sort((a, b) => b.y - a.y);
    
    for (const item of sortedItems) {
      let placed = false;
      for (const row of yRows) {
        if (row[0] !== undefined && Math.abs(row[0].y - item.y) < 3.0) {
          row.push(item);
          placed = true;
          break;
        }
      }
      if (!placed) {
        yRows.push([item]);
      }
    }

    // Sort items within each row by X ascending
    for (const row of yRows) {
      row.sort((a, b) => a.x - b.x);
    }
    // Sort rows by Y descending (top to bottom)
    yRows.sort((a, b) => (b[0]?.y ?? 0) - (a[0]?.y ?? 0));

    // 2. Detect page type
    let isCardFillingList = false;
    let isPassango = false;
    for (const row of yRows) {
      const rowText = row.map(i => i.str).join(' ');
      if (rowText.includes('Cards filling list') || rowText.includes('Vehicle/Driver')) {
        isCardFillingList = true;
      }
      if (rowText.includes('PASSango : Transaction') || rowText.includes('Registration nbr')) {
        isPassango = true;
      }
    }

    // 3. Parse Card Filling List
    if (isCardFillingList) {
      for (const row of yRows) {
        // Build 16 columns
        const cols: string[] = Array(16).fill('');
        for (const item of row) {
          const x = item.x;
          let colIdx = 0;
          if (x < 70) colIdx = 0;
          else if (x < 100) colIdx = 1;
          else if (x < 110) colIdx = 2;
          else if (x < 190) colIdx = 3;
          else if (x < 235) colIdx = 4;
          else if (x < 255) colIdx = 5;
          else if (x < 280) colIdx = 6;
          else if (x < 305) colIdx = 7;
          else if (x < 330) colIdx = 8;
          else if (x < 370) colIdx = 9;
          else if (x < 400) colIdx = 10;
          else if (x < 435) colIdx = 11;
          else if (x < 465) colIdx = 12;
          else if (x < 500) colIdx = 13;
          else if (x < 545) colIdx = 14;
          else colIdx = 15;

          cols[colIdx] = (cols[colIdx] ? cols[colIdx] + ' ' : '') + item.str.trim();
        }

        // Check if Card Header row
        // e.g. " * 0151-0 252MH1717"
        const cardHeaderMatch = (cols[0] ?? '').match(/^\s*\*\s*([\d\-]+)\s+(?:IE-\s*)?([A-Z0-9\s]+)$/i);
        if (cardHeaderMatch) {
          currentCard = cardHeaderMatch[1]?.trim() ?? '';
          const regOdo = cardHeaderMatch[2]?.trim() ?? '';
          const parsedRegOdo = splitRegAndOdo(regOdo);
          currentReg = parsedRegOdo.registration;
          currentCardOdometer = (cols[5] ?? '').trim() || parsedRegOdo.odometer || '0';
          continue;
        }

        // Exclude subtotals / totals
        const rowText = row.map(i => i.str).join(' ');
        if (
          rowText.includes('Cards filling list') ||
          rowText.includes('Vehicle/Driver') ||
          rowText.includes('Card Registration') ||
          rowText.includes('Total card') ||
          rowText.includes('Total contract') ||
          rowText.includes('Customer number') ||
          rowText.includes('Page ') ||
          rowText.startsWith('###')
        ) {
          continue;
        }

        // Verify if Transaction detail row
        const dateTimeVal = (cols[4] ?? '').trim();
        const dateMatch = dateTimeVal.match(/^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})/);
        if (!dateMatch) continue;

        const dateISO = parseDateStr(dateMatch[1] ?? '');
        const timestampISO = `${dateISO}T${dateMatch[2] ?? '00:00'}:00.000Z`;

        // Parse product details
        const rawProd = (cols[1] ?? '').trim();
        if (rawProd) {
          const codeMatch = rawProd.match(/^([A-Z0-9]{2})\s+(.*)/i);
          if (codeMatch) {
            lastProductCode = codeMatch[1]?.trim() ?? '';
            lastProductName = codeMatch[2]?.trim() ?? '';
          } else {
            lastProductCode = rawProd.slice(0, 2).trim();
            lastProductName = rawProd.slice(2).trim();
          }
        }

        const productType = detectProductType(lastProductCode, lastProductName);
        const mileageKm = (cols[5] ?? '').trim() || currentCardOdometer;

        // Perform hard validations
        const volumeVal = validateAndRemapVolume(cols[7] ?? '', mileageKm, cols[6] ?? '');
        const finVal = validateFinancials(cols[14] ?? '', cols[15] ?? '', 'EUR');

        const finalStatus = volumeVal.status === 'PARSER_MAPPING_ERROR' || finVal.status === 'PARSER_MAPPING_ERROR'
          ? 'PARSER_MAPPING_ERROR'
          : (volumeVal.status === 'Needs field review' ? 'Needs field review' : 'OK');

        const extractionConfidence = finalStatus === 'PARSER_MAPPING_ERROR' ? 30 : (finalStatus === 'Needs field review' ? 70 : 100);

        rows.push({
          id: generateId(),
          importFileId: fileId,
          importRowIndex: Math.round(row[0]?.y ?? 0), // Y coordinate row identification
          registration: currentReg,
          cardNumber: currentCard,
          cardNumberNormalised: normaliseCardNumber(currentCard),
          equipmentNumber: '',
          invoiceNumber: statement?.invoiceNumber || '',
          invoiceDate: statement?.invoiceDate || '',
          documentNumber: '',
          ticketNumber: '',
          transactionDate: dateISO,
          transactionTimestamp: timestampISO,
          timestampPrecision: TimestampPrecision.EXACT,
          transactionNumber: '',
          stationNumber: (cols[3] ?? '').match(/^\w{3}\s+(\w{4})/)?.[1] ?? '',
          stationNumberNormalised: normaliseStationCode((cols[3] ?? '').match(/^\w{3}\s+(\w{4})/)?.[1] ?? ''),
          stationName: (cols[3] ?? '').replace(/^\w{3}\s+\w{4}\s+/, '').trim(),
          stationCity: '',
          stationZipCode: '',
          serviceCountry: (cols[3] ?? '').slice(0, 3).trim(),
          invoiceCountry: '',
          productCode: lastProductCode,
          productGroup: '',
          productName: lastProductName,
          productType,
          costGroup: '',
          quantity: volumeVal.volume,
          unit: productType === ProductType.TOLL ? 'ST' : 'L',
          pricePerUnit: (cols[9] ?? '').trim(),
          pricePerUnitGross: (cols[9] ?? '').trim(),
          baseValueNet: (cols[14] ?? '').trim(), // Amount ex VAT in payment currency (Headline ex-VAT settled value)
          baseValueGross: (cols[15] ?? '').trim(),
          serviceFeeNet: '0',
          valueOfPurchaseNet: (cols[14] ?? '').trim(),
          discountNet: (cols[10] ?? '').trim(),
          discountGross: '0',
          vat: (cols[13] ?? '').trim(),
          paymentCurrency: 'EUR',
          serviceCurrency: (cols[8] ?? '').trim(),
          valueInPayCurrency: (cols[15] ?? '').trim(),
          valueInServiceCountryCurrency: (cols[15] ?? '').trim(),
          costCentre1: '',
          costCentre2: '',
          mileage: mileageKm,
          agesTerminal: '',
          customerId: statement?.contractNumber ?? '',
          cardNumberPartner: '',
          provider: CardProvider.AS24,
          // Canonical fields
          vehicleRegistration: currentReg,
          pumpCode: (cols[2] ?? '').trim(),
          countryCode: (cols[3] ?? '').slice(0, 3).trim(),
          forecourtCode: (cols[3] ?? '').match(/^\w{3}\s+(\w{4})/)?.[1] ?? '',
          forecourtName: (cols[3] ?? '').replace(/^\w{3}\s+\w{4}\s+/, '').trim(),
          transactionDateTime: (cols[4] ?? '').trim(),
          mileageKm,
          litresPer100Km: (cols[6] ?? '').trim(),
          volume: volumeVal.volume,
          volumeUnit: 'L',
          stationCurrency: (cols[8] ?? '').trim(),
          unitPriceVatIncluded: (cols[9] ?? '').trim(),
          rebate: (cols[10] ?? '').trim(),
          stationAmountExVat: (cols[11] ?? '').trim(),
          stationVatAmount: (cols[13] ?? '').trim(),
          paymentAmountExVat: (cols[14] ?? '').trim(),
          paymentAmountInclVat: (cols[15] ?? '').trim(),
          sourcePage: page.pageNum,
          extractionConfidence,
          status: finalStatus,
          warnings: [...volumeVal.warnings, ...finVal.warnings],
          financialMetadata: {
            paymentAmountExVat: {
              sourceHeading: 'Amount ex. VAT',
              currency: 'EUR',
              isNet: true,
              isPaymentCurrency: true,
              parserConfidence: extractionConfidence,
            },
            volume: {
              sourceHeading: 'Volume',
              currency: 'L',
              isNet: true,
              isPaymentCurrency: false,
              parserConfidence: extractionConfidence,
            }
          }
        });
      }
    }

    // 4. Parse PASSango Tolls
    if (isPassango) {
      for (const row of yRows) {
        const cols: string[] = Array(10).fill('');
        for (const item of row) {
          const x = item.x;
          let colIdx = 0;
          if (x < 50) colIdx = 0;
          else if (x < 80) colIdx = 1;
          else if (x < 150) colIdx = 2;
          else if (x < 190) colIdx = 3;
          else if (x < 220) colIdx = 4;
          else if (x < 280) colIdx = 5;
          else if (x < 400) colIdx = 6;
          else if (x < 470) colIdx = 7;
          else if (x < 530) colIdx = 8;
          else colIdx = 9;

          cols[colIdx] = (cols[colIdx] ? cols[colIdx] + ' ' : '') + item.str.trim();
        }

        // Exclude header / total rows
        const rowText = row.map(i => i.str).join(' ');
        if (
          rowText.includes('PASSango : Transaction') ||
          rowText.includes('Registration nbr') ||
          rowText.includes('Maximum Gross') ||
          rowText.includes('Total IE-') ||
          rowText.includes('Page ') ||
          rowText.startsWith('###')
        ) {
          continue;
        }

        // Vehicle / OBU header (often combined with the first toll row)
        if ((cols[0] ?? '').trim().startsWith('IE-')) {
          const regVal = (cols[0] ?? '').trim().replace(/\s+/g, '');
          currentReg = regVal.replace(/^IE-/, '');
          currentObuId = (cols[2] ?? '').trim().replace(/\s+/g, '');
        }

        const dateVal = (cols[4] ?? '').trim();
        const dateMatch = dateVal.match(/^(\d{2}\/\d{2}\/\d{4})/);
        if (!dateMatch) continue;

        const dateISO = parseDateStr(dateMatch[1] ?? '');
        const reference = (cols[5] ?? '').trim();
        const regionName = (cols[6] ?? '').trim();
        const distance = (cols[7] ?? '').trim();
        const netAmount = (cols[8] ?? '').trim();
        const grossAmount = (cols[9] ?? '').trim();

        const finVal = validateFinancials(netAmount, grossAmount, 'EUR');

        rows.push({
          id: generateId(),
          importFileId: fileId,
          importRowIndex: Math.round(row[0]?.y ?? 0),
          registration: currentReg,
          cardNumber: currentObuId,
          cardNumberNormalised: normaliseCardNumber(currentObuId),
          equipmentNumber: '',
          invoiceNumber: statement?.invoiceNumber || '',
          invoiceDate: statement?.invoiceDate || '',
          documentNumber: '',
          ticketNumber: reference,
          transactionDate: dateISO,
          transactionTimestamp: `${dateISO}T00:00:00.000Z`,
          timestampPrecision: TimestampPrecision.DATE_ONLY,
          transactionNumber: reference,
          stationNumber: '',
          stationNumberNormalised: '',
          stationName: regionName,
          stationCity: '',
          stationZipCode: '',
          serviceCountry: 'BEL',
          invoiceCountry: '',
          productCode: 'PASSango',
          productGroup: 'Toll',
          productName: 'PASSango Toll',
          productType: ProductType.TOLL,
          costGroup: '',
          quantity: distance,
          unit: 'KM',
          pricePerUnit: '0',
          pricePerUnitGross: '0',
          baseValueNet: netAmount,
          baseValueGross: grossAmount,
          serviceFeeNet: '0',
          valueOfPurchaseNet: netAmount,
          discountNet: '0',
          discountGross: '0',
          vat: '0',
          paymentCurrency: 'EUR',
          serviceCurrency: 'EUR',
          valueInPayCurrency: grossAmount,
          valueInServiceCountryCurrency: grossAmount,
          costCentre1: '',
          costCentre2: '',
          mileage: '0',
          agesTerminal: '',
          customerId: statement?.contractNumber || '',
          cardNumberPartner: '',
          provider: CardProvider.AS24,
          warnings: finVal.warnings,
          status: finVal.status,
        });
      }
    }
  }

  return rows;
}

/**
 * Main parser entry point for AS24 PDF.
 */
export function parseAS24PDF(
  text: string,
  fileId: string,
  pagesData?: Array<{ pageNum: number; items: PdfItem[] }>
): AS24ParseResult {
  const sections = detectSections(text);
  const statementSec = sections.find((s) => s.type === 'INVOICE_STATEMENT');
  const statement = statementSec ? parseInvoiceStatement(statementSec.text) : undefined;

  let invoiceRows: CanonicalInvoiceRow[] = [];
  let parserUsed = PARSER_VERSION_FALLBACK;

  if (pagesData && pagesData.length > 0) {
    invoiceRows = parseAS24PDFCoordinate(pagesData, fileId, statement);
    parserUsed = PARSER_VERSION_COORDINATE;
  } else {
    // Use fallback parser
    const cardFillingSec = sections.find((s) => s.type === 'CARD_FILLING_LIST');
    const passangoSec = sections.find((s) => s.type === 'PASSANGO');

    const cardFillingRows = cardFillingSec ? parseCardFillingListFallback(cardFillingSec.text, fileId) : [];
    const passangoRows = passangoSec ? parsePASSangoSectionFallback(passangoSec.text, fileId) : [];

    invoiceRows = [...cardFillingRows, ...passangoRows];
  }

  // Update invoice rows with statement fields if parsed (failsafe)
  if (statement) {
    for (let i = 0; i < invoiceRows.length; i++) {
      const row = invoiceRows[i];
      if (!row) continue;
      invoiceRows[i] = {
        ...row,
        invoiceNumber: row.invoiceNumber || statement.invoiceNumber,
        invoiceDate: row.invoiceDate || statement.invoiceDate,
        customerId: row.customerId || statement.contractNumber,
      };
    }
  }

  return {
    invoiceRows,
    statement,
    sections,
    totalRows: invoiceRows.length,
  };
}
