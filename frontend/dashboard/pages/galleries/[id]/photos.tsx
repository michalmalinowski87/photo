import { Plus, ChevronDown, Image, Upload, CheckSquare, Square, Trash2, X, Check, ExternalLink } from "lucide-react";
import { useRouter } from "next/router";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { BulkDeleteConfirmDialog } from "../../../components/dialogs/BulkDeleteConfirmDialog";
import { LimitExceededModal } from "../../../components/galleries/LimitExceededModal";
import { NextStepsOverlay } from "../../../components/galleries/NextStepsOverlay";
import Badge from "../../../components/ui/badge/Badge";
import { ConfirmDialog } from "../../../components/ui/confirm/ConfirmDialog";
import { EmptyState } from "../../../components/ui/empty-state/EmptyState";
import { LazyRetryableImage } from "../../../components/ui/LazyRetryableImage";
import { Loading, GalleryLoading } from "../../../components/ui/loading/Loading";
import { UppyUploadModal } from "../../../components/uppy/UppyUploadModal";
import { useBulkImageDelete } from "../../../hooks/useBulkImageDelete";
import { useGalleryImages } from "../../../hooks/queries/useGalleries";
import { useGallery } from "../../../hooks/useGallery";
import { useGalleryImageOrders } from "../../../hooks/useGalleryImageOrders";
import { useImageSelection } from "../../../hooks/useImageSelection";
import { useOriginalImageDelete } from "../../../hooks/useOriginalImageDelete";
import { usePageLogger } from "../../../hooks/usePageLogger";
import { useToast } from "../../../hooks/useToast";
import { removeFileExtension } from "../../../lib/filename-utils";
import { ImageFallbackUrls } from "../../../lib/image-fallback";
import { storeLogger } from "../../../lib/store-logger";
import type { Gallery, GalleryImage, Order } from "../../../types";

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
  const { logSkippedLoad } = usePageLogger({
    pageName: "GalleryPhotos",
  });
  const { gallery: galleryRaw, loading: galleryLoading, reloadGallery } = useGallery();
  const gallery = galleryRaw && typeof galleryRaw === "object" ? (galleryRaw) : null;
  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
  const galleryIdForQuery =
    galleryIdStr && typeof galleryIdStr === "string" ? galleryIdStr : undefined;
  const {
    isLoading: imagesLoading,
    isFetching: imagesFetching,
    data: imagesData,
    refetch: refetchGalleryImages,
  } = useGalleryImages(galleryIdForQuery, "thumb");
  // Track loaded galleryId for stable comparison (prevents re-renders from object reference changes)
  const loadedGalleryIdRef = useRef<string>("");
  // Track if we've logged that gallery is ready (prevents repeated logs on re-renders)
  const hasLoggedGalleryReadyRef = useRef<string>("");

  // Use hook for order/image relationship management
  const {
    orders,
    approvedSelectionKeys,
    allOrderSelectionKeys,
    imageOrderStatus,
    loadApprovedSelections,
  } = useGalleryImageOrders(galleryId);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [imageToDelete, setImageToDelete] = useState<GalleryImage | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["unselected"])); // Track expanded order sections (Niewybrane always expanded by default)
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  // Check for recovery state and auto-open modal
  useEffect(() => {
    if (!galleryId || typeof window === "undefined") {
      return;
    }

    const storageKey = `uppy_upload_state_${Array.isArray(galleryId) ? galleryId[0] : galleryId}_originals`;
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
      const storageKey = `uppy_upload_state_${Array.isArray(galleryId) ? galleryId[0] : galleryId}_originals`;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as {
            isActiveUpload?: boolean;
            galleryId: string;
            type: string;
          };
          const state = parsed;
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
  const { deleteImage, handleDeleteImageClick, deletingImages, deletedImageKeys } = useOriginalImageDelete({
    galleryId,
  });

  // Selection mode and bulk delete
  const {
    selectedKeys,
    isSelectionMode,
    toggleSelectionMode,
    handleImageClick: handleSelectionClickBase,
    selectAll: selectAllBase,
    deselectAll,
    clearSelection,
  } = useImageSelection({
    storageKey: `image_selection_${galleryIdStr || "default"}`,
  });

  // Wrapper to prevent selection of approved images or images in DELIVERED orders
  const handleSelectionClick = useCallback(
    (
      imageKey: string,
      index: number,
      event: MouseEvent,
      imagesToRender: GalleryImage[]
    ) => {
      // Prevent selection if image is approved
      if (approvedSelectionKeys.has(imageKey)) {
        return;
      }
      // Prevent selection if image is in DELIVERED order
      const img = imagesToRender.find((i) => (i.key ?? i.filename) === imageKey);
      if (img) {
        const orderStatus = getImageOrderStatus(img);
        if (orderStatus === "DELIVERED") {
          return;
        }
      }
      handleSelectionClickBase(imageKey, index, event, imagesToRender);
    },
    [approvedSelectionKeys, handleSelectionClickBase]
  );

  // Wrapper to exclude approved images and images in DELIVERED orders from selectAll
  const selectAll = useCallback(
    (imagesToSelect: GalleryImage[]) => {
      // Filter out approved images and images in DELIVERED orders
      const selectableImages = imagesToSelect.filter((img) => {
        const imageKey = img.key ?? img.filename;
        // Exclude approved images
        if (imageKey && approvedSelectionKeys.has(imageKey)) {
          return false;
        }
        // Exclude images in DELIVERED orders (check imageOrderStatus map directly)
        if (imageKey) {
          const orderStatus = imageOrderStatus.get(imageKey);
          if (orderStatus === "DELIVERED") {
            return false;
          }
        }
        return true;
      });
      selectAllBase(selectableImages);
    },
    [selectAllBase, approvedSelectionKeys, imageOrderStatus]
  );

  const {
    deleteImages: deleteImagesBulk,
    deletingImages: deletingImagesBulk,
    deletedImageKeys: deletedImageKeysBulk,
    isDeleting: isBulkDeleting,
  } = useBulkImageDelete({
    galleryId,
    imageType: "originals",
  });

  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [deleteAllUnselectedOpen, setDeleteAllUnselectedOpen] = useState(false);
  const [unselectedImagesToDelete, setUnselectedImagesToDelete] = useState<string[]>([]);
  const [limitExceededData, setLimitExceededData] = useState<{
    uploadedSizeBytes: number;
    originalsLimitBytes: number;
    excessBytes: number;
    nextTierPlan?: string;
    nextTierPriceCents?: number;
    nextTierLimitBytes?: number;
    isSelectionGallery?: boolean;
  } | null>(null);

  // Reload gallery after upload (simple refetch)
  const reloadGalleryAfterUpload = useCallback(async () => {
    if (!galleryIdForQuery) {
      logSkippedLoad("reloadGalleryAfterUpload", "No galleryId provided", {});
      return;
    }

    // Refetch fresh images from React Query - it handles cache updates automatically
    await refetchGalleryImages();
  }, [galleryIdForQuery, refetchGalleryImages, logSkippedLoad]);

  // Loading state is now automatically managed by React Query mutations
  // No need to manually set/unset loading state

  // Removed: useLayoutEffect with hasInitialized workaround
  // Now using stable galleryId comparison in the loading check above

  // Initialize auth and load data
  useEffect(() => {
    // Don't initialize until galleryId is available from router
    if (!galleryId) {
      logSkippedLoad("initializeAuth", "No galleryId from router", {});
      return;
    }

    const isNewGallery = loadedGalleryIdRef.current !== galleryIdStr;

    // Only load if it's a new gallery (not already loaded)
    // GalleryLayoutWrapper handles gallery loading, React Query handles image loading
    if (isNewGallery && galleryIdStr) {
      loadedGalleryIdRef.current = galleryIdStr;
    } else {
      logSkippedLoad("loadPhotos", "Gallery already loaded (not new)", {
        galleryId: galleryIdStr,
        loadedGalleryId: loadedGalleryIdRef.current,
      });
    }

    // Auth is handled by AuthProvider/ProtectedRoute - React Query handles image loading
    if (galleryId) {
      // Load orders
      void loadApprovedSelections();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId]); // Only depend on galleryId, not on the callback functions to avoid infinite loops

  // Convert React Query data to GalleryImage format and filter out deleted images
  const images = useMemo(() => {
    if (!imagesData) {
      return [];
    }
    const apiImages = imagesData as ApiImage[];
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
      lastModified: typeof img.lastModified === "number" ? img.lastModified : undefined,
      isPlaceholder: false,
    }));

    // Filter out successfully deleted images (from both single and bulk delete)
    // This prevents them from reappearing during refetch before backend completes deletion
    const allDeletedKeys = new Set([
      ...Array.from(deletedImageKeys),
      ...Array.from(deletedImageKeysBulk),
    ]);
    
    return mappedImages.filter((img) => {
      const imgKey = img.key ?? img.filename;
      if (!imgKey) {
        return false;
      }
      // Skip if successfully deleted
      if (allDeletedKeys.has(imgKey)) {
        return false;
      }
      return true;
    });
  }, [imagesData, deletedImageKeys, deletedImageKeysBulk]);

  // Automatically deselect non-deletable images (approved or in DELIVERED orders) when they appear in selection
  // This handles edge cases like range selections that might include non-deletable images
  const cleaningUpRef = useRef(false);
  useEffect(() => {
    if (isSelectionMode && selectedKeys.size > 0 && !cleaningUpRef.current) {
      const nonDeletableInSelection = Array.from(selectedKeys).filter((key) => {
        // Check if approved
        if (approvedSelectionKeys.has(key)) {
          return true;
        }
        // Check if in DELIVERED order
        const img = images.find((i) => (i.key ?? i.filename) === key);
        if (img) {
          const orderStatus = getImageOrderStatus(img);
          if (orderStatus === "DELIVERED") {
            return true;
          }
        }
        return false;
      });
      
      if (nonDeletableInSelection.length > 0) {
        cleaningUpRef.current = true;
        // Remove non-deletable images from selection by toggling them off
        nonDeletableInSelection.forEach((key) => {
          const img = images.find((i) => (i.key ?? i.filename) === key);
          if (img) {
            const index = images.indexOf(img);
            // Toggle off non-deletable images
            handleSelectionClickBase(key, index, new MouseEvent("click"), images);
          }
        });
        // Reset flag after a brief delay to allow state updates
        setTimeout(() => {
          cleaningUpRef.current = false;
        }, 100);
      }
    }
  }, [isSelectionMode, approvedSelectionKeys, selectedKeys, images, handleSelectionClickBase]);

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

    // Check if image is in a DELIVERED order
    const orderStatus = getImageOrderStatus(image);
    if (orderStatus === "DELIVERED") {
      showToast(
        "error",
        "Błąd",
        "Nie można usunąć zdjęcia, które jest częścią dostarczonego zlecenia"
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

  // Bulk delete handlers
  const handleBulkDeleteClick = useCallback(() => {
    const selectedArray = Array.from(selectedKeys);
    if (selectedArray.length === 0) {
      return;
    }
    setBulkDeleteConfirmOpen(true);
  }, [selectedKeys]);

  const handleBulkDeleteConfirm = async (): Promise<void> => {
    const selectedArray = Array.from(selectedKeys);
    if (selectedArray.length === 0) {
      return;
    }

    // Filter out approved selection images and images in DELIVERED orders
    const imagesToDelete = selectedArray.filter((key) => {
      // Check if approved
      if (approvedSelectionKeys.has(key)) {
        return false;
      }
      // Check if in DELIVERED order
      const img = images.find((i) => (i.key ?? i.filename) === key);
      if (img) {
        const orderStatus = getImageOrderStatus(img);
        if (orderStatus === "DELIVERED") {
          return false;
        }
      }
      return true;
    });
    
    const blockedCount = selectedArray.length - imagesToDelete.length;

    if (blockedCount > 0) {
      showToast(
        "error",
        "Błąd",
        `Nie można usunąć ${blockedCount} ${blockedCount === 1 ? "zdjęcia" : "zdjęć"}, które ${blockedCount === 1 ? "jest" : "są"} częścią zatwierdzonej selekcji klienta lub dostarczonego zlecenia`
      );
    }

    if (imagesToDelete.length === 0) {
      setBulkDeleteConfirmOpen(false);
      clearSelection();
      return;
    }

    try {
      await deleteImagesBulk(imagesToDelete);
      setBulkDeleteConfirmOpen(false);
      clearSelection();
      toggleSelectionMode();
    } catch {
      // Error already handled in deleteImagesBulk
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (!isSelectionMode) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl/Cmd + A: Select all
      if ((event.ctrlKey || event.metaKey) && event.key === "a") {
        event.preventDefault();
        if (images.length > 0) {
          selectAll(images);
        }
        return;
      }

      // Delete or Backspace: Delete selected
      if ((event.key === "Delete" || event.key === "Backspace") && selectedKeys.size > 0) {
        event.preventDefault();
        handleBulkDeleteClick();
        return;
      }

      // Escape: Exit selection mode
      if (event.key === "Escape") {
        event.preventDefault();
        toggleSelectionMode();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSelectionMode, selectedKeys, images, selectAll, toggleSelectionMode, handleBulkDeleteClick]);

  // Show loading if galleryId is not yet available from router (prevents flash of empty state)
  if (!galleryId) {
    // Return null to let GalleryLayoutWrapper handle the loading overlay
    // This ensures the sidebar is visible during loading
    return null;
  }

  // Use stable galleryId comparison instead of object references
  const currentGalleryId = gallery?.galleryId ?? "";

  const effectiveGallery = gallery;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const effectiveGalleryId = effectiveGallery?.galleryId ?? "";

  // Gallery is loaded if we have it and IDs match
  const isGalleryLoaded = !!effectiveGallery && effectiveGalleryId === galleryIdStr;

  // Update loaded galleryId when gallery is loaded
  if (isGalleryLoaded && loadedGalleryIdRef.current !== galleryIdStr) {
    loadedGalleryIdRef.current = galleryIdStr;
  }

  // Log when gallery becomes ready (only once per gallery, not on every render)
  useEffect(() => {
    if (
      isGalleryLoaded &&
      galleryIdStr &&
      hasLoggedGalleryReadyRef.current !== galleryIdStr
    ) {
      hasLoggedGalleryReadyRef.current = galleryIdStr;
      storeLogger.log("GalleryPhotos", "Gallery ready - rendering content", {
        galleryId: galleryIdStr,
        effectiveGalleryId,
      });
    }
  }, [isGalleryLoaded, galleryIdStr, effectiveGalleryId]);

  // Don't show FullPageLoading here - let GalleryLayoutWrapper handle it
  // This ensures the sidebar is visible during loading
  // Return empty content (not null) so the layout still renders
  if (!isGalleryLoaded) {
    // Return empty div so layout still renders (sidebar will show loading state)
    return <div />;
  }

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
    return imageKey ? (imageOrderStatus.get(imageKey) ?? null) : null;
  };

  // Helper to get selectable images (excluding approved and delivered)
  const getSelectableImages = useCallback(
    (imagesToFilter: GalleryImage[]): GalleryImage[] => {
      return imagesToFilter.filter((img) => {
        const imageKey = img.key ?? img.filename;
        if (!imageKey) return false;
        // Exclude approved images
        if (approvedSelectionKeys.has(imageKey)) {
          return false;
        }
        // Exclude images in DELIVERED orders
        const orderStatus = imageOrderStatus.get(imageKey);
        if (orderStatus === "DELIVERED") {
          return false;
        }
        return true;
      });
    },
    [approvedSelectionKeys, imageOrderStatus]
  );


  // Helper to normalize selectedKeys from order (used for grouping images by order)
  const normalizeOrderSelectedKeys = (selectedKeys: string[] | string | undefined): string[] => {
    if (!selectedKeys) {
      return [];
    }
    if (Array.isArray(selectedKeys)) {
      return selectedKeys.map((k) => k.toString().trim());
    }
    if (typeof selectedKeys === "string") {
      try {
        const parsed: unknown = JSON.parse(selectedKeys);
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
    const orderId = typeof order.orderId === "string" ? order.orderId : undefined;
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

  // Handler for deleting all unselected images
  const handleDeleteAllUnselectedClick = useCallback(() => {
    if (unselectedImages.length === 0) {
      return;
    }

    // Get all unselected image keys and filter out non-deletable ones
    const imageKeysToDelete = unselectedImages
      .map((img) => img.key ?? img.filename)
      .filter((key): key is string => {
        if (!key) return false;
        // Check if approved
        if (approvedSelectionKeys.has(key)) {
          return false;
        }
        // Check if in DELIVERED order
        const img = unselectedImages.find((i) => (i.key ?? i.filename) === key);
        if (img) {
          const orderStatus = getImageOrderStatus(img);
          if (orderStatus === "DELIVERED") {
            return false;
          }
        }
        return true;
      });

    if (imageKeysToDelete.length === 0) {
      showToast(
        "error",
        "Błąd",
        "Nie można usunąć żadnych zdjęć - wszystkie są częścią zatwierdzonej selekcji lub dostarczonego zlecenia"
      );
      return;
    }

    setUnselectedImagesToDelete(imageKeysToDelete);
    setDeleteAllUnselectedOpen(true);
  }, [unselectedImages, approvedSelectionKeys, getImageOrderStatus, showToast]);

  const handleDeleteAllUnselectedConfirm = async (): Promise<void> => {
    if (unselectedImagesToDelete.length === 0) {
      setDeleteAllUnselectedOpen(false);
      return;
    }

    try {
      await deleteImagesBulk(unselectedImagesToDelete);
      setDeleteAllUnselectedOpen(false);
      setUnselectedImagesToDelete([]);
    } catch {
      // Error already handled in deleteImagesBulk
    }
  };

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
  const renderImageGrid = (imagesToRender: GalleryImage[]) => {
    // Combine deleting states from both single and bulk delete
    const allDeletingImages = new Set([...deletingImages, ...deletingImagesBulk]);

    return (
      <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 ${isSelectionMode ? "select-none" : ""}`}>
        {imagesToRender.map((img, index) => {
          const isApproved = isImageInApprovedSelection(img);
          const isInAnyOrder = isImageInAnyOrder(img);
          const orderStatus = getImageOrderStatus(img);
          const isDelivered = orderStatus === "DELIVERED";
          const isNonDeletable = isApproved || isDelivered;
          // Use stable key/filename as identifier - always prefer key, fallback to filename
          // This ensures React can properly reconcile components when images are reordered
          const imageKey = img.key ?? img.filename ?? "";
          // Check if image has any available URLs
          const isProcessing = !img.thumbUrl && !img.previewUrl && !img.bigThumbUrl && !img.url;
          const isSelected = selectedKeys.has(imageKey);
          const isDeleting = allDeletingImages.has(imageKey);

          return (
            <div
              key={imageKey}
              className={`relative group border rounded-lg overflow-hidden bg-white dark:bg-gray-800 dark:border-gray-700 transition-all ${
                isSelectionMode ? "select-none" : ""
              } ${
                isDeleting
                  ? "opacity-60"
                  : isSelected && isSelectionMode
                    ? "border-brand-500 ring-2 ring-brand-200 dark:ring-brand-800"
                    : isNonDeletable && isSelectionMode
                      ? "opacity-60 border-gray-300 dark:border-gray-600"
                      : "border-gray-200"
              } ${isNonDeletable && isSelectionMode ? "cursor-not-allowed" : ""}`}
              onMouseDown={(e) => {
                // Prevent browser text/element selection when in selection mode
                if (isSelectionMode) {
                  e.preventDefault();
                }
                // Prevent interaction with non-deletable images in selection mode
                if (isSelectionMode && isNonDeletable) {
                  e.stopPropagation();
                }
              }}
              onClick={(e) => {
                if (isSelectionMode && !isNonDeletable) {
                  handleSelectionClick(imageKey, index, e.nativeEvent as MouseEvent, imagesToRender);
                } else if (isSelectionMode && isNonDeletable) {
                  e.stopPropagation();
                }
              }}
            >
            <div className="aspect-square relative">
              {/* Selection checkbox overlay */}
              {isSelectionMode && (
                <div className="absolute top-2 left-2 z-30 group/checkbox">
                  <div
                    className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${
                      isNonDeletable
                        ? "bg-gray-300 border-gray-400 dark:bg-gray-700 dark:border-gray-600 cursor-not-allowed opacity-60"
                        : isSelected
                          ? "bg-brand-600 border-brand-600 dark:bg-brand-500 dark:border-brand-500"
                          : "bg-white/90 border-gray-300 dark:bg-gray-800/90 dark:border-gray-600"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isNonDeletable) {
                        handleSelectionClick(imageKey, index, e.nativeEvent as MouseEvent, imagesToRender);
                      }
                    }}
                  >
                    {isSelected && !isNonDeletable && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                    {isNonDeletable && (
                      <div className="w-4 h-4 flex items-center justify-center">
                        <X className="w-3 h-3 text-gray-500 dark:text-gray-400" strokeWidth={3} />
                      </div>
                    )}
                  </div>
                  {isNonDeletable && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover/checkbox:opacity-100 group-hover/checkbox:visible transition-all duration-200 z-50 pointer-events-none">
                      {isApproved
                        ? "Nie można usunąć zdjęcia, które jest częścią zatwierdzonej selekcji klienta"
                        : "Nie można usunąć zdjęcia, które jest częścią dostarczonego zlecenia"}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                    </div>
                  )}
                </div>
              )}

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
                    className={`w-full h-full object-cover rounded-lg ${
                      isNonDeletable && isSelectionMode ? "opacity-60" : ""
                    }`}
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
                  {isDeleting && (
                    <div className="absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center rounded-lg z-30">
                      <div className="flex flex-col items-center space-y-2">
                        <Loading size="sm" />
                        <span className="text-white text-sm font-medium">Usuwanie...</span>
                      </div>
                    </div>
                  )}
                  {!isDeleting && !isSelectionMode && !isDelivered && (
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
                          disabled={isNonDeletable || allDeletingImages.size > 0}
                          className={`opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 text-sm font-medium rounded-md ${
                            isNonDeletable || allDeletingImages.size > 0
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
  };

  return (
    <>
      {/* Next Steps Overlay */}
      <NextStepsOverlay
        gallery={gallery}
        orders={
          orders.map((o) => ({
            ...o,
            galleryId: galleryId as string,
          })) as Order[]
        }
        galleryLoading={galleryLoading}
      />

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Zdjęcia w galerii
          </h1>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {imagesLoading ? (
              <Loading size="sm" />
            ) : (
              <>
                {images.length}{" "}
                {images.length === 1 ? "zdjęcie" : images.length < 5 ? "zdjęcia" : "zdjęć"}
                {imagesFetching && (
                  <span className="ml-2 text-xs opacity-75">(aktualizacja...)</span>
                )}
              </>
            )}
          </div>
        </div>
        {/* Action Buttons */}
        <div className="mb-4 flex items-center gap-3 flex-wrap">
          {!isSelectionMode && (
            <>
              <button
                onClick={() => setUploadModalOpen(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Plus size={20} />
                Prześlij zdjęcia
              </button>
              {images.length > 0 && (
                <button
                  onClick={toggleSelectionMode}
                  className="px-4 py-2 rounded-lg transition-colors flex items-center gap-2 bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  <Square size={20} />
                  Wybierz zdjęcia
                </button>
              )}
            </>
          )}
          {isSelectionMode && (
            <>
              <span className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg flex items-center gap-2 justify-center" style={{ width: "165.81px" }}>
                <CheckSquare size={20} />
                Tryb wyboru
              </span>
              <button
                onClick={() => {
                  toggleSelectionMode();
                  clearSelection();
                }}
                className="px-4 py-2 rounded-lg transition-colors flex items-center gap-2 bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 justify-center"
                style={{ width: "171.9px" }}
              >
                <X size={20} />
                Anuluj
              </button>
            </>
          )}
        </div>

        {/* Bulk Action Toolbar - Show immediately when selection mode is active */}
        {isSelectionMode && (
          <div className="sticky top-0 z-40 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm -mx-6 px-6 py-2 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {selectedKeys.size === 0
                    ? "0 zdjęć wybranych"
                    : selectedKeys.size === 1
                      ? "1 zdjęcie wybrane"
                      : selectedKeys.size < 5
                        ? `${selectedKeys.size} zdjęcia wybrane`
                        : `${selectedKeys.size} zdjęć wybranych`}
                </span>
                {(() => {
                  // Get count of selectable images (excluding approved and delivered)
                  const selectableImages = getSelectableImages(images);
                  const selectableCount = selectableImages.length;
                  const allSelected = selectableCount > 0 && selectedKeys.size === selectableCount;
                  return (
                    <>
                      <button
                        onClick={() => {
                          if (allSelected) {
                            deselectAll();
                          } else {
                            selectAll(images);
                          }
                        }}
                        className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        {allSelected ? "Odznacz wszystkie" : "Zaznacz wszystkie"}
                      </button>
                      {selectedKeys.size > 0 && (
                        <button
                          onClick={clearSelection}
                          className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                        >
                          Anuluj wybór
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleBulkDeleteClick}
                  disabled={isBulkDeleting || selectedKeys.size === 0}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 size={18} />
                  Usuń {selectedKeys.size > 0 && `(${selectedKeys.size})`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Images Grid - Grouped by Orders */}
        {imagesLoading ? (
          <GalleryLoading />
        ) : images.length === 0 ? (
          <EmptyState
            // eslint-disable-next-line jsx-a11y/alt-text
            icon={<Image size={64} aria-hidden="true" />}
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

              const orderImages = imagesByOrder.get(orderId) ?? [];
              if (orderImages.length === 0) {
                return null;
              }

              const sectionId = `order-${orderId}`;
              const isExpanded = expandedSections.has(sectionId);
              const orderDisplayNumber =
                order.orderNumber !== undefined && order.orderNumber !== null
                  ? String(order.orderNumber)
                  : orderId.slice(-8);

              const handleGoToOrder = (e: React.MouseEvent) => {
                e.stopPropagation();
                if (galleryIdStr && orderId) {
                  void router.push(`/galleries/${galleryIdStr}/orders/${orderId}`);
                }
              };

              return (
                <div
                  key={orderId}
                  className="bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700 overflow-hidden"
                >
                  <div className={`w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                    isExpanded ? "rounded-t-lg" : "rounded-lg"
                  }`}>
                    <button
                      onClick={() => toggleSection(sectionId)}
                      className="flex-1 text-left flex items-center gap-3 flex-wrap"
                    >
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
                    </button>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={handleGoToOrder}
                        className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                        title="Przejdź do zlecenia"
                      >
                        <span>Przejdź do zlecenia</span>
                        <ExternalLink size={14} />
                      </button>
                      <button
                        onClick={() => toggleSection(sectionId)}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                        aria-label={isExpanded ? "Zwiń sekcję" : "Rozwiń sekcję"}
                      >
                        <ChevronDown
                          size={16}
                          className={`text-gray-500 dark:text-gray-400 transition-transform flex-shrink-0 ${
                            isExpanded ? "transform rotate-180" : ""
                          }`}
                        />
                      </button>
                    </div>
                  </div>
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
                <div className={`w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                  expandedSections.has("unselected") ? "rounded-t-lg" : "rounded-lg"
                }`}>
                  <button
                    onClick={() => toggleSection("unselected")}
                    className="flex-1 text-left flex items-center gap-3"
                  >
                    <div className="font-semibold text-gray-900 dark:text-white">Niewybrane</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">
                      {unselectedImages.length}{" "}
                      {unselectedImages.length === 1
                        ? "zdjęcie"
                        : unselectedImages.length < 5
                          ? "zdjęcia"
                          : "zdjęć"}
                    </div>
                  </button>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={handleDeleteAllUnselectedClick}
                      disabled={isBulkDeleting}
                      className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Usuń wszystkie niewybrane zdjęcia"
                    >
                      <Trash2 size={14} />
                      <span>Usuń Wszystkie Niewybrane Zdjęcia</span>
                    </button>
                    <button
                      onClick={() => toggleSection("unselected")}
                      className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                      aria-label={expandedSections.has("unselected") ? "Zwiń sekcję" : "Rozwiń sekcję"}
                    >
                      <ChevronDown
                        size={16}
                        className={`text-gray-500 dark:text-gray-400 transition-transform flex-shrink-0 ${
                          expandedSections.has("unselected") ? "transform rotate-180" : ""
                        }`}
                      />
                    </button>
                  </div>
                </div>
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
            // User cancelled - just close the modal
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

      {/* Bulk Delete Confirmation Dialog */}
      <BulkDeleteConfirmDialog
        isOpen={bulkDeleteConfirmOpen}
        onClose={() => {
          if (!isBulkDeleting) {
            setBulkDeleteConfirmOpen(false);
          }
        }}
        onConfirm={handleBulkDeleteConfirm}
        count={selectedKeys.size}
        loading={isBulkDeleting}
        suppressKey="original_image_delete_confirm_suppress"
      />

      {/* Delete All Unselected Confirmation Dialog */}
      <BulkDeleteConfirmDialog
        isOpen={deleteAllUnselectedOpen}
        onClose={() => {
          if (!isBulkDeleting) {
            setDeleteAllUnselectedOpen(false);
            setUnselectedImagesToDelete([]);
          }
        }}
        onConfirm={handleDeleteAllUnselectedConfirm}
        count={unselectedImagesToDelete.length}
        loading={isBulkDeleting}
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
