import type { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";

import { NextStepsOverlay } from "../../../../components/galleries/NextStepsOverlay";
import PaymentConfirmationModal from "../../../../components/galleries/PaymentConfirmationModal";
import { PublishGalleryWizard } from "../../../../components/galleries/PublishGalleryWizard";
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
import { useInfiniteOrderFinalImages } from "../../../../hooks/useInfiniteOrderFinalImages";
import { useOrderAmountEdit } from "../../../../hooks/useOrderAmountEdit";
import { usePageLogger } from "../../../../hooks/usePageLogger";
import { useToast } from "../../../../hooks/useToast";
import { formatApiError } from "../../../../lib/api-service";
import { removeFileExtension } from "../../../../lib/filename-utils";
import { filterDeletedImages, normalizeSelectedKeys } from "../../../../lib/order-utils";
import { useUnifiedStore } from "../../../../store/unifiedStore";
import type { GalleryImage } from "../../../../types";

// Order type is imported from types/index.ts

interface PaymentDetails {
  totalAmountCents: number;
  walletAmountCents: number;
  stripeAmountCents: number;
  balanceAfterPayment?: number;
}

// Prevent static generation - this page uses client hooks
export const getServerSideProps: GetServerSideProps = () => {
  return Promise.resolve({ props: {} });
};

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
  
  // Import gallery creation flow state
  const galleryCreationFlowActive = useUnifiedStore((state) => state.galleryCreationFlowActive);
  const galleryCreationTargetId = useUnifiedStore((state) => state.galleryCreationTargetId);
  const setGalleryCreationFlowActive = useUnifiedStore(
    (state) => state.setGalleryCreationFlowActive
  );

  // Get gallery and order from React Query
  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
  const galleryIdForQuery =
    galleryIdStr && typeof galleryIdStr === "string" ? galleryIdStr : undefined;
  const orderIdStr = Array.isArray(orderId) ? orderId[0] : orderId;
  const orderIdForQuery = orderIdStr && typeof orderIdStr === "string" ? orderIdStr : undefined;

  const { gallery } = useGallery();
  const { data: order, refetch: refetchOrder, isLoading: orderLoading } = useOrder(galleryIdForQuery, orderIdForQuery);
  
  // Clear gallery creation flow when order page is fully ready
  useEffect(() => {
    // Only clear if flow is active and we're on the target gallery
    if (!galleryCreationFlowActive || !galleryIdStr || galleryCreationTargetId !== galleryIdStr) {
      return;
    }

    // Check if page is fully ready:
    // - Gallery is loaded
    // - Order is loaded (not loading)
    // - Router is ready
    const isPageReady = !!gallery && !!order && !orderLoading && router.isReady;

    if (isPageReady) {
      // Clear the flow - overlay will appear
      setGalleryCreationFlowActive(false);
    }
  }, [
    galleryCreationFlowActive,
    galleryCreationTargetId,
    galleryIdStr,
    gallery,
    order,
    orderLoading,
    router.isReady,
    setGalleryCreationFlowActive,
  ]);

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
    return originalImagesData.pages.flatMap(
      (page) => (page as { images?: GalleryImage[] }).images ?? []
    );
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
  } = useInfiniteOrderFinalImages({
    galleryId: galleryIdForQuery,
    orderId: orderIdForQuery,
    options: {
      structuralSharing: false, // Prevent React Query from trying to merge cached data with different structure
    },
  });

  // Flatten pages into a single array of final images
  const finalImagesDataFlattened = useMemo(() => {
    if (!finalImagesData?.pages) return [];
    return finalImagesData.pages.flatMap(
      (page) => (page as { images?: GalleryImage[] }).images ?? []
    );
  }, [finalImagesData]);

  // Get total count of final images from the first page (if available)
  const totalFinalImagesCount = useMemo(() => {
    if (!finalImagesData?.pages || finalImagesData.pages.length === 0) {
      return 0;
    }
    // totalCount is returned on the first page
    const firstPage = finalImagesData.pages[0] as { totalCount?: number };
    return firstPage?.totalCount ?? finalImagesDataFlattened.length;
  }, [finalImagesData, finalImagesDataFlattened.length]);

  const [error, setError] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"originals" | "finals">("originals");
  const [denyModalOpen, setDenyModalOpen] = useState<boolean>(false);
  const [, setOptimisticFinalsBytes] = useState<number | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [imageToDelete, setImageToDelete] = useState<GalleryImage | null>(null);
  const [limitExceededData, setLimitExceededData] = useState<{
    uploadedSizeBytes: number;
    originalsLimitBytes: number;
    excessBytes: number;
    nextTierPlan?: string;
    nextTierPriceCents?: number;
    nextTierLimitBytes?: number;
    isSelectionGallery?: boolean;
  } | null>(null);
  const [limitExceededWizardOpen, setLimitExceededWizardOpen] = useState(false);
  const [showUpgradeSuccessModal, setShowUpgradeSuccessModal] = useState(false);

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
    const baseImages = finalImagesDataFlattened || [];

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

  // Track if we've already processed payment success to prevent infinite loops
  const hasProcessedPaymentSuccessRef = useRef<string>("");

  // Reset the processed flag when galleryId changes
  useEffect(() => {
    hasProcessedPaymentSuccessRef.current = "";
  }, [galleryId]);

  // Handle payment redirects for limit exceeded flow (finals) - including wallet top-up
  useEffect(() => {
    if (typeof window === "undefined" || !galleryId || !router.isReady) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const paymentSuccess = params.get("payment") === "success";
    const upgradeFlow = params.get("upgrade") === "true";
    const limitExceededParam = params.get("limitExceeded") === "true";
    const durationParam = params.get("duration");
    const planKeyParam = params.get("planKey");
    const galleryIdParam = params.get("galleryId");

    // Check if this is a wallet top-up redirect (has galleryId param but not a direct gallery payment)
    const isWalletTopUpRedirect = paymentSuccess && 
      (upgradeFlow || limitExceededParam) && 
      galleryIdParam === galleryId && 
      !params.get("gallery"); // Not a direct gallery payment

    // Handle wallet top-up redirect: reopen wizard with preserved state (no polling needed)
    if (isWalletTopUpRedirect && planKeyParam) {
      // Clean URL params but preserve limitExceeded, duration, and planKey for wizard
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("payment");
      newUrl.searchParams.delete("upgrade");
      newUrl.searchParams.delete("galleryId");
      // Keep limitExceeded, duration, and planKey so wizard can restore state
      window.history.replaceState({}, "", newUrl.toString());

      // Reopen wizard with preserved state
      setLimitExceededWizardOpen(true);
      return;
    }

    // Handle direct payment success (Stripe payment for upgrade)
    if (paymentSuccess && (upgradeFlow || limitExceededParam) && planKeyParam && !isWalletTopUpRedirect) {
      // Create a unique key for this payment success to prevent re-processing
      const paymentSuccessKey = `${galleryId}-${paymentSuccess}-${upgradeFlow || limitExceededParam}-${planKeyParam}`;

      // Check if we've already processed this payment success
      if (hasProcessedPaymentSuccessRef.current === paymentSuccessKey) {
        return;
      }

      // Mark as processed immediately to prevent re-running
      hasProcessedPaymentSuccessRef.current = paymentSuccessKey;

      // Clean URL params immediately to prevent effect from re-running
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("payment");
      newUrl.searchParams.delete("upgrade");
      newUrl.searchParams.delete("limitExceeded");
      newUrl.searchParams.delete("duration");
      newUrl.searchParams.delete("planKey");
      window.history.replaceState({}, "", newUrl.toString());

      // Coming back from payment - reopen wizard with preserved state
      setLimitExceededWizardOpen(true);

      // Poll for gallery plan update
      const pollForPlanUpdate = async () => {
        let pollAttempts = 0;
        const maxPollAttempts = 30; // Poll for up to 30 seconds
        const pollInterval = 1000; // 1 second

        const poll = async (): Promise<void> => {
          try {
            await reloadGallery();
            const updatedGallery = await reloadGallery();

            // Check if plan was updated
            if (updatedGallery?.plan && planKeyParam && updatedGallery.plan === planKeyParam) {
              // Plan updated successfully
              setShowUpgradeSuccessModal(true);
              setLimitExceededWizardOpen(false);
              setLimitExceededData(null);
              return;
            }

            pollAttempts++;
            if (pollAttempts >= maxPollAttempts) {
              // Stop polling after max attempts
              return;
            } else {
              setTimeout(poll, pollInterval);
            }
          } catch (error) {
            console.error("Error polling for plan update:", error);
          }
        };

        await poll();
      };

      void pollForPlanUpdate();
    }
  }, [galleryId, router.isReady, reloadGallery]);

  // Handle modal close - clear recovery flag if modal was auto-opened from recovery
  const handleUploadModalClose = useCallback(() => {
    setUploadModalOpen(false);
    // Don't clear limitExceededData here - it's cleared explicitly when the wizard closes
    // This prevents race conditions when closing due to limit exceeded

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
          finalsCount={totalFinalImagesCount}
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
            onValidationNeeded: (data) => {
              console.log("[OrderDetail] onValidationNeeded called:", data);
              setLimitExceededData(data);
              setLimitExceededWizardOpen(true);
              console.log("[OrderDetail] State updated:", {
                limitExceededData: data,
                limitExceededWizardOpen: true,
              });
              // Close the upload modal when limit is exceeded
              handleUploadModalClose();
            },
            onUploadComplete: () => {
              setUploadModalOpen(false);
            },
            reloadGallery: reloadFinalImagesAfterUpload,
            onScrollReset: () => {
              // Reset scroll to top for all scroll containers
              // Find all scroll containers with table-scrollbar class
              const scrollContainers = document.querySelectorAll(
                '.table-scrollbar[style*="overflow-auto"], .table-scrollbar[style*="overflow: auto"]'
              );
              scrollContainers.forEach((container) => {
                if (container instanceof HTMLElement) {
                  container.scrollTop = 0;
                }
              });
            },
          }}
        />
      )}

      {/* Limit Exceeded Wizard for Finals */}
      {(() => {
        console.log("[OrderDetail] Rendering wizard check:", {
          galleryId,
          hasLimitExceededData: !!limitExceededData,
          limitExceededWizardOpen,
          shouldRender: !!(galleryId && limitExceededData),
        });
        return null;
      })()}
      {galleryId && limitExceededData && (
        <PublishGalleryWizard
          isOpen={limitExceededWizardOpen}
          onClose={() => {
            console.log("[OrderDetail] Wizard onClose called");
            setLimitExceededWizardOpen(false);
            setLimitExceededData(null);
          }}
          galleryId={galleryId as string}
          mode="limitExceeded"
          limitExceededData={limitExceededData}
          renderAsModal={true}
          initialState={
            router.isReady && typeof window !== "undefined"
              ? {
                  duration: new URLSearchParams(window.location.search).get("duration") || undefined,
                  planKey: new URLSearchParams(window.location.search).get("planKey") || undefined,
                }
              : null
          }
          onUpgradeSuccess={async () => {
            console.log("[OrderDetail] onUpgradeSuccess called");
            // Reload gallery after upgrade
            await reloadGallery();
            setLimitExceededWizardOpen(false);
            setLimitExceededData(null);
            setShowUpgradeSuccessModal(true);
          }}
        />
      )}

      {/* Upgrade Success Confirmation Modal */}
      <ConfirmDialog
        isOpen={showUpgradeSuccessModal}
        onClose={() => {
          setShowUpgradeSuccessModal(false);
        }}
        onConfirm={() => {
          setShowUpgradeSuccessModal(false);
          // Optionally reopen upload modal
          setUploadModalOpen(true);
        }}
        title="Limit zwiększony pomyślnie!"
        message="Twój plan został zaktualizowany. Możesz teraz przesłać zdjęcia."
        confirmText="OK"
        variant="info"
      /> 

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
