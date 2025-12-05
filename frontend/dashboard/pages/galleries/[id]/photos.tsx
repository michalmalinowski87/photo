import { Plus, ChevronDown, Image, Upload } from "lucide-react";
import { useRouter } from "next/router";
import { useState, useEffect, useCallback, useRef } from "react";

import { LimitExceededModal } from "../../../components/galleries/LimitExceededModal";
import { NextStepsOverlay } from "../../../components/galleries/NextStepsOverlay";
import Badge from "../../../components/ui/badge/Badge";
import { ConfirmDialog } from "../../../components/ui/confirm/ConfirmDialog";
import { EmptyState } from "../../../components/ui/empty-state/EmptyState";
import { LazyRetryableImage } from "../../../components/ui/LazyRetryableImage";
import { FullPageLoading, Loading } from "../../../components/ui/loading/Loading";
import { UppyUploadModal } from "../../../components/uppy/UppyUploadModal";
import { useGallery } from "../../../hooks/useGallery";
import { useOriginalImageDelete } from "../../../hooks/useOriginalImageDelete";
import { usePageLogger } from "../../../hooks/usePageLogger";
import { useToast } from "../../../hooks/useToast";
import { formatApiError } from "../../../lib/api-service";
import { removeFileExtension } from "../../../lib/filename-utils";
import { ImageFallbackUrls } from "../../../lib/image-fallback";
import { storeLogger } from "../../../lib/store-logger";
import { useGalleryStore } from "../../../store";

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
  thumbUrlFallback?: string;
  previewUrl?: string;
  previewUrlFallback?: string;
  bigThumbUrl?: string;
  bigThumbUrlFallback?: string;
  url?: string;
  finalUrl?: string;
  size?: number;
  lastModified?: number | string;
  [key: string]: unknown;
}

// UploadProgress interface is imported from PhotoUploadHandler

export default function GalleryPhotos() {
  const router = useRouter();
  const { id: galleryId } = router.query;
  const { showToast } = useToast();
  const { logDataLoad, logDataLoaded, logDataError, logUserAction, logSkippedLoad } = usePageLogger(
    {
      pageName: "GalleryPhotos",
    }
  );
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { gallery: galleryRaw, loading: galleryLoading, reloadGallery } = useGallery();
  const gallery = galleryRaw && typeof galleryRaw === "object" ? (galleryRaw as Gallery) : null;
  const {
    fetchGalleryImages,
    fetchGalleryOrders,
    galleryCreationLoading,
    setGalleryCreationLoading,
  } = useGalleryStore();
  // Don't start loading until galleryId is available from router
  const [loading, setLoading] = useState<boolean>(true);
  const [images, setImages] = useState<GalleryImage[]>([]);
  // Track loaded galleryId for stable comparison (prevents re-renders from object reference changes)
  const loadedGalleryIdRef = useRef<string>("");
  interface GalleryOrder {
    orderId?: string;
    orderNumber?: string | number;
    deliveryStatus?: string;
    selectedKeys?: string[] | string;
    createdAt?: string;
    deliveredAt?: string;
    [key: string]: unknown;
  }
  const [orders, setOrders] = useState<GalleryOrder[]>([]);
  const [approvedSelectionKeys, setApprovedSelectionKeys] = useState<Set<string>>(new Set()); // Images in approved/preparing orders (cannot delete)
  const [allOrderSelectionKeys, setAllOrderSelectionKeys] = useState<Set<string>>(new Set()); // Images in ANY order (show "Selected")
  const [imageOrderStatus, setImageOrderStatus] = useState<Map<string, string>>(new Map()); // Map image key to order delivery status
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [imageToDelete, setImageToDelete] = useState<GalleryImage | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["unselected"])); // Track expanded order sections (Niewybrane always expanded by default)
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  // Check for recovery state and auto-open modal
  useEffect(() => {
    if (!galleryId || typeof window === "undefined") {
      return;
    }

    const storageKey = `uppy_upload_state_${galleryId}_originals`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const state = JSON.parse(stored) as {
          isActiveUpload?: boolean;
          galleryId: string;
          type: string;
        };
        // If there's an active upload state, open the modal to allow recovery
        if (state.isActiveUpload && state.galleryId === galleryId && state.type === "originals") {
          setUploadModalOpen(true);
        }
      } catch {
        // Ignore invalid entries
      }
    }
  }, [galleryId]);

  // Handle modal close - clear recovery flag if modal was auto-opened from recovery
  const handleUploadModalClose = useCallback(() => {
    setUploadModalOpen(false);

    // If modal was auto-opened from recovery and user closes it, clear the recovery flag
    // so the global recovery modal doesn't keep showing
    if (galleryId && typeof window !== "undefined") {
      const storageKey = `uppy_upload_state_${galleryId}_originals`;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        try {
          const state = JSON.parse(stored) as {
            isActiveUpload?: boolean;
            galleryId: string;
            type: string;
          };
          if (state.isActiveUpload) {
            // Clear the active flag but keep the state (in case user wants to manually resume later)
            const updatedState = { ...state, isActiveUpload: false };
            localStorage.setItem(storageKey, JSON.stringify(updatedState));
          }
        } catch {
          // Ignore invalid entries
        }
      }
    }
  }, [galleryId]);

  // Use hook for deletion logic
  const { deleteImage, handleDeleteImageClick, deletingImages, deletingImagesRef } =
    useOriginalImageDelete({
      galleryId,
      setImages,
    });
  const [limitExceededData, setLimitExceededData] = useState<{
    uploadedSizeBytes: number;
    originalsLimitBytes: number;
    excessBytes: number;
    nextTierPlan?: string;
    nextTierPriceCents?: number;
    nextTierLimitBytes?: number;
    isSelectionGallery?: boolean;
  } | null>(null);

  // Define functions first (before useEffect hooks that use them)
  // Load images from store (checks cache first, fetches if needed)
  const loadPhotos = useCallback(
    async (silent: boolean = false): Promise<void> => {
      if (!galleryId) {
        logSkippedLoad("photos", "No galleryId provided", { silent });
        return;
      }

      if (!silent) {
        setLoading(true);
      }

      try {
        // Use store action - checks cache first, fetches if needed
        const apiImages = await fetchGalleryImages(galleryId as string);

        // Map images to GalleryImage format
        // Include all properties from API response to ensure proper fallback handling
        const mappedImages: GalleryImage[] = apiImages.map((img: ApiImage) => ({
          key: img.key,
          filename: img.filename,
          thumbUrl: img.thumbUrl,
          thumbUrlFallback: img.thumbUrlFallback,
          previewUrl: img.previewUrl,
          previewUrlFallback: img.previewUrlFallback,
          bigThumbUrl: img.bigThumbUrl,
          bigThumbUrlFallback: img.bigThumbUrlFallback,
          url: img.url,
          finalUrl: img.finalUrl,
          size: img.size,
          lastModified: img.lastModified,
          isPlaceholder: false,
        }));

        // Preserve images that are currently being deleted (they may not be in API response yet)
        // Merge deleting images from current state to show deleting overlay
        setImages((currentImages) => {
          const deletingImageKeys = Array.from(deletingImagesRef.current);
          const currentDeletingImages = currentImages.filter((img) => {
            const imgKey = img.key ?? img.filename;
            return imgKey && deletingImageKeys.includes(imgKey);
          });

          // Create a map of current images by key for quick lookup
          const currentImagesMap = new Map(
            currentImages.map((img) => [img.key ?? img.filename, img])
          );

          // Create a map of API images by key
          const apiImagesMap = new Map(mappedImages.map((img) => [img.key ?? img.filename, img]));

          // Merge: preserve existing image objects when data hasn't changed
          // This prevents unnecessary re-renders and state resets in LazyRetryableImage
          const mergedImages: GalleryImage[] = [];

          // Process all images from API (includes new and existing)
          apiImagesMap.forEach((apiImg, imgKey) => {
            const currentImg = currentImagesMap.get(imgKey);

            // Check if image data actually changed by comparing URLs and lastModified
            // Compare all URL properties to detect any changes
            // Normalize lastModified for comparison (handle string vs number)
            const normalizeLastModified = (lm: number | string | undefined): number | undefined => {
              if (lm === undefined) {
                return undefined;
              }
              return typeof lm === "string" ? new Date(lm).getTime() : lm;
            };

            const currentLastModified = normalizeLastModified(currentImg?.lastModified);
            const apiLastModified = normalizeLastModified(apiImg.lastModified);

            const hasDataChanged =
              !currentImg ||
              currentImg.thumbUrl !== apiImg.thumbUrl ||
              currentImg.thumbUrlFallback !== apiImg.thumbUrlFallback ||
              currentImg.previewUrl !== apiImg.previewUrl ||
              currentImg.previewUrlFallback !== apiImg.previewUrlFallback ||
              currentImg.bigThumbUrl !== apiImg.bigThumbUrl ||
              currentImg.bigThumbUrlFallback !== apiImg.bigThumbUrlFallback ||
              currentImg.url !== apiImg.url ||
              currentImg.finalUrl !== apiImg.finalUrl ||
              currentLastModified !== apiLastModified;

            // If image exists and data hasn't changed, preserve the existing object
            // This maintains object reference stability for LazyRetryableImage
            if (currentImg && !hasDataChanged) {
              mergedImages.push(currentImg);
            } else {
              // New image or data changed - use new object
              mergedImages.push(apiImg);
            }
          });

          // Add deleting images that aren't in API response (they may not be in API response yet)
          currentDeletingImages.forEach((img) => {
            const imgKey = img.key ?? img.filename;
            if (imgKey && !apiImagesMap.has(imgKey)) {
              mergedImages.push(img);
            }
          });

          return mergedImages;
        });
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
    [galleryId, showToast, fetchGalleryImages, deletingImagesRef, gallery]
  );

  // Reload gallery after upload (simple refetch, no polling)
  const reloadGalleryAfterUpload = useCallback(async () => {
    if (!galleryId) {
      logSkippedLoad("reloadGalleryAfterUpload", "No galleryId provided", {});
      return;
    }

    // Fetch fresh images
    const { fetchGalleryImages, galleryImages } = useGalleryStore.getState();
    await fetchGalleryImages(galleryId as string);

    // Update local state from store
    const storeImages = galleryImages[galleryId as string] ?? [];

    setImages((currentImages) => {
      const deletingImageKeys = Array.from(deletingImagesRef.current);
      const currentDeletingImages = currentImages.filter((img) => {
        const imgKey = img.key ?? img.filename;
        return imgKey && deletingImageKeys.includes(imgKey);
      });

      // Create a map of current images by key for quick lookup
      const currentImagesMap = new Map(currentImages.map((img) => [img.key ?? img.filename, img]));

      // Create a map of store images by key
      const storeImagesMap = new Map(storeImages.map((img) => [img.key ?? img.filename, img]));

      // Merge: preserve existing image objects when data hasn't changed
      // This prevents unnecessary re-renders and state resets in LazyRetryableImage
      const mergedImages: GalleryImage[] = [];

      // Process all images from store (includes new and existing)
      storeImagesMap.forEach((storeImg, imgKey) => {
        const currentImg = currentImagesMap.get(imgKey);

        // Check if image data actually changed by comparing URLs and lastModified
        // Compare all URL properties to detect any changes
        // Normalize lastModified for comparison (handle string vs number)
        const normalizeLastModified = (lm: number | string | undefined): number | undefined => {
          if (lm === undefined) {
            return undefined;
          }
          return typeof lm === "string" ? new Date(lm).getTime() : lm;
        };

        const currentLastModified = normalizeLastModified(currentImg?.lastModified);
        const storeLastModified = normalizeLastModified(storeImg.lastModified);

        const hasDataChanged =
          !currentImg ||
          currentImg.thumbUrl !== storeImg.thumbUrl ||
          currentImg.thumbUrlFallback !== storeImg.thumbUrlFallback ||
          currentImg.previewUrl !== storeImg.previewUrl ||
          currentImg.previewUrlFallback !== storeImg.previewUrlFallback ||
          currentImg.bigThumbUrl !== storeImg.bigThumbUrl ||
          currentImg.bigThumbUrlFallback !== storeImg.bigThumbUrlFallback ||
          currentImg.url !== storeImg.url ||
          currentImg.finalUrl !== storeImg.finalUrl ||
          currentLastModified !== storeLastModified;

        // If image exists and data hasn't changed, preserve the existing object
        // This maintains object reference stability for LazyRetryableImage
        if (currentImg && !hasDataChanged) {
          mergedImages.push(currentImg);
        } else {
          // New image or data changed - use new object
          mergedImages.push(storeImg);
        }
      });

      // Add deleting images that aren't in store (they may not be in API response yet)
      currentDeletingImages.forEach((img) => {
        const imgKey = img.key ?? img.filename;
        if (imgKey && !storeImagesMap.has(imgKey)) {
          mergedImages.push(img);
        }
      });

      return mergedImages;
    });
  }, [galleryId, deletingImagesRef]);

  const loadApprovedSelections = useCallback(async (): Promise<void> => {
    if (!galleryId) {
      logSkippedLoad("loadApprovedSelections", "No galleryId provided", {});
      return;
    }

    try {
      const ordersData = await fetchGalleryOrders(galleryId as string);

      setOrders(ordersData);

      // Find orders with CLIENT_APPROVED or PREPARING_DELIVERY status (cannot delete)
      const approvedOrders = (ordersData as GalleryOrder[]).filter(
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
      // Also track order delivery status for each image
      const allOrderKeys = new Set<string>();
      const imageStatusMap = new Map<string, string>();

      (ordersData as GalleryOrder[]).forEach((order) => {
        const selectedKeys = Array.isArray(order.selectedKeys)
          ? order.selectedKeys
          : typeof order.selectedKeys === "string"
            ? (JSON.parse(order.selectedKeys) as string[])
            : [];
        const orderStatus = order.deliveryStatus || "";

        selectedKeys.forEach((key: string) => {
          allOrderKeys.add(key);
          // Track the highest priority status for each image
          // Priority: DELIVERED > PREPARING_DELIVERY > PREPARING_FOR_DELIVERY > CLIENT_APPROVED
          const currentStatus = imageStatusMap.get(key);
          if (!currentStatus) {
            imageStatusMap.set(key, orderStatus);
          } else if (orderStatus === "DELIVERED") {
            imageStatusMap.set(key, "DELIVERED");
          } else if (orderStatus === "PREPARING_DELIVERY" && currentStatus !== "DELIVERED") {
            imageStatusMap.set(key, "PREPARING_DELIVERY");
          } else if (
            orderStatus === "PREPARING_FOR_DELIVERY" &&
            currentStatus !== "DELIVERED" &&
            currentStatus !== "PREPARING_DELIVERY"
          ) {
            imageStatusMap.set(key, "PREPARING_FOR_DELIVERY");
          } else if (
            orderStatus === "CLIENT_APPROVED" &&
            currentStatus !== "DELIVERED" &&
            currentStatus !== "PREPARING_DELIVERY" &&
            currentStatus !== "PREPARING_FOR_DELIVERY"
          ) {
            imageStatusMap.set(key, "CLIENT_APPROVED");
          }
        });
      });

      setAllOrderSelectionKeys(allOrderKeys);
      setImageOrderStatus(imageStatusMap);
    } catch (err) {
      // Check if error is 404 (gallery not found/deleted) - handle silently
      const apiError = err as { status?: number };
      if (apiError.status === 404) {
        // Gallery doesn't exist (deleted) - silently return empty state
        setOrders([]);
        setApprovedSelectionKeys(new Set());
        setAllOrderSelectionKeys(new Set());
        setImageOrderStatus(new Map());
        return;
      }

      // For other errors, log but don't show toast - this is not critical
      // eslint-disable-next-line no-console
      console.error("[GalleryPhotos] loadApprovedSelections: Error", err);
    }
  }, [galleryId, fetchGalleryOrders]);

  // Clear galleryCreationLoading when gallery and images are fully loaded
  useEffect(() => {
    if (galleryCreationLoading && !galleryLoading && gallery && !loading) {
      setGalleryCreationLoading(false);
    }
  }, [galleryCreationLoading, galleryLoading, gallery, loading, setGalleryCreationLoading]);

  // Removed: useLayoutEffect with hasInitialized workaround
  // Now using stable galleryId comparison in the loading check above

  // Initialize auth and load data
  useEffect(() => {
    // Don't initialize until galleryId is available from router
    if (!galleryId) {
      logSkippedLoad("initializeAuth", "No galleryId from router", {});
      return;
    }

    const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
    const isNewGallery = loadedGalleryIdRef.current !== galleryIdStr;

    // Only load if it's a new gallery (not already loaded)
    // GalleryLayoutWrapper handles gallery loading, we just need to load photos
    if (isNewGallery) {
      loadedGalleryIdRef.current = galleryIdStr;
    } else {
      logSkippedLoad("loadPhotos", "Gallery already loaded (not new)", {
        galleryId: galleryIdStr,
        loadedGalleryId: loadedGalleryIdRef.current,
      });
    }

    // Auth is handled by AuthProvider/ProtectedRoute - just load data
    if (galleryId) {
      // Check for redirect params (Stripe redirect from wallet top-up or publish wizard)
      const params = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : ""
      );
      const hasRedirectParams = params.get("publish") === "true" || params.get("galleryId");
      const hasPaymentSuccess = params.get("payment") === "success";

      void loadPhotos();

      // Load orders
      void loadApprovedSelections();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId]); // Only depend on galleryId, not on the callback functions to avoid infinite loops

  const handleDeletePhotoClick = (image: GalleryImage): void => {
    const imageKey = image.key ?? image.filename;

    if (!imageKey) {
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

    // Use hook's handler which handles suppression check and confirmation dialog
    const imageToDeleteResult = handleDeleteImageClick(image);
    if (imageToDeleteResult) {
      setImageToDelete(imageToDeleteResult);
      setDeleteConfirmOpen(true);
    }
  };

  const handleDeleteConfirm = async (suppressChecked?: boolean): Promise<void> => {
    if (!imageToDelete) {
      return;
    }
    try {
      await deleteImage(imageToDelete, suppressChecked);
      setDeleteConfirmOpen(false);
      setImageToDelete(null);
    } catch {
      // Error already handled in deleteImage, keep modal open
    }
  };

  // Show loading if galleryId is not yet available from router (prevents flash of empty state)
  if (!galleryId) {
    // Return null to let GalleryLayoutWrapper handle the loading overlay
    // This ensures the sidebar is visible during loading
    return null;
  }

  // Use stable galleryId comparison instead of object references
  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
  const currentGalleryId = gallery?.galleryId ?? "";

  const effectiveGallery = gallery;
  const effectiveGalleryId = effectiveGallery?.galleryId ?? "";

  // Gallery is loaded if we have it and IDs match
  const isGalleryLoaded = !!effectiveGallery && effectiveGalleryId === galleryIdStr;

  // Update loaded galleryId when gallery is loaded
  if (isGalleryLoaded && loadedGalleryIdRef.current !== galleryIdStr) {
    loadedGalleryIdRef.current = galleryIdStr;
  }

  // Don't show FullPageLoading here - let GalleryLayoutWrapper handle it
  // This ensures the sidebar is visible during loading
  // Return empty content (not null) so the layout still renders
  if (!isGalleryLoaded) {
    storeLogger.log(
      "GalleryPhotos",
      "Waiting for gallery - GalleryLayoutWrapper will show loading",
      {
        galleryId: galleryIdStr,
        hasGallery: !!gallery,
        currentGalleryId,
        effectiveGalleryId,
      }
    );
    // Return empty div so layout still renders (sidebar will show loading state)
    return <div />;
  }

  storeLogger.log("GalleryPhotos", "Gallery ready - rendering content", {
    galleryId: galleryIdStr,
    effectiveGalleryId,
  });

  // Use effectiveGallery (from store or cache) for rendering
  // Fallback to gallery from hook if effectiveGallery is not available
  const galleryToRender = (effectiveGallery || gallery) as Gallery | null;
  if (!galleryToRender) {
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

  // Get order delivery status for an image
  const getImageOrderStatus = (image: GalleryImage): string | null => {
    const imageKey = image.key ?? image.filename;
    return imageKey ? imageOrderStatus.get(imageKey) || null : null;
  };

  // Helper to normalize selectedKeys from order
  const normalizeOrderSelectedKeys = (selectedKeys: string[] | string | undefined): string[] => {
    if (!selectedKeys) {
      return [];
    }
    if (Array.isArray(selectedKeys)) {
      return selectedKeys.map((k) => k.toString().trim());
    }
    if (typeof selectedKeys === "string") {
      try {
        const parsed = JSON.parse(selectedKeys);
        return Array.isArray(parsed) ? parsed.map((k: unknown) => String(k).trim()) : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  // Format date for display
  const formatDate = (dateString?: string): string => {
    if (!dateString) {
      return "";
    }
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("pl-PL", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  // Get delivered orders (DELIVERED or PREPARING_DELIVERY)
  const deliveredOrders = orders.filter(
    (o) => o.deliveryStatus === "DELIVERED" || o.deliveryStatus === "PREPARING_DELIVERY"
  );

  // Group images by order
  const imagesByOrder = new Map<string, GalleryImage[]>();
  const imagesInOrders = new Set<string>();

  deliveredOrders.forEach((order) => {
    const orderId = order.orderId;
    if (!orderId) {
      return;
    }

    const selectedKeys = normalizeOrderSelectedKeys(order.selectedKeys);
    const orderImages: GalleryImage[] = [];

    images.forEach((img) => {
      const imgKey = (img.key ?? img.filename ?? "").toString().trim();
      if (imgKey && selectedKeys.includes(imgKey)) {
        orderImages.push(img);
        imagesInOrders.add(imgKey);
      }
    });

    if (orderImages.length > 0) {
      imagesByOrder.set(orderId, orderImages);
    }
  });

  // Get unselected images (not in any delivered order)
  const unselectedImages = images.filter((img) => {
    const imgKey = (img.key ?? img.filename ?? "").toString().trim();
    return imgKey && !imagesInOrders.has(imgKey);
  });

  // Toggle section expansion
  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  // Render image grid
  const renderImageGrid = (imagesToRender: GalleryImage[]) => (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {imagesToRender.map((img) => {
        const isApproved = isImageInApprovedSelection(img);
        const isInAnyOrder = isImageInAnyOrder(img);
        const orderStatus = getImageOrderStatus(img);
        // Use stable key/filename as identifier - always prefer key, fallback to filename
        // This ensures React can properly reconcile components when images are reordered
        const imageKey = img.key ?? img.filename ?? "";
        // Check if image has any available URLs
        const isProcessing = !img.thumbUrl && !img.previewUrl && !img.bigThumbUrl && !img.url;

        return (
          <div
            key={imageKey}
            className={`relative group border border-gray-200 rounded-lg overflow-hidden bg-white dark:bg-gray-800 dark:border-gray-700 transition-colors ${
              deletingImages.has(imageKey) ? "opacity-60" : ""
            }`}
          >
            <div className="aspect-square relative">
              {isProcessing ? (
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
                  <LazyRetryableImage
                    imageData={
                      {
                        ...img,
                        key: img.key,
                        filename: img.filename,
                      } as ImageFallbackUrls & { key?: string; filename?: string }
                    }
                    alt={imageKey}
                    className="w-full h-full object-cover rounded-lg"
                    preferredSize="thumb"
                  />
                  {orderStatus &&
                    (() => {
                      // Map order status to badge color and label (matching StatusBadges component)
                      const statusMap: Record<
                        string,
                        {
                          color:
                            | "success"
                            | "info"
                            | "warning"
                            | "error"
                            | "light"
                            | "dark"
                            | "primary";
                          label: string;
                        }
                      > = {
                        CLIENT_APPROVED: { color: "success", label: "Zatwierdzone" },
                        PREPARING_DELIVERY: { color: "info", label: "Oczekuje do wysłania" },
                        PREPARING_FOR_DELIVERY: { color: "info", label: "Gotowe do wysyłki" },
                        DELIVERED: { color: "success", label: "Dostarczone" },
                      };

                      const statusInfo = statusMap[orderStatus] ?? {
                        color: "light" as const,
                        label: orderStatus,
                      };

                      return (
                        <div className="absolute top-2 right-2 z-20">
                          <Badge color={statusInfo.color} variant="light" size="sm">
                            {statusInfo.label}
                          </Badge>
                        </div>
                      );
                    })()}
                  {deletingImages.has(imageKey) && (
                    <div className="absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center rounded-lg z-30">
                      <div className="flex flex-col items-center space-y-2">
                        <Loading size="sm" />
                        <span className="text-white text-sm font-medium">Usuwanie...</span>
                      </div>
                    </div>
                  )}
                  {!deletingImages.has(imageKey) && (
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
                          disabled={isApproved || deletingImages.size > 0}
                          className={`opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 text-sm font-medium rounded-md ${
                            isApproved || deletingImages.size > 0
                              ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                              : "bg-error-500 text-white hover:bg-error-600"
                          }`}
                        >
                          Usuń
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="p-2">
              <p className="text-xs text-gray-600 dark:text-gray-400 truncate" title={imageKey}>
                {removeFileExtension(imageKey)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      {/* Next Steps Overlay */}
      <NextStepsOverlay
        gallery={gallery}
        orders={orders as unknown as Array<{ orderId: string; [key: string]: unknown }>}
        galleryLoading={galleryLoading}
      />

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
        {/* Upload Button */}
        <div className="mb-4">
          <button
            onClick={() => setUploadModalOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Plus size={20} />
            Prześlij zdjęcia
          </button>
        </div>

        {/* Images Grid - Grouped by Orders */}
        {loading ? (
          <div className="p-12 text-center bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
            <Loading size="lg" text="Ładowanie zdjęć..." />
          </div>
        ) : images.length === 0 ? (
          <EmptyState
            icon={<Image size={64} />}
            title="Brak zdjęć w galerii"
            description="Prześlij swoje pierwsze zdjęcia, aby rozpocząć. Możesz przesłać wiele zdjęć jednocześnie."
            actionButton={{
              label: "Prześlij zdjęcia",
              onClick: () => setUploadModalOpen(true),
              icon: <Upload size={18} />,
            }}
          />
        ) : deliveredOrders.length > 0 ? (
          <div className="space-y-2">
            {/* Order Sections */}
            {deliveredOrders.map((order) => {
              const orderId = order.orderId;
              if (!orderId) {
                return null;
              }

              const orderImages = imagesByOrder.get(orderId) || [];
              if (orderImages.length === 0) {
                return null;
              }

              const sectionId = `order-${orderId}`;
              const isExpanded = expandedSections.has(sectionId);
              const orderDisplayNumber =
                order.orderNumber !== undefined && order.orderNumber !== null
                  ? String(order.orderNumber)
                  : orderId.slice(-8);

              return (
                <div
                  key={orderId}
                  className="bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700 overflow-hidden"
                >
                  <button
                    onClick={() => toggleSection(sectionId)}
                    className={`w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                      isExpanded ? "rounded-t-lg" : "rounded-lg"
                    }`}
                  >
                    <div className="flex-1 text-left flex items-center gap-3 flex-wrap">
                      <div className="font-semibold text-gray-900 dark:text-white">
                        Zlecenie #{orderDisplayNumber}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 hidden sm:inline">
                        {order.createdAt && <span>Utworzono: {formatDate(order.createdAt)}</span>}
                        {order.createdAt && order.deliveredAt && <span className="mx-2">•</span>}
                        {order.deliveredAt && (
                          <span>Dostarczono: {formatDate(order.deliveredAt)}</span>
                        )}
                        {!order.createdAt && !order.deliveredAt && (
                          <span className="text-gray-400">Brak dat</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 dark:text-gray-500">
                        {orderImages.length}{" "}
                        {orderImages.length === 1
                          ? "zdjęcie"
                          : orderImages.length < 5
                            ? "zdjęcia"
                            : "zdjęć"}
                      </div>
                    </div>
                    <ChevronDown
                      size={16}
                      className={`text-gray-500 dark:text-gray-400 transition-transform flex-shrink-0 ${
                        isExpanded ? "transform rotate-180" : ""
                      }`}
                    />
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 rounded-b-lg">
                      {renderImageGrid(orderImages)}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Unselected Section */}
            {unselectedImages.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700 overflow-hidden">
                <button
                  onClick={() => toggleSection("unselected")}
                  className={`w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                    expandedSections.has("unselected") ? "rounded-t-lg" : "rounded-lg"
                  }`}
                >
                  <div className="flex-1 text-left flex items-center gap-3">
                    <div className="font-semibold text-gray-900 dark:text-white">Niewybrane</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">
                      {unselectedImages.length}{" "}
                      {unselectedImages.length === 1
                        ? "zdjęcie"
                        : unselectedImages.length < 5
                          ? "zdjęcia"
                          : "zdjęć"}
                    </div>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`text-gray-500 dark:text-gray-400 transition-transform flex-shrink-0 ${
                      expandedSections.has("unselected") ? "transform rotate-180" : ""
                    }`}
                  />
                </button>
                {expandedSections.has("unselected") && (
                  <div className="px-4 pb-4 pt-2 rounded-b-lg">
                    {renderImageGrid(unselectedImages)}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          // Fallback: show all images if no delivered orders
          renderImageGrid(images)
        )}
      </div>

      {/* Uppy Upload Modal */}
      {galleryId && (
        <UppyUploadModal
          isOpen={uploadModalOpen}
          onClose={handleUploadModalClose}
          config={{
            galleryId: galleryId as string,
            type: "originals",
            onValidationNeeded: (data) => {
              setLimitExceededData(data);
            },
            onUploadComplete: () => {
              setUploadModalOpen(false);
            },
            reloadGallery: reloadGalleryAfterUpload,
          }}
        />
      )}

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
            ? `Czy na pewno chcesz usunąć zdjęcie "${removeFileExtension(imageToDelete.key ?? imageToDelete.filename)}"?\nTa operacja jest nieodwracalna.`
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
        suppressKey="original_image_delete_confirm_suppress"
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
