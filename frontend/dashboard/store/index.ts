// Main store exports
export { useUserStore } from './userSlice';
export { useGalleryStore } from './gallerySlice';
export { useOrderStore } from './orderSlice';
export { useUploadStore } from './uploadSlice';
export { useDownloadStore } from './downloadSlice';
export { useUIStore } from './uiSlice';

import { useGalleryStore } from './gallerySlice';
import { useOrderStore } from './orderSlice';
import { useUploadStore } from './uploadSlice';
import { useDownloadStore } from './downloadSlice';

// Helper function to clear all ephemeral state on navigation
export const clearEphemeralState = () => {
  useGalleryStore.getState().clearCurrentGallery();
  useOrderStore.getState().clearOrderList();
  useOrderStore.getState().clearCurrentOrder();
  useUploadStore.getState().clearCompletedUploads();
  useDownloadStore.getState().clearCompletedDownloads();
};

