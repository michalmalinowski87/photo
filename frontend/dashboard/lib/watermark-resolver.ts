/**
 * Watermark resolution logic
 * Determines which watermark to use based on fallback chain:
 * 1. Gallery-specific watermark
 * 2. User default watermark
 * 3. System default watermark (generated "PREVIEW" SVG)
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
 * Returns null when gallery explicitly chose "No Watermark" (pattern "none") — we honour that and do not use global.
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
  const watermarkThumbnails =
    gallery?.watermarkThumbnails ?? user?.defaultWatermarkThumbnails ?? false;

  // Priority 1: Gallery-specific watermark
  if (gallery?.watermarkUrl) {
    const position = gallery.watermarkPosition as any;
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

  // Priority 3: System default watermark (generated "PREVIEW" SVG)
  return {
    opacity: 0.3, // Not used for default watermark (uses multiply blend mode)
    isDefault: true,
    watermarkThumbnails,
  };
}
