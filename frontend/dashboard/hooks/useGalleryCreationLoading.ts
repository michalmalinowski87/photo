import { useUnifiedStore } from "../store/unifiedStore";
import { useCreateGallery } from "./mutations/useGalleryMutations";
import { useCreateClient } from "./mutations/useClientMutations";
import { useUpdateClient } from "./mutations/useClientMutations";
import { useCreatePackage } from "./mutations/usePackageMutations";

/**
 * Hook to determine if gallery creation is in progress.
 * Derives loading state from React Query mutations AND persistent flow state.
 * The flow state persists across navigation to ensure seamless loading overlay.
 *
 * @returns true if any gallery creation-related mutation is pending OR flow is active
 */
export function useGalleryCreationLoading(): boolean {
  const createGalleryMutation = useCreateGallery();
  const createClientMutation = useCreateClient();
  const updateClientMutation = useUpdateClient();
  const createPackageMutation = useCreatePackage();
  const galleryCreationFlowActive = useUnifiedStore((state) => state.galleryCreationFlowActive);

  return (
    createGalleryMutation.isPending ||
    createClientMutation.isPending ||
    updateClientMutation.isPending ||
    createPackageMutation.isPending ||
    galleryCreationFlowActive
  );
}
