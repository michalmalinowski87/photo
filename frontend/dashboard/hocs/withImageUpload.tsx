import React, { ComponentType, useCallback, useRef } from "react";
import { useUploadStore } from "../store/uploadSlice";
import { apiFetchWithAuth, formatApiError } from "../lib/api";

interface UploadConfig {
  apiUrl: string;
  galleryId: string;
  orderId?: string;
  type: "original" | "final" | "cover";
  endpoint: string; // Presigned URL endpoint
  validation?: {
    maxFileSize?: number; // in bytes
    allowedTypes?: string[]; // MIME types
    maxFiles?: number;
  };
  storageLimitBytes?: number;
  currentBytesUsed?: number;
  onSuccess?: (files: File[]) => void;
  onError?: (error: string) => void;
  onProgress?: (current: number, total: number) => void;
}

interface WithImageUploadProps {
  uploadImages?: (files: File[], config: UploadConfig) => Promise<void>;
  uploadProgress?: {
    current: number;
    total: number;
    currentFileName: string;
    errors: string[];
    successes: number;
  };
  isUploading?: boolean;
}

/**
 * Retry helper with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 1000
): Promise<T> {
  let lastError: Error | null = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError || new Error("Retry failed");
}

/**
 * HOC that provides unified image upload functionality
 * Handles presigned URL flow, retry logic, progress tracking, and validation
 */
export function withImageUpload<P extends object>(
  WrappedComponent: ComponentType<P & WithImageUploadProps>
) {
  return function ImageUploadComponent(props: P) {
    const { addUpload, updateUpload, removeUpload } = useUploadStore();
    const uploadCancelRef = useRef(false);

    const uploadImages = useCallback(
      async (files: File[], config: UploadConfig) => {
        const {
          apiUrl: _apiUrl,
          galleryId,
          orderId,
          type,
          endpoint,
          validation = {},
          storageLimitBytes,
          currentBytesUsed = 0,
          onSuccess,
          onError,
          onProgress,
        } = config;

        if (!files || files.length === 0) {
          onError?.("Brak plików do przesłania");
          return;
        }

        // Filter image files
        const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
        if (imageFiles.length === 0) {
          onError?.("Wybierz pliki graficzne");
          return;
        }

        // Validate file count
        if (validation.maxFiles && imageFiles.length > validation.maxFiles) {
          onError?.(`Maksymalna liczba plików: ${validation.maxFiles}`);
          return;
        }

        // Check storage limits
        if (storageLimitBytes) {
          const totalFilesSize = imageFiles.reduce((sum, file) => sum + file.size, 0);
          const wouldExceedLimit = currentBytesUsed + totalFilesSize > storageLimitBytes;

          if (wouldExceedLimit) {
            const usedMB = (currentBytesUsed / (1024 * 1024)).toFixed(2);
            const limitMB = (storageLimitBytes / (1024 * 1024)).toFixed(2);
            const filesMB = (totalFilesSize / (1024 * 1024)).toFixed(2);
            const availableMB = ((storageLimitBytes - currentBytesUsed) / (1024 * 1024)).toFixed(2);
            const excessMB = (
              (currentBytesUsed + totalFilesSize - storageLimitBytes) /
              (1024 * 1024)
            ).toFixed(2);

            const errorMessage =
              `Przekroczono limit miejsca!\n\n` +
              `Użyte: ${usedMB} MB / ${limitMB} MB\n` +
              `Rozmiar wybranych plików: ${filesMB} MB\n` +
              `Dostępne miejsce: ${availableMB} MB\n` +
              `Brakuje: ${excessMB} MB`;

            onError?.(errorMessage);
            return;
          }
        }

        // Validate file sizes
        if (validation.maxFileSize) {
          const oversizedFiles = imageFiles.filter((file) => file.size > validation.maxFileSize!);
          if (oversizedFiles.length > 0) {
            const maxMB = (validation.maxFileSize / (1024 * 1024)).toFixed(2);
            onError?.(`Niektóre pliki przekraczają maksymalny rozmiar ${maxMB} MB`);
            return;
          }
        }

        // Validate file types
        if (validation.allowedTypes && validation.allowedTypes.length > 0) {
          const invalidFiles = imageFiles.filter(
            (file) => !validation.allowedTypes!.includes(file.type)
          );
          if (invalidFiles.length > 0) {
            onError?.(`Nieprawidłowy typ pliku. Dozwolone: ${validation.allowedTypes.join(", ")}`);
            return;
          }
        }

        uploadCancelRef.current = false;

        // Initialize upload progress
        const uploadId = `${type}-${galleryId}-${orderId || "cover"}-${Date.now()}`;
        addUpload(uploadId, {
          type,
          galleryId,
          orderId,
          current: 0,
          total: imageFiles.length,
          currentFileName: "",
          errors: [],
          successes: 0,
          status: "uploading",
        });

        let uploadSuccesses = 0;
        const uploadErrors: string[] = [];

        try {
          // Upload files sequentially to avoid overwhelming the server
          for (let i = 0; i < imageFiles.length; i++) {
            if (uploadCancelRef.current) {
              updateUpload(uploadId, { status: "cancelled" });
              break;
            }

            const file = imageFiles[i];

            updateUpload(uploadId, {
              current: i,
              currentFileName: file.name,
            });

            onProgress?.(i, imageFiles.length);

            try {
              // Get presigned URL with retry logic
              const presignResponse = await retryWithBackoff(async () => {
                return await apiFetchWithAuth(endpoint, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    galleryId,
                    orderId,
                    key: file.name,
                    contentType: file.type || "image/jpeg",
                    fileSize: file.size,
                  }),
                });
              });

              // Upload file to S3 with timeout
              const uploadController = new AbortController();
              const uploadTimeout = setTimeout(() => uploadController.abort(), 300000); // 5 min timeout

              try {
                const uploadResponse = await fetch(presignResponse.data.url, {
                  method: "PUT",
                  body: file,
                  headers: {
                    "Content-Type": file.type || "image/jpeg",
                  },
                  signal: uploadController.signal,
                });

                clearTimeout(uploadTimeout);

                if (!uploadResponse.ok) {
                  throw new Error(
                    `Failed to upload ${file.name}: ${uploadResponse.status} ${uploadResponse.statusText}`
                  );
                }

                uploadSuccesses++;
              } catch (uploadError) {
                clearTimeout(uploadTimeout);
                throw uploadError;
              }
            } catch (error) {
              const errorMsg = formatApiError(error) || `Nie udało się przesłać ${file.name}`;
              uploadErrors.push(errorMsg);
            }
          }

          if (uploadCancelRef.current) {
            updateUpload(uploadId, { status: "cancelled" });
            return;
          }

          if (uploadErrors.length > 0 && uploadSuccesses === 0) {
            updateUpload(uploadId, {
              status: "error",
              errors: uploadErrors,
            });
            onError?.(uploadErrors.join("\n"));
          } else if (uploadErrors.length > 0) {
            updateUpload(uploadId, {
              status: "completed",
              successes: uploadSuccesses,
              errors: uploadErrors,
            });
            onSuccess?.(imageFiles);
            onError?.(
              `Przesłano ${uploadSuccesses} z ${imageFiles.length} plików. Błędy: ${uploadErrors.join(", ")}`
            );
          } else {
            updateUpload(uploadId, {
              status: "completed",
              successes: uploadSuccesses,
            });
            onSuccess?.(imageFiles);
          }

          // Auto-remove completed upload after 5 seconds
          setTimeout(() => {
            removeUpload(uploadId);
          }, 5000);
        } catch (error) {
          const errorMsg = formatApiError(error) || "Nie udało się przesłać plików";
          updateUpload(uploadId, {
            status: "error",
            errors: [errorMsg],
          });
          onError?.(errorMsg);
        }
      },
      [addUpload, updateUpload, removeUpload]
    );

    // Get current upload progress
    const uploads = useUploadStore((state) => state.uploads);
    const currentUpload = Object.values(uploads).find((upload) => upload.status === "uploading");

    return (
      <WrappedComponent
        {...(props as P)}
        uploadImages={uploadImages}
        uploadProgress={
          currentUpload
            ? {
                current: currentUpload.current,
                total: currentUpload.total,
                currentFileName: currentUpload.currentFileName,
                errors: currentUpload.errors,
                successes: currentUpload.successes,
              }
            : undefined
        }
        isUploading={!!currentUpload}
      />
    );
  };
}

/**
 * Hook version for direct use in components
 */
export function useImageUpload() {
  const { addUpload, updateUpload, removeUpload } = useUploadStore();
  const uploadCancelRef = useRef(false);

  const uploadImages = useCallback(
    async (files: File[], config: UploadConfig) => {
      // Same implementation as HOC version
      const {
        apiUrl: _apiUrl,
        galleryId,
        orderId,
        type,
        endpoint,
        validation = {},
        storageLimitBytes,
        currentBytesUsed = 0,
        onSuccess,
        onError,
        onProgress,
      } = config;

      if (!files || files.length === 0) {
        onError?.("Brak plików do przesłania");
        return;
      }

      const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
      if (imageFiles.length === 0) {
        onError?.("Wybierz pliki graficzne");
        return;
      }

      if (validation.maxFiles && imageFiles.length > validation.maxFiles) {
        onError?.(`Maksymalna liczba plików: ${validation.maxFiles}`);
        return;
      }

      if (storageLimitBytes) {
        const totalFilesSize = imageFiles.reduce((sum, file) => sum + file.size, 0);
        const wouldExceedLimit = currentBytesUsed + totalFilesSize > storageLimitBytes;

        if (wouldExceedLimit) {
          const usedMB = (currentBytesUsed / (1024 * 1024)).toFixed(2);
          const limitMB = (storageLimitBytes / (1024 * 1024)).toFixed(2);
          const filesMB = (totalFilesSize / (1024 * 1024)).toFixed(2);
          const availableMB = ((storageLimitBytes - currentBytesUsed) / (1024 * 1024)).toFixed(2);
          const excessMB = (
            (currentBytesUsed + totalFilesSize - storageLimitBytes) /
            (1024 * 1024)
          ).toFixed(2);

          const errorMessage =
            `Przekroczono limit miejsca!\n\n` +
            `Użyte: ${usedMB} MB / ${limitMB} MB\n` +
            `Rozmiar wybranych plików: ${filesMB} MB\n` +
            `Dostępne miejsce: ${availableMB} MB\n` +
            `Brakuje: ${excessMB} MB`;

          onError?.(errorMessage);
          return;
        }
      }

      if (validation.maxFileSize) {
        const oversizedFiles = imageFiles.filter((file) => file.size > validation.maxFileSize!);
        if (oversizedFiles.length > 0) {
          const maxMB = (validation.maxFileSize / (1024 * 1024)).toFixed(2);
          onError?.(`Niektóre pliki przekraczają maksymalny rozmiar ${maxMB} MB`);
          return;
        }
      }

      if (validation.allowedTypes && validation.allowedTypes.length > 0) {
        const invalidFiles = imageFiles.filter(
          (file) => !validation.allowedTypes!.includes(file.type)
        );
        if (invalidFiles.length > 0) {
          onError?.(`Nieprawidłowy typ pliku. Dozwolone: ${validation.allowedTypes.join(", ")}`);
          return;
        }
      }

      uploadCancelRef.current = false;

      const uploadId = `${type}-${galleryId}-${orderId || "cover"}-${Date.now()}`;
      addUpload(uploadId, {
        type,
        galleryId,
        orderId,
        current: 0,
        total: imageFiles.length,
        currentFileName: "",
        errors: [],
        successes: 0,
        status: "uploading",
      });

      let uploadSuccesses = 0;
      const uploadErrors: string[] = [];

      try {
        for (let i = 0; i < imageFiles.length; i++) {
          if (uploadCancelRef.current) {
            updateUpload(uploadId, { status: "cancelled" });
            break;
          }

          const file = imageFiles[i];

          updateUpload(uploadId, {
            current: i,
            currentFileName: file.name,
          });

          onProgress?.(i, imageFiles.length);

          try {
            const presignResponse = await retryWithBackoff(async () => {
              return await apiFetchWithAuth(endpoint, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  galleryId,
                  orderId,
                  key: file.name,
                  contentType: file.type || "image/jpeg",
                  fileSize: file.size,
                }),
              });
            });

            const uploadController = new AbortController();
            const uploadTimeout = setTimeout(() => uploadController.abort(), 300000);

            try {
              const uploadResponse = await fetch(presignResponse.data.url, {
                method: "PUT",
                body: file,
                headers: {
                  "Content-Type": file.type || "image/jpeg",
                },
                signal: uploadController.signal,
              });

              clearTimeout(uploadTimeout);

              if (!uploadResponse.ok) {
                throw new Error(
                  `Failed to upload ${file.name}: ${uploadResponse.status} ${uploadResponse.statusText}`
                );
              }

              uploadSuccesses++;
            } catch (uploadError) {
              clearTimeout(uploadTimeout);
              throw uploadError;
            }
          } catch (error) {
            const errorMsg = formatApiError(error) || `Nie udało się przesłać ${file.name}`;
            uploadErrors.push(errorMsg);
          }
        }

        if (uploadCancelRef.current) {
          updateUpload(uploadId, { status: "cancelled" });
          return;
        }

        if (uploadErrors.length > 0 && uploadSuccesses === 0) {
          updateUpload(uploadId, {
            status: "error",
            errors: uploadErrors,
          });
          onError?.(uploadErrors.join("\n"));
        } else if (uploadErrors.length > 0) {
          updateUpload(uploadId, {
            status: "completed",
            successes: uploadSuccesses,
            errors: uploadErrors,
          });
          onSuccess?.(imageFiles);
          onError?.(
            `Przesłano ${uploadSuccesses} z ${imageFiles.length} plików. Błędy: ${uploadErrors.join(", ")}`
          );
        } else {
          updateUpload(uploadId, {
            status: "completed",
            successes: uploadSuccesses,
          });
          onSuccess?.(imageFiles);
        }

        setTimeout(() => {
          removeUpload(uploadId);
        }, 5000);
      } catch (error) {
        const errorMsg = formatApiError(error) || "Nie udało się przesłać plików";
        updateUpload(uploadId, {
          status: "error",
          errors: [errorMsg],
        });
        onError?.(errorMsg);
      }
    },
    [addUpload, updateUpload, removeUpload]
  );

  const uploads = useUploadStore((state) => state.uploads);
  const currentUpload = Object.values(uploads).find((upload) => upload.status === "uploading");

  return {
    uploadImages,
    uploadProgress: currentUpload
      ? {
          current: currentUpload.current,
          total: currentUpload.total,
          currentFileName: currentUpload.currentFileName,
          errors: currentUpload.errors,
          successes: currentUpload.successes,
        }
      : undefined,
    isUploading: !!currentUpload,
  };
}
