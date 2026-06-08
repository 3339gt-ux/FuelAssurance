'use client';

import React, { useState, useEffect } from 'react';
import { HelpCircle, Search, GitPullRequest, ShieldCheck, Ban, Plus, ArrowRight } from 'lucide-react';

export default function MappingQueuePage() {
  const [items, setItems] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  // Form states
  const [action, setAction] = useState<'create' | 'alias' | 'exclude'>('create');
  const [targetId, setTargetId] = useState('');
  const [customName, setCustomName] = useState('');
  const [reason, setReason] = useState('');
  const [provider, setProvider] = useState('DKV');

  const fetchQueue = () => {
    fetch('/api/mapping-queue')
      .then((res) => res.json())
      .then((data) => {
        setItems(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  };

  const fetchMasterData = () => {
    fetch('/api/entities?type=vehicles')
      .then((res) => res.json())
      .then((data) => setVehicles(data))
      .catch(console.error);

    fetch('/api/entities?type=stations')
      .then((res) => res.json())
      .then((data) => setStations(data))
      .catch(console.error);
  };

  useEffect(() => {
    fetchQueue();
    fetchMasterData();
  }, []);

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    try {
      const res = await fetch('/api/mapping-queue/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: selectedItem.type,
          value: selectedItem.value,
          action,
          targetId,
          name: action === 'create' ? customName : targetId,
          provider: selectedItem.provider !== 'ANY' ? selectedItem.provider : provider,
          reason,
        }),
      });

      if (!res.ok) throw new Error('Failed to resolve mapping');

      setSelectedItem(null);
      setTargetId('');
      setCustomName('');
      setReason('');
      fetchQueue();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-brand-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Mapping Queue</h1>
        <p className="text-sm text-surface-500 mt-1">Resolve previously unseen cards, vehicles, and stations to prevent exceptions</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: List items */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-sm font-semibold text-surface-800">Unmapped Identifiers ({items.length})</h3>
          
          {items.length === 0 ? (
            <div className="card p-8 text-center text-surface-400">
              ✓ All clear! There are no unmapped identifiers in the database.
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    setSelectedItem(item);
                    setAction('create');
                  }}
                  className={`card p-4 cursor-pointer transition flex items-center justify-between border-2 ${
                    selectedItem?.id === item.id ? 'border-brand-500 bg-brand-50/10' : 'border-surface-200 hover:border-surface-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-surface-100 text-surface-500">
                      <HelpCircle className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="badge badge-warning text-3xs font-bold uppercase">{item.type}</span>
                      <h4 className="text-sm font-mono font-semibold text-surface-800 mt-1">{item.value}</h4>
                      <p className="text-2xs text-surface-400 mt-0.5">{item.description}</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-surface-400" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column: Action form */}
        <div className="lg:col-span-1 space-y-4">
          <h3 className="text-sm font-semibold text-surface-800">Resolution Console</h3>
          
          {selectedItem ? (
            <form onSubmit={handleResolve} className="card p-5 space-y-5 animate-fade-in">
              <div>
                <span className="text-3xs uppercase tracking-wider text-surface-450 font-bold">Selected Item</span>
                <p className="text-sm font-mono font-semibold text-surface-800 mt-0.5">{selectedItem.value}</p>
                <p className="text-2xs text-surface-400">Type: {selectedItem.type}</p>
              </div>

              {/* Action tabs */}
              <div className="grid grid-cols-3 gap-1 bg-surface-100 p-1 rounded-xl">
                {[
                  { id: 'create', label: 'Create New', icon: Plus },
                  { id: 'alias', label: 'Map Alias', icon: GitPullRequest },
                  { id: 'exclude', label: 'Exclude', icon: Ban },
                ].map((act) => {
                  const Icon = act.icon;
                  return (
                    <button
                      key={act.id}
                      type="button"
                      onClick={() => setAction(act.id as any)}
                      className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg text-3xs font-bold transition ${
                        action === act.id ? 'bg-white text-surface-900 shadow-xs' : 'text-surface-500 hover:text-surface-700'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 mb-1 text-brand-600" />
                      {act.label}
                    </button>
                  );
                })}
              </div>

              {/* Option-based inputs */}
              {action === 'create' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-surface-700 mb-1">Entity Name / Label</label>
                    <input
                      type="text"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder={selectedItem.type === 'VEHICLE' ? 'e.g. Scania R500' : 'e.g. Dublin Station'}
                      className="w-full rounded-lg border border-surface-300 px-3 py-2 text-xs"
                      required
                    />
                  </div>
                  {selectedItem.provider === 'ANY' && (
                    <div>
                      <label className="block text-xs font-semibold text-surface-700 mb-1">Provider</label>
                      <select
                        value={provider}
                        onChange={(e) => setProvider(e.target.value)}
                        className="w-full rounded-lg border border-surface-300 px-3 py-2 text-xs"
                      >
                        <option value="DKV">DKV</option>
                        <option value="AS24">AS24</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              {action === 'alias' && (
                <div className="space-y-3">
                  {selectedItem.type === 'VEHICLE' && (
                    <div>
                      <label className="block text-xs font-semibold text-surface-700 mb-1">Map to Fleet Vehicle</label>
                      <select
                        value={targetId}
                        onChange={(e) => setTargetId(e.target.value)}
                        className="w-full rounded-lg border border-surface-300 px-3 py-2 text-xs"
                        required
                      >
                        <option value="">-- Select Vehicle --</option>
                        {vehicles.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.registration} ({v.make})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {selectedItem.type === 'CARD' && (
                    <div>
                      <label className="block text-xs font-semibold text-surface-700 mb-1">Assign to Vehicle</label>
                      <select
                        value={targetId}
                        onChange={(e) => setTargetId(e.target.value)}
                        className="w-full rounded-lg border border-surface-300 px-3 py-2 text-xs"
                        required
                      >
                        <option value="">-- Select Vehicle --</option>
                        {vehicles.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.registration} ({v.make})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {selectedItem.type === 'STATION' && (
                    <div>
                      <label className="block text-xs font-semibold text-surface-700 mb-1">Map to Approved Station</label>
                      <select
                        value={targetId}
                        onChange={(e) => setTargetId(e.target.value)}
                        className="w-full rounded-lg border border-surface-300 px-3 py-2 text-xs"
                        required
                      >
                        <option value="">-- Select Station --</option>
                        {stations.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.stationCode} — {s.stationName}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {action === 'exclude' && (
                <div>
                  <label className="block text-xs font-semibold text-surface-700 mb-1">Exclusion Reason</label>
                  <textarea
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Provide justification for excluding this row from matches..."
                    className="w-full rounded-lg border border-surface-300 p-2 text-xs"
                    required
                  />
                </div>
              )}

              <button type="submit" className="w-full btn btn-primary text-xs py-2 flex items-center justify-center gap-1.5">
                <ShieldCheck className="h-4 w-4" />
                Apply Resolution Rules
              </button>
            </form>
          ) : (
            <div className="card p-5 text-center text-surface-400 text-xs">
              Select an unmapped item from the queue list to resolve.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
