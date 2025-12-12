// Token management - moved from api.ts
let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;

/**
 * Get a valid ID token, refreshing if necessary
 * Exported for special cases where you need a token but can't use the api-service methods
 */
export async function getValidToken(): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("Cannot get token on server side");
  }

  try {
    const { getIdToken } = await import("./auth");
    // getIdToken will automatically try to refresh if needed
    return await getIdToken(true);
  } catch (_err) {
    // getIdToken failed, try explicit refresh
    if (isRefreshing && refreshPromise) {
      // Wait for ongoing refresh
      return await refreshPromise;
    }

    isRefreshing = true;
    refreshPromise = (async () => {
      try {
        const { refreshIdToken } = await import("./auth");
        const newToken = await refreshIdToken();
        isRefreshing = false;
        refreshPromise = null;
        return newToken;
      } catch (refreshErr) {
        isRefreshing = false;
        refreshPromise = null;
        // Re-throw to trigger session expired
        throw refreshErr;
      }
    })();

    return await refreshPromise;
  }
}

/**
 * API Service - Centralized API client with automatic authentication, validation, and error handling
 *
 * Usage:
 *   import api, { formatApiError } from './lib/api-service';
 *   const galleries = await api.galleries.list();
 *   const gallery = await api.galleries.get(galleryId);
 *   await api.galleries.create(data);
 */

import type { GalleryImage } from "../types";

interface ApiError extends Error {
  status?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body?: any;
  refreshFailed?: boolean;
  originalError?: Error;
}

interface PaginationParams {
  limit?: string | number;
  offset?: string | number;
  lastKey?: string;
  page?: string | number;
  itemsPerPage?: string | number;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
  excludeDeliveryStatus?: string;
}

interface Gallery {
  galleryId: string;
  name?: string;
  clientEmail?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pricingPackage?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

// Note: Client, Package, and Order types are also defined in types/index.ts
// These types here are API-specific and include additional fields used by the API service
// The types in types/index.ts are domain models with a different structure
// Keeping both for now as they serve different purposes (API contracts vs domain models)
interface Client {
  clientId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  isCompany?: boolean;
  companyName?: string;
  nip?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface Package {
  packageId: string;
  name?: string;
  includedPhotos?: number;
  pricePerExtraPhoto?: number;
  price?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface Order {
  orderId: string;
  galleryId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface ListResponse<T> {
  items: T[];
  hasMore?: boolean;
  lastKey?: string | null;
  nextCursor?: string | null;
}

class ApiService {
  private baseUrl: string | null = null;
  // Request deduplication cache - prevents duplicate requests within a short time window
  // This helps with React StrictMode double-invocation in development
  private pendingRequests: Map<string, Promise<unknown>> = new Map();
  private readonly DEDUP_WINDOW_MS = 100; // 100ms window for deduplication

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    if (typeof window !== "undefined") {
      this.baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
      if (!this.baseUrl) {
        console.error(
          "NEXT_PUBLIC_API_URL is not configured. API requests will fail. Please set NEXT_PUBLIC_API_URL in your environment variables."
        );
      }
    }
  }

  /**
   * Generate a cache key for request deduplication
   */
  private getRequestKey(endpoint: string, options: RequestInit): string {
    const method = options.method ?? "GET";
    const body = options.body ?? "";
    // Create a simple hash of the request
    return `${method}:${endpoint}:${typeof body === "string" ? body : JSON.stringify(body)}`;
  }

  /**
   * Internal method to make authenticated API requests
   * Handles token fetching, error parsing, and response handling
   * Includes request deduplication to prevent duplicate calls from React StrictMode
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async _request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    // Re-initialize baseUrl if it's not set (in case env var was set after initialization)
    if (!this.baseUrl && typeof window !== "undefined") {
      this.baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
    }

    if (!this.baseUrl) {
      const error = new Error(
        "API URL not configured. Please set NEXT_PUBLIC_API_URL environment variable."
      ) as ApiError;
      error.status = 500;
      // Don't throw immediately - log and prevent the request
      console.error("[ApiService] API URL not configured. Request to", endpoint, "was blocked.");
      throw error;
    }

    const url = `${this.baseUrl}${endpoint}`;
    const requestKey = this.getRequestKey(endpoint, options);

    // Check if there's a pending identical request
    const pendingRequest = this.pendingRequests.get(requestKey);
    if (pendingRequest) {
      // Return the existing promise instead of making a new request
      return pendingRequest as Promise<T>;
    }

    // Create the request promise and cache it for deduplication
    const requestPromise = (async (): Promise<T> => {
      // Get valid token (will refresh if needed)
      const token = await getValidToken();

      const defaultHeaders: HeadersInit = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };

      const config: RequestInit = {
        ...options,
        headers: {
          ...defaultHeaders,
          ...options.headers,
        },
      };

      // Retry configuration for 503 errors only
      const MAX_RETRIES = 3;
      const RETRY_DELAYS = [1000, 2000, 3000]; // Exponential backoff: 1s, 2s, 3s

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const response = await fetch(url, config);
          const contentType = response.headers.get("content-type");
          const isJson = contentType?.includes("application/json") ?? false;

          let body: unknown;
          try {
            body = isJson ? await response.json() : await response.text();
          } catch (_e) {
            body = null;
          }

          // Handle 503 Service Unavailable - retry with exponential backoff
          if (response.status === 503 && attempt < MAX_RETRIES) {
            const delay = RETRY_DELAYS[attempt] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1];
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue; // Retry the request
          }

          // Handle 401 - try refresh and retry once
          if (response.status === 401 && typeof window !== "undefined") {
            try {
              const newToken = await getValidToken();
              const retryConfig: RequestInit = {
                ...config,
                headers: {
                  ...config.headers,
                  Authorization: `Bearer ${newToken}`,
                },
              };

              const retryResponse = await fetch(url, retryConfig);
              const retryContentType = retryResponse.headers.get("content-type");
              const retryIsJson = retryContentType?.includes("application/json") ?? false;

              let retryBody: unknown;
              try {
                retryBody = retryIsJson ? await retryResponse.json() : await retryResponse.text();
              } catch (_e) {
                retryBody = null;
              }

              if (!retryResponse.ok) {
                const retryBodyObj = retryBody as { error?: string; message?: string } | null;
                const error: ApiError = new Error(
                  retryBodyObj?.error ?? retryBodyObj?.message ?? `HTTP ${retryResponse.status}`
                );
                error.status = retryResponse.status;
                error.body = retryBody;
                throw error;
              }

              return retryBody as T;
            } catch (_refreshErr) {
              // Refresh failed - trigger session expired event
              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("session-expired", {
                    detail: { returnUrl: window.location.pathname + window.location.search },
                  })
                );
              }

              const error: ApiError = new Error("Session expired. Please log in again.");
              error.status = 401;
              error.body = body;
              error.refreshFailed = true;
              throw error;
            }
          }

          if (!response.ok) {
            const bodyObj = body as { error?: string; message?: string } | null;
            const error: ApiError = new Error(
              bodyObj?.error ??
                bodyObj?.message ??
                `HTTP ${response.status}: ${response.statusText}`
            );
            error.status = response.status;
            error.body = body;
            throw error;
          }

          return body as T;
        } catch (error) {
          // Don't retry network errors (including CORS) - they won't be fixed by retrying
          // Only retry 503 errors (handled above in the response.status check)
          // If we get here and it's not a 503, throw immediately
          const apiError = error as ApiError;
          if (apiError.status === 503 && attempt < MAX_RETRIES) {
            // This should have been caught above, but handle it here as fallback
            const delay = RETRY_DELAYS[attempt] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1];
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }

          // For all other errors (network, CORS, etc.), throw immediately
          if (apiError.status) {
            throw apiError;
          }
          // Network or other errors (including CORS)
          const networkError: ApiError = new Error(`Network error: ${(error as Error).message}`);
          networkError.originalError = error as Error;
          throw networkError;
        }
      }

      // This should never happen (all paths should throw or return)
      throw new Error("Request failed after retries");
    })();

    // Store the promise in cache for deduplication
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    this.pendingRequests.set(requestKey, requestPromise);

    // Clean up the cache after request completes (success or failure)
    // Use void operator to explicitly indicate we're intentionally not awaiting this cleanup
    void requestPromise
      .finally(() => {
        // Use setTimeout to allow other identical requests to join before cleanup
        setTimeout(() => {
          this.pendingRequests.delete(requestKey);
        }, this.DEDUP_WINDOW_MS);
      })
      .catch(() => {
        // Silently handle any errors in cleanup - this is non-critical cleanup code
      });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return requestPromise;
  }

  /**
   * Format error for display
   */
  formatError(error: ApiError | Error): string {
    const apiError = error as ApiError;

    // Check for Stripe configuration errors
    const errorMessage = apiError.message || error.message || "";
    const lowerMessage = errorMessage.toLowerCase();
    if (
      lowerMessage.includes("stripe not configured") ||
      lowerMessage.includes("stripe nie jest skonfigurowany")
    ) {
      return "System płatności nie jest skonfigurowany. Skontaktuj się z administratorem systemu.";
    }

    // Check error body for Stripe configuration errors
    if (apiError.body) {
      try {
        let bodyObj: unknown;
        if (typeof apiError.body === "string") {
          bodyObj = JSON.parse(apiError.body) as unknown;
        } else {
          bodyObj = apiError.body;
        }
        if (bodyObj && typeof bodyObj === "object" && bodyObj !== null) {
          const bodyObjTyped = bodyObj as { error?: unknown; message?: unknown };
          const bodyError = bodyObjTyped.error ?? bodyObjTyped.message;
          let bodyErrorStr = "";
          if (typeof bodyError === "string") {
            bodyErrorStr = bodyError;
          } else if (bodyError !== null && bodyError !== undefined) {
            // Skip non-string, non-null, non-undefined values to avoid base-to-string warning
            bodyErrorStr = "";
          }
          const lowerBodyError = bodyErrorStr.toLowerCase();
          if (
            lowerBodyError.includes("stripe not configured") ||
            lowerBodyError.includes("stripe nie jest skonfigurowany")
          ) {
            return "System płatności nie jest skonfigurowany. Skontaktuj się z administratorem systemu.";
          }
        }
      } catch (_e) {
        // If parsing fails, continue with default handling
      }
    }

    if (apiError.status) {
      const bodyStr =
        typeof apiError.body === "string" ? apiError.body : JSON.stringify(apiError.body);
      return apiError.message || `Error ${apiError.status}${bodyStr ? ` - ${bodyStr}` : ""}`;
    }
    return error.message || "An unexpected error occurred";
  }

  // ==================== GALLERIES ====================

  galleries = {
    /**
     * List all galleries
     * @param filter - Optional filter: 'unpaid', 'wyslano', 'wybrano', 'prosba-o-zmiany', 'gotowe-do-wysylki', 'dostarczone'
     * @param pagination - Optional pagination params: limit (default 50), cursor
     * @param search - Optional search query (searches name, date, client email, first/last names)
     * @param sortBy - Optional sort field: 'name', 'date', 'expiration' (default: 'date')
     * @param sortOrder - Optional sort order: 'asc', 'desc' (default: 'desc')
     */
    list: async (
      filter?: string,
      pagination?: { limit?: number; cursor?: string | null },
      search?: string,
      sortBy?: "name" | "date" | "expiration",
      sortOrder?: "asc" | "desc"
    ): Promise<ListResponse<Gallery> | Gallery[]> => {
      const params = new URLSearchParams();
      if (filter) {
        params.append("filter", filter);
      }
      if (pagination?.limit) {
        params.append("limit", pagination.limit.toString());
      }
      if (pagination?.cursor) {
        params.append("cursor", pagination.cursor);
      }
      if (search) {
        params.append("search", search);
      }
      if (sortBy) {
        params.append("sortBy", sortBy);
      }
      if (sortOrder) {
        params.append("sortOrder", sortOrder);
      }
      const queryString = params.toString();
      const url = queryString ? `/galleries?${queryString}` : "/galleries";
      return await this._request(url);
    },

    /**
     * Get a specific gallery
     */
    get: async (galleryId: string): Promise<Gallery> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      return await this._request<Gallery>(`/galleries/${galleryId}`);
    },

    /**
     * Get only the cover photo URL for a gallery (lightweight endpoint)
     */
    getCoverPhoto: async (galleryId: string): Promise<{ coverPhotoUrl: string | null }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      return await this._request<{ coverPhotoUrl: string | null }>(
        `/galleries/${galleryId}/cover-photo`
      );
    },

    /**
     * Create a new gallery
     */
    create: async (data: Partial<Gallery>): Promise<Gallery> => {
      if (!data) {
        throw new Error("Gallery data is required");
      }
      return await this._request<Gallery>("/galleries", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },

    /**
     * Update a gallery
     */
    update: async (galleryId: string, data: Partial<Gallery>): Promise<Gallery> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!data) {
        throw new Error("Gallery data is required");
      }
      return await this._request<Gallery>(`/galleries/${galleryId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },

    /**
     * Delete a gallery
     */
    delete: async (galleryId: string): Promise<void> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      return await this._request<void>(`/galleries/${galleryId}`, {
        method: "DELETE",
      });
    },

    /**
     * Dev endpoint: Set gallery expiry date/time and create EventBridge schedule
     * Only available in dev/staging environments
     */
    setExpiry: async (
      galleryId: string,
      expiresAt: string
    ): Promise<{
      galleryId: string;
      expiresAt: string;
      scheduleName: string;
      message: string;
    }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!expiresAt) {
        throw new Error("expiresAt is required");
      }
      return await this._request(`/galleries/${galleryId}/dev/set-expiry`, {
        method: "POST",
        body: JSON.stringify({ expiresAt }),
      });
    },

    /**
     * Get gallery images
     * @param sizes - Optional comma-separated list of sizes to request (thumb,preview,bigthumb)
     *                 If not provided, all sizes are returned (backward compatible)
     * @param pagination - Optional pagination params: limit (default 50), cursor
     * @param filterOrderId - Optional orderId to filter images by specific order
     * @param filterUnselected - Optional flag to filter only unselected images (not in any delivered order)
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getImages: async (
      galleryId: string,
      sizes?: string,
      pagination?: { limit?: number; cursor?: string | null },
      filterOrderId?: string,
      filterUnselected?: boolean
    ): Promise<{ images: GalleryImage[]; hasMore?: boolean; nextCursor?: string | null }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      const params = new URLSearchParams();
      if (sizes) {
        params.append("sizes", sizes);
      }
      if (pagination?.limit) {
        params.append("limit", pagination.limit.toString());
      }
      if (pagination?.cursor) {
        params.append("cursor", pagination.cursor);
      }
      if (filterOrderId) {
        params.append("filterOrderId", filterOrderId);
      }
      if (filterUnselected) {
        params.append("filterUnselected", "true");
      }
      const queryString = params.toString();
      const url = queryString
        ? `/galleries/${galleryId}/images?${queryString}`
        : `/galleries/${galleryId}/images`;
      return await this._request(url);
    },

    /**
     * Delete gallery images (handles both single and batch operations)
     * For single deletion, pass an array with one image key: [imageKey]
     */
    deleteImage: async (
      galleryId: string,
      imageKeys: string[]
    ): Promise<{
      message: string;
      count: number;
      originalsBytesUsed: number;
      originalsLimitBytes: number;
      originalsUsedMB: string;
      originalsLimitMB: string;
    }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!Array.isArray(imageKeys) || imageKeys.length === 0) {
        throw new Error("Image keys array is required and must not be empty");
      }
      // Use batch endpoint (works for both single and batch - backend single delete already uses batch Lambda)
      return await this._request(`/galleries/${galleryId}/photos/batch-delete`, {
        method: "POST",
        body: JSON.stringify({ filenames: imageKeys }),
      });
    },

    /**
     * Send gallery link to client
     */
    sendToClient: async (galleryId: string): Promise<{ isReminder?: boolean }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      return await this._request(`/galleries/${galleryId}/send-to-client`, {
        method: "POST",
      });
    },

    /**
     * Pay for gallery
     */
    pay: async (
      galleryId: string,
      options: {
        dryRun?: boolean;
        plan?: string;
        priceCents?: number;
        redirectUrl?: string;
      } = {}
    ): Promise<{
      checkoutUrl?: string;
      paid?: boolean;
      totalAmountCents?: number;
      walletAmountCents?: number;
      stripeAmountCents?: number;
      paymentMethod?: "WALLET" | "STRIPE";
      stripeFeeCents?: number;
      dryRun?: boolean;
    }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      return await this._request(`/galleries/${galleryId}/pay`, {
        method: "POST",
        body: JSON.stringify(options),
      });
    },

    /**
     * Update gallery client password
     */
    updateClientPassword: async (
      galleryId: string,
      password: string,
      clientEmail: string
    ): Promise<void> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!password || !clientEmail) {
        throw new Error("Password and client email are required");
      }
      return await this._request(`/galleries/${galleryId}/client-password`, {
        method: "PATCH",
        body: JSON.stringify({ password, clientEmail }),
      });
    },

    /**
     * Update gallery pricing package
     */
    updatePricingPackage: async (
      galleryId: string,
      pricingPackage: {
        packageName?: string;
        includedCount: number;
        extraPriceCents: number;
        packagePriceCents: number;
      }
    ): Promise<{ success: boolean }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!pricingPackage) {
        throw new Error("Pricing package is required");
      }
      const result = await this._request<{ success: boolean }>(
        `/galleries/${galleryId}/pricing-package`,
        {
          method: "PATCH",
          body: JSON.stringify({ pricingPackage }),
        }
      );
      return result;
    },

    /**
     * Check if gallery has delivered orders
     */
    checkDeliveredOrders: async (
      galleryId: string
    ): Promise<ListResponse<Order> | { items: Order[] }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      return await this._request(`/galleries/${galleryId}/orders/delivered`);
    },

    /**
     * Calculate plan for gallery based on uploaded size
     */
    calculatePlan: async (
      galleryId: string,
      duration: string = "1m"
    ): Promise<{
      suggestedPlan: unknown;
      originalsLimitBytes: number;
      finalsLimitBytes: number;
      uploadedSizeBytes: number;
      selectionEnabled: boolean;
      usagePercentage?: number;
      isNearCapacity?: boolean;
      isAtCapacity?: boolean;
      exceedsLargestPlan?: boolean;
      nextTierPlan?: {
        planKey: string;
        name: string;
        priceCents: number;
        storageLimitBytes: number;
        storage: string;
      };
    }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      return await this._request(`/galleries/${galleryId}/calculate-plan?duration=${duration}`);
    },

    /**
     * Validate upload limits after upload completes
     */
    validateUploadLimits: async (
      galleryId: string
    ): Promise<{
      withinLimit: boolean;
      uploadedSizeBytes: number;
      originalsLimitBytes?: number;
      excessBytes?: number;
      nextTierPlan?: string;
      nextTierPriceCents?: number;
      nextTierLimitBytes?: number;
      isSelectionGallery?: boolean;
    }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      return await this._request(`/galleries/${galleryId}/validate-upload-limits`, {
        method: "POST",
      });
    },

    /**
     * Upgrade gallery plan (for paid galleries only - pays difference)
     */
    upgradePlan: async (
      galleryId: string,
      data: { plan: string; redirectUrl?: string }
    ): Promise<{
      paid: boolean;
      checkoutUrl?: string;
      transactionId: string;
      totalAmountCents: number;
      walletAmountCents: number;
      stripeAmountCents: number;
      currentPlan: string;
      newPlan: string;
      currentPriceCents: number;
      newPriceCents: number;
      priceDifferenceCents: number;
      message: string;
    }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!data?.plan) {
        throw new Error("Plan is required");
      }
      return await this._request(`/galleries/${galleryId}/upgrade-plan`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
  };

  // ==================== ORDERS ====================

  orders = {
    /**
     * List all orders
     */
    list: async (params: PaginationParams = {}): Promise<ListResponse<Order> | Order[]> => {
      const queryString = new URLSearchParams(params as Record<string, string>).toString();
      const endpoint = queryString ? `/orders?${queryString}` : "/orders";
      return await this._request(endpoint);
    },

    /**
     * Get orders for a specific gallery
     */
    getByGallery: async (galleryId: string): Promise<ListResponse<Order> | { items: Order[] }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      return await this._request(`/galleries/${galleryId}/orders`);
    },

    /**
     * Get a specific order
     */
    get: async (galleryId: string, orderId: string): Promise<Order> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!orderId) {
        throw new Error("Order ID is required");
      }
      return await this._request<Order>(`/galleries/${galleryId}/orders/${orderId}`);
    },

    /**
     * Update an order
     */
    update: async (galleryId: string, orderId: string, data: Partial<Order>): Promise<Order> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!orderId) {
        throw new Error("Order ID is required");
      }
      if (!data) {
        throw new Error("Order data is required");
      }
      return await this._request<Order>(`/galleries/${galleryId}/orders/${orderId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },

    /**
     * Approve change request
     */
    approveChangeRequest: async (galleryId: string, orderId: string): Promise<void> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!orderId) {
        throw new Error("Order ID is required");
      }
      return await this._request(`/galleries/${galleryId}/orders/${orderId}/approve-change`, {
        method: "POST",
      });
    },

    /**
     * Deny change request
     */
    denyChangeRequest: async (
      galleryId: string,
      orderId: string,
      reason?: string,
      preventFutureChangeRequests?: boolean
    ): Promise<void> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!orderId) {
        throw new Error("Order ID is required");
      }
      return await this._request(`/galleries/${galleryId}/orders/${orderId}/deny-change`, {
        method: "POST",
        body: JSON.stringify({
          reason: reason ?? undefined,
          preventFutureChangeRequests: preventFutureChangeRequests ?? false,
        }),
      });
    },

    /**
     * Get order status (lightweight endpoint for refreshing status after uploads/deletes)
     */
    getOrderStatus: async (
      galleryId: string,
      orderId: string
    ): Promise<{
      orderId: string;
      galleryId: string;
      deliveryStatus: string;
      paymentStatus: string;
      amount: number;
      state: string;
      createdAt: string;
      updatedAt: string;
    }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!orderId) {
        throw new Error("Order ID is required");
      }
      return await this._request(`/galleries/${galleryId}/orders/${orderId}/status`);
    },

    /**
     * Get final images for an order
     */
    getFinalImages: async (
      galleryId: string,
      orderId: string,
      options?: { limit?: number; cursor?: string | null }
    ): Promise<{
      images: GalleryImage[];
      count?: number;
      totalCount?: number;
      hasMore?: boolean;
      nextCursor?: string | null;
    }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!orderId) {
        throw new Error("Order ID is required");
      }
      const params = new URLSearchParams();
      if (options?.limit) {
        params.append("limit", options.limit.toString());
      }
      if (options?.cursor) {
        params.append("cursor", options.cursor);
      }
      const queryString = params.toString();
      const url = queryString
        ? `/galleries/${galleryId}/orders/${orderId}/final/images?${queryString}`
        : `/galleries/${galleryId}/orders/${orderId}/final/images`;
      return await this._request(url);
    },

    /**
     * Delete final images (handles both single and batch operations)
     * For single deletion, pass an array with one image key: [imageKey]
     */
    deleteFinalImage: async (
      galleryId: string,
      orderId: string,
      imageKeys: string[]
    ): Promise<{
      message: string;
      galleryId: string;
      orderId: string;
      count: number;
      finalsBytesUsed: number;
      finalsLimitBytes: number;
      finalsUsedMB: string;
      finalsLimitMB: string;
    }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!orderId) {
        throw new Error("Order ID is required");
      }
      if (!Array.isArray(imageKeys) || imageKeys.length === 0) {
        throw new Error("Image keys array is required and must not be empty");
      }
      // Use batch endpoint for final images (works for both single and batch)
      return await this._request(`/galleries/${galleryId}/photos/batch-delete`, {
        method: "POST",
        body: JSON.stringify({
          filenames: imageKeys,
          orderId,
          type: "final",
        }),
      });
    },

    /**
     * Cleanup originals, previews, and thumbnails for selected photos
     * Only available for selection galleries
     */
    cleanupOriginals: async (galleryId: string, orderId: string): Promise<void> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!orderId) {
        throw new Error("Order ID is required");
      }
      return await this._request(`/galleries/${galleryId}/orders/${orderId}/cleanup-originals`, {
        method: "POST",
      });
    },

    /**
     * Mark order as paid
     */
    markPaid: async (
      galleryId: string,
      orderId: string
    ): Promise<{ orderId: string; galleryId: string; paymentStatus: string; paidAt: string }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!orderId) {
        throw new Error("Order ID is required");
      }
      return await this._request(`/galleries/${galleryId}/orders/${orderId}/mark-paid`, {
        method: "POST",
      });
    },

    /**
     * Send final link to client
     */
    sendFinalLink: async (
      galleryId: string,
      orderId: string
    ): Promise<{
      galleryId: string;
      orderId: string;
      sent: boolean;
      link: string;
      deliveryStatus: string;
      deliveredAt: string;
    }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!orderId) {
        throw new Error("Order ID is required");
      }
      return await this._request(`/galleries/${galleryId}/orders/${orderId}/send-final-link`, {
        method: "POST",
      });
    },

    /**
     * Mark order as canceled
     */
    markCanceled: async (
      galleryId: string,
      orderId: string
    ): Promise<{
      galleryId: string;
      orderId: string;
      deliveryStatus: string;
      canceledAt: string;
    }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!orderId) {
        throw new Error("Order ID is required");
      }
      return await this._request(`/galleries/${galleryId}/orders/${orderId}/mark-canceled`, {
        method: "POST",
      });
    },

    /**
     * Mark order as refunded
     */
    markRefunded: async (
      galleryId: string,
      orderId: string
    ): Promise<{
      galleryId: string;
      orderId: string;
      paymentStatus: string;
      refundedAt: string;
    }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!orderId) {
        throw new Error("Order ID is required");
      }
      return await this._request(`/galleries/${galleryId}/orders/${orderId}/mark-refunded`, {
        method: "POST",
      });
    },

    /**
     * Mark order as partially paid
     */
    markPartiallyPaid: async (
      galleryId: string,
      orderId: string
    ): Promise<{
      orderId: string;
      galleryId: string;
      paymentStatus: string;
      partiallyPaidAt: string;
    }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!orderId) {
        throw new Error("Order ID is required");
      }
      return await this._request(`/galleries/${galleryId}/orders/${orderId}/mark-partially-paid`, {
        method: "POST",
      });
    },

    /**
     * Download order ZIP (returns URL or handles 202 for async generation)
     * Supports polling for 202 status codes
     */
    downloadZip: async (
      galleryId: string,
      orderId: string
    ): Promise<{
      status?: number;
      generating?: boolean;
      blob?: Blob;
      url?: string;
      filename?: string;
      zip?: string; // Base64 ZIP for backward compatibility
    }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!orderId) {
        throw new Error("Order ID is required");
      }
      const token = await getValidToken();
      const url = `${this.baseUrl}/galleries/${galleryId}/orders/${orderId}/zip`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 202) {
        return { status: 202, generating: true };
      }

      if (!response.ok) {
        const error: ApiError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        error.status = response.status;
        throw error;
      }

      const contentType = response.headers.get("content-type");
      const isZip = contentType?.includes("application/zip") ?? false;

      if (isZip) {
        const blob = await response.blob();
        const contentDisposition = response.headers.get("content-disposition");
        let filename = `${orderId}.zip`;
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (filenameMatch?.[1]) {
            filename = filenameMatch[1].replace(/['"]/g, "");
          }
        }
        return { blob, url: URL.createObjectURL(blob), filename };
      } else {
        // JSON response (backward compatibility with base64 ZIP)
        const data = (await response.json()) as { zip?: string; filename?: string };
        if (data.zip) {
          return { zip: data.zip, filename: data.filename ?? `${orderId}.zip` };
        }
        throw new Error("No ZIP data available");
      }
    },

    /**
     * Download final images ZIP for an order
     * Supports polling for 202 status codes
     */
    downloadFinalZip: async (
      galleryId: string,
      orderId: string
    ): Promise<{
      status?: number;
      generating?: boolean;
      blob?: Blob;
      url?: string;
      filename?: string;
      zip?: string; // Base64 ZIP for backward compatibility
    }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!orderId) {
        throw new Error("Order ID is required");
      }
      const token = await getValidToken();
      const url = `${this.baseUrl}/galleries/${galleryId}/orders/${orderId}/final/zip`;
      const response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 202) {
        return { status: 202, generating: true };
      }

      if (!response.ok) {
        const error: ApiError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        error.status = response.status;
        throw error;
      }

      const contentType = response.headers.get("content-type");
      const isZip = contentType?.includes("application/zip") ?? false;

      if (isZip) {
        const blob = await response.blob();
        const contentDisposition = response.headers.get("content-disposition");
        let filename = `gallery-${galleryId}-order-${orderId}-final.zip`;
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (filenameMatch?.[1]) {
            filename = filenameMatch[1].replace(/['"]/g, "");
          }
        }
        return { blob, url: URL.createObjectURL(blob), filename };
      } else {
        // JSON response (backward compatibility with base64 ZIP)
        const data = (await response.json()) as { zip?: string; filename?: string };
        if (data.zip) {
          return {
            zip: data.zip,
            filename: data.filename ?? `gallery-${galleryId}-order-${orderId}-final.zip`,
          };
        }
        throw new Error("No ZIP data available");
      }
    },
  };

  // ==================== CLIENTS ====================

  clients = {
    /**
     * List clients
     * @param params - Pagination and search params, including optional sortBy ('name' | 'date') and sortOrder ('asc' | 'desc')
     */
    list: async (params: PaginationParams = {}): Promise<ListResponse<Client>> => {
      const queryString = new URLSearchParams(params as Record<string, string>).toString();
      const endpoint = queryString ? `/clients?${queryString}` : "/clients";
      return await this._request<ListResponse<Client>>(endpoint);
    },

    /**
     * Get a specific client
     */
    get: async (clientId: string): Promise<Client> => {
      if (!clientId) {
        throw new Error("Client ID is required");
      }
      return await this._request<Client>(`/clients/${clientId}`);
    },

    /**
     * Create a client
     */
    create: async (data: Partial<Client>): Promise<Client> => {
      if (!data) {
        throw new Error("Client data is required");
      }
      return await this._request<Client>("/clients", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },

    /**
     * Update a client
     */
    update: async (clientId: string, data: Partial<Client>): Promise<Client> => {
      if (!clientId) {
        throw new Error("Client ID is required");
      }
      if (!data) {
        throw new Error("Client data is required");
      }
      return await this._request<Client>(`/clients/${clientId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },

    /**
     * Delete a client
     */
    delete: async (clientId: string): Promise<void> => {
      if (!clientId) {
        throw new Error("Client ID is required");
      }
      return await this._request<void>(`/clients/${clientId}`, {
        method: "DELETE",
      });
    },
  };

  // ==================== PACKAGES ====================

  packages = {
    /**
     * List packages
     * @param pagination - Optional pagination params: limit (default 20), cursor
     * @param search - Optional search query to filter by name
     * @param sortBy - Optional sort field: name, price, pricePerExtraPhoto, date
     * @param sortOrder - Optional sort order: asc, desc
     */
    list: async (
      pagination?: { limit?: number; cursor?: string | null },
      search?: string,
      sortBy?: "name" | "price" | "pricePerExtraPhoto" | "date",
      sortOrder?: "asc" | "desc"
    ): Promise<ListResponse<Package>> => {
      const params = new URLSearchParams();
      if (pagination?.limit) {
        params.append("limit", pagination.limit.toString());
      }
      if (pagination?.cursor) {
        params.append("cursor", pagination.cursor);
      }
      if (search) {
        params.append("search", search);
      }
      if (sortBy) {
        params.append("sortBy", sortBy);
      }
      if (sortOrder) {
        params.append("sortOrder", sortOrder);
      }
      const queryString = params.toString();
      const url = queryString ? `/packages?${queryString}` : "/packages";
      return await this._request<ListResponse<Package>>(url);
    },

    /**
     * Get a specific package
     */
    get: async (packageId: string): Promise<Package> => {
      if (!packageId) {
        throw new Error("Package ID is required");
      }
      return await this._request<Package>(`/packages/${packageId}`);
    },

    /**
     * Create a package
     */
    create: async (data: Partial<Package>): Promise<Package> => {
      if (!data) {
        throw new Error("Package data is required");
      }
      return await this._request<Package>("/packages", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },

    /**
     * Update a package
     */
    update: async (packageId: string, data: Partial<Package>): Promise<Package> => {
      if (!packageId) {
        throw new Error("Package ID is required");
      }
      if (!data) {
        throw new Error("Package data is required");
      }
      return await this._request<Package>(`/packages/${packageId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },

    /**
     * Delete a package
     */
    delete: async (packageId: string): Promise<void> => {
      if (!packageId) {
        throw new Error("Package ID is required");
      }
      return await this._request<void>(`/packages/${packageId}`, {
        method: "DELETE",
      });
    },
  };

  // ==================== WALLET ====================

  wallet = {
    /**
     * Get wallet balance
     */
    getBalance: async (): Promise<{ balanceCents: number }> => {
      return await this._request("/wallet/balance");
    },

    /**
     * Get wallet transactions
     */
    getTransactions: async (
      params: PaginationParams = {}
    ): Promise<{ transactions: unknown[]; hasMore?: boolean; lastKey?: string | null }> => {
      const queryString = new URLSearchParams(params as Record<string, string>).toString();
      const endpoint = queryString ? `/wallet/transactions?${queryString}` : "/wallet/transactions";
      return await this._request(endpoint);
    },
  };

  // ==================== DASHBOARD ====================

  dashboard = {
    /**
     * Get dashboard statistics
     */
    getStats: async (): Promise<{
      deliveredOrders: number;
      clientSelectingOrders: number;
      readyToShipOrders: number;
      totalRevenue: number;
    }> => {
      return await this._request("/dashboard/stats");
    },

    /**
     * Get order statuses for CHANGES_REQUESTED orders (for polling)
     * Supports ETag/304 for efficient polling
     */
    getOrderStatuses: async (
      etag?: string
    ): Promise<{
      orders: Array<{
        orderId: string;
        galleryId: string;
        deliveryStatus: string;
        paymentStatus: string;
        amount: number;
        state: string;
        updatedAt: string;
      }>;
      timestamp: string;
      etag?: string;
    }> => {
      // Re-initialize baseUrl if it's not set
      if (!this.baseUrl && typeof window !== "undefined") {
        this.baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
      }

      if (!this.baseUrl) {
        const error = new Error(
          "API URL not configured. Please set NEXT_PUBLIC_API_URL environment variable."
        ) as ApiError;
        error.status = 500;
        throw error;
      }

      const url = `${this.baseUrl}/dashboard/status`;
      const token = await getValidToken();

      const headers: HeadersInit = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };

      if (etag) {
        headers["If-None-Match"] = etag;
      }

      const response = await fetch(url, {
        method: "GET",
        headers,
      });

      // Read ETag from response headers
      const responseEtag =
        response.headers.get("ETag") ?? response.headers.get("etag") ?? undefined;

      // Handle 304 Not Modified - return empty orders (no changes)
      if (response.status === 304) {
        return {
          orders: [],
          timestamp: new Date().toISOString(),
          etag: responseEtag ?? etag, // Use response ETag or keep existing
        };
      }

      // Handle other non-ok responses
      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        const isJson = contentType?.includes("application/json") ?? false;
        let body: unknown;
        try {
          body = isJson ? await response.json() : await response.text();
        } catch (_e) {
          body = null;
        }

        const bodyObj = body as { error?: string; message?: string } | null;
        const error: ApiError = new Error(
          bodyObj?.error ?? bodyObj?.message ?? `HTTP ${response.status}: ${response.statusText}`
        );
        error.status = response.status;
        error.body = body;
        throw error;
      }

      // Parse successful response
      const contentType = response.headers.get("content-type");
      const isJson = contentType?.includes("application/json") ?? false;

      if (!isJson) {
        const error: ApiError = new Error("Expected JSON response");
        error.status = response.status;
        throw error;
      }

      const data = (await response.json()) as {
        orders: Array<{
          orderId: string;
          galleryId: string;
          deliveryStatus: string;
          paymentStatus: string;
          amount: number;
          state: string;
          updatedAt: string;
        }>;
        timestamp: string;
      };
      return {
        ...data,
        etag: responseEtag ?? etag, // Use response ETag or fall back to existing (shouldn't happen, but safe)
      };
    },
  };

  // ==================== PAYMENTS ====================

  payments = {
    /**
     * Create checkout session
     */
    createCheckout: async (data: {
      amountCents: number;
      type: string;
      redirectUrl?: string;
    }): Promise<{ checkoutUrl: string }> => {
      if (!data) {
        throw new Error("Payment data is required");
      }
      return await this._request("/payments/checkout", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
  };

  // ==================== UPLOADS ====================

  uploads = {
    /**
     * Get presigned URL for upload
     */
    getPresignedUrl: async (data: {
      galleryId: string;
      orderId?: string;
      key: string;
      contentType: string;
      fileSize: number;
    }): Promise<{ url: string }> => {
      if (!data) {
        throw new Error("Upload data is required");
      }
      if (!data.galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!data.key) {
        throw new Error("File key is required");
      }
      return await this._request("/uploads/presign", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },

    /**
     * Get batch presigned URLs for multiple uploads (optimized to reduce API Gateway load)
     */
    getPresignedUrlsBatch: async (data: {
      galleryId: string;
      files: Array<{
        key: string;
        contentType?: string;
        fileSize?: number;
        includeThumbnails?: boolean;
      }>;
    }): Promise<{
      urls: Array<{
        key: string;
        url: string;
        objectKey: string;
        expiresInSeconds: number;
        previewUrl?: string;
        previewKey?: string;
        bigThumbUrl?: string;
        bigThumbKey?: string;
        thumbnailUrl?: string;
        thumbnailKey?: string;
      }>;
      count: number;
    }> => {
      if (!data) {
        throw new Error("Upload data is required");
      }
      if (!data.galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!data.files || !Array.isArray(data.files) || data.files.length === 0) {
        throw new Error("Files array is required");
      }
      if (data.files.length > 50) {
        throw new Error("Maximum 50 files per batch request");
      }
      return await this._request("/uploads/presign-batch", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },

    /**
     * Get presigned URL for final image upload
     */
    getFinalImagePresignedUrl: async (
      galleryId: string,
      orderId: string,
      data: { key: string; contentType: string }
    ): Promise<{ url: string }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!orderId) {
        throw new Error("Order ID is required");
      }
      if (!data) {
        throw new Error("Upload data is required");
      }
      if (!data.key) {
        throw new Error("File key is required");
      }
      return await this._request(`/galleries/${galleryId}/orders/${orderId}/final/upload`, {
        method: "POST",
        body: JSON.stringify({
          key: data.key,
          contentType: data.contentType ?? "image/jpeg",
        }),
      });
    },

    /**
     * Get batch presigned URLs for multiple final image uploads (optimized to reduce API Gateway load)
     */
    getFinalImagePresignedUrlsBatch: async (
      galleryId: string,
      orderId: string,
      data: {
        files: Array<{
          key: string;
          contentType?: string;
          fileSize?: number;
          includeThumbnails?: boolean;
        }>;
      }
    ): Promise<{
      urls: Array<{
        key: string;
        url: string;
        objectKey: string;
        expiresInSeconds: number;
        previewUrl?: string;
        previewKey?: string;
        bigThumbUrl?: string;
        bigThumbKey?: string;
        thumbnailUrl?: string;
        thumbnailKey?: string;
      }>;
      count: number;
    }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!orderId) {
        throw new Error("Order ID is required");
      }
      if (!data?.files || !Array.isArray(data.files) || data.files.length === 0) {
        throw new Error("Files array is required");
      }
      if (data.files.length > 50) {
        throw new Error("Maximum 50 files per batch request");
      }
      return await this._request(`/galleries/${galleryId}/orders/${orderId}/final/upload-batch`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },

    /**
     * Mark final upload as complete (triggers backend processing)
     */
    markFinalUploadComplete: async (galleryId: string, orderId: string): Promise<void> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!orderId) {
        throw new Error("Order ID is required");
      }
      return await this._request(
        `/galleries/${galleryId}/orders/${orderId}/final/upload-complete`,
        {
          method: "POST",
        }
      );
    },

    /**
     * Create multipart upload for large files
     */
    createMultipartUpload: async (
      galleryId: string,
      data: {
        orderId?: string;
        files: Array<{
          key: string;
          contentType?: string;
          fileSize: number;
          partSize?: number;
        }>;
      }
    ): Promise<{
      uploads: Array<{
        uploadId: string;
        key: string;
        objectKey: string;
        parts: Array<{ partNumber: number; url: string }>;
        totalParts: number;
        partSize: number;
      }>;
      count: number;
    }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!data?.files || !Array.isArray(data.files) || data.files.length === 0) {
        throw new Error("Files array is required");
      }
      if (data.files.length > 50) {
        throw new Error("Maximum 50 files per batch request");
      }
      return await this._request("/uploads/presign-multipart", {
        method: "POST",
        body: JSON.stringify({
          galleryId,
          orderId: data.orderId,
          files: data.files,
        }),
      });
    },

    /**
     * Complete multipart upload
     */
    completeMultipartUpload: async (
      galleryId: string,
      data: {
        uploadId: string;
        key: string;
        fileSize?: number;
        parts: Array<{ partNumber: number; etag: string }>;
      }
    ): Promise<{
      success: boolean;
      key?: string;
      etag?: string;
      location?: string;
    }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!data?.uploadId || !data?.key || !data?.parts) {
        throw new Error("uploadId, key, and parts are required");
      }
      return await this._request("/uploads/complete-multipart", {
        method: "POST",
        body: JSON.stringify({
          galleryId,
          uploadId: data.uploadId,
          key: data.key,
          fileSize: data.fileSize,
          parts: data.parts,
        }),
      });
    },

    /**
     * List parts of a multipart upload (for resume)
     */
    listMultipartParts: async (
      galleryId: string,
      data: {
        uploadId: string;
        key: string;
      }
    ): Promise<{
      parts: Array<{ partNumber: number; etag: string; size: number }>;
      count: number;
    }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!data?.uploadId || !data?.key) {
        throw new Error("uploadId and key are required");
      }
      return await this._request("/uploads/list-multipart-parts", {
        method: "POST",
        body: JSON.stringify({
          galleryId,
          uploadId: data.uploadId,
          key: data.key,
        }),
      });
    },

    /**
     * Abort multipart upload
     */
    abortMultipartUpload: async (
      galleryId: string,
      data: {
        uploadId: string;
        key: string;
      }
    ): Promise<{ success: boolean; message?: string }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!data?.uploadId || !data?.key) {
        throw new Error("uploadId and key are required");
      }
      return await this._request("/uploads/abort-multipart", {
        method: "POST",
        body: JSON.stringify({
          galleryId,
          uploadId: data.uploadId,
          key: data.key,
        }),
      });
    },

    /**
     * Complete simple PUT upload (update storage immediately)
     */
    completeUpload: async (
      galleryId: string,
      data: {
        key: string;
        fileSize: number;
      }
    ): Promise<{ success: boolean; message?: string; warning?: string }> => {
      if (!galleryId) {
        throw new Error("Gallery ID is required");
      }
      if (!data?.key || !data?.fileSize) {
        throw new Error("key and fileSize are required");
      }
      return await this._request("/uploads/complete-upload", {
        method: "POST",
        body: JSON.stringify({
          galleryId,
          key: data.key,
          fileSize: data.fileSize,
        }),
      });
    },
  };

  // ==================== AUTH ====================

  auth = {
    /**
     * Get business info (includes user settings like welcomePopupShown and tutorial preferences)
     */
    getBusinessInfo: async (): Promise<{
      businessName?: string;
      email?: string;
      phone?: string;
      address?: string;
      nip?: string;
      welcomePopupShown?: boolean;
      tutorialNextStepsDisabled?: boolean;
      tutorialClientSendDisabled?: boolean;
    }> => {
      return await this._request("/auth/business-info");
    },

    /**
     * Update business info (can also update welcomePopupShown and tutorial preferences)
     */
    updateBusinessInfo: async (data: {
      businessName?: string;
      email?: string;
      phone?: string;
      address?: string;
      nip?: string;
      welcomePopupShown?: boolean;
      tutorialNextStepsDisabled?: boolean;
      tutorialClientSendDisabled?: boolean;
    }): Promise<void> => {
      if (!data) {
        throw new Error("Business info data is required");
      }
      return await this._request("/auth/business-info", {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },

    /**
     * Change password
     */
    changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
      if (!currentPassword || !newPassword) {
        throw new Error("Current password and new password are required");
      }
      return await this._request("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
    },
  };
}

// Export singleton instance
const apiService = new ApiService();
export default apiService;

// Also export formatError for convenience
export const formatApiError = (error: unknown): string => {
  if (error instanceof Error) {
    return apiService.formatError(error);
  }
  if (error && typeof error === "object" && "message" in error) {
    return apiService.formatError(error as Error);
  }
  return apiService.formatError(new Error(String(error)));
};
