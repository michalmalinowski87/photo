// Unified store
export { useUnifiedStore, type UnifiedStore } from "./unifiedStore";

// Re-export all hooks from centralized hooks file
export {
  useAuthStore,
  useDownloadStore,
  useGalleryStore,
  useModalStore,
  useOrderStore,
  useOverlayStore,
  useSidebarStore,
  useThemeStore,
  useToastStore,
  useUploadStore,
  useUserStore,
  useUIStore,
} from "./hooks";

// Re-export types from slice files
export type { Gallery, GalleryOrder } from "./gallerySlice";
export type { Order } from "./orderSlice";
export type { ToastMessage } from "./toastSlice";
export type { UploadProgress } from "./uploadSlice";
export type { DownloadProgress } from "./downloadSlice";
export type { Theme } from "./themeSlice";
export type { TablePreferences } from "./uiSlice";

// Helper function to clear all ephemeral state on navigation
import { useUnifiedStore } from "./unifiedStore";

export const clearEphemeralState = () => {
  const store = useUnifiedStore.getState();
  // React Query handles cache invalidation automatically
  // Only clear UI state like uploads/downloads
  if (store.clearCompletedUploads) {
    store.clearCompletedUploads();
  }
  if (store.clearCompletedDownloads) {
    store.clearCompletedDownloads();
  }
};
