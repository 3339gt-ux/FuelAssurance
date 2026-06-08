'use client';

import React, { useState, useEffect } from 'react';
import { BarChart3, Download, FileSpreadsheet, FileText, CheckCircle2 } from 'lucide-react';
import { CardProvider } from '@/domain/types';
import { escapeFormulaInjection } from '@/lib/utils';

const REPORT_TEMPLATES = [
  { id: 'rep-1', name: 'Executive Summary', desc: 'High-level dashboard overview of savings, match rates, and variance amounts.' },
  { id: 'rep-2', name: 'Exception & Mismatch Audit', desc: 'Detailed breakdown of all items flagged with mismatched prices, VAT, or unlikely telematics.' },
  { id: 'rep-3', name: 'Approved Stations Price Check', desc: 'Audits invoiced costs against approved master prices for discount verification.' },
  { id: 'rep-4', name: 'Full Reconciliation Ledger', desc: 'Raw matched pairs transaction-to-invoice report with reason codes and confidence scores.' }
];

export default function ReportsPage() {
  const [selectedTemplate, setSelectedTemplate] = useState('rep-1');
  const [periods, setPeriods] = useState<any[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [provider, setProvider] = useState<CardProvider | 'ALL'>('ALL');
  const [generating, setGenerating] = useState(false);
  const [reportReady, setReportReady] = useState(false);
  const [reportData, setReportData] = useState<any>(null);

  useEffect(() => {
    fetch('/api/periods')
      .then((res) => res.json())
      .then((data) => {
        setPeriods(data);
        if (data.length > 0) setSelectedPeriod(data[0].id);
      })
      .catch(console.error);
  }, []);

  const handleGenerate = () => {
    setGenerating(true);
    setReportReady(false);
    
    fetch('/api/reports')
      .then((res) => res.json())
      .then((resData) => {
        setReportData(resData);
        setGenerating(false);
        setReportReady(true);
      })
      .catch((err) => {
        console.error(err);
        setGenerating(false);
      });
  };

  const handleExportCSV = () => {
    if (!reportData) return;

    let headers: string[] = [];
    let rows: any[][] = [];
    let filename = 'report.csv';

    if (selectedTemplate === 'rep-1') {
      filename = 'executive-summary-report.csv';
      headers = ['Metric', 'Value'];
      const summary = reportData.summary;
      rows = [
        ['Total Transactions', String(summary.totalTransactions)],
        ['Total Invoice Rows', String(summary.totalInvoiceRows)],
        ['Matched Count', String(summary.matchedCount)],
        ['Match Rate', `${summary.matchRate}%`],
        ['Total Gross Transaction Amount', `€${summary.totalGrossTx}`],
        ['Total Gross Invoiced Amount', `€${summary.totalGrossInv}`],
        ['Exceptions / Mismatches Count', String(summary.exceptionsCount)],
      ];
    } else {
      filename = 'exception-audit-report.csv';
      headers = ['Match ID', 'Vehicle', 'Card Number', 'Station Name', 'Product', 'TX Quantity', 'INV Quantity', 'Status', 'Confidence'];
      rows = reportData.exceptions.map((e: any) => [
        e.id,
        e.transaction?.registration || e.invoiceRow?.registration || '',
        e.transaction?.cardNumber || e.invoiceRow?.cardNumberNormalised || '',
        e.transaction?.stationName || e.invoiceRow?.stationName || '',
        e.transaction?.productName || e.invoiceRow?.productName || '',
        e.transaction?.quantity || '0',
        e.invoiceRow?.quantity || '0',
        e.status,
        `${e.confidence}%`,
      ]);
    }

    // Apply formula injection protection and build CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row
          .map((val) => {
            const escaped = escapeFormulaInjection(String(val || ''));
            return `"${escaped.replace(/"/g, '""')}"`;
          })
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-surface-950">Management Reports</h1>
        <p className="text-sm text-surface-500 mt-1">Generate and export audits, exception ledgers, and financial reconciliation reports</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Templates */}
        <div className="lg:col-span-2 border border-surface-300 rounded-xl bg-surface-50 p-5 space-y-4">
          <h3 className="text-xs font-bold text-surface-950 uppercase tracking-wider">1. Select Report Template</h3>
          <div className="space-y-3">
            {REPORT_TEMPLATES.map((t) => (
              <label
                key={t.id}
                className={`flex items-start gap-4 p-4 border rounded-xl cursor-pointer transition-all duration-200 ${
                  selectedTemplate === t.id ? 'border-brand-500 bg-brand-500/5' : 'border-surface-300 hover:border-surface-400'
                }`}
              >
                <input
                  type="radio"
                  name="template"
                  className="mt-1"
                  checked={selectedTemplate === t.id}
                  onChange={() => setSelectedTemplate(t.id)}
                />
                <div>
                  <h4 className="text-sm font-bold text-surface-950">{t.name}</h4>
                  <p className="text-xs text-surface-500 mt-1">{t.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Configurations */}
        <div className="border border-surface-300 rounded-xl bg-surface-50 p-5 space-y-5 h-fit">
          <h3 className="text-xs font-bold text-surface-950 uppercase tracking-wider">2. Configure Filters</h3>
          
          <div className="space-y-4">
            <div>
              <label className="text-2xs font-semibold text-surface-500 uppercase tracking-wider block mb-1.5">Invoice Period</label>
              <select
                className="input text-xs w-full bg-surface-100"
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
              >
                {periods.length === 0 ? (
                  <option value="">No Active Periods</option>
                ) : (
                  periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="text-2xs font-semibold text-surface-500 uppercase tracking-wider block mb-1.5">Fuel Card Provider</label>
              <select
                className="input text-xs w-full bg-surface-100"
                value={provider}
                onChange={(e) => setProvider(e.target.value as any)}
              >
                <option value="ALL">All Providers</option>
                <option value="DKV">DKV</option>
                <option value="AS24">AS24</option>
              </select>
            </div>
            
            <button
              className="btn btn-primary w-full py-2.5 text-xs flex items-center justify-center gap-2 font-semibold"
              disabled={generating || periods.length === 0}
              onClick={handleGenerate}
            >
              {generating ? 'Generating...' : 'Compile Report'}
            </button>
          </div>

          {reportReady && reportData && (
            <div className="border-t border-surface-300 pt-4 space-y-3 animate-fade-in">
              <div className="flex items-center gap-2 text-xs text-status-verified font-medium text-green-600">
                <CheckCircle2 className="h-4 w-4" /> Report Compiled Successfully
              </div>
              <p className="text-3xs text-surface-500">Spreadsheet exports include formula injection protection.</p>
              
              <div className="grid grid-cols-1 gap-2 pt-1">
                <button
                  onClick={handleExportCSV}
                  className="btn btn-secondary py-2 text-2xs flex items-center justify-center gap-1.5 font-semibold w-full"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-green-500" /> Export CSV Data
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
