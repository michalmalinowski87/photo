import { useQueryClient } from "@tanstack/react-query";
import Uppy from "@uppy/core";
import { useEffect, useRef, useCallback, useState } from "react";

import api from "../lib/api-service";
import { queryKeys } from "../lib/react-query";
import { resetInfiniteQueryAndRefetchFirstPage } from "../lib/react-query-helpers";
import { createUppyInstance, type UploadType, type TypedUppyFile } from "../lib/uppy-config";

import { useMarkFinalUploadComplete } from "./mutations/useUploadMutations";
import { useToast } from "./useToast";

export interface UseUppyUploadConfig {
  galleryId: string;
  orderId?: string; // Required for 'finals' type
  type: UploadType;
  /** When false/undefined, existing keys are not prefetched (avoids redundant /images or /final/images calls until modal opens) */
  isOpen?: boolean;
  onUploadComplete?: () => void;
  onValidationNeeded?: (data: {
    uploadedSizeBytes: number;
    originalsLimitBytes: number;
    excessBytes: number;
    nextTierPlan?: string;
    nextTierPriceCents?: number;
    nextTierLimitBytes?: number;
    isSelectionGallery?: boolean;
  }) => void;
  onUploadError?: (error: Error, file?: TypedUppyFile) => void;
  reloadGallery?: () => Promise<void>;
  onScrollReset?: () => void;
}

interface SpeedCalculationState {
  lastBytes: number;
  lastTime: number;
}

interface UploadProgressState {
  current: number;
  total: number;
  bytesUploaded: number;
  bytesTotal: number;
  speed: number;
  timeRemaining: number;
}

export interface UploadStats {
  elapsedTimeMs: number;
  totalBytes: number;
  totalFiles: number;
  successfulCount: number;
  failedCount: number;
  avgSpeedBytesPerSecond: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

async function validateStorageLimits(
  galleryId: string,
  files: TypedUppyFile[],
  type: UploadType,
  onValidationNeeded?: UseUppyUploadConfig["onValidationNeeded"]
): Promise<boolean> {
  try {
    const totalSize = files.reduce((sum, file) => sum + (file.size ?? 0), 0);
    // NOTE: This direct API call is necessary for Uppy to work and should not be refactored to React Query.
    // Uppy's onBeforeUpload callback requires synchronous validation during upload initialization.
    // Pass upload size and type to backend so it can calculate projected usage and next tier plan correctly
    const validationResult = await api.galleries.validateUploadLimits(galleryId, totalSize, type);

    // If no limit is set (draft gallery), allow upload
    const limitBytes =
      type === "finals"
        ? (validationResult.finalsLimitBytes ?? validationResult.originalsLimitBytes)
        : validationResult.originalsLimitBytes;

    if (!limitBytes) {
      return true;
    }

    // Backend now checks projected usage (current + upload) and returns withinLimit accordingly
    // CRITICAL: Check withinLimit explicitly - backend returns 200 OK but with withinLimit: false when limit would be exceeded
    if (validationResult.withinLimit === false) {
      // Backend has calculated excess bytes and next tier plan based on projected usage
      const callbackData = {
        uploadedSizeBytes: validationResult.uploadedSizeBytes,
        originalsLimitBytes: limitBytes, // Use the appropriate limit for the callback
        excessBytes: validationResult.excessBytes ?? 0,
        nextTierPlan: validationResult.nextTierPlan,
        nextTierPriceCents: validationResult.nextTierPriceCents,
        nextTierLimitBytes: validationResult.nextTierLimitBytes,
        isSelectionGallery: validationResult.isSelectionGallery,
      };
      onValidationNeeded?.(callbackData);
      return false;
    }

    return true;
  } catch (error: unknown) {
    // Handle 400 errors from backend (when limit would be exceeded)
    // The API service throws errors for non-200 status codes, but we need to extract the body
    const apiError = error as {
      status?: number;
      body?: {
        withinLimit?: boolean;
        originalsLimitBytes?: number;
        finalsLimitBytes?: number;
        [key: string]: unknown;
      };
    };

    if (apiError.status === 400 && apiError.body) {
      // Backend returned 400 with validation details in body
      const body = apiError.body as {
        withinLimit?: boolean;
        error?: string;
        message?: string;
        uploadedSizeBytes?: number;
        originalsLimitBytes?: number;
        finalsLimitBytes?: number;
        excessBytes?: number;
        nextTierPlan?: string;
        nextTierPriceCents?: number;
        nextTierLimitBytes?: number;
        isSelectionGallery?: boolean;
      };

      // Backend returns withinLimit: false in the body when limits are exceeded
      // Also check if excessBytes exists (indicates limit exceeded even if withinLimit is not set)
      const isLimitExceeded =
        body.withinLimit === false ||
        (body.withinLimit === undefined && body.excessBytes !== undefined) ||
        (body.error &&
          typeof body.error === "string" &&
          body.error.toLowerCase().includes("limit")) ||
        (body.message &&
          typeof body.message === "string" &&
          body.message.toLowerCase().includes("limit"));

      if (isLimitExceeded) {
        // For finals, use finalsLimitBytes if available, otherwise fall back to originalsLimitBytes
        const limitBytes =
          type === "finals"
            ? (body.finalsLimitBytes ?? body.originalsLimitBytes ?? 0)
            : (body.originalsLimitBytes ?? 0);

        // Ensure we have valid data before calling the callback
        // For finals, we might not have uploadedSizeBytes but we have excessBytes
        const uploadedSizeBytes = body.uploadedSizeBytes ?? 0;
        const excessBytes = body.excessBytes ?? 0;

        if (limitBytes > 0 && (uploadedSizeBytes > 0 || excessBytes > 0)) {
          const validationData = {
            uploadedSizeBytes,
            originalsLimitBytes: limitBytes, // Use the appropriate limit for the callback
            excessBytes,
            nextTierPlan: body.nextTierPlan,
            nextTierPriceCents: body.nextTierPriceCents,
            nextTierLimitBytes: body.nextTierLimitBytes,
            isSelectionGallery: body.isSelectionGallery,
          };

          if (onValidationNeeded) {
            onValidationNeeded(validationData);
          }
          return false;
        }
      }
    }
    // For other errors, re-throw to let Uppy handle them
    throw error;
  }
}

function calculateUploadMetrics(
  progress: { bytesUploaded?: number; bytesTotal?: number },
  previousState: SpeedCalculationState | null
): { speed: number; timeRemaining: number; newState: SpeedCalculationState } {
  const now = Date.now();
  const bytesUploaded = progress.bytesUploaded ?? 0;
  const bytesTotal = progress.bytesTotal ?? 0;
  let speed = 0;
  let timeRemaining = 0;

  if (previousState) {
    const timeDiff = (now - previousState.lastTime) / 1000;
    const bytesDiff = bytesUploaded - previousState.lastBytes;
    if (timeDiff > 0) {
      speed = bytesDiff / timeDiff;
    }
  }

  if (speed > 0 && bytesTotal > bytesUploaded) {
    timeRemaining = (bytesTotal - bytesUploaded) / speed;
  }

  return {
    speed,
    timeRemaining,
    newState: { lastBytes: bytesUploaded, lastTime: now },
  };
}

function getTypeLabel(type: UploadType): string {
  return type === "finals" ? "zdjęć finalnych" : "zdjęć";
}

const KEYS_PAGE_LIMIT = 5000;

function isImageFile(file: File): boolean {
  return (
    file.type?.startsWith("image/") === true ||
    /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(file.name)
  );
}

/**
 * Fetch all existing image keys (filenames) for the gallery or order.
 * Uses lightweight /images/keys and /final/images/keys endpoints (keys only, no URLs).
 * Paginates until hasMore is false so collision detection works for 2000+ images.
 */
async function fetchExistingImageKeys(
  galleryId: string,
  type: UploadType,
  orderId?: string
): Promise<Set<string>> {
  const keys = new Set<string>();

  if (type === "finals" && orderId) {
    let cursor: string | null = null;
    do {
      const response = await api.orders.getFinalImageKeys(galleryId, orderId, {
        limit: KEYS_PAGE_LIMIT,
        cursor,
      });
      for (const key of response.keys ?? []) {
        if (key) keys.add(key);
      }
      cursor = response.hasMore ? (response.nextCursor ?? null) : null;
    } while (cursor !== null);
  } else {
    let cursor: string | null = null;
    do {
      const response = await api.galleries.getImageKeys(galleryId, {
        limit: KEYS_PAGE_LIMIT,
        cursor,
      });
      for (const key of response.keys ?? []) {
        if (key) keys.add(key);
      }
      cursor = response.hasMore ? (response.nextCursor ?? null) : null;
    } while (cursor !== null);
  }

  return keys;
}

/**
 * Return the next available filename for duplicate (base_1.ext, base_2.ext, ...).
 */
function getNextAvailableName(baseName: string, ext: string, takenSet: Set<string>): string {
  let n = 1;
  let candidate: string;
  do {
    candidate = `${baseName}_${n}${ext}`;
    n += 1;
  } while (takenSet.has(candidate));
  return candidate;
}

/**
 * Assign unique names within a batch (first keeps name, subsequent duplicates get base_1, base_2, ...).
 */
function assignUniqueNamesInBatch(files: File[]): Array<{ file: File; name: string }> {
  const taken = new Set<string>();
  return files.map((file) => {
    let name = file.name;
    if (taken.has(name)) {
      const lastDot = name.lastIndexOf(".");
      const baseName = lastDot === -1 ? name : name.slice(0, lastDot);
      const ext = lastDot === -1 ? "" : name.slice(lastDot);
      name = getNextAvailableName(baseName, ext, taken);
    }
    taken.add(name);
    return { file, name };
  });
}

function showUploadResultToast(
  showToast: ReturnType<typeof useToast>["showToast"],
  type: UploadType,
  successfulCount: number,
  failedCount: number
): void {
  const typeLabel = getTypeLabel(type);

  if (failedCount > 0) {
    if (successfulCount > 0) {
      showToast(
        "warning",
        "Częściowy sukces",
        `Przesłano ${successfulCount} z ${successfulCount + failedCount} ${typeLabel}. ${failedCount} nie powiodło się.`
      );
    } else {
      const singleLabel = type === "finals" ? "zdjęcia finalnego" : "zdjęcia";
      showToast("error", "Błąd", `Nie udało się przesłać żadnego ${singleLabel}.`);
    }
  } else if (successfulCount > 0) {
    showToast("success", "Sukces", `${successfulCount} ${typeLabel} zostało przesłanych`);
  }
}

async function handlePostUploadActions(
  queryClient: ReturnType<typeof useQueryClient>,
  galleryId: string,
  orderId: string | undefined,
  type: UploadType,
  _successfulFiles: TypedUppyFile[],
  _reloadGallery?: () => Promise<void>,
  onFinalizingChange?: (isFinalizing: boolean) => void,
  markFinalUploadCompleteMutation?: ReturnType<typeof useMarkFinalUploadComplete>,
  onScrollReset?: () => void
): Promise<void> {
  // Set finalizing state at the start
  onFinalizingChange?.(true);

  try {
    if (type === "finals" && orderId) {
      // Wait for backend to finalize uploads and CloudFront to populate new images
      // This is especially important after pause/resume cycles with multipart uploads
      // 1.5 seconds allows time for:
      // - Backend image processing/thumbnail generation
      // - CloudFront edge locations to have content available
      // - Reduces 403 errors when immediately fetching after upload
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Use mutation hook to ensure order detail is invalidated (status may change from CLIENT_APPROVED/AWAITING_FINAL_PHOTOS to PREPARING_DELIVERY)
      if (markFinalUploadCompleteMutation) {
        await markFinalUploadCompleteMutation.mutateAsync({ galleryId, orderId });
      } else {
        // Fallback to direct API call if mutation not provided (shouldn't happen in normal flow)
        // NOTE: This direct API call is necessary for Uppy to work and should not be refactored to React Query.
        // Uppy's onComplete callback requires synchronous finalization during upload completion lifecycle.
        await api.uploads.markFinalUploadComplete(galleryId, orderId);
        // Manually invalidate order detail, gallery detail, and gallery list if using fallback
        await queryClient.invalidateQueries({
          queryKey: queryKeys.orders.detail(galleryId, orderId),
        });
        await queryClient.invalidateQueries({
          queryKey: queryKeys.galleries.detail(galleryId),
        });
        await queryClient.invalidateQueries({
          queryKey: queryKeys.galleries.lists(),
        });
      }

      // Reset and refetch final images infinite queries
      await resetInfiniteQueryAndRefetchFirstPage(queryClient, (query) => {
        const key = query.queryKey;
        return (
          Array.isArray(key) &&
          key.length >= 6 &&
          key[0] === "orders" &&
          key[1] === "detail" &&
          key[2] === galleryId &&
          key[3] === orderId &&
          key[4] === "final-images" &&
          key[5] === "infinite"
        );
      });

      // Also reset gallery images queries for finals type
      await resetInfiniteQueryAndRefetchFirstPage(queryClient, (query) => {
        const key = query.queryKey;
        return (
          Array.isArray(key) &&
          key.length >= 6 &&
          key[0] === "galleries" &&
          key[1] === "detail" &&
          key[2] === galleryId &&
          key[3] === "images" &&
          key[4] === "infinite" &&
          key[5] === "finals"
        );
      });
    } else {
      // For originals, wait for CloudFront to populate new images before refetching
      // This delay allows time for:
      // - Backend image processing/thumbnail generation
      // - CloudFront edge locations to have content available
      // - Reduces 403 errors when immediately fetching after upload
      // Best practice: 1-2 seconds is sufficient for most image processing pipelines
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Reset and refetch infinite queries
      await resetInfiniteQueryAndRefetchFirstPage(queryClient, (query) => {
        const key = query.queryKey;
        return (
          Array.isArray(key) &&
          key.length >= 6 &&
          key[0] === "galleries" &&
          key[1] === "detail" &&
          key[2] === galleryId &&
          key[3] === "images" &&
          key[4] === "infinite" &&
          (key[5] === "originals" || key[5] === "thumb")
        );
      });

      // Invalidate gallery detail to refresh originalsBytesUsed
      // This ensures NextStepsOverlay and other components using useGallery() get updated data
      await queryClient.invalidateQueries({
        queryKey: queryKeys.galleries.detail(galleryId),
      });
    }

    // Always invalidate gallery list to refresh originalsBytesUsed/finalsBytesUsed
    // This ensures the publish button state is updated in the gallery list view
    await queryClient.invalidateQueries({
      queryKey: queryKeys.galleries.lists(),
    });

    // Reset scroll to top after resetting queries
    onScrollReset?.();

    // Set finalizing state to false after reset and refetch completes
    onFinalizingChange?.(false);
  } catch (error) {
    // Set finalizing state to false even on error
    onFinalizingChange?.(false);
    throw error;
  }
}

/**
 * Check if any file is currently paused
 * Relies on Uppy's native file state - file.isPaused is managed by Uppy
 */
function checkIfAnyFileIsPaused(uppy: Uppy | null): boolean {
  if (!uppy) {
    return false;
  }
  // Trust Uppy's file state - it manages isPaused internally
  const files = Object.values(uppy.getFiles());
  return files.some(
    (f) => f.progress?.uploadStarted && !f.progress.uploadComplete && f.isPaused === true // Uppy manages this property
  );
}

const INITIAL_PROGRESS: UploadProgressState = {
  current: 0,
  total: 0,
  bytesUploaded: 0,
  bytesTotal: 0,
  speed: 0,
  timeRemaining: 0,
};

export type CollisionAction = "stop" | "skip" | "replace" | "duplicate";

export interface CollisionPrompt {
  fileName: string;
  fileId: string;
  totalCount: number;
}

// ============================================================================
// Main Hook
// ============================================================================

export function useUppyUpload(config: UseUppyUploadConfig) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const markFinalUploadCompleteMutation = useMarkFinalUploadComplete();
  const uppyRef = useRef<Uppy | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ successful: number; failed: number } | null>(
    null
  );
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState>(INITIAL_PROGRESS);
  const [isPaused, setIsPaused] = useState(false);
  const [uploadStats, setUploadStats] = useState<UploadStats | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [collisionPrompt, setCollisionPrompt] = useState<CollisionPrompt | null>(null);
  const collisionResolveRef = useRef<
    ((result: { action: CollisionAction; applyToAll: boolean }) => void) | null
  >(null);
  const speedCalculationRef = useRef<SpeedCalculationState | null>(null);
  const uploadStartTimeRef = useRef<number | null>(null);
  const isCancellingRef = useRef(false);
  const configRef = useRef(config);
  configRef.current = config;

  const existingKeysCacheRef = useRef<{
    keys: Set<string>;
    timestamp: number;
    cacheKey: string;
  } | null>(null);
  const fetchInFlightRef = useRef<string | null>(null);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);

  // Prefetch existing image keys only when modal is open; show loading until keys are ready to prevent race and make collision detection functional
  useEffect(() => {
    if (config.isOpen !== true) {
      setIsLoadingKeys(false);
      return;
    }
    if (!config.galleryId || (config.type === "finals" && !config.orderId)) {
      setIsLoadingKeys(false);
      return;
    }
    const cacheKey = `${config.galleryId}-${config.type}-${config.orderId ?? ""}`;
    if (fetchInFlightRef.current === cacheKey) {
      return;
    }
    const cached = existingKeysCacheRef.current;
    if (cached && cached.cacheKey === cacheKey && Date.now() - cached.timestamp < 60_000) {
      setIsLoadingKeys(false);
      return;
    }
    fetchInFlightRef.current = cacheKey;
    setIsLoadingKeys(true);
    void fetchExistingImageKeys(config.galleryId, config.type, config.orderId)
      .then((keys) => {
        existingKeysCacheRef.current = { keys, timestamp: Date.now(), cacheKey };
      })
      .finally(() => {
        fetchInFlightRef.current = null;
        setIsLoadingKeys(false);
      });
  }, [config.galleryId, config.type, config.orderId, config.isOpen]);

  const resolveCollisionChoice = useCallback((action: CollisionAction, applyToAll: boolean) => {
    collisionResolveRef.current?.({ action, applyToAll });
    collisionResolveRef.current = null;
    setCollisionPrompt(null);
  }, []);

  /**
   * Add files to Uppy after resolving name collisions with existing gallery images
   * and current Uppy queue. Collision modal is shown before any file is added;
   * miniatures never show duplicate names.
   */
  const addFilesWithCollisionCheck = useCallback(
    async (uppy: Uppy, incomingFiles: File[]): Promise<void> => {
      const imageFiles = incomingFiles.filter(isImageFile);
      if (imageFiles.length === 0) {
        return;
      }

      const batchWithNames = assignUniqueNamesInBatch(imageFiles);
      const cfg = configRef.current;
      const cacheKey = `${cfg.galleryId}-${cfg.type}-${cfg.orderId ?? ""}`;
      const CACHE_TTL_MS = 60_000;

      let existingKeys: Set<string>;
      const cached = existingKeysCacheRef.current;
      if (cached && cached.cacheKey === cacheKey && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        existingKeys = new Set(cached.keys);
      } else {
        try {
          existingKeys = await fetchExistingImageKeys(cfg.galleryId, cfg.type, cfg.orderId);
          existingKeysCacheRef.current = { keys: existingKeys, timestamp: Date.now(), cacheKey };
        } catch {
          // On error, add all with batch-assigned names
          for (const { file, name } of batchWithNames) {
            try {
              uppy.addFile({
                source: "Local",
                name,
                type: file.type || "image/jpeg",
                data: file,
              });
            } catch {
              // Silently fail
            }
          }
          return;
        }
      }

      const uppyNames = new Set(Object.values(uppy.getFiles()).map((f) => f.name));
      const taken = new Set<string>([...existingKeys, ...uppyNames]);

      let applyToAllChoice: { action: CollisionAction } | null = null;
      const remainingCollisions = batchWithNames.filter(({ name }) => taken.has(name));

      for (const { file, name } of batchWithNames) {
        let effectiveName = name;
        let shouldAdd = true;

        if (taken.has(name)) {
          let action: CollisionAction;

          if (applyToAllChoice) {
            action = applyToAllChoice.action;
          } else {
            setCollisionPrompt({
              fileName: name,
              fileId: "",
              totalCount: remainingCollisions.length,
            });
            const choice = await new Promise<{
              action: CollisionAction;
              applyToAll: boolean;
            }>((resolve) => {
              collisionResolveRef.current = resolve;
            });
            collisionResolveRef.current = null;
            setCollisionPrompt(null);
            action = choice.action;
            if (choice.applyToAll) {
              applyToAllChoice = { action };
            }
          }

          if (action === "stop") {
            return;
          }
          if (action === "skip") {
            shouldAdd = false;
          } else if (action === "replace") {
            const existingInUppy = Object.values(uppy.getFiles()).find((f) => f.name === name);
            if (existingInUppy) {
              uppy.removeFile(existingInUppy.id);
              uppyNames.delete(name);
            }
            effectiveName = name;
          } else if (action === "duplicate") {
            const lastDot = name.lastIndexOf(".");
            const baseName = lastDot === -1 ? name : name.slice(0, lastDot);
            const ext = lastDot === -1 ? "" : name.slice(lastDot);
            effectiveName = getNextAvailableName(baseName, ext, taken);
          }
        }

        if (shouldAdd) {
          try {
            uppy.addFile({
              source: "Local",
              name: effectiveName,
              type: file.type || "image/jpeg",
              data: file,
            });
            taken.add(effectiveName);
            uppyNames.add(effectiveName);
          } catch {
            // Silently fail
          }
        }
      }
    },
    []
  );

  // Initialize Uppy instance
  useEffect(() => {
    if (!config.galleryId || (config.type === "finals" && !config.orderId)) {
      if (config.type === "finals" && !config.orderId) {
        // Order ID is required for finals upload
      }
      return;
    }

    // Helper function to extract limit exceeded data from error
    const extractLimitExceededData = (
      error: unknown
    ): {
      uploadedSizeBytes: number;
      originalsLimitBytes: number;
      excessBytes: number;
      nextTierPlan?: string;
      nextTierPriceCents?: number;
      nextTierLimitBytes?: number;
      isSelectionGallery?: boolean;
    } | null => {
      // Try to extract error from various formats
      const errorObj = error as {
        message?: string;
        body?: {
          error?: string;
          message?: string;
          uploadedSizeBytes?: number;
          originalsLimitBytes?: number;
          finalsLimitBytes?: number;
          excessBytes?: number;
          nextTierPlan?: string;
          nextTierPriceCents?: number;
          nextTierLimitBytes?: number;
          isSelectionGallery?: boolean;
          currentSizeBytes?: number;
          limitBytes?: number;
          totalFileSizeBytes?: number;
        };
        response?: { body?: unknown };
      };

      const body = errorObj.body || (errorObj.response?.body as typeof errorObj.body);
      if (!body) return null;

      // Check if this is a limit exceeded error
      const errorMessage = body.error || body.message || errorObj.message || "";
      const isLimitError =
        errorMessage.toLowerCase().includes("limit") ||
        errorMessage.toLowerCase().includes("exceeded") ||
        body.excessBytes !== undefined;

      if (!isLimitError) return null;

      // Extract limit bytes - for finals, prefer finalsLimitBytes
      const limitBytes =
        configRef.current.type === "finals"
          ? (body.finalsLimitBytes ?? body.limitBytes ?? body.originalsLimitBytes ?? 0)
          : (body.originalsLimitBytes ?? body.limitBytes ?? 0);

      const currentSize = body.uploadedSizeBytes ?? body.currentSizeBytes ?? 0;
      const uploadSize = body.totalFileSizeBytes ?? 0;
      const uploadedSizeBytes = currentSize + uploadSize;
      const excessBytes = body.excessBytes ?? uploadedSizeBytes - limitBytes;

      if (limitBytes > 0 && uploadedSizeBytes > 0) {
        return {
          uploadedSizeBytes,
          originalsLimitBytes: limitBytes,
          excessBytes: Math.max(0, excessBytes),
          nextTierPlan: body.nextTierPlan,
          nextTierPriceCents: body.nextTierPriceCents,
          nextTierLimitBytes: body.nextTierLimitBytes,
          isSelectionGallery: body.isSelectionGallery,
        };
      }

      return null;
    };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const uppy = createUppyInstance({
      galleryId: config.galleryId,
      orderId: config.orderId,
      type: config.type,
      onBeforeUpload: async (files: TypedUppyFile[]) => {
        try {
          // Collision detection runs at file-add time (addFilesWithCollisionCheck);
          // here we only validate storage limits.
          const isValid = await validateStorageLimits(
            configRef.current.galleryId,
            files,
            configRef.current.type,
            configRef.current.onValidationNeeded
          );
          return isValid;
        } catch (error) {
          // Check if this is a limit exceeded error (400) - if so, validateStorageLimits should have handled it
          const apiError = error as { status?: number; body?: unknown };
          if (apiError.status === 400) {
            // Try to extract limit exceeded data and call callback
            const limitData = extractLimitExceededData(error);
            if (limitData && configRef.current.onValidationNeeded) {
              configRef.current.onValidationNeeded(limitData);
              return false;
            }
            // Limit exceeded error - validateStorageLimits should have called onValidationNeeded
            // Don't show toast for limit exceeded - the upgrade wizard should handle it
            return false;
          }
          // For other errors, show toast
          showToast("error", "Błąd", "Nie udało się sprawdzić limitów magazynu");
          return false;
        }
      },
      onError: (error: Error, file?: TypedUppyFile) => {
        // Handle upload errors - check if it's a limit exceeded error from presignMultipart
        // Try to extract limit exceeded data from error
        const limitData = extractLimitExceededData(error);
        if (limitData && configRef.current.onValidationNeeded) {
          configRef.current.onValidationNeeded(limitData);
          return;
        }

        // Call custom error handler if provided, otherwise show default toast
        if (configRef.current.onUploadError) {
          configRef.current.onUploadError(error, file);
        } else {
          const fileName = file?.name ?? "nieznany plik";
          showToast("error", "Błąd", `Nie udało się przesłać ${fileName}: ${error.message}`);
        }
      },
      onUploadProgress: (progress) => {
        const metrics = calculateUploadMetrics(progress, speedCalculationRef.current);
        speedCalculationRef.current = metrics.newState;

        setUploadProgress({
          current: progress.current,
          total: progress.total,
          bytesUploaded: progress.bytesUploaded ?? 0,
          bytesTotal: progress.bytesTotal ?? 0,
          speed: metrics.speed,
          timeRemaining: metrics.timeRemaining,
        });
      },
      onComplete: async (result) => {
        // Ignore complete event if we're cancelling - cancelAll() triggers complete event
        if (isCancellingRef.current) {
          return;
        }

        const successfulCount = result.successful.length;
        const failedCount = result.failed.length;
        const totalFiles = successfulCount + failedCount;

        // Check failed files for limit exceeded errors
        if (failedCount > 0 && configRef.current.onValidationNeeded) {
          for (const failedFile of result.failed) {
            // Uppy stores error information in the file's response or error property
            // Check various possible error locations
            const fileAny = failedFile as any;
            const fileError =
              fileAny.error ||
              fileAny.response?.error ||
              fileAny.response?.body?.error ||
              fileAny.response;

            if (fileError) {
              const limitData = extractLimitExceededData(fileError);
              if (limitData) {
                configRef.current.onValidationNeeded(limitData);
                return; // Exit early, don't process other files
              }
            }
          }
        }

        // Ignore complete event if no files were processed
        // This happens when:
        // 1. Validation fails before upload starts (onBeforeUpload returns false)
        // 2. User manually cancels before any uploads start
        // 3. Upload never actually started for any reason
        // In all these cases, we should NOT show the completion overlay
        if (totalFiles === 0) {
          // No files were uploaded - reset state and return early to prevent showing completion overlay
          setUploading(false);
          setIsPaused(false);
          setUploadComplete(false);
          setUploadResult(null);
          setUploadStats(null);
          setUploadProgress(INITIAL_PROGRESS);
          speedCalculationRef.current = null;
          uploadStartTimeRef.current = null;
          return;
        }

        // Also check if upload never actually started (uploadStartTimeRef not set)
        // This is an additional safety check for edge cases
        if (!uploadStartTimeRef.current) {
          // Upload was never started - reset state and return early
          setUploading(false);
          setIsPaused(false);
          setUploadComplete(false);
          setUploadResult(null);
          setUploadStats(null);
          setUploadProgress(INITIAL_PROGRESS);
          return;
        }

        // Calculate upload statistics
        const endTime = Date.now();
        const startTime = uploadStartTimeRef.current;
        const elapsedTimeMs = startTime ? endTime - startTime : 0;

        // Calculate total bytes from successful files
        const validSuccessfulFiles = result.successful.filter((file) => {
          const size = file.size ?? 0;
          return size > 0 && size < 10 * 1024 * 1024 * 1024; // Sanity check: max 10GB per file
        });
        const totalBytes = validSuccessfulFiles.reduce((sum, file) => sum + (file.size ?? 0), 0);

        // Calculate average upload speed (bytes per second)
        const elapsedSeconds = elapsedTimeMs > 0 ? elapsedTimeMs / 1000 : 1; // Avoid division by zero
        const avgSpeedBytesPerSecond =
          totalBytes > 0 && elapsedSeconds > 0 ? totalBytes / elapsedSeconds : 0;

        // Set upload statistics
        const stats: UploadStats = {
          elapsedTimeMs,
          totalBytes,
          totalFiles,
          successfulCount,
          failedCount,
          avgSpeedBytesPerSecond,
        };
        setUploadStats(stats);

        // Determine if we need finalization BEFORE setting any state
        // This ensures isFinalizing is set correctly before the overlay opens
        // ALL successful uploads need finalization (metadata processing, query invalidation, etc.)
        const needsFinalization = successfulCount > 0;

        // Set finalizing state FIRST, synchronously, before opening the overlay
        // This prevents the brief flash of "Upload Completed" with OK button before switching to "Processing"
        if (needsFinalization) {
          setIsFinalizing(true);
        }

        // Batch state updates together to ensure they're processed atomically
        // This prevents the overlay from rendering with isFinalizing=false before it updates
        setUploadComplete(true);
        setUploadResult({ successful: successfulCount, failed: failedCount });
        setUploading(false);
        setIsPaused(false);
        setUploadProgress(INITIAL_PROGRESS);

        speedCalculationRef.current = null;
        uploadStartTimeRef.current = null;

        showUploadResultToast(showToast, configRef.current.type, successfulCount, failedCount);

        if (successfulCount > 0) {
          try {
            // Wait for all metadata writes to complete before proceeding
            // Get metadata write promises from uppy instance
            const metadataWritePromises = (uppy as any).__metadataWritePromises as
              | Map<string, Promise<boolean>>
              | undefined;

            if (metadataWritePromises && metadataWritePromises.size > 0) {
              // Wait for all metadata writes to complete
              const metadataResults = await Promise.allSettled(
                Array.from(metadataWritePromises.values())
              );

              // Check if any metadata writes failed
              const failedMetadataWrites = metadataResults.filter(
                (result) =>
                  result.status === "rejected" ||
                  (result.status === "fulfilled" && result.value === false)
              );

              if (failedMetadataWrites.length > 0) {
                // Continue anyway - images are uploaded, metadata can be fixed later
              }
            }

            // Get successful files for size calculation
            const successfulFiles = result.successful || [];
            await handlePostUploadActions(
              queryClient,
              configRef.current.galleryId,
              configRef.current.orderId,
              configRef.current.type,
              successfulFiles,
              configRef.current.reloadGallery,
              setIsFinalizing,
              markFinalUploadCompleteMutation,
              configRef.current.onScrollReset
            );
          } catch (error) {
            // Only show warning if reloadGallery failed, not for other errors
            // The images might still appear, so we just log the error silently
            // and let the cache invalidation handle the refresh
            // Don't show warning - cache invalidation will ensure images are fetched
            setIsFinalizing(false);
          }
        }
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    uppyRef.current = uppy;

    // Track pause state - rely on Uppy's native file.isPaused property
    // Uppy manages pause state internally, we just sync our UI
    const updatePauseState = () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      const paused = checkIfAnyFileIsPaused(uppy);
      setIsPaused(paused);
    };

    // Listen to events that affect pause state
    // upload-progress fires during upload (includes pause state changes)
    // upload fires when upload starts
    // We update pause state on these events to keep UI in sync
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    uppy.on("upload-progress", updatePauseState);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    uppy.on("upload", updatePauseState);

    // Also update pause state whenever files change (add/remove)
    // This helps catch state changes after multiple pause/resume cycles
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    uppy.on("file-removed", updatePauseState);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    uppy.on("file-added", updatePauseState);

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      uppy.off("upload-progress", updatePauseState);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      uppy.off("upload", updatePauseState);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      uppy.off("file-removed", updatePauseState);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      uppy.off("file-added", updatePauseState);
      uppyRef.current?.cancelAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.galleryId, config.orderId, config.type]);

  const startUpload = useCallback(() => {
    if (!uppyRef.current) {
      return;
    }

    const files = Object.values(uppyRef.current.getFiles());
    if (files.length === 0) {
      showToast("info", "Info", "Wybierz pliki do przesłania");
      return;
    }

    // Reset cancellation flag when starting a new upload
    isCancellingRef.current = false;

    if (uploadComplete) {
      setUploadComplete(false);
      setUploadResult(null);
    }

    // Uppy will manage uploading state through file.progress.uploadStarted
    // We set uploading to true here, and it will be maintained by Uppy's events
    setUploading(true);
    setIsPaused(false);
    setUploadProgress({ ...INITIAL_PROGRESS, total: files.length });

    // Track upload start time for statistics
    uploadStartTimeRef.current = Date.now();
    setUploadStats(null); // Reset stats for new upload

    // Start upload - Uppy will manage the upload state
    uppyRef.current.upload().catch(() => {
      // If upload fails to start, reset state
      setUploading(false);
      setIsPaused(false);
      uploadStartTimeRef.current = null;
      setUploadStats(null);
      showToast("error", "Błąd", "Nie udało się rozpocząć przesyłania");
    });
  }, [showToast, uploadComplete]);

  const cancelUpload = useCallback(async () => {
    if (!uppyRef.current) {
      return;
    }

    // Get all files from Uppy's current state - check all files that have s3KeyShort
    // This is simpler and more robust - we don't need to track anything
    const allFiles = Object.values(uppyRef.current.getFiles());
    const filesWithS3Key = allFiles.filter((file) => {
      const s3KeyShort = file.meta?.s3KeyShort;
      return !!s3KeyShort;
    });

    // Set cancellation flag BEFORE cancelling to ignore the complete event that cancelAll() triggers
    isCancellingRef.current = true;
    uppyRef.current.cancelAll();
    uppyRef.current.clear();

    setUploading(false);
    setIsPaused(false);
    setUploadComplete(false);
    setUploadResult(null);
    setUploadProgress(INITIAL_PROGRESS);
    setUploadStats(null);
    uploadStartTimeRef.current = null;

    // Attempt to delete all files with s3KeyShort from S3
    // Silently ignore errors (files that don't exist, network errors, etc.)
    if (filesWithS3Key.length > 0) {
      const { galleryId, orderId, type, reloadGallery } = configRef.current;

      try {
        // Extract filenames from s3KeyShort for all files
        // Format: originals/{filename} or final/{orderId}/{filename}
        const filenames = filesWithS3Key
          .map((file) => {
            const s3KeyShort = file.meta?.s3KeyShort;
            if (!s3KeyShort || typeof s3KeyShort !== "string") {
              return null;
            }
            const parts = s3KeyShort.split("/");
            return parts[parts.length - 1];
          })
          .filter((filename): filename is string => filename !== null);

        if (filenames.length === 0) {
          return;
        }

        let deletionSucceeded = false;
        if (type === "finals" && orderId) {
          // Delete final images in batch
          // NOTE: This direct API call is necessary for Uppy to work and should not be refactored to React Query.
          // Uppy's cancelUpload requires synchronous cleanup during upload cancellation lifecycle.
          try {
            await api.orders.deleteFinalImage(galleryId, orderId, filenames);
            deletionSucceeded = true;
          } catch {
            // Silently ignore - files might not exist or already deleted
          }
        } else {
          // Delete original images in batch
          // NOTE: This direct API call is necessary for Uppy to work and should not be refactored to React Query.
          // Uppy's cancelUpload requires synchronous cleanup during upload cancellation lifecycle.
          try {
            await api.galleries.deleteImage(galleryId, filenames);
            deletionSucceeded = true;
          } catch {
            // Silently ignore - files might not exist or already deleted
          }
        }

        // Reload gallery after successful deletion to sync state (originalsBytesUsed, image list, etc.)
        // This ensures UI reflects the actual state after cancellation cleanup
        if (deletionSucceeded && reloadGallery) {
          // Use setTimeout to ensure deletion completes before reload
          setTimeout(() => {
            void reloadGallery().catch(() => {
              // Silently ignore reload errors - gallery will sync on next manual refresh
            });
          }, 500);
        }
      } catch {
        // Silently ignore all errors
      }
    }

    // Reset cancellation flag after a brief delay to allow any pending events to be ignored
    setTimeout(() => {
      isCancellingRef.current = false;
    }, 100);
  }, []);

  const pauseUpload = useCallback(() => {
    if (!uppyRef.current || !uploading) {
      return;
    }
    // Use Uppy's built-in pauseAll() method to pause all uploads at once
    // The event listeners will automatically update our pause state via updatePauseState
    uppyRef.current.pauseAll();

    // Also manually trigger pause state update to catch immediate changes
    // This helps ensure state is synced, especially after multiple pause/resume cycles
    const updatePauseState = () => {
      if (uppyRef.current) {
        const paused = checkIfAnyFileIsPaused(uppyRef.current);
        setIsPaused(paused);
      }
    };

    // Update immediately
    updatePauseState();

    // Update after delays to catch async state changes
    setTimeout(updatePauseState, 100);
    setTimeout(updatePauseState, 250);
  }, [uploading]);

  const resumeUpload = useCallback(() => {
    if (!uppyRef.current || !uploading) {
      return;
    }

    // Get all files and check their state before resuming
    // Always call resumeAll() - it's safe even if nothing is paused
    // Uppy will only resume files that are actually paused
    try {
      uppyRef.current.resumeAll();
    } catch (error) {
      // Error calling resumeAll - silently continue
    }

    // Also manually trigger a pause state update to catch immediate changes
    // This helps ensure state is synced, especially after multiple pause/resume cycles
    const updatePauseState = () => {
      if (uppyRef.current) {
        const paused = checkIfAnyFileIsPaused(uppyRef.current);
        setIsPaused(paused);
      }
    };

    // Update immediately
    updatePauseState();

    // Update after delays to catch async state changes
    // Multiple checks help with multiple pause/resume cycles
    setTimeout(updatePauseState, 100);
    setTimeout(updatePauseState, 250);
  }, [uploading]);

  const pauseResumeFile = useCallback((fileId: string) => {
    if (!uppyRef.current) {
      return;
    }
    uppyRef.current.pauseResume(fileId);
  }, []);

  const resetUploadState = useCallback(() => {
    setUploadComplete(false);
    setUploadResult(null);
    setUploadStats(null);
    setIsFinalizing(false);
    uploadStartTimeRef.current = null;
  }, []);

  return {
    uppy: uppyRef.current,
    uploading,
    uploadComplete,
    uploadResult,
    uploadProgress,
    uploadStats,
    isPaused,
    isFinalizing,
    isLoadingKeys,
    collisionPrompt,
    resolveCollisionChoice,
    addFilesWithCollisionCheck,
    startUpload,
    cancelUpload,
    pauseUpload,
    resumeUpload,
    pauseResumeFile,
    resetUploadState,
  };
}
