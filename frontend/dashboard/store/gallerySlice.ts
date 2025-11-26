import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface Gallery {
  galleryId: string;
  galleryName?: string;
  ownerId: string;
  state: string;
  paymentStatus?: string;
  isPaid?: boolean;
  selectionEnabled?: boolean;
  hasBackupStorage?: boolean;
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
  filters: {
    unpaid?: boolean;
    wyslano?: boolean;
    wybrano?: boolean;
    'prosba-o-zmiany'?: boolean;
    'gotowe-do-wysylki'?: boolean;
    dostarczone?: boolean;
  };
  isLoading: boolean;
  error: string | null;
  setCurrentGallery: (gallery: Gallery | null) => void;
  setGalleryList: (galleries: Gallery[]) => void;
  setCurrentGalleryId: (galleryId: string | null) => void;
  setFilter: (filter: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearCurrentGallery: () => void;
  clearGalleryList: () => void;
  clearAll: () => void;
}

export const useGalleryStore = create<GalleryState>()(
  devtools(
    (set) => ({
  currentGallery: null,
  galleryList: [],
  currentGalleryId: null,
  filters: {},
  isLoading: false,
  error: null,

  setCurrentGallery: (gallery: Gallery | null) => {
    set({ 
      currentGallery: gallery,
      currentGalleryId: gallery?.galleryId || null,
    });
  },

  setGalleryList: (galleries: Gallery[]) => {
    set({ galleryList: galleries });
  },

  setCurrentGalleryId: (galleryId: string | null) => {
    set({ currentGalleryId: galleryId });
  },

  setFilter: (filter: string) => {
    set((state) => ({
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
    set({ currentGallery: null, currentGalleryId: null });
  },

  clearGalleryList: () => {
    set({ galleryList: [] });
  },

  clearAll: () => {
    set({
      currentGallery: null,
      galleryList: [],
      currentGalleryId: null,
      filters: {},
      isLoading: false,
      error: null,
    });
  },
    }),
    { name: 'GalleryStore' }
  )
);

