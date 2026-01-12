// API client utilities - migrated from api.js

export interface ApiError {
  status?: number;
  message: string;
  body?: any;
  originalError?: Error;
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<{ data: any; response: Response }> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    const contentType = response.headers.get("content-type");
    const isJson = contentType && contentType.includes("application/json");

    let body;
    try {
      body = isJson ? await response.json() : await response.text();
    } catch (e) {
      body = null;
    }

    if (!response.ok) {
      const error: ApiError = new Error(
        body?.error || body?.message || `HTTP ${response.status}: ${response.statusText}`
      );
      error.status = response.status;
      error.body = body;
      throw error;
    }

    return { data: body, response };
  } catch (error) {
    if ((error as ApiError).status) {
      throw error;
    }
    // Network or other errors
    const networkError: ApiError = new Error(`Network error: ${(error as Error).message}`);
    networkError.originalError = error as Error;
    throw networkError;
  }
}

export function formatApiError(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const apiError = error as ApiError;
    if (apiError.status) {
      const bodyStr = typeof apiError.body === "string" 
        ? apiError.body 
        : JSON.stringify(apiError.body);
      return `Error ${apiError.status}: ${apiError.message}${bodyStr ? ` - ${bodyStr}` : ""}`;
    }
    if (apiError.message) {
      return apiError.message;
    }
  }
  return "An unexpected error occurred";
}
