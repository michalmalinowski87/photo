import { useRouter } from "next/router";
import { useState, useEffect, useRef, useCallback } from "react";

import { LimitExceededModal } from "../../../components/galleries/LimitExceededModal";
import { ConfirmDialog } from "../../../components/ui/confirm/ConfirmDialog";
import { FullPageLoading, Loading } from "../../../components/ui/loading/Loading";
import { RetryableImage } from "../../../components/ui/RetryableImage";
import { FileUploadZone } from "../../../components/upload/FileUploadZone";
import { StorageDisplay } from "../../../components/upload/StorageDisplay";
import { usePhotoUploadHandler } from "../../../components/upload/PhotoUploadHandler";
import {
  UploadProgressOverlay,
  type PerImageProgress,
} from "../../../components/upload/UploadProgressOverlay";
import { useGallery } from "../../../context/GalleryContext";
import { useToast } from "../../../hooks/useToast";
import api, { formatApiError } from "../../../lib/api-service";
import { initializeAuth, redirectToLandingSignIn } from "../../../lib/auth-init";

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
  const [loading, setLoading] = useState<boolean>(true);
  const [images, setImages] = useState<GalleryImage[]>([]);
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

    // Dispatch optimistic update event immediately (before API call)
    // Always dispatch the event, even if size is 0, so components know a deletion happened
    // Components can handle the case where sizeDelta is 0 or undefined
    if (typeof window !== "undefined" && galleryId) {
      const sizeDelta = imageSize > 0 ? -imageSize : undefined;
      console.log("[photos.tsx] Dispatching deletion event:", {
        galleryId,
        imageSize,
        sizeDelta,
      });
      window.dispatchEvent(
        new CustomEvent("galleryUpdated", {
          detail: {
            galleryId,
            sizeDelta, // Negative for deletion, undefined if size unknown
          },
        })
      );
    }

    try {
      await api.galleries.deleteImage(galleryId as string, imageKey);

      // Only reload if no other deletions are in progress (to avoid race conditions)
      setDeletingImages((prev) => {
        const updated = new Set(prev);
        updated.delete(imageKey);
        // If this was the last deletion, reload gallery data
        if (updated.size === 0) {
          // Use setTimeout to ensure state update completes before reload
          setTimeout(async () => {
            await reloadGallery();
            // Also dispatch event manually to ensure components are notified
            if (typeof window !== "undefined" && galleryId) {
              window.dispatchEvent(new CustomEvent("galleryUpdated", { detail: { galleryId } }));
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
  // Simple: Load images directly from API - no placeholders, no merging
  const loadPhotos = useCallback(
    async (silent: boolean = false): Promise<void> => {
      if (!galleryId) {
        return;
      }

      if (!silent) {
        setLoading(true);
      }

      try {
        const photosResponse = await api.galleries.getImages(galleryId as string);
        const apiImages = (photosResponse.images ?? []) as ApiImage[];

        // API response is single source of truth - just set it directly
        const mappedImages: GalleryImage[] = apiImages.map((img) => ({
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
    [galleryId, showToast]
  );

  const loadApprovedSelections = useCallback(async (): Promise<void> => {
    if (!galleryId) {
      return;
    }

    try {
      const ordersResponse = await api.orders.getByGallery(galleryId as string);

      const orders = (ordersResponse?.items ?? []) as Order[];

      // Find orders with CLIENT_APPROVED or PREPARING_DELIVERY status (cannot delete)
      const approvedOrders = orders.filter(
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
      orders.forEach((order) => {
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
  }, [galleryId]);

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
      const customEvent = event as CustomEvent<{ galleryId?: string; sizeDelta?: number }>;
      console.log("[photos.tsx] galleryUpdated event received:", {
        eventGalleryId: customEvent.detail?.galleryId,
        currentGalleryId: galleryId,
        sizeDelta: customEvent.detail?.sizeDelta,
      });

      // Only handle updates for this gallery
      if (customEvent.detail?.galleryId !== galleryId) {
        console.log("[photos.tsx] Event galleryId mismatch, ignoring");
        return;
      }

      // If sizeDelta is provided, update optimistically
      if (customEvent.detail?.sizeDelta !== undefined) {
        const sizeDelta = customEvent.detail.sizeDelta;
        console.log("[photos.tsx] Updating optimistic originals bytes, sizeDelta:", sizeDelta);
        
        // Optimistic update: immediately adjust bytes using functional update to avoid stale closures
        setOptimisticOriginalsBytes((prev) => {
          // Get current gallery state from the latest state
          const currentGallery = gallery;
          const currentGalleryBytes = (currentGallery?.originalsBytesUsed as number | undefined) ?? 0;
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

        // Reload gallery in background to get accurate data (but don't clear optimistic state immediately)
        // Clear optimistic state after a delay to allow API to catch up
        void reloadGallery().then(() => {
          console.log("[photos.tsx] Gallery reloaded, clearing optimistic state in 2s");
          // Wait a bit before clearing to ensure API has updated
          setTimeout(() => {
            setOptimisticOriginalsBytes((prev) => {
              // Only clear if we still have optimistic state (don't clear if user uploaded more)
              if (prev !== null) {
                console.log("[photos.tsx] Clearing optimistic state");
                return null;
              }
              return prev;
            });
          }, 2000);
        });
      } else {
        // No sizeDelta, just reload to get fresh data
        void reloadGallery();
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

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      // Stop polling when component unmounts
      pollingActiveRef.current = false;
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
        pollingTimeoutRef.current = null;
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

    // Dispatch optimistic update event immediately (before API call)
    // Always dispatch the event, even if size is 0, so components know a deletion happened
    // Components can handle the case where sizeDelta is 0 or negative
    if (typeof window !== "undefined" && galleryId) {
      window.dispatchEvent(
        new CustomEvent("galleryUpdated", {
          detail: {
            galleryId,
            sizeDelta: imageSize > 0 ? -imageSize : undefined, // Negative for deletion, undefined if size unknown
          },
        })
      );
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
          // Use setTimeout to ensure state update completes before reload
          setTimeout(() => {
            void reloadGallery();
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
                  bytesUsed={
                    optimisticOriginalsBytes ??
                    (gallery.originalsBytesUsed as number | undefined) ??
                    0
                  }
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
    </>
  );
}
