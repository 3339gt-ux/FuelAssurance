import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { normaliseCardNumber, normaliseStationCode } from '@/lib/utils';

export async function GET(req: NextRequest) {
  try {
    const transactions = db.select('transactions');
    const invoices = db.select('invoice_transactions');
    const vehicles = db.select('vehicles');
    const vehicleAliases = db.select('vehicle_aliases');
    const cards = db.select('cards');
    const stations = db.select('stations');
    const stationAliases = db.select('station_aliases');

    const knownRegs = new Set([
      ...vehicles.map((v: any) => v.registration.toUpperCase().replace(/\s+/g, '')),
      ...vehicleAliases.map((a: any) => a.alias_registration.toUpperCase().replace(/\s+/g, '')),
    ]);

    const knownCards = new Set([
      ...cards.map((c: any) => normaliseCardNumber(c.card_number)),
    ]);

    const knownStations = new Set([
      ...stations.map((s: any) => s.stationCodeNormalised),
      ...stationAliases.map((a: any) => normaliseStationCode(a.alias_code)),
    ]);

    const unmappedRegs = new Set<string>();
    const unmappedCards = new Set<string>();
    const unmappedStations = new Set<string>();

    const checkItem = (reg: string, card: string, stCode: string, provider: string) => {
      const normalizedReg = (reg || '').toUpperCase().replace(/\s+/g, '');
      if (normalizedReg && !knownRegs.has(normalizedReg)) {
        unmappedRegs.add(normalizedReg);
      }
      const normalizedCard = normaliseCardNumber(card || '');
      if (normalizedCard && !knownCards.has(normalizedCard)) {
        unmappedCards.add(`${normalizedCard}|${provider}`);
      }
      const normalizedSt = normaliseStationCode(stCode || '');
      if (normalizedSt && !knownStations.has(normalizedSt)) {
        unmappedStations.add(`${normalizedSt}|${provider}`);
      }
    };

    for (const tx of transactions) {
      checkItem(tx.registration, tx.cardNumber, tx.stationNumber, tx.provider);
    }
    for (const inv of invoices) {
      checkItem(inv.registration, inv.cardNumberNormalised || inv.cardNumber, inv.stationNumber, inv.provider);
    }

    const unmappedList = [
      ...Array.from(unmappedRegs).map((reg) => ({
        id: `reg-${reg}`,
        type: 'VEHICLE',
        value: reg,
        provider: 'ANY',
        description: `Unrecognised vehicle registration: ${reg}`,
      })),
      ...Array.from(unmappedCards).map((cardInfo) => {
        const parts = cardInfo.split('|');
        const card = parts[0] || '';
        const provider = parts[1] || 'UNKNOWN';
        return {
          id: `card-${card}`,
          type: 'CARD',
          value: card,
          provider: provider,
          description: `Unrecognised fuel card: ${card} (${provider})`,
        };
      }),
      ...Array.from(unmappedStations).map((stInfo) => {
        const parts = stInfo.split('|');
        const stCode = parts[0] || '';
        const provider = parts[1] || 'UNKNOWN';
        return {
          id: `station-${stCode}`,
          type: 'STATION',
          value: stCode,
          provider: provider,
          description: `Unrecognised station code: ${stCode} (${provider})`,
        };
      }),
    ];

    return NextResponse.json(unmappedList);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
