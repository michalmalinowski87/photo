// Centralized hook exports to avoid circular dependencies
import { useUnifiedStore } from "./unifiedStore";

// All store hooks are aliases to useUnifiedStore
export const useAuthStore = useUnifiedStore;
export const useDownloadStore = useUnifiedStore;
export const useGalleryStore = useUnifiedStore;
export const useModalStore = useUnifiedStore;
export const useOrderStore = useUnifiedStore;
export const useOverlayStore = useUnifiedStore;
export const useSidebarStore = useUnifiedStore;
export const useThemeStore = useUnifiedStore;
export const useToastStore = useUnifiedStore;
export const useUploadStore = useUnifiedStore;
export const useUserStore = useUnifiedStore;
export const useUIStore = useUnifiedStore;
