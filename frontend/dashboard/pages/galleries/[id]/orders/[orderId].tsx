import { useRouter } from "next/router";
import { useState, useEffect, useCallback, useMemo } from "react";

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
import { usePayGallery } from "../../../../hooks/mutations/useGalleryMutations";
import {
  useApproveChangeRequest,
  useDenyChangeRequest,
} from "../../../../hooks/mutations/useOrderMutations";
import { useGalleryImages } from "../../../../hooks/queries/useGalleries";
import { useOrder, useOrderFinalImages } from "../../../../hooks/queries/useOrders";
import { useFinalImageDelete } from "../../../../hooks/useFinalImageDelete";
import { useGallery } from "../../../../hooks/useGallery";
import { useOrderAmountEdit } from "../../../../hooks/useOrderAmountEdit";
import { usePageLogger } from "../../../../hooks/usePageLogger";
import { useToast } from "../../../../hooks/useToast";
import { formatApiError } from "../../../../lib/api-service";
import { removeFileExtension } from "../../../../lib/filename-utils";
import { filterDeletedImages, normalizeSelectedKeys } from "../../../../lib/order-utils";
import { useUserStore } from "../../../../store";
import type { GalleryImage } from "../../../../types";

// Order type is imported from orderSlice store (single source of truth)

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
  const { logSkippedLoad } = usePageLogger({
    pageName: "OrderDetail",
  });
  // Get reloadGallery function from GalleryContext to refresh gallery data after payment
  const { reloadGallery } = useGallery();
  const { isNonSelectionGallery } = useGalleryType();

  // Get gallery and order from React Query
  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
  const galleryIdForQuery =
    galleryIdStr && typeof galleryIdStr === "string" ? galleryIdStr : undefined;
  const orderIdStr = Array.isArray(orderId) ? orderId[0] : orderId;
  const orderIdForQuery = orderIdStr && typeof orderIdStr === "string" ? orderIdStr : undefined;

  const { gallery } = useGallery();
  const { data: order, refetch: refetchOrder } = useOrder(galleryIdForQuery, orderIdForQuery);

  // Use React Query hooks to automatically load images
  const { data: galleryImagesData = [] } = useGalleryImages(galleryIdForQuery, "thumb");
  const originalImages = (galleryImagesData || []) as GalleryImage[];

  // Use React Query hook to automatically load final images (URLs are mapped via select)
  const { data: finalImagesData = [], refetch: refetchFinalImages } = useOrderFinalImages(
    galleryIdForQuery,
    orderIdForQuery
  );

  const [error, setError] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"originals" | "finals">("originals");
  const [denyModalOpen, setDenyModalOpen] = useState<boolean>(false);
  const [, setOptimisticFinalsBytes] = useState<number | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [imageToDelete, setImageToDelete] = useState<GalleryImage | null>(null);

  // Define hook early so derived state can use its refs
  // Note: Optimistic updates are now handled in the mutation, so we don't need manual state
  const {
    deleteImage,
    handleDeleteImageClick,
    deletingImages,
    deletingImagesRef,
    deletedImageKeysRef,
  } = useFinalImageDelete({
    galleryId,
    orderId,
    setFinalImages: () => {}, // No longer needed - mutation handles optimistic updates
    setOptimisticFinalsBytes,
  });

  // Derived/computed final images: Filter deleted images
  // URLs are already mapped via select in useOrderFinalImages
  const finalImages = useMemo(() => {
    // Start with React Query data (already transformed with URLs mapped)
    const baseImages = (finalImagesData || []) as GalleryImage[];

    // Filter out successfully deleted images
    return filterDeletedImages(baseImages, deletingImagesRef.current, deletedImageKeysRef.current);
  }, [finalImagesData, deletingImagesRef, deletedImageKeysRef]);

  // Payment mutation
  const payGalleryMutation = usePayGallery();
  const [paymentDetails] = useState<PaymentDetails | null>(null);
  const [showPaymentConfirmationModal, setShowPaymentConfirmationModal] = useState<boolean>(false);

  // Get wallet balance directly from store - no local state needed
  const walletBalance = useUserStore((state) => state.walletBalanceCents ?? 0);

  // Simplified: Only refetch order if needed - images are automatically loaded via React Query hooks
  const loadOrderData = useCallback(async (): Promise<void> => {
    if (!galleryId || !orderId) {
      logSkippedLoad("orderData", "Missing galleryId or orderId", { galleryId, orderId });
      return;
    }

    try {
      // Refetch order if needed - images are automatically loaded via React Query hooks
      await refetchOrder().catch((err: unknown) => {
        console.error("Failed to load order:", err);
        const errorMsg = formatApiError(err);
        setError(errorMsg ?? "Nie udało się załadować danych zlecenia");
        showToast("error", "Błąd", errorMsg ?? "Nie udało się załadować danych zlecenia");
      });
    } catch (err) {
      // Handle errors gracefully
      const error = err as Error & { status?: number; originalError?: Error };
      const isCorsError =
        error.message?.includes("CORS") || error.message?.includes("Failed to fetch");
      const isNetworkError = error.message?.includes("Network error");

      if (!isCorsError && !isNetworkError) {
        const errorMsg = formatApiError(err);
        setError(errorMsg ?? "Nie udało się załadować danych zlecenia");
        showToast("error", "Błąd", errorMsg ?? "Nie udało się załadować danych zlecenia");
      }
    }
  }, [galleryId, orderId, showToast, logSkippedLoad, refetchOrder]);

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
    currentTotalCents: (order?.totalCents as number | undefined) ?? 0,
    onSave: loadOrderData,
  });

  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  // Check for recovery state and auto-open modal
  useEffect(() => {
    if (!galleryId || !orderId || typeof window === "undefined") {
      return;
    }

    const storageKey = `uppy_upload_state_${Array.isArray(galleryId) ? galleryId[0] : galleryId}_finals`;
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
      const storageKey = `uppy_upload_state_${Array.isArray(galleryId) ? galleryId[0] : galleryId}_finals`;
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

  // Reload final images after upload - use React Query refetch (removes duplicated manual loading)
  const reloadFinalImagesAfterUpload = useCallback(async () => {
    if (!galleryIdForQuery || !orderIdForQuery) {
      return;
    }
    // React Query automatically handles caching and refetching
    await refetchFinalImages();
  }, [galleryIdForQuery, orderIdForQuery, refetchFinalImages]);

  // Load order data once when component mounts or orderId changes
  // Images are automatically loaded via React Query hooks - no manual loading needed
  useEffect(() => {
    if (galleryId && orderId) {
      void loadOrderData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId, orderId]);

  // Update optimistic finals bytes when gallery data changes
  useEffect(() => {
    if (!gallery) {
      return;
    }

    // Track finals bytes from React Query gallery data (handles optimistic updates)
    const currentFinalsBytes = gallery?.finalsBytesUsed as number | undefined;
    if (currentFinalsBytes !== undefined) {
      setOptimisticFinalsBytes((prev: number | null) => {
        if (prev !== currentFinalsBytes) {
          return currentFinalsBytes ?? null;
        }
        return prev;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gallery?.finalsBytesUsed]); // Update when finals bytes change

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

  const handlePaymentConfirm = async (): Promise<void> => {
    if (!galleryId || !paymentDetails) {
      return;
    }

    try {
      // Backend will automatically use full Stripe if wallet is insufficient (no partial payments)
      const data = await payGalleryMutation.mutateAsync({
        galleryId: galleryId as string,
        options: {},
      });

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

  // Use React Query mutations
  const approveChangeRequestMutation = useApproveChangeRequest();
  const denyChangeRequestMutation = useDenyChangeRequest();
  const denyLoading = denyChangeRequestMutation.isPending;

  const handleApproveChangeRequest = useCallback(async () => {
    if (!galleryIdForQuery || !orderIdForQuery) {
      return;
    }
    await approveChangeRequestMutation.mutateAsync({
      galleryId: galleryIdForQuery,
      orderId: orderIdForQuery,
    });
    await loadOrderData();
    if (reloadGallery) {
      await reloadGallery();
    }
  }, [
    galleryIdForQuery,
    orderIdForQuery,
    approveChangeRequestMutation,
    loadOrderData,
    reloadGallery,
  ]);

  const handleDenyChangeRequest = useCallback(() => {
    setDenyModalOpen(true);
  }, []);

  const handleDenyConfirm = useCallback(
    async (reason?: string) => {
      if (!galleryIdForQuery || !orderIdForQuery) {
        return;
      }
      await denyChangeRequestMutation.mutateAsync({
        galleryId: galleryIdForQuery,
        orderId: orderIdForQuery,
        reason,
      });
      setDenyModalOpen(false);
      await loadOrderData();
      if (reloadGallery) {
        await reloadGallery();
      }
    },
    [galleryIdForQuery, orderIdForQuery, denyChangeRequestMutation, loadOrderData, reloadGallery]
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
          loading={payGalleryMutation.isPending}
        />
      )}
    </div>
  );
}
