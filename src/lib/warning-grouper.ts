export type WarningLevel = 'blocking' | 'review' | 'informational';

export interface GroupedWarning {
  code: string;
  level: WarningLevel;
  message: string;
  count: number;
  productType?: string | undefined;
  examples: string[];
}

const LEVEL_BY_CODE_PREFIX: Record<string, WarningLevel> = {
  FINANCIAL_VALIDATION_ERROR: 'review',
  PHYSICAL_LIMIT_EXCEEDED: 'review',
  FIELD_MAPPING_UNCERTAIN: 'review',
  NON_FLEET_REGISTRATION: 'review',
  TOLL_NET_NOT_PROVIDED: 'informational',
  OPTIONAL_FIELD_ABSENT: 'informational',
  COORDINATES_UNAVAILABLE: 'informational',
  CONTROL_TOTAL_FAILURE: 'review',
  PARSER_MAPPING_ERROR: 'blocking',
};

function parseWarningCode(raw: string): string {
  const colon = raw.indexOf(':');
  return colon !== -1 ? raw.slice(0, colon).trim() : raw.trim();
}

function inferLevel(code: string, raw: string): WarningLevel {
  if (LEVEL_BY_CODE_PREFIX[code]) return LEVEL_BY_CODE_PREFIX[code]!;
  if (raw.toLowerCase().includes('toll') && raw.toLowerCase().includes('net')) {
    return 'informational';
  }
  if (raw.toLowerCase().includes('blocking') || raw.toLowerCase().includes('cannot be parsed')) {
    return 'blocking';
  }
  return 'review';
}

export function groupWarnings(
  rawWarnings: string[],
  productTypeByCode?: Record<string, string>
): {
  blocking: GroupedWarning[];
  review: GroupedWarning[];
  informational: GroupedWarning[];
  totalRaw: number;
  totalGrouped: number;
} {
  const map = new Map<string, GroupedWarning>();

  for (const raw of rawWarnings) {
    const code = parseWarningCode(raw);
    const level = inferLevel(code, raw);
    const key = `${level}|${code}`;
    const existing = map.get(key);
    if (existing) {
      existing.count++;
      if (existing.examples.length < 3) existing.examples.push(raw);
    } else {
      map.set(key, {
        code,
        level,
        message: raw.includes(':') ? raw.slice(raw.indexOf(':') + 1).trim() : raw,
        count: 1,
        productType: productTypeByCode?.[code],
        examples: [raw],
      });
    }
  }

  const grouped = Array.from(map.values());
  return {
    blocking: grouped.filter((g) => g.level === 'blocking'),
    review: grouped.filter((g) => g.level === 'review'),
    informational: grouped.filter((g) => g.level === 'informational'),
    totalRaw: rawWarnings.length,
    totalGrouped: grouped.length,
  };
}

export function buildSimpleModeWarningSummary(rawWarnings: string[]): {
  hasActionable: boolean;
  headline: string;
  grouped: ReturnType<typeof groupWarnings>;
} {
  const grouped = groupWarnings(rawWarnings);
  const actionable = grouped.blocking.length + grouped.review.length;
  const hiddenInfo = grouped.informational.reduce((s, g) => s + g.count, 0);

  let headline = '';
  if (actionable === 0 && hiddenInfo === 0) {
    headline = '';
  } else if (actionable === 0) {
    headline = `${hiddenInfo} informational note${hiddenInfo === 1 ? '' : 's'} hidden`;
  } else if (hiddenInfo === 0) {
    headline = `${actionable} item${actionable === 1 ? '' : 's'} require review`;
  } else {
    headline = `${actionable} item${actionable === 1 ? '' : 's'} require review · ${hiddenInfo} informational note${hiddenInfo === 1 ? '' : 's'} hidden`;
  }

  return {
    hasActionable: actionable > 0 || hiddenInfo > 0,
    headline,
    grouped,
  };
}