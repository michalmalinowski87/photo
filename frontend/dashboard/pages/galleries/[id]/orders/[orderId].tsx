import { useRouter } from "next/router";
import { useState, useEffect, useRef, useCallback } from "react";

import PaymentConfirmationModal from "../../../../components/galleries/PaymentConfirmationModal";
import { PublishGalleryWizard } from "../../../../components/galleries/PublishGalleryWizard";
import { ChangeRequestBanner } from "../../../../components/orders/ChangeRequestBanner";
import { DenyChangeRequestModal } from "../../../../components/orders/DenyChangeRequestModal";
import { FinalsTab } from "../../../../components/orders/FinalsTab";
import { OrderHeader } from "../../../../components/orders/OrderHeader";
import { OrderInfoCard } from "../../../../components/orders/OrderInfoCard";
import { OrderTabs } from "../../../../components/orders/OrderTabs";
import { OriginalsTab } from "../../../../components/orders/OriginalsTab";
import { UploadProgressWrapper } from "../../../../components/orders/UploadProgressWrapper";
import { ConfirmDialog } from "../../../../components/ui/confirm/ConfirmDialog";
import { FullPageLoading } from "../../../../components/ui/loading/Loading";
import { usePhotoUploadHandler } from "../../../../components/upload/PhotoUploadHandler";
import type { PerImageProgress } from "../../../../components/upload/UploadProgressOverlay";
import { useFinalImageDelete } from "../../../../hooks/useFinalImageDelete";
import { useGallery } from "../../../../hooks/useGallery";
import { useOrderActions } from "../../../../hooks/useOrderActions";
import { useOrderAmountEdit } from "../../../../hooks/useOrderAmountEdit";
import { useOrderStatusRefresh } from "../../../../hooks/useOrderStatusRefresh";
import { useToast } from "../../../../hooks/useToast";
import api, { formatApiError } from "../../../../lib/api-service";
import { initializeAuth, redirectToLandingSignIn } from "../../../../lib/auth-init";
import { filterDeletedImages, normalizeSelectedKeys } from "../../../../lib/order-utils";
import { useGalleryStore } from "../../../../store/gallerySlice";
import { useOrderStore } from "../../../../store/orderSlice";
import { useUserStore } from "../../../../store/userSlice";

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
  // Get reloadGallery function from GalleryContext to refresh gallery data after payment
  const { reloadGallery } = useGallery();
  const [loading, setLoading] = useState<boolean>(true); // Start with true to prevent flicker
  const [error, setError] = useState<string>("");
  // Use Zustand store as single source of truth for order data (shared with sidebar and top bar)
  const order = useOrderStore((state) => state.currentOrder);
  const setCurrentOrder = useOrderStore((state) => state.setCurrentOrder);
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [activeTab, setActiveTab] = useState<"originals" | "finals">("originals");
  const [denyModalOpen, setDenyModalOpen] = useState<boolean>(false);
  const [denyLoading, setDenyLoading] = useState<boolean>(false);
  const [originalImages, setOriginalImages] = useState<GalleryImage[]>([]);
  const [finalImages, setFinalImages] = useState<GalleryImage[]>([]);
  const [optimisticFinalsBytes, setOptimisticFinalsBytes] = useState<number | null>(null);
  const { statusLastUpdatedRef } = useOrderStatusRefresh();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [imageToDelete, setImageToDelete] = useState<GalleryImage | null>(null);
  const loadingOrderDataRef = useRef<boolean>(false); // Ref to prevent concurrent loadOrderData calls
  // Refs for tracking deleted images (initialized early for use in loadOrderData)
  const deletingImagesRefForLoad = useRef<Set<string>>(new Set());
  const deletedImageKeysRefForLoad = useRef<Set<string>>(new Set());
  const [paymentLoading, setPaymentLoading] = useState<boolean>(false);
  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
  const [paymentDetails] = useState<PaymentDetails | null>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);

  // Define functions first (before useEffect hooks that use them)
  const loadWalletBalance = useCallback(async (): Promise<number> => {
    // Use cached wallet balance from Zustand store (userSlice handles caching)
    const { walletBalanceCents, refreshWalletBalance } = useUserStore.getState();
    if (walletBalanceCents !== null) {
      setWalletBalance(walletBalanceCents);
      return walletBalanceCents;
    }

    // If not cached, fetch and it will be cached by userSlice
    try {
      await refreshWalletBalance();
      const updatedBalance = useUserStore.getState().walletBalanceCents ?? 0;
      setWalletBalance(updatedBalance);
      return updatedBalance;
    } catch (_err) {
      // Silently fail - wallet balance is not critical for this page
      setWalletBalance(0);
      return 0;
    }
  }, []);

  /**
   * Load order data with intelligent caching:
   * - Uses store actions that check cache first (30s TTL)
   * - Only fetches missing/stale data
   * - GalleryLayoutWrapper is the single source of truth for gallery data
   * - Order data is cached per orderId
   * - Images are cached per galleryId
   */
  const loadOrderData = useCallback(
    async (forceRefresh = false): Promise<void> => {
      if (!galleryId || !orderId) {
        return;
      }

      // Prevent concurrent calls
      if (loadingOrderDataRef.current && !forceRefresh) {
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
        // NOTE: Always use forceRefresh=true to ensure we get fresh order data (status might have changed)
        const [orderData, apiImages] = await Promise.all([
          fetchOrder(galleryId as string, orderId as string, true).catch((err) => {
            console.error("Failed to load order:", err);
            return null;
          }),
          fetchGalleryImages(galleryId as string, forceRefresh).catch((err) => {
            console.error("Failed to load gallery images:", err);
            return [];
          }),
        ]);

        if (orderData) {
          // Preserve status fields if they were recently updated (within last 5 seconds)
          // This prevents cache from overwriting fresh status updates
          const currentOrderInStore = useOrderStore.getState().currentOrder;
          const fiveSecondsAgo = Date.now() - 5000;
          const statusRecentlyUpdated = statusLastUpdatedRef.current > fiveSecondsAgo;
          
          if (statusRecentlyUpdated && 
              currentOrderInStore?.deliveryStatus && 
              (currentOrderInStore.deliveryStatus !== orderData.deliveryStatus || 
               currentOrderInStore.paymentStatus !== orderData.paymentStatus)) {
            // Status was recently updated, preserve it
            setCurrentOrder({
              ...orderData,
              deliveryStatus: currentOrderInStore.deliveryStatus,
              paymentStatus: currentOrderInStore.paymentStatus,
              updatedAt: currentOrderInStore.updatedAt,
            });
          } else {
            // Update store with fresh order data
            setCurrentOrder(orderData);
          }
        }
        
        // Preserve current gallery state - don't overwrite with stale data
        // Only update if we don't have gallery data yet
        if (!gallery && currentGallery?.galleryId === galleryId) {
          setGallery(currentGallery);
        }

        setOriginalImages(apiImages);

        // Always try to load final images (for viewing) - upload restrictions are handled separately
        try {
          const finalResponse = await api.orders.getFinalImages(
            galleryId as string,
            orderId as string
          );
          // Map final images - keep finalUrl for download, use previewUrl/thumbUrl for display
          const mappedFinalImages = (finalResponse.images ?? []).map((img: GalleryImage) => ({
            ...img,
            url: img.previewUrl ?? img.thumbUrl ?? img.finalUrl ?? img.url ?? "", // Use WebP for display
            finalUrl: img.finalUrl ?? img.url ?? "", // Keep original for download
          }));

          // Filter out deleted images from API response
          const validApiImages = filterDeletedImages(
            mappedFinalImages,
            deletingImagesRefForLoad.current,
            deletedImageKeysRefForLoad.current
          );

          // Set images directly - no placeholders
          setFinalImages(validApiImages);
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
      }
    },
    [galleryId, orderId, showToast]
  );

  // Track per-image upload progress
  const [perImageProgress] = useState<PerImageProgress[]>([]);

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

  const { refreshOrderStatus } = useOrderStatusRefresh();

  // Use universal photo upload handler (after loadOrderData is defined)
  const {
    handleFileSelect,
    uploading,
    uploadProgress,
    perImageProgress: handlerPerImageProgress,
    isUploadComplete,
    cancelUpload,
  } = usePhotoUploadHandler({
    galleryId: galleryId as string,
    orderId: orderId as string,
    type: "finals",
    getInitialImageCount: () => finalImages.length,
    onPerImageProgress: () => {
      // Progress is handled by UploadProgressWrapper component
    },
    onUploadSuccess: (_fileName, _file, _uploadedKey) => {
      // Optimistic update is already handled by useS3Upload.ts
      // No need to update here to avoid double-counting (same pattern as originals)
      // File uploaded successfully - optimistic update already handled by useS3Upload
    },
    onImagesUpdated: (updatedImages) => {
      // For finals, map images to include previewUrl/thumbUrl/finalUrl structure
      const mappedImages = updatedImages.map((img: GalleryImage) => ({
        ...img,
        url: img.previewUrl ?? img.thumbUrl ?? img.finalUrl ?? img.url ?? "", // Use WebP for display
        finalUrl: img.finalUrl ?? img.url ?? "", // Keep original for download
      }));

      const validApiImages = filterDeletedImages(
        mappedImages,
        deletingImagesRef.current,
        deletedImageKeysRef.current
      );

      // Only update if we have valid images with URLs
      if (validApiImages.length > 0) {
        setFinalImages(validApiImages);
      }
    },
    onUploadComplete: () => {
      // Reload final images from API after upload completes to ensure we have the latest data
      // Note: Storage recalculation already happened after S3 upload (in PhotoUploadHandler)
      // Order status is refreshed via onOrderUpdated callback (called after markFinalUploadComplete)
      // This just refreshes the order data to show the new images
      if (galleryId && orderId) {
        void loadOrderData();
      }
    },
    onOrderUpdated: async (updatedOrderId) => {
      // Refresh order status when order is updated (e.g., after upload-complete endpoint)
      if (galleryId && updatedOrderId) {
        try {
          const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : (galleryId);
          const orderIdStr = Array.isArray(orderId) ? orderId[0] : (orderId as string);
          if (galleryIdStr && orderIdStr && updatedOrderId === orderIdStr) {
            await refreshOrderStatus(galleryIdStr, orderIdStr);
          }
        } catch (statusErr) {
          // eslint-disable-next-line no-console
          console.error("[STATUS_UPDATE] onOrderUpdated - Failed to refresh order status", statusErr);
        }
      }
    },
    loadOrderData,
    deletingImagesRef,
    deletedImageKeysRef,
  });


  useEffect(() => {
    initializeAuth(
      () => {
        if (galleryId && orderId) {
          void loadOrderData();
          void loadWalletBalance();
        }
      },
      () => {
        const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : (galleryId ?? "");
        const orderIdStr = Array.isArray(orderId) ? orderId[0] : (orderId ?? "");
        redirectToLandingSignIn(`/galleries/${galleryIdStr}/orders/${orderIdStr}`);
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId, orderId]); // Removed loadOrderData and loadWalletBalance from deps to avoid infinite loops

  // Watch order and gallery state for updates (Zustand subscriptions)
  const orderCache = useOrderStore((state) => orderId ? state.orderCache[orderId as string] : null);
  const currentGallery = useGalleryStore((state) => state.currentGallery);
  
  useEffect(() => {
    if (orderId && orderCache) {
      // Order was updated in store, reload to get latest data
      void loadOrderData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, orderCache?.timestamp]);

  useEffect(() => {
    if (galleryId && currentGallery?.galleryId === galleryId) {
      // Gallery was updated (e.g., payment completed), reload order data
      void loadOrderData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId, currentGallery?.isPaid, currentGallery?.state]);

  // Listen for finals uploads to update gallery's finalsBytesUsed reactively with optimistic updates
  useEffect(() => {
    if (!galleryId) {
      return undefined;
    }

    // Ensure gallery is in store before subscribing (needed for updateFinalsBytesUsed to work)
    if (gallery && useGalleryStore.getState().currentGallery?.galleryId !== galleryId) {
      const { setCurrentGallery } = useGalleryStore.getState();
      // Only set if gallery has required fields
      if (gallery.galleryId && gallery.ownerId && gallery.state) {
        setCurrentGallery(gallery as Parameters<typeof setCurrentGallery>[0]);
      }
    }

    // Subscribe to Zustand store changes for finals bytes (handles optimistic updates)
    let prevFinalsBytes: number | undefined = useGalleryStore.getState().currentGallery
      ?.finalsBytesUsed as number | undefined;
    const unsubscribe = useGalleryStore.subscribe((state) => {
      const currentGallery = state.currentGallery;
      const currentFinalsBytes =
        currentGallery?.galleryId === galleryId
          ? (currentGallery.finalsBytesUsed as number | undefined)
          : undefined;

      // Only fire if value actually changed and it's our gallery
      if (currentFinalsBytes !== undefined && currentFinalsBytes !== prevFinalsBytes) {
        prevFinalsBytes = currentFinalsBytes;

        const newFinalsBytes = currentFinalsBytes;

        // Update optimistic state to match store (store has the latest optimistic value)
        // Only update if we don't already have this value (avoid unnecessary re-renders)
        setOptimisticFinalsBytes((prev) => {
          if (prev !== newFinalsBytes) {
            return newFinalsBytes;
          }
          return prev;
        });

        // Update local gallery state
        setGallery((prevGallery) => {
          if (prevGallery?.galleryId !== galleryId) {
            return prevGallery;
          }
          return {
            ...prevGallery,
            finalsBytesUsed: newFinalsBytes,
          };
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [galleryId, gallery, optimisticFinalsBytes]);

  // Clear optimistic state when upload completes and data is reloaded
  useEffect(() => {
    if (isUploadComplete && optimisticFinalsBytes !== null) {
      // Reload data and clear optimistic state after a delay
      void loadOrderData(true).then(() => {
        setTimeout(() => {
          setOptimisticFinalsBytes((prev) => {
            if (prev !== null) {
              return null;
            }
            return prev;
          });
        }, 2000);
      });
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUploadComplete]); // Only depend on isUploadComplete

  // Auto-set to finals tab if:
  // - Selection is disabled (non-selection galleries)
  // - Selected section is hidden (photos were cleaned up)
  useEffect(() => {
    if (!order || !gallery) {
      return;
    }

    const isSelectionEnabled = gallery.selectionEnabled !== false;

    if (gallery.selectionEnabled === false) {
      setActiveTab("finals");
      return;
    }

    // Get selectedKeys from order
    const orderSelectedKeys = normalizeSelectedKeys(order.selectedKeys);

    if (isSelectionEnabled && orderSelectedKeys.length > 0) {
      // Check if selected images exist
      const hasSelectedImagesCheck =
        originalImages.length > 0 &&
        originalImages.some((img) => {
          const imgKey = (img.key ?? img.filename ?? img.id ?? "").toString().trim();
          const normalizedSelectedKeys = orderSelectedKeys.map((k) => k.toString().trim());
          return normalizedSelectedKeys.includes(imgKey);
        });

      // If no selected images found (photos were cleaned up), switch to finals tab
      if (!hasSelectedImagesCheck) {
        setActiveTab("finals");
      }
    }
  }, [gallery, order, originalImages]);

  // Polling cleanup is handled by usePhotoUploadHandler hook

  const handlePayClick = (): void => {
    if (!galleryId || paymentLoading) {
      return;
    }
    setShowPaymentModal(true);
  };

  const handlePaymentConfirm = async (): Promise<void> => {
    if (!galleryId || !paymentDetails) {
      return;
    }

    setShowPaymentModal(false);
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
        await loadWalletBalance();
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


  const {
    handleApproveChangeRequest,
    handleDenyChangeRequest: handleDenyChangeRequestAction,
    handleDenyConfirm: handleDenyConfirmAction,
  } = useOrderActions({
    galleryId,
    orderId,
    gallery,
    loadOrderData: () => loadOrderData(true),
    loadGalleryOrders: async () => {
      if (reloadGallery) {
        await reloadGallery();
      }
    },
    openDenyModal: () => setDenyModalOpen(true),
    closeDenyModal: () => setDenyModalOpen(false),
    setDenyLoading,
    openCleanupModal: () => {}, // Not used in this component
    closeCleanupModal: () => {}, // Not used in this component
  });

  const handleDenyChangeRequest = (): void => {
    handleDenyChangeRequestAction();
  };

  const handleDenyConfirm = async (reason?: string): Promise<void> => {
    await handleDenyConfirmAction(reason);
  };


  if (loading && !order) {
    return <FullPageLoading text="Ładowanie zlecenia..." />;
  }

  if (!order) {
    return (
      <div className="p-6">
        <div className="p-4 bg-error-50 border border-error-200 rounded-lg text-error-600">
          {error ?? "Nie znaleziono zlecenia"}
        </div>
      </div>
    );
  }

  // Normalize selectedKeys - handle both array and string formats
  // For non-selection galleries, empty/undefined selectedKeys means "all photos"
  const selectedKeys = normalizeSelectedKeys(order.selectedKeys);
  const selectionEnabled = gallery?.selectionEnabled !== false; // Default to true if not specified


  // Hide "Wybrane przez klienta" section if:
  // - Selection is enabled
  // - User has selected photos (selectedKeys.length > 0)
  // - But no matching images exist (photos were cleaned up)
  const hasSelectedImages =
    selectedKeys.length > 0 &&
    originalImages.length > 0 &&
    originalImages.some((img) => {
      const imgKey = (img.key ?? img.filename ?? img.id ?? "").toString().trim();
      const normalizedSelectedKeys = selectedKeys.map((k) => k.toString().trim());
      return normalizedSelectedKeys.includes(imgKey);
    });

  const hideSelectedSection = selectionEnabled && selectedKeys.length > 0 && !hasSelectedImages;

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
      <OrderHeader
        galleryId={galleryId}
        orderId={orderId}
        orderNumber={order.orderNumber}
        orderIdFallback={order.orderId}
        deliveryStatus={order.deliveryStatus}
        paymentStatus={order.paymentStatus}
      />

      {error && (
        <div className="p-4 bg-error-50 border border-error-200 rounded-lg text-error-600">
          {error}
        </div>
      )}

      {order.deliveryStatus === "CHANGES_REQUESTED" && (
        <ChangeRequestBanner
          onApprove={handleApproveChangeRequest}
          onDeny={handleDenyChangeRequest}
        />
      )}

      <OrderInfoCard
        totalCents={order.totalCents ?? 0}
        createdAt={order.createdAt}
        selectedKeysCount={selectedKeys.length}
        selectionEnabled={selectionEnabled}
        isEditingAmount={isEditingAmount}
        editingAmountValue={editingAmountValue}
        savingAmount={savingAmount}
        onStartEdit={handleStartEditAmount}
        onCancelEdit={handleCancelEditAmount}
        onSave={handleSaveAmount}
        onAmountChange={setEditingAmountValue}
      />

      {selectionEnabled && !hideSelectedSection && (
        <OrderTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          originalsCount={selectedKeys.length}
          finalsCount={finalImages.length}
        />
      )}

      {selectionEnabled && !hideSelectedSection && activeTab === "originals" && (
        <OriginalsTab
          images={originalImages}
          selectedKeys={selectedKeys}
          selectionEnabled={selectionEnabled}
          deliveryStatus={order.deliveryStatus}
        />
      )}

      {(!(selectionEnabled && !hideSelectedSection) || activeTab === "finals") && (
        <FinalsTab
          images={finalImages}
          gallery={gallery}
          canUpload={canUploadFinals}
          isGalleryPaid={isGalleryPaid}
          uploading={uploading}
          uploadProgress={uploadProgress}
          optimisticFinalsBytes={optimisticFinalsBytes}
          deletingImages={deletingImages}
          loading={loading}
          onFileSelect={handleFileSelect}
          onCancelUpload={cancelUpload}
          onDeleteImage={handleDeleteFinalImageClick}
          onPayClick={handlePayClick}
          paymentLoading={paymentLoading}
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
            ? `Czy na pewno chcesz usunąć zdjęcie "${imageToDelete.key ?? imageToDelete.filename ?? ""}"?\nTa operacja jest nieodwracalna.`
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

      {/* Pricing Modal - Show when user clicks publish gallery */}
      {galleryId && (
        <PublishGalleryWizard
          isOpen={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false);
          }}
          galleryId={galleryId as string}
          onSuccess={async () => {
            // Reload gallery data to update payment status
            if (reloadGallery) {
              await reloadGallery();
            }
            await loadOrderData();
            await loadWalletBalance();
          }}
        />
      )}

      {/* Upload Progress Overlay */}
      <UploadProgressWrapper
        handlerPerImageProgress={handlerPerImageProgress}
        perImageProgress={perImageProgress}
        isUploadComplete={isUploadComplete}
      />

      {/* Payment Confirmation Modal */}
      {paymentDetails && (
        <PaymentConfirmationModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
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
