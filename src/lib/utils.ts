import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes with conflict resolution
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number as currency
 */
export function formatCurrency(
  value: number,
  currency = 'EUR',
  locale = 'en-IE'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format a number with fixed decimals
 */
export function formatNumber(
  value: number,
  decimals = 2,
  locale = 'en-IE'
): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format a date for display
 */
export function formatDate(
  date: Date | string,
  style: 'short' | 'medium' | 'long' = 'medium'
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const options: Intl.DateTimeFormatOptions =
    style === 'short'
      ? { day: '2-digit', month: '2-digit', year: 'numeric' }
      : style === 'medium'
        ? { day: 'numeric', month: 'short', year: 'numeric' }
        : { day: 'numeric', month: 'long', year: 'numeric' };
  return d.toLocaleDateString('en-IE', options);
}

/**
 * Format a date-time for display
 */
export function formatDateTime(
  date: Date | string,
  includeSeconds = false
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
  };
  return d.toLocaleDateString('en-IE', options);
}

/**
 * Convert Excel serial date to JS Date.
 * Excel's epoch is 1900-01-01 with the Lotus 1-2-3 leap year bug.
 */
export function excelDateToJSDate(serial: number): Date {
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  const fractionalDay = serial - Math.floor(serial);
  const totalSeconds = Math.round(fractionalDay * 86400);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const date = new Date(0);
  date.setUTCSeconds(utcValue);
  date.setUTCHours(hours, minutes, seconds);
  return date;
}

/**
 * Generate a stable hash for a file (using Web Crypto API compatible approach)
 */
export async function fileHash(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Truncate text to a given length with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}

/**
 * Safe percentage calculation
 */
export function percentage(part: number, total: number): number {
  if (total === 0) return 0;
  return (part / total) * 100;
}

/**
 * Normalise a station code by stripping common prefixes and leading zeroes
 */
export function normaliseStationCode(raw: string): string {
  let code = raw.trim();
  // Strip known prefixes
  if (code.toUpperCase().startsWith('SS')) {
    code = code.slice(2);
  }
  // Strip leading zeroes but keep at least one digit
  code = code.replace(/^0+(?=\d)/, '');
  return code;
}

/**
 * Normalise a card number by preserving leading zeroes but stripping spaces
 */
export function normaliseCardNumber(raw: string): string {
  return raw.trim().replace(/\s+/g, '');
}

/**
 * Escape dangerous formula characters in spreadsheet exports
 * Prevents CSV/XLSX formula injection
 */
export function escapeFormulaInjection(value: string): string {
  const dangerous = ['=', '+', '-', '@', '\t', '\r'];
  if (dangerous.some((c) => value.startsWith(c))) {
    return `'${value}`;
  }
  return value;
}

/**
 * Generate a UUID v4
 */
export function generateId(): string {
  return crypto.randomUUID();
}
