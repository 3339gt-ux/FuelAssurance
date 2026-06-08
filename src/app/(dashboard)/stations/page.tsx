'use client';

import React, { useState, useEffect } from 'react';
import { Fuel, Search, MapPin, BadgePercent } from 'lucide-react';

export default function StationsPage() {
  const [stations, setStations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/entities?type=stations')
      .then((res) => res.json())
      .then((data) => {
        setStations(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const filtered = stations.filter((st: any) => {
    const code = (st.stationCode || '').toLowerCase();
    const name = (st.stationName || '').toLowerCase();
    const country = (st.country || '').toLowerCase();
    const query = search.toLowerCase();
    return code.includes(query) || name.includes(query) || country.includes(query);
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Approved Stations</h1>
        <p className="text-sm text-surface-500 mt-1">Master list of authorized yards and network fuel stations</p>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-400" />
          <input
            type="text"
            placeholder="Search by station code, name, country..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-surface-300 pl-10 pr-4 py-2.5 text-sm focus:border-brand-500 focus:ring-brand-500"
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-surface-400">
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-brand-500 mx-auto"></div>
            <span className="block mt-2">Loading stations...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-surface-400">
            No approved stations in the registry. Upload a Station Workbook to populate.
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-surface-50 border-b border-surface-200">
              <tr>
                <th className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Code</th>
                <th className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Name / Pump</th>
                <th className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Country</th>
                <th className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">City / Address</th>
                <th className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Coordinates</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Base Cost /L</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Discount</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Excise Rebate</th>
                <th className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Source Sheet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-200">
              {filtered.map((st: any) => (
                <tr key={st.id} className="hover:bg-surface-50 transition text-sm">
                  <td className="px-5 py-3 font-mono font-semibold text-surface-800">{st.stationCode}</td>
                  <td className="px-5 py-3 text-surface-600">{st.stationName}</td>
                  <td className="px-5 py-3 text-surface-600">{st.country || 'IE'}</td>
                  <td className="px-5 py-3 text-surface-500">{st.city || st.address || '—'}</td>
                  <td className="px-5 py-3 text-xs text-surface-500 font-mono">
                    {st.latitude !== null && st.longitude !== null ? (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-brand-500" />
                        {st.latitude}, {st.longitude}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-surface-700">{st.costPerLitre ? `€${st.costPerLitre}` : '—'}</td>
                  <td className="px-5 py-3 text-right font-mono text-green-600">
                    {st.discount ? `-€${st.discount}` : '—'}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-blue-600">
                    {st.exciseDutyRebate ? `€${st.exciseDutyRebate}` : '—'}
                  </td>
                  <td className="px-5 py-3 text-xs">
                    <span className="badge badge-info text-2xs uppercase">{st.sourceSheet?.replace(/_/g, ' ')}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
