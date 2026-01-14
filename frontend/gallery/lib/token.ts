/**
 * Simple token management - single source of truth: sessionStorage
 * Login → store token in sessionStorage
 * Fetch → read token from sessionStorage
 * Logout → clear sessionStorage
 */

export function getToken(galleryId: string | null): string | null {
  if (typeof window === "undefined" || !galleryId) {
    return null;
  }
  return sessionStorage.getItem(`gallery_token_${galleryId}`);
}

export function setToken(galleryId: string, token: string): void {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(`gallery_token_${galleryId}`, token);
  }
}

export function clearToken(galleryId: string | null): void {
  if (typeof window !== "undefined" && galleryId) {
    sessionStorage.removeItem(`gallery_token_${galleryId}`);
    sessionStorage.removeItem(`gallery_name_${galleryId}`);
  }
}
