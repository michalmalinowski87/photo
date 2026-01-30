import { useMutation, useQueryClient } from "@tanstack/react-query";

import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";

interface PackageFormData {
  name: string;
  includedPhotos: number;
  pricePerExtraPhoto?: number; // Optional
  price: number;
  photoBookCount?: number;
  photoPrintCount?: number;
}

export function useCreatePackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PackageFormData) => api.packages.create(data),
    onSuccess: () => {
      // Invalidate all package lists to refetch
      void queryClient.invalidateQueries({ queryKey: queryKeys.packages.lists() });
    },
  });
}

export function useUpdatePackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ packageId, data }: { packageId: string; data: PackageFormData }) =>
      api.packages.update(packageId, data),
    onSuccess: (_, variables) => {
      // Invalidate specific package detail
      void queryClient.invalidateQueries({
        queryKey: queryKeys.packages.detail(variables.packageId),
      });
      // Invalidate all package lists to refetch
      void queryClient.invalidateQueries({ queryKey: queryKeys.packages.lists() });
    },
  });
}

export function useDeletePackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (packageId: string) => api.packages.delete(packageId),
    onSuccess: (_, packageId) => {
      // Remove specific package from cache
      queryClient.removeQueries({ queryKey: queryKeys.packages.detail(packageId) });
      // Invalidate all package lists to refetch
      void queryClient.invalidateQueries({ queryKey: queryKeys.packages.lists() });
    },
  });
}
