'use client';

import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Upload,
  Fuel,
  Shield,
  ArrowUpRight,
  ArrowDownRight,
  LucideIcon,
} from 'lucide-react';
import Link from 'next/link';

// ─── Metric Card ───────────────────────────────────────────────────────────────

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendLabel,
  variant = 'default',
}: {
  title: string;
  value: string;
  subtitle?: string | undefined;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral' | undefined;
  trendLabel?: string | undefined;
  variant?: 'default' | 'success' | 'warning' | 'error' | undefined;
}) {
  const variantStyles = {
    default: 'from-brand-500/10 to-brand-600/5 border-brand-200',
    success: 'from-status-success/10 to-status-success/5 border-green-200',
    warning: 'from-status-warning/10 to-status-warning/5 border-amber-200',
    error: 'from-status-error/10 to-status-error/5 border-red-200',
  };

  const iconStyles = {
    default: 'bg-brand-100 text-brand-600',
    success: 'bg-green-100 text-green-600',
    warning: 'bg-amber-100 text-amber-600',
    error: 'bg-red-100 text-red-600',
  };

  return (
    <div className={`card bg-gradient-to-br ${variantStyles[variant || 'default']} p-5`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium text-surface-500 uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold text-surface-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-surface-500 mt-0.5">{subtitle}</p>}
          {trendLabel && (
            <div className="flex items-center gap-1 mt-2">
              {trend === 'up' && <ArrowUpRight className="h-3 w-3 text-green-500" />}
              {trend === 'down' && <ArrowDownRight className="h-3 w-3 text-red-500" />}
              <span className={`text-xs font-medium ${trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-surface-500'}`}>
                {trendLabel}
              </span>
            </div>
          )}
        </div>
        <div className={`p-2.5 rounded-xl ${iconStyles[variant || 'default']}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

// ─── Status Bar ────────────────────────────────────────────────────────────────

function StatusBar({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);

  return (
    <div className="space-y-2">
      <div className="flex h-3 rounded-full overflow-hidden bg-surface-200">
        {segments.map((seg, i) => (
          <div
            key={i}
            className={`${seg.color} transition-all duration-500`}
            style={{ width: total > 0 ? `${(seg.value / total) * 100}%` : '0%' }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-4">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-surface-600">
            <div className={`h-2.5 w-2.5 rounded-full ${seg.color}`} />
            <span>{seg.label}</span>
            <span className="font-semibold">{seg.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Dashboard Page ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/reports')
      .then((res) => res.json())
      .then((resData) => {
        setData(resData);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-brand-500"></div>
      </div>
    );
  }

  // Fallback default values if database is empty
  const summary = data?.summary || {
    matchRate: 0,
    matchedCount: 0,
    totalTransactions: 0,
    exceptionsCount: 0,
    totalGrossTx: '0.00',
    totalGrossInv: '0.00',
  };

  const hasData = summary.totalTransactions > 0 || summary.totalInvoiceRows > 0;

  // Reconstruct segments based on matching results
  const statusSegments = hasData ? [
    { label: 'Matches', value: summary.matchedCount, color: 'bg-green-500' },
    { label: 'Variances & Discrepancies', value: summary.exceptionsCount, color: 'bg-amber-500' },
  ] : [
    { label: 'Exact Match', value: 0, color: 'bg-green-500' },
    { label: 'Tolerance Match', value: 0, color: 'bg-green-400' },
    { label: 'Composite Match', value: 0, color: 'bg-blue-400' },
    { label: 'Financial Variance', value: 0, color: 'bg-amber-500' },
    { label: 'Unmatched TX', value: 0, color: 'bg-red-400' },
    { label: 'Unmatched INV', value: 0, color: 'bg-red-300' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Dashboard</h1>
          <p className="text-sm text-surface-500 mt-1">Fuel assurance overview for the current period</p>
        </div>
        {!hasData && (
          <Link href="/upload" className="btn btn-primary text-xs px-4 py-2 flex items-center gap-1.5">
            <Upload className="h-4 w-4" />
            Upload Files
          </Link>
        )}
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Match Rate"
          value={hasData ? `${summary.matchRate}%` : '0%'}
          subtitle={hasData ? `${summary.matchedCount} of ${summary.totalTransactions} transactions` : 'No data loaded'}
          icon={CheckCircle2}
          trend={hasData ? 'up' : 'neutral'}
          trendLabel={hasData ? '+100% since upload' : undefined}
          variant="success"
        />
        <MetricCard
          title="Unmatched & Mismatch"
          value={hasData ? String(summary.exceptionsCount) : '0'}
          subtitle={hasData ? 'Items requiring resolution' : 'All clear'}
          icon={XCircle}
          variant={summary.exceptionsCount > 0 ? 'warning' : 'default'}
        />
        <MetricCard
          title="Transaction Cost"
          value={hasData ? `€${parseFloat(summary.totalGrossTx).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '€0.00'}
          subtitle="Total transaction volume gross"
          icon={AlertTriangle}
          variant={summary.exceptionsCount > 0 ? 'error' : 'default'}
        />
        <MetricCard
          title="Invoice Cost"
          value={hasData ? `€${parseFloat(summary.totalGrossInv).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '€0.00'}
          subtitle="Total invoice amount billed"
          icon={Clock}
        />
      </div>

      {/* Reconciliation status bar */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-surface-800">Reconciliation Status — June 2026</h3>
          <span className={`badge ${hasData ? 'badge-success' : 'badge-warning'}`}>
            {hasData ? 'Completed' : 'Pending Upload'}
          </span>
        </div>
        <StatusBar segments={statusSegments} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="lg:col-span-1 card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-surface-800">Recent Activity Log</h3>
          <div className="space-y-4 text-xs">
            {hasData ? (
              <>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                  <div>
                    <p className="font-semibold text-surface-800">Reconciliation run completed</p>
                    <p className="text-surface-500">{summary.matchRate}% match rate over June 2026 period</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <Upload className="h-4 w-4 text-brand-500 mt-0.5" />
                  <div>
                    <p className="font-semibold text-surface-800">DKV/AS24 files processed</p>
                    <p className="text-surface-500">Successfully extracted transaction sheets</p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-surface-400">No activity recorded yet. Proceed to upload transaction workbooks.</p>
            )}
          </div>
        </div>

        {/* Action center */}
        <div className="lg:col-span-2 card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-surface-800">Action Required</h3>
          <div className="divide-y divide-surface-200">
            {hasData && summary.exceptionsCount > 0 ? (
              <div className="py-3 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-surface-800">Resolve reconciliation variances</p>
                  <p className="text-xs text-surface-500">{summary.exceptionsCount} items flagged for financial or telematics mismatch</p>
                </div>
                <Link href="/review-queue" className="btn btn-secondary text-xs px-4 py-2">
                  Review Queue
                </Link>
              </div>
            ) : (
              <p className="text-xs text-surface-500 py-3">No actions pending. All systems clear!</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
