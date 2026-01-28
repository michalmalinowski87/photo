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
}

/**
 * Get watermark configuration with fallback chain
 */
export function getWatermarkConfig(
  gallery: Gallery | null | undefined,
  user: UserWatermarkConfig | null | undefined
): WatermarkConfig {
  // Priority 1: Gallery-specific watermark
  if (gallery?.watermarkUrl) {
    const position = gallery.watermarkPosition as any;
    return {
      url: gallery.watermarkUrl as string,
      opacity: position?.opacity ?? 0.7,
      isDefault: false,
    };
  }

  // Priority 2: User default watermark
  if (user?.defaultWatermarkUrl) {
    const pos = user.defaultWatermarkPosition;
    return {
      url: user.defaultWatermarkUrl,
      opacity: pos?.opacity ?? 0.7,
      isDefault: false,
    };
  }

  // Priority 3: System default watermark (generated "PREVIEW" SVG)
  return {
    opacity: 0.3, // Not used for default watermark (uses multiply blend mode)
    isDefault: true,
  };
}
