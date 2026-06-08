/**
 * Card / Equipment Identity Management
 *
 * Resolves cards by normalised core with date awareness.
 * Equipment number is the preferred core identifier.
 */

import { type Card, type CardAlias, CardProvider } from '@/domain/types';
import { normaliseCardNumber, generateId } from '@/lib/utils';

/**
 * Normalise a card number to its core form.
 * Strips provider prefixes and normalises format.
 */
export function normaliseCardCore(raw: string): string {
  return normaliseCardNumber(raw);
}

/**
 * Resolve a card by raw number at a specific date.
 */
export function resolveCard(
  rawNumber: string,
  date: Date,
  knownCards: Card[]
): Card | null {
  if (!rawNumber) return null;
  const core = normaliseCardCore(rawNumber);

  // Direct match on normalised core
  for (const c of knownCards) {
    if (c.normalisedCore === core) return c;
    if (c.equipmentNumber && c.equipmentNumber === rawNumber) return c;
  }

  // Alias match with effective date range
  for (const c of knownCards) {
    for (const alias of c.aliases) {
      const aliasCore = normaliseCardCore(alias.rawNumber);
      if (aliasCore !== core) continue;

      const from = new Date(alias.effectiveFrom);
      const to = alias.effectiveTo ? new Date(alias.effectiveTo) : new Date('2099-12-31');
      if (date >= from && date <= to) {
        return c;
      }
    }
  }

  return null;
}

/**
 * Create a new card record.
 */
export function createCard(rawNumber: string, provider: string): Card {
  const prov = provider.toUpperCase() === 'AS24' ? CardProvider.AS24 :
    provider.toUpperCase() === 'DKV' ? CardProvider.DKV : CardProvider.UNKNOWN;

  return {
    id: generateId(),
    rawNumber,
    normalisedCore: normaliseCardCore(rawNumber),
    provider: prov,
    aliases: [],
    equipmentNumber: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Add an alias to a card. Returns a new Card with the alias appended.
 */
export function addCardAlias(card: Card, alias: CardAlias): Card {
  return {
    ...card,
    aliases: [...card.aliases, alias],
    updatedAt: new Date().toISOString(),
  };
}
