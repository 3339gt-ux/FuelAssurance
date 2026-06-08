'use client';

import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, FileText, CheckCircle2, AlertTriangle, XCircle, Clock, Eye, RotateCcw } from 'lucide-react';
import Link from 'next/link';

export default function ImportsPage() {
  const [imports, setImports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/imports')
      .then((res) => res.json())
      .then((data) => {
        setImports(data);
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Import History</h1>
          <p className="text-sm text-surface-500 mt-1">All imported files with parsing results and audit trail</p>
        </div>
        <Link href="/upload" className="btn btn-primary text-sm px-4 py-2">
          New Import
        </Link>
      </div>

      <div className="card overflow-hidden">
        {imports.length === 0 ? (
          <div className="p-8 text-center text-surface-400">
            No files imported yet. Go to the Upload Centre to upload your DKV/AS24 workbooks.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-surface-50 border-b border-surface-200">
              <tr>
                <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">File</th>
                <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Type</th>
                <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Parser Profile</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Rows</th>
                <th className="text-center text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Upload Date</th>
                <th className="text-center text-xs font-semibold text-surface-500 uppercase tracking-wider px-5 py-3">Audit Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-200">
              {imports.map((imp) => (
                <tr key={imp.id} className="hover:bg-surface-50 transition">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {imp.mime_type?.includes('pdf') || imp.file_name.toLowerCase().endsWith('.pdf') ? (
                        <FileText className="h-4 w-4 text-red-400 shrink-0" />
                      ) : (
                        <FileSpreadsheet className="h-4 w-4 text-green-400 shrink-0" />
                      )}
                      <span className="text-sm font-medium text-surface-800 truncate max-w-[250px]">{imp.file_name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-surface-600">{imp.provider} {imp.document_type}</td>
                  <td className="px-5 py-3">
                    <span className="badge badge-info text-2xs">{imp.parser_version || '1.0.0'}</span>
                  </td>
                  <td className="px-5 py-3 text-sm text-surface-800 text-right font-mono">{(imp.row_count || 0).toLocaleString()}</td>
                  <td className="px-5 py-3 text-center">
                    <span
                      className={`badge ${
                        imp.import_status === 'completed'
                          ? 'badge-success'
                          : imp.import_status === 'completed_with_warnings'
                            ? 'badge-warning'
                            : 'badge-error'
                      }`}
                    >
                      {imp.import_status === 'completed' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                      {imp.import_status === 'completed_with_warnings' && <AlertTriangle className="h-3 w-3 mr-1" />}
                      {imp.import_status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm text-surface-500">{new Date(imp.upload_date).toLocaleString()}</td>
                  <td className="px-5 py-3 text-center">
                    {imp.warning_count > 0 && (
                      <span className="badge badge-warning text-2xs mr-1">{imp.warning_count} issues</span>
                    )}
                    {imp.control_total_status === 'unmatched' && (
                      <span className="badge badge-error text-2xs">Totals Mismatch</span>
                    )}
                    {imp.warning_count === 0 && imp.control_total_status !== 'unmatched' && (
                      <span className="text-xs text-surface-400">—</span>
                    )}
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
