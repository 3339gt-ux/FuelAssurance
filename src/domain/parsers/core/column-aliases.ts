/**
 * Column Alias Registry
 *
 * Versioned heading aliases for each provider/document type.
 * Used by schema discovery to match source columns to canonical fields.
 * Includes known misspellings observed in real files.
 */

// ─── DKV Transaction Aliases ───────────────────────────────────────────────────

export const DKV_TRANSACTION_ALIASES = new Map<string, string[]>([
  ['licencePlate', ['Licence plate', 'License plate', 'Licence Plate', 'Reg', 'Registration', 'Vehicle Reg', 'Kennzeichen']],
  ['authorisationTime', ['Authorization Time', 'Authorisation Time', 'Auth Time', 'Transaction Time', 'Date/Time']],
  ['sales', ['Sales', 'Volume', 'Qty', 'Quantity']],
  ['costGroup', ['Cost group', 'Cost Group', 'Kostengruppe']],
  ['productGroup', ['Product group', 'Product Group', 'Produktgruppe']],
  ['product', ['Product', 'Produkt']],
  ['productCode', ['Product code', 'Product Code', 'Produktcode']],
  ['authorisationAmountGross', ['Authorization Amount Gross', 'Authorisation Amount Gross', 'Auth Amount', 'Amount Gross', 'Brutto']],
  ['serviceCountry', ['Service country', 'Service Country', 'Country', 'Land']],
  ['mileage', ['Mileage', 'KM', 'Km stand', 'Odometer']],
  ['cardOrBoxNumber', ['Number of card or box', 'Card Number', 'Card/Box Number', 'Kartennummer']],
  ['response', ['Response', 'Status', 'Auth Response', 'Antwort']],
  // Variant 2 extras
  ['customerId', ['Customer ID', 'Customer Id', 'Kunden-ID']],
  ['costCentre', ['Cost center', 'Cost Centre', 'Kostenstelle']],
  ['cardAddition', ['Card addition', 'Card Addition', 'Kartenzusatz']],
  ['stationNumber', ['Station number', 'Station Number', 'Station No', 'Stationsnummer']],
  ['stationName', ['Station name', 'Station Name', 'Stationsname']],
  ['town', ['Town', 'City', 'Ort']],
  ['stationCategory', ['Station category', 'Station Category', 'Stationskategorie']],
  ['unit', ['Unit', 'Einheit']],
  ['authorisationId', ['Authorization ID', 'Authorisation ID', 'Auth ID', 'Authorization Id']],
]);

// ─── DKV Invoice Aliases ───────────────────────────────────────────────────────

export const DKV_INVOICE_ALIASES = new Map<string, string[]>([
  ['transactionTime', ['Transaction time', 'Transaction Time', 'Trans Time', 'Transaktionszeit']],
  ['stationName', ['Station name', 'Station Name', 'Stationsname']],
  ['stationCity', ['Station city', 'Station City', 'Stadt']],
  ['stationNumber', ['Station number', 'Station Number', 'Stationsnummer']],
  ['transactionNumber', ['Transaction number', 'Transaction Number', 'Trans No', 'Transaktionsnummer']],
  ['serviceCountry', ['Service country', 'Service Country', 'Land']],
  ['costGroup', ['Cost group', 'Cost Group']],
  ['productGroup', ['Product group', 'Product Group']],
  ['product', ['Product', 'Produkt']],
  ['productCode', ['Product code', 'Product Code']],
  ['paymentCurrency', ['Payment currency', 'Payment Currency', 'Zahlungswährung']],
  ['unit', ['Unit', 'Einheit']],
  ['quantity', ['Quantity', 'Qty', 'Menge']],
  ['pricePerUnit', ['Price per unit', 'Price Per Unit', 'Unit Price', 'Preis pro Einheit']],
  ['baseValueNet', ['Base Value Net', 'Base value net', 'Basiswert netto']],
  ['serviceFeeNet', ['Service fee net', 'Service Fee Net', 'Servicegebühr netto']],
  ['valueOfPurchaseNet', ['Value of purchase net', 'Value Of Purchase Net', 'Einkaufswert netto']],
  ['serviceCurrency', ['Service currency', 'Service Currency', 'Servicewährung']],
  ['valueInPayCurrency', ['Value in pay currency', 'Value In Pay Currency']],
  ['valueInServiceCountryCurrency', ['Value in currency of service country', 'Value In Currency Of Service Country']],
  ['vat', ['VAT', 'Vat', 'MwSt']],
  ['pricePerUnitGross', ['Price per unit gross', 'Price Per Unit Gross']],
  ['discountNet', ['Discount net', 'Discount Net', 'Rabatt netto']],
  ['licencePlate', ['Licence plate', 'License plate', 'Kennzeichen']],
  ['cardBoxNo', ['Card/Box No.', 'Card/Box No', 'Card Box No', 'Karten-/Boxnr.']],
  ['cardBoxNoPartner', ['Card/Box No. (Partner)', 'Card/Box No (Partner)', 'Partner Card']],
  ['invoiceDate', ['Invoice date', 'Invoice Date', 'Rechnungsdatum']],
  ['documentNumber', ['Document number', 'Document Number', 'Dokumentnummer']],
  ['invoiceNumber', ['Invoice number', 'Invoice Number', 'Rechnungsnummer']],
  ['ticketNumberDKV', ['Ticket Number DKV', 'Ticket number DKV', 'DKV Ticket']],
  ['stationZipCode', ['Station zip code', 'Station Zip Code', 'PLZ']],
  ['baseValueGross', ['Base Value Gross', 'Base value gross', 'Basiswert brutto']],
  ['costCentre1', ['Cost center 1', 'Cost Centre 1', 'Kostenstelle 1']],
  ['costCentre2', ['Cost center 2', 'Cost Centre 2', 'Kostenstelle 2']],
  ['invoiceCountry', ['Invoice country', 'Invoice Country', 'Rechnungsland']],
  ['mileage', ['Mileage', 'KM', 'Kilometerstand']],
  ['discountGross', ['Discount gross', 'Discount Gross', 'Rabatt brutto']],
  ['agesTerminal', ['Ages terminal', 'Ages Terminal', 'AGES Terminal']],
  ['customerId', ['Customer ID', 'Customer Id', 'Kunden-ID']],
  ['equipmentNumber', ['Equipment number', 'Equipment Number', 'Equipmentnummer']],
]);

// ─── GPS / Telematics Aliases ──────────────────────────────────────────────────

export const GPS_ALIASES = new Map<string, string[]>([
  ['vehicle', ['Vehicle', 'Fahrzeug', 'Reg', 'Registration']],
  ['trailer', ['Trailer', 'Anhänger']],
  ['createdDate', ['Created date', 'Created Date', 'Date', 'Timestamp', 'Datum']],
  ['dataSource', ['Data source', 'Data Source', 'Source', 'Quelle']],
  ['fuelLevel', ['Fuel level', 'Fuel Level', 'Fuel %', 'Tank Level', 'Kraftstoffstand']],
  ['km', ['KM', 'Km', 'Odometer', 'Mileage', 'Distance', 'Kilometerstand']],
  ['speed', ['Speed', 'Geschwindigkeit', 'km/h']],
  ['driver', ['Driver', 'Fahrer']],
  ['activity', ['Activity / Registration', 'Activity', 'Status', 'Aktivität']],
  ['info', ['Info', 'Information', 'Details']],
  ['positionFromCity', ['Position from city', 'City', 'Stadt']],
  ['positionFromTown', ['Position from town', 'Town', 'Ort']],
  ['positionFromStreet', ['Position from street', 'Street', 'Straße']],
  ['positionFromVillage', ['Position from village', 'Village', 'Dorf']],
  ['positionFromAddress', ['Position from address', 'Address', 'Adresse', 'POI']],
]);

// ─── Station Workbook Aliases ──────────────────────────────────────────────────

export const STATION_YARD_DKV_ALIASES = new Map<string, string[]>([
  ['country', ['Country', 'Land', 'Full Country Name']],
  ['pump', ['PUMP', 'Pump', 'Brand', 'Network']],
  ['stationCode', ['CODE (DKV APP)', 'Code', 'DKV Code', 'Station Code', 'CODE']],
  ['city', ['CITY / AREA', 'City', 'Area', 'Stadt', 'City/Area']],
  ['url', ['↓ CLICK FOR LOCATION ↓', 'Location', 'URL', 'Link', 'Google Maps']],
  ['address', ['ADDRESS', 'Address', 'Adresse']],
  ['postCode', ['POST CODE', 'Postcode', 'Post Code', 'ZIP', 'PLZ']],
  // Note: real file has misspellings LATTITUDE and LONGTITUDE
  ['latitude', ['LATTITUDE', 'LATITUDE', 'Latitude', 'Lat', 'Breitengrad']],
  ['longitude', ['LONGTITUDE', 'LONGITUDE', 'Longitude', 'Long', 'Lng', 'Längengrad']],
  ['cost', ['COST', 'Cost', 'Price', 'Net Cost', 'Preis']],
  ['serviceFeePercent', ['SERVICE FEE 1%', 'Service Fee', 'Service Fee %', 'Fee']],
  ['discount', ['DISCOUNT', 'Discount', 'Rabatt']],
  ['exciseDutyRebate', ['EXCISE DUTY REBATE', 'Excise Duty', 'Rebate', 'Verbrauchsteuer']],
]);

export const STATION_AS24_ALIASES = new Map<string, string[]>([
  ['country', ['Full Country Name', 'Country', 'Land']],
  ['address', ['Address', 'Adresse', 'City']],
  ['product', ['Product', 'Produkt']],
  ['stationCode', ['AS24 Station Code', 'Station Code', 'Code']],
  ['stationName', ['Station Name', 'Name', 'Stationsname']],
  ['postCode', ['Postcode', 'Post Code', 'ZIP', 'PLZ']],
  ['applicationDate', ['Date of Application', 'Date', 'Effective Date', 'Datum']],
  ['netCostEurPerLitre', ['Net Cost (EUR/L)', 'Net Cost', 'Price', 'Cost EUR/L']],
]);

/**
 * Find the best matching canonical field for a given header.
 */
export function findBestMatch(
  header: string,
  aliases: Map<string, string[]>
): { field: string; confidence: number } | null {
  const headerLower = header.toLowerCase().replace(/[\s_\-]+/g, '').replace(/[()/.]/g, '');
  if (!headerLower) return null;

  let bestField: string | null = null;
  let bestConf = 0;

  for (const [field, aliasList] of Array.from(aliases.entries())) {
    for (const alias of aliasList) {
      const aliasLower = alias.toLowerCase().replace(/[\s_\-]+/g, '').replace(/[()/.]/g, '');

      if (headerLower === aliasLower) {
        return { field, confidence: 1.0 };
      }

      if (headerLower.includes(aliasLower) || aliasLower.includes(headerLower)) {
        const conf =
          Math.min(headerLower.length, aliasLower.length) /
          Math.max(headerLower.length, aliasLower.length);
        if (conf > bestConf) {
          bestConf = conf;
          bestField = field;
        }
      }
    }
  }

  return bestField && bestConf >= 0.5 ? { field: bestField, confidence: bestConf } : null;
}
