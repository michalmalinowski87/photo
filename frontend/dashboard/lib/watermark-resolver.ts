/**
 * Watermark resolution logic
 * Determines which watermark to use based on fallback chain:
 * 1. Gallery-specific watermark
 * 2. User default watermark
 * Returns null if no watermark is configured (no system default watermark is provided)
 */

import type { Gallery } from "../types";

export interface WatermarkConfig {
  url?: string;
  opacity?: number;
  isDefault: boolean;
  /** When true, stamp thumb and bigThumb with one full-cover watermark; when false, only preview is watermarked */
  watermarkThumbnails?: boolean;
}

export interface UserWatermarkConfig {
  defaultWatermarkUrl?: string;
  defaultWatermarkPosition?: {
    x?: number;
    y?: number;
    scale?: number;
    rotation?: number;
    opacity?: number;
    // Legacy support
    position?: string;
  };
  defaultWatermarkThumbnails?: boolean;
}

/**
 * Get watermark configuration with fallback chain.
 * Returns null when:
 * - Gallery explicitly chose "No Watermark" (pattern "none") — we honour that and do not use global
 * - No watermark is configured at all (no gallery watermark, no user default watermark)
 * We do not provide any system-generated default watermark.
 */
export function getWatermarkConfig(
  gallery: Gallery | null | undefined,
  user: UserWatermarkConfig | null | undefined
): WatermarkConfig | null {
  const galleryPattern =
    gallery?.watermarkPosition &&
    typeof gallery.watermarkPosition === "object" &&
    "pattern" in gallery.watermarkPosition
      ? (gallery.watermarkPosition as { pattern?: string }).pattern
      : undefined;

  // Resolve watermarkThumbnails: gallery overrides user default
  const watermarkThumbnails: boolean = 
    (typeof gallery?.watermarkThumbnails === "boolean" ? gallery.watermarkThumbnails : undefined) ??
    (typeof user?.defaultWatermarkThumbnails === "boolean" ? user.defaultWatermarkThumbnails : undefined) ??
    false;

  // Priority 1: Gallery-specific watermark
  if (gallery?.watermarkUrl) {
    const position = gallery.watermarkPosition as { opacity?: number } | undefined;
    return {
      url: gallery.watermarkUrl,
      opacity: position?.opacity ?? 0.7,
      isDefault: false,
      watermarkThumbnails,
    };
  }

  // Honour gallery "No Watermark": if user deliberately set Brak Znaku Wodnego for this gallery, do not use global
  if (gallery && galleryPattern === "none") {
    return null;
  }

  // Priority 2: User default watermark
  if (user?.defaultWatermarkUrl) {
    const pos = user.defaultWatermarkPosition;
    return {
      url: user.defaultWatermarkUrl,
      opacity: pos?.opacity ?? 0.7,
      isDefault: false,
      watermarkThumbnails,
    };
  }

  // No watermark configured - return null (no system default watermark)
  return null;
}
