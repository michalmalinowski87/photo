import { create } from "zustand";
import { devtools } from "zustand/middleware";

import api from "../lib/api-service";

/**
 * Helper function to add cache-busting query parameter to image URLs
 * Uses S3 lastModified timestamp to avoid unnecessary cache busting
 *
 * Strategy:
 * - If lastModified is available: use only that (t={lastModified})
 *   - Same file = same timestamp = can be cached
 *   - Different file = different timestamp = fresh fetch
 * - If lastModified is missing: use current timestamp as fallback
 * - When a new photo is uploaded, S3's lastModified changes automatically
 *
 * NOTE: This function is kept for backward compatibility but cache busting
 * is now handled automatically in image-fallback.ts as part of the unified strategy
 */
export function addCacheBustingToUrl(
  url: string | null | undefined,
  lastModified?: string | number
): string | null {
  if (!url) {
    return null;
  }

  // Remove any existing cache-busting parameters to avoid duplicates
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.delete("t");
    urlObj.searchParams.delete("f");
    urlObj.searchParams.delete("v");
    url = urlObj.toString();
  } catch {
    // If URL parsing fails, continue with original URL
  }

  // If URL already has query parameters, append; otherwise add
  const separator = url.includes("?") ? "&" : "?";

  // Use lastModified timestamp if available (from S3 LastModified)
  // This ensures we don't cache-bust unnecessarily - same file = same timestamp
  // When a new photo is uploaded, S3 lastModified changes automatically
  const lastModifiedTs = lastModified
    ? typeof lastModified === "string"
      ? new Date(lastModified).getTime()
      : lastModified
    : Date.now();

  // Format: t={lastModified}
  return `${url}${separator}t=${lastModifiedTs}`;
}

/**
 * Helper function to apply cache-busting to all image URLs in an image object
 * Preserves the original type of the image
 *
 * NOTE: This function is kept for backward compatibility but cache busting
 * is now handled automatically in image-fallback.ts as part of the unified strategy
 */
export function applyCacheBustingToImage<T extends Record<string, any>>(image: T): T {
  if (!image || typeof image !== "object") {
    return image;
  }

  const lastModified = image.lastModified;
  const timestamp = lastModified
    ? typeof lastModified === "string"
      ? new Date(lastModified).getTime()
      : lastModified
    : undefined;

  return {
    ...image,
    url: addCacheBustingToUrl(image.url, timestamp),
    previewUrl: addCacheBustingToUrl(image.previewUrl, timestamp),
    thumbUrl: addCacheBustingToUrl(image.thumbUrl, timestamp),
    finalUrl: addCacheBustingToUrl(image.finalUrl, timestamp),
    previewUrlFallback: addCacheBustingToUrl(image.previewUrlFallback, timestamp),
    thumbUrlFallback: addCacheBustingToUrl(image.thumbUrlFallback, timestamp),
    bigThumbUrl: addCacheBustingToUrl(image.bigThumbUrl, timestamp),
    bigThumbUrlFallback: addCacheBustingToUrl(image.bigThumbUrlFallback, timestamp),
  } as T;
}

export interface Gallery {
  galleryId: string;
  galleryName?: string;
  ownerId: string;
  state: string;
  paymentStatus?: string;
  isPaid?: boolean;
  selectionEnabled?: boolean;
  coverPhotoUrl?: string;
  createdAt?: string;
  expiresAt?: string;
  ttlExpiresAt?: string;
  ttl?: number;
  orders?: any[];
  [key: string]: any;
}

export interface GalleryOrder {
  orderId?: string;
  galleryId?: string;
  deliveryStatus?: string;
  [key: string]: unknown;
}

interface GalleryState {
  currentGallery: Gallery | null;
  galleryList: Gallery[];
  currentGalleryId: string | null;
  // Cache for gallery data (keyed by galleryId) - reduces redundant API calls
  galleryCache: Record<string, { gallery: Gallery; timestamp: number }>;
  // Cache for gallery orders list (keyed by galleryId)
  galleryOrdersCache: Record<string, { orders: any[]; timestamp: number }>;
  // Cache for gallery images (keyed by galleryId)
  galleryImagesCache: Record<string, { images: any[]; timestamp: number }>;
  // Request deduplication: track in-flight requests to prevent concurrent fetches
  inFlightRequests: Record<string, Promise<Gallery | null>>;
  filters: {
    unpaid?: boolean;
    wyslano?: boolean;
    wybrano?: boolean;
    "prosba-o-zmiany"?: boolean;
    "gotowe-do-wysylki"?: boolean;
    dostarczone?: boolean;
  };
  isLoading: boolean;
  error: string | null;
  // Additional state moved from local component state
  galleryOrders: GalleryOrder[]; // Current gallery's orders list
  hasDeliveredOrders: boolean | undefined;
  galleryUrl: string;
  sendLinkLoading: boolean;
  setCurrentGallery: (gallery: Gallery | null) => void;
  setGalleryList: (galleries: Gallery[]) => void;
  setCurrentGalleryId: (galleryId: string | null) => void;
  setGalleryOrders: (galleryId: string, orders: any[]) => void;
  getGalleryOrders: (galleryId: string, maxAge?: number) => any[] | null;
  setGalleryImages: (galleryId: string, images: any[]) => void;
  getGalleryImages: (galleryId: string, maxAge?: number) => any[] | null;
  invalidateGalleryCache: (galleryId?: string) => void;
  invalidateGalleryOrdersCache: (galleryId: string) => void;
  invalidateGalleryImagesCache: (galleryId: string) => void;
  getGalleryFromCache: (galleryId: string, maxAge?: number) => Gallery | null;
  // Comprehensive cache invalidation helper - invalidates all caches for a gallery
  invalidateAllGalleryCaches: (galleryId: string) => void;
  // Fetch actions that check cache and call API if needed
  fetchGallery: (galleryId: string, forceRefresh?: boolean) => Promise<Gallery | null>;
  fetchGalleryImages: (galleryId: string, forceRefresh?: boolean) => Promise<any[]>;
  fetchGalleryOrders: (galleryId: string, forceRefresh?: boolean) => Promise<any[]>;
  sendGalleryLinkToClient: (galleryId: string) => Promise<{ isReminder: boolean }>;
  refreshGalleryBytesOnly: (galleryId: string, forceRecalc?: boolean) => Promise<void>; // Silent refresh that only updates bytes used (forceRecalc bypasses cache)
  refreshGalleryStatusOnly: (galleryId: string) => Promise<void>; // Silent refresh that only updates status fields
  setFilter: (filter: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateFinalsBytesUsed: (sizeDelta: number) => void; // Optimistic update for finals bytes
  updateOriginalsBytesUsed: (sizeDelta: number) => void; // Optimistic update for originals bytes
  updateCoverPhotoUrl: (coverPhotoUrl: string | null) => void; // Update only cover photo URL
  clearCurrentGallery: () => void;
  clearGalleryList: () => void;
  clearAll: () => void;
  // Next Steps Overlay state (persistent across page navigation)
  nextStepsOverlayExpanded: boolean;
  setNextStepsOverlayExpanded: (expanded: boolean) => void;
  // Publish Wizard state (for URL param restoration)
  publishWizardOpen: boolean;
  publishWizardGalleryId: string | null;
  publishWizardState: {
    duration?: string;
    planKey?: string;
  } | null;
  setPublishWizardOpen: (
    open: boolean,
    galleryId?: string | null,
    state?: { duration?: string; planKey?: string } | null
  ) => void;
  // Additional actions moved from hooks/components
  setGalleryOrders: (orders: GalleryOrder[]) => void;
  setHasDeliveredOrders: (has: boolean | undefined) => void;
  setGalleryUrl: (url: string) => void;
  setSendLinkLoading: (loading: boolean) => void;
  checkDeliveredOrders: (galleryId: string) => Promise<void>;
  copyGalleryUrl: (galleryId: string) => void;
  reloadGallery: (galleryId: string, forceRefresh?: boolean) => Promise<void>;
}

// Debouncing removed - refreshGalleryBytesOnly is now called explicitly when needed

export const useGalleryStore = create<GalleryState>()(
  devtools(
    (set, get) => ({
      currentGallery: null,
      galleryList: [],
      currentGalleryId: null,
      galleryCache: {},
      galleryOrdersCache: {},
      galleryImagesCache: {},
      inFlightRequests: {},
      filters: {},
      isLoading: false,
      error: null,
      galleryOrders: [],
      hasDeliveredOrders: undefined,
      galleryUrl: "",
      sendLinkLoading: false,

      setCurrentGallery: (gallery: Gallery | null) => {
        set({
          currentGallery: gallery,
          currentGalleryId: gallery?.galleryId || null,
        });
      },

      updateFinalsBytesUsed: (sizeDelta: number) => {
        set((state) => {
          if (!state.currentGallery) {
            return state;
          }
          const currentFinalsBytes =
            (state.currentGallery.finalsBytesUsed as number | undefined) ?? 0;
          const newFinalsBytes = Math.max(0, currentFinalsBytes + sizeDelta);
          return {
            currentGallery: {
              ...state.currentGallery,
              finalsBytesUsed: newFinalsBytes,
            },
          };
        });
      },

      updateOriginalsBytesUsed: (sizeDelta: number) => {
        set((state) => {
          if (!state.currentGallery) {
            return state;
          }
          const currentOriginalsBytes =
            (state.currentGallery.originalsBytesUsed as number | undefined) ?? 0;
          const newOriginalsBytes = Math.max(0, currentOriginalsBytes + sizeDelta);
          return {
            currentGallery: {
              ...state.currentGallery,
              originalsBytesUsed: newOriginalsBytes,
            },
          };
        });
      },

      updateCoverPhotoUrl: (coverPhotoUrl: string | null) => {
        set((state) => {
          if (!state.currentGallery) {
            return state;
          }
          return {
            currentGallery: {
              ...state.currentGallery,
              coverPhotoUrl,
            },
          };
        });
      },

      setGalleryList: (galleries: Gallery[]) => {
        set({ galleryList: galleries });
      },

      setCurrentGalleryId: (galleryId: string | null) => {
        set({ currentGalleryId: galleryId });
      },

      setGalleryOrders: (galleryId: string, orders: any[]) => {
        set((state) => ({
          galleryOrdersCache: {
            ...state.galleryOrdersCache,
            [galleryId]: {
              orders,
              timestamp: Date.now(),
            },
          },
        }));
      },

      getGalleryOrders: (galleryId: string, maxAge: number = 30000) => {
        const state = get();
        const cached = state.galleryOrdersCache[galleryId];
        if (!cached) {
          return null;
        }

        const age = Date.now() - cached.timestamp;
        if (age > maxAge) {
          return null;
        } // Cache expired

        return cached.orders;
      },

      setGalleryImages: (galleryId: string, images: any[]) => {
        // Store images as-is - cache busting is now handled automatically by LazyRetryableImage
        // component using the unified image loading strategy in image-fallback.ts
        // This ensures cache busting is part of the single source of truth

        const cacheTimestamp = Date.now();
        set((state) => ({
          galleryImagesCache: {
            ...state.galleryImagesCache,
            [galleryId]: {
              images, // Store without cache busting - applied by component
              timestamp: cacheTimestamp,
            },
          },
        }));
      },

      getGalleryImages: (galleryId: string, maxAge: number = 30000) => {
        const state = get();
        const cached = state.galleryImagesCache[galleryId];
        if (!cached) {
          return null;
        }

        const age = Date.now() - cached.timestamp;
        if (age > maxAge) {
          return null;
        } // Cache expired

        return cached.images;
      },

      getGalleryFromCache: (galleryId: string, maxAge: number = 60000) => {
        // Cache TTL: 60 seconds (longer than orders/images since gallery data changes less frequently)
        const state = get();
        const cached = state.galleryCache[galleryId];
        if (!cached) {
          return null;
        }

        const age = Date.now() - cached.timestamp;
        if (age > maxAge) {
          return null; // Cache expired
        }

        return cached.gallery;
      },

      invalidateGalleryCache: (galleryId?: string) => {
        set((state) => {
          if (galleryId) {
            const newCache = { ...state.galleryCache };
            delete newCache[galleryId];
            return { galleryCache: newCache };
          }
          // Clear all cache if no galleryId specified
          return { galleryCache: {} };
        });
      },

      invalidateGalleryOrdersCache: (galleryId: string) => {
        set((state) => {
          const newCache = { ...state.galleryOrdersCache };
          delete newCache[galleryId];
          return {
            galleryOrdersCache: newCache,
          };
        });
      },

      invalidateGalleryImagesCache: (galleryId: string) => {
        set((state) => {
          const newCache = { ...state.galleryImagesCache };
          delete newCache[galleryId];
          return {
            galleryImagesCache: newCache,
          };
        });
      },

      // Comprehensive cache invalidation - invalidates all caches for a gallery
      // Use this after any state-changing action (upload, delete, update, etc.)
      invalidateAllGalleryCaches: (galleryId: string) => {
        const state = get();
        state.invalidateGalleryCache(galleryId);
        state.invalidateGalleryOrdersCache(galleryId);
        state.invalidateGalleryImagesCache(galleryId);
      },

      fetchGallery: async (galleryId: string, forceRefresh = false) => {
        const state = get();

        // Request deduplication: if there's already an in-flight request for this gallery, return it
        if (galleryId in state.inFlightRequests && !forceRefresh) {
          return state.inFlightRequests[galleryId];
        }

        // Check cache first (unless force refresh)
        if (!forceRefresh) {
          const cached = state.getGalleryFromCache(galleryId);
          if (cached) {
            // Update current gallery if it's the one being viewed
            if (state.currentGalleryId === galleryId) {
              set({
                currentGallery: cached,
                currentGalleryId: galleryId,
              });
            }
            return cached;
          }
        }

        // Create the fetch promise and store it for deduplication
        const fetchPromise = (async () => {
          set({ isLoading: true, error: null });
          try {
            const galleryData = await api.galleries.get(galleryId);

            // Only set gallery if it has required fields
            if (galleryData?.galleryId && galleryData.ownerId && galleryData.state) {
              const gallery = galleryData as Gallery;

              // Update cache
              set((currentState) => ({
                galleryCache: {
                  ...currentState.galleryCache,
                  [galleryId]: {
                    gallery,
                    timestamp: Date.now(),
                  },
                },
                currentGallery: gallery,
                currentGalleryId: galleryId,
                isLoading: false,
              }));

              return gallery;
            }

            set({ isLoading: false });
            return null;
          } catch (err) {
            const error = err instanceof Error ? err.message : "Failed to fetch gallery";
            set({ error, isLoading: false });
            throw err;
          } finally {
            // Remove from in-flight requests when done
            set((currentState) => {
              const newInFlight = { ...currentState.inFlightRequests };
              delete newInFlight[galleryId];
              return { inFlightRequests: newInFlight };
            });
          }
        })();

        // Store the promise for deduplication
        set((currentState) => ({
          inFlightRequests: {
            ...currentState.inFlightRequests,
            [galleryId]: fetchPromise,
          },
        }));

        return fetchPromise;
      },

      fetchGalleryImages: async (galleryId: string, forceRefresh = false) => {
        const state = get();

        // Always bypass cache when forceRefresh is true (used after uploads)
        if (!forceRefresh) {
          const cached = state.getGalleryImages(galleryId);
          if (cached) {
            return cached;
          }
        } else {
          // Clear cache when force refreshing
          state.invalidateGalleryImagesCache(galleryId);
        }

        try {
          // Always fetch fresh - no cache to avoid old state
          // Request only thumb size for dashboard gallery photos view (optimization)
          // Fallback URLs will still be available if needed
          const response = await api.galleries.getImages(galleryId, "thumb");
          const images = response.images ?? [];
          // setGalleryImages will apply cache-busting automatically
          state.setGalleryImages(galleryId, images);
          // Return images with cache-busting applied
          return state.getGalleryImages(galleryId) ?? images;
        } catch (err) {
          // Return empty array on error instead of throwing
          console.error("[GalleryStore] Failed to fetch gallery images:", err);
          return [];
        }
      },

      fetchGalleryOrders: async (galleryId: string, forceRefresh = false) => {
        const state = get();

        // Check cache first (unless force refresh)
        if (!forceRefresh) {
          const cached = state.getGalleryOrders(galleryId);
          if (cached) {
            // Update galleryOrders state from cache
            const typedOrders: GalleryOrder[] = cached.filter(
              (order): order is GalleryOrder =>
                typeof order === "object" &&
                order !== null &&
                "orderId" in order &&
                typeof (order as { orderId?: unknown }).orderId === "string"
            );
            set({ galleryOrders: typedOrders });
            return cached;
          }
        }

        try {
          const response = await api.orders.getByGallery(galleryId);
          const orders = (response.items ?? []) as any[];
          state.setGalleryOrders(galleryId, orders);
          // Update galleryOrders state
          const typedOrders: GalleryOrder[] = orders.filter(
            (order): order is GalleryOrder =>
              typeof order === "object" &&
              order !== null &&
              "orderId" in order &&
              typeof (order as { orderId?: unknown }).orderId === "string"
          );
          set({ galleryOrders: typedOrders });
          return orders;
        } catch (err) {
          // Check if error is 404 (gallery not found/deleted) - handle silently
          const apiError = err as { status?: number };
          if (apiError.status === 404) {
            // Gallery doesn't exist (deleted) - return empty array silently
            set({ galleryOrders: [] });
            return [];
          }

          // For other errors, log but still return empty array
          // eslint-disable-next-line no-console
          console.error("[GalleryStore] Failed to fetch gallery orders:", err);
          set({ galleryOrders: [] });
          return [];
        }
      },

      sendGalleryLinkToClient: async (galleryId: string) => {
        set({ sendLinkLoading: true });
        try {
          const response = await api.galleries.sendToClient(galleryId);
          const isReminder = response.isReminder ?? false;

          // Optimize cache invalidation: only invalidate what actually changed
          if (isReminder) {
            // For reminders: nothing changed (just sent an email), so no cache invalidation or fetching needed
            // The orders list is still valid - no new order was created, no data changed
            // UI will update via the isReminder response to show appropriate message
          } else {
            // For initial invitations: a new order was created, so invalidate orders cache
            const { useOrderStore } = await import("./orderSlice");
            useOrderStore.getState().invalidateGalleryOrdersCache(galleryId);
            get().invalidateGalleryOrdersCache(galleryId);

            // Fetch fresh orders (will fetch since cache was invalidated)
            await get().fetchGalleryOrders(galleryId, false);

            // Gallery data hasn't changed (just order creation), so no need to invalidate/fetch gallery cache
          }

          set({ sendLinkLoading: false });
          return { isReminder };
        } catch (err) {
          set({ sendLinkLoading: false });
          console.error("[GalleryStore] Failed to send gallery link:", err);
          throw err;
        }
      },

      refreshGalleryBytesOnly: async (galleryId: string, forceRecalc = false) => {
        const state = get();

        // Only refresh if this is the current gallery
        if (state.currentGalleryId !== galleryId) {
          return;
        }

        // Silent refresh: use lightweight endpoint to only fetch bytes fields
        // Debouncing removed - called explicitly when needed (image removed or all photos uploaded)
        // forceRecalc: if true, forces recalculation from S3 (bypasses cache)
        try {
          const bytesData = await api.galleries.getBytesUsed(galleryId, forceRecalc);

          // Only update bytes fields - lightweight update without full gallery fetch
          if (bytesData) {
            set((currentState) => {
              if (!currentState.currentGallery || currentState.currentGalleryId !== galleryId) {
                return currentState; // Don't update if gallery changed
              }

              // Only update bytes fields, keep everything else
              const updatedGallery = {
                ...currentState.currentGallery,
                originalsBytesUsed: bytesData.originalsBytesUsed ?? 0,
                finalsBytesUsed: bytesData.finalsBytesUsed ?? 0,
              };

              return {
                ...currentState,
                currentGallery: updatedGallery,
              };
            });

            // Zustand state update will trigger re-renders automatically via subscriptions
          }
        } catch (err) {
          // Silently fail - don't show error or trigger loading state
          console.error("[GalleryStore] Failed to refresh gallery bytes (silent):", err);
        }
      },

      refreshGalleryStatusOnly: async (galleryId: string) => {
        const state = get();

        // Only refresh if this is the current gallery
        if (state.currentGalleryId !== galleryId) {
          return;
        }

        // Silent refresh: use lightweight endpoint to only fetch status fields
        try {
          const statusData = await api.galleries.getStatus(galleryId);

          // Only update status fields - lightweight update without full gallery fetch
          if (statusData) {
            set((currentState) => {
              if (!currentState.currentGallery || currentState.currentGalleryId !== galleryId) {
                return currentState; // Don't update if gallery changed
              }

              // Only update status fields, keep everything else
              return {
                currentGallery: {
                  ...currentState.currentGallery,
                  state: statusData.state,
                  paymentStatus: statusData.paymentStatus,
                  isPaid: statusData.isPaid,
                },
              };
            });

            // Zustand state update will trigger re-renders automatically via subscriptions
          }
        } catch (err) {
          // Silently fail - don't show error or trigger loading state
          console.error("[GalleryStore] Failed to refresh gallery status (silent):", err);
        }
      },

      setFilter: (filter: string) => {
        set((_state) => ({
          filters: { [filter]: true },
        }));
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      setError: (error: string | null) => {
        set({ error });
      },

      clearCurrentGallery: () => {
        set({
          currentGallery: null,
          currentGalleryId: null,
        });
      },

      clearGalleryList: () => {
        set({ galleryList: [] });
      },

      clearAll: () => {
        set({
          currentGallery: null,
          galleryList: [],
          currentGalleryId: null,
          galleryOrdersCache: {},
          galleryImagesCache: {},
          filters: {},
          isLoading: false,
          error: null,
          galleryOrders: [],
          hasDeliveredOrders: undefined,
          galleryUrl: "",
          sendLinkLoading: false,
        });
      },

      // Next Steps Overlay state
      nextStepsOverlayExpanded: true,
      setNextStepsOverlayExpanded: (expanded: boolean) => {
        set({ nextStepsOverlayExpanded: expanded });
      },
      // Publish Wizard state
      publishWizardOpen: false,
      publishWizardGalleryId: null,
      publishWizardState: null,
      setPublishWizardOpen: (
        open: boolean,
        galleryId?: string | null,
        state?: { duration?: string; planKey?: string } | null
      ) => {
        set({
          publishWizardOpen: open,
          publishWizardGalleryId: open ? (galleryId ?? null) : null,
          publishWizardState: open ? (state ?? null) : null,
        });
      },

      // Additional actions
      setGalleryOrders: (orders: GalleryOrder[]) => {
        set({ galleryOrders: orders });
      },

      setHasDeliveredOrders: (has: boolean | undefined) => {
        set({ hasDeliveredOrders: has });
      },

      setGalleryUrl: (url: string) => {
        set({ galleryUrl: url });
      },

      setSendLinkLoading: (loading: boolean) => {
        set({ sendLinkLoading: loading });
      },

      checkDeliveredOrders: async (galleryId: string) => {
        try {
          const response = await api.galleries.checkDeliveredOrders(galleryId);
          const items = response.items ?? [];
          set({ hasDeliveredOrders: Array.isArray(items) && items.length > 0 });
        } catch (_err) {
          set({ hasDeliveredOrders: false });
        }
      },

      copyGalleryUrl: (galleryId: string) => {
        const state = get();
        const url =
          state.galleryUrl ||
          (typeof window !== "undefined" ? `${window.location.origin}/gallery/${galleryId}` : "");
        if (typeof window !== "undefined" && url) {
          void navigator.clipboard.writeText(url).catch(() => {
            // Ignore clipboard errors
          });
        }
      },

      reloadGallery: async (galleryId: string, forceRefresh = false) => {
        const state = get();
        await state.fetchGallery(galleryId, forceRefresh);
        await state.fetchGalleryOrders(galleryId, forceRefresh);
        await state.checkDeliveredOrders(galleryId);
      },
    }),
    { name: "GalleryStore" }
  )
);
