import type { QueryClient } from "@tanstack/react-query";

/**
 * Development-only cache monitoring utility
 *
 * Logs cache metrics including:
 * - Cache size (number of cached queries)
 * - Hit/miss ratio for top query keys
 * - Cache state for frequently used queries
 *
 * Only runs in development mode to avoid performance impact in production.
 */

interface CacheMetrics {
  totalQueries: number;
  topKeys: Array<{
    key: string;
    hits: number;
    misses: number;
    hitRate: number;
    dataAge?: number;
  }>;
}

// Track query access for hit/miss calculation
const queryAccessMap = new Map<string, { hits: number; misses: number; lastAccess: number }>();

// Top query keys to monitor
const MONITORED_KEYS = [
  "galleries.detail",
  "galleries.list",
  "orders.list",
  "orders.detail",
  "wallet.balance",
  "presigned-url",
  "dashboard.stats",
] as const;

/**
 * Get cache metrics from QueryClient
 */
function getCacheMetrics(queryClient: QueryClient): CacheMetrics {
  const cache = queryClient.getQueryCache();
  const allQueries = cache.getAll();

  // Initialize access tracking for monitored keys
  MONITORED_KEYS.forEach((key) => {
    if (!queryAccessMap.has(key)) {
      queryAccessMap.set(key, { hits: 0, misses: 0, lastAccess: 0 });
    }
  });

  // Analyze queries
  const topKeys = MONITORED_KEYS.map((keyName) => {
    // Find queries matching this key pattern
    const matchingQueries = allQueries.filter((query) => {
      const queryKey = query.queryKey;
      const keyString = JSON.stringify(queryKey);

      // Match based on key structure
      if (keyName === "galleries.detail") {
        return keyString.includes('["galleries","detail"');
      }
      if (keyName === "galleries.list") {
        return keyString.includes('["galleries","list"');
      }
      if (keyName === "orders.list") {
        return keyString.includes('["orders","list"');
      }
      if (keyName === "orders.detail") {
        return keyString.includes('["orders","detail"');
      }
      if (keyName === "wallet.balance") {
        return keyString.includes('["wallet","balance"');
      }
      if (keyName === "presigned-url") {
        return keyString.includes('["uploads","presigned-url"');
      }
      if (keyName === "dashboard.stats") {
        return keyString.includes('["dashboard","stats"');
      }
      return false;
    });

    const access = queryAccessMap.get(keyName) ?? { hits: 0, misses: 0, lastAccess: 0 };

    // Calculate hit rate (simplified - assumes queries with data are hits)
    const queriesWithData = matchingQueries.filter((q) => q.state.data !== undefined);

    // Update access tracking
    if (matchingQueries.length > 0) {
      access.hits += queriesWithData.length;
      access.misses += matchingQueries.length - queriesWithData.length;
      access.lastAccess = Date.now();
      queryAccessMap.set(keyName, access);
    }

    // Calculate data age (time since last fetch)
    const dataAge =
      matchingQueries.length > 0
        ? matchingQueries
            .map((q) => q.state.dataUpdatedAt)
            .filter((t) => t > 0)
            .reduce((max, t) => Math.max(max, t), 0)
        : undefined;

    return {
      key: keyName,
      hits: access.hits,
      misses: access.misses,
      hitRate: access.hits + access.misses > 0 ? access.hits / (access.hits + access.misses) : 0,
      dataAge: dataAge ? Date.now() - dataAge : undefined,
    };
  });

  return {
    totalQueries: allQueries.length,
    topKeys,
  };
}

/**
 * Format cache metrics for logging
 */
function formatMetrics(metrics: CacheMetrics): string {
  const lines = [
    "📊 React Query Cache Metrics",
    `Total cached queries: ${metrics.totalQueries}`,
    "",
    "Top query keys:",
  ];

  metrics.topKeys.forEach((key) => {
    const hitRatePercent = (key.hitRate * 100).toFixed(1);
    const dataAgeSeconds = key.dataAge ? Math.floor(key.dataAge / 1000) : "N/A";
    lines.push(
      `  ${key.key}:`,
      `    Hit rate: ${hitRatePercent}% (${key.hits} hits, ${key.misses} misses)`,
      `    Data age: ${dataAgeSeconds}s`
    );
  });

  return lines.join("\n");
}

/**
 * Initialize cache logger (development only)
 *
 * Logs cache metrics every 30 seconds to help monitor cache performance
 * and identify optimization opportunities.
 *
 * @param queryClient - React Query client instance
 */
export function initCacheLogger(queryClient: QueryClient): void {
  // Only run in development
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  // Log initial metrics
  const initialMetrics = getCacheMetrics(queryClient);
  // eslint-disable-next-line no-console
  console.log(formatMetrics(initialMetrics));

  // Set up periodic logging (every 30 seconds)
  const intervalId = setInterval(() => {
    const metrics = getCacheMetrics(queryClient);
    // eslint-disable-next-line no-console
    console.log(formatMetrics(metrics));
  }, 30 * 1000); // 30 seconds

  // Clean up on page unload
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => {
      clearInterval(intervalId);
    });
  }
}
