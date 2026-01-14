"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/react-query";
import { useAuth } from "@/providers/AuthProvider";
import { getToken } from "@/lib/token";
import { useGalleryImages } from "@/hooks/useGallery";
import { useImageDownload } from "@/hooks/useImageDownload";
import { useSelection } from "@/hooks/useSelection";
import { useSelectionActions } from "@/hooks/useSelectionActions";
import { useDeliveredOrders, useFinalImages } from "@/hooks/useOrders";
import { GalleryTopBar } from "@/components/gallery/GalleryTopBar";
import { SecondaryMenu } from "@/components/gallery/SecondaryMenu";
import { VirtuosoGridComponent, type GridLayout } from "@/components/gallery/VirtuosoGrid";
import { LightGalleryWrapper } from "@/components/gallery/LightGalleryWrapper";
import { ContextMenuPrevention } from "@/components/gallery/ContextMenuPrevention";
import { DownloadOverlay } from "@/components/gallery/DownloadOverlay";
import { HelpOverlay } from "@/components/gallery/HelpOverlay";
import { DownloadButtonFeedback } from "@/components/gallery/DownloadButtonFeedback";
import { ChangesRequestedOverlay } from "@/components/gallery/ChangesRequestedOverlay";

export default function GalleryPage() {
  const params = useParams();
  const router = useRouter();
  const { galleryId, isAuthenticated, isLoading } = useAuth();
  const id = params?.id as string;
  
  const [gridLayout, setGridLayout] = useState<GridLayout>("marble");
  const [viewMode, setViewMode] = useState<"all" | "selected">("all");
  const [showHelp, setShowHelp] = useState(false);
  const [showDeliveredView, setShowDeliveredView] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showChangesRequestedOverlay, setShowChangesRequestedOverlay] = useState(false);
  
  const { download: downloadImage, downloadState, closeOverlay } = useImageDownload();
  const openGalleryRef = useRef<((index: number) => void) | null>(null);
  const hashPrefetchHandledRef = useRef(false);
  const openedFromCarouselRef = useRef(false);
  const layoutBeforeCarouselRef = useRef<GridLayout>("marble");
  
  // Use the ID from params as the stable galleryId (it doesn't change)
  const queryGalleryId = id || galleryId || "";

  // Selection state - React Query is the single source of truth
  const { data: selectionState, isLoading: selectionLoading } = useSelection(galleryId);
  const selectionActions = useSelectionActions(galleryId);

  // Determine gallery state (matching SecondaryMenu logic)
  const galleryState = useMemo(() => {
    if (!selectionState) return "selecting"; // Default to selecting when state is not loaded
    if (selectionState.hasDeliveredOrder) return "delivered";
    if (selectionState.changeRequestPending) return "changesRequested";
    if (selectionState.approved || selectionState.hasClientApprovedOrder) return "approved";
    return "selecting";
  }, [selectionState]);

  // Determine which images to show (must be computed early)
  const shouldShowDelivered = useMemo(() => {
    return showDeliveredView || galleryState === "delivered";
  }, [showDeliveredView, galleryState]);
  
  // Selection is enabled ONLY when in selecting state
  // Disabled in approved, changesRequested, and delivered states
  const isSelectingState = useMemo(() => {
    // Only allow selection when explicitly in "selecting" state
    return galleryState === "selecting";
  }, [galleryState]);

  // Delivered orders
  const { data: deliveredOrdersData } = useDeliveredOrders(galleryId);
  const deliveredOrders = deliveredOrdersData?.items || [];
  const hasMultipleOrders = deliveredOrders.length > 1;
  const singleOrder = deliveredOrders.length === 1 ? deliveredOrders[0] : null;

  // Final images for selected order
  const {
    data: finalImagesData,
    fetchNextPage: fetchNextFinalPage,
    hasNextPage: hasNextFinalPage,
    isFetchingNextPage: isFetchingNextFinalPage,
  } = useFinalImages(
    galleryId,
    selectedOrderId || singleOrder?.orderId || null,
    50
  );
  const finalImages = useMemo(() => {
    return finalImagesData?.pages.flatMap((page) => page.images || []) || [];
  }, [finalImagesData]);

  // No local state needed - React Query is the single source of truth

  // Show changes requested overlay on mount if state is changes requested
  useEffect(() => {
    if (selectionState?.changeRequestPending && !showChangesRequestedOverlay) {
      setShowChangesRequestedOverlay(true);
    }
  }, [selectionState?.changeRequestPending, showChangesRequestedOverlay]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !galleryId)) {
      if (id) {
        router.replace(`/login/${id}`);
      }
    }
  }, [isLoading, isAuthenticated, galleryId, id, router]);

  // Get images based on state
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: imagesLoading,
    error,
    prefetchNextPage,
  } = useGalleryImages(queryGalleryId, "thumb", 50);

  const allImages = useMemo(() => {
    return data?.pages.flatMap((page) => page.images || []) || [];
  }, [data]);

  // Filter images based on view mode and state
  const displayImages = useMemo(() => {
    if (shouldShowDelivered) {
      return finalImages;
    }
    
    if (viewMode === "selected") {
      if (selectionState?.selectedKeys && Array.isArray(selectionState.selectedKeys) && selectionState.selectedKeys.length > 0) {
        const selectedSet = new Set(selectionState.selectedKeys);
        return allImages.filter((img) => selectedSet.has(img.key));
      }
      return [];
    }
    
    return allImages;
  }, [shouldShowDelivered, finalImages, viewMode, allImages, selectionState?.selectedKeys]);

  // Selection toggle handler - uses React Query optimistic updates (Flux pattern)
  // Get queryClient to access latest cache state and avoid stale closures
  const queryClient = useQueryClient();
  const handleImageSelect = useCallback(
    (key: string) => {
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
    [isSelectingState, selectionState, selectionActions, queryClient, galleryId]
  );

  // Approve selection - uses React Query state directly
  const handleApproveSelection = useCallback(async () => {
    if (!selectionActions.approveSelection.mutateAsync || !selectionState?.selectedKeys) return;
    
    const keysArray = selectionState.selectedKeys;
    if (keysArray.length === 0) return;

    try {
      await selectionActions.approveSelection.mutateAsync(keysArray);
      // Selection state will update via query invalidation
    } catch (error) {
      console.error("Failed to approve selection:", error);
    }
  }, [selectionState?.selectedKeys, selectionActions]);

  // Request changes
  const handleRequestChanges = useCallback(async () => {
    if (!selectionActions.requestChanges.mutateAsync) return;

    try {
      await selectionActions.requestChanges.mutateAsync();
    } catch (error) {
      console.error("Failed to request changes:", error);
    }
  }, [selectionActions]);

  // Cancel change request - approve current selection again to restore order
  const handleCancelChangeRequest = useCallback(async () => {
    if (!selectionActions.approveSelection.mutateAsync || !selectionState?.selectedKeys) return;
    
    // Approve the current selection again - this will restore the CHANGES_REQUESTED order to CLIENT_SELECTING
    const keysArray = selectionState.selectedKeys;
    if (keysArray.length === 0) return;

    try {
      await selectionActions.approveSelection.mutateAsync(keysArray);
      setShowChangesRequestedOverlay(false);
    } catch (error) {
      console.error("Failed to cancel change request:", error);
    }
  }, [selectionActions, selectionState?.selectedKeys]);

  // Download ZIP
  const handleDownloadZip = useCallback(async () => {
    const orderId = selectedOrderId || singleOrder?.orderId;
    if (!galleryId || !orderId) return;

    const token = getToken(galleryId);
    if (!token) return;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
      const response = await fetch(
        `${API_URL}/galleries/${galleryId}/orders/${orderId}/final/zip`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to download ZIP");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gallery-${orderId}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Failed to download ZIP:", error);
    }
  }, [galleryId, selectedOrderId, singleOrder]);

  // Buy more photos
  const handleBuyMore = useCallback(() => {
    setShowDeliveredView(false);
    setViewMode("all");
    // Selection state will allow selection again
  }, []);

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
      if (!galleryId || !imageKey) {
        return;
      }

      try {
        await downloadImage({
          galleryId,
          imageKey,
        });
      } catch (error) {
        console.error("Failed to download image:", error);
      }
    },
    [galleryId, downloadImage]
  );

  // Determine current selection count - React Query is single source of truth
  // Use selectedKeys.length if available (from optimistic updates), otherwise use selectedCount from server
  const currentSelectedCount = useMemo(() => {
    const selectedKeysArray = selectionState?.selectedKeys;
    const countFromKeys = Array.isArray(selectedKeysArray) ? selectedKeysArray.length : 0;
    const countFromServer = selectionState?.selectedCount ?? 0;
    return countFromKeys > 0 ? countFromKeys : countFromServer;
  }, [selectionState?.selectedKeys, selectionState?.selectedCount, selectionState]);

  // Show selection indicators only when:
  // 1. In selecting state (can actually select)
  // 2. OR viewing selected photos (to see which ones were selected)
  const showSelectionIndicatorsValue = isSelectingState || viewMode === "selected";
  const canSelectValue = isSelectingState;

  if (isLoading || selectionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Ładowanie...</div>
      </div>
    );
  }

  if (!isAuthenticated || !galleryId) {
    return null;
  }

  if (imagesLoading && !shouldShowDelivered) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Ładowanie zdjęć...</div>
      </div>
    );
  }

  if (error && !shouldShowDelivered) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-600">Błąd ładowania galerii: {String(error)}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <ContextMenuPrevention />
      <DownloadButtonFeedback />
      <DownloadOverlay
        isVisible={downloadState.showOverlay}
        isError={downloadState.isError}
        onClose={closeOverlay}
      />
      <HelpOverlay isVisible={showHelp} onClose={() => setShowHelp(false)} selectionState={selectionState} />
      <ChangesRequestedOverlay
        isVisible={showChangesRequestedOverlay}
        onClose={() => setShowChangesRequestedOverlay(false)}
        onCancelRequest={handleCancelChangeRequest}
      />
      <GalleryTopBar 
        onHelpClick={() => setShowHelp(true)}
        gridLayout={gridLayout}
        onGridLayoutChange={(newLayout) => {
          if (newLayout === "carousel" && gridLayout !== "carousel") {
            layoutBeforeCarouselRef.current = gridLayout;
          }
          setGridLayout(newLayout);
        }}
      />
      <SecondaryMenu
        selectedCount={currentSelectedCount}
        onApproveSelection={handleApproveSelection}
        onRequestChanges={handleRequestChanges}
        onCancelChangeRequest={handleCancelChangeRequest}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        showDeliveredView={showDeliveredView}
        onDeliveredViewClick={() => setShowDeliveredView(true)}
        showBuyMore={
          selectionState?.hasDeliveredOrder &&
          (selectionState?.pricingPackage?.extraPriceCents || 0) > 0
        }
        onBuyMoreClick={handleBuyMore}
        onDownloadZip={handleDownloadZip}
      />
      
      {/* Delivered orders list (if multiple orders) */}
      {shouldShowDelivered && hasMultipleOrders && !selectedOrderId && (
        <div className="w-full px-8 md:px-12 lg:px-16 py-8">
          <h2 className="text-2xl font-bold mb-6">Dostarczone zdjęcia</h2>
          <div className="space-y-4" role="list">
            {deliveredOrders.map((order) => (
              <div
                key={order.orderId}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-black focus-within:ring-offset-2"
                onClick={() => setSelectedOrderId(order.orderId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedOrderId(order.orderId);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`Zobacz zamówienie ${order.orderNumber || order.orderId.slice(0, 8)}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">
                      Zamówienie #{order.orderNumber || order.orderId.slice(0, 8)}
                    </p>
                    <p className="text-sm text-gray-600">
                      {new Date(order.deliveredAt).toLocaleDateString("pl-PL")} • {order.selectedCount} zdjęć
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedOrderId(order.orderId);
                    }}
                    className="btn-primary touch-manipulation min-h-[44px]"
                    aria-label={`Zobacz zamówienie ${order.orderNumber || order.orderId.slice(0, 8)}`}
                  >
                    Zobacz
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Images grid */}
      {(!shouldShowDelivered || selectedOrderId || singleOrder) && (
        <div className="w-full px-2 md:px-2 lg:px-2 py-4 md:py-4">
          <LightGalleryWrapper
            images={displayImages}
            galleryId={galleryId || undefined}
            onDownload={handleDownload}
            enableDownload={shouldShowDelivered}
            onGalleryReady={(openGallery) => {
              openGalleryRef.current = openGallery;
            }}
            onPrefetchNextPage={
              shouldShowDelivered ? fetchNextFinalPage : prefetchNextPage
            }
            hasNextPage={shouldShowDelivered ? hasNextFinalPage || false : hasNextPage || false}
            onGalleryClose={() => {
              if (openedFromCarouselRef.current) {
                setGridLayout("marble");
                openedFromCarouselRef.current = false;
                layoutBeforeCarouselRef.current = "marble";
              }
            }}
            selectedKeys={new Set(selectionState?.selectedKeys || [])}
            onImageSelect={handleImageSelect}
            canSelect={isSelectingState}
            showSelectionIndicators={showSelectionIndicatorsValue}
          >
            <VirtuosoGridComponent
              images={displayImages}
              layout={gridLayout === "carousel" ? layoutBeforeCarouselRef.current : gridLayout}
              hasNextPage={shouldShowDelivered ? hasNextFinalPage || false : hasNextPage || false}
              onLoadMore={() => {
                if (shouldShowDelivered) {
                  fetchNextFinalPage();
                } else {
                  fetchNextPage();
                }
              }}
              isFetchingNextPage={shouldShowDelivered ? isFetchingNextFinalPage : isFetchingNextPage}
              galleryId={galleryId || undefined}
              selectedKeys={new Set(selectionState?.selectedKeys || [])}
              onImageSelect={handleImageSelect}
              canSelect={isSelectingState}
              showSelectionIndicators={showSelectionIndicatorsValue}
            />
          </LightGalleryWrapper>
        </div>
      )}
    </div>
  );
}
