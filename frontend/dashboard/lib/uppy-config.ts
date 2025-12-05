import AwsS3 from "@uppy/aws-s3";
import Uppy from "@uppy/core";
import type { UppyFile } from "@uppy/core";
import ThumbnailGenerator from "@uppy/thumbnail-generator";

import api from "./api-service";
import { ThumbnailUploadPlugin } from "./uppy-thumbnail-upload-plugin";

// Type alias for UppyFile with required type parameters
// Using 'any' to be compatible with Uppy's internal type system
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UppyFileType = UppyFile<any, any>;

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  return `${galleryId}-${type}-${orderId ?? ""}`;
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
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
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
                  bigThumbUrl: urlData.bigThumbUrl,
                  thumbnailUrl: urlData.thumbnailUrl,
                },
              },
            });
          } else {
            req.reject(new Error("No presigned URL returned from server"));
          }
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to get presigned URLs";
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
                  bigThumbUrl: urlData.bigThumbUrl,
                  thumbnailUrl: urlData.thumbnailUrl,
                },
              },
            });
          } else {
            req.reject(new Error("No presigned URL returned from server"));
          }
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to get presigned URLs";
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
): Promise<{
  method: string;
  url: string;
  headers: Record<string, string>; // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: any;
}> {
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
  onBeforeUpload?: (files: UppyFileType[]) => Promise<boolean>;
  onUploadProgress?: (progress: {
    current: number;
    total: number;
    bytesUploaded?: number;
    bytesTotal?: number;
  }) => void;
  onComplete?: (result: { successful: UppyFileType[]; failed: UppyFileType[] }) => void;
  onError?: (error: Error, file?: UppyFileType) => void;
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
  uppy.on("file-removed", (_file: UppyFileType, _reason?: string) => {
    // File removed event handler
  });

  // Listen for restriction failures
  uppy.on("restriction-failed", (_file: UppyFileType | undefined, _error: Error) => {
    // Restriction failed event handler
  });

  // Add Thumbnail Generator for client-side previews
  // Generate thumbnail (300px) for UI display
  // Note: ThumbnailGenerator uses quality 80 (hardcoded) for WebP
  // For lossless WebP, we would need quality 1.0, but ThumbnailGenerator doesn't expose this option
  // Quality 80 WebP at 300x300 is still very good for thumbnails and saves bandwidth
  uppy.use(ThumbnailGenerator, {
    thumbnailWidth: 300, // Thumbnail width - 300px for professional quality display
    thumbnailHeight: 300, // Thumbnail height - 300px for professional quality display
    thumbnailType: "image/webp", // Generate WebP thumbnails (quality 80, hardcoded in ThumbnailGenerator)
    waitForThumbnailsBeforeUpload: false, // Don't wait, upload can proceed
  });

  // Add custom thumbnail upload plugin to upload generated thumbnails to S3
  // @ts-expect-error - ThumbnailUploadPlugin type compatibility issue with Uppy's strict typing
  uppy.use(ThumbnailUploadPlugin);

  // Add AWS S3 plugin with custom getUploadParameters and multipart support
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  uppy.use(AwsS3, {
    id: "aws-s3",
    limit: 5, // Upload 5 files concurrently (adjust based on performance)
    shouldUseMultipart: (file: UppyFileType) => {
      // Use multipart only for files larger than 100 MiB (Uppy's recommended default)
      // For smaller files, simple PUT uploads are more efficient (1 API call vs 4+ for multipart)
      // This reduces API Gateway load and prevents 503 errors from request overflow
      // See: https://uppy.io/docs/aws-s3/#shouldusemultipartfile
      return (file.size ?? 0) > MULTIPART_THRESHOLD;
    },
    getUploadParameters: async (file: UppyFileType) => {
      // Only used for simple PUT uploads (small files)
      // Multipart uploads use createMultipartUpload instead
      const galleryId = config.galleryId;
      const type = config.type;
      const fileName = file.name;
      const fileSize = file.size ?? 0;
      const contentType = file.type ?? "image/jpeg";

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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        file.meta = {
          ...file.meta,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          s3Key: result.metadata.s3Key,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          s3KeyShort: result.metadata.s3KeyShort,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
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
    createMultipartUpload: async (file: UppyFileType) => {
      // Called by AwsS3 plugin when shouldUseMultipart returns true
      // For multipart, we also batch requests to reduce API calls
      const galleryId = config.galleryId;
      const type = config.type;
      const fileName = file.name;
      const fileSize = file.size ?? 0;
      const contentType = file.type ?? "image/jpeg";

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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          resolve: (result: any) => {
            // Store multipart metadata in file
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            file.meta = {
              ...file.meta,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
              s3Key: result.objectKey,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
              s3KeyShort: result.key,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
              multipartParts: result.parts,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
              multipartTotalParts: result.totalParts,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
              multipartPartSize: result.partSize,
            };
            resolve({
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
              uploadId: result.uploadId,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
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
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    uploadId: upload.uploadId,
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    objectKey: upload.objectKey,
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    key: upload.key,
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    parts: upload.parts,
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    totalParts: upload.totalParts,
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    partSize: upload.partSize,
                  });
                } else {
                  req.reject(
                    new Error(`No multipart upload returned from server for file ${index}`)
                  );
                }
              });
            } catch (_error) {
              const errorMessage =
                _error instanceof Error ? _error.message : "Failed to create multipart upload";
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listParts: async (_file: UppyFileType, opts: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const { uploadId, key } = opts;
      // List existing parts for resume
      // If this fails (e.g., 503 errors), return empty array to allow upload to continue
      // This prevents resume failures from blocking uploads
      const galleryId = config.galleryId;
      const maxRetries = 2;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const response = await api.uploads.listMultipartParts(galleryId, {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            uploadId: uploadId as string,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            key: key as string,
          });

          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          const parts = response.parts.map((part) => ({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            PartNumber: part.partNumber,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            ETag: part.etag,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            Size: part.size,
          }));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
          return parts as any;
        } catch (_error) {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
      return [] as any;
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    prepareUploadPart: async (file: UppyFileType, part: { number: number; chunk: Blob }) => {
      // Get presigned URL for this specific part
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const parts = file.meta?.multipartParts as
        | Array<{ partNumber: number; url: string }>
        | undefined;
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
      _file: UppyFileType,
      {
        uploadId,
        key,
        parts,
      }: { uploadId: string; key: string; parts: Array<{ number: number; etag: string }> }
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
        location: response.location ?? "",
        etag: response.etag ?? "",
      } as { location: string; etag: string };
    },
    abortMultipartUpload: async (
      _file: UppyFileType,
      { uploadId, key }: { uploadId: string; key: string }
    ) => {
      // Abort the multipart upload
      const galleryId = config.galleryId;
      await api.uploads.abortMultipartUpload(galleryId, {
        uploadId,
        key,
      });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  // Add preprocessor for upload validation (runs before upload starts)
  // Preprocessors execute before upload begins, perfect for validation
  if (config.onBeforeUpload) {
    uppy.addPreProcessor(async (fileIds) => {
      const files = fileIds
        .map((id) => uppy.getFile(id))
        .filter((f): f is UppyFileType => f !== null);

      try {
        const shouldProceed = await config.onBeforeUpload?.(files);
        if (!shouldProceed) {
          // Cancel all uploads if validation fails
          // This prevents upload from starting
          uppy.cancelAll();
          // Don't throw - just cancel silently, validation callback handles UI
          return;
        }
      } catch (_error) {
        // If validation throws an error, cancel upload
        uppy.cancelAll();
        throw _error;
      }
    });
  }

  if (config.onUploadProgress) {
    // Use Uppy's upload-progress event - fires for each file during upload
    // Calculate aggregate progress from all files (Uppy provides per-file progress)
    uppy.on("upload-progress", (file, progress) => {
      if (!file || !progress) {
        return;
      }

      // Get all files from Uppy - this is the source of truth
      const allFiles = Object.values(uppy.getFiles());

      // Filter to only files that have started uploading (Uppy manages this state)
      const uploadingFiles = allFiles.filter((f) => f.progress?.uploadStarted);
      const total = uploadingFiles.length;

      // Count completed files (Uppy tracks uploadComplete in file.progress)
      const current = uploadingFiles.filter((f) => f.progress?.uploadComplete === true).length;

      // Calculate total bytes from Uppy's file state
      // Uppy tracks bytesUploaded and bytesTotal per file in file.progress
      let bytesUploaded = 0;
      let bytesTotal = 0;
      uploadingFiles.forEach((f) => {
        if (f.progress) {
          const uploaded = f.progress.bytesUploaded;
          if (typeof uploaded === "number") {
            bytesUploaded += uploaded;
          }
          bytesTotal += f.size ?? 0; // file.size is the original file size
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
        successful: result.successful ?? [],
        failed: result.failed ?? [],
      });
    });
  }

  if (config.onError) {
    uppy.on("upload-error", (file, error) => {
      config.onError?.(error, file);
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
  return uppy as any;
}
