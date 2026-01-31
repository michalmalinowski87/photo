"use client";

import {
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Download,
  Package,
} from "lucide-react";
import type { GetServerSideProps } from "next";
import React, { useState, useEffect, useCallback } from "react";

import { useToast } from "../../hooks/useToast";
import api from "../../lib/api-service";

// Prevent static generation for this dev page
export const getServerSideProps: GetServerSideProps = () => {
  return Promise.resolve({ props: {} });
};

const now = Date.now();
const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

export default function ZipMetrics() {
  const { showToast } = useToast();
  const [metrics, setMetrics] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fromTs, setFromTs] = useState(sevenDaysAgo);
  const [toTs, setToTs] = useState(now);
  const [typeFilter, setTypeFilter] = useState<"all" | "final" | "original">("all");

  const fetchData = useCallback(async () => {
    try {
      setRefreshing(true);
      const [metricsRes, summaryRes] = await Promise.all([
        api.dashboard.getZipMetrics({
          from: fromTs,
          to: toTs,
          type: typeFilter === "all" ? undefined : typeFilter,
          limit: 200,
        }),
        api.dashboard.getZipMetricsSummary({ from: fromTs, to: toTs }),
      ]);
      setMetrics(metricsRes.metrics ?? []);
      setSummary(summaryRes);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      showToast("error", "Błąd", err?.response?.data?.message ?? "Nie udało się pobrać metryk ZIP");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fromTs, toTs, typeFilter, showToast]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const formatMs = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatBytes = (bytes?: number) => {
    if (bytes == null) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const exportCsv = () => {
    const headers = [
      "runId",
      "phase",
      "galleryId",
      "orderId",
      "type",
      "filesCount",
      "zipSizeBytes",
      "workerCount",
      "durationMs",
      "bottleneck",
      "success",
      "error",
      "timestamp",
    ];
    const rows = metrics.map((m) =>
      headers.map((h) => {
        const v = m[h];
        if (typeof v === "object") return JSON.stringify(v);
        return v ?? "";
      })
    );
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `zip-metrics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("success", "Eksport", "Pobrano CSV");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-photographer-background dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600 dark:text-purple-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Ładowanie metryk ZIP...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-photographer-background dark:bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                <Package className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  Metryki generowania ZIP
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">
                  Analiza wydajności i wąskich gardeł (single vs chunked)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={new Date(fromTs).toISOString().slice(0, 10)}
                onChange={(e) => setFromTs(new Date(e.target.value).getTime())}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
              <span className="text-gray-500">–</span>
              <input
                type="date"
                value={new Date(toTs).toISOString().slice(0, 10)}
                onChange={(e) => setToTs(new Date(e.target.value).getTime())}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                <option value="all">Wszystkie</option>
                <option value="final">Finale</option>
                <option value="original">Oryginały</option>
              </select>
              <button
                onClick={fetchData}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                Odśwież
              </button>
              <button
                onClick={exportCsv}
                className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                CSV
              </button>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Razy generowania</div>
              <div className="text-xl font-bold text-gray-900 dark:text-white">
                {summary.totalRuns}
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Śr. czas</div>
              <div className="text-xl font-bold text-gray-900 dark:text-white">
                {formatMs(summary.duration?.avgMs ?? 0)}
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">P95 czas</div>
              <div className="text-xl font-bold text-gray-900 dark:text-white">
                {formatMs(summary.duration?.p95Ms ?? 0)}
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Sukces</div>
              <div className="text-xl font-bold text-green-600 dark:text-green-400">
                {summary.successRate}%
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Single / Chunked</div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                {summary.successBreakdown?.single ?? 0} / {summary.successBreakdown?.chunked ?? 0}
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Błędy</div>
              <div
                className={`text-xl font-bold ${
                  (summary.successBreakdown?.fail ?? 0) > 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-gray-900 dark:text-white"
                }`}
              >
                {summary.successBreakdown?.fail ?? 0}
              </div>
            </div>
          </div>
        )}

        {/* Bottleneck distribution */}
        {summary?.bottleneckDistribution &&
          Object.keys(summary.bottleneckDistribution).length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Wąskie gardła
              </h2>
              <div className="flex flex-wrap gap-4">
                {Object.entries(summary.bottleneckDistribution).map(([bn, count]) => (
                  <div
                    key={bn}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center gap-2"
                  >
                    <Activity className="w-4 h-4 text-purple-500" />
                    <span className="font-medium text-gray-900 dark:text-white">{bn}</span>
                    <span className="text-gray-600 dark:text-gray-400">{Number(count)}×</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        {/* Table */}
        {metrics.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">
              Brak danych. Generowanie ZIP może nie być jeszcze wywołane w tym okresie.
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-photographer-darkBeige dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-photographer-mutedText dark:text-gray-400 uppercase">
                      runId / phase
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-photographer-mutedText dark:text-gray-400 uppercase">
                      Galeria / Zamówienie
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-photographer-mutedText dark:text-gray-400 uppercase">
                      Typ
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-photographer-mutedText dark:text-gray-400 uppercase">
                      Pliki
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-photographer-mutedText dark:text-gray-400 uppercase">
                      Rozmiar ZIP
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-photographer-mutedText dark:text-gray-400 uppercase">
                      Workers
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-photographer-mutedText dark:text-gray-400 uppercase">
                      Czas
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-photographer-mutedText dark:text-gray-400 uppercase">
                      Bottleneck
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-photographer-mutedText dark:text-gray-400 uppercase">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {metrics.map((m, i) => (
                    <tr key={`${m.runId}-${m.phase}-${i}`} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3">
                        <div className="text-xs font-mono text-gray-600 dark:text-gray-400">
                          {String(m.runId || "").slice(0, 8)}…
                        </div>
                        <div className="text-xs text-gray-500">{m.phase}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm">{m.galleryId}</div>
                        <div className="text-xs text-gray-500">{m.orderId}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">{m.type}</td>
                      <td className="px-4 py-3 text-sm">{m.filesCount ?? "-"}</td>
                      <td className="px-4 py-3 text-sm">{formatBytes(m.zipSizeBytes)}</td>
                      <td className="px-4 py-3 text-sm">{m.workerCount ?? "-"}</td>
                      <td className="px-4 py-3 text-sm">{formatMs(m.durationMs ?? 0)}</td>
                      <td className="px-4 py-3 text-sm">{m.bottleneck ?? "-"}</td>
                      <td className="px-4 py-3">
                        {m.success ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                        ) : (
                          <span title={m.error ?? "Failed"}>
                            <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
