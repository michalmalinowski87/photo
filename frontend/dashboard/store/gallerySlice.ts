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
  // Cache for gallery orders list (keyed by galleryId)
  galleryOrdersCache: Record<string, { orders: any[]; timestamp: number }>;
  // Cache for gallery images (keyed by galleryId)
  galleryImagesCache: Record<string, { images: any[]; timestamp: number }>;
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
  // Fetch actions that check cache and call API if needed
  fetchGallery: (galleryId: string, forceRefresh?: boolean) => Promise<Gallery | null>;
  fetchGalleryImages: (galleryId: string, forceRefresh?: boolean) => Promise<any[]>;
  fetchGalleryOrders: (galleryId: string, forceRefresh?: boolean) => Promise<any[]>;
  sendGalleryLinkToClient: (galleryId: string) => Promise<{ isReminder: boolean }>;
  refreshGalleryBytesOnly: (galleryId: string) => Promise<void>; // Silent refresh that only updates bytes used
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

// Debounce timers for refreshGalleryBytesOnly (keyed by galleryId)
const bytesRefreshTimers = new Map<string, NodeJS.Timeout>();

export const useGalleryStore = create<GalleryState>()(
  devtools(
    (set, get) => ({
      currentGallery: null,
      galleryList: [],
      currentGalleryId: null,
      galleryOrdersCache: {},
      galleryImagesCache: {},
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
        if (!cached) {return null;}

        const age = Date.now() - cached.timestamp;
        if (age > maxAge) {return null;} // Cache expired

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
        if (!cached) {return null;}

        const age = Date.now() - cached.timestamp;
        if (age > maxAge) {return null;} // Cache expired

        return cached.images;
      },

      invalidateGalleryCache: (_galleryId?: string) => {
        // No-op: cache removed, always fetch fresh
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

      fetchGallery: async (galleryId: string, _forceRefresh = false) => {
        // Always fetch fresh - no cache
        set({ isLoading: true, error: null });
        try {
          const galleryData = await api.galleries.get(galleryId);

          // Only set gallery if it has required fields
          if (galleryData?.galleryId && galleryData.ownerId && galleryData.state) {
            set({
              currentGallery: galleryData as Gallery,
              currentGalleryId: galleryData.galleryId,
              isLoading: false,
            });
            return galleryData as Gallery;
          }

          set({ isLoading: false });
          return null;
        } catch (err) {
          const error = err instanceof Error ? err.message : "Failed to fetch gallery";
          set({ error, isLoading: false });
          throw err;
        }
      },

      fetchGalleryImages: async (galleryId: string, _forceRefresh = false) => {
        // Always fetch fresh - no cache
        const state = get();
        try {
          const response = await api.galleries.getImages(galleryId);
          const images = response.images ?? [];

          // Update cache for optimistic updates only
          state.setGalleryImages(galleryId, images);

          return images;
        } catch (err) {
          // Return empty array on error instead of throwing
          console.error("[GalleryStore] Failed to fetch gallery images:", err);
          return [];
        }
      },

      fetchGalleryOrders: async (galleryId: string, _forceRefresh = false) => {
        // Always fetch fresh - no cache
        const state = get();
        try {
          const response = await api.orders.getByGallery(galleryId);
          const orders = (response.items ?? []) as any[];

          // Update cache for optimistic updates only
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

      refreshGalleryBytesOnly: async (galleryId: string) => {
        // If a timeout already exists for this galleryId, don't create another one
        // This ensures multiple rapid calls result in only one API call
        const existingTimer = bytesRefreshTimers.get(galleryId);
        if (existingTimer) {
          return; // Already have a pending request, skip this call
        }

        // Set new timeout to debounce the API call by 2 seconds
        const timer = setTimeout(async () => {
          bytesRefreshTimers.delete(galleryId);
          
          const state = get();

          // Only refresh if this is the current gallery
          if (state.currentGalleryId !== galleryId) {
            return;
          }

          // Silent refresh: use lightweight endpoint to only fetch bytes fields
          try {
            const bytesData = await api.galleries.getBytesUsed(galleryId);

            // Only update bytes fields - lightweight update without full gallery fetch
            if (bytesData) {
              set((currentState) => {
                if (!currentState.currentGallery || currentState.currentGalleryId !== galleryId) {
                  return currentState; // Don't update if gallery changed
                }

                // Only update bytes fields, keep everything else
                return {
                  currentGallery: {
                    ...currentState.currentGallery,
                    originalsBytesUsed: bytesData.originalsBytesUsed ?? 0,
                    finalsBytesUsed: bytesData.finalsBytesUsed ?? 0,
                  },
                };
              });

              // Zustand state update will trigger re-renders automatically via subscriptions
            }
          } catch (err) {
            // Silently fail - don't show error or trigger loading state
            console.error("[GalleryStore] Failed to refresh gallery bytes (silent):", err);
          }
        }, 2000); // 2 second debounce

        bytesRefreshTimers.set(galleryId, timer);
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
