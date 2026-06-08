/**
 * Vehicle Identity Management
 *
 * Resolves vehicles by registration with effective-date awareness.
 * Supports aliases for re-registrations.
 */

import { type Vehicle, type VehicleAlias } from '@/domain/types';
import { generateId } from '@/lib/utils';

/**
 * Resolve a vehicle by registration at a specific date.
 */
export function resolveVehicle(
  registration: string,
  date: Date,
  knownVehicles: Vehicle[]
): Vehicle | null {
  if (!registration) return null;
  const normalised = registration.toUpperCase().replace(/[\s\-]+/g, '');

  // Direct match on primary registration
  for (const v of knownVehicles) {
    if (v.primaryRegistration.toUpperCase().replace(/[\s\-]+/g, '') === normalised) {
      return v;
    }
  }

  // Alias match with effective date range
  for (const v of knownVehicles) {
    for (const alias of v.aliases) {
      const aliasNorm = alias.registration.toUpperCase().replace(/[\s\-]+/g, '');
      if (aliasNorm !== normalised) continue;

      const from = new Date(alias.effectiveFrom);
      const to = alias.effectiveTo ? new Date(alias.effectiveTo) : new Date('2099-12-31');
      if (date >= from && date <= to) {
        return v;
      }
    }
  }

  return null;
}

/**
 * Create a new vehicle record.
 */
export function createVehicle(registration: string): Vehicle {
  return {
    id: generateId(),
    primaryRegistration: registration.toUpperCase().replace(/[\s\-]+/g, ''),
    aliases: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Add an alias to a vehicle. Returns a new Vehicle with the alias appended.
 */
export function addAlias(vehicle: Vehicle, alias: VehicleAlias): Vehicle {
  return {
    ...vehicle,
    aliases: [...vehicle.aliases, alias],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Get the active registration for a vehicle at a specific date.
 */
export function getRegistrationAtDate(vehicle: Vehicle, date: Date): string {
  // Check aliases in reverse chronological order
  const sortedAliases = [...vehicle.aliases].sort(
    (a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime()
  );

  for (const alias of sortedAliases) {
    const from = new Date(alias.effectiveFrom);
    const to = alias.effectiveTo ? new Date(alias.effectiveTo) : new Date('2099-12-31');
    if (date >= from && date <= to) {
      return alias.registration;
    }
  }

  return vehicle.primaryRegistration;
}
