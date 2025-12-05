import { StateCreator } from "zustand";

import api from "../lib/api-service";
import { storeLogger } from "../lib/store-logger";
import type { Order } from "./orderSlice";

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

export interface GallerySlice {
  currentGallery: Gallery | null;
  galleryList: Gallery[];
  galleryImages: Record<string, any[]>; // Simple map of galleryId to images array
  isLoading: boolean;
  error: string | null;
  galleryCreationLoading: boolean;
  setCurrentGallery: (gallery: Gallery | null) => void;
  setGalleryList: (galleries: Gallery[]) => void;
  setGalleryImages: (galleryId: string, images: any[]) => void;
  fetchGallery: (galleryId: string) => Promise<Gallery | null>;
  fetchGalleryImages: (galleryId: string) => Promise<any[]>;
  fetchGalleryOrders: (galleryId: string) => Promise<any[]>;
  sendGalleryLinkToClient: (galleryId: string) => Promise<{ isReminder: boolean }>;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setGalleryCreationLoading: (loading: boolean) => void;
  updateFinalsBytesUsed: (sizeDelta: number) => void;
  updateOriginalsBytesUsed: (sizeDelta: number) => void;
  updateCoverPhotoUrl: (coverPhotoUrl: string | null) => void;
  clearCurrentGallery: () => void;
  clearGalleryList: () => void;
  clearAll: () => void;
  reloadGallery: (galleryId: string) => Promise<void>;
}

export const createGallerySlice: StateCreator<
  GallerySlice,
  [["zustand/devtools", never]],
  [],
  GallerySlice
> = (set, get) => ({
  currentGallery: null,
  galleryList: [],
  galleryImages: {},
  isLoading: false,
  error: null,
  galleryCreationLoading: false,

  setCurrentGallery: (gallery: Gallery | null) => {
    set({ currentGallery: gallery }, undefined, "gallery/setCurrentGallery");
  },

  updateFinalsBytesUsed: (sizeDelta: number) => {
    set(
      (state) => {
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
      },
      undefined,
      "gallery/updateFinalsBytesUsed"
    );
  },

  updateOriginalsBytesUsed: (sizeDelta: number) => {
    set(
      (state) => {
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
      },
      undefined,
      "gallery/updateOriginalsBytesUsed"
    );
  },

  updateCoverPhotoUrl: (coverPhotoUrl: string | null) => {
    set(
      (state) => {
        if (!state.currentGallery) {
          return state;
        }
        return {
          currentGallery: {
            ...state.currentGallery,
            coverPhotoUrl: coverPhotoUrl ?? undefined,
          },
        };
      },
      undefined,
      "gallery/updateCoverPhotoUrl"
    );
  },

  setGalleryList: (galleries: Gallery[]) => {
    set({ galleryList: galleries }, undefined, "gallery/setGalleryList");
  },

  // setGalleryOrders and getGalleryOrders removed - use orderStore.getOrdersByGalleryId() instead

  setGalleryImages: (galleryId: string, images: any[]) => {
    set(
      (state) => ({
        galleryImages: {
          ...state.galleryImages,
          [galleryId]: images,
        },
      }),
      undefined,
      "gallery/setGalleryImages"
    );
  },

  fetchGallery: async (galleryId: string) => {
    // If we already have this gallery, return it
    const state = get();
    if (state.currentGallery?.galleryId === galleryId) {
      return state.currentGallery;
    }

    set({ isLoading: true, error: null }, undefined, "gallery/fetchGallery/start");
    try {
      const galleryData = await api.galleries.get(galleryId);

      if (galleryData?.galleryId && galleryData.ownerId && galleryData.state) {
        const gallery = galleryData as Gallery;
        set(
          {
            currentGallery: gallery,
            isLoading: false,
          },
          undefined,
          "gallery/fetchGallery/success"
        );
        return gallery;
      }

      set({ isLoading: false }, undefined, "gallery/fetchGallery/empty");
      return null;
    } catch (err) {
      const error = err instanceof Error ? err.message : "Failed to fetch gallery";
      set({ error, isLoading: false }, undefined, "gallery/fetchGallery/error");
      throw err;
    }
  },

  fetchGalleryImages: async (galleryId: string) => {
    // If we already have images for this gallery, return them
    const state = get();
    if (state.galleryImages[galleryId]) {
      return state.galleryImages[galleryId];
    }

    try {
      const response = await api.galleries.getImages(galleryId, "thumb");
      const images = response.images ?? [];
      get().setGalleryImages(galleryId, images);
      return images;
    } catch (err) {
      console.error("[GalleryStore] Failed to fetch gallery images:", err);
      return [];
    }
  },

  fetchGalleryOrders: async (galleryId: string) => {
    // Check if orders already exist in orderStore
    const unifiedState = get() as any as {
      getOrdersByGalleryId?: (galleryId: string) => Order[];
      setOrdersByGalleryId?: (galleryId: string, orders: Order[]) => void;
    };
    if (unifiedState.getOrdersByGalleryId) {
      const existingOrders = unifiedState.getOrdersByGalleryId(galleryId);
      if (existingOrders && existingOrders.length > 0) {
        return existingOrders;
      }
    }

    try {
      const response = await api.orders.getByGallery(galleryId);
      const orders = (response.items ?? []) as Order[];

      // Store orders in orderStore
      if (unifiedState.setOrdersByGalleryId) {
        unifiedState.setOrdersByGalleryId(galleryId, orders);
      }

      return orders;
    } catch (err) {
      const apiError = err as { status?: number };
      if (apiError.status === 404) {
        return [];
      }
      console.error("[GalleryStore] Failed to fetch gallery orders:", err);
      return [];
    }
  },

  sendGalleryLinkToClient: async (galleryId: string) => {
    try {
      const response = await api.galleries.sendToClient(galleryId);
      const isReminder = response.isReminder ?? false;

      // If it's not a reminder, a new order was created - fetch fresh orders
      if (!isReminder) {
        await get().fetchGalleryOrders(galleryId);
      }

      return { isReminder };
    } catch (err) {
      console.error("[GalleryStore] Failed to send gallery link:", err);
      throw err;
    }
  },

  setLoading: (loading: boolean) => {
    set({ isLoading: loading }, undefined, "gallery/setLoading");
  },

  setError: (error: string | null) => {
    set({ error }, undefined, "gallery/setError");
  },

  setGalleryCreationLoading: (loading: boolean) => {
    set({ galleryCreationLoading: loading }, undefined, "gallery/setGalleryCreationLoading");
  },

  clearCurrentGallery: () => {
    set(
      { currentGallery: null, isLoading: false, error: null },
      undefined,
      "gallery/clearCurrentGallery"
    );
  },

  clearGalleryList: () => {
    set({ galleryList: [] }, undefined, "gallery/clearGalleryList");
  },

  clearAll: () => {
    set(
      {
        currentGallery: null,
        galleryList: [],
        galleryImages: {},
        isLoading: false,
        error: null,
      },
      undefined,
      "gallery/clearAll"
    );
  },

  reloadGallery: async (galleryId: string) => {
    const state = get();
    await state.fetchGallery(galleryId);
    await state.fetchGalleryOrders(galleryId);
  },
});
