// Track if we're currently refreshing tokens to prevent multiple simultaneous refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;

export interface ApiError extends Error {
  status?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body?: any;
  refreshFailed?: boolean;
  originalError?: Error;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ApiResponse<T = any> {
  data: T;
  response: Response;
}

/**
 * Get a valid ID token, refreshing if necessary
 * Exported for special cases where you need a token but can't use apiFetchWithAuth
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
 * Fetch with Cognito token automatically added to Authorization header
 * Automatically refreshes token on 401 errors
 * If token is not provided, will automatically get a valid token
 */
export async function apiFetchWithAuth<T = unknown>(
  url: string,
  options: RequestInit = {},
  token: string | null = null
): Promise<ApiResponse<T>> {
  // If no token provided, get a valid one (will refresh if needed)
  if (!token && typeof window !== "undefined") {
    try {
      token = await getValidToken();
    } catch (_err) {
      // Token refresh failed, let apiFetch handle the 401
    }
  }

  const headers = {
    ...options.headers,
    Authorization: `Bearer ${token}`,
  };
  return apiFetch<T>(url, { ...options, headers });
}

/**
 * Enhanced API fetch that automatically handles token refresh on 401 errors
 */
export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {},
  retryOn401: boolean = true
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type");
    const isJson = contentType?.includes("application/json") ?? false;

    let body: unknown;
    try {
      body = isJson ? await response.json() : await response.text();
    } catch (_e) {
      body = null;
    }

    // Handle 401 Unauthorized - try to refresh token and retry
    if (response.status === 401 && retryOn401 && typeof window !== "undefined") {
      const authHeader =
        (options.headers as Record<string, string>)?.["Authorization"] ||
        (options.headers as Record<string, string>)?.["authorization"];

      // Only retry if this was an authenticated request
      if (authHeader) {
        try {
          // Try to refresh the token
          const newToken = await getValidToken();

          // Retry the request with the new token
          const retryOptions: RequestInit = {
            ...options,
            headers: {
              ...options.headers,
              Authorization: `Bearer ${newToken}`,
            },
          };

          const retryResponse = await fetch(url, retryOptions);
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
            const error = new Error(
              retryBodyObj?.error ??
                retryBodyObj?.message ??
                `HTTP ${retryResponse.status}: ${retryResponse.statusText}`
            ) as ApiError;
            error.status = retryResponse.status;
            error.body = retryBody;
            throw error;
          }

          return { data: retryBody, response: retryResponse };
        } catch (_refreshErr) {
          // Refresh failed - trigger session expired event
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("session-expired", {
                detail: { returnUrl: window.location.pathname + window.location.search },
              })
            );
          }

          const error = new Error("Session expired. Please log in again.") as ApiError;
          error.status = 401;
          error.body = body;
          error.refreshFailed = true;
          throw error;
        }
      }
    }

    if (!response.ok) {
      const bodyObj = body as { error?: string; message?: string } | null;
      const error = new Error(
        bodyObj?.error ?? bodyObj?.message ?? `HTTP ${response.status}: ${response.statusText}`
      ) as ApiError;
      error.status = response.status;
      error.body = body;
      throw error;
    }

    return { data: body, response };
  } catch (error) {
    const apiError = error as ApiError;
    if (apiError.status) {
      throw apiError;
    }
    // Network or other errors
    const networkError = new Error(`Network error: ${apiError.message}`) as ApiError;
    networkError.originalError = apiError;
    throw networkError;
  }
}

export function formatApiError(error: unknown): string {
  const apiError = error as ApiError;
  if (apiError.status) {
    const bodyStr =
      typeof apiError.body === "string" ? apiError.body : JSON.stringify(apiError.body);
    return `Error ${apiError.status}: ${apiError.message ?? ""}${bodyStr ? ` - ${bodyStr}` : ""}`;
  }
  return apiError.message ?? "An unexpected error occurred";
}
