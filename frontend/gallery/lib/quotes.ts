"use client";

import quotes from "@/data/photography-quotes.json";

export type QuotePublicDomainBasis = "life-plus-70" | "publication-plus-70" | "us-pre-1929";

export interface Quote {
  text: string;
  author: string;
  authorDiedYear?: number | null;
  work?: string;
  year?: number;
  license: "public-domain";
  citation: string;
  publicDomainBasis: QuotePublicDomainBasis;
}

function hashStringToUint32(input: string): number {
  // Simple deterministic hash (FNV-1a-ish)
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function getQuoteForGallery(galleryId: string): Quote | null {
  const list = quotes as unknown as Quote[];
  if (!galleryId || list.length === 0) return null;
  const idx = hashStringToUint32(galleryId) % list.length;
  return list[idx] ?? null;
}

/**
 * Rotates quotes on each new view within the same browser session.
 * Per-gallery: `/login/:id` will cycle quotes as you revisit/refresh.
 */
export function getRotatingQuoteForGallery(galleryId: string): Quote | null {
  const list = quotes as unknown as Quote[];
  if (!galleryId || list.length === 0) return null;

  // SSR/edge-safe guard
  if (typeof window === "undefined") return getQuoteForGallery(galleryId);

  const storageKey = `login_quote_idx_${galleryId}`;

  let nextIdx: number;
  try {
    const prevRaw = window.sessionStorage.getItem(storageKey);
    const prev = prevRaw ? Number.parseInt(prevRaw, 10) : NaN;
    const base = Number.isFinite(prev) ? prev : hashStringToUint32(galleryId) % list.length;
    nextIdx = (base + 1) % list.length;
    window.sessionStorage.setItem(storageKey, String(nextIdx));
  } catch {
    // If sessionStorage is blocked, fall back to deterministic quote
    return getQuoteForGallery(galleryId);
  }

  return list[nextIdx] ?? null;
}

