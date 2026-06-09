/**
 * Section-aware AS24 registration extraction.
 * Never uses greedy whole-document registration regex.
 */

import { FLEET_VEHICLES, isFleetVehicle, normalizeRegistration } from '@/config/fleet-registry';

export interface CardsFillingRegistration {
  registration: string;
  followingField: string;
  odometer: string;
}

export interface PassangoRegistration {
  registration: string;
  euroclass: string;
  obuId: string;
}

const FLEET_REG_SET = new Set(FLEET_VEHICLES.map((v) => v.normalized));

/**
 * Parse registration from a Cards Filling List card/vehicle heading field.
 * Examples:
 *   "241 MH 244 0"  -> 241MH244, followingField "0"
 *   "241 MH 2440"   -> 241MH244, followingField "0"
 *   "241 MH 236261000" -> 241MH236, odometer 261000
 *   "252MH1819 0"   -> 252MH1819, followingField "0"
 */
export function parseCardsFillingRegistration(raw: string): CardsFillingRegistration {
  const normalized = raw.replace(/\xA0/g, ' ').trim();
  const compact = normalized.replace(/\s+/g, '');

  // Spaced 241 MH form
  const spaced241 = normalized.match(/^241\s+MH\s+(\d{3})(?:\s+(\S))?\s*$/i);
  if (spaced241) {
    const reg = `241MH${spaced241[1]}`;
    const tail = spaced241[2] ?? '0';
    return {
      registration: reg,
      followingField: tail,
      odometer: tail.length > 1 && tail !== '0' ? tail : '0',
    };
  }

  // Compact 241MH
  const compact241 = compact.match(/^241MH(\d+)$/i);
  if (compact241) {
    const digits = compact241[1]!;
    const reg = `241MH${digits.slice(0, 3)}`;
    const remainder = digits.slice(3);
    if (!remainder || remainder === '0') {
      return { registration: reg, followingField: remainder || '0', odometer: '0' };
    }
    if (remainder.length >= 4) {
      return { registration: reg, followingField: '0', odometer: remainder };
    }
    if (remainder.length === 1) {
      return { registration: reg, followingField: remainder, odometer: '0' };
    }
    return { registration: reg, followingField: '0', odometer: remainder };
  }

  // Spaced 252 MH form
  const spaced252 = normalized.match(/^252\s*MH\s*(\d+)(?:\s+(\S))?\s*$/i);
  if (spaced252) {
    const allDigits = spaced252[1]!.replace(/\s/g, '');
    const regLen = allDigits[0] === '1' ? 4 : 3;
    const reg = `252MH${allDigits.slice(0, regLen)}`;
    const remainder = allDigits.slice(regLen);
    const following = spaced252[2] ?? (remainder.length === 1 ? remainder : '0');
    return {
      registration: reg,
      followingField: following,
      odometer: remainder.length > 1 ? remainder : '0',
    };
  }

  // Compact 252MH
  const compact252 = compact.match(/^252MH(\d+)$/i);
  if (compact252) {
    const digits = compact252[1]!;
    const regLen = digits[0] === '1' ? 4 : 3;
    const reg = `252MH${digits.slice(0, regLen)}`;
    const remainder = digits.slice(regLen);
    if (!remainder || remainder === '0') {
      return { registration: reg, followingField: remainder || '0', odometer: '0' };
    }
    if (remainder.length === 1) {
      return { registration: reg, followingField: remainder, odometer: '0' };
    }
    return { registration: reg, followingField: '0', odometer: remainder };
  }

  // Fleet registry exact match with token boundaries on compact token
  const fleetMatch = lookupFleetRegistration(compact);
  if (fleetMatch) {
    return { registration: fleetMatch, followingField: '0', odometer: '0' };
  }

  return {
    registration: compact,
    followingField: '0',
    odometer: '0',
  };
}

/**
 * Parse PASSango registration from Registration nbr field only.
 * Stops before Euroclass digit(s).
 */
export function parsePassangoRegistration(line: string): PassangoRegistration | null {
  const normalized = line.replace(/\xA0/g, ' ').trim();
  const ieMatch = normalized.match(/IE-\s*((?:241|252)MH)/i);
  if (!ieMatch) return null;

  const prefix = ieMatch[1]!.toUpperCase();
  const afterPrefixIdx = normalized.toUpperCase().indexOf(prefix, normalized.toUpperCase().indexOf('IE-'));
  const tail = normalized.slice(afterPrefixIdx + prefix.length).replace(/\s+/g, '');

  if (!tail) return null;

  let regDigitCount: number;
  if (prefix === '241MH') {
    regDigitCount = 3;
  } else if (tail[0] === '1') {
    regDigitCount = 4;
  } else {
    regDigitCount = 3;
  }

  const regSuffix = tail.slice(0, regDigitCount);
  if (!/^\d+$/.test(regSuffix)) return null;

  const registration = `${prefix}${regSuffix}`;
  const afterReg = tail.slice(regDigitCount);
  const euroclass = afterReg[0] && /\d/.test(afterReg[0]) ? afterReg[0] : '';
  const obuId = afterReg.slice(1).match(/^(\d{10})/)?.[1] ?? '';

  return { registration, euroclass, obuId };
}

/** @deprecated Use parseCardsFillingRegistration — kept for test compatibility */
export function splitRegAndOdo(raw: string): { registration: string; odometer: string } {
  const parsed = parseCardsFillingRegistration(raw);
  return {
    registration: parsed.registration,
    odometer: parsed.odometer !== '0' ? parsed.odometer : parsed.followingField !== '0' ? parsed.followingField : '0',
  };
}

function lookupFleetRegistration(token: string): string | null {
  const upper = token.toUpperCase();
  for (const reg of FLEET_REG_SET) {
    if (upper === reg || upper.startsWith(reg)) {
      const next = upper[reg.length];
      if (next === undefined || !/\d/.test(next)) {
        return reg;
      }
    }
  }
  return null;
}

export interface ExtractedRegistration {
  raw: string;
  normalized: string;
  source: string;
  confident: boolean;
}

/**
 * Extract registrations from AS24 PDF text using section-aware rules (single pass).
 */
export function extractAS24RegistrationsFromText(text: string): ExtractedRegistration[] {
  const results: ExtractedRegistration[] = [];
  const seen = new Set<string>();
  const normalized = text.replace(/\xA0/g, ' ');

  const cardsIdx = normalized.toUpperCase().indexOf('CARDS FILLING LIST');
  const passangoIdx = normalized.toUpperCase().indexOf('PASSANGO : TRANSACTION REPORT');

  if (cardsIdx !== -1) {
    const cardsText = normalized.slice(cardsIdx, passangoIdx !== -1 ? passangoIdx : undefined);
    const headerRegex = /\*\s*([\d\-]+)\s+((?:IE-\s*)?(?:241\s+MH|252\s*MH|241MH|252MH)[^\n*]+)/gi;
    let match: RegExpExecArray | null;
    while ((match = headerRegex.exec(cardsText)) !== null) {
      const rawPart = match[2]!.trim().split('\n')[0]!.trim();
      const parsed = parseCardsFillingRegistration(rawPart);
      const norm = normalizeRegistration(parsed.registration);
      const key = `cards|${norm}`;
      if (norm && !seen.has(key)) {
        seen.add(key);
        results.push({
          raw: rawPart,
          normalized: norm,
          source: `Cards Filling heading (card ${match[1]})`,
          confident: true,
        });
      }
    }
  }

  if (passangoIdx !== -1) {
    const passText = normalized.slice(passangoIdx);
    const lines = passText.split('\n');
    for (const line of lines) {
      if (!/IE-\s*(?:241|252)MH/i.test(line)) continue;
      const parsed = parsePassangoRegistration(line);
      if (!parsed?.registration) continue;
      const norm = normalizeRegistration(parsed.registration);
      const key = `pass|${norm}`;
      if (norm && !seen.has(key)) {
        seen.add(key);
        results.push({
          raw: parsed.registration,
          normalized: norm,
          source: 'PASSango Registration nbr',
          confident: true,
        });
      }
    }
  }

  return results;
}

export function extractRegistrationsFromCanonicalRows(
  rows: Array<{ registration?: string; vehicleRegistration?: string; extractionConfidence?: number; sourcePage?: number }>
): ExtractedRegistration[] {
  const seen = new Set<string>();
  const results: ExtractedRegistration[] = [];

  for (const row of rows) {
    const raw = (row.vehicleRegistration || row.registration || '').trim();
    if (!raw) continue;
    const confidence = row.extractionConfidence ?? 100;
    if (confidence < 50) continue;

    const norm = normalizeRegistration(raw);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);

    results.push({
      raw,
      normalized: norm,
      source: row.sourcePage ? `Parsed row (page ${row.sourcePage})` : 'Parsed transaction row',
      confident: confidence >= 70,
    });
  }

  return results;
}

export function partitionFleetRegistrations(
  extracted: ExtractedRegistration[]
): { fleet: ExtractedRegistration[]; nonFleet: ExtractedRegistration[] } {
  const fleet: ExtractedRegistration[] = [];
  const nonFleet: ExtractedRegistration[] = [];

  for (const item of extracted) {
    if (!item.confident) continue;
    if (isFleetVehicle(item.normalized)) {
      fleet.push(item);
    } else {
      nonFleet.push(item);
    }
  }

  return { fleet, nonFleet };
}