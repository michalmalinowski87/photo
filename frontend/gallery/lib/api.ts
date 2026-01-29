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

/** User-facing message for 403 Gallery not published (no raw JSON). */
const GALLERY_NOT_PUBLISHED_MESSAGE =
  "Ta galeria nie jest jeszcze opublikowana. Skontaktuj się z fotografem.";

/** Generic 5xx message. */
const GENERIC_ERROR_MESSAGE = "Coś poszło nie tak. Spróbuj ponownie później.";

function getSafeBodyMessage(body: unknown): string | null {
  if (body == null) return null;
  const obj = typeof body === "string" ? (() => { try { return JSON.parse(body) as Record<string, unknown>; } catch { return null; } })() : (body as Record<string, unknown>);
  if (!obj || typeof obj !== "object") return null;
  const msg = obj.message ?? obj.error;
  return typeof msg === "string" ? msg : null;
}

/** True if body (object or JSON string) indicates "Gallery not published" 403. */
function isGalleryNotPublished403(body: unknown): boolean {
  if (body == null) return false;
  const obj = typeof body === "string" ? (() => { try { return JSON.parse(body) as Record<string, unknown>; } catch { return null; } })() : (body as Record<string, unknown>);
  if (!obj || typeof obj !== "object") return false;
  const err = obj.error;
  const msg = obj.message;
  const errStr = typeof err === "string" ? err.toLowerCase() : "";
  const msgStr = typeof msg === "string" ? msg.toLowerCase() : "";
  return errStr === "gallery not published" || msgStr.includes("not yet published");
}

export function formatApiError(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const apiError = error as ApiError;
    if (apiError.status) {
      const status = apiError.status;

      // 403 Gallery not published – always return friendly message, never raw JSON
      if (status === 403 && isGalleryNotPublished403(apiError.body)) {
        return GALLERY_NOT_PUBLISHED_MESSAGE;
      }

      const bodyMsg = getSafeBodyMessage(apiError.body);
      const messageLower = (apiError.message || bodyMsg || "").toLowerCase();

      // Also treat 403 when message/text suggests gallery not published (e.g. if body was lost)
      if (status === 403 && (messageLower.includes("gallery not published") || messageLower.includes("not yet published"))) {
        return GALLERY_NOT_PUBLISHED_MESSAGE;
      }

      // 5xx – generic message only
      if (status >= 500) {
        return GENERIC_ERROR_MESSAGE;
      }

      // 4xx – use safe message only, never raw body; never return a string that contains JSON
      const friendly = bodyMsg || apiError.message || (status === 403 ? "Brak dostępu." : status === 404 ? "Nie znaleziono." : "Wystąpił błąd. Spróbuj ponownie.");
      const trimmed = typeof friendly === "string" ? friendly.trim() : "";
      if (trimmed.includes("{")) return status === 403 ? GALLERY_NOT_PUBLISHED_MESSAGE : (status === 404 ? "Nie znaleziono." : "Wystąpił błąd. Spróbuj ponownie.");
      return trimmed || "Wystąpił błąd. Spróbuj ponownie.";
    }
    if (typeof (apiError as { message?: string }).message === "string") {
      const msg = (apiError as { message: string }).message;
      if (msg.includes("{")) return GENERIC_ERROR_MESSAGE;
      return msg;
    }
  }
  return GENERIC_ERROR_MESSAGE;
}
