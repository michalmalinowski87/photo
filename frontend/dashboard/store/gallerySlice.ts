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
  // Cache timestamp for current gallery
  galleryCacheTimestamp: number | null;
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
  isGalleryStale: (maxAge?: number) => boolean;
  invalidateGalleryCache: (galleryId?: string) => void;
  invalidateGalleryOrdersCache: (galleryId: string) => void;
  invalidateGalleryImagesCache: (galleryId: string) => void;
  // Fetch actions that check cache and call API if needed
  fetchGallery: (galleryId: string, forceRefresh?: boolean) => Promise<Gallery | null>;
  fetchGalleryImages: (galleryId: string, forceRefresh?: boolean) => Promise<any[]>;
  fetchGalleryOrders: (galleryId: string, forceRefresh?: boolean) => Promise<any[]>;
  setFilter: (filter: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateFinalsBytesUsed: (sizeDelta: number) => void; // Optimistic update for finals bytes
  clearCurrentGallery: () => void;
  clearGalleryList: () => void;
  clearAll: () => void;
}

export const useGalleryStore = create<GalleryState>()(
  devtools(
    (set, get) => ({
      currentGallery: null,
      galleryList: [],
      currentGalleryId: null,
      galleryOrdersCache: {},
      galleryImagesCache: {},
      galleryCacheTimestamp: null,
      filters: {},
      isLoading: false,
      error: null,

      setCurrentGallery: (gallery: Gallery | null) => {
        set({
          currentGallery: gallery,
          currentGalleryId: gallery?.galleryId || null,
          galleryCacheTimestamp: gallery ? Date.now() : null,
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
        if (!cached) return null;

        const age = Date.now() - cached.timestamp;
        if (age > maxAge) return null; // Cache expired

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
        if (!cached) return null;

        const age = Date.now() - cached.timestamp;
        if (age > maxAge) return null; // Cache expired

        return cached.images;
      },

      isGalleryStale: (maxAge: number = 30000) => {
        const state = get();
        if (!state.galleryCacheTimestamp) return true;
        const age = Date.now() - state.galleryCacheTimestamp;
        return age > maxAge;
      },

      invalidateGalleryCache: (galleryId?: string) => {
        set((state) => {
          // If galleryId provided, only invalidate if it matches current gallery
          if (galleryId && state.currentGalleryId !== galleryId) {
            return state; // Don't invalidate if different gallery
          }
          return {
            galleryCacheTimestamp: null, // Force refresh on next load
          };
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

      fetchGallery: async (galleryId: string, forceRefresh = false) => {
        const state = get();
        
        // Check cache first if not forcing refresh
        if (!forceRefresh) {
          if (state.currentGallery?.galleryId === galleryId && !state.isGalleryStale(30000)) {
            return state.currentGallery;
          }
        }

        // Fetch from API
        set({ isLoading: true, error: null });
        try {
          const galleryData = await api.galleries.get(galleryId);
          
          // Only set gallery if it has required fields
          if (galleryData?.galleryId && galleryData.ownerId && galleryData.state) {
            set({
              currentGallery: galleryData as Gallery,
              currentGalleryId: galleryData.galleryId,
              galleryCacheTimestamp: Date.now(),
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

      fetchGalleryImages: async (galleryId: string, forceRefresh = false) => {
        const state = get();
        
        // Check cache first if not forcing refresh
        if (!forceRefresh) {
          const cached = state.getGalleryImages(galleryId, 30000);
          if (cached) {
            return cached;
          }
        }

        // Fetch from API
        try {
          const response = await api.galleries.getImages(galleryId);
          const images = response.images ?? [];
          
          // Update cache
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
        
        // Check cache first if not forcing refresh
        if (!forceRefresh) {
          const cached = state.getGalleryOrders(galleryId, 30000);
          if (cached) {
            return cached;
          }
        }

        // Fetch from API
        try {
          const response = await api.orders.getByGallery(galleryId);
          const orders = (response.items ?? []) as any[];
          
          // Update cache
          state.setGalleryOrders(galleryId, orders);
          
          return orders;
        } catch (err) {
          // Return empty array on error instead of throwing
          console.error("[GalleryStore] Failed to fetch gallery orders:", err);
          return [];
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
          galleryCacheTimestamp: null,
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
          galleryCacheTimestamp: null,
          filters: {},
          isLoading: false,
          error: null,
        });
      },
    }),
    { name: "GalleryStore" }
  )
);
