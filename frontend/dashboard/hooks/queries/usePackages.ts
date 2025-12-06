import { useQuery, UseQueryOptions } from "@tanstack/react-query";
import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";

interface Package {
  packageId: string;
  name?: string;
  includedPhotos?: number;
  pricePerExtraPhoto?: number;
  price?: number;
  [key: string]: any;
}

interface ListResponse<T> {
  items: T[];
  hasMore?: boolean;
  lastKey?: string | null;
}

export function usePackages(
  options?: Omit<UseQueryOptions<ListResponse<Package>>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: queryKeys.packages.list(),
    queryFn: () => api.packages.list(),
    staleTime: 30 * 1000,
    ...options,
  });
}

export function usePackage(
  packageId: string | undefined,
  options?: Omit<UseQueryOptions<Package>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: [...queryKeys.packages.all, "detail", packageId],
    queryFn: () => api.packages.get(packageId!),
    enabled: !!packageId,
    staleTime: 30 * 1000,
    ...options,
  });
}
