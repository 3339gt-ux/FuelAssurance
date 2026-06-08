'use client';

import React, { useState, useEffect } from 'react';
import { Truck, Search, CheckCircle } from 'lucide-react';

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/entities?type=vehicles')
      .then((res) => res.json())
      .then((data) => {
        setVehicles(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const filtered = vehicles.filter((v: any) => {
    const reg = (v.registration || '').toLowerCase();
    const make = (v.make || '').toLowerCase();
    const query = search.toLowerCase();
    return reg.includes(query) || make.includes(query);
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Vehicles</h1>
        <p className="text-sm text-surface-500 mt-1">Fleet vehicle master registry and telematics configuration</p>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-400" />
          <input
            type="text"
            placeholder="Search vehicles by registration or brand..."
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
            <span className="block mt-2">Loading fleet...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-surface-400">No vehicles found in fleet registry.</div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-surface-50 border-b border-surface-200">
              <tr>
                <th className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Registration</th>
                <th className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Make / Brand</th>
                <th className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Model</th>
                <th className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Tank Capacity</th>
                <th className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Status</th>
                <th className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Registered Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-200">
              {filtered.map((v: any) => (
                <tr key={v.id} className="hover:bg-surface-50 transition text-sm">
                  <td className="px-5 py-3 font-semibold text-brand-600">{v.registration}</td>
                  <td className="px-5 py-3 text-surface-600">{v.make}</td>
                  <td className="px-5 py-3 text-surface-600">{v.model || 'Unknown'}</td>
                  <td className="px-5 py-3 font-mono">{v.fuel_capacity || '1,200'} L</td>
                  <td className="px-5 py-3">
                    <span className="badge badge-success text-2xs flex items-center gap-1 w-fit">
                      <CheckCircle className="h-3 w-3" /> Active
                    </span>
                  </td>
                  <td className="px-5 py-3 text-surface-500">{new Date(v.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
