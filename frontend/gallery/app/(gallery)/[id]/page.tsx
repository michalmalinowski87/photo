"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useCallback, useRef, lazy, Suspense } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/react-query";
import { useAuth } from "@/providers/AuthProvider";
import { getToken } from "@/lib/token";
import { getPublicApiUrl } from "@/lib/public-env";
import { useGalleryImages } from "@/hooks/useGallery";
import { useImageDownload } from "@/hooks/useImageDownload";
import { useSelection } from "@/hooks/useSelection";
import { useSelectionActions } from "@/hooks/useSelectionActions";
import { useDeliveredOrders, useClientApprovedOrders, useFinalImages } from "@/hooks/useOrders";
import { useZipStatus } from "@/hooks/useZipStatus";
import { GalleryTopBar } from "@/components/gallery/GalleryTopBar";
import { SecondaryMenu } from "@/components/gallery/SecondaryMenu";
import { VirtuosoGridComponent, type GridLayout } from "@/components/gallery/VirtuosoGrid";
import { ContextMenuPrevention } from "@/components/gallery/ContextMenuPrevention";
import { ScrollToTopButton } from "@/components/gallery/ScrollToTopButton";
import { FullPageLoading } from "@/components/ui/Loading";
import { hapticFeedback } from "@/utils/hapticFeedback";
import type { ApiError } from "@/lib/api";
import { formatApiError } from "@/lib/api";
import { DeliveredOrderCard } from "@/components/gallery/DeliveredOrderCard";

// Lazy load heavy components that are conditionally rendered
const LightGalleryWrapper = lazy(() => import("@/components/gallery/LightGalleryWrapper").then(m => ({ default: m.LightGalleryWrapper })));
const DownloadOverlay = lazy(() => import("@/components/gallery/DownloadOverlay").then(m => ({ default: m.DownloadOverlay })));
const ZipOverlay = lazy(() => import("@/components/gallery/ZipOverlay").then(m => ({ default: m.ZipOverlay })));
const HelpOverlay = lazy(() => import("@/components/gallery/HelpOverlay").then(m => ({ default: m.HelpOverlay })));
const ChangesRequestedOverlay = lazy(() => import("@/components/gallery/ChangesRequestedOverlay").then(m => ({ default: m.ChangesRequestedOverlay })));
const ChangeRequestCanceledOverlay = lazy(() => import("@/components/gallery/ChangeRequestCanceledOverlay").then(m => ({ default: m.ChangeRequestCanceledOverlay })));
const ChangeRequestSubmittedOverlay = lazy(() => import("@/components/gallery/ChangeRequestSubmittedOverlay").then(m => ({ default: m.ChangeRequestSubmittedOverlay })));
const GalleryNotFound = lazy(() => import("@/components/gallery/GalleryNotFound").then(m => ({ default: m.GalleryNotFound })));
const GalleryLoadError = lazy(() => import("@/components/gallery/GalleryLoadError").then(m => ({ default: m.GalleryLoadError })));
const ErrorAlertOverlay = lazy(() => import("@/components/gallery/ErrorAlertOverlay").then(m => ({ default: m.ErrorAlertOverlay })));

// Regular import for always-rendered components (no need for lazy loading)
import { DownloadButtonFeedback } from "@/components/gallery/DownloadButtonFeedback";

// Get API URL at module level to avoid useEffect delay
const API_URL = typeof window !== "undefined" ? getPublicApiUrl() : "";

// Configure route as dynamic (since it requires authentication)
export const dynamic = 'force-dynamic';

export default function GalleryPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { galleryId, isAuthenticated, isLoading } = useAuth();
  const id = params?.id as string;

  // Memoize searchParams check to avoid unnecessary re-renders
  const isOwnerPreview = useMemo(
    () => searchParams?.get("ownerPreview") === "1",
    [searchParams]
  );
  
  const [gridLayout, setGridLayout] = useState<GridLayout>("marble");
  const [viewMode, setViewMode] = useState<"all" | "selected">("all");
  const [showHelp, setShowHelp] = useState(false);
  const [showDeliveredView, setShowDeliveredView] = useState(false);
  const [showBoughtView, setShowBoughtView] = useState(false);
  const [showUnselectedView, setShowUnselectedView] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showChangesRequestedOverlay, setShowChangesRequestedOverlay] = useState(false);
  const [showChangeRequestCanceledOverlay, setShowChangeRequestCanceledOverlay] = useState(false);
  const [showChangeRequestSubmittedOverlay, setShowChangeRequestSubmittedOverlay] = useState(false);
  const [showZipOverlay, setShowZipOverlay] = useState(false);
  const [zipOverlayOrderId, setZipOverlayOrderId] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [showCancelChangeErrorModal, setShowCancelChangeErrorModal] = useState(false);
  const [cancelChangeErrorMessage, setCancelChangeErrorMessage] = useState("");
  
  const { download: downloadImage, downloadState, closeOverlay } = useImageDownload();
  const [zipDownloadState, setZipDownloadState] = useState<{ showOverlay: boolean; isError: boolean }>({
    showOverlay: false,
    isError: false,
  });
  const openGalleryRef = useRef<((index: number) => void) | null>(null);
  const hashPrefetchHandledRef = useRef(false);
  const openedFromCarouselRef = useRef(false);
  const layoutBeforeCarouselRef = useRef<GridLayout>("marble");
  
  // Use the ID from params as the stable galleryId (it doesn't change)
  const queryGalleryId = id || galleryId || "";

  // Selection state - React Query is the single source of truth
  const { data: selectionState, isLoading: selectionLoading } = useSelection(galleryId);
  const selectionActions = useSelectionActions(galleryId);

  // Determine gallery state - simplified logic
  // Priority: changesRequested > approved (locked) > delivered (can buy more) > selecting
  const galleryState = useMemo(() => {
    if (!selectionState) return "selecting";
    if (selectionState.changeRequestPending) return "changesRequested";
    if (selectionState.hasClientApprovedOrder) return "approved";
    if (selectionState.hasDeliveredOrder) return "delivered";
    if (selectionState.approved) return "approved";
    return "selecting";
  }, [selectionState]);

  // Determine if this is initial approval (first-time) vs buy-more approval
  // Initial approval = approved AND no delivered orders AND no CLIENT_APPROVED orders
  const isInitialApproval = useMemo(() => {
    return (
      selectionState?.approved === true &&
      !selectionState?.hasDeliveredOrder
    );
  }, [selectionState]);

  // Delivered orders
  const { data: deliveredOrdersData, isLoading: isLoadingDeliveredOrders } = useDeliveredOrders(galleryId);
  const deliveredOrders = deliveredOrdersData?.items || [];
  const hasMultipleOrders = deliveredOrders.length > 1;
  const singleOrder = deliveredOrders.length === 1 ? deliveredOrders[0] : null;
  const orderIdForFinals = selectedOrderId || singleOrder?.orderId || null;

  // CLIENT_APPROVED/PREPARING_DELIVERY/CHANGES_REQUESTED orders (buy-more orders that are approved but not yet delivered)
  const { data: clientApprovedOrdersData, isLoading: isLoadingClientApprovedOrders } = useClientApprovedOrders(galleryId);
  const clientApprovedOrders = clientApprovedOrdersData?.items || [];
  const hasClientApprovedOrders = clientApprovedOrders.length > 0;

  // Final images for selected order
  const {
    data: finalImagesData,
    fetchNextPage: fetchNextFinalPage,
    hasNextPage: hasNextFinalPage,
    isFetchingNextPage: isFetchingNextFinalPage,
    isLoading: isLoadingFinalImages,
  } = useFinalImages(
    galleryId,
    orderIdForFinals,
    50
  );
  
  const finalImages = useMemo(() => {
    return finalImagesData?.pages.flatMap((page) => page.images || []) || [];
  }, [finalImagesData]);
  const finalImagesTotalCount = useMemo(() => {
    return finalImagesData?.pages?.[0]?.totalCount ?? finalImages.length;
  }, [finalImagesData, finalImages.length]);
  const finalImagesTotalBytes = useMemo(() => {
    const fromApi = finalImagesData?.pages?.[0]?.totalBytes;
    if (typeof fromApi === "number" && fromApi > 0) return fromApi;
    const sumLoaded = finalImages.reduce((sum, img) => sum + (img.size || 0), 0);
    return sumLoaded > 0 ? sumLoaded : undefined;
  }, [finalImagesData, finalImages]);

  // Redirect to login if not authenticated
  // But don't redirect during owner preview loading (token is fetched asynchronously via postMessage)
  useEffect(() => {
    if (!isLoading && !isOwnerPreview && (!isAuthenticated || !galleryId)) {
      if (id) {
        router.replace(`/login/${id}`);
      }
    }
  }, [isLoading, isAuthenticated, galleryId, id, router, isOwnerPreview]);

  // For owner preview, if still not authenticated after loading completes, redirect to login
  // This ensures security: owner preview requires a valid dashboard token
  useEffect(() => {
    if (isOwnerPreview && !isAuthenticated && !isLoading && id) {
      router.replace(`/login/${id}`);
    }
  }, [isOwnerPreview, isAuthenticated, isLoading, id, router]);

  // Get images based on state - use filterUnselected=false to get all images (including unselected)
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: imagesLoading,
    error,
    refetch: refetchGalleryImages,
    prefetchNextPage,
  } = useGalleryImages(queryGalleryId, "thumb", 50, false);

  const allImages = useMemo(() => {
    return data?.pages.flatMap((page) => page.images || []) || [];
  }, [data]);

  // Get unselected images (only when in delivered, approved, or changesRequested state, as we might switch to unselected view)
  // Backend already excludes both DELIVERED and CLIENT_APPROVED photos
  const shouldFetchUnselected = galleryState === "delivered" || galleryState === "approved" || galleryState === "changesRequested";
  const {
    data: unselectedData,
    fetchNextPage: fetchNextUnselectedPage,
    hasNextPage: hasNextUnselectedPage,
    isFetchingNextPage: isFetchingNextUnselectedPage,
    prefetchNextPage: prefetchNextUnselectedPage,
    isLoading: isLoadingUnselected,
    isFetched: isUnselectedFetched,
  } = useGalleryImages(queryGalleryId, "thumb", 50, true);

  const unselectedImages = useMemo(() => {
    return unselectedData?.pages.flatMap((page) => page.images || []) || [];
  }, [unselectedData]);
  
  // Check if there are actually unselected photos available
  // Only show "Niewybrane" button if there are photos that aren't in any order
  // Must wait for query to complete before determining if photos exist
  const hasUnselectedPhotos = useMemo(() => {
    // Early returns for invalid states
    if (!shouldFetchUnselected) {
      return false;
    }
    
    // Don't show button until query has completed at least once
    // This prevents showing the button when data is still loading
    if (!isUnselectedFetched) {
      return false;
    }
    
    // Don't show if we don't have data yet
    if (!unselectedData || !unselectedData.pages || unselectedData.pages.length === 0) {
      return false;
    }
    
    // Only show if we have actual images in the results
    // The backend filters out images from DELIVERED, PREPARING_DELIVERY, CLIENT_APPROVED, and CHANGES_REQUESTED orders
    // Check that at least one page has images
    const hasImagesInPages = unselectedData.pages.some(page => 
      page && page.images && Array.isArray(page.images) && page.images.length > 0
    );
    
    // Also verify the flattened array has images
    const hasImages = unselectedImages.length > 0;
    
    // Both checks must pass
    return hasImages && hasImagesInPages;
  }, [shouldFetchUnselected, isUnselectedFetched, unselectedData, unselectedImages.length]);

  // Unified section visibility logic
  // Sections: "wybor" (selecting), "wybrane" (initial approved), "dostarczone" (delivered), 
  // "dokupione" (buy-more approved), "niewybrane" (unselected)
  const sectionVisibility = useMemo(() => {
    const hasDelivered = deliveredOrders.length > 0;
    const hasClientApproved = hasClientApprovedOrders;
    // Allow showing Niewybrane even when extraPriceCents is 0 (user re-enabled this)
    const hasUnselected = hasUnselectedPhotos;
    
    return {
      showWybor: galleryState === "selecting",
      showWybrane: isInitialApproval, // First-time approval, no delivered orders
      showDostarczone: hasDelivered, // Always show if delivered orders exist
      showBoughtView: hasClientApproved && hasDelivered, // Buy-more orders when delivered exists
      showNiewybrane: hasUnselected && (hasDelivered || isInitialApproval), // Show if unselected photos exist
    };
  }, [galleryState, deliveredOrders.length, hasClientApprovedOrders, hasUnselectedPhotos, isInitialApproval]);

  // Determine which view is currently active (simplified state machine)
  const currentView = useMemo(() => {
    let result: string;
    if (showDeliveredView && sectionVisibility.showDostarczone) result = "delivered";
    else if (showBoughtView && sectionVisibility.showBoughtView) result = "dokupione";
    else if (showUnselectedView && sectionVisibility.showNiewybrane) result = "unselected";
    else if (sectionVisibility.showWybrane && !showDeliveredView && !showBoughtView && !showUnselectedView) result = "wybrane";
    else if (sectionVisibility.showWybor) result = "selecting";
    else if (sectionVisibility.showDostarczone) result = "delivered";
    else result = "selecting";
    return result;
  }, [showDeliveredView, showBoughtView, showUnselectedView, sectionVisibility]);

  // Simplified view flags based on currentView
  const shouldShowDelivered = currentView === "delivered";
  const shouldShowBought = currentView === "dokupione";
  const shouldShowUnselected = currentView === "unselected";
  const shouldShowWybrane = currentView === "wybrane";
  
  // Only show unselected view if there's a price per additional photo
  const canShowUnselected = (selectionState?.pricingPackage?.extraPriceCents || 0) > 0;

  // Lock states: Lock approve/buy when approved, changesRequested, or hasClientApprovedOrder
  // Selection is enabled ONLY when in selecting state OR when viewing unselected photos in delivered state
  // When CLIENT_APPROVED order exists, buying more is locked (but can request changes)
  const isLocked = useMemo(() => {
    return (
      galleryState === "approved" ||
      galleryState === "changesRequested" ||
      selectionState?.hasClientApprovedOrder === true
    );
  }, [galleryState, selectionState?.hasClientApprovedOrder]);

  const isSelectingState = useMemo(() => {
    // Lock selection when locked state is active
    if (isLocked) return false;
    // Allow selection when in "selecting" state OR when viewing unselected photos in delivered state
    // But only if there's a price per additional photo (extraPriceCents > 0)
    if (shouldShowUnselected && galleryState === "delivered") {
      const extraPriceCents = selectionState?.pricingPackage?.extraPriceCents ?? 0;
      return extraPriceCents > 0;
    }
    return galleryState === "selecting";
  }, [galleryState, shouldShowUnselected, isLocked, selectionState?.pricingPackage?.extraPriceCents]);

  // Get all selectedKeys from CLIENT_APPROVED/PREPARING_DELIVERY/CHANGES_REQUESTED orders for "Dokupione" view
  const boughtPhotoKeys = useMemo(() => {
    const keys = new Set<string>();
    clientApprovedOrders.forEach((order) => {
      if (Array.isArray(order.selectedKeys)) {
        order.selectedKeys.forEach((key) => keys.add(key));
      }
    });
    return keys;
  }, [clientApprovedOrders]);

  // Get images for "Dokupione" view (photos from CLIENT_APPROVED/PREPARING_DELIVERY/CHANGES_REQUESTED orders)
  // IMPORTANT: Only DELIVERED orders use final images. All other statuses use original images.
  const boughtImages = useMemo(() => {
    if (!shouldShowBought) {
      return [];
    }
    
    // Use original images from selectedKeys (CLIENT_APPROVED, PREPARING_DELIVERY, and CHANGES_REQUESTED orders use originals)
    return allImages.filter((img) => boughtPhotoKeys.has(img.key));
  }, [shouldShowBought, boughtPhotoKeys, allImages]);

  // Filter images based on view mode and state
  // Priority order: delivered > bought > wybrane > unselected > selected view mode > all
  const displayImages = useMemo(() => {
    if (shouldShowDelivered) {
      return finalImages;
    }
    
    if (shouldShowBought) {
      return boughtImages;
    }
    
    // In "wybrane" view, show only selected photos (approved photos)
    // Check this BEFORE unselected to ensure wybrane takes precedence
    if (shouldShowWybrane) {
      if (selectionState?.selectedKeys && Array.isArray(selectionState.selectedKeys) && selectionState.selectedKeys.length > 0) {
        const selectedSet = new Set(selectionState.selectedKeys);
        return allImages.filter((img) => selectedSet.has(img.key));
      }
      return [];
    }
    
    if (shouldShowUnselected) {
      // Filter out any selected/approved photos to ensure we only show truly unselected photos
      // Exclude:
      // 1. Photos in selectedKeys (from current selection or approved orders) - ONLY when selection is disabled
      // 2. Photos in CLIENT_APPROVED/PREPARING_DELIVERY/CHANGES_REQUESTED orders (boughtPhotoKeys)
      // This is a safety net in case backend filtering isn't perfect
      const excludedKeys = new Set<string>();
      
      // Add selectedKeys from selectionState ONLY when selection is disabled (approved/changesRequested/preparingDelivery)
      // When selection is enabled, photos should remain visible in Niewybrane even after being selected
      if (!isSelectingState && selectionState?.selectedKeys && Array.isArray(selectionState.selectedKeys)) {
        selectionState.selectedKeys.forEach((key) => excludedKeys.add(key));
      }
      
      // Add photos from CLIENT_APPROVED orders
      boughtPhotoKeys.forEach((key) => excludedKeys.add(key));
      
      if (excludedKeys.size > 0) {
        return unselectedImages.filter((img) => !excludedKeys.has(img.key));
      }
      return unselectedImages;
    }
    
    if (viewMode === "selected") {
      if (selectionState?.selectedKeys && Array.isArray(selectionState.selectedKeys) && selectionState.selectedKeys.length > 0) {
        const selectedSet = new Set(selectionState.selectedKeys);
        return allImages.filter((img) => selectedSet.has(img.key));
      }
      return [];
    }
    
    return allImages;
  }, [shouldShowDelivered, finalImages, shouldShowBought, boughtImages, shouldShowWybrane, shouldShowUnselected, unselectedImages, viewMode, allImages, selectionState?.selectedKeys, boughtPhotoKeys, orderIdForFinals, isSelectingState]);

  // Selection toggle handler - uses React Query optimistic updates (Flux pattern)
  // Get queryClient to access latest cache state and avoid stale closures
  const queryClient = useQueryClient();
  const handleImageSelect = useCallback(
    (key: string) => {
      // Owner preview is always read-only.
      if (isOwnerPreview) {
        return;
      }
      // Only allow selection changes when in selecting state
      if (!isSelectingState) {
        return;
      }

      // Get latest selectionState from React Query cache to avoid stale closures
      const queryKey = queryKeys.gallery.selection(galleryId || "");
      const latestState = queryClient.getQueryData(queryKey) as typeof selectionState;
      const stateToUse = latestState || selectionState;
      
      // If selectionState is not loaded yet, don't allow selection
      if (!stateToUse) {
        return;
      }

      // Check limits before allowing selection
      const currentPricingPackage = stateToUse.pricingPackage;
      const baseLimit = currentPricingPackage?.includedCount ?? 0;
      const extraPriceCents = currentPricingPackage?.extraPriceCents ?? 0;
      const currentSelectedKeys = stateToUse.selectedKeys || [];
      const isSelected = currentSelectedKeys.includes(key);

      // If deselecting, always allow
      if (isSelected) {
        selectionActions.toggleSelection.mutate({ key, isSelected: false });
        return;
      }

      // If selecting, check limits
      const canAddMore = extraPriceCents > 0 || currentSelectedKeys.length < baseLimit;
            if (canAddMore) {
              selectionActions.toggleSelection.mutate({ key, isSelected: true });
            }
    },
    [isOwnerPreview, isSelectingState, selectionState, selectionActions, queryClient, galleryId]
  );

  // Approve selection - uses React Query state directly
  const handleApproveSelection = useCallback(async () => {
    if (!selectionActions.approveSelection.mutateAsync || !selectionState?.selectedKeys) return;
    
    const keysArray = selectionState.selectedKeys;
    if (keysArray.length === 0) return;

    setIsActionLoading(true);
    try {
      const payload: { selectedKeys: string[]; photoBookKeys?: string[]; photoPrintKeys?: string[] } = {
        selectedKeys: keysArray,
      };
      if (Array.isArray(selectionState.photoBookKeys)) payload.photoBookKeys = selectionState.photoBookKeys;
      if (Array.isArray(selectionState.photoPrintKeys)) payload.photoPrintKeys = selectionState.photoPrintKeys;
      await selectionActions.approveSelection.mutateAsync(payload);
      // Selection state will update via query invalidation
    } catch (error) {
      console.error("Failed to approve selection:", error);
    } finally {
      setIsActionLoading(false);
    }
  }, [selectionState?.selectedKeys, selectionState?.photoBookKeys, selectionState?.photoPrintKeys, selectionActions]);

  // Request changes
  const handleRequestChanges = useCallback(async () => {
    if (!selectionActions.requestChanges.mutateAsync) return;

    setIsActionLoading(true);
    try {
      await selectionActions.requestChanges.mutateAsync();
      // Smooth UX: keep loading overlay up, then show confirmation overlay, then hide loading.
      // Also ensure we don't have stale confirmation overlays visible.
      setShowChangeRequestCanceledOverlay(false);
      setShowChangeRequestSubmittedOverlay(true);
      setIsActionLoading(false);
    } catch (error) {
      console.error("Failed to request changes:", error);
      setIsActionLoading(false);
    }
  }, [selectionActions, galleryId]);

  // Cancel change request - approve current selection again to restore order
  // Note: No validation needed - backend will restore the existing CHANGES_REQUESTED order
  const handleCancelChangeRequest = useCallback(async () => {
    if (!selectionActions.approveSelection.mutateAsync) {
      console.error("approveSelection.mutateAsync is not available");
      return;
    }
    
    const keysArray = selectionState?.selectedKeys || [];
    const payload: { selectedKeys: string[]; photoBookKeys?: string[]; photoPrintKeys?: string[] } = {
      selectedKeys: keysArray,
    };
    if (Array.isArray(selectionState?.photoBookKeys)) payload.photoBookKeys = selectionState.photoBookKeys;
    if (Array.isArray(selectionState?.photoPrintKeys)) payload.photoPrintKeys = selectionState.photoPrintKeys;

    setIsActionLoading(true);
    try {
      await selectionActions.approveSelection.mutateAsync(payload);
      
      // Smooth UX: keep the first modal visible under the loading overlay,
      // then swap to the success confirmation without flashing the page.
      setShowChangesRequestedOverlay(false);
      setShowChangeRequestSubmittedOverlay(false);
      setShowChangeRequestCanceledOverlay(true);
      setIsActionLoading(false);
    } catch (error) {
      console.error("Failed to cancel change request:", error);
      setCancelChangeErrorMessage(formatApiError(error));
      setShowCancelChangeErrorModal(true);
      setIsActionLoading(false);
    }
  }, [selectionActions, selectionState?.selectedKeys, selectionState?.photoBookKeys, selectionState?.photoPrintKeys]);

  // ZIP status for current order (when viewing a single order or when single order exists)
  const currentOrderId = selectedOrderId || singleOrder?.orderId || null;
  const shouldFetchZipStatus = shouldShowDelivered && !!currentOrderId && (!hasMultipleOrders || !!selectedOrderId);
  const { data: zipStatus } = useZipStatus(
    galleryId,
    currentOrderId,
    shouldFetchZipStatus
  );

  // ZIP status for order in overlay (when multiple orders and overlay is shown)
  const overlayOrderId = zipOverlayOrderId || currentOrderId;
  const { data: zipStatusForOverlay } = useZipStatus(
    galleryId,
    overlayOrderId,
    showZipOverlay && !!overlayOrderId && hasMultipleOrders
  );

  // Download ZIP
  const handleDownloadZip = useCallback(async () => {
    if (isOwnerPreview) {
      return;
    }
    const orderId = selectedOrderId || singleOrder?.orderId;
    if (!galleryId || !orderId) return;

    // If ZIP has error status, show error overlay
    if (zipStatus?.status === "error") {
      setZipDownloadState({ showOverlay: false, isError: false });
      setShowZipOverlay(true);
      return;
    }

    // If ZIP is not ready (generating or not started), show ZIP overlay (status + ETA).
    // We'll still attempt download below when status is unknown/not_started; 404 becomes a normal "preparing" state.
    if (zipStatus?.generating) {
      setZipDownloadState({ showOverlay: false, isError: false });
      setShowZipOverlay(true);
      return;
    }

    const token = getToken(galleryId);
    if (!token) {
      setZipDownloadState({ showOverlay: true, isError: true });
      return;
    }

    try {
      const API_URL = getPublicApiUrl();

      // If status says "ready", just download.
      // Otherwise, try anyway (to avoid stale status); treat 404/202 as "preparing".
      if (!zipStatus?.ready) {
        // Show immediate overlay while we probe the ZIP endpoint.
        setZipDownloadState({ showOverlay: true, isError: false });
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        setZipDownloadState({ showOverlay: true, isError: false });
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const response = await fetch(
        `${API_URL}/galleries/${galleryId}/orders/${orderId}/final/zip`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      // 404 => ZIP not yet created (normal). 202 => backend-side generation (defensive).
      if (response.status === 404 || response.status === 202) {
        setZipDownloadState({ showOverlay: false, isError: false });
        setShowZipOverlay(true);
        // Kick status polling to refresh soon.
        void queryClient.invalidateQueries({ queryKey: ["zipStatus", galleryId, orderId, "final"] });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to download ZIP");
      }

      // Backend returns JSON with presigned URL, not the ZIP blob directly
      const data = await response.json();
      if (data.url) {
        // Download from presigned URL
        const downloadUrl = data.url;
        const filename = data.filename || `gallery-${orderId}.zip`;
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        throw new Error("No download URL in response");
      }

      // Close overlay after download starts
      setTimeout(() => {
        setZipDownloadState({ showOverlay: false, isError: false });
      }, 300);
    } catch (error) {
      console.error("Failed to download ZIP:", error);
      setZipDownloadState({ showOverlay: true, isError: true });
    }
  }, [isOwnerPreview, galleryId, selectedOrderId, singleOrder, zipStatus, queryClient]);

  // Show error overlay when ZIP status changes to error (only once per session)
  useEffect(() => {
    if (zipStatus?.status === "error" && !isOwnerPreview && galleryId) {
      const sessionKey = `zip_error_shown_${galleryId}`;
      const hasShownError = sessionStorage.getItem(sessionKey) === "true";
      
      if (!hasShownError) {
        setShowZipOverlay(true);
        sessionStorage.setItem(sessionKey, "true");
      }
    }
  }, [zipStatus?.status, isOwnerPreview, galleryId]);

  // Reset ZIP error flag on logout (when authentication changes)
  useEffect(() => {
    if (!isAuthenticated && galleryId) {
      const sessionKey = `zip_error_shown_${galleryId}`;
      sessionStorage.removeItem(sessionKey);
    }
  }, [isAuthenticated, galleryId]);

  // ALWAYS default to "Dostarczone" view when there are delivered orders (on mount/refresh)
  // Use a ref to track initialization to avoid resetting user's choice within session
  const defaultViewInitializedRef = useRef(false);
  useEffect(() => {
    if (deliveredOrders.length > 0 && !defaultViewInitializedRef.current) {
      // Only set default if no view is explicitly active
      if (!showDeliveredView && !showBoughtView && !showUnselectedView) {
        setShowDeliveredView(true);
      }
      defaultViewInitializedRef.current = true;
    } else if (deliveredOrders.length === 0) {
      // Reset when delivered orders disappear
      defaultViewInitializedRef.current = false;
    }
  }, [deliveredOrders.length, showDeliveredView, showBoughtView, showUnselectedView]);

  // Reset unselected view if there are no unselected photos available
  useEffect(() => {
    if (showUnselectedView && !hasUnselectedPhotos && isUnselectedFetched) {
      // If user is viewing unselected photos but there are none, switch back to delivered view
      setShowUnselectedView(false);
      setShowDeliveredView(true);
    }
  }, [showUnselectedView, hasUnselectedPhotos, isUnselectedFetched]);

  // Buy more photos - switch to unselected view to allow selecting additional photos
  // Only allowed when in "delivered" state (no CLIENT_APPROVED orders)
  const handleBuyMore = useCallback(() => {
    if (selectionState?.hasClientApprovedOrder) {
      // Buying more is locked when CLIENT_APPROVED order exists
      return;
    }
    setShowDeliveredView(false);
    setShowBoughtView(false);
    setShowUnselectedView(true);
    setViewMode("all");
    // Selection will be enabled automatically when showUnselectedView is true and no CLIENT_APPROVED order
  }, [selectionState?.hasClientApprovedOrder]);


  // Hash prefetching (same as before)
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      hashPrefetchHandledRef.current ||
      !hasNextPage ||
      isFetchingNextPage ||
      imagesLoading ||
      !data?.pages.length ||
      shouldShowDelivered
    )
      return;

    const hash = window.location.hash;
    const slideMatch = hash.match(/slide=(\d+)/);
    if (!slideMatch) {
      hashPrefetchHandledRef.current = true;
      return;
    }

    const targetSlideIndex = parseInt(slideMatch[1], 10);
    if (isNaN(targetSlideIndex) || targetSlideIndex < 0) {
      hashPrefetchHandledRef.current = true;
      return;
    }

    const imagesPerPage = 50;
    const currentImageCount = allImages.length;
    const pagesNeeded = Math.ceil((targetSlideIndex + 1) / imagesPerPage);
    const currentPages = data?.pages.length || 0;
    const pagesToFetch = pagesNeeded - currentPages;

    if (pagesToFetch > 0 && hasNextPage) {
      hashPrefetchHandledRef.current = true;
      const prefetchPages = async () => {
        for (let i = 0; i < pagesToFetch; i++) {
          if (!hasNextPage) break;
          await prefetchNextPage();
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      };
      prefetchPages().catch((err) => {
        console.error("Error prefetching pages for hash navigation:", err);
      });
    } else {
      hashPrefetchHandledRef.current = true;
    }
  }, [
    allImages.length,
    data?.pages.length,
    hasNextPage,
    isFetchingNextPage,
    imagesLoading,
    prefetchNextPage,
    shouldShowDelivered,
  ]);

  // Aggressive prefetching
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || !data?.pages.length || shouldShowDelivered) return;

    const timeoutId = setTimeout(() => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollPercentage = (scrollTop + windowHeight) / documentHeight;

      if (scrollPercentage > 0.4 && hasNextPage && !isFetchingNextPage) {
        prefetchNextPage();
      }
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [hasNextPage, isFetchingNextPage, prefetchNextPage, data?.pages.length, shouldShowDelivered]);

  // Handle carousel layout
  useEffect(() => {
    if (gridLayout === "carousel" && openGalleryRef.current && displayImages.length > 0) {
      openedFromCarouselRef.current = true;
      const timeoutId = setTimeout(() => {
        if (openGalleryRef.current) {
          openGalleryRef.current(0);
        }
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [gridLayout, displayImages.length]);

  const handleDownload = useCallback(
    async (imageKey: string) => {
      if (isOwnerPreview) {
        return;
      }
      if (!galleryId || !imageKey) {
        return;
      }

      try {
        // Only delivered orders download from finals storage. Bought orders use original images.
        const isDeliveredView = shouldShowDelivered && (selectedOrderId || singleOrder?.orderId);
        const orderIdForDownload = isDeliveredView 
          ? (selectedOrderId || singleOrder?.orderId || null)
          : null;
        
        await downloadImage({
          galleryId,
          imageKey,
          ...(orderIdForDownload && {
            orderId: orderIdForDownload,
            type: 'final' as const,
          }),
        });
      } catch (error) {
        console.error("Failed to download image:", error);
      }
    },
    [isOwnerPreview, galleryId, downloadImage, shouldShowDelivered, selectedOrderId, singleOrder]
  );

  // Determine current selection count - React Query is single source of truth
  // Always prefer selectedKeys.length when available (even if 0), as it's the source of truth
  // Only fall back to selectedCount from server if selectedKeys is not available
  // When in "approved" state and viewing "Niewybrane", selection is locked, so count should be 0
  const currentSelectedCount = useMemo(() => {
    const selectedKeysArray = selectionState?.selectedKeys;
    // When in "approved" state and viewing "Niewybrane", selection is locked - show 0
    // selectedKeys might contain keys from approved orders, but we shouldn't count them for new selection
    if (galleryState === "approved" && shouldShowUnselected && !isSelectingState) {
      return 0;
    }
    
    // If selectedKeys is an array (even if empty), use its length as the source of truth
    if (Array.isArray(selectedKeysArray)) {
      return selectedKeysArray.length;
    }
    // Fall back to server's selectedCount only if selectedKeys is not available
    return selectionState?.selectedCount ?? 0;
  }, [selectionState?.selectedKeys, selectionState?.selectedCount, selectionState, galleryState, shouldShowUnselected, isSelectingState]);

  // Show selection indicators when:
  // 1. In selecting state (can actually select) - show both checkmarks and + buttons
  // 2. OR when approved and viewing "all" photos (to show checkmarks ONLY on selected photos, no + buttons)
  // But NOT when viewing "selected" photos (no checkmarks needed there)
  // And NOT in "Dokupione" view (bought orders - read-only)
  // And NOT in "Wybrane" view (initial approval - read-only, showing only selected photos)
  const showSelectionIndicatorsValue =
    !isOwnerPreview && !shouldShowBought && !shouldShowWybrane && (isSelectingState || (galleryState === "approved" && viewMode === "all"));
  // Only show unselected indicators (+) when in selecting state
  // When there's no price per additional photo and we've reached the limit, hide all + signs
  // They will reappear when user unselects photos (bringing selection below limit)
  const baseLimit = selectionState?.pricingPackage?.includedCount ?? 0;
  const extraPriceCents = selectionState?.pricingPackage?.extraPriceCents ?? 0;
  const showUnselectedIndicators = useMemo(() => {
    if (isOwnerPreview) return false;
    if (!isSelectingState) return false;
    // If there's no price per additional photo and we've reached the limit, hide + signs
    if (extraPriceCents === 0 && currentSelectedCount >= baseLimit) {
      return false;
    }
    // Otherwise, show + signs for unselected photos
    return true;
  }, [isOwnerPreview, isSelectingState, extraPriceCents, currentSelectedCount, baseLimit]);
  const canSelectValue = !isOwnerPreview && isSelectingState && !shouldShowBought && !shouldShowWybrane;

  const photoBookCount = Math.max(0, selectionState?.pricingPackage?.photoBookCount ?? 0);
  const photoPrintCount = Math.max(0, selectionState?.pricingPackage?.photoPrintCount ?? 0);
  const showPhotoBookUi =
    !isOwnerPreview &&
    !shouldShowBought &&
    !shouldShowUnselected &&
    isSelectingState &&
    photoBookCount > 0 &&
    photoBookCount < baseLimit;
  const showPhotoPrintUi =
    !isOwnerPreview &&
    !shouldShowBought &&
    !shouldShowUnselected &&
    isSelectingState &&
    photoPrintCount > 0 &&
    photoPrintCount < baseLimit;
  const photoBookKeys = selectionState?.photoBookKeys ?? [];
  const photoPrintKeys = selectionState?.photoPrintKeys ?? [];
  // #region agent log
  if (typeof fetch !== "undefined") {
    const pricingPackage = selectionState?.pricingPackage;
    fetch("http://127.0.0.1:7243/ingest/50d01496-c9df-4121-8d58-8b499aed9e39", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "page.tsx:photoBookPrintVisibility",
        message: "photo book/print icon visibility inputs",
        data: {
          photoBookCount,
          photoPrintCount,
          baseLimit,
          includedCountFromPkg: pricingPackage?.includedCount ?? null,
          isSelectingState,
          shouldShowBought,
          shouldShowUnselected,
          isOwnerPreview,
          showPhotoBookUi,
          showPhotoPrintUi,
          photoBookCountGt0: photoBookCount > 0,
          photoBookCountLtBase: photoBookCount < baseLimit,
          photoPrintCountGt0: photoPrintCount > 0,
          photoPrintCountLtBase: photoPrintCount < baseLimit,
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "post-fix",
        hypothesisId: "A",
      }),
    }).catch(() => {});
  }
  // #endregion

  const handleTogglePhotoBook = useCallback(
    (key: string) => {
      if (!showPhotoBookUi || !selectionActions.togglePhotoBook.mutate) return;
      const inSet = photoBookKeys.includes(key);
      if (!inSet && photoBookKeys.length >= photoBookCount) return;
      selectionActions.togglePhotoBook.mutate({ key, inSet: !inSet });
    },
    [showPhotoBookUi, photoBookKeys, photoBookCount, selectionActions.togglePhotoBook.mutate]
  );
  const handleTogglePhotoPrint = useCallback(
    (key: string) => {
      if (!showPhotoPrintUi || !selectionActions.togglePhotoPrint.mutate) return;
      const inSet = photoPrintKeys.includes(key);
      if (!inSet && photoPrintKeys.length >= photoPrintCount) return;
      selectionActions.togglePhotoPrint.mutate({ key, inSet: !inSet });
    },
    [showPhotoPrintUi, photoPrintKeys, photoPrintCount, selectionActions.togglePhotoPrint.mutate]
  );

  // Combine all loading states to prevent blink between loading screens
  // For delivered view: wait for both selection state AND final images
  // For bought view: wait for selection state, client-approved orders, AND regular images
  // For regular view: wait for both selection state AND regular images
  const isFullyLoading = useMemo(
    () =>
      isLoading ||
      selectionLoading ||
      // Finals view has a two-step dependency: we must load delivered orders to know the orderId,
      // then load final images for that order. Without this, the loader can disappear briefly
      // between "selection loaded" and "finals query enabled".
      (shouldShowDelivered &&
        (isLoadingDeliveredOrders || (orderIdForFinals ? isLoadingFinalImages : false))) ||
      // Bought view: load client-approved orders (uses original images, no final images query needed)
      (shouldShowBought && isLoadingClientApprovedOrders) ||
      ((!shouldShowDelivered && !shouldShowBought) && imagesLoading),
    [
      isLoading,
      selectionLoading,
      shouldShowDelivered,
      shouldShowBought,
      isLoadingDeliveredOrders,
      isLoadingClientApprovedOrders,
      orderIdForFinals,
      isLoadingFinalImages,
      imagesLoading,
    ]
  );

  if (isFullyLoading) {
    return <FullPageLoading text="Ładowanie..." />;
  }

  // For owner preview, wait for authentication to complete before showing content
  // For regular access, redirect is handled by useEffect above
  if (!isOwnerPreview && (!isAuthenticated || !galleryId)) {
    return null;
  }
  
  // For owner preview, show loading while waiting for token, but don't redirect
  if (isOwnerPreview && isLoading) {
    return <FullPageLoading text="Ładowanie podglądu..." />;
  }
  
  // For owner preview, if still not authenticated after loading completes, show nothing
  // (redirect is handled in useEffect above)
  if (isOwnerPreview && !isAuthenticated && !isLoading) {
    return null;
  }

  // Only show error if we're not loading, have no data, and actually have an error
  // This prevents showing transient errors during initial load/retry
  if (error && !shouldShowDelivered && !imagesLoading && !data?.pages?.length) {
    // Check if this is a "Gallery not found" error (404 or error message contains "Gallery not found")
    const apiError = error as ApiError;
    const errorMessage = String(error).toLowerCase();
    const isNotFoundError = 
      apiError?.status === 404 || 
      errorMessage.includes("gallery not found") ||
      errorMessage.includes("galeria nie została znaleziona") ||
      errorMessage.includes("not found");

    if (isNotFoundError) {
      return (
        <Suspense fallback={<FullPageLoading text="Ładowanie..." />}>
          <GalleryNotFound galleryId={galleryId || undefined} />
        </Suspense>
      );
    }

    // For other errors, show full-page Oops (no raw error in UI)
    return (
      <Suspense fallback={<FullPageLoading text="Ładowanie..." />}>
        <GalleryLoadError onRetry={() => void refetchGalleryImages()} />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Show loading overlay immediately when actions are in progress */}
      {isActionLoading && <FullPageLoading text="Przetwarzanie..." />}
      <ContextMenuPrevention />
      <ScrollToTopButton />
      <DownloadButtonFeedback />
      <Suspense fallback={null}>
        <DownloadOverlay
        isVisible={downloadState.showOverlay || zipDownloadState.showOverlay}
        isError={downloadState.isError || zipDownloadState.isError}
        onClose={() => {
          closeOverlay();
          setZipDownloadState({ showOverlay: false, isError: false });
        }}
        />
      </Suspense>
      <Suspense fallback={null}>
        <ZipOverlay
        isVisible={showZipOverlay}
        zipStatus={zipStatusForOverlay || zipStatus}
        totalPhotos={finalImagesTotalCount}
        onClose={() => {
          setShowZipOverlay(false);
          setZipOverlayOrderId(null);
        }}
      />
      </Suspense>
      <Suspense fallback={null}>
        <HelpOverlay isVisible={showHelp} onClose={() => setShowHelp(false)} selectionState={selectionState} />
      </Suspense>
      <Suspense fallback={null}>
        <ChangesRequestedOverlay
        isVisible={showChangesRequestedOverlay}
        onClose={() => {
          setShowChangesRequestedOverlay(false);
        }}
        onCancelRequest={handleCancelChangeRequest}
        />
      </Suspense>
      <Suspense fallback={null}>
        <ChangeRequestCanceledOverlay
        isVisible={showChangeRequestCanceledOverlay}
        onClose={() => {
          setShowChangeRequestCanceledOverlay(false);
        }}
        />
      </Suspense>
      <Suspense fallback={null}>
        <ChangeRequestSubmittedOverlay
          isVisible={showChangeRequestSubmittedOverlay}
          onClose={() => {
            setShowChangeRequestSubmittedOverlay(false);
          }}
          onCancelRequest={handleCancelChangeRequest}
        />
      </Suspense>
      <Suspense fallback={null}>
        <ErrorAlertOverlay
          isVisible={showCancelChangeErrorModal}
          title="Nie udało się anulować prośby o zmiany"
          message={cancelChangeErrorMessage}
          onClose={() => {
            setShowCancelChangeErrorModal(false);
            setCancelChangeErrorMessage("");
          }}
        />
      </Suspense>
      <GalleryTopBar
        onHelpClick={() => {
          hapticFeedback('light');
          setShowHelp(true);
        }}
        gridLayout={gridLayout}
        onGridLayoutChange={(newLayout) => {
          hapticFeedback('light');
          if (newLayout === "carousel" && gridLayout !== "carousel") {
            layoutBeforeCarouselRef.current = gridLayout;
          }
          setGridLayout(newLayout);
        }}
        isOwnerPreview={isOwnerPreview}
        disableLogout={isOwnerPreview}
      />
      <SecondaryMenu
        selectedCount={currentSelectedCount}
        onApproveSelection={isOwnerPreview ? undefined : handleApproveSelection}
        onRequestChanges={isOwnerPreview ? undefined : handleRequestChanges}
        onCancelChangeRequest={isOwnerPreview ? undefined : handleCancelChangeRequest}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        showDeliveredView={showDeliveredView}
        onDeliveredViewClick={() => {
          setShowDeliveredView(true);
          setShowBoughtView(false);
          setShowUnselectedView(false);
          setSelectedOrderId(null); // Reset to show orders list
        }}
        showBoughtView={sectionVisibility.showBoughtView ? showBoughtView : undefined}
        hasDeliveredOrders={deliveredOrders.length > 0}
        hasInitialApprovedSelection={isInitialApproval}
        isLocked={isLocked}
        isWybraneViewActive={shouldShowWybrane}
        onBoughtViewClick={() => {
          // If in wybrane context (initial approval), switch to wybrane view
          if (sectionVisibility.showWybrane) {
            setShowBoughtView(false);
            setShowDeliveredView(false);
            setShowUnselectedView(false);
          } else {
            // Otherwise, show bought view (for dokupione)
            setShowBoughtView(true);
            setShowDeliveredView(false);
            setShowUnselectedView(false);
          }
        }}
        showUnselectedView={hasUnselectedPhotos ? true : undefined}
        isUnselectedViewActive={shouldShowUnselected}
        onUnselectedViewClick={() => {
          setShowUnselectedView(true);
          setShowDeliveredView(false);
          setShowBoughtView(false);
        }}
        showBuyMore={
          !isOwnerPreview &&
          galleryState === "delivered" &&
          selectionState?.hasDeliveredOrder &&
          !selectionState?.hasClientApprovedOrder &&
          (selectionState?.pricingPackage?.extraPriceCents || 0) > 0 &&
          !shouldShowDelivered &&
          !shouldShowBought &&
          !shouldShowUnselected
        }
        onBuyMoreClick={isOwnerPreview ? undefined : handleBuyMore}
        onDownloadZip={isOwnerPreview ? undefined : handleDownloadZip}
        zipStatus={zipStatus}
        showDownloadZip={!isOwnerPreview && shouldShowDelivered && !shouldShowBought && !shouldShowUnselected && !hasMultipleOrders}
        hasMultipleOrders={hasMultipleOrders}
      />
      
      {/* Delivered orders list (if multiple orders) */}
      {shouldShowDelivered && hasMultipleOrders && !selectedOrderId && (
        <div className="w-full px-8 md:px-12 lg:px-16 py-8">
          <h2 className="text-2xl font-bold mb-6">Dostarczone zdjęcia</h2>
          <div className="space-y-4" role="list">
            {deliveredOrders.map((order) => (
              <DeliveredOrderCard
                key={order.orderId}
                order={order}
                galleryId={galleryId}
                isOwnerPreview={isOwnerPreview}
                onViewClick={setSelectedOrderId}
                onZipError={(orderId) => {
                  setZipOverlayOrderId(orderId);
                  setShowZipOverlay(true);
                }}
                onZipGenerating={(orderId) => {
                  setZipOverlayOrderId(orderId);
                  setShowZipOverlay(true);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Images grid */}
      {(() => {
        // Only show single order view if we're not loading (to avoid flash when multiple orders load)
        const shouldShowSingleOrder = singleOrder && !isLoadingDeliveredOrders;
        return !shouldShowDelivered || selectedOrderId || shouldShowSingleOrder || shouldShowBought || shouldShowUnselected;
      })() && (
        <div className="w-full px-2 md:px-2 lg:px-2 py-4 md:py-4 overflow-hidden">
          <Suspense fallback={<FullPageLoading text="Ładowanie galerii..." />}>
            <LightGalleryWrapper
            images={displayImages}
            galleryId={galleryId || undefined}
            onDownload={isOwnerPreview ? undefined : handleDownload}
            enableDownload={!isOwnerPreview && shouldShowDelivered}
            onGalleryReady={(openGallery) => {
              openGalleryRef.current = openGallery;
            }}
            onPrefetchNextPage={
              shouldShowDelivered
                ? fetchNextFinalPage
                : shouldShowUnselected
                ? prefetchNextUnselectedPage
                : prefetchNextPage
            }
            hasNextPage={
              shouldShowDelivered
                ? hasNextFinalPage || false
                : shouldShowUnselected
                ? hasNextUnselectedPage || false
                : hasNextPage || false
            }
            onGalleryClose={() => {
              if (openedFromCarouselRef.current) {
                setGridLayout("marble");
                openedFromCarouselRef.current = false;
                layoutBeforeCarouselRef.current = "marble";
              }
            }}
            selectedKeys={new Set(selectionState?.selectedKeys || [])}
            onImageSelect={isOwnerPreview ? undefined : handleImageSelect}
            canSelect={canSelectValue}
            showSelectionIndicators={showSelectionIndicatorsValue}
            baseLimit={baseLimit}
            extraPriceCents={extraPriceCents}
            currentSelectedCount={currentSelectedCount}
            showPhotoBookUi={showPhotoBookUi}
            showPhotoPrintUi={showPhotoPrintUi}
            photoBookKeys={photoBookKeys}
            photoPrintKeys={photoPrintKeys}
            onTogglePhotoBook={handleTogglePhotoBook}
            onTogglePhotoPrint={handleTogglePhotoPrint}
          >
            <VirtuosoGridComponent
              key={`grid-${shouldShowDelivered ? 'delivered' : shouldShowBought ? 'bought' : shouldShowUnselected ? 'unselected' : 'selecting'}-${displayImages.length}`}
              images={displayImages}
              layout={gridLayout === "carousel" ? layoutBeforeCarouselRef.current : gridLayout}
              hasNextPage={
                shouldShowDelivered
                  ? hasNextFinalPage || false
                  : shouldShowUnselected
                  ? hasNextUnselectedPage || false
                  : hasNextPage || false
              }
              onLoadMore={() => {
                if (shouldShowDelivered) {
                  fetchNextFinalPage();
                } else if (shouldShowUnselected) {
                  fetchNextUnselectedPage();
                } else {
                  fetchNextPage();
                }
              }}
              isFetchingNextPage={
                shouldShowDelivered
                  ? isFetchingNextFinalPage
                  : shouldShowUnselected
                  ? isFetchingNextUnselectedPage
                  : isFetchingNextPage
              }
              galleryId={galleryId || undefined}
              selectedKeys={viewMode === "selected" ? new Set() : new Set(selectionState?.selectedKeys || [])}
              onImageSelect={isOwnerPreview ? undefined : handleImageSelect}
              canSelect={canSelectValue}
              showSelectionIndicators={showSelectionIndicatorsValue}
              showUnselectedIndicators={showUnselectedIndicators}
              enableDownload={shouldShowDelivered}
              onDownload={handleDownload}
              hideBorders={shouldShowBought}
              showPhotoBookUi={showPhotoBookUi}
              showPhotoPrintUi={showPhotoPrintUi}
              photoBookKeys={photoBookKeys}
              photoPrintKeys={photoPrintKeys}
              photoBookCount={photoBookCount}
              photoPrintCount={photoPrintCount}
              onTogglePhotoBook={handleTogglePhotoBook}
              onTogglePhotoPrint={handleTogglePhotoPrint}
            />
          </LightGalleryWrapper>
          </Suspense>
        </div>
      )}
    </div>
  );
}
