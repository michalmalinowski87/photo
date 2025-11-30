import { useGalleryStore } from "../store/gallerySlice";

export type OptimisticUpdateType = "originals" | "finals";

export interface ApplyOriginalsOptimisticUpdateParams {
  type: "originals";
  galleryId: string;
  sizeDelta: number;
  isUpload?: boolean; // Whether this is an upload (true) or deletion (false/undefined)
  logContext?: string;
}

export interface ApplyFinalsOptimisticUpdateParams {
  type: "finals";
  galleryId: string;
  sizeDelta: number;
  setOptimisticFinalsBytes: (value: number | null) => void;
  isUpload?: boolean; // Whether this is an upload (true) or deletion (false/undefined)
  logContext?: string;
}

export type ApplyOptimisticUpdateParams =
  | ApplyOriginalsOptimisticUpdateParams
  | ApplyFinalsOptimisticUpdateParams;

export interface RevertOriginalsOptimisticUpdateParams {
  type: "originals";
  galleryId: string;
  sizeDelta: number;
  logContext?: string;
}

export interface RevertFinalsOptimisticUpdateParams {
  type: "finals";
  galleryId: string;
  sizeDelta: number;
  setOptimisticFinalsBytes: (value: number | null) => void;
  logContext?: string;
}

export type RevertOptimisticUpdateParams =
  | RevertOriginalsOptimisticUpdateParams
  | RevertFinalsOptimisticUpdateParams;

/**
 * Applies an optimistic update for gallery storage bytes.
 * For originals: dispatches galleryUpdated event
 * For finals: updates Zustand store and local state
 */
export function applyOptimisticUpdate(params: ApplyOptimisticUpdateParams): void {
  if (typeof window === "undefined") {
    return;
  }

  const { galleryId, sizeDelta } = params;

  if (params.type === "originals") {
    // For originals, update store optimistically (like finals)
    const isUpload = params.isUpload ?? sizeDelta > 0; // Positive delta = upload, negative = deletion
    console.log(`[${params.logContext ?? "optimistic-updates"}] Applying originals optimistic update:`, {
      galleryId,
      sizeDelta,
      isUpload,
    });

    // Update Zustand store optimistically
    const storeState = useGalleryStore.getState();
    if (storeState.currentGallery?.galleryId === galleryId) {
      (storeState as { updateOriginalsBytesUsed?: (delta: number) => void }).updateOriginalsBytesUsed?.(
        sizeDelta
      );
    }
  } else {
    // For finals, update store, local state, and dispatch event
    const { setOptimisticFinalsBytes } = params;

    // Update Zustand store optimistically
    const storeState = useGalleryStore.getState();
    const beforeFinalsBytes = storeState.currentGallery?.finalsBytesUsed as number | undefined;
    
    // eslint-disable-next-line no-console
    console.log(`[${params.logContext ?? "optimistic-updates"}] Applying finals optimistic update:`, {
      galleryId,
      sizeDelta,
      beforeFinalsBytes: beforeFinalsBytes ?? 0,
      expectedNewValue: (beforeFinalsBytes ?? 0) + sizeDelta,
    });

    if (storeState.currentGallery?.galleryId === galleryId) {
      (storeState as { updateFinalsBytesUsed?: (delta: number) => void }).updateFinalsBytesUsed?.(
        sizeDelta
      );
      const newStoreValue = useGalleryStore.getState().currentGallery?.finalsBytesUsed as
        | number
        | undefined;
      // eslint-disable-next-line no-console
      console.log(
        `[${params.logContext ?? "optimistic-updates"}] Updated store, new value:`,
        newStoreValue,
        `(was ${beforeFinalsBytes ?? 0}, added ${sizeDelta})`
      );

      // Update optimistic state to match store
      setOptimisticFinalsBytes(newStoreValue ?? null);
    }

    // Store update will trigger re-renders automatically via Zustand subscriptions
  }
}

/**
 * Reverts an optimistic update for gallery storage bytes.
 * This should be called when an operation fails after applying an optimistic update.
 */
export function revertOptimisticUpdate(params: RevertOptimisticUpdateParams): void {
  if (typeof window === "undefined") {
    return;
  }

  const { galleryId, sizeDelta } = params;
  const revertDelta = -sizeDelta; // Opposite of original delta

  if (params.type === "originals") {
    // For originals, revert store update
    console.log(`[${params.logContext ?? "optimistic-updates"}] Reverting originals optimistic update:`, {
      galleryId,
      originalSizeDelta: sizeDelta,
      revertDelta,
    });

    // Revert store update (add back the size)
    const storeState = useGalleryStore.getState();
    if (storeState.currentGallery?.galleryId === galleryId) {
      (storeState as { updateOriginalsBytesUsed?: (delta: number) => void }).updateOriginalsBytesUsed?.(
        revertDelta
      ); // Revert by adding back
    }
  } else {
    // For finals, revert store, local state, and dispatch event
    const { setOptimisticFinalsBytes } = params;

    console.log(`[${params.logContext ?? "optimistic-updates"}] Reverting finals optimistic update:`, {
      galleryId,
      originalSizeDelta: sizeDelta,
      revertDelta,
    });

    // Revert store update (add back the size)
    const storeState = useGalleryStore.getState();
    if (storeState.currentGallery?.galleryId === galleryId) {
      (storeState as { updateFinalsBytesUsed?: (delta: number) => void }).updateFinalsBytesUsed?.(
        revertDelta
      ); // Revert by adding back
      const newStoreValue = useGalleryStore.getState().currentGallery?.finalsBytesUsed as
        | number
        | undefined;
      console.log(
        `[${params.logContext ?? "optimistic-updates"}] Reverted store, new value:`,
        newStoreValue
      );

      // Revert optimistic state
      setOptimisticFinalsBytes(newStoreValue ?? null);
    }

    // Store update will trigger re-renders automatically via Zustand subscriptions
  }
}

/**
 * Helper to calculate sizeDelta from image size.
 * Returns undefined if size is 0 or unknown (for deletions where size might not be available).
 */
export function calculateSizeDelta(
  imageSize: number | undefined,
  isDeletion: boolean = false
): number | undefined {
  if (imageSize === undefined || imageSize === 0) {
    return undefined;
  }
  return isDeletion ? -imageSize : imageSize;
}
