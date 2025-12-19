import AwsS3 from "@uppy/aws-s3";
import Uppy from "@uppy/core";
import type { UppyFile } from "@uppy/core";
import ThumbnailGenerator from "@uppy/thumbnail-generator";

import api from "./api-service";
import { ThumbnailUploadPlugin } from "./uppy-thumbnail-upload-plugin";

export type UploadType = "originals" | "finals";

// Define the Meta type for Uppy files
export interface UppyMeta {
  galleryId: string;
  orderId?: string;
  type: UploadType;
  uploadStartedAt: string;
  s3Key?: string;
  s3KeyShort?: string;
  presignedData?: {
    previewUrl?: string;
    bigThumbUrl?: string;
    thumbnailUrl?: string;
  };
  multipartUploadId?: string;
  multipartParts?: Array<{ partNumber: number; url: string }>;
  multipartTotalParts?: number;
  multipartPartSize?: number;
  thumbnailPreview?: string;
  thumbnailBlob?: Blob;
  [key: string]: unknown; // Index signature to satisfy Uppy's Meta constraint
}

// Type alias for UppyFile with proper generics
export type TypedUppyFile = UppyFile<UppyMeta, Record<string, never>>;

// Uppy's recommended default: use multipart only for files larger than 100 MiB
// This reduces API Gateway load for smaller files, which don't benefit from multipart overhead
// See: https://uppy.io/docs/aws-s3/#shouldusemultipartfile
const MULTIPART_THRESHOLD = 100 * 2 ** 20; // 100 MiB - Uppy's recommended default
const BATCH_WINDOW_MS = 500; // Wait up to 500ms to collect files for batching (increased to reduce request frequency and prevent API Gateway throttling)
const MAX_BATCH_SIZE = 50; // Maximum files per batch (API limit)
const MAX_CONCURRENT_BATCHES = 2; // Maximum concurrent batch requests to prevent API Gateway throttling

// Batching queue for upload parameters
interface PendingFileRequest {
  fileId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  resolve: (value: {
    method: string;
    url: string;
    headers: Record<string, string>;
    metadata: {
      s3Key: string;
      s3KeyShort: string;
      presignedData?: {
        previewUrl?: string;
        bigThumbUrl?: string;
        thumbnailUrl?: string;
      };
    };
  }) => void;
  reject: (error: Error) => void;
}

interface MultipartFileRequest {
  fileId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  resolve: (result: {
    uploadId: string;
    objectKey: string;
    key: string;
    parts: Array<{ partNumber: number; url: string }>;
    totalParts: number;
    partSize: number;
  }) => void;
  reject: (error: Error) => void;
}

interface BatchQueue {
  pending: Map<string, PendingFileRequest>;
  timeout: NodeJS.Timeout | null;
  galleryId: string;
  orderId?: string;
  type: UploadType;
  processingCount: number; // Track how many batch requests are currently in flight
}

interface MultipartBatchQueue {
  pending: Map<string, MultipartFileRequest>;
  timeout: NodeJS.Timeout | null;
  galleryId: string;
  orderId?: string;
  type: UploadType;
  processingCount: number;
}

// Map of galleryId+type to batch queue
const batchQueues = new Map<string, BatchQueue>();
const multipartBatchQueues = new Map<string, MultipartBatchQueue>();

// Global queue for batch requests to prevent too many concurrent requests
interface BatchRequest {
  queueKey: string;
  processFn: () => Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
  retryCount: number;
}

const batchRequestQueue: BatchRequest[] = [];
let processingBatchRequests = 0;

function getQueueKey(galleryId: string, type: UploadType, orderId?: string): string {
  return `${galleryId}-${type}-${orderId ?? ""}`;
}

/**
 * Retry helper with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable (network/CORS errors)
      const errorMessage = lastError.message.toLowerCase();
      const errorWithStatus = lastError as Error & { status?: number };
      const isRetryable =
        errorMessage.includes("network") ||
        errorMessage.includes("cors") ||
        errorMessage.includes("failed to fetch") ||
        errorMessage.includes("err_failed") ||
        errorWithStatus.status === 503 ||
        errorWithStatus.status === 429 ||
        errorWithStatus.status === 0; // Network error

      if (!isRetryable || attempt >= maxRetries) {
        throw lastError;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = initialDelay * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new Error("Retry failed");
}

/**
 * Process a batch request with retry logic and concurrency control
 */
async function processBatchRequest(queue: BatchQueue): Promise<void> {
  const pendingArray = Array.from(queue.pending.values());
  if (pendingArray.length === 0) {
    return;
  }

  // Remove from pending before processing to prevent duplicates
  pendingArray.forEach((req) => {
    queue.pending.delete(req.fileId);
  });

  queue.timeout = null;

  try {
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

    // Process finals batch with retry
    if (finalsFiles.length > 0 && queue.orderId) {
      const orderId = queue.orderId;
      await retryWithBackoff(async () => {
        // NOTE: This direct API call is necessary for Uppy to work and should not be refactored to React Query.
        // Uppy's AwsS3 plugin requires synchronous presigned URL retrieval during upload initialization.
        const response = await api.uploads.getFinalImagePresignedUrlsBatch(
          queue.galleryId,
          orderId,
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
      }).catch((error) => {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to get presigned URLs";
        finalsFiles.forEach((req) => {
          req.reject(new Error(errorMessage));
        });
        throw error;
      });
    }

    // Process originals batch with retry
    if (originalsFiles.length > 0) {
      await retryWithBackoff(async () => {
        // NOTE: This direct API call is necessary for Uppy to work and should not be refactored to React Query.
        // Uppy's AwsS3 plugin requires synchronous presigned URL retrieval during upload initialization.
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
      }).catch((error) => {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to get presigned URLs";
        originalsFiles.forEach((req) => {
          req.reject(new Error(errorMessage));
        });
        throw error;
      });
    }
  } finally {
    // Process next batch if any are pending (via queue system for concurrency control)
    if (queue.pending.size > 0) {
      // Small delay before next batch to prevent rapid-fire requests
      setTimeout(() => {
        void processBatchWithQueue(queue);
      }, 100);
    }
  }
}

/**
 * Queue and process batch requests with concurrency control
 */
async function processBatchWithQueue(queue: BatchQueue): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const queueKey = getQueueKey(queue.galleryId, queue.type, queue.orderId);

    // If we're at the concurrency limit, queue the request
    if (processingBatchRequests >= MAX_CONCURRENT_BATCHES) {
      batchRequestQueue.push({
        queueKey,
        processFn: () => processBatchRequest(queue),
        resolve,
        reject,
        retryCount: 0,
      });
      return;
    }

    // Process immediately
    processingBatchRequests++;
    processBatchRequest(queue)
      .then(() => {
        processingBatchRequests--;
        resolve();
        processNextQueuedBatch();
      })
      .catch((error) => {
        processingBatchRequests--;
        reject(error);
        processNextQueuedBatch();
      });
  });
}

/**
 * Process next queued batch request
 */
function processNextQueuedBatch(): void {
  if (processingBatchRequests >= MAX_CONCURRENT_BATCHES || batchRequestQueue.length === 0) {
    return;
  }

  const nextRequest = batchRequestQueue.shift();
  if (!nextRequest) {
    return;
  }

  processingBatchRequests++;
  nextRequest
    .processFn()
    .then(() => {
      processingBatchRequests--;
      nextRequest.resolve();
      processNextQueuedBatch();
    })
    .catch((error) => {
      processingBatchRequests--;

      // Retry with exponential backoff
      if (nextRequest.retryCount < 3) {
        nextRequest.retryCount++;
        const delay = 1000 * Math.pow(2, nextRequest.retryCount - 1); // 1s, 2s, 4s
        setTimeout(() => {
          batchRequestQueue.unshift(nextRequest); // Add back to front of queue
          processNextQueuedBatch();
        }, delay);
      } else {
        const rejectError = error instanceof Error ? error : new Error(String(error));
        nextRequest.reject(rejectError);
        processNextQueuedBatch();
      }
    });
}

function processBatch(queue: BatchQueue): void {
  if (queue.pending.size === 0) {
    return;
  }

  // Use the queued batch processor
  void processBatchWithQueue(queue);
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
  headers: Record<string, string>;
  metadata: {
    s3Key: string;
    s3KeyShort: string;
    presignedData?: {
      previewUrl?: string;
      bigThumbUrl?: string;
      thumbnailUrl?: string;
    };
  };
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
        processingCount: 0,
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
  onBeforeUpload?: (files: TypedUppyFile[]) => Promise<boolean>;
  onUploadProgress?: (progress: {
    current: number;
    total: number;
    bytesUploaded?: number;
    bytesTotal?: number;
  }) => void;
  onComplete?: (result: { successful: TypedUppyFile[]; failed: TypedUppyFile[] }) => void;
  onError?: (error: Error, file?: TypedUppyFile) => void;
}

/**
 * Create and configure an Uppy instance for gallery uploads
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createUppyInstance(config: UppyConfigOptions): any {
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
  uppy.on("file-removed", (_file: TypedUppyFile, _reason?: string) => {
    // File removed event handler
  });

  // Listen for restriction failures
  uppy.on("restriction-failed", (_file, _error) => {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
  // @ts-expect-error - ThumbnailUploadPlugin is a custom plugin not in Uppy types
  uppy.use(ThumbnailUploadPlugin as any);

  // Add AWS S3 plugin with custom getUploadParameters and multipart support
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  uppy.use(AwsS3, {
    id: "aws-s3",
    limit: 5, // Upload 5 files concurrently (adjust based on performance)
    shouldUseMultipart: (file) => {
      // Use multipart only for files larger than 100 MiB (Uppy's recommended default)
      // For smaller files, simple PUT uploads are more efficient (1 API call vs 4+ for multipart)
      // This reduces API Gateway load and prevents 503 errors from request overflow
      // See: https://uppy.io/docs/aws-s3/#shouldusemultipartfile
      return (file.size ?? 0) > MULTIPART_THRESHOLD;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getUploadParameters: async (file: any) => {
      // Only used for simple PUT uploads (small files)
      // Multipart uploads use createMultipartUpload instead
      const galleryId = config.galleryId;
      const type = config.type;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const fileName = file.name;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const fileSize = file.size ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const contentType = file.type ?? "image/jpeg";

      if (type === "finals" && !config.orderId) {
        throw new Error("Order ID is required for finals upload");
      }

      try {
        // Use batching mechanism to collect multiple file requests
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        const result = await queueFileRequest(
          galleryId,
          type,
          config.orderId,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
          file.id,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          fileName,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          fileSize,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          contentType
        );

        // Store the S3 key and presigned URLs in file metadata for later use
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (!file.meta) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          file.meta = {} as typeof file.meta;
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
        Object.assign(file.meta, {
          s3Key: result.metadata.s3Key,
          s3KeyShort: result.metadata.s3KeyShort,
          presignedData: result.metadata.presignedData,
        });

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createMultipartUpload: async (file: any) => {
      // Called by AwsS3 plugin when shouldUseMultipart returns true
      // For multipart, we also batch requests to reduce API calls
      const galleryId = config.galleryId;
      const type = config.type;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const fileName = file.name;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const fileSize = file.size ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const contentType = file.type ?? "image/jpeg";

      if (type === "finals" && !config.orderId) {
        throw new Error("Order ID is required for finals upload");
      }

      // For multipart, we batch similar to regular uploads
      // Create a promise-based batching system for multipart
      return new Promise<{ uploadId: string; key: string }>((resolve, reject) => {
        const queueKey = `multipart-${getQueueKey(galleryId, type, config.orderId)}`;
        let multipartQueue = multipartBatchQueues.get(queueKey);

        if (!multipartQueue) {
          multipartQueue = {
            pending: new Map(),
            timeout: null,
            galleryId,
            orderId: config.orderId,
            type,
            processingCount: 0,
          };
          multipartBatchQueues.set(queueKey, multipartQueue);
        }

        const fileRequest: MultipartFileRequest = {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          fileId: file.id,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          fileName,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          fileSize,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          contentType,
          resolve: (result) => {
            // Store multipart metadata in file
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (!file.meta) {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
              file.meta = {} as typeof file.meta;
            }
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
            Object.assign(file.meta, {
              s3Key: result.objectKey,
              s3KeyShort: result.key,
              multipartParts: result.parts,
              multipartTotalParts: result.totalParts,
              multipartPartSize: result.partSize,
            });
            resolve({
              uploadId: result.uploadId,
              key: result.objectKey,
            });
          },
          reject,
        };

        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        multipartQueue.pending.set(file.id, fileRequest);

        // Process batch if full or after timeout
        const processMultipartBatch = () => {
          const currentQueue = multipartBatchQueues.get(queueKey);
          if (!currentQueue || currentQueue.pending.size === 0) {
            return;
          }

          const pendingArray = Array.from(currentQueue.pending.values());
          currentQueue.pending.clear();
          currentQueue.timeout = null;

          void (async () => {
            try {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              const files = pendingArray.map((req) => {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                const key = type === "finals" ? req.fileName : `originals/${req.fileName}`;
                return {
                  key,
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                  contentType: req.contentType,
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                  fileSize: req.fileSize,
                };
              });

              // Use retry logic for multipart uploads as well
              const multipartResponse = await retryWithBackoff(async () => {
                // NOTE: This direct API call is necessary for Uppy to work and should not be refactored to React Query.
                // Uppy's AwsS3 plugin requires synchronous multipart upload creation during upload initialization.
                return await api.uploads.createMultipartUpload(galleryId, {
                  orderId: config.orderId,
                  files,
                });
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
                  req.reject(
                    new Error(`No multipart upload returned from server for file ${index}`)
                  );
                }
              });
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : "Failed to create multipart upload";
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
    // Type compatibility issue with Uppy's internal types - acceptable given Uppy's type system limitations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-misused-promises
    listParts: async (_file: any, opts: { uploadId?: string; key?: string }) => {
      const uploadId = opts.uploadId;
      const key = opts.key;
      if (!uploadId || !key) {
        return [];
      }
      // List existing parts for resume
      // If this fails (e.g., 503 errors), return empty array to allow upload to continue
      // This prevents resume failures from blocking uploads
      const galleryId = config.galleryId;
      const maxRetries = 2;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          // NOTE: This direct API call is necessary for Uppy to work and should not be refactored to React Query.
          // Uppy's AwsS3 plugin requires synchronous part listing for resume functionality.
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prepareUploadPart: (file: any, part: { number: number; chunk: Blob }) => {
      // Get presigned URL for this specific part
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const parts = file.meta?.multipartParts;
      if (!parts) {
        throw new Error("Multipart parts not available");
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const partData = (parts as Array<{ partNumber: number; url: string }>).find(
        (p: { partNumber: number; url: string }) => p.partNumber === part.number
      );
      if (!partData) {
        throw new Error(`Part ${part.number} not found`);
      }

      return Promise.resolve({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        url: partData.url,
      });
    },
    // Type compatibility issue with Uppy's internal types - acceptable given Uppy's type system limitations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-misused-promises
    // @ts-expect-error - Uppy type system limitations with multipart upload types
    completeMultipartUpload: async (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      file: any,
      {
        uploadId,
        key,
        parts,
      }: {
        uploadId: string;
        key: string;
        parts: Array<{ PartNumber: number; ETag: string; Size: number }>;
      }
    ) => {
      // Complete the multipart upload
      const galleryId = config.galleryId;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const fileSize = (file.size ?? 0) as number;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const fileId = file.id as string;

      // Complete multipart upload and track metadata write
      try {
        // NOTE: This direct API call is necessary for Uppy to work and should not be refactored to React Query.
        // Uppy's AwsS3 plugin requires synchronous multipart completion callback during upload lifecycle.
        const response = await api.uploads.completeMultipartUpload(galleryId, {
          uploadId,
          key,
          fileSize, // Pass fileSize to backend
          parts: parts.map((p) => ({
            partNumber: p.PartNumber,
            etag: p.ETag,
          })),
        });

        // Track metadata write completion
        const metadataWritten = response.metadataWritten === true;
        metadataWritePromises.set(fileId, Promise.resolve(metadataWritten));

        return {
          location: response.location ?? "",
          etag: response.etag ?? "",
        };
      } catch (error) {
        // If upload completion fails, track as failed metadata write
        metadataWritePromises.set(fileId, Promise.resolve(false));
        throw error;
      }
    },
    // Type compatibility issue with Uppy's internal types - acceptable given Uppy's type system limitations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-misused-promises
    abortMultipartUpload: async (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _file: any,
      opts: { uploadId?: string; key?: string }
    ) => {
      const uploadId = opts.uploadId;
      const key = opts.key;
      if (!uploadId || !key) {
        return;
      }
      // Abort the multipart upload
      const galleryId = config.galleryId;
      // NOTE: This direct API call is necessary for Uppy to work and should not be refactored to React Query.
      // Uppy's AwsS3 plugin requires synchronous multipart abort callback during upload cancellation.
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
      const files = fileIds
        .map((id) => uppy.getFile(id))
        .filter((f) => f !== null) as TypedUppyFile[];

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
          const uploaded =
            typeof f.progress.bytesUploaded === "number" ? f.progress.bytesUploaded : 0;
          bytesUploaded += uploaded;
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

  // Track metadata write completion per file (shared between simple PUT and multipart)
  const metadataWritePromises = new Map<string, Promise<boolean>>();

  // Handle simple PUT upload completion (not multipart)
  // Call completion endpoint to update storage immediately
  uppy.on("upload-success", async (file, _response) => {
    if (!file) {
      return;
    }
    const typedFile = file as TypedUppyFile;
    // Only handle simple PUT uploads (multipart has its own completion handler)
    // Check if this is a multipart upload by looking for multipart metadata
    const isMultipart =
      typedFile.meta?.multipartUploadId !== undefined ||
      typedFile.meta?.multipartParts !== undefined ||
      typedFile.meta?.multipartTotalParts !== undefined;
    if (isMultipart) {
      return; // Multipart completion is handled in completeMultipartUpload
    }

    // Get S3 key from file metadata (set during getUploadParameters)
    const s3Key = typedFile.meta?.s3Key;
    const fileSize = typedFile.size ?? 0;

    if (!s3Key || fileSize <= 0) {
      // Skip if we don't have the required info
      return;
    }

    // Call completion endpoint to update storage and write metadata
    const galleryId = config.galleryId;
    const metadataPromise = (async () => {
      try {
        // NOTE: This direct API call is necessary for Uppy to work and should not be refactored to React Query.
        // Uppy's upload-success event handler requires synchronous completion callback during upload lifecycle.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const result = await api.uploads.completeUpload(galleryId, {
          key: s3Key,
          fileSize,
        });
        // Check if metadata was written successfully
        return result.metadataWritten === true;
      } catch (error) {
        // Log error - metadata write failed
        const errorMessage = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        console.error("Failed to complete upload (metadata write):", errorMessage);
        return false;
      }
    })();

    // Store promise for tracking completion
    metadataWritePromises.set(typedFile.id, metadataPromise);
  });

  // Expose metadataWritePromises to config for tracking completion
  // Store it on the uppy instance so it can be accessed from useUppyUpload
  (uppy as any).__metadataWritePromises = metadataWritePromises;

  if (config.onComplete) {
    uppy.on("complete", (result) => {
      config.onComplete?.({
        successful: (result.successful ?? []) as TypedUppyFile[],
        failed: (result.failed ?? []) as TypedUppyFile[],
      });
    });
  }

  if (config.onError) {
    uppy.on("upload-error", (file, error) => {
      config.onError?.(error, file ? (file as TypedUppyFile) : undefined);
    });
  }

  return uppy;
}
