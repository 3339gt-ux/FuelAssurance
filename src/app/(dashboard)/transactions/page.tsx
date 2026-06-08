'use client';

import React, { useState, useEffect } from 'react';
import { Search, Filter, Fuel, Calendar, FileSpreadsheet, RotateCcw } from 'lucide-react';

export default function TransactionsPage() {
  const [txType, setTxType] = useState<'transaction' | 'invoice'>('transaction');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchTx = () => {
      setLoading(true);
      const typeQuery = txType === 'transaction' ? 'transactions' : 'invoice_transactions';
      fetch(`/api/entities?type=${typeQuery}`)
        .then((res) => res.json())
        .then((resData) => {
          setData(Array.isArray(resData) ? resData : []);
          setLoading(false);
        })
        .catch((err) => {
          console.error(err);
          setLoading(false);
        });
    };

    fetchTx();
  }, [txType]);

  const filtered = data.filter((item: any) => {
    const reg = (item.registration || '').toLowerCase();
    const card = (item.cardNumber || item.cardNumberNormalised || '').toLowerCase();
    const station = (item.stationName || '').toLowerCase();
    const query = search.toLowerCase();
    return reg.includes(query) || card.includes(query) || station.includes(query);
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Transactions</h1>
          <p className="text-sm text-surface-500 mt-1">Audit log of all normalised and imported transactions</p>
        </div>
        <div className="flex gap-2 bg-surface-200 p-1 rounded-xl">
          <button
            onClick={() => setTxType('transaction')}
            className={`text-xs px-3.5 py-1.5 rounded-lg font-semibold transition ${
              txType === 'transaction' ? 'bg-white text-surface-900 shadow-sm' : 'text-surface-600 hover:text-surface-800'
            }`}
          >
            Authorised Transactions
          </button>
          <button
            onClick={() => setTxType('invoice')}
            className={`text-xs px-3.5 py-1.5 rounded-lg font-semibold transition ${
              txType === 'invoice' ? 'bg-white text-surface-900 shadow-sm' : 'text-surface-600 hover:text-surface-800'
            }`}
          >
            Invoice Transactions
          </button>
        </div>
      </div>

      {/* Search and filters */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-400" />
          <input
            type="text"
            placeholder="Search by registration, card number, or station..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-surface-300 pl-10 pr-4 py-2.5 text-sm focus:border-brand-500 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Table grid */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-surface-400">
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-brand-500 mx-auto"></div>
            <span className="block mt-2">Loading transactions...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-surface-400">No records found matching search criteria.</div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-surface-50 border-b border-surface-200">
              <tr>
                <th className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Registration</th>
                <th className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Card / OBU</th>
                <th className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Station</th>
                <th className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Timestamp</th>
                <th className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Product</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Quantity</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Gross Amount</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Mileage</th>
                <th className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Provider</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-200">
              {filtered.map((item: any) => (
                <tr key={item.id} className="hover:bg-surface-50 transition text-sm">
                  <td className="px-5 py-3 font-semibold text-surface-800">{item.registration || '—'}</td>
                  <td className="px-5 py-3 text-surface-600 font-mono">{item.cardNumberNormalised || item.cardNumber || '—'}</td>
                  <td className="px-5 py-3 text-surface-600">{item.stationName || item.stationNumber || '—'}</td>
                  <td className="px-5 py-3 text-surface-500 font-mono">
                    {item.transactionTimestamp ? new Date(item.transactionTimestamp).toLocaleString() : '—'}
                  </td>
                  <td className="px-5 py-3 text-surface-600">{item.productName || item.productCode || '—'}</td>
                  <td className="px-5 py-3 text-right font-mono">{item.quantity} {item.unit || 'L'}</td>
                  <td className="px-5 py-3 text-right font-mono font-semibold text-surface-900">
                    €{parseFloat(item.amountGross || item.baseValueGross || '0').toFixed(2)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono">{item.mileage || '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`badge ${item.provider === 'DKV' ? 'badge-info' : 'badge-warning'} text-3xs`}>
                      {item.provider}
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
