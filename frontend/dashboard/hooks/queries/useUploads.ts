import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";

interface MultipartPartsResponse {
  parts: unknown[];
  [key: string]: unknown;
}

export function useListMultipartParts(
  galleryId: string | undefined,
  uploadId: string | undefined,
  key: string | undefined,
  options?: Omit<UseQueryOptions<MultipartPartsResponse>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: queryKeys.uploads.multipartParts(galleryId ?? "", uploadId ?? "", key ?? ""),
    queryFn: () => {
      if (!galleryId || !uploadId || !key) {
        throw new Error("Gallery ID, Upload ID, and Key are required");
      }
      return api.uploads.listMultipartParts(galleryId, { uploadId, key });
    },
    enabled: !!galleryId && !!uploadId && !!key,
    staleTime: 5 * 60 * 1000, // 5 minutes - parts don't change frequently
    ...options,
  });
}
