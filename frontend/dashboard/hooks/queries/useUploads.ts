import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";

export function useListMultipartParts(
  galleryId: string | undefined,
  uploadId: string | undefined,
  key: string | undefined,
  options?: Omit<UseQueryOptions<any>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: queryKeys.uploads.multipartParts(galleryId!, uploadId!, key!),
    queryFn: () => api.uploads.listMultipartParts(galleryId!, { uploadId: uploadId!, key: key! }),
    enabled: !!galleryId && !!uploadId && !!key,
    staleTime: 5 * 60 * 1000, // 5 minutes - parts don't change frequently
    ...options,
  });
}
