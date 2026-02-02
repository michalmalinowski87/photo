/**
 * Configuration service for fetching and caching app configuration
 * Aggressively caches config in localStorage and memory
 */

const CONFIG_CACHE_KEY = "photocloud_config";
const CONFIG_CACHE_TIMESTAMP_KEY = "photocloud_config_timestamp";
const CONFIG_CACHE_TTL = 60 * 60 * 1000; // 1 hour

export interface CompanyConfig {
  company_name: string;
  company_tax_id: string;
  company_address: string;
  company_email: string;
  legal_document_publication_date: string;
}

interface AppConfig {
  paymentMethods: string[];
  company?: CompanyConfig;
  version: string;
}

// In-memory cache
let configCache: AppConfig | null = null;
let configCacheTimestamp: number = 0;

/**
 * Get cached config from localStorage
 */
function getCachedConfig(): AppConfig | null {
  try {
    if (typeof window === "undefined") {
      return null;
    }

    const cached = localStorage.getItem(CONFIG_CACHE_KEY);
    const timestampStr = localStorage.getItem(CONFIG_CACHE_TIMESTAMP_KEY);

    if (!cached || !timestampStr) {
      return null;
    }

    const timestamp = parseInt(timestampStr, 10);
    const now = Date.now();

    // Check if cache is still valid
    if (now - timestamp > CONFIG_CACHE_TTL) {
      // Cache expired, clear it
      localStorage.removeItem(CONFIG_CACHE_KEY);
      localStorage.removeItem(CONFIG_CACHE_TIMESTAMP_KEY);
      return null;
    }

    const config = JSON.parse(cached) as AppConfig;

    // Update in-memory cache
    configCache = config;
    configCacheTimestamp = timestamp;

    return config;
  } catch {
    // Invalid cache, clear it
    if (typeof window !== "undefined") {
      localStorage.removeItem(CONFIG_CACHE_KEY);
      localStorage.removeItem(CONFIG_CACHE_TIMESTAMP_KEY);
    }
    return null;
  }
}

/**
 * Store config in cache (localStorage and memory)
 */
function setCachedConfig(config: AppConfig): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const timestamp = Date.now();
    localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(config));
    localStorage.setItem(CONFIG_CACHE_TIMESTAMP_KEY, timestamp.toString());

    // Update in-memory cache
    configCache = config;
    configCacheTimestamp = timestamp;
  } catch (error) {
    // localStorage might be full or disabled, continue without caching
    console.warn("Failed to cache config:", error);
  }
}

/**
 * Fetch config from API
 */
async function fetchConfig(): Promise<AppConfig> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured");
  }

  const response = await fetch(`${apiUrl}/config`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch config: ${response.status} ${response.statusText}`);
  }

  const config = (await response.json()) as AppConfig;
  return config;
}

/**
 * Get app configuration
 * Returns cached config if available and valid, otherwise fetches from API
 * @param forceRefresh - Force refresh from API even if cache is valid
 */
export async function getConfig(forceRefresh: boolean = false): Promise<AppConfig> {
  // Check in-memory cache first (fastest)
  if (!forceRefresh && configCache && Date.now() - configCacheTimestamp < CONFIG_CACHE_TTL) {
    return configCache;
  }

  // Check localStorage cache
  if (!forceRefresh) {
    const cached = getCachedConfig();
    if (cached) {
      return cached;
    }
  }

  // Fetch from API
  try {
    const config = await fetchConfig();
    setCachedConfig(config);
    return config;
  } catch (error) {
    // If fetch fails, try to return stale cache as fallback
    const staleCache = getCachedConfig();
    if (staleCache) {
      console.warn("Failed to fetch config, using stale cache:", error);
      return staleCache;
    }

    // No cache available, throw error
    throw error;
  }
}

/**
 * Get cached config synchronously (returns null if not cached)
 * Useful for immediate access without async call
 */
export function getCachedConfigSync(): AppConfig | null {
  // Check in-memory cache first
  if (configCache && Date.now() - configCacheTimestamp < CONFIG_CACHE_TTL) {
    return configCache;
  }

  // Check localStorage
  return getCachedConfig();
}

/**
 * Invalidate config cache
 * Clears both localStorage and in-memory cache
 */
export function invalidateConfigCache(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(CONFIG_CACHE_KEY);
    localStorage.removeItem(CONFIG_CACHE_TIMESTAMP_KEY);
  }
  configCache = null;
  configCacheTimestamp = 0;
}

/**
 * Get payment methods from config
 * Returns cached payment methods if available, otherwise fetches config
 */
export async function getPaymentMethods(forceRefresh: boolean = false): Promise<string[]> {
  const config = await getConfig(forceRefresh);
  return config.paymentMethods;
}
