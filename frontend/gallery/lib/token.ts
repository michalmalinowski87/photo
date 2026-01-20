/**
 * Simple token management - single source of truth: sessionStorage
 * Login → store token in sessionStorage
 * Fetch → read token from sessionStorage
 * Logout → clear sessionStorage
 */

export type GalleryAuthMode = "client" | "owner";

function getClientTokenKey(galleryId: string): string {
  return `gallery_token_${galleryId}`;
}

function getOwnerTokenKey(galleryId: string): string {
  return `gallery_owner_token_${galleryId}`;
}

function getAuthModeKey(galleryId: string): string {
  return `gallery_auth_mode_${galleryId}`;
}

export function getAuthMode(galleryId: string | null): GalleryAuthMode {
  if (typeof window === "undefined" || !galleryId) {
    return "client";
  }
  const raw = sessionStorage.getItem(getAuthModeKey(galleryId));
  return raw === "owner" ? "owner" : "client";
}

export function setAuthMode(galleryId: string, mode: GalleryAuthMode): void {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(getAuthModeKey(galleryId), mode);
  }
}

export function getClientToken(galleryId: string | null): string | null {
  if (typeof window === "undefined" || !galleryId) {
    return null;
  }
  return sessionStorage.getItem(getClientTokenKey(galleryId));
}

export function getOwnerToken(galleryId: string | null): string | null {
  if (typeof window === "undefined" || !galleryId) {
    return null;
  }
  return sessionStorage.getItem(getOwnerTokenKey(galleryId));
}

export function getToken(galleryId: string | null): string | null {
  if (typeof window === "undefined" || !galleryId) {
    return null;
  }

  const mode = getAuthMode(galleryId);
  if (mode === "owner") {
    return getOwnerToken(galleryId);
  }

  return getClientToken(galleryId);
}

export function setToken(galleryId: string, token: string): void {
  if (typeof window !== "undefined") {
    // Client login token
    setAuthMode(galleryId, "client");
    sessionStorage.setItem(getClientTokenKey(galleryId), token);
  }
}

export function setOwnerToken(galleryId: string, token: string): void {
  if (typeof window !== "undefined") {
    setAuthMode(galleryId, "owner");
    sessionStorage.setItem(getOwnerTokenKey(galleryId), token);
  }
}

export function clearToken(galleryId: string | null): void {
  if (typeof window !== "undefined" && galleryId) {
    sessionStorage.removeItem(getClientTokenKey(galleryId));
    sessionStorage.removeItem(getOwnerTokenKey(galleryId));
    sessionStorage.removeItem(getAuthModeKey(galleryId));
    sessionStorage.removeItem(`gallery_name_${galleryId}`);
  }
}
