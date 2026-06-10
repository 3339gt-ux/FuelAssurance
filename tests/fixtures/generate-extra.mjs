import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));

const v2Headers = [
  'Licence plate', 'Authorization Time', 'Sales', 'Cost group', 'Product group', 'Product',
  'Product code', 'Authorization Amount Gross', 'Service country', 'Mileage',
  'Number of card or box', 'Response', 'Customer ID', 'Cost center', 'Card addition',
  'Station number', 'Station name', 'Town', 'Station category', 'Unit', 'Authorization ID',
];
const v2Rows = [
  v2Headers,
  ['241MH2362', 45474.5, 120.5, 'Fuel', 'Diesel', 'Diesel', 'WA0009', 185.42, 'IE', 125000, '700123', 'APP', 'CUST1', 'CC1', '', '12345', 'Test Station', 'Dublin', 'Highway', 'L', 'AUTH001'],
];
const wb2 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet(v2Rows), 'Sheet1');
XLSX.writeFile(wb2, path.join(dir, 'synthetic-dkv-daily-v2.xlsx'));

const yardHeaders = ['Country', 'PUMP', 'CODE (DKV APP)', 'CITY / AREA', 'ADDRESS', 'POST CODE', 'LATTITUDE', 'LONGTITUDE', 'COST', 'SERVICE FEE 1%', 'DISCOUNT', 'EXCISE DUTY REBATE'];
const yardRows = [yardHeaders, ['Ireland', 'DKV', 'DKV001', 'Dublin', '1 Test St', 'D01', '53.3498', '-6.2603', '1.45', '1', '0.05', '0']];
const dieselHeaders = ['Full Country Name', 'Address', 'Product', 'AS24 Station Code', 'Station Name', 'Postcode', 'Date of Application', 'Net Cost (EUR/L)'];
const dieselRows = [dieselHeaders, ['Ireland', 'Dublin Port', 'Diesel', 'AS24001', 'Test AS24', 'D01', '2026-01-01', '1.50']];
const wbSt = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbSt, XLSX.utils.aoa_to_sheet(yardRows), 'YARD_DKV');
XLSX.utils.book_append_sheet(wbSt, XLSX.utils.aoa_to_sheet(dieselRows), 'DIESEL_AS24');
XLSX.utils.book_append_sheet(wbSt, XLSX.utils.aoa_to_sheet(dieselRows), 'RED_DIESEL_AS24');
XLSX.writeFile(wbSt, path.join(dir, 'synthetic-station-workbook.xlsx'));

console.log('Generated extra fixtures');