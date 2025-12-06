import { NextRouter } from "next/router";

import { clearEphemeralState } from "../store";

/**
 * Determines if a URL is a gallery route
 * Gallery routes include: /galleries/[id], /galleries/[id]/photos, /galleries/[id]/orders/[orderId], etc.
 */
export const isGalleryRoute = (url: string): boolean => {
  return (
    url.includes("/galleries/") &&
    !url.match(
      /\/galleries\/(wyslano|wybrano|prosba-o-zmiany|gotowe-do-wysylki|dostarczone|robocze)(\/|$)/
    )
  );
};

/**
 * Determines if we're navigating away from gallery routes entirely
 * Returns true if current route is a gallery route but target is not
 */
export const isNavigatingAwayFromGallery = (currentUrl: string, targetUrl: string): boolean => {
  const currentIsGallery = isGalleryRoute(currentUrl);
  const targetIsGallery = isGalleryRoute(targetUrl);
  return currentIsGallery && !targetIsGallery;
};

/**
 * Determines if we're navigating between different galleries
 * Returns true if both are gallery routes but with different gallery IDs
 */
export const isNavigatingToDifferentGallery = (currentUrl: string, targetUrl: string): boolean => {
  const currentIsGallery = isGalleryRoute(currentUrl);
  const targetIsGallery = isGalleryRoute(targetUrl);

  if (!currentIsGallery || !targetIsGallery) {
    return false;
  }

  // Extract gallery IDs from URLs
  const currentMatch = currentUrl.match(/\/galleries\/([^/]+)/);
  const targetMatch = targetUrl.match(/\/galleries\/([^/]+)/);

  if (!currentMatch || !targetMatch) {
    return false;
  }

  const currentGalleryId = currentMatch[1];
  const targetGalleryId = targetMatch[1];

  return currentGalleryId !== targetGalleryId;
};

/**
 * Explicitly clears state based on navigation destination
 * This is called BEFORE navigation happens (on user click)
 */
export const clearStateForNavigation = (currentUrl: string, targetUrl: string): void => {
  // React Query handles cache invalidation automatically based on query keys
  // Only clear UI state like uploads/downloads when navigating away from galleries
  if (isNavigatingAwayFromGallery(currentUrl, targetUrl)) {
    clearEphemeralState();
    return;
  }

  // If navigating to a different gallery or within the same gallery
  // React Query cache is managed automatically, no manual clearing needed
};

/**
 * Navigation helper that wraps router.push with explicit cleanup
 * Use this instead of router.push directly when user clicks navigation links
 */
export const navigateWithCleanup = (
  router: NextRouter,
  url: string,
  options?: Parameters<NextRouter["push"]>[2]
): Promise<boolean> => {
  const currentUrl = router.asPath || router.pathname;

  // Clear state explicitly based on where we're going
  clearStateForNavigation(currentUrl, url);

  // Navigate
  return router.push(url, undefined, options);
};

/**
 * Navigation helper that wraps router.replace with explicit cleanup
 * Use this instead of router.replace directly when user clicks navigation links
 */
export const replaceWithCleanup = (
  router: NextRouter,
  url: string,
  options?: Parameters<NextRouter["replace"]>[2]
): Promise<boolean> => {
  const currentUrl = router.asPath || router.pathname;

  // Clear state explicitly based on where we're going
  clearStateForNavigation(currentUrl, url);

  // Navigate
  return router.replace(url, undefined, options);
};
