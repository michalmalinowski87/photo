import { StateCreator } from "zustand";

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
  galleryCreationLoading: boolean;
  setGalleryCreationLoading: (loading: boolean) => void;
}

export const createGallerySlice: StateCreator<
  GallerySlice,
  [["zustand/devtools", never]],
  [],
  GallerySlice
> = (set) => ({
  galleryCreationLoading: false,

  setGalleryCreationLoading: (loading: boolean) => {
    set({ galleryCreationLoading: loading }, undefined, "gallery/setGalleryCreationLoading");
  },
});
