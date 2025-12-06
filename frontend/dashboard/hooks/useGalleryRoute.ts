import { useRouter } from "next/router";
import { useMemo } from "react";

/**
 * Gallery route patterns - must match the actual file structure in pages/galleries/[id]/
 */
const GALLERY_ROUTE_PATTERNS = {
  GALLERY_DETAIL: "/galleries/[id]",
  GALLERY_PHOTOS: "/galleries/[id]/photos",
  GALLERY_SETTINGS: "/galleries/[id]/settings",
  ORDER_DETAIL: "/galleries/[id]/orders/[orderId]",
  ORDER_SETTINGS: "/galleries/[id]/orders/[orderId]/settings",
} as const;

/**
 * Matches a Next.js route pattern against a pathname
 * Converts [id] to a regex pattern that matches any segment
 */
function matchRoutePattern(pattern: string, pathname: string): boolean {
  // Convert Next.js route pattern to regex
  // [id] -> [^/]+ (matches any non-slash characters)
  const regexPattern = pattern.replace(/\[.*?\]/g, "[^/]+");
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(pathname);
}

/**
 * Hook that provides robust detection of the current gallery route type
 * Uses Next.js route pattern matching instead of string includes for reliability
 */
export function useGalleryRoute() {
  const router = useRouter();
  const { id: galleryId, orderId } = router.query;

  const routeInfo = useMemo(() => {
    const pathname = router.pathname;
    const isReady = router.isReady;

    // Extract galleryId and orderId from query (handle both string and array)
    const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
    const orderIdStr = Array.isArray(orderId) ? orderId[0] : orderId;

    // Match against known route patterns
    const isGalleryDetail = matchRoutePattern(GALLERY_ROUTE_PATTERNS.GALLERY_DETAIL, pathname);
    const isGalleryPhotos = matchRoutePattern(GALLERY_ROUTE_PATTERNS.GALLERY_PHOTOS, pathname);
    const isGallerySettings = matchRoutePattern(GALLERY_ROUTE_PATTERNS.GALLERY_SETTINGS, pathname);
    const isOrderDetail = matchRoutePattern(GALLERY_ROUTE_PATTERNS.ORDER_DETAIL, pathname);
    const isOrderSettings = matchRoutePattern(GALLERY_ROUTE_PATTERNS.ORDER_SETTINGS, pathname);

    // Determine if we're on an order page (either detail or settings)
    // Only consider it an order page if:
    // 1. The pathname matches the order route pattern AND
    // 2. We have an orderId in the query (when router is ready)
    const isOrderPage = (isOrderDetail || isOrderSettings) && (isReady ? !!orderIdStr : true); // If router not ready, assume true to avoid flicker

    // Determine if we're on a gallery page (not order page)
    const isGalleryPage = (isGalleryDetail || isGalleryPhotos || isGallerySettings) && !isOrderPage;

    // Determine the specific page type
    let pageType:
      | "gallery-detail"
      | "gallery-photos"
      | "gallery-settings"
      | "order-detail"
      | "order-settings"
      | "unknown" = "unknown";

    if (isGalleryDetail) {
      pageType = "gallery-detail";
    } else if (isGalleryPhotos) {
      pageType = "gallery-photos";
    } else if (isGallerySettings) {
      pageType = "gallery-settings";
    } else if (isOrderDetail) {
      pageType = "order-detail";
    } else if (isOrderSettings) {
      pageType = "order-settings";
    }

    return {
      // Route detection
      isOrderPage,
      isGalleryPage,
      isGalleryDetail,
      isGalleryPhotos,
      isGallerySettings,
      isOrderDetail,
      isOrderSettings,
      pageType,

      // Extracted IDs
      galleryId: typeof galleryIdStr === "string" ? galleryIdStr : undefined,
      orderId: typeof orderIdStr === "string" ? orderIdStr : undefined,

      // Router state
      isReady,
      pathname,
      asPath: router.asPath,
    };
  }, [router.pathname, router.asPath, router.isReady, galleryId, orderId]);

  return routeInfo;
}
