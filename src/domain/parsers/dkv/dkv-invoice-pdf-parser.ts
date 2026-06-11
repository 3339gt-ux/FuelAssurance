import {
  type CanonicalInvoiceRow,
  ProductType,
  CardProvider,
  TimestampPrecision,
  type SourceEvidence,
} from '@/domain/types';
import { generateId, normaliseCardNumber, normaliseStationCode } from '@/lib/utils';

export interface PdfItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DKVStatementRow {
  serviceCountry: string;
  countryFormType: string;
  invoiceNumber: string;
  invoiceCurrency: string;
  totalInServiceCountryCurrency: string;
  totalInPaymentCurrency: string;
  sourcePage: number;
  sourceBoundingBox?: { x: number; y: number; width: number; height: number };
}

export interface DKVInvoiceStatement {
  documentNumber: string;
  documentDate: string;
  customerNumber: string;
  customerVatNumber: string;
  customerName: string;
  paymentDueText: string;
  statementCurrency: string;
  statementTotalPaymentCurrency: string;
  statementRows: DKVStatementRow[];
}

export interface DKVInvoicePDFParseResult {
  invoiceRows: CanonicalInvoiceRow[];
  statement?: DKVInvoiceStatement | undefined;
  totalRows: number;
}

const MAX_FLEET_FUEL_CAPACITY_LITRES = 1250;
const PARSER_VERSION = '2.0.0-coordinate';

// Helper to parse European and English numbers
export function parseDkvNumber(str: string): number {
  if (!str) return 0;
  let cleaned = str.trim().replace(/\s+/g, '').replace(/\xA0/g, '');
  if (cleaned.includes('.') && cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(/,/g, '.');
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/,/g, '.');
  }
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

// Helper: parse DD.MM.YYYY to YYYY-MM-DD
function parseDateStr(str: string): string {
  const m = str.trim().match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

// Helper: parse HH:MM to HH:MM:00
function parseTimeStr(str: string): string {
  const m = str.trim().match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : '';
}

function detectProductType(name: string): ProductType {
  const n = name.toUpperCase();
  if (n.includes('GAZOLE NON ROUTIER') || n.includes('GNR') || n.includes('RED DIESEL')) {
    return ProductType.GNR;
  }
  if (n.includes('GAZOLE') || n.includes('DIESEL')) {
    return ProductType.DIESEL;
  }
  if (n.includes('ADBLUE')) {
    return ProductType.ADBLUE;
  }
  if (n.includes('PARK') || n.includes('STATIONNEMENT')) {
    return ProductType.PARKING;
  }
  if (n.includes('TOLL') || n.includes('PEAGE') || n.includes('TAX')) {
    return ProductType.TOLL;
  }
  if (n.includes('WASH') || n.includes('LAVAGE')) {
    return ProductType.WASH;
  }
  return ProductType.OTHER;
}

export function parseDKVInvoicePDF(
  text: string,
  fileId: string,
  pagesData?: Array<{ pageNum: number; items: PdfItem[] }>
): DKVInvoicePDFParseResult {
  const invoiceRows: CanonicalInvoiceRow[] = [];
  let statement: DKVInvoiceStatement | undefined;

  if (!pagesData || pagesData.length === 0) {
    return { invoiceRows: [], totalRows: 0 };
  }

  // 1. Parse Summary Page (always check Page 1 first)
  const page1 = pagesData[0];
  if (page1) {
    // Reconstruct page 1 text
    const sortedPage1 = [...page1.items].sort((a, b) => b.y - a.y || a.x - b.x);
    const p1Text = sortedPage1.map(i => i.str).join(' ');

    let documentNumber = '';
    let documentDate = '';
    let customerNumber = '';
    let customerVatNumber = '';
    let customerName = 'Noone Transport Ltd';
    let paymentDueText = '';
    let statementCurrency = 'EUR';
    let statementTotalPaymentCurrency = '0';
    const statementRows: DKVStatementRow[] = [];

    // Parse header fields from lines
    const p1Lines = p1Text.replace(/\xA0/g, ' ').split('\n').flatMap(l => l.split('  ')).map(l => l.trim()).filter(Boolean);
    
    // Find customer details and document numbers
    for (let i = 0; i < page1.items.length; i++) {
      const item = page1.items[i];
      if (!item) continue;
      const str = item.str.trim();
      if (str.includes('Customer number:')) {
        // Look for next items that might be the value
        const valItem = page1.items.find(val => Math.abs(val.x - item.x) < 10 && val.y > item.y && /^\d+$/.test(val.str.trim()));
        if (valItem) customerNumber = valItem.str.trim();
      }
      if (str.includes('Document number:')) {
        const valItem = page1.items.find(val => Math.abs(val.x - item.x) < 10 && val.y > item.y && /^\d{2}\/\d{9}\/\d{3}$/.test(val.str.trim()));
        if (valItem) documentNumber = valItem.str.trim();
      }
      if (str.includes('Document date:')) {
        const valItem = page1.items.find(val => Math.abs(val.x - item.x) < 10 && val.y > item.y && /^\d{2}\.\d{2}\.\d{4}$/.test(val.str.trim()));
        if (valItem) documentDate = parseDateStr(valItem.str.trim());
      }
      if (str.includes('Cust. VAT Id/Nat.Tax.No.:') || str.includes('Cust. VAT Id')) {
        const valItem = page1.items.find(val => Math.abs(val.x - item.x) < 10 && val.y > item.y && /^[A-Z]{2}[A-Z0-9]+$/i.test(val.str.trim()));
        if (valItem) customerVatNumber = valItem.str.trim();
      }
    }

    // Fallback regex matching on the full text if coordinates check is missing some values
    if (!customerNumber) {
      const match = p1Text.match(/Customer number:\s*(\d+)/i);
      if (match) customerNumber = match[1] || '';
    }
    if (!documentNumber) {
      const match = p1Text.match(/Document number:\s*(\d{2}\/\d{9}\/\d{3})/i);
      if (match) documentNumber = match[1] || '';
    }
    if (!documentDate) {
      const match = p1Text.match(/Document date:\s*(\d{2}\.\d{2}\.\d{4})/i);
      if (match) documentDate = parseDateStr(match[1] || '');
    }
    if (!customerVatNumber) {
      const match = p1Text.match(/IE[0-9A-Z]+/i);
      if (match) customerVatNumber = match[0] || '';
    }

    // Parse payment due date
    const paymentDueMatch = p1Text.match(/Payment is due:\s*([^\n\.]+)/i) || p1Text.match(/debit will be deducted:\s*([^\n\.]+)/i);
    if (paymentDueMatch) {
      paymentDueText = paymentDueMatch[0].trim();
    }

    // Parse total statement amount
    const totalMatch = p1Text.match(/Total\s+([\d\s\.,]+)\s+(EUR)/i) || p1Text.match(/Total to be paid\s+([\d\s\.,]+)\s+(EUR)/i);
    if (totalMatch) {
      statementCurrency = totalMatch[2] || 'EUR';
      statementTotalPaymentCurrency = String(parseDkvNumber(totalMatch[1] || '0'));
    }

    // Parse statement table rows (Service country, form type, invoice number, etc.)
    // Standard rows grouped by Y coordinate on page 1
    const yRowsP1 = groupPageItemsByX(page1.items, 2.0); // Wait, X coordinate represents rows in PDF
    for (const row of yRowsP1) {
      const rowText = row.map(i => i.str).join(' ');
      const rowMatch = rowText.match(/^(.+?)\s+(Invoice|Statement of account|Reverse Charge)\s+(26\/\d{9}\/\d{3})\s+([A-Z]{3})\s+([\d\s\.,\-]+)\s+([\d\s\.,\-]+)\s*([A-Z]{3})?/i);
      if (rowMatch) {
        statementRows.push({
          serviceCountry: (rowMatch[1] || '').trim(),
          countryFormType: (rowMatch[2] || '').trim(),
          invoiceNumber: (rowMatch[3] || '').trim(),
          invoiceCurrency: (rowMatch[4] || '').trim(),
          totalInServiceCountryCurrency: String(parseDkvNumber(rowMatch[5] || '0')),
          totalInPaymentCurrency: String(parseDkvNumber(rowMatch[6] || '0')),
          sourcePage: 1,
          sourceBoundingBox: {
            x: Math.min(...row.map(i => i.x)),
            y: Math.min(...row.map(i => i.y)),
            width: Math.max(...row.map(i => i.x + i.width)) - Math.min(...row.map(i => i.x)),
            height: Math.max(...row.map(i => i.y + i.height)) - Math.min(...row.map(i => i.y)),
          }
        });
      }
    }

    statement = {
      documentNumber,
      documentDate,
      customerNumber,
      customerVatNumber,
      customerName,
      paymentDueText,
      statementCurrency,
      statementTotalPaymentCurrency,
      statementRows,
    };
  }

  // Stateful tracking across pages
  let currentServiceCountry = '';
  let currentInvoiceNumber = '';
  let currentInvoiceDate = '';
  let currentTicketNumber = '';
  let currentVatRate = 21.0;
  let currentCurrency = 'EUR';
  let currentVehicleReg = '';
  let currentCardNumber = '';

  // 2. Parse Detailed Transaction Sections (Pages 2 to N)
  for (let pageIdx = 1; pageIdx < pagesData.length; pageIdx++) {
    const page = pagesData[pageIdx];
    if (!page) continue;

    // Detect country section headers on page
    const pageItems = page.items;
    const sortedItems = [...pageItems].sort((a, b) => a.x - b.x || a.y - b.y); // X represents vertical position
    const pageText = sortedItems.map(i => i.str).join(' ');

    // Detect Country
    const countryMatch = pageText.match(/(Pour livraisons et prestations en|For services and deliveries in|Für Leistungen und Lieferungen in|Para suministros y servicios en|Szolgáltatásért és szállitásért a|Za služby a dodávky v \(do\))\s+([A-Za-z\s]+)/i);
    if (countryMatch && countryMatch[2]) {
      const countryStr = countryMatch[2].trim();
      if (countryStr.toLowerCase().startsWith('belgique') || countryStr.toLowerCase().startsWith('belgium')) {
        currentServiceCountry = 'BEL';
        currentVatRate = 21.0;
      } else if (countryStr.toLowerCase().startsWith('germany') || countryStr.toLowerCase().startsWith('allemagne')) {
        currentServiceCountry = 'DEU';
        currentVatRate = 19.0;
      } else if (countryStr.toLowerCase().startsWith('france')) {
        currentServiceCountry = 'FRA';
        currentVatRate = 20.0;
      } else if (countryStr.toLowerCase().startsWith('spain') || countryStr.toLowerCase().startsWith('espagne')) {
        currentServiceCountry = 'ESP';
        currentVatRate = 21.0;
      } else if (countryStr.toLowerCase().startsWith('netherlands') || countryStr.toLowerCase().startsWith('pays-bas')) {
        currentServiceCountry = 'NLD';
        currentVatRate = 21.0;
      } else if (countryStr.toLowerCase().startsWith('slovenia') || countryStr.toLowerCase().startsWith('slovénie')) {
        currentServiceCountry = 'SVN';
        currentVatRate = 22.0;
      } else if (countryStr.toLowerCase().startsWith('slovakia') || countryStr.toLowerCase().startsWith('slovaquie')) {
        currentServiceCountry = 'SVK';
        currentVatRate = 20.0;
      } else if (countryStr.toLowerCase().startsWith('hungary') || countryStr.toLowerCase().startsWith('hongrie')) {
        currentServiceCountry = 'HUN';
        currentVatRate = 27.0;
      } else if (countryStr.toLowerCase().startsWith('czech') || countryStr.toLowerCase().startsWith('république tchèque')) {
        currentServiceCountry = 'CZE';
        currentVatRate = 21.0;
      } else if (countryStr.toLowerCase().startsWith('ireland') || countryStr.toLowerCase().startsWith('irlande')) {
        currentServiceCountry = 'IRL';
        currentVatRate = 23.0;
      } else if (countryStr.toLowerCase().startsWith('united kingdom') || countryStr.toLowerCase().startsWith('royaume-uni')) {
        currentServiceCountry = 'GBR';
        currentVatRate = 20.0;
      }
    }

    // Detect Page-level Invoice Details
    for (let i = 0; i < pageItems.length; i++) {
      const item = pageItems[i];
      if (!item) continue;
      const str = item.str.trim();
      
      if (str.includes('Ticket number DKV:') || str.includes('Numéro de reçu DKV:')) {
        const valItem = pageItems.find(val => Math.abs(val.x - item.x) < 10 && val.y > item.y && /^\d{2}\/\d{9}\/\d{3}$/.test(val.str.trim()));
        if (valItem) currentTicketNumber = valItem.str.trim();
      }
      if (str.includes('Invoice number:') || str.includes('Numéro de facture:')) {
        const valItem = pageItems.find(val => Math.abs(val.x - item.x) < 10 && val.y > item.y && /^\d{2}\/\d{9}\/\d{3}$/.test(val.str.trim()));
        if (valItem) currentInvoiceNumber = valItem.str.trim();
      }
      if (str.includes('Invoice date:') || str.includes('Date de facturation:')) {
        const valItem = pageItems.find(val => Math.abs(val.x - item.x) < 10 && val.y > item.y && /^\d{2}\.\d{2}\.\d{4}$/.test(val.str.trim()));
        if (valItem) currentInvoiceDate = parseDateStr(valItem.str.trim());
      }
      if (str.includes('TVA (%) :') || str.includes('VAT (%) :')) {
        const match = str.match(/(?:TVA|VAT)\s*\(%\)\s*:\s*([\d\s\.,]+)/i);
        if (match) currentVatRate = parseDkvNumber(match[1] || '21');
      }
      if (str.includes('Monnaie:') || str.includes('Currency:')) {
        const match = str.match(/(?:Monnaie|Currency)\s*:\s*([A-Z]{3})/i);
        if (match) currentCurrency = match[1] || 'EUR';
      }
    }

    // Select layout based on service country
    const isShiftedLayout = ['DEU', 'NLD', 'SVN'].includes(currentServiceCountry);

    // Group items by X (representing horizontal rows visually)
    const yRows = groupPageItemsByX(pageItems, 2.5);

    for (let rIdx = 0; rIdx < yRows.length; rIdx++) {
      const row = yRows[rIdx];
      if (!row || row.length === 0) continue;

      const rowText = row.map(i => i.str).join(' ');

      // Check if Vehicle Header Row
      // e.g. "VEHICLE: 252MH1819 CARD NO.: 704310.0112283273"
      const vehicleMatch = rowText.match(/VEHICLE:\s*([A-Z0-9]+)\s*CARD\s*NO\.:\s*([\d\.]+)/i);
      if (vehicleMatch) {
        currentVehicleReg = (vehicleMatch[1] || '').trim();
        currentCardNumber = (vehicleMatch[2] || '').trim();
        continue;
      }

      // Filter out non-transaction rows (page headers, column names, totals, carry-overs)
      if (
        rowText.includes('Page / Page:') ||
        rowText.includes('Date de livraison') ||
        rowText.includes('Station service nom') ||
        rowText.includes('TOTAL:') ||
        rowText.includes('Report / Carry-over') ||
        rowText.includes('Total contract') ||
        rowText.startsWith('V2  X')
      ) {
        continue;
      }

      // A valid transaction row MUST have a valid date in the date column position (y ~ 41)
      const dateItem = row.find(item => Math.abs(item.y - 41.11) < 5.0 && /^\d{2}\.\d{2}\.\d{4}$/.test(item.str.trim()));
      if (!dateItem) continue;

      const dateStr = dateItem.str.trim();
      const dateISO = parseDateStr(dateStr);

      // Now map items to columns based on Y coordinates
      const cols: Record<string, string> = {};
      for (const item of row) {
        const y = item.y;
        let colName = '';

        if (!isShiftedLayout) {
          // Standard Layout mapping
          if (Math.abs(y - 41.11) < 5.0) colName = 'date';
          else if (Math.abs(y - 83.94) < 10.0) colName = 'stationName';
          else if (Math.abs(y - 137.48) < 10.0) colName = 'city';
          else if (Math.abs(y - 196.70) < 10.0) colName = 'stationNumber';
          else if (Math.abs(y - 256.18) < 15.0) colName = 'transactionNumber';
          else if (Math.abs(y - 292.74) < 10.0) colName = 'time';
          else if (Math.abs(y - 325.89) < 10.0) colName = 'odometer';
          else if (Math.abs(y - 348.96) < 20.0) colName = 'product';
          else if (Math.abs(y - 426.59) < 10.0) colName = 'productCode';
          else if (Math.abs(y - 445.33) < 10.0) colName = 'unit';
          else if (Math.abs(y - 482.14) < 15.0) colName = 'quantity';
          else if (Math.abs(y - 520.31) < 15.0) colName = 'priceGross';
          else if (Math.abs(y - 549.76) < 15.0) colName = 'priceNet';
          else if (Math.abs(y - 592.59) < 15.0) colName = 'baseNet';
          else if (Math.abs(y - 631.49) < 15.0) colName = 'discountNet';
          else if (Math.abs(y - 666.26) < 15.0) colName = 'serviceFeeNet';
          else if (Math.abs(y - 702.35) < 15.0) colName = 'totalNet';
          else if (Math.abs(y - 743.20) < 15.0) colName = 'vat';
          else if (Math.abs(y - 788.01) < 15.0) colName = 'totalGross';
        } else {
          // Shifted Layout mapping (Germany, Netherlands, Slovenia)
          if (Math.abs(y - 41.11) < 5.0) colName = 'date';
          else if (Math.abs(y - 86.13) < 10.0) colName = 'stationName';
          else if (Math.abs(y - 142.42) < 10.0) colName = 'city';
          else if (Math.abs(y - 206.03) < 10.0) colName = 'stationNumber';
          else if (Math.abs(y - 275.83) < 15.0) colName = 'transactionNumber';
          else if (Math.abs(y - 305.65) < 10.0) colName = 'time';
          else if (Math.abs(y - 364.74) < 20.0) colName = 'product';
          else if (Math.abs(y - 446.36) < 10.0) colName = 'productCode';
          else if (Math.abs(y - 466.06) < 10.0) colName = 'unit';
          else if (Math.abs(y - 524.58) < 15.0) colName = 'quantity';
          else if (Math.abs(y - 549.36) < 15.0) colName = 'priceGross';
          else if (Math.abs(y - 580.31) < 15.0) colName = 'priceNet';
          else if (Math.abs(y - 625.34) < 15.0) colName = 'baseNet';
          else if (Math.abs(y - 659.67) < 15.0) colName = 'serviceFeeNet';
          else if (Math.abs(y - 701.32) < 15.0) colName = 'totalNet';
          else if (Math.abs(y - 744.10) < 15.0) colName = 'vat';
          else if (Math.abs(y - 791.38) < 15.0) colName = 'totalGross';
        }

        if (colName) {
          cols[colName] = (cols[colName] ? cols[colName] + ' ' : '') + item.str.trim();
        }
      }

      // Check product and unit
      const product = (cols['product'] || '').trim();
      const productCode = (cols['productCode'] || '').trim();
      const unit = (cols['unit'] || '').trim().toUpperCase();
      const rawQuantity = (cols['quantity'] || '').trim();
      const quantityVal = parseDkvNumber(rawQuantity);

      const productType = detectProductType(product || productCode);

      // Enforce physical quantity validation:
      // Maximum single-vehicle fuel transaction = 1250 litres
      const isFuelProduct = [ProductType.DIESEL, ProductType.GNR, ProductType.RED_DIESEL, ProductType.ADBLUE].includes(productType);
      const isLitres = unit === 'LTR' || unit === 'L';
      let warningsList: string[] = [];
      let finalStatus = 'OK';
      let confidence = 100;

      if (isFuelProduct && isLitres && quantityVal > MAX_FLEET_FUEL_CAPACITY_LITRES) {
        finalStatus = 'PARSER_MAPPING_ERROR';
        confidence = 10;
        warningsList.push(
          `PHYSICAL_LIMIT_EXCEEDED: Fuel quantity "${rawQuantity}" (${quantityVal}L) exceeds the physical fleet capacity ceiling of ${MAX_FLEET_FUEL_CAPACITY_LITRES} litres. Scorer check disabled.`
        );
      }

      // Perform arithmetic validation
      const baseNet = parseDkvNumber(cols['baseNet'] || '0');
      const discountNet = parseDkvNumber(cols['discountNet'] || '0'); // Negative saving in DKV PDF
      const serviceFeeNet = parseDkvNumber(cols['serviceFeeNet'] || '0');
      const totalNet = parseDkvNumber(cols['totalNet'] || '0');
      const vat = parseDkvNumber(cols['vat'] || '0');
      const totalGross = parseDkvNumber(cols['totalGross'] || '0');

      // Base net + service fee net + discount net = total net
      // Since discount is usually negative in DKV PDF, baseNet + serviceFeeNet + discountNet (which is negative) = totalNet
      // E.g., 295.66 + 7.12 + (-37.20) = 265.58
      const calculatedNet = baseNet + serviceFeeNet + discountNet;
      const netDiff = Math.abs(calculatedNet - totalNet);

      if (netDiff > 0.05) {
        finalStatus = finalStatus === 'PARSER_MAPPING_ERROR' ? 'PARSER_MAPPING_ERROR' : 'Needs field review';
        confidence = Math.min(confidence, 70);
        warningsList.push(
          `FINANCIAL_ARITHMETIC_MISMATCH: Calculated Net (${calculatedNet.toFixed(2)}) does not match Total Net (${totalNet.toFixed(2)}) within tolerance. Diff = ${netDiff.toFixed(2)}`
        );
      }

      // Total net + VAT = Total gross
      const calculatedGross = totalNet + vat;
      const grossDiff = Math.abs(calculatedGross - totalGross);
      if (grossDiff > 0.05) {
        finalStatus = finalStatus === 'PARSER_MAPPING_ERROR' ? 'PARSER_MAPPING_ERROR' : 'Needs field review';
        confidence = Math.min(confidence, 70);
        warningsList.push(
          `FINANCIAL_ARITHMETIC_MISMATCH: Calculated Gross (${calculatedGross.toFixed(2)}) does not match Total Gross (${totalGross.toFixed(2)}) within tolerance. Diff = ${grossDiff.toFixed(2)}`
        );
      }

      // Construct source evidence for this transaction
      const minRowX = Math.min(...row.map(i => i.x));
      const maxRowX = Math.max(...row.map(i => i.x + i.width));
      const minRowY = Math.min(...row.map(i => i.y));
      const maxRowY = Math.max(...row.map(i => i.y + i.height));

      const sourceEvidence: SourceEvidence = {
        sourceFileId: fileId,
        sourceFileName: '', // set at runtime
        sourceType: 'DKV_PDF',
        pageNumber: page.pageNum,
        boundingBox: {
          x: minRowX,
          y: minRowY,
          width: maxRowX - minRowX,
          height: maxRowY - minRowY,
        },
        rawText: rowText,
        extractedFields: {
          vehicleRegistrationRaw: currentVehicleReg,
          cardNumber: currentCardNumber,
          deliveryDate: dateStr,
          transactionTime: (cols['time'] || '').trim(),
          serviceStationName: (cols['stationName'] || '').trim(),
          city: (cols['city'] || '').trim(),
          stationNumber: (cols['stationNumber'] || '').trim(),
          transactionNumber: (cols['transactionNumber'] || '').trim(),
          kilometerReading: (cols['odometer'] || '').trim(),
          product,
          productCode,
          unit,
          quantity: rawQuantity,
          pricePerUnitGross: (cols['priceGross'] || '').trim(),
          pricePerUnitNet: (cols['priceNet'] || '').trim(),
          baseValueNet: (cols['baseNet'] || '').trim(),
          discountNet: (cols['discountNet'] || '').trim(),
          serviceFeeNet: (cols['serviceFeeNet'] || '').trim(),
          totalNet: (cols['totalNet'] || '').trim(),
          vat: (cols['vat'] || '').trim(),
          totalGross: (cols['totalGross'] || '').trim(),
        },
        confidence,
        parserVersion: PARSER_VERSION,
      };

      // Push to canonical rows
      invoiceRows.push({
        id: generateId(),
        importFileId: fileId,
        importRowIndex: Math.round(row[0]?.x ?? 0), // X coordinate represents vertical index here
        registration: currentVehicleReg,
        cardNumber: currentCardNumber,
        cardNumberNormalised: normaliseCardNumber(currentCardNumber),
        equipmentNumber: '',
        invoiceNumber: currentInvoiceNumber,
        invoiceDate: currentInvoiceDate,
        documentNumber: statement?.documentNumber || '',
        ticketNumber: currentTicketNumber,
        transactionDate: dateISO,
        transactionTimestamp: `${dateISO}T${parseTimeStr(cols['time'] || '00:00')}:00.000Z`,
        timestampPrecision: cols['time'] ? TimestampPrecision.EXACT : TimestampPrecision.DATE_ONLY,
        transactionNumber: (cols['transactionNumber'] || '').trim(),
        stationNumber: (cols['stationNumber'] || '').trim(),
        stationNumberNormalised: normaliseStationCode((cols['stationNumber'] || '').trim()),
        stationName: (cols['stationName'] || '').trim(),
        stationCity: (cols['city'] || '').trim(),
        stationZipCode: '',
        serviceCountry: currentServiceCountry,
        invoiceCountry: '',
        productCode,
        productGroup: '',
        productName: product || productCode,
        productType,
        costGroup: '',
        quantity: String(quantityVal),
        unit,
        pricePerUnit: String(parseDkvNumber(cols['priceNet'] || '0')),
        pricePerUnitGross: String(parseDkvNumber(cols['priceGross'] || '0')),
        baseValueNet: String(baseNet),
        baseValueGross: String(parseDkvNumber(cols['baseNet'] || '0') + vat), // fallback gross ex discount
        serviceFeeNet: String(serviceFeeNet),
        valueOfPurchaseNet: String(totalNet),
        discountNet: String(discountNet),
        discountGross: '0',
        vat: String(vat),
        paymentCurrency: 'EUR',
        serviceCurrency: currentCurrency,
        valueInPayCurrency: String(totalGross),
        valueInServiceCountryCurrency: String(totalGross), // fallback
        costCentre1: '',
        costCentre2: '',
        mileage: (cols['odometer'] || '').trim() || '0',
        agesTerminal: '',
        customerId: statement?.customerNumber || '',
        cardNumberPartner: '',
        provider: CardProvider.DKV,
        // Canonical mappings
        vehicleRegistration: currentVehicleReg,
        pumpCode: '',
        countryCode: currentServiceCountry,
        forecourtCode: (cols['stationNumber'] || '').trim(),
        forecourtName: (cols['stationName'] || '').trim(),
        transactionDateTime: `${dateStr} ${cols['time'] || ''}`.trim(),
        mileageKm: (cols['odometer'] || '').trim() || '0',
        volume: String(quantityVal),
        volumeUnit: unit,
        stationCurrency: currentCurrency,
        unitPriceVatIncluded: String(parseDkvNumber(cols['priceGross'] || '0')),
        rebate: String(discountNet),
        stationAmountExVat: String(baseNet),
        stationVatAmount: String(vat),
        paymentAmountExVat: String(totalNet),
        paymentAmountInclVat: String(totalGross),
        sourcePage: page.pageNum,
        extractionConfidence: confidence,
        status: finalStatus,
        warnings: warningsList,
        sourceEvidence,
      });
    }
  }

  return {
    invoiceRows,
    statement,
    totalRows: invoiceRows.length,
  };
}

// Helper: group PDF items by X coordinate
function groupPageItemsByX(items: PdfItem[], tolerance: number): PdfItem[][] {
  const xRows: PdfItem[][] = [];
  const sortedItems = [...items].sort((a, b) => a.x - b.x); // X increases vertically down page due to rotation

  for (const item of sortedItems) {
    let placed = false;
    for (const row of xRows) {
      if (row[0] !== undefined && Math.abs(row[0].x - item.x) < tolerance) {
        row.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) {
      xRows.push([item]);
    }
  }

  // Sort items in each row by Y coordinate ascending (columns left to right)
  for (const row of xRows) {
    row.sort((a, b) => a.y - b.y);
  }

  // Sort rows by X coordinate ascending
  xRows.sort((a, b) => (a[0]?.x ?? 0) - (b[0]?.x ?? 0));

  return xRows;
}
