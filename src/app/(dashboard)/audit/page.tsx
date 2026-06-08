'use client';

import React, { useState, useEffect } from 'react';
import { ScrollText, Search, User, ShieldAlert, Cpu } from 'lucide-react';

export default function AuditLogPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/audit')
      .then((res) => res.json())
      .then((data) => {
        setEvents(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const filtered = events.filter((e: any) => {
    const details = (e.details || '').toLowerCase();
    const type = (e.event_type || '').toLowerCase();
    const target = (e.target_type || '').toLowerCase();
    const query = search.toLowerCase();
    return details.includes(query) || type.includes(query) || target.includes(query);
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Audit Log</h1>
        <p className="text-sm text-surface-500 mt-1">Immutable ledger of system actions, file imports, and user decisions</p>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-400" />
          <input
            type="text"
            placeholder="Search audit events by type, details, user..."
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
            <span className="block mt-2">Loading audit events...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-surface-400">No audit logs found.</div>
        ) : (
          <div className="p-6 space-y-6">
            <div className="relative border-l-2 border-surface-200 ml-4 space-y-6">
              {filtered.map((e: any) => (
                <div key={e.id} className="relative pl-6">
                  {/* Timeline bullet */}
                  <div className="absolute -left-2 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-100 border-2 border-brand-500">
                    <div className="h-1.5 w-1.5 rounded-full bg-brand-600" />
                  </div>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="badge badge-info text-3xs uppercase font-bold tracking-wider">{e.event_type}</span>
                        <span className="text-2xs text-surface-400 font-mono">{new Date(e.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-sm font-semibold text-surface-800 mt-1.5">{e.details}</p>
                      <p className="text-2xs text-surface-500 mt-0.5">
                        Target: {e.target_type} ({e.target_id})
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-2xs text-surface-400 shrink-0">
                      <User className="h-3 w-3" />
                      <span>{e.user_id === 'e5c1a7b0-84a2-4a1e-84b2-9a7e8a9f0b12' ? 'Graham Audit (Auditor)' : 'System'}</span>
                      <span className="text-surface-300">|</span>
                      <span>IP: {e.ip_address}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
