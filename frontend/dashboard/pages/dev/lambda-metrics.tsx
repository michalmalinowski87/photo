"use client";

import {
  Activity,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import type { GetServerSideProps } from "next";
import React, { useState, useEffect } from "react";

import { useToast } from "../../hooks/useToast";
import api from "../../lib/api-service";

// Prevent static generation for this dev page
export const getServerSideProps: GetServerSideProps = () => {
  return Promise.resolve({ props: {} });
};

interface LambdaMemoryMetric {
  functionName: string;
  allocatedMemoryMB: number;
  maxMemoryUsedMB: number;
  averageMemoryUsedMB: number;
  memoryUtilizationPercent: number;
  averageDurationMs: number;
  maxDurationMs: number;
  invocations: number;
  errors: number;
  recommendation: string;
}

interface LambdaMetricsResponse {
  metrics: LambdaMemoryMetric[];
  period: string;
  region: string;
}

export default function LambdaMetrics() {
  const { showToast } = useToast();
  const [metrics, setMetrics] = useState<LambdaMemoryMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState("7 days");
  const [region, setRegion] = useState("");

  const fetchMetrics = async () => {
    try {
      setRefreshing(true);
      const response = await api.dashboard.getLambdaMetrics();
      setMetrics(response.metrics || []);
      setPeriod(response.period || "7 days");
      setRegion(response.region || "");
    } catch (error: any) {
      showToast({
        title: "Błąd",
        description: error.response?.data?.message || "Nie udało się pobrać metryk Lambda",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  const getUtilizationColor = (percent: number) => {
    if (percent === 0) return "text-gray-400";
    if (percent < 50) return "text-yellow-600 dark:text-yellow-400";
    if (percent < 70) return "text-green-600 dark:text-green-400";
    if (percent < 90) return "text-blue-600 dark:text-blue-400";
    return "text-red-600 dark:text-red-400";
  };

  const getRecommendationColor = (recommendation: string) => {
    if (recommendation.includes("Optimal") || recommendation.includes("Good")) {
      return "text-green-600 dark:text-green-400";
    }
    if (recommendation.includes("Over-allocated")) {
      return "text-yellow-600 dark:text-yellow-400";
    }
    if (recommendation.includes("Near limit")) {
      return "text-red-600 dark:text-red-400";
    }
    return "text-gray-600 dark:text-gray-400";
  };

  const getRecommendationIcon = (recommendation: string) => {
    if (recommendation.includes("Optimal") || recommendation.includes("Good")) {
      return <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />;
    }
    if (recommendation.includes("Over-allocated")) {
      return <TrendingDown className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />;
    }
    if (recommendation.includes("Near limit")) {
      return <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />;
    }
    return <Activity className="w-5 h-5 text-gray-400" />;
  };

  const formatFunctionName = (name: string) => {
    // Remove PhotoHub-dev- prefix for cleaner display
    return name.replace(/^PhotoHub-[^-]+-/, "");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600 dark:text-purple-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Ładowanie metryk Lambda...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                <Activity className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  Metryki Lambda - Pamięć
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">
                  Analiza wykorzystania pamięci funkcji Lambda (ostatnie {period})
                </p>
              </div>
            </div>
            <button
              onClick={fetchMetrics}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              Odśwież
            </button>
          </div>
          {region && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Region:</strong> {region} | <strong>Okres:</strong> {period}
              </p>
            </div>
          )}
        </div>

        {/* Metrics Table */}
        {metrics.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">
              Brak danych. Funkcje Lambda mogą nie być jeszcze wywołane lub nie ma danych dla tego
              okresu.
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Funkcja
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Przydzielona
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Max użyta
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Średnia użyta
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Wykorzystanie
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Czas wykonania
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Wywołania
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Błędy
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Rekomendacja
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {metrics.map((metric) => (
                    <tr
                      key={metric.functionName}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {formatFunctionName(metric.functionName)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {metric.allocatedMemoryMB} MB
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {metric.maxMemoryUsedMB > 0 ? `${metric.maxMemoryUsedMB} MB` : "-"}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {metric.averageMemoryUsedMB > 0
                            ? `${metric.averageMemoryUsedMB} MB`
                            : "-"}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 max-w-[100px]">
                            <div
                              className={`h-2 rounded-full ${
                                metric.memoryUtilizationPercent < 50
                                  ? "bg-yellow-500"
                                  : metric.memoryUtilizationPercent < 70
                                    ? "bg-green-500"
                                    : metric.memoryUtilizationPercent < 90
                                      ? "bg-blue-500"
                                      : "bg-red-500"
                              }`}
                              style={{
                                width: `${Math.min(metric.memoryUtilizationPercent, 100)}%`,
                              }}
                            />
                          </div>
                          <span
                            className={`text-sm font-medium ${getUtilizationColor(metric.memoryUtilizationPercent)}`}
                          >
                            {metric.memoryUtilizationPercent > 0
                              ? `${metric.memoryUtilizationPercent}%`
                              : "-"}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {metric.averageDurationMs > 0 ? (
                            <>
                              {metric.averageDurationMs}ms
                              {metric.maxDurationMs > metric.averageDurationMs && (
                                <span className="text-gray-500 dark:text-gray-400 ml-1">
                                  (max: {metric.maxDurationMs}ms)
                                </span>
                              )}
                            </>
                          ) : (
                            "-"
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {metric.invocations.toLocaleString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div
                          className={`text-sm font-medium ${
                            metric.errors > 0
                              ? "text-red-600 dark:text-red-400"
                              : "text-gray-900 dark:text-white"
                          }`}
                        >
                          {metric.errors.toLocaleString()}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-2">
                          {getRecommendationIcon(metric.recommendation)}
                          <span
                            className={`text-sm ${getRecommendationColor(metric.recommendation)}`}
                          >
                            {metric.recommendation}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Summary Stats */}
        {metrics.length > 0 && (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Łączne funkcje</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {metrics.length}
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                Średnie wykorzystanie
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {Math.round(
                  metrics.reduce((sum, m) => sum + m.memoryUtilizationPercent, 0) / metrics.length
                )}
                %
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Łączne wywołania</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {metrics.reduce((sum, m) => sum + m.invocations, 0).toLocaleString()}
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Łączne błędy</div>
              <div
                className={`text-2xl font-bold ${
                  metrics.reduce((sum, m) => sum + m.errors, 0) > 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-gray-900 dark:text-white"
                }`}
              >
                {metrics.reduce((sum, m) => sum + m.errors, 0).toLocaleString()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
