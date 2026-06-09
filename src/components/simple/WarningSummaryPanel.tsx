'use client';

import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Info } from 'lucide-react';
import type { GroupedWarning } from '@/lib/warning-grouper';

interface WarningSummaryPanelProps {
  headline?: string | undefined;
  blocking?: GroupedWarning[] | undefined;
  review?: GroupedWarning[] | undefined;
  informational?: GroupedWarning[] | undefined;
  informationalCount?: number | undefined;
  rawWarnings?: string[] | undefined;
}

export function WarningSummaryPanel({
  headline,
  blocking = [],
  review = [],
  informational = [],
  informationalCount = 0,
  rawWarnings = [],
}: WarningSummaryPanelProps) {
  const [showTechnical, setShowTechnical] = useState(false);
  const actionable = blocking.length + review.length;
  const hiddenInfo = informationalCount || informational.reduce((s, g) => s + g.count, 0);

  if (!actionable && !hiddenInfo && !headline) return null;

  return (
    <div className="rounded-xl border border-amber-300/60 bg-amber-500/5 p-4 space-y-3 text-surface-900 dark:text-surface-950">
      <div className="flex gap-2 items-start">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
        <div className="flex-1 space-y-2 text-xs">
          {headline && <p className="font-bold text-amber-800 dark:text-amber-300">{headline}</p>}

          {[...blocking, ...review].map((g) => (
            <div key={`${g.level}-${g.code}`} className="text-amber-900 dark:text-amber-200">
              <span className="font-semibold">{g.code}</span>
              {g.count > 1 && <span className="text-surface-600"> ({g.count}×)</span>}
              <span className="text-surface-700 dark:text-surface-800"> — {g.message}</span>
            </div>
          ))}

          {hiddenInfo > 0 && actionable === 0 && (
            <p className="flex items-center gap-1 text-surface-600">
              <Info className="h-3.5 w-3.5" />
              {hiddenInfo} informational note{hiddenInfo === 1 ? '' : 's'} hidden
            </p>
          )}
        </div>
      </div>

      {(rawWarnings.length > 0 || informational.length > 0) && (
        <button
          type="button"
          onClick={() => setShowTechnical((v) => !v)}
          className="text-3xs font-semibold text-brand-600 dark:text-brand-400 flex items-center gap-1 hover:underline"
        >
          {showTechnical ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Show technical details
        </button>
      )}

      {showTechnical && (
        <div className="max-h-40 overflow-y-auto text-3xs font-mono text-surface-700 bg-surface-100/80 rounded-lg p-3 space-y-1 border border-surface-300">
          {rawWarnings.slice(0, 50).map((w, i) => (
            <div key={i}>{w}</div>
          ))}
          {rawWarnings.length > 50 && <div>…{rawWarnings.length - 50} more</div>}
        </div>
      )}
    </div>
  );
}