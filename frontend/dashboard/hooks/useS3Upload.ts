import { useCallback } from "react";

import { PerImageProgress } from "../components/upload/UploadProgressOverlay";
import { applyOptimisticUpdate } from "../lib/optimistic-updates";
import { useGalleryStore } from "../store/gallerySlice";

import { PresignedUrlData } from "./usePresignedUrls";

export type UploadType = "originals" | "finals";

interface UploadResult {
  success: boolean;
  file: string;
  key?: string;
  error?: string;
}

interface UseS3UploadConfig {
  galleryId: string;
  type: UploadType;
  updateProgress: (updater: (prev: PerImageProgress[]) => PerImageProgress[]) => void;
  onUploadProgress?: (current: number, total: number, fileName: string) => void;
  onError?: (file: string, error: string) => void;
  onSuccess?: (file: string, key: string) => void;
}

export function useS3Upload(config: UseS3UploadConfig) {
  const uploadFiles = useCallback(
    async (
      files: File[],
      presignedUrlMap: Map<string, PresignedUrlData>,
      onCancel?: () => boolean
    ): Promise<UploadResult[]> => {
      const UPLOAD_CONCURRENCY = 5; // Upload 5 files concurrently to S3
      const uploadErrors: Array<{ file: string; error: string }> = [];
      const uploadResults: UploadResult[] = [];

      // Step 2: Upload files to S3 in concurrent batches
      for (let i = 0; i < files.length; i += UPLOAD_CONCURRENCY) {
        if (onCancel?.()) {
          throw new Error("Upload cancelled by user");
        }

        const batch = files.slice(i, i + UPLOAD_CONCURRENCY);

        // Process batch with individual error handling
        const batchResults = await Promise.allSettled(
          batch.map(async (file, batchIndex) => {
            const globalIndex = i + batchIndex;

            // Check for cancellation before each file
            if (onCancel?.()) {
              throw new Error("Upload cancelled");
            }

            // Update overall progress
            config.onUploadProgress?.(globalIndex + 1, files.length, file.name);

            // Update per-image progress to uploading
            config.updateProgress((prev) => {
              return prev.map((p) =>
                p.fileName === file.name
                  ? { ...p, status: "uploading" as const, uploadProgress: 0 }
                  : p
              );
            });

            try {
              const presignedData = presignedUrlMap.get(file.name);
              if (!presignedData) {
                throw new Error("Presigned URL not found for file");
              }

              // Upload file to S3 with progress tracking
              const uploadController = new AbortController();
              const uploadTimeout = setTimeout(() => uploadController.abort(), 300000); // 5 min timeout

              // Track if upload succeeded (for optimistic update safety)
              let uploadSucceeded = false;

              try {
                // Track upload progress using XMLHttpRequest for progress events
                const uploadPromise = new Promise<void>((resolve, reject) => {
                  const xhr = new XMLHttpRequest();

                  xhr.upload.addEventListener("progress", (e) => {
                    if (e.lengthComputable) {
                      const percentComplete = Math.min((e.loaded / e.total) * 100, 100);
                      config.updateProgress((prev) => {
                        return prev.map((p) =>
                          p.fileName === file.name ? { ...p, uploadProgress: percentComplete } : p
                        );
                      });
                    }
                  });

                  xhr.addEventListener("load", () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                      uploadSucceeded = true; // Mark as succeeded before resolving
                      // Ensure progress is 100% on completion
                      config.updateProgress((prev) => {
                        return prev.map((p) =>
                          p.fileName === file.name ? { ...p, uploadProgress: 100 } : p
                        );
                      });
                      resolve();
                    } else {
                      reject(
                        new Error(`Failed to upload ${file.name}: ${xhr.status} ${xhr.statusText}`)
                      );
                    }
                  });

                  xhr.addEventListener("error", () => {
                    reject(new Error(`Network error uploading ${file.name}`));
                  });

                  xhr.addEventListener("abort", () => {
                    reject(new Error(`Upload cancelled for ${file.name}`));
                  });

                  xhr.open("PUT", presignedData.url);
                  xhr.setRequestHeader("Content-Type", file.type || "image/jpeg");
                  xhr.send(file);
                });

                await uploadPromise;
                clearTimeout(uploadTimeout);

                // Dispatch optimistic update event only if upload actually succeeded
                // This updates the sidebar instantly without waiting for API
                // Safety: Only dispatch if uploadSucceeded is true (upload was successful)
                if (uploadSucceeded && typeof window !== "undefined" && config.galleryId) {
                  const beforeOptimistic = useGalleryStore.getState().currentGallery;
                  const beforeOriginals = beforeOptimistic?.originalsBytesUsed;
                  const beforeFinals = beforeOptimistic?.finalsBytesUsed;

                  // Apply optimistic update using utility function
                  // For uploads, we don't need to update local optimistic state (polling will handle that)
                  applyOptimisticUpdate({
                    type: config.type,
                    galleryId: config.galleryId,
                    sizeDelta: file.size, // Positive for upload
                    isUpload: true, // This is an upload
                    setOptimisticFinalsBytes: () => {
                      // No-op for uploads - polling will update state
                    },
                  });
                }

                // Update per-image progress to processing
                config.updateProgress((prev) => {
                  return prev.map((p) =>
                    p.fileName === file.name
                      ? { ...p, status: "processing" as const, uploadProgress: 100 }
                      : p
                  );
                });

                const result: UploadResult = {
                  success: true,
                  file: file.name,
                  key: presignedData.apiKey,
                };
                config.onSuccess?.(file.name, presignedData.apiKey);
                return result;
              } catch (uploadError) {
                clearTimeout(uploadTimeout);
                throw uploadError;
              }
            } catch (error) {
              const errorMessage = (error as Error).message || "Unknown error";
              uploadErrors.push({ file: file.name, error: errorMessage });

              // Update per-image progress to error
              config.updateProgress((prev) => {
                return prev.map((p) =>
                  p.fileName === file.name
                    ? { ...p, status: "error" as const, error: errorMessage }
                    : p
                );
              });

              config.onError?.(file.name, errorMessage);

              return {
                success: false,
                file: file.name,
                error: errorMessage,
              };
            }
          })
        );

        // Collect results
        batchResults.forEach((result, index) => {
          if (result.status === "fulfilled") {
            uploadResults.push(result.value);
          } else {
            const file = batch[index];
            if (!file) {
              return;
            }
            let errorMessage = "Unknown error";
            if (result.reason) {
              if (result.reason instanceof Error) {
                errorMessage = result.reason.message;
              } else if (typeof result.reason === "object" && "message" in result.reason) {
                const message = result.reason.message;
                if (typeof message === "string") {
                  errorMessage = message;
                }
              } else if (typeof result.reason === "string") {
                errorMessage = result.reason;
              }
            }
            uploadResults.push({
              success: false,
              file: file.name,
              error: errorMessage,
            });
          }
        });

        // Small delay between batches to avoid overwhelming the server
        if (i + UPLOAD_CONCURRENCY < files.length && !onCancel?.()) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      return uploadResults;
    },
    [config]
  );

  return { uploadFiles };
}
