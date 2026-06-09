import { describe, it, expect } from 'vitest';
import { normalizeRegistration, isFleetVehicle } from '../../src/config/fleet-registry';

describe('Fleet Registration Normalization Tests', () => {
  const variations = [
    '252MH1715',
    '252 MH 1715',
    '252-MH-1715',
    'IE-252MH1715',
    'IE- 252 MH 1715',
    'ie 252mh1715'
  ];

  it('should normalize all variations of 252MH1715 to the canonical form', () => {
    for (const variation of variations) {
      const normalized = normalizeRegistration(variation);
      expect(normalized).toBe('252MH1715');
      expect(isFleetVehicle(variation)).toBe(true);
    }
  });

  it('should not strip IE if the remaining string is not a valid fleet vehicle', () => {
    // IE-1234567 is not in fleet
    expect(normalizeRegistration('IE-1234567')).toBe('IE1234567');
    expect(isFleetVehicle('IE-1234567')).toBe(false);
  });

  it('should return empty string for empty inputs', () => {
    expect(normalizeRegistration('')).toBe('');
  });
});
