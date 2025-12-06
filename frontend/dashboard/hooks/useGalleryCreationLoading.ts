import { useCreateGallery } from "./mutations/useGalleryMutations";
import { useCreateClient } from "./mutations/useClientMutations";
import { useUpdateClient } from "./mutations/useClientMutations";
import { useCreatePackage } from "./mutations/usePackageMutations";

/**
 * Hook to determine if gallery creation is in progress.
 * Derives loading state from React Query mutations.
 *
 * @returns true if any gallery creation-related mutation is pending
 */
export function useGalleryCreationLoading(): boolean {
  const createGalleryMutation = useCreateGallery();
  const createClientMutation = useCreateClient();
  const updateClientMutation = useUpdateClient();
  const createPackageMutation = useCreatePackage();

  return (
    createGalleryMutation.isPending ||
    createClientMutation.isPending ||
    updateClientMutation.isPending ||
    createPackageMutation.isPending
  );
}
