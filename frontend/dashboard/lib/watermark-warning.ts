/**
 * Watermark warning logic: when to show "Znak Wodny not set" warning.
 *
 * We differentiate:
 * - **Not set at all**: User never opened Znak Wodny and saved → show warnings.
 * - **Explicitly "Brak Znaku Wodnego"**: User opened Znak Wodny and saved with "none" → do NOT show warnings.
 *
 * Global (dashboard): We treat as "acknowledged" when either defaultWatermarkUrl is set
 * or defaultWatermarkPosition.pattern === "none" (explicit no watermark).
 * Gallery: Same using gallery.watermarkUrl and gallery.watermarkPosition.pattern === "none".
 */

export interface BusinessWatermarkInfo {
  defaultWatermarkUrl?: string;
  defaultWatermarkPosition?: { pattern?: string; opacity?: number; [key: string]: unknown };
}

export interface GalleryWatermarkInfo {
  watermarkUrl?: string;
  watermarkPosition?: { pattern?: string; opacity?: number; [key: string]: unknown };
}

/**
 * User has acknowledged the global watermark choice: either set a watermark or explicitly chose "Brak Znaku Wodnego".
 */
export function hasGlobalWatermarkAcknowledged(
  businessInfo: BusinessWatermarkInfo | null | undefined
): boolean {
  if (!businessInfo) return false;
  if (businessInfo.defaultWatermarkUrl) return true;
  const pattern = businessInfo.defaultWatermarkPosition?.pattern;
  return pattern === "none" || pattern === "custom";
}

/**
 * Gallery has acknowledged the watermark choice: either set a watermark or explicitly chose "Brak Znaku Wodnego".
 */
export function hasGalleryWatermarkAcknowledged(
  gallery: GalleryWatermarkInfo | null | undefined
): boolean {
  if (!gallery) return false;
  if (gallery.watermarkUrl) return true;
  const pattern = gallery.watermarkPosition?.pattern;
  return pattern === "none" || pattern === "custom";
}

/**
 * Show warning on dashboard (Ustawienia, Galeria, Znak Wodny) when user never set the global watermark.
 */
export function shouldShowWatermarkWarningGlobal(
  businessInfo: BusinessWatermarkInfo | null | undefined
): boolean {
  return !hasGlobalWatermarkAcknowledged(businessInfo);
}

/**
 * Show warning on gallery sidebar/settings when global is not acknowledged and this gallery is not acknowledged.
 * If global is acknowledged, we don't show on gallery. If global is not set, we show on every gallery unless that gallery acknowledged.
 */
export function shouldShowWatermarkWarningForGallery(
  gallery: GalleryWatermarkInfo | null | undefined,
  businessInfo: BusinessWatermarkInfo | null | undefined
): boolean {
  if (hasGlobalWatermarkAcknowledged(businessInfo)) return false;
  return !hasGalleryWatermarkAcknowledged(gallery);
}
