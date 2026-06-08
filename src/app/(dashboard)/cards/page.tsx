'use client';

import React, { useState, useEffect } from 'react';
import { CreditCard, Search, CheckCircle } from 'lucide-react';

export default function CardsPage() {
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/entities?type=cards')
      .then((res) => res.json())
      .then((data) => {
        setCards(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const filtered = cards.filter((c: any) => {
    const num = (c.card_number || '').toLowerCase();
    const prov = (c.provider || '').toLowerCase();
    const query = search.toLowerCase();
    return num.includes(query) || prov.includes(query);
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Cards and Equipment</h1>
        <p className="text-sm text-surface-500 mt-1">Registry of authorized fuel cards, toll boxes, and PASSango OBUs</p>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-400" />
          <input
            type="text"
            placeholder="Search by card number, OBU ID, or provider..."
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
            <span className="block mt-2">Loading cards...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-surface-400">No cards registered in the database.</div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-surface-50 border-b border-surface-200">
              <tr>
                <th className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Card / Equipment ID</th>
                <th className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Normalised Code</th>
                <th className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Provider</th>
                <th className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-200">
              {filtered.map((c: any) => (
                <tr key={c.id} className="hover:bg-surface-50 transition text-sm">
                  <td className="px-5 py-3 font-mono font-semibold text-surface-800">{c.card_number}</td>
                  <td className="px-5 py-3 font-mono text-surface-600">{c.card_number_normalised}</td>
                  <td className="px-5 py-3">
                    <span className={`badge ${c.provider === 'DKV' ? 'badge-info' : 'badge-warning'} text-3xs uppercase font-bold`}>
                      {c.provider}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="badge badge-success text-2xs flex items-center gap-1 w-fit">
                      <CheckCircle className="h-3 w-3" /> Active
                    </span>
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
