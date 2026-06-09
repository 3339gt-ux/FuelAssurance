import { PARSER_VERSION_COORDINATE } from '@/domain/parsers/as24/as24-pdf-parser';

export const CURRENT_PARSER_VERSION = PARSER_VERSION_COORDINATE;

export interface CachedParseResult {
  fileHash: string;
  parserVersion: string;
  provider: string;
  documentType: string;
  fileId: string;
  rowCount: number;
  pageCount: number;
  warnings: string[];
  uploadSummary: unknown;
  gpsSummary: unknown;
  cachedAt: string;
}

const memoryCache = new Map<string, CachedParseResult>();

export function parseCacheKey(fileHash: string, parserVersion: string = CURRENT_PARSER_VERSION): string {
  return `${fileHash}:${parserVersion}`;
}

export function getCachedParse(fileHash: string, parserVersion: string = CURRENT_PARSER_VERSION): CachedParseResult | null {
  return memoryCache.get(parseCacheKey(fileHash, parserVersion)) ?? null;
}

export function setCachedParse(result: CachedParseResult): void {
  memoryCache.set(parseCacheKey(result.fileHash, result.parserVersion), result);
}

export function invalidateParseCache(fileHash?: string): void {
  if (!fileHash) {
    memoryCache.clear();
    return;
  }
  for (const key of memoryCache.keys()) {
    if (key.startsWith(`${fileHash}:`)) {
      memoryCache.delete(key);
    }
  }
}