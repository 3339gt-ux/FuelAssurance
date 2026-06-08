/**
 * AS24 PDF Invoice Parser
 *
 * Extracts and parses transaction details from AS24 PDF invoice statements.
 * Identifies three core sections:
 *   1. Invoice Statement (Summary & Control Totals)
 *   2. Cards Filling List (Fuel, Tolls, Parking)
 *   3. PASSango Transaction Report (Electronic Tolls)
 */

import {
  type PdfSection,
  type AS24InvoiceStatement,
  type ControlTotal,
  type CanonicalInvoiceRow,
  ProductType,
  CardProvider,
  TimestampPrecision,
} from '@/domain/types';
import { generateId, normaliseCardNumber, normaliseStationCode } from '@/lib/utils';

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
  // Example: Electronic Toll System - Austria6800PFA025731EUR2 856.04571.213 427.253 427.25
  const itemRegex = /^(.+?)([0-9]{4}[A-Z]{3}[0-9]+)(EUR|GBP|HUF|PLN)([\d\s\.,]+)$/;
  for (const line of lines) {
    const match = line.match(itemRegex);
    if (match) {
      const label = match[1]?.trim() || '';
      const numString = (match[4] || '').replace(/[\s\xA0]+/g, '');
      
      // Parse numbers from the end: net, vat, gross, paid
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
 * Parse Cards Filling List section.
 */
export function parseCardFillingList(text: string, fileId: string): CanonicalInvoiceRow[] {
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

    // Filter out obvious header/total rows
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

    // Detect card header row:  * 0001-2 241 MH 236261000
    const cardHeaderMatch = line.match(/^\s*\*\s*([\d\-]+)\s+(IE-\s*)?([0-9]{3}\s*[A-Z]{1,2}\s*[0-9]+.*)$/i);
    if (cardHeaderMatch) {
      currentCard = (cardHeaderMatch[1] || '').trim();
      const rawRegOdo = (cardHeaderMatch[3] || '').trim();
      const parsedReg = splitRegAndOdo(rawRegOdo);
      currentReg = parsedReg.registration;
      currentOdometer = parsedReg.odometer;
      continue;
    }

    // Check if detail line
    const isInherited = line.trim().startsWith('*');
    
    // Match line details using the unified regex anchor
    const lineRegex = /^\s*(?:\*\s*)?(?:([A-Z0-9]{2})\s+([A-Za-z\s\*]+?)\s*)?(?:(\d{2})?\s*([A-Z]{3})\s+(\w{4})\s+)/i;
    const match = line.match(lineRegex);
    if (!match) continue;

    const matchedProdCode = match[1] || '';
    const matchedProdName = match[2] || '';
    const pump = match[3] || '';
    const country = match[4] || '';
    const stationCode = match[5] || '';

    // Determine product info
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

    // Extract numbers and currency from right side of date
    const rightSide = remaining.slice(dateIndex + 16).trim();
    const currencyMatch = rightSide.match(/(EUR|GBP|HUF|PLN)/i);
    if (!currencyMatch || currencyMatch.index === undefined) continue;

    const currency = currencyMatch[1];
    if (!currency) continue;
    const leftOfCurrency = rightSide.slice(0, currencyMatch.index).trim();
    const rightOfCurrency = rightSide.slice(currencyMatch.index + currency.length).trim();

    // Parse Left numbers: mileage/odometer, consumption/middle, quantity/litres
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

    // Parse Right numbers (7 values)
    const rightNums = parseRightSide(rightOfCurrency);

    lastProductCode = productCode;
    lastProductName = productName;

    const productType = detectProductType(productCode, productName);

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
      quantity,
      unit: productType === ProductType.DIESEL || productType === ProductType.ADBLUE || productType === ProductType.GNR ? 'L' : 'ST',
      pricePerUnit: rightNums.unitPrice,
      pricePerUnitGross: rightNums.unitPrice, // fallback
      baseValueNet: rightNums.amountExVat,
      baseValueGross: rightNums.amountInclVat,
      serviceFeeNet: '0',
      valueOfPurchaseNet: rightNums.amountExVat,
      discountNet: rightNums.rebate,
      discountGross: '0',
      vat: rightNums.vat,
      paymentCurrency: currency,
      serviceCurrency: currency,
      valueInPayCurrency: rightNums.amountInclVat,
      valueInServiceCountryCurrency: rightNums.amountInclVat,
      costCentre1: '',
      costCentre2: '',
      mileage,
      agesTerminal: '',
      customerId: '',
      cardNumberPartner: '',
      provider: CardProvider.AS24,
    });
  }

  return rows;
}

/**
 * Parse PASSango Transaction Report section.
 */
export function parsePASSangoSection(text: string, fileId: string): CanonicalInvoiceRow[] {
  const normalized = text.replace(/\xA0/g, ' ');
  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);

  const rows: CanonicalInvoiceRow[] = [];
  
  let currentReg = '';
  let currentObuId = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Filter out headers/footers
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

    // Check if it defines a new vehicle/OBU block
    // E.g. IE- 241MH2436078110082406062200011077794400018/05/2026...
    const regMatch = line.match(/^\s*(IE-\s*(?:241MH\d{3}|252MH(?:1\d{3}|[78]\d{2})))/i);
    const startsWithDate = line.match(/^\s*(\d{2}\/\d{2}\/\d{4})/);

    if (regMatch) {
      const regVal = regMatch[1];
      if (regVal) {
        currentReg = regVal.replace(/\s+/g, '');
        // Extract OBU ID (usually 10 digits following the registration)
        const rest = line.slice(line.indexOf(regVal) + regVal.length).trim();
        // OBU is typically the next 10 digits
        const obuMatch = rest.match(/^(\d{10})/);
        currentObuId = obuMatch ? obuMatch[1] || '' : '';
      }
    }

    if (regMatch || startsWithDate) {
      // Find date
      const dateMatch = line.match(/(\d{2}\/\d{2}\/\d{4})/);
      if (!dateMatch || dateMatch.index === undefined) continue;

      const dateStr = dateMatch[1];
      if (!dateStr) continue;
      const dateISO = parseDateStr(dateStr);

      const rightPart = line.slice(dateMatch.index + 10).trim();
      // Right part starts with reference: e.g. 2026-FLN-0000041522
      const refMatch = rightPart.match(/^(\d{4}-[A-Z]{3}-\d+)/);
      if (!refMatch) continue;

      const reference = refMatch[1];
      if (!reference) continue;
      const detailPart = rightPart.slice(reference.length).trim();

      // Region name goes until numbers start
      const numStartMatch = detailPart.match(/([\d\.\s,]+)$/);
      if (!numStartMatch) continue;

      const regionName = detailPart.slice(0, numStartMatch.index).trim();
      const numStringVal = numStartMatch[1];
      if (!numStringVal) continue;
      const numString = numStringVal.trim();

      // Parse numbers from right: gross, net, distance
      // Distance usually has 3 dec, net has 2 dec, gross has 2 dec
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
        serviceCountry: 'BEL', // Regions are BELGIUM-Région Flandre/Bruxelles/Sofico
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
 * Main parser entry point for AS24 PDF.
 */
export function parseAS24PDF(text: string, fileId: string): AS24ParseResult {
  const sections = detectSections(text);
  const statementSec = sections.find((s) => s.type === 'INVOICE_STATEMENT');
  const cardFillingSec = sections.find((s) => s.type === 'CARD_FILLING_LIST');
  const passangoSec = sections.find((s) => s.type === 'PASSANGO');

  const statement = statementSec ? parseInvoiceStatement(statementSec.text) : undefined;
  
  const cardFillingRows = cardFillingSec ? parseCardFillingList(cardFillingSec.text, fileId) : [];
  const passangoRows = passangoSec ? parsePASSangoSection(passangoSec.text, fileId) : [];

  const invoiceRows = [...cardFillingRows, ...passangoRows];

  // Update invoice rows with statement fields if parsed
  if (statement) {
    for (let i = 0; i < invoiceRows.length; i++) {
      const row = invoiceRows[i];
      if (!row) continue;
      // Workaround readonly properties: recreate object
      invoiceRows[i] = {
        ...row,
        invoiceNumber: statement.invoiceNumber,
        invoiceDate: statement.invoiceDate,
        customerId: statement.contractNumber,
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
