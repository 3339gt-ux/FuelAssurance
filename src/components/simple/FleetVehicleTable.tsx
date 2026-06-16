'use client';

import React, { useMemo, useState } from 'react';
import type { UploadSummaryShape } from '@/types/upload';

type VehicleRow = UploadSummaryShape['fleetVehiclesFound'][number];

interface FleetVehicleTableProps {
  vehicles: VehicleRow[];
  showAllFleet?: boolean;
  allFleetRegistrations?: string[];
  onAttachGps?: (registration: string) => void;
}

function formatMoney(totals: Record<string, number>): string {
  const entries = Object.entries(totals);
  if (!entries.length) return '—';
  return entries.map(([curr, amt]) => `${curr} ${amt.toFixed(2)}`).join(' · ');
}

function litresFor(row: VehicleRow, key: string): string {
  const entries = Object.entries(row.fuelLitresByProduct);
  const match = entries.find(([prod]) => prod.toLowerCase().includes(key));
  if (!match) return '—';
  const val = match[1];
  return val > 0 ? `${val.toFixed(2)} L` : '—';
}

function otherCount(row: VehicleRow): string {
  const fuelCats = new Set(['diesel', 'adblue', 'ad blue', 'gnr', 'red']);
  const other = row.chargeCategories.filter(
    (c) => !fuelCats.has(c.toLowerCase()) && !c.toLowerCase().includes('diesel')
  );
  return other.length ? String(other.length) : '—';
}

export function FleetVehicleTable({
  vehicles,
  showAllFleet: initialShowAll = false,
  allFleetRegistrations = [],
  onAttachGps,
}: FleetVehicleTableProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<'registration' | 'chargeCount' | 'net'>('registration');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showAll, setShowAll] = useState(initialShowAll);
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const rows = useMemo(() => {
    let list = [...vehicles];
    if (showAll && allFleetRegistrations.length) {
      const present = new Set(vehicles.map((v) => v.registration));
      for (const reg of allFleetRegistrations) {
        if (!present.has(reg)) {
          list.push({
            registration: reg,
            make: '—',
            model: '—',
            chargeCount: 0,
            dateRange: '—',
            fuelLitresByProduct: {},
            monetaryTotalsByCurrency: {},
            countries: [],
            stations: [],
            chargeCategories: [],
          });
        }
      }
    }

    const q = search.trim().toUpperCase();
    if (q) {
      list = list.filter((v) => v.registration.toUpperCase().includes(q) || `${v.make} ${v.model}`.toUpperCase().includes(q));
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'registration') cmp = a.registration.localeCompare(b.registration);
      else if (sortKey === 'chargeCount') cmp = a.chargeCount - b.chargeCount;
      else {
        const aNet = Object.values(a.monetaryTotalsByCurrency).reduce((s, n) => s + n, 0);
        const bNet = Object.values(b.monetaryTotalsByCurrency).reduce((s, n) => s + n, 0);
        cmp = aNet - bNet;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [vehicles, search, sortKey, sortDir, showAll, allFleetRegistrations]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice(page * pageSize, (page + 1) * pageSize);

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <input
          type="search"
          placeholder="Search vehicle…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="input text-xs max-w-xs bg-surface-0 text-surface-950 border-surface-300"
        />
        {allFleetRegistrations.length > 0 && (
          <label className="flex items-center gap-2 text-3xs text-surface-600 cursor-pointer">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="rounded border-surface-300" />
            Show all fleet vehicles
          </label>
        )}
      </div>

      <div className="rounded-xl border border-surface-300 overflow-hidden bg-surface-50 dark:bg-surface-100">
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-3xs">
            <thead className="sticky top-0 z-10 bg-surface-100/90 dark:bg-surface-200/90 backdrop-blur-sm border-b border-surface-300">
              <tr className="text-surface-600 uppercase tracking-wider">
                <th className="text-left p-2 font-semibold cursor-pointer" onClick={() => toggleSort('registration')}>Vehicle</th>
                <th className="text-right p-2 font-semibold cursor-pointer" onClick={() => toggleSort('chargeCount')}>Charges</th>
                <th className="text-right p-2 font-semibold">Diesel</th>
                <th className="text-right p-2 font-semibold">AdBlue</th>
                <th className="text-right p-2 font-semibold">Other</th>
                <th className="text-right p-2 font-semibold cursor-pointer" onClick={() => toggleSort('net')}>Net amount</th>
                <th className="text-center p-2 font-semibold">GPS</th>
                <th className="text-right p-2 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((v) => (
                <tr key={v.registration} className="border-b border-surface-300/60 hover:bg-surface-100/60 h-9">
                  <td className="p-2">
                    <span className="font-mono font-bold text-surface-950">{v.registration}</span>
                    <span className="block text-surface-600 truncate max-w-[140px]">{v.make} {v.model}</span>
                  </td>
                  <td className="p-2 text-right font-mono text-surface-900">{v.chargeCount || '—'}</td>
                  <td className="p-2 text-right font-mono text-surface-900">{litresFor(v, 'diesel')}</td>
                  <td className="p-2 text-right font-mono text-surface-900">{litresFor(v, 'ad')}</td>
                  <td className="p-2 text-right font-mono text-surface-900">{otherCount(v)}</td>
                  <td className="p-2 text-right font-mono text-surface-950">{formatMoney(v.monetaryTotalsByCurrency)}</td>
                  <td className="p-2 text-center text-surface-500">—</td>
                  <td className="p-2 text-right">
                    {onAttachGps && v.chargeCount > 0 && (
                      <button type="button" onClick={() => onAttachGps(v.registration)} className="text-brand-600 dark:text-brand-400 font-semibold hover:underline">
                        GPS
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!pageRows.length && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-surface-600">No fleet vehicles in this document.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pageCount > 1 && (
        <div className="flex justify-between items-center text-3xs text-surface-600">
          <span>Page {page + 1} of {pageCount} · {rows.length} vehicles</span>
          <div className="flex gap-2">
            <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="btn btn-secondary py-1 px-2 text-3xs disabled:opacity-40">Prev</button>
            <button type="button" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)} className="btn btn-secondary py-1 px-2 text-3xs disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}