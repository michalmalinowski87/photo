import type { UseQueryOptions } from "@tanstack/react-query";

/**
 * Optimized React Query configuration based on data type and usage patterns
 *
 * These configurations are applied per-query-type to optimize cache performance,
 * reduce unnecessary refetches, and improve user experience.
 */

// Time constants (in milliseconds)
const SECOND = 1000;
const MINUTE = 60 * SECOND;

/**
 * Query-specific options for galleries detail
 * - Frequently accessed but changes infrequently
 * - Longer staleTime to reduce refetches
 */
export const galleryDetailOptions: Partial<
  UseQueryOptions<unknown, Error, unknown, readonly unknown[]>
> = {
  staleTime: 5 * MINUTE, // 5 minutes - gallery rarely changes
  gcTime: 30 * MINUTE, // 30 minutes - keep in cache longer
  refetchOnMount: false, // Don't refetch on mount if data is fresh (staleTime handles staleness)
  refetchOnWindowFocus: true, // Refetch when user returns to tab
  refetchOnReconnect: true, // Refetch on network reconnect
};

/**
 * Query-specific options for galleries list
 * - Changes more often than detail (new galleries added)
 * - Shorter staleTime to catch new galleries
 */
export const galleryListOptions: Partial<
  UseQueryOptions<unknown, Error, unknown, readonly unknown[]>
> = {
  staleTime: 1 * MINUTE, // 1 minute - new galleries may be added
  gcTime: 5 * MINUTE, // 5 minutes
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
};

/**
 * Query-specific options for orders lists
 * - Changes frequently (status updates, new orders)
 * - Shorter staleTime to reflect latest status
 */
export const orderListOptions: Partial<
  UseQueryOptions<unknown, Error, unknown, readonly unknown[]>
> = {
  staleTime: 2 * MINUTE, // 2 minutes - reasonable for order lists
  gcTime: 15 * MINUTE, // 15 minutes - keep in cache longer
  refetchOnMount: false, // Don't refetch on mount if data is fresh (staleTime handles staleness)
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
};

/**
 * Query-specific options for orders detail
 * - Individual order changes less frequently than lists
 * - Medium staleTime
 */
export const orderDetailOptions: Partial<
  UseQueryOptions<unknown, Error, unknown, readonly unknown[]>
> = {
  staleTime: 1.5 * MINUTE, // 1.5 minutes
  gcTime: 5 * MINUTE, // 5 minutes
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
};

/**
 * Query-specific options for wallet balance
 * - Real-time financial data
 * - Short staleTime to reflect latest balance
 */
export const walletBalanceOptions: Partial<
  UseQueryOptions<unknown, Error, unknown, readonly unknown[]>
> = {
  staleTime: 30 * SECOND, // 30 seconds - financial data should be fresh
  gcTime: 2 * MINUTE, // 2 minutes - don't keep stale financial data
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
};

/**
 * Query-specific options for presigned URLs
 * - URLs expire after ~5 minutes
 * - Long staleTime to match expiration
 */
export const presignedUrlOptions: Partial<
  UseQueryOptions<unknown, Error, unknown, readonly unknown[]>
> = {
  staleTime: 5 * MINUTE, // 5 minutes - URLs expire after ~5 minutes
  gcTime: 10 * MINUTE, // 10 minutes - keep in cache longer than staleTime
  refetchOnMount: false, // Don't refetch if already cached
  refetchOnWindowFocus: false, // Don't refetch on window focus
  refetchOnReconnect: false, // Don't refetch on reconnect
};

/**
 * Query-specific options for dashboard stats
 * - Aggregated data that changes moderately
 * - Medium staleTime
 */
export const dashboardStatsOptions: Partial<
  UseQueryOptions<unknown, Error, unknown, readonly unknown[]>
> = {
  staleTime: 1 * MINUTE, // 1 minute
  gcTime: 5 * MINUTE, // 5 minutes
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
};

/**
 * Query-specific options for packages
 * - Changes infrequently (pricing packages)
 * - Longer staleTime
 */
export const packageOptions: Partial<UseQueryOptions<unknown, Error, unknown, readonly unknown[]>> =
  {
    staleTime: 5 * MINUTE, // 5 minutes - packages change rarely
    gcTime: 15 * MINUTE, // 15 minutes
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  };

/**
 * Query-specific options for clients
 * - Changes infrequently
 * - Medium staleTime
 */
export const clientOptions: Partial<UseQueryOptions<unknown, Error, unknown, readonly unknown[]>> =
  {
    staleTime: 2 * MINUTE, // 2 minutes
    gcTime: 10 * MINUTE, // 10 minutes
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  };

/**
 * Default query options (fallback for queries without specific config)
 * These are more conservative than the global defaults
 */
export const defaultQueryOptions: Partial<
  UseQueryOptions<unknown, Error, unknown, readonly unknown[]>
> = {
  staleTime: 30 * SECOND, // 30 seconds - default from react-query.ts
  gcTime: 5 * MINUTE, // 5 minutes - default from react-query.ts
  refetchOnWindowFocus: true,
  refetchOnReconnect: false,
};
