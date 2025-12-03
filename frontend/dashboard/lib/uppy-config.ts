import AwsS3 from "@uppy/aws-s3";
import Uppy from "@uppy/core";
import type { UppyFile } from "@uppy/core";
import ThumbnailGenerator from "@uppy/thumbnail-generator";

import api from "./api-service";
import { ThumbnailUploadPlugin } from "./uppy-thumbnail-upload-plugin";

export type UploadType = "originals" | "finals";

// Uppy's recommended default: use multipart only for files larger than 100 MiB
// This reduces API Gateway load for smaller files, which don't benefit from multipart overhead
// See: https://uppy.io/docs/aws-s3/#shouldusemultipartfile
const MULTIPART_THRESHOLD = 100 * 2 ** 20; // 100 MiB - Uppy's recommended default
const BATCH_WINDOW_MS = 100; // Wait up to 100ms to collect files for batching
const MAX_BATCH_SIZE = 50; // Maximum files per batch (API limit)

// Batching queue for upload parameters
interface PendingFileRequest {
  fileId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

interface BatchQueue {
  pending: Map<string, PendingFileRequest>;
  timeout: NodeJS.Timeout | null;
  galleryId: string;
  orderId?: string;
  type: UploadType;
}

// Map of galleryId+type to batch queue
const batchQueues = new Map<string, BatchQueue>();

function getQueueKey(galleryId: string, type: UploadType, orderId?: string): string {
  return `${galleryId}-${type}-${orderId || ""}`;
}

function processBatch(queue: BatchQueue): void {
  if (queue.pending.size === 0) {
    return;
  }

  const pendingArray = Array.from(queue.pending.values());
  queue.pending.clear();
  queue.timeout = null;

  // Group by type (finals vs originals) since they use different endpoints
  const finalsFiles: PendingFileRequest[] = [];
  const originalsFiles: PendingFileRequest[] = [];

  pendingArray.forEach((req) => {
    if (queue.type === "finals") {
      finalsFiles.push(req);
    } else {
      originalsFiles.push(req);
    }
  });

  // Process finals batch
  if (finalsFiles.length > 0 && queue.orderId) {
    void (async () => {
      try {
        const response = await api.uploads.getFinalImagePresignedUrlsBatch(
          queue.galleryId,
          queue.orderId!,
          {
            files: finalsFiles.map((req) => ({
              key: req.fileName,
              contentType: req.contentType,
              includeThumbnails: true,
            })),
          }
        );

        // Map responses back to files
        finalsFiles.forEach((req, index) => {
          const urlData = response.urls[index];
          if (urlData) {
            req.resolve({
              method: "PUT",
              url: urlData.url,
              headers: {
                "Content-Type": req.contentType,
              },
              metadata: {
                s3Key: urlData.objectKey,
                s3KeyShort: urlData.key,
                presignedData: {
                  previewUrl: urlData.previewUrl,
                  thumbnailUrl: urlData.thumbnailUrl,
                },
              },
            });
          } else {
            req.reject(new Error("No presigned URL returned from server"));
          }
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to get presigned URLs";
        finalsFiles.forEach((req) => {
          req.reject(new Error(errorMessage));
        });
      }
    })();
  }

  // Process originals batch
  if (originalsFiles.length > 0) {
    void (async () => {
      try {
        const response = await api.uploads.getPresignedUrlsBatch({
          galleryId: queue.galleryId,
          files: originalsFiles.map((req) => ({
            key: `originals/${req.fileName}`,
            contentType: req.contentType,
            fileSize: req.fileSize,
            includeThumbnails: true,
          })),
        });

        // Map responses back to files
        originalsFiles.forEach((req, index) => {
          const urlData = response.urls[index];
          if (urlData) {
            req.resolve({
              method: "PUT",
              url: urlData.url,
              headers: {
                "Content-Type": req.contentType,
              },
              metadata: {
                s3Key: urlData.objectKey,
                s3KeyShort: urlData.key,
                presignedData: {
                  previewUrl: urlData.previewUrl,
                  thumbnailUrl: urlData.thumbnailUrl,
                },
              },
            });
          } else {
            req.reject(new Error("No presigned URL returned from server"));
          }
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to get presigned URLs";
        originalsFiles.forEach((req) => {
          req.reject(new Error(errorMessage));
        });
      }
    })();
  }
}

function queueFileRequest(
  galleryId: string,
  type: UploadType,
  orderId: string | undefined,
  fileId: string,
  fileName: string,
  fileSize: number,
  contentType: string
): Promise<{ method: string; url: string; headers: Record<string, string>; metadata: any }> {
  return new Promise((resolve, reject) => {
    const queueKey = getQueueKey(galleryId, type, orderId);
    let queue = batchQueues.get(queueKey);

    if (!queue) {
      queue = {
        pending: new Map(),
        timeout: null,
        galleryId,
        orderId,
        type,
      };
      batchQueues.set(queueKey, queue);
    }

    // Add file to queue
    queue.pending.set(fileId, {
      fileId,
      fileName,
      fileSize,
      contentType,
      resolve,
      reject,
    });

    // If batch is full, process immediately
    if (queue.pending.size >= MAX_BATCH_SIZE) {
      if (queue.timeout) {
        clearTimeout(queue.timeout);
        queue.timeout = null;
      }
      processBatch(queue);
      return;
    }

    // Otherwise, set/update timeout
    if (queue.timeout) {
      clearTimeout(queue.timeout);
    }
    queue.timeout = setTimeout(() => {
      if (queue) {
        processBatch(queue);
      }
    }, BATCH_WINDOW_MS);
  });
}

export interface UppyConfigOptions {
  galleryId: string;
  orderId?: string; // Required for 'finals' type
  type: UploadType;
  onBeforeUpload?: (files: UppyFile[]) => Promise<boolean>;
  onUploadProgress?: (progress: { current: number; total: number; bytesUploaded?: number; bytesTotal?: number }) => void;
  onComplete?: (result: { successful: UppyFile[]; failed: UppyFile[] }) => void;
  onError?: (error: Error, file?: UppyFile) => void;
}

/**
 * Create and configure an Uppy instance for gallery uploads
 */
export function createUppyInstance(config: UppyConfigOptions): Uppy {
  const uppy = new Uppy({
    id: `uppy-${config.galleryId}-${config.type}`,
    autoProceed: false, // Wait for user to click upload
    allowMultipleUploadBatches: true, // Allow multiple upload sessions
    restrictions: {
      // Removed maxFileSize and maxNumberOfFiles for testing Uppy thumbnail generation
      // Only keeping image type restriction
      allowedFileTypes: ["image/*"], // Only images
    },
    meta: {
      galleryId: config.galleryId,
      orderId: config.orderId,
      type: config.type,
      uploadStartedAt: Date.now().toString(),
    },
  });

  // Listen for file removal events
  uppy.on("file-removed", (_file: UppyFile, _reason?: string) => {
    // File removed event handler
  });
  
  // Listen for restriction failures
  uppy.on("restriction-failed", (_file: UppyFile, _error: Error) => {
    // Restriction failed event handler
  });

  // Add Thumbnail Generator for client-side previews
  // Generate thumbnail (200px) for UI display
  uppy.use(ThumbnailGenerator, {
    thumbnailWidth: 300, // Thumbnail width - 300px for professional quality display
    thumbnailHeight: 300, // Thumbnail height - 300px for professional quality display
    thumbnailType: "image/webp", // Generate WebP thumbnails
    waitForThumbnailsBeforeUpload: false, // Don't wait, upload can proceed
  });

  // Add custom thumbnail upload plugin to upload generated thumbnails to S3
  uppy.use(ThumbnailUploadPlugin);

  // Add AWS S3 plugin with custom getUploadParameters and multipart support
  uppy.use(AwsS3, {
    id: "aws-s3",
    limit: 5, // Upload 5 files concurrently (adjust based on performance)
    shouldUseMultipart: (file: UppyFile) => {
      // Use multipart only for files larger than 100 MiB (Uppy's recommended default)
      // For smaller files, simple PUT uploads are more efficient (1 API call vs 4+ for multipart)
      // This reduces API Gateway load and prevents 503 errors from request overflow
      // See: https://uppy.io/docs/aws-s3/#shouldusemultipartfile
      return (file.size || 0) > MULTIPART_THRESHOLD;
    },
    getUploadParameters: async (file: UppyFile) => {
      // Only used for simple PUT uploads (small files)
      // Multipart uploads use createMultipartUpload instead
      const galleryId = config.galleryId;
      const type = config.type;
      const fileName = file.name;
      const fileSize = file.size || 0;
      const contentType = file.type || "image/jpeg";

      if (type === "finals" && !config.orderId) {
        throw new Error("Order ID is required for finals upload");
      }

      try {
        // Use batching mechanism to collect multiple file requests
        const result = await queueFileRequest(
          galleryId,
          type,
          config.orderId,
          file.id,
          fileName,
          fileSize,
          contentType
        );

        // Store the S3 key and presigned URLs in file metadata for later use
        file.meta = {
          ...file.meta,
          s3Key: result.metadata.s3Key,
          s3KeyShort: result.metadata.s3KeyShort,
          presignedData: result.metadata.presignedData,
        };

        return {
          method: result.method,
          url: result.url,
          headers: result.headers,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to get presigned URL";
        throw new Error(errorMessage);
      }
    },
    createMultipartUpload: async (file: UppyFile) => {
      // Called by AwsS3 plugin when shouldUseMultipart returns true
      // For multipart, we also batch requests to reduce API calls
      const galleryId = config.galleryId;
      const type = config.type;
      const fileName = file.name;
      const fileSize = file.size || 0;
      const contentType = file.type || "image/jpeg";

      if (type === "finals" && !config.orderId) {
        throw new Error("Order ID is required for finals upload");
      }

      // For multipart, we batch similar to regular uploads
      // Create a promise-based batching system for multipart
      return new Promise<{ uploadId: string; key: string }>((resolve, reject) => {
        const queueKey = `multipart-${getQueueKey(galleryId, type, config.orderId)}`;
        let multipartQueue = batchQueues.get(queueKey);

        if (!multipartQueue) {
          multipartQueue = {
            pending: new Map(),
            timeout: null,
            galleryId,
            orderId: config.orderId,
            type,
          };
          batchQueues.set(queueKey, multipartQueue);
        }

        const fileRequest: PendingFileRequest = {
          fileId: file.id,
          fileName,
          fileSize,
          contentType,
          resolve: (result: any) => {
            // Store multipart metadata in file
            file.meta = {
              ...file.meta,
              s3Key: result.objectKey,
              s3KeyShort: result.key,
              multipartParts: result.parts,
              multipartTotalParts: result.totalParts,
              multipartPartSize: result.partSize,
            };
            resolve({
              uploadId: result.uploadId,
              key: result.objectKey,
            });
          },
          reject,
        };

        multipartQueue.pending.set(file.id, fileRequest);

        // Process batch if full or after timeout
        const processMultipartBatch = () => {
          const currentQueue = batchQueues.get(queueKey);
          if (!currentQueue || currentQueue.pending.size === 0) {
            return;
          }

          const pendingArray = Array.from(currentQueue.pending.values());
          currentQueue.pending.clear();
          currentQueue.timeout = null;

          void (async () => {
            try {
              const files = pendingArray.map((req) => {
                const key = type === "finals" ? req.fileName : `originals/${req.fileName}`;
                return {
                  key,
                  contentType: req.contentType,
                  fileSize: req.fileSize,
                };
              });

              const multipartResponse = await api.uploads.createMultipartUpload(galleryId, {
                orderId: config.orderId,
                files,
              });

              // Map responses back to files
              pendingArray.forEach((req, index) => {
                const upload = multipartResponse.uploads[index];
                if (upload) {
                  req.resolve({
                    uploadId: upload.uploadId,
                    objectKey: upload.objectKey,
                    key: upload.key,
                    parts: upload.parts,
                    totalParts: upload.totalParts,
                    partSize: upload.partSize,
                  });
                } else {
                  req.reject(new Error(`No multipart upload returned from server for file ${index}`));
                }
              });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : "Failed to create multipart upload";
              pendingArray.forEach((req) => {
                req.reject(new Error(errorMessage));
              });
            }
          })();
        };

        if (multipartQueue.pending.size >= MAX_BATCH_SIZE) {
          if (multipartQueue.timeout) {
            clearTimeout(multipartQueue.timeout);
            multipartQueue.timeout = null;
          }
          processMultipartBatch();
        } else {
          if (multipartQueue.timeout) {
            clearTimeout(multipartQueue.timeout);
          }
          multipartQueue.timeout = setTimeout(() => {
            processMultipartBatch();
          }, BATCH_WINDOW_MS);
        }
      });
    },
    listParts: async (file: UppyFile, { uploadId, key }: { uploadId: string; key: string }) => {
      // List existing parts for resume
      // If this fails (e.g., 503 errors), return empty array to allow upload to continue
      // This prevents resume failures from blocking uploads
      const galleryId = config.galleryId;
      const maxRetries = 2;
      let lastError: Error | null = null;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const response = await api.uploads.listMultipartParts(galleryId, {
            uploadId,
            key,
          });

          return response.parts.map((part) => ({
            PartNumber: part.partNumber,
            ETag: part.etag,
            Size: part.size,
          }));
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          
          // If it's a 503 or 500, retry with exponential backoff
          if (attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 100; // 100ms, 200ms
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }
      }
      
      // All retries failed - return empty array
      // This allows upload to continue from scratch rather than blocking resume
      // Note: This means Uppy will re-upload parts that were already uploaded,
      // but this is better than blocking the entire upload
      
      // Return empty array - Uppy will treat this as a fresh upload
      // This ensures resume can proceed even when listParts fails
      return [];
    },
    prepareUploadPart: async (file: UppyFile, part: { number: number; chunk: Blob }) => {
      // Get presigned URL for this specific part
      const parts = file.meta?.multipartParts as Array<{ partNumber: number; url: string }> | undefined;
      if (!parts) {
        throw new Error("Multipart parts not available");
      }

      const partData = parts.find((p) => p.partNumber === part.number);
      if (!partData) {
        throw new Error(`Part ${part.number} not found`);
      }

      return {
        url: partData.url,
      };
    },
    completeMultipartUpload: async (
      file: UppyFile,
      { uploadId, key, parts }: { uploadId: string; key: string; parts: Array<{ number: number; etag: string }> }
    ) => {
      // Complete the multipart upload
      const galleryId = config.galleryId;
      const response = await api.uploads.completeMultipartUpload(galleryId, {
        uploadId,
        key,
        parts: parts.map((p) => ({
          partNumber: p.number,
          etag: p.etag,
        })),
      });

      return {
        location: response.location || "",
        etag: response.etag || "",
      };
    },
    abortMultipartUpload: async (file: UppyFile, { uploadId, key }: { uploadId: string; key: string }) => {
      // Abort the multipart upload
      const galleryId = config.galleryId;
      await api.uploads.abortMultipartUpload(galleryId, {
        uploadId,
        key,
      });
    },
  });

  // Add preprocessor for upload validation (runs before upload starts)
  // Preprocessors execute before upload begins, perfect for validation
  if (config.onBeforeUpload) {
    uppy.addPreProcessor(async (fileIds) => {
      const files = fileIds.map((id) => uppy.getFile(id)).filter((f): f is UppyFile => f !== null);
      
      try {
        const shouldProceed = await config.onBeforeUpload?.(files);
        if (!shouldProceed) {
          // Cancel all uploads if validation fails
          // This prevents upload from starting
          uppy.cancelAll();
          // Don't throw - just cancel silently, validation callback handles UI
          return;
        }
      } catch (error) {
        // If validation throws an error, cancel upload
        uppy.cancelAll();
        throw error;
      }
    });
  }

  if (config.onUploadProgress) {
    // Use Uppy's upload-progress event - fires for each file during upload
    // Calculate aggregate progress from all files (Uppy provides per-file progress)
    uppy.on("upload-progress", (file, progress) => {
      if (!file || !progress) {return;}
      
      // Get all files from Uppy - this is the source of truth
      const allFiles = Object.values(uppy.getFiles());
      
      // Filter to only files that have started uploading (Uppy manages this state)
      const uploadingFiles = allFiles.filter((f) => f.progress?.uploadStarted);
      const total = uploadingFiles.length;
      
      // Count completed files (Uppy tracks uploadComplete in file.progress)
      const current = uploadingFiles.filter(
        (f) => f.progress?.uploadComplete === true
      ).length;

      // Calculate total bytes from Uppy's file state
      // Uppy tracks bytesUploaded and bytesTotal per file in file.progress
      let bytesUploaded = 0;
      let bytesTotal = 0;
      uploadingFiles.forEach((f) => {
        if (f.progress) {
          bytesUploaded += f.progress.bytesUploaded || 0;
          bytesTotal += f.size || 0; // file.size is the original file size
        }
      });

      // Call progress callback with aggregate values
      config.onUploadProgress?.({ 
        current, 
        total,
        bytesUploaded,
        bytesTotal,
      });
    });
  }

  if (config.onComplete) {
    uppy.on("complete", (result) => {
      config.onComplete?.({
        successful: result.successful || [],
        failed: result.failed || [],
      });
    });
  }

  if (config.onError) {
    uppy.on("upload-error", (file, error) => {
      config.onError?.(error, file);
    });
  }

  return uppy;
}

