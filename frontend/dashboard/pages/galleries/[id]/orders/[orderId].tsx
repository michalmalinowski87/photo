
import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { useState, useEffect, useCallback, useMemo } from "react";


import { NextStepsOverlay } from "../../../../components/galleries/NextStepsOverlay";
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
  useDeleteFinalImage,
} from "../../../../hooks/mutations/useOrderMutations";
import { useOrder } from "../../../../hooks/queries/useOrders";
import { useWalletBalance } from "../../../../hooks/queries/useWallet";
import { useFinalImageDelete } from "../../../../hooks/useFinalImageDelete";
import { useGallery } from "../../../../hooks/useGallery";
import { useInfiniteGalleryImages } from "../../../../hooks/useInfiniteGalleryImages";
import { useOrderAmountEdit } from "../../../../hooks/useOrderAmountEdit";
import { usePageLogger } from "../../../../hooks/usePageLogger";
import { useToast } from "../../../../hooks/useToast";
import api, { formatApiError } from "../../../../lib/api-service";
import { removeFileExtension } from "../../../../lib/filename-utils";
import { filterDeletedImages, normalizeSelectedKeys } from "../../../../lib/order-utils";
import { queryKeys } from "../../../../lib/react-query";
import type { GalleryImage } from "../../../../types";

// Order type is imported from types/index.ts

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

  // Use infinite scroll for originals (client selected images)
  const {
    data: originalImagesData,
    isLoading: originalImagesLoading,
    error: originalImagesError,
    fetchNextPage: fetchNextOriginalPage,
    hasNextPage: hasNextOriginalPage,
    isFetchingNextPage: isFetchingNextOriginalPage,
  } = useInfiniteGalleryImages({
    galleryId: galleryIdForQuery,
    type: "thumb",
    limit: 50,
  });

  // Flatten pages into a single array of original images
  const originalImages = useMemo(() => {
    if (!originalImagesData?.pages) return [];
    return originalImagesData.pages.flatMap((page) => page.images || []);
  }, [originalImagesData]);

  // Use infinite scroll for final images
  // Note: Backend doesn't support pagination yet, so we fetch all at once but use same UI strategy
  const {
    data: finalImagesData,
    isLoading: finalImagesLoading,
    error: finalImagesError,
    fetchNextPage: fetchNextFinalPage,
    hasNextPage: hasNextFinalPage,
    isFetchingNextPage: isFetchingNextFinalPage,
    refetch: refetchFinalImages,
  } = useInfiniteQuery({
    queryKey: queryKeys.orders.finalImages(
      galleryIdForQuery ?? "",
      orderIdForQuery ?? ""
    ),
    queryFn: async ({ pageParam: _pageParam }) => {
      if (!galleryIdForQuery || !orderIdForQuery) {
        throw new Error("Gallery ID and Order ID are required");
      }
      const response = await api.orders.getFinalImages(galleryIdForQuery, orderIdForQuery);
      const images = (response.images || []).map((img: any) => ({
        ...img,
        url: img.thumbUrl ?? img.previewUrl ?? img.finalUrl ?? img.url ?? "",
        finalUrl: img.finalUrl ?? img.url ?? "",
      }));
      // Return as a single page since backend doesn't support pagination
      return {
        images: images || [],
        hasMore: false,
        nextCursor: null,
      };
    },
    getNextPageParam: () => undefined, // No pagination support
    initialPageParam: null as string | null,
    enabled: !!galleryIdForQuery && !!orderIdForQuery,
    retry: false, // Disable retries for infinite queries to prevent infinite loops on errors
    structuralSharing: false, // Prevent React Query from trying to merge cached data with different structure
  });

  // Flatten pages into a single array of final images
  const finalImagesDataFlattened = useMemo(() => {
    if (!finalImagesData?.pages) return [];
    return finalImagesData.pages.flatMap((page) => page.images || []);
  }, [finalImagesData]);

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
    deletedImageKeys,
    deletedImageKeysRef,
    clearDeletedKeysForImages,
  } = useFinalImageDelete({
    galleryId,
    orderId,
    setFinalImages: () => {}, // No longer needed - mutation handles optimistic updates
    setOptimisticFinalsBytes,
  });

  // Clear deletedImageKeys for final images that have been re-uploaded FIRST
  // This must happen before the useMemo that filters images, so re-uploaded images aren't filtered out
  // When images appear in the query data, they're no longer deleted, so remove them from deletedImageKeys
  useEffect(() => {
    if (!finalImagesDataFlattened || finalImagesDataFlattened.length === 0) {
      return;
    }

    const currentImageKeys = new Set(
      finalImagesDataFlattened.map((img: GalleryImage) => img.key ?? img.filename).filter(Boolean)
    );

    // Find keys that are in deletedImageKeys but now present in the data (re-uploaded)
    const reuploadedKeys = Array.from(deletedImageKeysRef.current).filter((key) =>
      currentImageKeys.has(key)
    );

    if (reuploadedKeys.length > 0) {
      // Clear keys synchronously so the useMemo below can see the updated state
      clearDeletedKeysForImages(reuploadedKeys);
    }
  }, [finalImagesDataFlattened, deletedImageKeysRef, clearDeletedKeysForImages]);

  // Derived/computed final images: Filter deleted images and map URLs
  // Note: This depends on deletedImageKeys (state) not deletedImageKeysRef (ref) to ensure it re-runs when keys are cleared
  const finalImages = useMemo(() => {
    // Start with React Query data
    const baseImages = (finalImagesDataFlattened || []) as GalleryImage[];

    // Map URLs (similar to what useOrderFinalImages did)
    const mappedImages = baseImages.map((img: GalleryImage) => ({
      ...img,
      url: img.thumbUrl ?? img.previewUrl ?? img.finalUrl ?? img.url ?? "",
      finalUrl: img.finalUrl ?? img.url ?? "",
    }));

    // Filter out successfully deleted images
    // Use deletedImageKeys state (not ref) so memo re-runs when keys are cleared
    return filterDeletedImages(mappedImages, deletingImagesRef.current, deletedImageKeys);
  }, [finalImagesDataFlattened, deletingImagesRef, deletedImageKeys]);

  // Payment mutation
  const payGalleryMutation = usePayGallery();
  const [paymentDetails] = useState<PaymentDetails | null>(null);
  const [showPaymentConfirmationModal, setShowPaymentConfirmationModal] = useState<boolean>(false);

  // Get wallet balance from React Query
  const { data: walletData } = useWalletBalance();
  const walletBalance = walletData?.balanceCents ?? 0;

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
    const currentFinalsBytes = gallery?.finalsBytesUsed;
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
    // Prevent deletion if order is DELIVERED
    if (order?.deliveryStatus === "DELIVERED") {
      showToast(
        "error",
        "Błąd",
        "Nie można usunąć zdjęć finalnych dla dostarczonego zlecenia. Zlecenie zostało już dostarczone klientowi."
      );
      return;
    }

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

  // Batch delete handler for final images
  const deleteFinalImageMutation = useDeleteFinalImage();
  const handleDeleteFinalImagesBatch = useCallback(
    async (imageKeys: string[]): Promise<void> => {
      if (!galleryIdForQuery || !orderIdForQuery || imageKeys.length === 0) {
        return;
      }

      // Prevent deletion if order is DELIVERED
      if (order?.deliveryStatus === "DELIVERED") {
        showToast(
          "error",
          "Błąd",
          "Nie można usunąć zdjęć finalnych dla dostarczonego zlecenia. Zlecenie zostało już dostarczone klientowi."
        );
        return;
      }

      try {
        // The mutation handles optimistic updates and cache invalidation
        await deleteFinalImageMutation.mutateAsync({
          galleryId: galleryIdForQuery,
          orderId: orderIdForQuery,
          imageKeys,
        });

        // Clear optimistic bytes state
        setOptimisticFinalsBytes(null);

        // Show success toast
        if (imageKeys.length === 1) {
          showToast("success", "Sukces", "Zdjęcie zostało usunięte");
        } else {
          showToast("success", "Sukces", `${imageKeys.length} zdjęć zostało usuniętych`);
        }
      } catch (err) {
        // Error handling - mutation's onError will rollback cache
        const errorMessage = formatApiError(err);
        if (imageKeys.length === 1) {
          showToast("error", "Błąd", errorMessage);
        } else {
          showToast("error", "Błąd", `Nie udało się usunąć ${imageKeys.length} zdjęć`);
        }
        throw err;
      }
    },
    [
      galleryIdForQuery,
      orderIdForQuery,
      order?.deliveryStatus,
      deleteFinalImageMutation,
      showToast,
      setOptimisticFinalsBytes,
    ]
  );

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
    async (reason?: string, preventFutureChangeRequests?: boolean) => {
      if (!galleryIdForQuery || !orderIdForQuery) {
        return;
      }
      await denyChangeRequestMutation.mutateAsync({
        galleryId: galleryIdForQuery,
        orderId: orderIdForQuery,
        reason,
        preventFutureChangeRequests,
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

  // Allow upload for final photos:
  // - For non-selective galleries: allow even when unpublished (not paid)
  // - For selective galleries: require gallery to be paid
  // Block uploads only for: CANCELLED
  // Allow uploads for: CLIENT_APPROVED, AWAITING_FINAL_PHOTOS, PREPARING_DELIVERY
  // Also allow uploads for non-selection galleries even if deliveryStatus is undefined (legacy orders)
  const blockedUploadStatuses = ["CANCELLED"];
  const canUploadFinals =
    (!selectionEnabled || isGalleryPaid) && // For non-selective: allow even if not paid. For selective: require paid.
    !blockedUploadStatuses.includes(order.deliveryStatus ?? "") &&
    ((!selectionEnabled && !order.deliveryStatus) || // Legacy orders without deliveryStatus in non-selection galleries
      !order.deliveryStatus || // Allow if no status set
      order.deliveryStatus === "CLIENT_APPROVED" ||
      order.deliveryStatus === "AWAITING_FINAL_PHOTOS" ||
      order.deliveryStatus === "PREPARING_DELIVERY");

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
          isLoading={originalImagesLoading}
          error={originalImagesError}
          fetchNextPage={fetchNextOriginalPage}
          hasNextPage={hasNextOriginalPage}
          isFetchingNextPage={isFetchingNextOriginalPage}
        />
      )}

      {(!shouldShowTabs || activeTab === "finals") && (
        <FinalsTab
          images={finalImages}
          canUpload={canUploadFinals}
          deletingImages={deletingImages}
          onUploadClick={() => setUploadModalOpen(true)}
          onDeleteImage={handleDeleteFinalImageClick}
          onDeleteImagesBatch={handleDeleteFinalImagesBatch}
          isGalleryPaid={isGalleryPaid}
          orderDeliveryStatus={order.deliveryStatus}
          isNonSelectionGallery={isNonSelectionGallery}
          galleryId={galleryIdForQuery}
          orderId={orderIdForQuery}
          isLoading={finalImagesLoading}
          error={finalImagesError}
          fetchNextPage={fetchNextFinalPage}
          hasNextPage={hasNextFinalPage}
          isFetchingNextPage={isFetchingNextFinalPage}
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

      {/* Next Steps Overlay for non-selective galleries */}
      {isNonSelectionGallery && <NextStepsOverlay />}
    </div>
  );
}
