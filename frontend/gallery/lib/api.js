/**
 * Legacy api.js – kept in sync with api.ts for production error handling.
 * Prefer importing from api.ts in TypeScript code.
 */

const GALLERY_NOT_PUBLISHED_MESSAGE =
  "Ta galeria nie jest jeszcze opublikowana. Skontaktuj się z fotografem.";
const GENERIC_ERROR_MESSAGE = "Coś poszło nie tak. Spróbuj ponownie później.";

function getSafeBodyMessage(body) {
  if (body == null) return null;
  let obj;
  try {
    obj = typeof body === "string" ? JSON.parse(body) : body;
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const msg = obj.message ?? obj.error;
  return typeof msg === "string" ? msg : null;
}

function isGalleryNotPublished403(body) {
  if (body == null) return false;
  let obj;
  try {
    obj = typeof body === "string" ? JSON.parse(body) : body;
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return false;
  const errStr = typeof obj.error === "string" ? obj.error.toLowerCase() : "";
  const msgStr = typeof obj.message === "string" ? obj.message.toLowerCase() : "";
  return errStr === "gallery not published" || msgStr.includes("not yet published");
}

export async function apiFetch(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
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
      const error = new Error(
        body?.error || body?.message || `HTTP ${response.status}: ${response.statusText}`
      );
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return { data: body, response };
  } catch (error) {
    if (error.status) throw error;
    const networkError = new Error(`Network error: ${error.message}`);
    networkError.originalError = error;
    throw networkError;
  }
}

export function formatApiError(error) {
  if (error && typeof error === "object" && error.status) {
    const status = error.status;
    if (status === 403 && isGalleryNotPublished403(error.body)) {
      return GALLERY_NOT_PUBLISHED_MESSAGE;
    }
    const bodyMsg = getSafeBodyMessage(error.body);
    const messageLower = (error.message || bodyMsg || "").toLowerCase();
    if (
      status === 403 &&
      (messageLower.includes("gallery not published") || messageLower.includes("not yet published"))
    ) {
      return GALLERY_NOT_PUBLISHED_MESSAGE;
    }
    if (status >= 500) return GENERIC_ERROR_MESSAGE;
    const friendly =
      bodyMsg ||
      error.message ||
      (status === 403 ? "Brak dostępu." : status === 404 ? "Nie znaleziono." : "Wystąpił błąd. Spróbuj ponownie.");
    const trimmed = typeof friendly === "string" ? friendly.trim() : "";
    if (trimmed.includes("{"))
      return status === 403 ? GALLERY_NOT_PUBLISHED_MESSAGE : status === 404 ? "Nie znaleziono." : "Wystąpił błąd. Spróbuj ponownie.";
    return trimmed || "Wystąpił błąd. Spróbuj ponownie.";
  }
  if (error && typeof error.message === "string") {
    if (error.message.includes("{")) return GENERIC_ERROR_MESSAGE;
    return error.message;
  }
  return GENERIC_ERROR_MESSAGE;
}
