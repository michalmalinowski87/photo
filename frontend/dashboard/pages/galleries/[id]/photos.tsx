import { useRouter } from "next/router";
import { useState, useEffect, useRef, useCallback } from "react";

import { LimitExceededModal } from "../../../components/galleries/LimitExceededModal";
import { NextStepsOverlay } from "../../../components/galleries/NextStepsOverlay";
import { ConfirmDialog } from "../../../components/ui/confirm/ConfirmDialog";
import { FullPageLoading, Loading } from "../../../components/ui/loading/Loading";
import { RetryableImage } from "../../../components/ui/RetryableImage";
import { FileUploadZone } from "../../../components/upload/FileUploadZone";
import { usePhotoUploadHandler } from "../../../components/upload/PhotoUploadHandler";
import { StorageDisplay } from "../../../components/upload/StorageDisplay";
import {
  UploadProgressOverlay,
  type PerImageProgress,
} from "../../../components/upload/UploadProgressOverlay";
import { useGallery } from "../../../context/GalleryContext";
import { useToast } from "../../../hooks/useToast";
import api, { formatApiError } from "../../../lib/api-service";
import { initializeAuth, redirectToLandingSignIn } from "../../../lib/auth-init";
import { applyOptimisticUpdate, calculateSizeDelta } from "../../../lib/optimistic-updates";
import { useGalleryStore } from "../../../store/gallerySlice";

interface GalleryImage {
  id?: string;
  key?: string;
  filename?: string;
  url?: string;
  thumbUrl?: string;
  thumbUrlFallback?: string;
  previewUrl?: string;
  previewUrlFallback?: string;
  isPlaceholder?: boolean;
  uploadTimestamp?: number;
  uploadIndex?: number;
  size?: number;
  lastModified?: number;
  [key: string]: unknown;
}

interface Gallery {
  galleryId: string;
  originalsLimitBytes?: number;
  finalsLimitBytes?: number;
  originalsBytesUsed?: number;
  finalsBytesUsed?: number;
  [key: string]: unknown;
}

interface ApiImage {
  key?: string;
  filename?: string;
  thumbUrl?: string;
  previewUrl?: string;
  url?: string;
  size?: number;
  lastModified?: number;
  [key: string]: unknown;
}

interface Order {
  orderId: string;
  deliveryStatus?: string;
  selectedKeys?: string[] | string;
  [key: string]: unknown;
}

// UploadProgress interface is imported from PhotoUploadHandler

// Lazy loading wrapper component using Intersection Observer
const LazyImage: React.FC<{ src: string; children: (src: string | null) => React.ReactNode }> = ({
  src,
  children,
}) => {
  const [isInView, setIsInView] = useState<boolean>(false);
  const imgRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "50px" } // Start loading 50px before entering viewport
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={imgRef} className="w-full h-full">
      {isInView ? children(src) : children(null)}
    </div>
  );
};

export default function GalleryPhotos() {
  const router = useRouter();
  const { id: galleryId } = router.query;
  const { showToast } = useToast();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { gallery: galleryRaw, loading: galleryLoading, reloadGallery } = useGallery();
  const gallery = galleryRaw && typeof galleryRaw === "object" ? (galleryRaw as Gallery) : null;
  const { getGalleryOrders, fetchGalleryImages, fetchGalleryOrders } = useGalleryStore();
  const [loading, setLoading] = useState<boolean>(true);
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const pollingActiveRef = useRef<boolean>(false); // Track if polling is active
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Track polling timeout
  const [approvedSelectionKeys, setApprovedSelectionKeys] = useState<Set<string>>(new Set()); // Images in approved/preparing orders (cannot delete)
  const [allOrderSelectionKeys, setAllOrderSelectionKeys] = useState<Set<string>>(new Set()); // Images in ANY order (show "Selected")
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [imageToDelete, setImageToDelete] = useState<GalleryImage | null>(null);
  const [deletingImages, setDeletingImages] = useState<Set<string>>(new Set()); // Track which images are being deleted
  const deletingImagesRef = useRef<Set<string>>(new Set()); // Ref for closures
  const deletedImageKeysRef = useRef<Set<string>>(new Set()); // Ref for closures
  const [perImageProgress, setPerImageProgress] = useState<PerImageProgress[]>([]);
  const [isOverlayDismissed, setIsOverlayDismissed] = useState(false);
  const [optimisticOriginalsBytes, setOptimisticOriginalsBytes] = useState<number | null>(null);
  const clearOptimisticStateTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Track timeout to cancel if needed
  const galleryRef = useRef(gallery); // Track latest gallery value to avoid stale closures
  const [limitExceededData, setLimitExceededData] = useState<{
    uploadedSizeBytes: number;
    originalsLimitBytes: number;
    excessBytes: number;
    nextTierPlan?: string;
    nextTierPriceCents?: number;
    nextTierLimitBytes?: number;
    isSelectionGallery?: boolean;
  } | null>(null);
  const {
    handleFileSelect,
    uploading,
    uploadProgress,
    perImageProgress: handlerPerImageProgress,
    isUploadComplete,
    cancelUpload,
  } = usePhotoUploadHandler({
    galleryId: galleryId as string,
    type: "originals",
    getInitialImageCount: () => images.length,
    onPerImageProgress: (progress) => {
      setPerImageProgress(progress);
      // Reset dismissed state when new upload starts
      if (progress.length > 0 && progress.some((p) => p.status === "uploading")) {
        setIsOverlayDismissed(false);
      }
    },
    onImagesUpdated: (updatedImages) => {
      // Simple: just set images - handler only calls this when images are ready (have URLs)
      const validApiImages = updatedImages.filter((img: GalleryImage) => {
        const imgKey = img.key ?? img.filename;
        if (!imgKey) {
          return false;
        }
        if (deletingImagesRef.current.has(imgKey)) {
          return false;
        }
        if (deletedImageKeysRef.current.has(imgKey)) {
          return false;
        }
        return true;
      });

      // Only update if we have valid images with URLs
      if (validApiImages.length > 0) {
        setImages(validApiImages);
      }
    },
    onValidationNeeded: (data) => {
      setLimitExceededData(data);
    },
    reloadGallery: async () => {
      // Only reload gallery metadata (not images) - images are already updated via onImagesUpdated
      // This is just to refresh gallery byte usage, not to reload images
      await reloadGallery();
    },
    deletingImagesRef,
    deletedImageKeysRef,
  });

  // Define functions first (before useEffect hooks that use them)
  const handleDeleteConfirmDirect = async (image: GalleryImage): Promise<void> => {
    const imageKey = image.key ?? image.filename;

    if (!imageKey || !galleryId) {
      return;
    }

    // Prevent duplicate deletions
    if (deletingImages.has(imageKey)) {
      return;
    }

    // Mark image as being deleted
    setDeletingImages((prev) => new Set(prev).add(imageKey));

    // Find image index before removing it (for error recovery)
    const imageIndex = images.findIndex((img) => (img.key ?? img.filename) === imageKey);

    // Optimistically remove image from local state immediately
    setImages((prevImages) => prevImages.filter((img) => (img.key ?? img.filename) !== imageKey));

    // Get image size for optimistic update
    const imageSize = image.size ?? 0;
    const sizeDelta = calculateSizeDelta(imageSize, true); // true = deletion

    // Apply optimistic update immediately (before API call)
    if (sizeDelta !== undefined && galleryId) {
      applyOptimisticUpdate({
        type: "originals",
        galleryId: galleryId as string,
        sizeDelta,
        isUpload: false, // This is a deletion
        logContext: "photos.tsx handleDeleteConfirmDirect",
      });
    }

    try {
      await api.galleries.deleteImage(galleryId as string, imageKey);

      // Only reload if no other deletions are in progress (to avoid race conditions)
      setDeletingImages((prev) => {
        const updated = new Set(prev);
        updated.delete(imageKey);
        // If this was the last deletion, reload gallery data
        if (updated.size === 0) {
          // Cancel any pending clear timeout - we're about to reload and clear explicitly
          if (clearOptimisticStateTimeoutRef.current) {
            clearTimeout(clearOptimisticStateTimeoutRef.current);
            clearOptimisticStateTimeoutRef.current = null;
          }

          // Use setTimeout to ensure state update completes before reload
          setTimeout(async () => {
            await reloadGallery();
            // Clear optimistic bytes explicitly when all deletions are complete
            // This ensures the sidebar shows 0 bytes even if suppression was active
            setOptimisticOriginalsBytes(0);
            // Dispatch event to trigger sidebar update
            if (typeof window !== "undefined" && galleryId) {
              window.dispatchEvent(
                new CustomEvent("galleryUpdated", {
                  detail: { galleryId }, // Refresh event - sidebar will clear optimistic bytes when it sees gallery has 0 bytes
                })
              );
            }
          }, 0);
        }
        return updated;
      });

      showToast("success", "Sukces", "Zdjęcie zostało usunięte");
    } catch (err) {
      // On error, restore the image to the list
      setImages((prevImages) => {
        const restored = [...prevImages];
        // Insert image back at its original position
        if (imageIndex >= 0 && imageIndex < restored.length) {
          restored.splice(imageIndex, 0, image);
        } else {
          restored.push(image);
        }
        return restored;
      });

      // Remove from deleting set
      setDeletingImages((prev) => {
        const updated = new Set(prev);
        updated.delete(imageKey);
        return updated;
      });

      showToast("error", "Błąd", formatApiError(err));
    }
  };

  // Define functions first (before useEffect hooks that use them)
  // Load images from store (checks cache first, fetches if needed)
  const loadPhotos = useCallback(
    async (silent: boolean = false): Promise<void> => {
      if (!galleryId) {
        return;
      }

      if (!silent) {
        setLoading(true);
      }

      try {
        // Use store action - checks cache first, fetches if needed
        const apiImages = await fetchGalleryImages(galleryId as string);

        // Map images to GalleryImage format
        const mappedImages: GalleryImage[] = apiImages.map((img: ApiImage) => ({
          key: img.key,
          filename: img.filename,
          thumbUrl: img.thumbUrl,
          previewUrl: img.previewUrl,
          url: img.url,
          size: img.size,
          lastModified: img.lastModified,
          isPlaceholder: false,
        }));
        setImages(mappedImages);
      } catch (err) {
        if (!silent) {
          const errorMsg = formatApiError(err);
          showToast("error", "Błąd", errorMsg ?? "Nie udało się załadować zdjęć");
        }
        console.error("[GalleryPhotos] Failed to load photos:", err);
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [galleryId, showToast, fetchGalleryImages]
  );

  const loadApprovedSelections = useCallback(async (): Promise<void> => {
    if (!galleryId) {
      return;
    }

    try {
      // Use store action - checks cache first, fetches if needed
      const ordersData = await fetchGalleryOrders(galleryId as string);
      setOrders(ordersData);

      // Find orders with CLIENT_APPROVED or PREPARING_DELIVERY status (cannot delete)
      const approvedOrders = ordersData.filter(
        (o) => o.deliveryStatus === "CLIENT_APPROVED" || o.deliveryStatus === "PREPARING_DELIVERY"
      );

      // Collect all selected keys from approved orders
      const approvedKeys = new Set<string>();
      approvedOrders.forEach((order) => {
        const selectedKeys = Array.isArray(order.selectedKeys)
          ? order.selectedKeys
          : typeof order.selectedKeys === "string"
            ? (JSON.parse(order.selectedKeys) as string[])
            : [];
        selectedKeys.forEach((key: string) => approvedKeys.add(key));
      });

      setApprovedSelectionKeys(approvedKeys);

      // Collect all selected keys from ANY order (for "Selected" display)
      const allOrderKeys = new Set<string>();
      ordersData.forEach((order) => {
        const selectedKeys = Array.isArray(order.selectedKeys)
          ? order.selectedKeys
          : typeof order.selectedKeys === "string"
            ? (JSON.parse(order.selectedKeys) as string[])
            : [];
        selectedKeys.forEach((key: string) => allOrderKeys.add(key));
      });

      setAllOrderSelectionKeys(allOrderKeys);
    } catch (_err) {
      // Don't show error toast - this is not critical
    }
  }, [galleryId, fetchGalleryOrders]);

  // Initialize auth and load data
  useEffect(() => {
    initializeAuth(
      () => {
        if (galleryId) {
          void loadPhotos();
          void loadApprovedSelections();
        }
      },
      () => {
        const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
        if (galleryIdStr) {
          redirectToLandingSignIn(`/galleries/${galleryIdStr}/photos`);
        }
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId]); // Only depend on galleryId, not on the callback functions to avoid infinite loops

  // Listen for gallery updates to update originalsBytesUsed reactively with optimistic updates
  useEffect(() => {
    if (!galleryId) {
      return undefined;
    }

    const handleGalleryUpdate = (event?: Event) => {
      const customEvent = event as
        | CustomEvent<{ galleryId?: string; sizeDelta?: number; isUpload?: boolean }>
        | undefined;
      console.log("[photos.tsx] galleryUpdated event received:", {
        eventGalleryId: customEvent?.detail?.galleryId,
        currentGalleryId: galleryId,
        sizeDelta: customEvent?.detail?.sizeDelta,
        isUpload: customEvent?.detail?.isUpload,
      });

      // Only handle updates for this gallery
      if (customEvent?.detail?.galleryId !== galleryId) {
        console.log("[photos.tsx] Event galleryId mismatch, ignoring");
        return;
      }

      // If sizeDelta is provided, update optimistically
      if (customEvent.detail?.sizeDelta !== undefined) {
        const sizeDelta = customEvent.detail.sizeDelta;
        console.log("[photos.tsx] Updating optimistic originals bytes, sizeDelta:", sizeDelta);

        // Cancel any pending clear timeout - we're still making changes
        if (clearOptimisticStateTimeoutRef.current) {
          clearTimeout(clearOptimisticStateTimeoutRef.current);
          clearOptimisticStateTimeoutRef.current = null;
        }

        // Optimistic update: immediately adjust bytes using functional update to avoid stale closures
        // This calculation works mathematically: newBytes = currentBytes + sizeDelta
        // We track optimistic value as a running total and only clear it when gallery reload confirms it matches
        setOptimisticOriginalsBytes((prev) => {
          // Always use prev (optimistic value) if available, otherwise fall back to gallery
          // This ensures we build on top of previous optimistic updates during rapid operations
          const currentGallery = galleryRef.current; // Use ref to get latest value
          const currentGalleryBytes = currentGallery?.originalsBytesUsed ?? 0;
          // CRITICAL: Use prev if available (even if it's 0), only fall back to gallery if prev is null
          // This prevents using stale gallery bytes during rapid operations
          const currentBytes = prev ?? currentGalleryBytes;
          const newBytes = Math.max(0, currentBytes + sizeDelta);
          console.log("[photos.tsx] Optimistic update calculation:", {
            prev,
            currentGalleryBytes,
            currentBytes,
            sizeDelta,
            newBytes,
          });
          return newBytes;
        });

        // For uploads, don't reload gallery here - useImagePolling will reload after all uploads complete
        // This prevents unnecessary API calls during rapid uploads (we have optimistic updates)
        // For deletions, don't reload here - the deletion handler will reload when all deletions are complete
        // Only clear optimistic state when operations are complete (handled by polling/deletion handlers)
      } else {
        // No sizeDelta - this is a refresh event (e.g., after polling completes or all deletions complete)
        // Clear optimistic state if it matches the gallery value (confirmed by reload)
        setOptimisticOriginalsBytes((prev) => {
          if (prev === null) {
            return null; // Already cleared
          }
          const currentGalleryBytes = galleryRef.current?.originalsBytesUsed ?? 0; // Use ref to get latest value
          // If gallery shows 0, clear optimistic state
          if (currentGalleryBytes === 0) {
            console.log(
              "[photos.tsx] Gallery shows 0 bytes after refresh, clearing optimistic state"
            );
            return null;
          }
          // If optimistic value matches gallery value (within small tolerance), clear it
          if (Math.abs(prev - currentGalleryBytes) < 1000) {
            // Close enough (within 1KB tolerance for rounding), clear optimistic state
            console.log(
              "[photos.tsx] Optimistic value matches gallery after refresh, clearing optimistic state",
              { prev, currentGalleryBytes }
            );
            return null;
          }
          // Keep optimistic value if it doesn't match (shouldn't happen after reload, but be safe)
          console.log(
            "[photos.tsx] Optimistic value doesn't match gallery after refresh, keeping optimistic state",
            { prev, currentGalleryBytes }
          );
          return prev;
        });
      }
    };

    if (typeof window !== "undefined") {
      console.log("[photos.tsx] Setting up galleryUpdated event listener");
      window.addEventListener("galleryUpdated", handleGalleryUpdate);
      return () => {
        console.log("[photos.tsx] Removing galleryUpdated event listener");
        window.removeEventListener("galleryUpdated", handleGalleryUpdate);
      };
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId]); // Only depend on galleryId to avoid re-creating listener

  // Cleanup polling and timeouts on unmount
  useEffect(() => {
    return () => {
      // Stop polling when component unmounts
      pollingActiveRef.current = false;
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
        pollingTimeoutRef.current = null;
      }
      // Clear optimistic state timeout
      if (clearOptimisticStateTimeoutRef.current) {
        clearTimeout(clearOptimisticStateTimeoutRef.current);
        clearOptimisticStateTimeoutRef.current = null;
      }
    };
  }, []);

  // handleFileSelect is now provided by usePhotoUploadHandler hook above

  const handleDeletePhotoClick = (image: GalleryImage): void => {
    const imageKey = image.key ?? image.filename;

    if (!imageKey) {
      return;
    }

    // Prevent deletion if already being deleted
    if (deletingImages.has(imageKey)) {
      return;
    }

    // Check if image is in approved selection
    if (approvedSelectionKeys.has(imageKey)) {
      showToast(
        "error",
        "Błąd",
        "Nie można usunąć zdjęcia, które jest częścią zatwierdzonej selekcji klienta"
      );
      return;
    }

    // Check if deletion confirmation is suppressed
    const suppressKey = "photo_delete_confirm_suppress";
    const suppressUntil = localStorage.getItem(suppressKey);
    if (suppressUntil) {
      const suppressUntilTime = parseInt(suppressUntil, 10);
      if (Date.now() < suppressUntilTime) {
        // Suppression is still active, proceed directly with deletion
        void handleDeleteConfirmDirect(image);
        return;
      } else {
        // Suppression expired, remove it
        localStorage.removeItem(suppressKey);
      }
    }

    setImageToDelete(image);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async (suppressChecked?: boolean): Promise<void> => {
    if (!imageToDelete) {
      return;
    }

    const imageKey = imageToDelete.key ?? imageToDelete.filename;

    if (!imageKey || !galleryId) {
      return;
    }

    // Prevent duplicate deletions
    if (deletingImages.has(imageKey)) {
      return;
    }

    // Mark image as being deleted
    setDeletingImages((prev) => new Set(prev).add(imageKey));

    // Find image index before removing it (for error recovery)
    const imageIndex = images.findIndex((img) => (img.key ?? img.filename) === imageKey);

    // Optimistically remove image from local state immediately
    setImages((prevImages) => prevImages.filter((img) => (img.key ?? img.filename) !== imageKey));

    // Get image size for optimistic update
    const imageSize = imageToDelete.size ?? 0;
    const sizeDelta = calculateSizeDelta(imageSize, true); // true = deletion

    // Apply optimistic update immediately (before API call)
    if (sizeDelta !== undefined && galleryId) {
      applyOptimisticUpdate({
        type: "originals",
        galleryId: galleryId as string,
        sizeDelta,
        isUpload: false, // This is a deletion
        logContext: "photos.tsx handleDeleteConfirm",
      });
    }

    try {
      await api.galleries.deleteImage(galleryId as string, imageKey);

      // Save suppression only after successful deletion
      if (suppressChecked) {
        const suppressKey = "photo_delete_confirm_suppress";
        const suppressUntil = Date.now() + 15 * 60 * 1000;
        localStorage.setItem(suppressKey, suppressUntil.toString());
      }

      setDeleteConfirmOpen(false);
      setImageToDelete(null);

      // Only reload if no other deletions are in progress (to avoid race conditions)
      setDeletingImages((prev) => {
        const updated = new Set(prev);
        updated.delete(imageKey);
        // If this was the last deletion, reload gallery data
        if (updated.size === 0) {
          // Cancel any pending clear timeout - we're about to reload
          if (clearOptimisticStateTimeoutRef.current) {
            clearTimeout(clearOptimisticStateTimeoutRef.current);
            clearOptimisticStateTimeoutRef.current = null;
          }

          // Use setTimeout to ensure state update completes before reload
          setTimeout(async () => {
            await reloadGallery();
            // After reload, clear optimistic state only if gallery value matches (or is 0)
            // This ensures we only clear when the calculation is confirmed correct
            // Note: gallery state will be updated by reloadGallery(), so we check after a brief delay
            setTimeout(() => {
              setOptimisticOriginalsBytes((prev) => {
                const currentGalleryBytes = galleryRef.current?.originalsBytesUsed ?? 0; // Use ref to get latest value
                // If gallery shows 0, clear optimistic state
                // Otherwise, only clear if optimistic value matches gallery value (within small tolerance for rounding)
                if (currentGalleryBytes === 0) {
                  console.log("[photos.tsx] Gallery shows 0 bytes, clearing optimistic state");
                  return null;
                }
                if (prev !== null && Math.abs(prev - currentGalleryBytes) < 1000) {
                  // Close enough (within 1KB tolerance for rounding), clear optimistic state
                  console.log(
                    "[photos.tsx] Optimistic value matches gallery, clearing optimistic state",
                    { prev, currentGalleryBytes }
                  );
                  return null;
                }
                // Keep optimistic value if it doesn't match (shouldn't happen, but be safe)
                console.log(
                  "[photos.tsx] Optimistic value doesn't match gallery, keeping optimistic state",
                  { prev, currentGalleryBytes }
                );
                return prev;
              });
            }, 50); // Small delay to ensure gallery state is updated after reload
            // Dispatch event to trigger sidebar update
            if (typeof window !== "undefined" && galleryId) {
              window.dispatchEvent(
                new CustomEvent("galleryUpdated", {
                  detail: { galleryId }, // Refresh event
                })
              );
            }
          }, 0);
        }
        return updated;
      });

      showToast("success", "Sukces", "Zdjęcie zostało usunięte");
    } catch (err) {
      // On error, restore the image to the list
      setImages((prevImages) => {
        const restored = [...prevImages];
        // Insert image back at its original position
        if (imageIndex >= 0 && imageIndex < restored.length) {
          restored.splice(imageIndex, 0, imageToDelete);
        } else {
          restored.push(imageToDelete);
        }
        return restored;
      });

      // Remove from deleting set
      setDeletingImages((prev) => {
        const updated = new Set(prev);
        updated.delete(imageKey);
        return updated;
      });

      showToast("error", "Błąd", formatApiError(err));
    }
  };

  // Gallery data comes from GalleryContext (provided by GalleryLayoutWrapper)
  if (galleryLoading) {
    return <FullPageLoading text="Ładowanie galerii..." />;
  }

  if (!gallery) {
    return null; // Error is handled by GalleryLayoutWrapper
  }

  const isImageInApprovedSelection = (image: GalleryImage): boolean => {
    const imageKey = image.key ?? image.filename;
    return imageKey ? approvedSelectionKeys.has(imageKey) : false;
  };

  const isImageInAnyOrder = (image: GalleryImage): boolean => {
    const imageKey = image.key ?? image.filename;
    return imageKey ? allOrderSelectionKeys.has(imageKey) : false;
  };

  return (
    <>
      {/* Next Steps Overlay */}
      <NextStepsOverlay gallery={gallery} orders={orders} galleryLoading={galleryLoading} />

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Zdjęcia w galerii
          </h1>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {loading ? (
              <Loading size="sm" />
            ) : (
              <>
                {images.length}{" "}
                {images.length === 1 ? "zdjęcie" : images.length < 5 ? "zdjęcia" : "zdjęć"}
              </>
            )}
          </div>
        </div>

        {/* Upload Progress Bar */}
        {uploading && uploadProgress.total > 0 && (
          <div className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-3 flex-1">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      Przesyłanie zdjęć...
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {uploadProgress.current} / {uploadProgress.total}
                    </span>
                  </div>
                  {uploadProgress.currentFileName && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {uploadProgress.currentFileName}
                    </p>
                  )}
                  {/* UX IMPROVEMENT #4: Show upload speed and estimated time */}
                  {uploadProgress.uploadSpeed !== undefined && uploadProgress.uploadSpeed > 0 && (
                    <div className="flex items-center justify-between mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <span>{uploadProgress.uploadSpeed.toFixed(1)} zdj./s</span>
                      {uploadProgress.estimatedTimeRemaining !== undefined &&
                        uploadProgress.estimatedTimeRemaining > 0 && (
                          <span>
                            Pozostało: {Math.ceil(uploadProgress.estimatedTimeRemaining)}s
                          </span>
                        )}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={cancelUpload}
                className="ml-4 px-3 py-1.5 text-sm font-medium text-error-600 dark:text-error-400 hover:text-error-700 dark:hover:text-error-300 border border-error-300 dark:border-error-700 rounded-md hover:bg-error-50 dark:hover:bg-error-900/20 transition-colors"
              >
                Anuluj
              </button>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-brand-500 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${(uploadProgress.current / uploadProgress.total) * 100}%`,
                }}
              />
            </div>
            {uploadProgress.errors.length > 0 && (
              <div className="mt-2 text-xs text-error-600 dark:text-error-400">
                Błędy: {uploadProgress.errors.length} | Sukcesy: {uploadProgress.successes}
              </div>
            )}
          </div>
        )}

        {/* Drag and Drop Upload Area */}
        <FileUploadZone
          onFileSelect={handleFileSelect}
          uploading={uploading}
          accept="image/jpeg,image/png,image/jpg"
          multiple={true}
        >
          <div className="space-y-2">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
              aria-hidden="true"
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-semibold text-brand-600 dark:text-brand-400">
                Kliknij aby przesłać
              </span>{" "}
              lub przeciągnij i upuść
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-500">
              Obsługiwane formaty: JPEG, PNG
            </p>
            {gallery?.originalsLimitBytes && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <StorageDisplay
                  bytesUsed={optimisticOriginalsBytes ?? gallery.originalsBytesUsed ?? 0}
                  limitBytes={gallery.originalsLimitBytes}
                  label="Oryginały"
                  isLoading={optimisticOriginalsBytes !== null && galleryLoading}
                />
              </div>
            )}
          </div>
        </FileUploadZone>

        {/* Images Grid */}
        {loading ? (
          <div className="p-12 text-center bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
            <Loading size="lg" text="Ładowanie zdjęć..." />
          </div>
        ) : images.length === 0 ? (
          <div className="p-12 text-center bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
            <p className="text-gray-500 dark:text-gray-400">
              Brak zdjęć w galerii. Prześlij zdjęcia aby rozpocząć.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {images.map((img, idx) => {
              const isApproved = isImageInApprovedSelection(img);
              const isInAnyOrder = isImageInAnyOrder(img);
              const imageKey = img.key ?? img.filename ?? "";
              const imageSrc = img.thumbUrl ?? img.previewUrl ?? img.url ?? "";
              const isProcessing = !imageSrc; // No URL = still processing

              return (
                <div
                  key={imageKey ?? idx}
                  className="relative group border border-gray-200 rounded-lg overflow-hidden bg-white dark:bg-gray-800 dark:border-gray-700"
                >
                  <div className="aspect-square relative">
                    {isProcessing ? (
                      // Show "Processing..." if image has no URL yet
                      <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center rounded-lg">
                        <div className="text-center space-y-2">
                          <Loading size="sm" />
                          <div className="text-xs text-gray-500 dark:text-gray-400 px-2">
                            Przetwarzanie...
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <LazyImage src={imageSrc}>
                          {(lazySrc) =>
                            lazySrc ? (
                              <RetryableImage
                                src={lazySrc}
                                alt={imageKey}
                                className="w-full h-full object-cover rounded-lg"
                              />
                            ) : (
                              <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center rounded-lg">
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  Ładowanie...
                                </div>
                              </div>
                            )
                          }
                        </LazyImage>
                        {isApproved && (
                          <div className="absolute top-2 right-2 bg-success-500 text-white text-xs px-2 py-1 rounded z-20">
                            Zatwierdzone
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity flex items-center justify-center z-20">
                          {isInAnyOrder ? (
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 text-sm font-medium rounded-md bg-info-500 text-white">
                              Wybrane
                            </div>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeletePhotoClick(img);
                              }}
                              disabled={isApproved || deletingImages.has(imageKey)}
                              className={`opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 text-sm font-medium rounded-md ${
                                isApproved || deletingImages.has(imageKey)
                                  ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                                  : "bg-error-500 text-white hover:bg-error-600"
                              }`}
                              title={
                                isApproved
                                  ? "Nie można usunąć zdjęcia z zatwierdzonej selekcji"
                                  : deletingImages.has(imageKey)
                                    ? "Usuwanie..."
                                    : "Usuń zdjęcie"
                              }
                            >
                              {deletingImages.has(imageKey) ? "Usuwanie..." : "Usuń"}
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{imageKey}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Upload Progress Overlay */}
      {(() => {
        const currentProgress =
          handlerPerImageProgress.length > 0 ? handlerPerImageProgress : perImageProgress;

        if (currentProgress.length === 0 || isOverlayDismissed) {
          return null;
        }

        return (
          <UploadProgressOverlay
            images={currentProgress}
            isUploadComplete={isUploadComplete}
            onDismiss={() => {
              setIsOverlayDismissed(true);
              setPerImageProgress([]);
            }}
          />
        );
      })()}

      {/* Limit Exceeded Modal */}
      {limitExceededData && (
        <LimitExceededModal
          isOpen={!!limitExceededData}
          onClose={() => {
            setLimitExceededData(null);
          }}
          galleryId={galleryId as string}
          uploadedSizeBytes={limitExceededData.uploadedSizeBytes}
          originalsLimitBytes={limitExceededData.originalsLimitBytes}
          excessBytes={limitExceededData.excessBytes}
          nextTierPlan={limitExceededData.nextTierPlan}
          nextTierPriceCents={limitExceededData.nextTierPriceCents}
          nextTierLimitBytes={limitExceededData.nextTierLimitBytes}
          isSelectionGallery={limitExceededData.isSelectionGallery}
          onUpgrade={async () => {
            // Reload gallery after upgrade
            await reloadGallery();
            setLimitExceededData(null);
          }}
          onCancel={() => {
            // TODO: Implement file removal
            setLimitExceededData(null);
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => {
          const imageKey = imageToDelete?.key ?? imageToDelete?.filename;
          if (!imageKey || !deletingImages.has(imageKey)) {
            setDeleteConfirmOpen(false);
            setImageToDelete(null);
          }
        }}
        onConfirm={handleDeleteConfirm}
        title="Usuń zdjęcie"
        message={
          imageToDelete
            ? `Czy na pewno chcesz usunąć zdjęcie "${imageToDelete.key ?? imageToDelete.filename}"?\nTa operacja jest nieodwracalna.`
            : ""
        }
        confirmText="Usuń"
        cancelText="Anuluj"
        variant="danger"
        loading={
          imageToDelete
            ? deletingImages.has(imageToDelete.key ?? imageToDelete.filename ?? "")
            : false
        }
        suppressKey="photo_delete_confirm_suppress"
      />

      {/* Debug: Show suppression status and allow manual clearing (only in development) */}
      {process.env.NODE_ENV === "development" && (
        <div className="fixed bottom-4 left-4 bg-gray-100 dark:bg-gray-800 p-2 rounded text-xs border border-gray-300 dark:border-gray-600">
          <div className="text-gray-600 dark:text-gray-400 mb-1">
            Suppression:{" "}
            {(() => {
              const suppressKey = "photo_delete_confirm_suppress";
              const suppressUntil = localStorage.getItem(suppressKey);
              if (suppressUntil) {
                const suppressUntilTime = parseInt(suppressUntil, 10);
                const isActive = Date.now() < suppressUntilTime;
                const remaining = Math.max(0, suppressUntilTime - Date.now());
                const minutes = Math.floor(remaining / 60000);
                const seconds = Math.floor((remaining % 60000) / 1000);
                return isActive ? `Active (${minutes}m ${seconds}s remaining)` : "Expired";
              }
              return "Not set";
            })()}
          </div>
          <button
            onClick={() => {
              localStorage.removeItem("photo_delete_confirm_suppress");
              showToast("success", "Cleared", "Suppression flag cleared");
            }}
            className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
          >
            Clear Suppression
          </button>
        </div>
      )}
    </>
  );
}
