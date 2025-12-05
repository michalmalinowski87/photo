import { useRouter } from "next/router";
import { useState, useEffect, useRef, useCallback } from "react";

import PaymentConfirmationModal from "../../../../components/galleries/PaymentConfirmationModal";
import { useGalleryType } from "../../../../components/hocs/withGalleryType";
import { ChangeRequestBanner } from "../../../../components/orders/ChangeRequestBanner";
import { DenyChangeRequestModal } from "../../../../components/orders/DenyChangeRequestModal";
import { FinalsTab } from "../../../../components/orders/FinalsTab";
import { OrderHeader } from "../../../../components/orders/OrderHeader";
import { OrderInfoCard } from "../../../../components/orders/OrderInfoCard";
import { OrderTabs } from "../../../../components/orders/OrderTabs";
import { OriginalsTab } from "../../../../components/orders/OriginalsTab";
import { ConfirmDialog } from "../../../../components/ui/confirm/ConfirmDialog";
import { UppyUploadModal } from "../../../../components/uppy/UppyUploadModal";
import { useFinalImageDelete } from "../../../../hooks/useFinalImageDelete";
import { useGallery } from "../../../../hooks/useGallery";
import { useOrderAmountEdit } from "../../../../hooks/useOrderAmountEdit";
import { usePageLogger } from "../../../../hooks/usePageLogger";
import { useToast } from "../../../../hooks/useToast";
import api, { formatApiError } from "../../../../lib/api-service";
import { removeFileExtension } from "../../../../lib/filename-utils";
import { filterDeletedImages, normalizeSelectedKeys } from "../../../../lib/order-utils";
import { useGalleryStore, useOrderStore, useUserStore } from "../../../../store";

interface GalleryImage {
  id?: string;
  key?: string;
  filename?: string;
  url?: string;
  thumbUrl?: string;
  previewUrl?: string;
  finalUrl?: string;
  isPlaceholder?: boolean;
  uploadTimestamp?: number;
  uploadIndex?: number;
  size?: number;
  [key: string]: unknown;
}

// Order type is imported from orderSlice store (single source of truth)

interface Gallery {
  galleryId: string;
  ownerId?: string;
  name?: string;
  clientEmail?: string;
  selectionEnabled?: boolean;
  state?: string;
  isPaid?: boolean;
  [key: string]: unknown;
}

interface PaymentDetails {
  totalAmountCents: number;
  walletAmountCents: number;
  stripeAmountCents: number;
  balanceAfterPayment?: number;
}

export default function OrderDetail() {
  const { showToast } = useToast();
  const router = useRouter();
  const { id: galleryId, orderId } = router.query;
  const { logDataLoad, logDataLoaded, logDataError, logUserAction, logSkippedLoad } = usePageLogger(
    {
      pageName: "OrderDetail",
    }
  );
  // Get reloadGallery function from GalleryContext to refresh gallery data after payment
  const { reloadGallery } = useGallery();
  const { isNonSelectionGallery } = useGalleryType();
  const [loading, setLoading] = useState<boolean>(false); // Only for image loading, not order loading
  const [error, setError] = useState<string>("");
  // Use Zustand store as single source of truth for order data (shared with sidebar and top bar)
  const order = useOrderStore((state) => state.currentOrder);
  const setCurrentOrder = useOrderStore((state) => state.setCurrentOrder);
  // Use Zustand store for gallery data
  const gallery = useGalleryStore((state) => state.currentGallery);
  const [activeTab, setActiveTab] = useState<"originals" | "finals">("originals");
  const [denyModalOpen, setDenyModalOpen] = useState<boolean>(false);
  const [originalImages, setOriginalImages] = useState<GalleryImage[]>([]);
  const [finalImages, setFinalImages] = useState<GalleryImage[]>([]);
  const [optimisticFinalsBytes, setOptimisticFinalsBytes] = useState<number | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [imageToDelete, setImageToDelete] = useState<GalleryImage | null>(null);
  const loadingOrderDataRef = useRef<boolean>(false); // Ref to prevent concurrent loadOrderData calls
  const orderDataLoadedRef = useRef<boolean>(false); // Track if we've successfully loaded order data
  // Refs for tracking deleted images (initialized early for use in loadOrderData)
  const deletingImagesRefForLoad = useRef<Set<string>>(new Set());
  const deletedImageKeysRefForLoad = useRef<Set<string>>(new Set());
  const [paymentLoading, setPaymentLoading] = useState<boolean>(false);
  const [paymentDetails] = useState<PaymentDetails | null>(null);
  const [showPaymentConfirmationModal, setShowPaymentConfirmationModal] = useState<boolean>(false);

  // Get wallet balance directly from store - no local state needed
  const walletBalance = useUserStore((state) => state.walletBalanceCents ?? 0);

  const loadOrderData = useCallback(async (): Promise<void> => {
    if (!galleryId || !orderId) {
      logSkippedLoad("orderData", "Missing galleryId or orderId", { galleryId, orderId });
      return;
    }

    // Prevent concurrent calls
    if (loadingOrderDataRef.current) {
      logSkippedLoad("orderData", "Concurrent call prevented", { galleryId, orderId });
      return;
    }

    // Check if we already have the order in the store before fetching
    // This prevents unnecessary loading states when navigating between tabs
    const orderStore = useOrderStore.getState();
    const orderIdStr = Array.isArray(orderId) ? orderId[0] : orderId;
    if (orderStore.currentOrder?.orderId === orderIdStr) {
      // Order is already in store - just load images (no need to set loading state for order)
      // Only set loading for images, not for order (which is already loaded)
      loadingOrderDataRef.current = true;
      setLoading(true);
      setError("");

      try {
        const { fetchGalleryImages, currentGallery } = useGalleryStore.getState();
        const apiImages = await fetchGalleryImages(galleryId as string).catch((err) => {
          console.error("Failed to load gallery images:", err);
          return [];
        });

        setOriginalImages(apiImages);

        // Load final images
        try {
          const finalResponse = await api.orders.getFinalImages(
            galleryId as string,
            orderId as string
          );
          const imagesWithCacheBusting = finalResponse.images ?? [];
          const mappedFinalImages = imagesWithCacheBusting.map((img: GalleryImage) => ({
            ...img,
            url: img.thumbUrl ?? img.previewUrl ?? img.finalUrl ?? img.url ?? "",
            finalUrl: img.finalUrl ?? img.url ?? "",
          }));

          const validApiImages = filterDeletedImages(
            mappedFinalImages,
            deletingImagesRefForLoad.current,
            deletedImageKeysRefForLoad.current
          );

          setFinalImages((currentImages) => {
            const deletingImageKeys = Array.from(deletingImagesRefForLoad.current);
            const currentDeletingImages = currentImages.filter((img) => {
              const imgKey = img.key ?? img.filename;
              return imgKey && deletingImageKeys.includes(imgKey);
            });

            const apiImagesMap = new Map<string, GalleryImage>(
              validApiImages.map((img) => [img.key ?? img.filename ?? "", img])
            );

            currentDeletingImages.forEach((img) => {
              const imgKey = img.key ?? img.filename;
              if (imgKey && !apiImagesMap.has(imgKey) && img.url && img.finalUrl) {
                apiImagesMap.set(imgKey, img);
              }
            });

            return Array.from(apiImagesMap.values());
          });
        } catch (_err) {
          setFinalImages([]);
        }
      } finally {
        setLoading(false);
        loadingOrderDataRef.current = false;
        orderDataLoadedRef.current = true;
      }
      return;
    }

    loadingOrderDataRef.current = true;
    setLoading(true);
    setError("");

    try {
      // Use store actions - they check cache first and fetch if needed
      const { fetchOrder } = useOrderStore.getState();
      const { fetchGalleryImages, currentGallery } = useGalleryStore.getState();

      // Fetch order and images in parallel
      // NOTE: Don't fetch gallery data here - it would overwrite accurate bytes values
      // Gallery bytes are managed by recalculation, not by reloading gallery data
      const [orderData, apiImages] = await Promise.all([
        fetchOrder(galleryId as string, orderId as string).catch((err) => {
          console.error("Failed to load order:", err);
          return null;
        }),
        fetchGalleryImages(galleryId as string).catch((err) => {
          console.error("Failed to load gallery images:", err);
          return [];
        }),
      ]);

      if (orderData) {
        // Update store with fresh order data
        setCurrentOrder(orderData);
      }

      // Don't fetch gallery here - GalleryLayoutWrapper handles gallery fetching
      // Gallery should already be in store from GalleryLayoutWrapper

      setOriginalImages(apiImages);

      // Always try to load final images (for viewing) - upload restrictions are handled separately
      // Keep loading state true while loading final images
      try {
        const finalResponse = await api.orders.getFinalImages(
          galleryId as string,
          orderId as string
        );
        // Cache busting is handled automatically by LazyRetryableImage component
        // using S3 lastModified timestamp (changes automatically when new photos are uploaded)
        const imagesWithCacheBusting = finalResponse.images ?? [];
        // Map final images - keep finalUrl for download, use thumbUrl/previewUrl for display
        // Image loading priority: CloudFront thumb → CloudFront preview → S3 full (last resort only)
        // We NEVER fetch full S3 images (finalUrl) if thumbnails/previews are available
        const mappedFinalImages = imagesWithCacheBusting.map((img: GalleryImage) => ({
          ...img,
          url: img.thumbUrl ?? img.previewUrl ?? img.finalUrl ?? img.url ?? "", // Prioritize thumb/preview
          finalUrl: img.finalUrl ?? img.url ?? "", // Keep original for download (not for display)
        }));

        // Filter out deleted images from API response
        const validApiImages = filterDeletedImages(
          mappedFinalImages,
          deletingImagesRefForLoad.current,
          deletedImageKeysRefForLoad.current
        );

        // Preserve images that are currently being deleted (they may not be in API response yet)
        // Merge deleting images from current state to show deleting overlay
        setFinalImages((currentImages) => {
          const deletingImageKeys = Array.from(deletingImagesRefForLoad.current);
          const currentDeletingImages = currentImages.filter((img) => {
            const imgKey = img.key ?? img.filename;
            return imgKey && deletingImageKeys.includes(imgKey);
          });

          // Create a map of valid API images by key for deduplication
          const apiImagesMap = new Map<string, GalleryImage>(
            validApiImages.map((img) => [img.key ?? img.filename ?? "", img])
          );

          // Add deleting images that aren't already in API response
          currentDeletingImages.forEach((img) => {
            const imgKey = img.key ?? img.filename;
            if (imgKey && !apiImagesMap.has(imgKey) && img.url && img.finalUrl) {
              // Ensure required fields exist before adding
              apiImagesMap.set(imgKey, img);
            }
          });

          // Return merged array (API images + preserved deleting images)
          return Array.from(apiImagesMap.values());
        });
      } catch (_err) {
        // Final images might not exist yet - set empty array
        setFinalImages([]);
      }
    } catch (err) {
      // Handle CORS and network errors gracefully
      const error = err as Error & { status?: number; originalError?: Error };
      const isCorsError =
        error.message?.includes("CORS") || error.message?.includes("Failed to fetch");
      const isNetworkError = error.message?.includes("Network error");

      if (isCorsError || isNetworkError) {
        // Don't set error state for CORS errors - they're usually temporary
      } else {
        const errorMsg = formatApiError(err);
        setError(errorMsg ?? "Nie udało się załadować danych zlecenia");
        showToast("error", "Błąd", errorMsg ?? "Nie udało się załadować danych zlecenia");
      }
    } finally {
      setLoading(false);
      loadingOrderDataRef.current = false;
      // Mark as loaded if we got the order
      const finalOrder = useOrderStore.getState().currentOrder;
      if (finalOrder?.orderId === orderId) {
        orderDataLoadedRef.current = true;
      }
    }
  }, [galleryId, orderId, showToast]);

  // Use hooks for order actions and amount editing (after state declarations)
  const {
    isEditingAmount,
    editingAmountValue,
    savingAmount,
    setEditingAmountValue,
    handleStartEditAmount,
    handleCancelEditAmount,
    handleSaveAmount,
  } = useOrderAmountEdit({
    galleryId,
    orderId,
    currentTotalCents: order?.totalCents ?? 0,
    onSave: loadOrderData,
  });

  const {
    deleteImage,
    handleDeleteImageClick,
    deletingImages,
    deletingImagesRef,
    deletedImageKeysRef,
  } = useFinalImageDelete({
    galleryId,
    orderId,
    setFinalImages,
    setOptimisticFinalsBytes,
  });

  // Sync refs for use in loadOrderData
  useEffect(() => {
    deletingImagesRefForLoad.current = deletingImagesRef.current;
  }, [deletingImagesRef]);

  useEffect(() => {
    deletedImageKeysRefForLoad.current = deletedImageKeysRef.current;
  }, [deletedImageKeysRef]);

  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  // Check for recovery state and auto-open modal
  useEffect(() => {
    if (!galleryId || !orderId || typeof window === "undefined") {
      return;
    }

    const storageKey = `uppy_upload_state_${galleryId}_finals`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const state = JSON.parse(stored) as {
          isActiveUpload?: boolean;
          galleryId: string;
          orderId?: string;
          type: string;
        };
        // If there's an active upload state for this order, open the modal to allow recovery
        if (
          state.isActiveUpload &&
          state.galleryId === galleryId &&
          state.orderId === orderId &&
          state.type === "finals"
        ) {
          setUploadModalOpen(true);
        }
      } catch {
        // Ignore invalid entries
      }
    }
  }, [galleryId, orderId]);

  // Handle modal close - clear recovery flag if modal was auto-opened from recovery
  const handleUploadModalClose = useCallback(() => {
    setUploadModalOpen(false);

    // If modal was auto-opened from recovery and user closes it, clear the recovery flag
    // so the global recovery modal doesn't keep showing
    if (galleryId && orderId && typeof window !== "undefined") {
      const storageKey = `uppy_upload_state_${galleryId}_finals`;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        try {
          const state = JSON.parse(stored) as {
            isActiveUpload?: boolean;
            galleryId: string;
            orderId?: string;
            type: string;
          };
          if (state.isActiveUpload && state.orderId === orderId) {
            // Clear the active flag but keep the state (in case user wants to manually resume later)
            const updatedState = { ...state, isActiveUpload: false };
            localStorage.setItem(storageKey, JSON.stringify(updatedState));
          }
        } catch {
          // Ignore invalid entries
        }
      }
    }
  }, [galleryId, orderId]);

  // Reload final images after upload (simple refetch, no polling)
  const reloadFinalImagesAfterUpload = useCallback(async () => {
    if (!galleryId || !orderId) {
      return;
    }

    try {
      const finalResponse = await api.orders.getFinalImages(galleryId as string, orderId as string);
      // Cache busting is handled automatically by LazyRetryableImage component
      // using S3 lastModified timestamp (changes automatically when new photos are uploaded)
      const imagesWithCacheBusting = finalResponse.images ?? [];
      const mappedFinalImages = imagesWithCacheBusting.map((img: GalleryImage) => ({
        ...img,
        url: img.previewUrl ?? img.thumbUrl ?? img.finalUrl ?? img.url ?? "",
        finalUrl: img.finalUrl ?? img.url ?? "",
      }));
      const validApiImages = filterDeletedImages(
        mappedFinalImages as Array<{
          url: string;
          finalUrl: string;
          id?: string;
          key?: string;
          filename?: string;
          thumbUrl?: string;
          previewUrl?: string;
          isPlaceholder?: boolean;
          uploadTimestamp?: number;
          uploadIndex?: number;
          size?: number;
        }>,
        deletingImagesRef.current,
        deletedImageKeysRef.current
      );

      // Update local state
      setFinalImages((currentImages) => {
        const deletingImageKeys = Array.from(deletingImagesRef.current);
        const currentDeletingImages = currentImages.filter((img) => {
          const imgKey = img.key ?? img.filename;
          return imgKey && deletingImageKeys.includes(imgKey);
        });
        const updatedImagesMap = new Map<string, GalleryImage>(
          validApiImages.map((img) => [img.key ?? img.filename ?? "", img])
        );
        currentDeletingImages.forEach((img) => {
          const imgKey = img.key ?? img.filename;
          if (imgKey && !updatedImagesMap.has(imgKey) && img.url && img.finalUrl) {
            updatedImagesMap.set(imgKey, img);
          }
        });
        return Array.from(updatedImagesMap.values());
      });
    } catch (err) {
      console.error("[OrderDetail] Failed to reload final images:", err);
    }
  }, [galleryId, orderId, deletingImagesRef, deletedImageKeysRef]);

  // Load order data once when component mounts or orderId changes
  // Auth is handled by AuthProvider/ProtectedRoute - just load data
  useEffect(() => {
    if (galleryId && orderId) {
      const orderIdStr = Array.isArray(orderId) ? orderId[0] : orderId;

      // Check store first - if order is already there, don't fetch
      const storeOrder = useOrderStore.getState().currentOrder;
      if (storeOrder?.orderId === orderIdStr) {
        // Order is already in store - just load images if needed
        return;
      }

      // Order not in store - load it
      if (!loadingOrderDataRef.current) {
        void loadOrderData();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId, orderId]);

  // Listen for finals uploads to update optimistic finals bytes from store
  useEffect(() => {
    if (!galleryId || !gallery) {
      return undefined;
    }

    // Subscribe to Zustand store changes for finals bytes (handles optimistic updates)
    let prevFinalsBytes: number | undefined = gallery.finalsBytesUsed as number | undefined;
    const unsubscribe = useGalleryStore.subscribe((state) => {
      const currentGallery = state.currentGallery;
      const currentFinalsBytes =
        currentGallery?.galleryId === galleryId
          ? (currentGallery.finalsBytesUsed as number | undefined)
          : undefined;

      // Only fire if value actually changed and it's our gallery
      if (currentFinalsBytes !== undefined && currentFinalsBytes !== prevFinalsBytes) {
        prevFinalsBytes = currentFinalsBytes;
        setOptimisticFinalsBytes((prev) => {
          if (prev !== currentFinalsBytes) {
            return currentFinalsBytes;
          }
          return prev;
        });
      }
    });

    return () => {
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId, gallery?.galleryId]); // Use galleryId to prevent infinite loops

  // Auto-set to finals tab if selection is disabled (non-selection galleries)
  // Use stable identifiers instead of entire objects to prevent infinite loops
  const gallerySelectionEnabled = gallery?.selectionEnabled;
  const orderIdForTab = order?.orderId;
  useEffect(() => {
    if (!order || !gallery) {
      return;
    }

    if (gallery.selectionEnabled === false) {
      setActiveTab("finals");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gallerySelectionEnabled, orderIdForTab]); // Use stable identifiers instead of entire objects

  // For non-selection galleries, always show finals tab (no tab switcher)
  const shouldShowTabs = !isNonSelectionGallery;

  const handlePayClick = (): void => {
    if (!galleryId || paymentLoading) {
      return;
    }
    // Navigate to gallery page with publish param - GalleryLayoutWrapper will handle opening wizard
    void router.push(
      `/galleries/${galleryId as string}?publish=true&galleryId=${galleryId as string}`
    );
  };

  const handlePaymentConfirm = async (): Promise<void> => {
    if (!galleryId || !paymentDetails) {
      return;
    }

    // Payment handled - no need to close wizard (we navigated away)
    setPaymentLoading(true);

    try {
      // Backend will automatically use full Stripe if wallet is insufficient (no partial payments)
      const data = await api.galleries.pay(galleryId as string, {});

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else if (data.paid) {
        showToast("success", "Sukces", "Galeria została opłacona z portfela!");
        // Reload gallery data to update payment status in sidebar and header
        if (reloadGallery) {
          await reloadGallery();
        }
        await loadOrderData();
      }
    } catch (err) {
      const errorMsg = formatApiError(err);
      showToast("error", "Błąd", errorMsg ?? "Nie udało się opłacić galerii");
    } finally {
      setPaymentLoading(false);
    }
  };

  // handleFileSelect is now provided by usePhotoUploadHandler hook above

  const handleDeleteFinalImageClick = (image: GalleryImage): void => {
    const imageToDeleteResult = handleDeleteImageClick(image);
    if (imageToDeleteResult) {
      setImageToDelete(imageToDeleteResult);
      setDeleteConfirmOpen(true);
    }
  };

  const handleDeleteFinal = async (suppressChecked?: boolean): Promise<void> => {
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

  // Use store actions directly
  const approveChangeRequest = useOrderStore((state) => state.approveChangeRequest);
  const denyChangeRequest = useOrderStore((state) => state.denyChangeRequest);
  const denyLoading = useOrderStore((state) => state.denyLoading);

  const handleApproveChangeRequest = useCallback(async () => {
    if (!galleryId || !orderId) {
      return;
    }
    await approveChangeRequest(galleryId as string, orderId as string);
    await loadOrderData();
    if (reloadGallery) {
      await reloadGallery();
    }
  }, [galleryId, orderId, approveChangeRequest, loadOrderData, reloadGallery]);

  const handleDenyChangeRequest = useCallback(() => {
    setDenyModalOpen(true);
  }, []);

  const handleDenyConfirm = useCallback(
    async (reason?: string) => {
      if (!galleryId || !orderId) {
        return;
      }
      await denyChangeRequest(galleryId as string, orderId as string, reason);
      setDenyModalOpen(false);
      await loadOrderData();
      if (reloadGallery) {
        await reloadGallery();
      }
    },
    [galleryId, orderId, denyChangeRequest, loadOrderData, reloadGallery]
  );

  // GalleryLayoutWrapper handles order loading - we only handle image loading here
  // Only show error if we have an error and no order after loading completed
  if (!order && error) {
    return (
      <div className="p-4">
        <div>{error ?? "Nie znaleziono zlecenia"}</div>
      </div>
    );
  }

  // If we don't have an order yet, GalleryLayoutWrapper is showing loading - just return empty
  // Don't show another loading overlay here
  if (!order) {
    return null;
  }

  // Normalize selectedKeys - handle both array and string formats
  // For non-selection galleries, empty/undefined selectedKeys means "all photos"
  const selectedKeys = normalizeSelectedKeys(order.selectedKeys);
  const selectionEnabled = gallery?.selectionEnabled !== false; // Default to true if not specified

  // Check if gallery is paid (not DRAFT state)
  const isGalleryPaid = gallery?.state !== "DRAFT" && gallery?.isPaid !== false;

  // Allow upload for final photos when gallery is paid and order is not in a blocked state
  // Block uploads only for: CANCELLED
  // Allow uploads for: CLIENT_APPROVED, AWAITING_FINAL_PHOTOS, PREPARING_DELIVERY, PREPARING_FOR_DELIVERY
  // Also allow uploads for non-selection galleries even if deliveryStatus is undefined (legacy orders)
  // Note: Backend uses PREPARING_DELIVERY (without "FOR")
  const blockedUploadStatuses = ["CANCELLED"];
  const canUploadFinals =
    isGalleryPaid &&
    !blockedUploadStatuses.includes(order.deliveryStatus ?? "") &&
    ((!selectionEnabled && !order.deliveryStatus) || // Legacy orders without deliveryStatus in non-selection galleries
      !order.deliveryStatus || // Allow if no status set
      order.deliveryStatus === "CLIENT_APPROVED" ||
      order.deliveryStatus === "AWAITING_FINAL_PHOTOS" ||
      order.deliveryStatus === "PREPARING_DELIVERY" ||
      order.deliveryStatus === "PREPARING_FOR_DELIVERY");

  return (
    <div className="space-y-6">
      <OrderHeader />

      {error && <div>{error}</div>}

      {order.deliveryStatus === "CHANGES_REQUESTED" && (
        <ChangeRequestBanner
          onApprove={handleApproveChangeRequest}
          onDeny={handleDenyChangeRequest}
        />
      )}

      <OrderInfoCard
        isEditingAmount={isEditingAmount}
        editingAmountValue={editingAmountValue}
        savingAmount={savingAmount}
        onStartEdit={handleStartEditAmount}
        onCancelEdit={handleCancelEditAmount}
        onSave={handleSaveAmount}
        onAmountChange={setEditingAmountValue}
      />

      {shouldShowTabs && (
        <OrderTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          finalsCount={finalImages.length}
        />
      )}

      {shouldShowTabs && activeTab === "originals" && (
        <OriginalsTab
          images={originalImages}
          selectedKeys={selectedKeys}
          selectionEnabled={selectionEnabled}
          deliveryStatus={order.deliveryStatus}
        />
      )}

      {(!shouldShowTabs || activeTab === "finals") && (
        <FinalsTab
          images={finalImages}
          canUpload={canUploadFinals}
          deletingImages={deletingImages}
          onUploadClick={() => setUploadModalOpen(true)}
          onDeleteImage={handleDeleteFinalImageClick}
          isGalleryPaid={isGalleryPaid}
          orderDeliveryStatus={order.deliveryStatus}
          isNonSelectionGallery={isNonSelectionGallery}
        />
      )}

      {/* Uppy Upload Modal for Finals */}
      {galleryId && orderId && (
        <UppyUploadModal
          isOpen={uploadModalOpen}
          onClose={handleUploadModalClose}
          config={{
            galleryId: galleryId as string,
            orderId: orderId as string,
            type: "finals",
            onUploadComplete: () => {
              setUploadModalOpen(false);
            },
            reloadGallery: reloadFinalImagesAfterUpload,
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
        onConfirm={handleDeleteFinal}
        title="Usuń zdjęcie"
        message={
          imageToDelete
            ? `Czy na pewno chcesz usunąć zdjęcie "${removeFileExtension(imageToDelete.key ?? imageToDelete.filename ?? "")}"?\nTa operacja jest nieodwracalna.`
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
        suppressKey="final_image_delete_confirm_suppress"
      />

      {/* Deny Change Request Modal */}
      <DenyChangeRequestModal
        isOpen={denyModalOpen}
        onClose={() => setDenyModalOpen(false)}
        onConfirm={handleDenyConfirm}
        loading={denyLoading}
      />

      {/* Payment Confirmation Modal */}
      {paymentDetails && (
        <PaymentConfirmationModal
          isOpen={showPaymentConfirmationModal}
          onClose={() => setShowPaymentConfirmationModal(false)}
          onConfirm={handlePaymentConfirm}
          totalAmountCents={paymentDetails.totalAmountCents}
          walletBalanceCents={walletBalance}
          walletAmountCents={paymentDetails.walletAmountCents}
          stripeAmountCents={paymentDetails.stripeAmountCents}
          loading={paymentLoading}
        />
      )}
    </div>
  );
}
