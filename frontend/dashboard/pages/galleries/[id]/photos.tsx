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
  const { getGalleryOrders, fetchGalleryImages, fetchGalleryOrders, updateOriginalsBytesUsed, currentGallery, refreshGalleryBytesOnly } =
    useGalleryStore();
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
    perImageProgress: handlerPerImageProgress,
    isUploadComplete,
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
    onUploadSuccess: (fileName, file, uploadedKey) => {
      // Optimistically update bytes used immediately after S3 upload succeeds
      // Images will appear when processing completes via onImagesUpdated
      if (file.size > 0) {
        updateOriginalsBytesUsed(file.size);
      }
    },
    onImagesUpdated: (updatedImages) => {
      // Simply set images when they're ready (have URLs from processing)
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
      // Bytes are updated optimistically and via refreshGalleryBytesOnly in useImagePolling
      // No need to reload entire gallery - images already updated via onImagesUpdated
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

    // Get image size for optimistic update in Redux
    const imageSize = image.size ?? 0;
    if (imageSize > 0) {
      // Optimistically update Redux store immediately (deduct file size)
      updateOriginalsBytesUsed(-imageSize);
    }

    try {
      await api.galleries.deleteImage(galleryId as string, imageKey);

      // Remove from deleting set and reload gallery if this was the last deletion
      setDeletingImages((prev) => {
        const updated = new Set(prev);
        updated.delete(imageKey);
        // If this was the last deletion, refresh bytes to sync with server (lightweight update)
        if (updated.size === 0 && galleryId) {
          void refreshGalleryBytesOnly(galleryId as string);
        }
        return updated;
      });

      showToast("success", "Sukces", "Zdjęcie zostało usunięte");
    } catch (err) {
      // On error, restore the image to the list and revert optimistic update
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

      // Revert optimistic update in Redux (add back the file size)
      const imageSize = image.size ?? 0;
      if (imageSize > 0) {
        updateOriginalsBytesUsed(imageSize);
      }

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

    // Get image size for optimistic update in Redux
    const imageSize = imageToDelete.size ?? 0;
    if (imageSize > 0) {
      // Optimistically update Redux store immediately (deduct file size)
      updateOriginalsBytesUsed(-imageSize);
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

      // Remove from deleting set and reload gallery if this was the last deletion
      setDeletingImages((prev) => {
        const updated = new Set(prev);
        updated.delete(imageKey);
        // If this was the last deletion, refresh bytes to sync with server (lightweight update)
        if (updated.size === 0 && galleryId) {
          void refreshGalleryBytesOnly(galleryId as string);
        }
        return updated;
      });

      showToast("success", "Sukces", "Zdjęcie zostało usunięte");
    } catch (err) {
      // On error, restore the image to the list and revert optimistic update
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

      // Revert optimistic update in Redux (add back the file size)
      const imageSize = imageToDelete.size ?? 0;
      if (imageSize > 0) {
        updateOriginalsBytesUsed(imageSize);
      }

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
                  bytesUsed={currentGallery?.originalsBytesUsed ?? gallery?.originalsBytesUsed ?? 0}
                  limitBytes={gallery?.originalsLimitBytes}
                  label="Oryginały"
                  isLoading={galleryLoading}
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
