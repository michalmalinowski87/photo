import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface Gallery {
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
  isGalleryStale: (maxAge?: number) => boolean;
  invalidateGalleryCache: (galleryId?: string) => void;
  invalidateGalleryOrdersCache: (galleryId: string) => void;
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
