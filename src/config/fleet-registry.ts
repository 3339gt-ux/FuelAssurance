export interface FleetVehicle {
  registration: string;
  normalized: string;
  make: string;
  model: string;
  active: boolean;
}

export const FLEET_VEHICLES: FleetVehicle[] = [
  { registration: '241MH1606', normalized: '241MH1606', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '241MH1607', normalized: '241MH1607', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '241MH236', normalized: '241MH236', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '241MH238', normalized: '241MH238', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '241MH240', normalized: '241MH240', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '241MH243', normalized: '241MH243', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '241MH244', normalized: '241MH244', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '241MH248', normalized: '241MH248', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '241MH249', normalized: '241MH249', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '241MH250', normalized: '241MH250', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '241MH252', normalized: '241MH252', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '241MH253', normalized: '241MH253', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '241MH255', normalized: '241MH255', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '241MH258', normalized: '241MH258', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '241MH259', normalized: '241MH259', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '241MH260', normalized: '241MH260', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '241MH261', normalized: '241MH261', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '241MH263', normalized: '241MH263', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '241MH264', normalized: '241MH264', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '241MH267', normalized: '241MH267', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '241MH269', normalized: '241MH269', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '241MH270', normalized: '241MH270', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '241MH272', normalized: '241MH272', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '241MH276', normalized: '241MH276', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH1070', normalized: '252MH1070', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH1311', normalized: '252MH1311', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH1453', normalized: '252MH1453', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH1454', normalized: '252MH1454', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH1455', normalized: '252MH1455', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH1456', normalized: '252MH1456', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH1457', normalized: '252MH1457', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH1458', normalized: '252MH1458', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH1459', normalized: '252MH1459', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH1712', normalized: '252MH1712', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH1713', normalized: '252MH1713', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH1714', normalized: '252MH1714', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH1715', normalized: '252MH1715', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH1716', normalized: '252MH1716', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH1717', normalized: '252MH1717', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH1718', normalized: '252MH1718', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH1719', normalized: '252MH1719', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH1818', normalized: '252MH1818', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH1819', normalized: '252MH1819', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH761', normalized: '252MH761', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH762', normalized: '252MH762', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH763', normalized: '252MH763', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH764', normalized: '252MH764', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH765', normalized: '252MH765', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH766', normalized: '252MH766', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH801', normalized: '252MH801', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH802', normalized: '252MH802', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH885', normalized: '252MH885', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH887', normalized: '252MH887', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH888', normalized: '252MH888', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '252MH889', normalized: '252MH889', make: 'Mercedes', model: 'Actros', active: true },
  { registration: '261MH1765', normalized: '261MH1765', make: 'Renault', model: 'T480.18 HIGHCAB 4X2 E6 2DR AU', active: true },
];

const FLEET_SET = new Set(FLEET_VEHICLES.map(v => v.normalized));

export function normalizeRegistration(reg: string): string {
  if (!reg) return '';
  // Convert to uppercase, trim whitespace, remove all non-alphanumeric characters
  let cleaned = reg.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
  
  // Strip "IE" country prefix where the remaining is a valid fleet registration
  if (cleaned.startsWith('IE')) {
    const remaining = cleaned.slice(2);
    if (FLEET_SET.has(remaining)) {
      return remaining;
    }
  }
  return cleaned;
}

export function isFleetVehicle(reg: string): boolean {
  const norm = normalizeRegistration(reg);
  return FLEET_SET.has(norm);
}

export function getFleetVehicle(reg: string): FleetVehicle | undefined {
  const norm = normalizeRegistration(reg);
  return FLEET_VEHICLES.find(v => v.normalized === norm);
}
