import { create } from "zustand";
import { devtools } from "zustand/middleware";

import api from "../lib/api-service";

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
          // eslint-disable-next-line no-console
          console.log("[gallerySlice] updateFinalsBytesUsed", {
            currentFinalsBytes,
            sizeDelta,
            newFinalsBytes,
            galleryId: state.currentGallery.galleryId,
          });
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
        set((state) => ({
          galleryImagesCache: {
            ...state.galleryImagesCache,
            [galleryId]: {
              images,
              timestamp: Date.now(),
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

        // Check cache first (unless force refresh)
        if (!forceRefresh) {
          const cached = state.getGalleryImages(galleryId);
          if (cached) {
            return cached;
          }
        }

        try {
          const response = await api.galleries.getImages(galleryId);
          const images = response.images ?? [];
          state.setGalleryImages(galleryId, images);
          return images;
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
            return cached;
          }
        }

        try {
          const response = await api.orders.getByGallery(galleryId);
          const orders = (response.items ?? []) as any[];
          state.setGalleryOrders(galleryId, orders);
          return orders;
        } catch (err) {
          // Return empty array on error instead of throwing
          console.error("[GalleryStore] Failed to fetch gallery orders:", err);
          return [];
        }
      },

      sendGalleryLinkToClient: async (galleryId: string) => {
        try {
          const response = await api.galleries.sendToClient(galleryId);
          const isReminder = response.isReminder ?? false;

          // Invalidate all caches to ensure fresh data on next fetch
          get().invalidateAllGalleryCaches(galleryId);

          // Always reload orders to get updated status (for both initial and reminders)
          await get().fetchGalleryOrders(galleryId, true);

          // Only reload gallery data if it's an initial invitation (creates order), not for reminders
          if (!isReminder) {
            await get().fetchGallery(galleryId, true);
          }

          return { isReminder };
        } catch (err) {
          console.error("[GalleryStore] Failed to send gallery link:", err);
          throw err;
        }
      },

      refreshGalleryBytesOnly: async (galleryId: string, forceRecalc = false) => {
        const state = get();

        console.log("[gallerySlice] refreshGalleryBytesOnly - Starting", {
          galleryId,
          forceRecalc,
          currentGalleryId: state.currentGalleryId,
          currentFinalsBytes: state.currentGallery?.finalsBytesUsed,
          currentOriginalsBytes: state.currentGallery?.originalsBytesUsed,
        });

        // Only refresh if this is the current gallery
        if (state.currentGalleryId !== galleryId) {
          console.log("[gallerySlice] refreshGalleryBytesOnly - Skipping (different gallery)", {
            requestedGalleryId: galleryId,
            currentGalleryId: state.currentGalleryId,
          });
          return;
        }

        // Silent refresh: use lightweight endpoint to only fetch bytes fields
        // Debouncing removed - called explicitly when needed (image removed or all photos uploaded)
        // forceRecalc: if true, forces recalculation from S3 (bypasses cache)
        try {
          console.log("[gallerySlice] refreshGalleryBytesOnly - Calling API", {
            galleryId,
            forceRecalc,
          });
          const bytesData = await api.galleries.getBytesUsed(galleryId, forceRecalc);
          console.log("[gallerySlice] refreshGalleryBytesOnly - API response", {
            bytesData,
            originalsBytesUsed: bytesData.originalsBytesUsed,
            finalsBytesUsed: bytesData.finalsBytesUsed,
          });

          // Only update bytes fields - lightweight update without full gallery fetch
          if (bytesData) {
            set((currentState) => {
              if (!currentState.currentGallery || currentState.currentGalleryId !== galleryId) {
                console.log(
                  "[gallerySlice] refreshGalleryBytesOnly - Skipping update (gallery changed)"
                );
                return currentState; // Don't update if gallery changed
              }

              const beforeUpdate = {
                originalsBytesUsed: currentState.currentGallery.originalsBytesUsed,
                finalsBytesUsed: currentState.currentGallery.finalsBytesUsed,
              };

              // Only update bytes fields, keep everything else
              const updatedGallery = {
                ...currentState.currentGallery,
                originalsBytesUsed: bytesData.originalsBytesUsed ?? 0,
                finalsBytesUsed: bytesData.finalsBytesUsed ?? 0,
              };

              // eslint-disable-next-line no-console
              console.log("[gallerySlice] refreshGalleryBytesOnly - Updating store", {
                before: beforeUpdate,
                after: {
                  originalsBytesUsed: updatedGallery.originalsBytesUsed,
                  finalsBytesUsed: updatedGallery.finalsBytesUsed,
                },
              });

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
    }),
    { name: "GalleryStore" }
  )
);
