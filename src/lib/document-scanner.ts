import * as XLSX from 'xlsx';
import pdf from 'pdf-parse';
import { isFleetVehicle, normalizeRegistration } from '@/config/fleet-registry';

export interface ScannedRegistration {
  raw: string;
  normalized: string;
  source: string; // e.g., "Page 1" or "Sheet 'Transactions', Row 4"
}

export interface ScanResult {
  fleetVehicles: ScannedRegistration[];
  nonFleetVehicles: ScannedRegistration[];
}

export async function scanDocumentForRegistrations(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ScanResult> {
  const fleetVehicles: ScannedRegistration[] = [];
  const nonFleetVehicles: ScannedRegistration[] = [];
  const seenFleet = new Set<string>();
  const seenNonFleet = new Set<string>();

  const isPDF = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');

  // Regex for general Irish registrations (starts with optional IE prefix, 3 digits, 1-2 letters, 1-6 digits)
  const REG_REGEX = /\b(?:IE\s*-?\s*)?(\d{3})\s*-?\s*([A-Z]{1,2})\s*-?\s*(\d{1,6})\b/gi;

  const processText = (text: string, source: string) => {
    if (!text) return;
    let match;
    // Reset regex lastIndex
    REG_REGEX.lastIndex = 0;
    while ((match = REG_REGEX.exec(text)) !== null) {
      const raw = match[0];
      const normalized = normalizeRegistration(raw);
      
      // Secondary check: ensure the normalized form conforms to (optional IE) + 3 digits + 1-2 letters + 1-6 digits
      if (/^(?:IE)?\d{3}[A-Z]{1,2}\d{1,6}$/.test(normalized)) {
        const key = `${normalized}|${source}`;
        if (isFleetVehicle(normalized)) {
          if (!seenFleet.has(key)) {
            seenFleet.add(key);
            fleetVehicles.push({ raw, normalized, source });
          }
        } else {
          if (!seenNonFleet.has(key)) {
            seenNonFleet.add(key);
            nonFleetVehicles.push({ raw, normalized, source });
          }
        }
      }
    }
  };

  if (isPDF) {
    // Parse PDF page-by-page
    const pages: string[] = [];
    const options = {
      pagerender: (pageData: any) => {
        return pageData.getTextContent().then((textContent: any) => {
          let lastY, text = '';
          for (const item of textContent.items) {
            if (lastY === item.transform[5] || !lastY) {
              text += item.str;
            } else {
              text += '\n' + item.str;
            }
            lastY = item.transform[5];
          }
          pages.push(text);
          return text;
        });
      }
    };

    try {
      await pdf(buffer, options);
      pages.forEach((pageText, index) => {
        processText(pageText, `Page ${index + 1}`);
      });
    } catch (err) {
      console.error('Error scanning PDF for registrations:', err);
    }
  } else {
    // Parse XLSX / XLS Spreadsheet
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;
        const rawJsonRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
        rawJsonRows.forEach((row, rowIndex) => {
          if (!row || !Array.isArray(row)) return;
          const rowText = row.map(cell => (cell === null || cell === undefined) ? '' : String(cell)).join(' ');
          processText(rowText, `Sheet '${sheetName}', Row ${rowIndex + 1}`);
        });
      }
    } catch (err) {
      console.error('Error scanning spreadsheet for registrations:', err);
    }
  }

  return { fleetVehicles, nonFleetVehicles };
}
