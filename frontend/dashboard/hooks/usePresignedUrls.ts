import { useCallback } from "react";
import api from "../lib/api-service";
import { requestThrottler } from "../lib/requestThrottler";

export type UploadType = "originals" | "finals";

export interface PresignedUrlData {
  url: string;
  apiKey: string;
}

interface UsePresignedUrlsConfig {
  galleryId: string;
  orderId?: string;
  type: UploadType;
  onError?: (file: string, error: string) => void;
}

// Helper function to retry a request with exponential backoff and jitter
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  baseDelay: number = 500
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) {
        throw error;
      }
      const exponentialDelay = baseDelay * Math.pow(2, attempt);
      const jitter = Math.random() * 0.3 * exponentialDelay;
      const delay = exponentialDelay + jitter;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Max retries exceeded");
}

export function usePresignedUrls(config: UsePresignedUrlsConfig) {
  const fetchPresignedUrls = useCallback(
    async (
      files: File[],
      onCancel?: () => boolean
    ): Promise<Map<string, PresignedUrlData>> => {
      const PRESIGN_BATCH_SIZE = 20; // Get 20 presigned URLs per API call (max 50)
      const presignedUrlMap = new Map<string, PresignedUrlData>();

      for (let i = 0; i < files.length; i += PRESIGN_BATCH_SIZE) {
        if (onCancel?.()) {
          throw new Error("Upload cancelled by user");
        }

        const batch = files.slice(i, i + PRESIGN_BATCH_SIZE);

        try {
          // Use throttler to rate-limit API requests
          let batchPresignResponse: {
            urls: Array<{ key: string; url: string; objectKey: string }>;
          };

          if (config.type === "finals") {
            // Finals upload - batch endpoint
            batchPresignResponse = await requestThrottler.throttle(() =>
              retryWithBackoff(async () => {
                return await api.uploads.getFinalImagePresignedUrlsBatch(
                  config.galleryId,
                  config.orderId ?? "",
                  {
                    files: batch.map((file) => ({
                      key: file.name,
                      contentType: file.type || "image/jpeg",
                    })),
                  }
                );
              })
            );
          } else {
            // Originals upload - batch endpoint
            const timestamp = Date.now();
            batchPresignResponse = await requestThrottler.throttle(() =>
              retryWithBackoff(async () => {
                return await api.uploads.getPresignedUrlsBatch({
                  galleryId: config.galleryId,
                  files: batch.map((file, idx) => {
                    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
                    // Use microsecond precision to avoid collisions
                    const uniqueTimestamp = timestamp + idx;
                    return {
                      key: `originals/${uniqueTimestamp}_${sanitizedFilename}`,
                      contentType: file.type || "image/jpeg",
                      fileSize: file.size,
                    };
                  }),
                });
              })
            );
          }

          // Map presigned URLs to files
          batch.forEach((file, idx) => {
            const presignedUrl = batchPresignResponse.urls[idx];
            if (presignedUrl) {
              // Extract API key from objectKey (remove galleries/{galleryId}/ prefix)
              const apiKey = presignedUrl.objectKey.replace(
                `galleries/${config.galleryId}/`,
                ""
              );
              presignedUrlMap.set(file.name, { url: presignedUrl.url, apiKey });
            }
          });
        } catch (error) {
          // If batch presign fails, add all files in batch to errors
          batch.forEach((file) => {
            const errorMessage = (error as Error).message || "Failed to get presigned URL";
            config.onError?.(file.name, errorMessage);
          });
        }

        // Small delay between presign batches to avoid overwhelming API Gateway
        if (i + PRESIGN_BATCH_SIZE < files.length && !onCancel?.()) {
          await new Promise((resolve) => setTimeout(resolve, 200)); // 200ms delay between batches
        }
      }

      return presignedUrlMap;
    },
    [config]
  );

  return { fetchPresignedUrls };
}

