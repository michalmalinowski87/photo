import { useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  ChevronDown,
  Image,
  Upload,
  CheckSquare,
  Square,
  Trash2,
  X,
  Check,
  Link,
} from "lucide-react";
import type { GetServerSideProps } from "next";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { DashboardVirtuosoGrid } from "../../../components/galleries/DashboardVirtuosoGrid";
import { LayoutSelector, type GridLayout } from "../../../components/galleries/LayoutSelector";
import { DeliveryStatusBadge } from "../../../components/orders/StatusBadges";
import Badge from "../../../components/ui/badge/Badge";
import { EmptyState } from "../../../components/ui/empty-state/EmptyState";
import { LazyRetryableImage } from "../../../components/ui/LazyRetryableImage";
import { Loading, GalleryLoading, FullPageLoading } from "../../../components/ui/loading/Loading";
import { useBulkImageDelete } from "../../../hooks/useBulkImageDelete";
import { useGallery } from "../../../hooks/useGallery";
import { useGalleryImageOrders } from "../../../hooks/useGalleryImageOrders";
import { useImageSelection } from "../../../hooks/useImageSelection";
import { useInfiniteGalleryImages } from "../../../hooks/useInfiniteGalleryImages";
import { useOriginalImageDelete } from "../../../hooks/useOriginalImageDelete";
import { usePageLogger } from "../../../hooks/usePageLogger";
import { useToast } from "../../../hooks/useToast";
import { removeFileExtension } from "../../../lib/filename-utils";
import { ImageFallbackUrls } from "../../../lib/image-fallback";
import { formatOrderDisplay } from "../../../lib/orderDisplay";
import { queryKeys } from "../../../lib/react-query";
import { storeLogger } from "../../../lib/store-logger";
import { useModalStore } from "../../../store";
import { useUnifiedStore } from "../../../store/unifiedStore";
import type { Gallery, GalleryImage } from "../../../types";

// Lazy load heavy components to reduce bundle size (~200KB+ savings)
// Using wrapper files that export as default for proper dynamic() support
const NextStepsOverlay = dynamic(
  () => import("../../../components/galleries/NextStepsOverlay.lazy"),
  {
    ssr: false,
  }
);

const PublishGalleryWizard = dynamic(
  () => import("../../../components/galleries/PublishGalleryWizard.lazy"),
  {
    ssr: false,
  }
);

const UppyUploadModal = dynamic(() => import("../../../components/uppy/UppyUploadModal.lazy"), {
  ssr: false,
  loading: () => <FullPageLoading text="Ładowanie modułu przesyłania..." />,
});

// Lazy load conditionally rendered dialogs - only shown when modals are open
const ConfirmDialog = dynamic(
  () =>
    import("../../../components/ui/confirm/ConfirmDialog").then((mod) => ({
      default: mod.ConfirmDialog,
    })),
  {
    ssr: false,
  }
);

const BulkDeleteConfirmDialog = dynamic(
  () =>
    import("../../../components/dialogs/BulkDeleteConfirmDialog").then((mod) => ({
      default: mod.BulkDeleteConfirmDialog,
    })),
  {
    ssr: false,
  }
);

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

// Prevent static generation - this page uses client hooks
export const getServerSideProps: GetServerSideProps = () => {
  return Promise.resolve({ props: {} });
};

export default function GalleryPhotos() {
  const router = useRouter();
  const { id: galleryId } = router.query;
  const { showToast } = useToast();
  const { logSkippedLoad } = usePageLogger({
    pageName: "GalleryPhotos",
  });
  const { gallery: galleryRaw, loading: _galleryLoading, reloadGallery } = useGallery();
  const gallery = galleryRaw && typeof galleryRaw === "object" ? galleryRaw : null;
  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
  const galleryIdForQuery =
    galleryIdStr && typeof galleryIdStr === "string" ? galleryIdStr : undefined;

  // State for expanded section must be defined before queries that use it
  const [expandedSection, setExpandedSection] = useState<string | null>(null); // Track expanded section - only one can be expanded at a time (all collapsed by default)

  // Layout state with localStorage persistence
  const [layout, setLayout] = useState<GridLayout>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("dashboard-gallery-layout") as GridLayout;
      if (saved && ["standard", "square", "marble"].includes(saved)) {
        return saved;
      }
    }
    return "square";
  });

  // Save layout preference to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("dashboard-gallery-layout", layout);
    }
  }, [layout]);

  // Reset scroll to top when layout changes
  useEffect(() => {
    const resetScroll = () => {
      // Find all scroll containers with table-scrollbar class
      // These containers have overflow-auto in className, not style
      const scrollContainers = document.querySelectorAll('.table-scrollbar');
      scrollContainers.forEach((container) => {
        if (container instanceof HTMLElement) {
          // Reset the container's scroll
          container.scrollTop = 0;
          // Also check if there's a scrollable parent and reset that too
          let parent = container.parentElement;
          while (parent) {
            const style = window.getComputedStyle(parent);
            if (
              (style.overflow === 'auto' || style.overflowY === 'auto' || 
               style.overflow === 'scroll' || style.overflowY === 'scroll') &&
              parent.scrollHeight > parent.clientHeight
            ) {
              parent.scrollTop = 0;
              break; // Only reset the first scrollable parent
            }
            parent = parent.parentElement;
          }
        }
      });
    };

    // Use double requestAnimationFrame to ensure DOM has fully updated after layout change
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resetScroll();
        // Also try after a small delay as fallback for containers that might render later
        setTimeout(resetScroll, 50);
      });
    });
  }, [layout]);

  const queryClient = useQueryClient();

  // Fetch statistics only (first page with stats, but we don't need all images)
  // This gives us total counts without loading all images
  const { data: statsData, isLoading: statsLoading } = useInfiniteGalleryImages({
    galleryId: galleryIdForQuery,
    type: "thumb",
    limit: 1, // Only need stats, so minimal limit
    options: {
      enabled: !!galleryIdForQuery,
      // Ensure stats query refetches when data might be stale (e.g., after order status changes)
      // This works together with refetchFirstPageOnly to ensure stats are always fresh
      staleTime: 0, // Always consider stats stale so they refetch when invalidated
      // getNextPageParam and initialPageParam are handled by the hook itself
    } as Parameters<typeof useInfiniteGalleryImages>[0]["options"],
  });

  // Get statistics from the first page response
  interface PageWithStats {
    stats?: {
      orderCounts?: Array<{ orderId: string; count: number }>;
      unselectedCount?: number;
    };
    totalCount?: number;
    images?: GalleryImage[];
    hasMore?: boolean;
    nextCursor?: string | null;
  }
  const firstPage = statsData?.pages?.[0] as PageWithStats | undefined;
  const imageStats = firstPage?.stats;
  const totalGalleryImageCount = firstPage?.totalCount ?? 0;

  // Use hook for order/image relationship management - needed to get list of orders
  const {
    orders,
    approvedSelectionKeys,
    allOrderSelectionKeys,
    imageOrderStatus,
    loadApprovedSelections,
  } = useGalleryImageOrders(galleryId);

  // Get delivered orders (DELIVERED, PREPARING_DELIVERY, or CLIENT_APPROVED)
  const deliveredOrders = useMemo(() => {
    return orders.filter(
      (o) =>
        o.deliveryStatus === "DELIVERED" ||
        o.deliveryStatus === "PREPARING_DELIVERY" ||
        o.deliveryStatus === "CLIENT_APPROVED"
    );
  }, [orders]);

  // Helper to get query key for a section
  const getSectionQueryKey = useCallback(
    (sectionId: string | null) => {
      if (!sectionId || !galleryIdForQuery) return null;
      const filterOrderId = sectionId.startsWith("order-")
        ? sectionId.replace("order-", "")
        : undefined;
      const filterUnselected = sectionId === "unselected";
      return queryKeys.galleries.infiniteImages(
        galleryIdForQuery,
        "thumb",
        50,
        filterOrderId,
        filterUnselected
      );
    },
    [galleryIdForQuery]
  );

  // Get cached data for the expanded section (if available) to avoid refetching
  // This ensures we use cached data immediately when expanding, avoiding network calls
  const cachedDataForExpandedSection = useMemo(() => {
    if (!expandedSection || !galleryIdForQuery) return null;
    const queryKey = getSectionQueryKey(expandedSection);
    if (!queryKey) return null;
    // Get the cached query state to check if data exists and is fresh
    const queryState = queryClient.getQueryState(queryKey);
    if (queryState?.data) {
      return queryState.data;
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedSection, galleryIdForQuery, getSectionQueryKey]);

  // When there are no delivered orders, show all images directly (no section expansion needed)
  // Otherwise, show images for the currently expanded section
  const hasNoOrders = deliveredOrders.length === 0;
  const shouldShowAllImages = hasNoOrders && totalGalleryImageCount > 0;

  // Create query for the currently expanded section (or all images if no orders)
  // React Query automatically caches each section separately based on unique query keys
  // (query key includes filterOrderId/filterUnselected parameters)
  // When user switches sections, previous query data is automatically cached by React Query
  // Each section gets its own cache entry that persists even when the query is disabled
  const currentSectionQuery = useInfiniteGalleryImages({
    galleryId: galleryIdForQuery,
    type: "thumb",
    limit: 50,
    filterOrderId: shouldShowAllImages
      ? undefined
      : expandedSection?.startsWith("order-")
        ? expandedSection.replace("order-", "")
        : undefined,
    filterUnselected: shouldShowAllImages ? false : expandedSection === "unselected",
    options: {
      enabled: !!galleryIdForQuery && (shouldShowAllImages || !!expandedSection), // Fetch when no orders (show all) or when section is expanded
      // React Query automatically caches queries by unique query keys
      // staleTime: data is considered fresh for this duration, no refetch will occur
      // With high staleTime, React Query won't refetch when re-enabling if data exists and is fresh
      staleTime: Infinity, // Never consider data stale - use cached data indefinitely unless manually invalidated
      // gcTime: how long inactive queries stay in cache (garbage collection time)
      gcTime: 60 * 60 * 1000, // 60 minutes - keep cached sections available very long
      // Refetch on mount when query re-enables (e.g., when expanding a section)
      // This ensures the query fetches even if cached data exists, fixing the first-click issue
      refetchOnMount: "always", // Always refetch when query enables, even with cached data
      // Don't refetch on window focus
      refetchOnWindowFocus: false,
      // Don't refetch on reconnect
      refetchOnReconnect: false,
      // Use placeholderData function to keep cached data when query re-enables
      // DO NOT use previousData - it may be from a different section (different query key)
      // Only use cachedDataForExpandedSection which is validated to match the current expandedSection
      // This ensures we don't show wrong section's data when switching sections
      // Return undefined if no cached data to prevent showing stale data from previous section
      placeholderData: () => {
        // Only use cached data that matches the current expanded section
        // This prevents showing unselected images when expanding an order section (and vice versa)
        return (cachedDataForExpandedSection as typeof imagesData) ?? undefined;
      },
      // getNextPageParam and initialPageParam are handled by the hook itself
    } as unknown as Parameters<typeof useInfiniteGalleryImages>[0]["options"],
  });

  // Extract data from current section query
  // Use cached data immediately if available, otherwise use query data
  const {
    data: imagesData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: imagesLoading,
    isFetching: imagesFetching,
    error: imagesError,
    refetch: refetchGalleryImages,
  } = currentSectionQuery;

  // Aggressive prefetching for smooth infinite scrolling (like gallery app)
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || !imagesData?.pages.length) return;

    const handleScroll = () => {
      // Try to find the scroll container used by DashboardVirtuosoGrid
      // It's typically a div with overflow-auto or overflow-y-auto
      const scrollContainers = document.querySelectorAll('[style*="overflow"]');
      let scrollContainer: HTMLElement | Window = window;
      let scrollTop = 0;
      let scrollHeight = 0;
      let clientHeight = 0;

      // Find the first scrollable container that has scroll content
      for (const container of Array.from(scrollContainers)) {
        const el = container as HTMLElement;
        if (el.scrollHeight > el.clientHeight) {
          scrollContainer = el;
          scrollTop = el.scrollTop;
          scrollHeight = el.scrollHeight;
          clientHeight = el.clientHeight;
          break;
        }
      }

      // Fallback to window if no scrollable container found
      if (scrollContainer === window) {
        scrollTop = window.scrollY || document.documentElement.scrollTop;
        scrollHeight = document.documentElement.scrollHeight;
        clientHeight = window.innerHeight;
      }

      const scrollPercentage = scrollHeight > 0 ? (scrollTop + clientHeight) / scrollHeight : 0;

      // More aggressive prefetching - trigger at 20% scroll for smoother infinite scrolling
      if (scrollPercentage > 0.2 && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    };

    // Throttle scroll events
    let timeoutId: NodeJS.Timeout;
    const throttledHandleScroll = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(handleScroll, 200);
    };

    // Listen to scroll on both window and scrollable containers
    window.addEventListener('scroll', throttledHandleScroll, { passive: true });
    
    // Also listen to scroll on scrollable containers
    const scrollContainers = document.querySelectorAll('[style*="overflow"]');
    scrollContainers.forEach((container) => {
      container.addEventListener('scroll', throttledHandleScroll, { passive: true });
    });
    
    // Also check initial scroll position
    handleScroll();

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('scroll', throttledHandleScroll);
      scrollContainers.forEach((container) => {
        container.removeEventListener('scroll', throttledHandleScroll);
      });
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, imagesData?.pages.length]);

  // Prefer query data first, then fall back to cached data for current section
  // Only use cached data if it exists and matches the current expanded section
  // This prevents showing wrong section's data when switching sections
  const effectiveImagesData: typeof imagesData =
    imagesData ??
    (cachedDataForExpandedSection
      ? (cachedDataForExpandedSection as unknown as typeof imagesData)
      : undefined);
  // Track loaded galleryId for stable comparison (prevents re-renders from object reference changes)
  const loadedGalleryIdRef = useRef<string>("");
  // Track if we've logged that gallery is ready (prevents repeated logs on re-renders)
  const hasLoggedGalleryReadyRef = useRef<string>("");
  // Track if we've already processed the upload query parameter
  const hasProcessedUploadParamRef = useRef<boolean>(false);
  // Track if we've already processed payment success to prevent infinite loops
  const hasProcessedPaymentSuccessRef = useRef<string>("");
  // Track if polling is active to prevent multiple polling instances
  const isPollingRef = useRef<boolean>(false);
  // Track polling timeout ID for cleanup
  const pollTimeoutIdRef = useRef<NodeJS.Timeout | null>(null);

  // Get order delivery status for an image (defined early to avoid use-before-define)
  const getImageOrderStatus = useCallback(
    (image: GalleryImage): string | null => {
      const imageKey = image.key ?? image.filename;
      return imageKey ? (imageOrderStatus.get(imageKey) ?? null) : null;
    },
    [imageOrderStatus]
  );

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [imageToDelete, setImageToDelete] = useState<GalleryImage | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
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

  // Get modal state from Zustand
  const zustandModalOpen = useModalStore((state) => state.modals["photos-upload-modal"] || false);
  const openModal = useModalStore((state) => state.openModal);
  const closeModal = useModalStore((state) => state.closeModal);

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
          // Use Zustand to open modal (consistent with other opens)
          openModal("photos-upload-modal");
        }
      } catch {
        // Ignore invalid entries
      }
    }
  }, [galleryId, openModal]);

  // Sync local modal state with Zustand state (primary source of truth for internal actions)
  // Zustand is the source of truth, so always sync from Zustand to local
  useEffect(() => {
    if (zustandModalOpen !== uploadModalOpen) {
      setUploadModalOpen(zustandModalOpen);
    }
  }, [zustandModalOpen, uploadModalOpen]);

  // Check for upload query parameter and auto-open modal (fallback for external navigation/sharing)
  useEffect(() => {
    if (!router.isReady || typeof window === "undefined" || hasProcessedUploadParamRef.current) {
      return;
    }

    // Check both router.query and URL params for the upload parameter
    const shouldOpenUpload =
      router.query.upload === "true" ||
      new URLSearchParams(window.location.search).get("upload") === "true";

    if (shouldOpenUpload) {
      hasProcessedUploadParamRef.current = true;
      // Use Zustand to open modal (works even if already on page)
      const openModal = useUnifiedStore.getState().openModal;
      openModal("photos-upload-modal");

      // Clear the query parameter from URL after reading it
      setTimeout(() => {
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete("upload");
        window.history.replaceState({}, "", newUrl.toString());
      }, 0);
    }
  }, [router.isReady, router.query.upload]);

  // Reset the processed flag when galleryId changes (for navigation between galleries)
  useEffect(() => {
    hasProcessedUploadParamRef.current = false;
    hasProcessedPaymentSuccessRef.current = "";
    isPollingRef.current = false;
    if (pollTimeoutIdRef.current) {
      clearTimeout(pollTimeoutIdRef.current);
      pollTimeoutIdRef.current = null;
    }
  }, [galleryId]);

  // Handle payment redirects for limit exceeded flow (including wallet top-up)
  useEffect(() => {
    if (typeof window === "undefined" || !galleryId || !router.isReady) {
      return undefined;
    }

    const params = new URLSearchParams(window.location.search);
    const paymentSuccess = params.get("payment") === "success";
    const limitExceededParam = params.get("limitExceeded") === "true";
    const planKeyParam = params.get("planKey");
    const galleryIdParam = params.get("galleryId");

    // Check if this is a wallet top-up redirect (has galleryId param but not a direct gallery payment)
    const isWalletTopUpRedirect =
      paymentSuccess &&
      limitExceededParam &&
      galleryIdParam === galleryId &&
      !params.get("gallery"); // Not a direct gallery payment

    // Handle wallet top-up redirect: reopen wizard with preserved state (no polling needed)
    if (isWalletTopUpRedirect && planKeyParam) {
      // Create a unique key for this payment success to prevent re-processing
      const paymentSuccessKey = `${galleryId}-wallet-topup-${planKeyParam}`;

      // Check if we've already processed this payment success
      if (hasProcessedPaymentSuccessRef.current === paymentSuccessKey) {
        return undefined;
      }

      // Mark as processed immediately to prevent re-running
      hasProcessedPaymentSuccessRef.current = paymentSuccessKey;

      // Restore limitExceededData from URL params if available
      const uploadedSizeBytesParam = params.get("uploadedSizeBytes");
      const originalsLimitBytesParam = params.get("originalsLimitBytes");
      const excessBytesParam = params.get("excessBytes");
      const isSelectionGalleryParam = params.get("isSelectionGallery");

      if (uploadedSizeBytesParam && originalsLimitBytesParam && excessBytesParam) {
        setLimitExceededData({
          uploadedSizeBytes: parseInt(uploadedSizeBytesParam, 10),
          originalsLimitBytes: parseInt(originalsLimitBytesParam, 10),
          excessBytes: parseInt(excessBytesParam, 10),
          isSelectionGallery: isSelectionGalleryParam === "true",
        });
      }

      // Clean URL params but preserve limitExceeded, duration, and planKey for wizard
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("payment");
      newUrl.searchParams.delete("galleryId");
      // Clean up limitExceededData params after restoring them
      newUrl.searchParams.delete("uploadedSizeBytes");
      newUrl.searchParams.delete("originalsLimitBytes");
      newUrl.searchParams.delete("excessBytes");
      newUrl.searchParams.delete("isSelectionGallery");
      // Keep limitExceeded, duration, and planKey so wizard can restore state
      window.history.replaceState({}, "", newUrl.toString());

      // Reload gallery to ensure we have fresh data
      void reloadGallery();

      // Reopen wizard with preserved state - user can continue with upgrade
      setLimitExceededWizardOpen(true);
      return undefined;
    }

    // Handle direct payment success (Stripe payment for upgrade)
    if (paymentSuccess && limitExceededParam && planKeyParam && !isWalletTopUpRedirect) {
      // Create a unique key for this payment success to prevent re-processing
      const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
      const paymentSuccessKey = `${galleryIdStr}-direct-payment-${planKeyParam}`;

      // Check if we've already processed this payment success or if polling is already active
      if (hasProcessedPaymentSuccessRef.current === paymentSuccessKey || isPollingRef.current) {
        return undefined;
      }

      // Mark as processed immediately to prevent re-running
      hasProcessedPaymentSuccessRef.current = paymentSuccessKey;
      isPollingRef.current = true;

      // Clean URL params immediately to prevent effect from re-running
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("payment");
      newUrl.searchParams.delete("limitExceeded");
      newUrl.searchParams.delete("duration");
      newUrl.searchParams.delete("planKey");
      window.history.replaceState({}, "", newUrl.toString());

      // Poll for gallery plan update
      let pollAttempts = 0;
      const maxPollAttempts = 30; // Poll for up to 30 seconds
      const pollInterval = 1000; // 1 second

      const poll = async (): Promise<void> => {
        // Check if polling should stop (component unmounted or effect re-run)
        if (!isPollingRef.current) {
          return;
        }

        try {
          // Reload gallery once and check the result
          await reloadGallery();

          // Get the updated gallery from the hook (React Query will have updated it)
          const currentGallery = galleryRaw && typeof galleryRaw === "object" ? galleryRaw : null;

          if (currentGallery?.plan && planKeyParam && currentGallery.plan === planKeyParam) {
            // Plan updated successfully - stop polling and show success modal
            isPollingRef.current = false;
            if (pollTimeoutIdRef.current) {
              clearTimeout(pollTimeoutIdRef.current);
              pollTimeoutIdRef.current = null;
            }
            setShowUpgradeSuccessModal(true);
            setLimitExceededWizardOpen(false);
            setLimitExceededData(null);
            return;
          }

          pollAttempts++;
          if (pollAttempts >= maxPollAttempts) {
            // Stop polling after max attempts
            isPollingRef.current = false;
            if (pollTimeoutIdRef.current) {
              clearTimeout(pollTimeoutIdRef.current);
              pollTimeoutIdRef.current = null;
            }
            return;
          } else {
            // Schedule next poll
            pollTimeoutIdRef.current = setTimeout(() => {
              void poll();
            }, pollInterval);
          }
        } catch (_error) {
          // Stop polling on error
          isPollingRef.current = false;
          if (pollTimeoutIdRef.current) {
            clearTimeout(pollTimeoutIdRef.current);
            pollTimeoutIdRef.current = null;
          }
        }
      };

      // Start polling
      void poll();

      // Return cleanup function to stop polling if effect re-runs
      return () => {
        isPollingRef.current = false;
        if (pollTimeoutIdRef.current) {
          clearTimeout(pollTimeoutIdRef.current);
          pollTimeoutIdRef.current = null;
        }
      };
    }

    // No payment success params found - return undefined
    return undefined;
  }, [galleryId, router.isReady, reloadGallery, galleryRaw]);

  // Handle modal close - clear recovery flag if modal was auto-opened from recovery
  const handleUploadModalClose = useCallback(() => {
    setUploadModalOpen(false);
    // Also close the Zustand modal
    closeModal("photos-upload-modal");

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
  }, [galleryId, closeModal]);

  // Use hook for deletion logic
  const {
    deleteImage,
    handleDeleteImageClick,
    deletingImages,
    deletedImageKeys,
    clearDeletedKeysForImages,
  } = useOriginalImageDelete({
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
    storageKey: `image_selection_${galleryIdStr ?? "default"}`,
  });

  // Wrapper to prevent selection of approved images or images in DELIVERED orders
  const handleSelectionClick = useCallback(
    (imageKey: string, index: number, event: MouseEvent, imagesToRender: GalleryImage[]) => {
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
    [approvedSelectionKeys, handleSelectionClickBase, getImageOrderStatus]
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
    clearDeletedKeysForImages: clearDeletedKeysForImagesBulk,
  } = useBulkImageDelete({
    galleryId,
    imageType: "originals",
  });

  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [deleteAllUnselectedOpen, setDeleteAllUnselectedOpen] = useState(false);
  const [unselectedImagesToDelete, setUnselectedImagesToDelete] = useState<string[]>([]);

  // Restore limitExceededData when wizard should be open but data is missing
  // This handles the case when returning from wallet top-up
  useEffect(() => {
    if (limitExceededWizardOpen && !limitExceededData && gallery) {
      // Restore limitExceededData from gallery data
      if (gallery.originalsBytesUsed !== undefined && gallery.originalsLimitBytes !== undefined) {
        const uploadedSizeBytes = gallery.originalsBytesUsed;
        const originalsLimitBytes = gallery.originalsLimitBytes;
        const excessBytes = Math.max(0, uploadedSizeBytes - originalsLimitBytes);

        setLimitExceededData({
          uploadedSizeBytes,
          originalsLimitBytes,
          excessBytes,
          isSelectionGallery: gallery.selectionEnabled !== false,
        });
      }
    }
  }, [limitExceededWizardOpen, limitExceededData, gallery]);

  // Reload gallery after upload (simple refetch)
  const reloadGalleryAfterUpload = useCallback(async () => {
    if (!galleryIdForQuery) {
      logSkippedLoad("reloadGalleryAfterUpload", "No galleryId provided", {});
      return;
    }

    // Refetch fresh images from React Query - it handles cache updates automatically
    await refetchGalleryImages();

    // When there are no orders, images are shown directly (no section expansion needed)
    // When there are orders, auto-expand "unselected" section if no section is currently expanded
    // This ensures newly uploaded images are visible immediately
    if (deliveredOrders.length > 0 && !expandedSection) {
      setExpandedSection("unselected");
    }
  }, [galleryIdForQuery, refetchGalleryImages, logSkippedLoad, expandedSection, deliveredOrders]);

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
  // Use effectiveImagesData which includes cached data to avoid clearing images when collapsing
  // CRITICAL: We still check expandedSection to only show images for the expanded section,
  // but React Query cache ensures data is available instantly when re-expanding
  // When there are no orders, show all images directly (no section expansion needed)
  const images = useMemo(() => {
    // Return images if: (1) no orders and images exist, OR (2) section is expanded
    // When there are no orders, we show all images directly without needing section expansion
    if (!effectiveImagesData?.pages) {
      return [];
    }
    const shouldShowImages = shouldShowAllImages || !!expandedSection;
    if (!shouldShowImages) {
      return [];
    }
    // Flatten all pages into a single array
    interface PageData {
      images?: ApiImage[];
    }
    const pages = effectiveImagesData.pages as PageData[];
    const allApiImages = pages.flatMap((page) => page.images ?? []);
    const apiImages: ApiImage[] = allApiImages;
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
  }, [
    effectiveImagesData,
    deletedImageKeys,
    deletedImageKeysBulk,
    expandedSection,
    shouldShowAllImages,
  ]);

  // Clear deletedImageKeys for images that have been re-uploaded
  // When images appear in the query data, they're no longer deleted, so remove them from deletedImageKeys
  useEffect(() => {
    if (!effectiveImagesData?.pages || effectiveImagesData.pages.length === 0) {
      return;
    }

    interface PageData {
      images?: ApiImage[];
    }
    const pages = effectiveImagesData.pages as PageData[];
    const allApiImages = pages.flatMap((page) => page.images ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const currentImageKeys = new Set(
      allApiImages.map((img: ApiImage) => img.key ?? img.filename).filter(Boolean)
    );

    // Find keys that are in deletedImageKeys but now present in the data (re-uploaded)
    const reuploadedKeys = Array.from(deletedImageKeys).filter((key) => currentImageKeys.has(key));
    const reuploadedKeysBulk = Array.from(deletedImageKeysBulk).filter((key) =>
      currentImageKeys.has(key)
    );

    if (reuploadedKeys.length > 0) {
      clearDeletedKeysForImages(reuploadedKeys);
    }
    if (reuploadedKeysBulk.length > 0) {
      clearDeletedKeysForImagesBulk(reuploadedKeysBulk);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    effectiveImagesData,
    deletedImageKeys,
    deletedImageKeysBulk,
    clearDeletedKeysForImages,
    clearDeletedKeysForImagesBulk,
  ]);

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
  }, [
    isSelectionMode,
    approvedSelectionKeys,
    selectedKeys,
    images,
    handleSelectionClickBase,
    getImageOrderStatus,
  ]);

  const handleDeletePhotoClick = useCallback(
    (image: GalleryImage): void => {
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
    },
    [approvedSelectionKeys, getImageOrderStatus, showToast, handleDeleteImageClick]
  );

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
  }, [
    isSelectionMode,
    selectedKeys,
    images,
    selectAll,
    toggleSelectionMode,
    handleBulkDeleteClick,
  ]);

  // Calculate effective gallery and gallery ID before early returns
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
    if (isGalleryLoaded && galleryIdStr && hasLoggedGalleryReadyRef.current !== galleryIdStr) {
      hasLoggedGalleryReadyRef.current = galleryIdStr;
      storeLogger.log("GalleryPhotos", "Gallery ready - rendering content", {
        galleryId: galleryIdStr,
        effectiveGalleryId,
      });
    }
  }, [isGalleryLoaded, galleryIdStr, effectiveGalleryId]);

  // Clear gallery creation flow when photos page is fully ready
  const galleryCreationFlowActive = useUnifiedStore((state) => state.galleryCreationFlowActive);
  const galleryCreationTargetId = useUnifiedStore((state) => state.galleryCreationTargetId);
  const setGalleryCreationFlowActive = useUnifiedStore(
    (state) => state.setGalleryCreationFlowActive
  );

  useEffect(() => {
    // Only clear if flow is active and we're on the target gallery
    if (!galleryCreationFlowActive || !galleryIdStr || galleryCreationTargetId !== galleryIdStr) {
      return;
    }

    // Check if page is fully ready:
    // - Gallery is loaded
    // - Images are loaded (not loading)
    // - Router is ready
    const isPageReady = isGalleryLoaded && !imagesLoading && router.isReady;

    if (isPageReady) {
      // Clear the flow - overlay will disappear
      setGalleryCreationFlowActive(false);
    }
  }, [
    galleryCreationFlowActive,
    galleryCreationTargetId,
    galleryIdStr,
    isGalleryLoaded,
    imagesLoading,
    router.isReady,
    setGalleryCreationFlowActive,
  ]);

  // Clear flow if user navigates away from target gallery
  useEffect(() => {
    if (
      galleryCreationFlowActive &&
      galleryCreationTargetId &&
      galleryIdStr &&
      galleryCreationTargetId !== galleryIdStr
    ) {
      // User navigated to a different gallery - clear the flow
      setGalleryCreationFlowActive(false);
    }
  }, [
    galleryCreationFlowActive,
    galleryCreationTargetId,
    galleryIdStr,
    setGalleryCreationFlowActive,
  ]);

  // Clear flow on unmount if it's still active (safety cleanup)
  useEffect(() => {
    return () => {
      if (galleryCreationFlowActive && galleryCreationTargetId === galleryIdStr) {
        setGalleryCreationFlowActive(false);
      }
    };
  }, [
    galleryCreationFlowActive,
    galleryCreationTargetId,
    galleryIdStr,
    setGalleryCreationFlowActive,
  ]);

  // Helper functions (must be defined before early returns)
  const isImageInApprovedSelection = useCallback(
    (image: GalleryImage): boolean => {
      const imageKey = image.key ?? image.filename;
      return imageKey ? approvedSelectionKeys.has(imageKey) : false;
    },
    [approvedSelectionKeys]
  );

  const isImageInAnyOrder = useCallback(
    (image: GalleryImage): boolean => {
      const imageKey = image.key ?? image.filename;
      return imageKey ? allOrderSelectionKeys.has(imageKey) : false;
    },
    [allOrderSelectionKeys]
  );

  // Helper to get selectable images (excluding approved and delivered)
  const getSelectableImages = useCallback(
    (imagesToFilter: GalleryImage[]): GalleryImage[] => {
      return imagesToFilter.filter((img) => {
        const imageKey = img.key ?? img.filename;
        if (!imageKey) {
          return false;
        }
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

  // Toggle section expansion - only one section can be expanded at a time
  // React Query automatically caches each section's data based on unique query keys
  // When switching sections, previously loaded images remain in cache
  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSection((prev) => {
      // If clicking the same section, collapse it
      if (prev === sectionId) {
        return null;
      }
      // Otherwise, expand the new section (collapses any previously expanded section)
      // React Query will use cached data if available, or fetch if not
      return sectionId;
    });
  }, []);

  // Render single image item (extracted for reuse)
  const renderImageItem = useCallback(
    (img: GalleryImage, index: number, allImages: GalleryImage[], itemLayout?: GridLayout) => {
      const currentLayout = itemLayout ?? layout;
      // Combine deleting states from both single and bulk delete
      const allDeletingImages = new Set([...deletingImages, ...deletingImagesBulk]);

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
          className={`relative group rounded-lg overflow-hidden transition-all ${
            isSelectionMode ? "select-none" : ""
          } ${
            isDeleting
              ? "opacity-60"
              : isSelected && isSelectionMode
                ? "ring-2 ring-brand-200 dark:ring-photographer-accent/30"
                : ""
          } ${isNonDeletable && isSelectionMode ? "cursor-not-allowed" : ""} ${
            currentLayout === "square"
              ? "bg-gray-100 dark:bg-gray-800"
              : currentLayout === "marble"
                ? "bg-white dark:bg-gray-800"
                : "bg-white dark:bg-gray-800"
          }`}
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
              handleSelectionClick(imageKey, index, e.nativeEvent, allImages);
            } else if (isSelectionMode && isNonDeletable) {
              e.stopPropagation();
            }
          }}
        >
          <div
            className={`relative ${
              currentLayout === "square"
                ? "aspect-square"
                : currentLayout === "marble"
                  ? "w-full h-full"
                  : "aspect-[4/3]"
            }`}
          >
            {/* Selection checkbox overlay */}
            {isSelectionMode && (
              <div className="absolute top-2 left-2 z-30 group/checkbox">
                <div
                  className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${
                    isNonDeletable
                      ? "bg-gray-300 border-gray-400 dark:bg-gray-700 dark:border-gray-600 cursor-not-allowed opacity-60"
                      : isSelected
                        ? "bg-photographer-accent border-photographer-accent dark:bg-photographer-accent dark:border-photographer-accent"
                        : "bg-white/90 border-photographer-border dark:bg-gray-800/90 dark:border-gray-600"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isNonDeletable) {
                      handleSelectionClick(imageKey, index, e.nativeEvent, allImages);
                    }
                  }}
                >
                  {isSelected && !isNonDeletable && (
                    <Check className="w-4 h-4 text-white" strokeWidth={3} />
                  )}
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
              <div className="w-full h-full bg-photographer-elevated dark:bg-gray-800 flex items-center justify-center rounded-lg">
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
                  className={`w-full h-full ${
                    currentLayout === "square"
                      ? "object-cover rounded-lg"
                      : currentLayout === "marble"
                        ? "object-cover rounded-[2px]"
                        : "object-contain"
                  } ${isNonDeletable && isSelectionMode ? "opacity-60" : ""}`}
                  preferredSize={currentLayout === "marble" ? "bigthumb" : "thumb"}
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
                      PREPARING_DELIVERY: { color: "info", label: "Gotowe do wysyłki" },
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
                {!isDeleting && !isSelectionMode && !isDelivered && !isInAnyOrder && (
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity flex flex-col items-center justify-center z-20">
                    {/* Image name tooltip on hover */}
                    <div className="absolute top-2 left-0 right-0 flex justify-center z-30 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="text-white text-base font-bold truncate max-w-full px-2">
                        {removeFileExtension(imageKey)}
                      </div>
                    </div>
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
                  </div>
                )}
                {/* Image name tooltip on hover - show when no delete button overlay */}
                {!isDeleting && (isSelectionMode || isDelivered || isInAnyOrder) && (
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity z-20 pointer-events-none">
                    <div className="absolute top-2 left-0 right-0 flex justify-center z-30 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="text-white text-base font-bold truncate max-w-full px-2">
                        {removeFileExtension(imageKey)}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      );
    },
    [
      deletingImages,
      deletingImagesBulk,
      isImageInApprovedSelection,
      isImageInAnyOrder,
      getImageOrderStatus,
      selectedKeys,
      isSelectionMode,
      handleSelectionClick,
      handleDeletePhotoClick,
      layout,
    ]
  );

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

  // Helper to normalize selectedKeys from order (used for grouping images by order)
  const normalizeOrderSelectedKeys = useCallback(
    (selectedKeys: string[] | string | undefined): string[] => {
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
    },
    []
  );

  // deliveredOrders is already defined above - remove duplicate

  // Use backend statistics if available
  const orderTotalCountsFromStats = useMemo(() => {
    const map = new Map<string, number>();
    if (imageStats?.orderCounts) {
      imageStats.orderCounts.forEach((item) => {
        if (item && typeof item === "object" && "orderId" in item && "count" in item) {
          map.set(String(item.orderId), Number(item.count));
        }
      });
    }
    return map;
  }, [imageStats]);

  // Build order totals map - use stats when available, otherwise fallback to selectedKeys length
  const orderTotalCounts = useMemo(() => {
    const map = new Map<string, number>();
    deliveredOrders.forEach((order) => {
      const orderId = typeof order.orderId === "string" ? order.orderId : undefined;
      if (!orderId) {
        return;
      }
      const orderTotalCount =
        orderTotalCountsFromStats.get(orderId) ??
        normalizeOrderSelectedKeys(order.selectedKeys).length;
      map.set(orderId, orderTotalCount);
    });
    return map;
  }, [deliveredOrders, orderTotalCountsFromStats, normalizeOrderSelectedKeys]);

  // Get images for currently expanded section
  // For order sections, images are already filtered by the backend
  // For unselected section, images are already filtered by the backend
  const sectionImages = images;

  // Get images for the expanded order section (if expanded section is an order)
  const imagesByOrder = useMemo(() => {
    if (!expandedSection?.startsWith("order-")) {
      return new Map<string, GalleryImage[]>();
    }
    const orderId = expandedSection.replace("order-", "");
    return new Map([[orderId, sectionImages]]);
  }, [expandedSection, sectionImages]);

  // Get unselected images (only when unselected section is expanded)
  const unselectedImages = useMemo(() => {
    if (expandedSection !== "unselected") {
      return [];
    }
    return sectionImages;
  }, [expandedSection, sectionImages]);

  // Get unselected count from the filtered query when unselected section is expanded
  // Also check if we have cached data from a previous expansion (more accurate than stats query)
  const unselectedCountFromFilteredQuery = useMemo(() => {
    // Check current section query if expanded
    if (expandedSection === "unselected" && currentSectionQuery.data) {
      const firstPage = currentSectionQuery.data.pages[0];
      if (firstPage?.stats?.unselectedCount !== undefined) {
        return Number(firstPage.stats.unselectedCount);
      }
      // Fallback to actual image count if stats not available
      return sectionImages.length;
    }

    // Also check if we have cached data from a previous expansion of unselected section
    // This ensures we use fresh data even when section is collapsed
    if (galleryIdForQuery) {
      const unselectedQueryKey = queryKeys.galleries.infiniteImages(
        galleryIdForQuery,
        "thumb",
        50,
        undefined,
        true // filterUnselected: true
      );
      const cachedUnselectedData = queryClient.getQueryData(unselectedQueryKey);
      if (
        cachedUnselectedData &&
        typeof cachedUnselectedData === "object" &&
        "pages" in cachedUnselectedData &&
        Array.isArray(cachedUnselectedData.pages) &&
        cachedUnselectedData.pages[0] &&
        typeof cachedUnselectedData.pages[0] === "object" &&
        "stats" in cachedUnselectedData.pages[0]
      ) {
        const firstPage = cachedUnselectedData.pages[0] as { stats?: { unselectedCount?: number } };
        if (firstPage.stats?.unselectedCount !== undefined) {
          return Number(firstPage.stats.unselectedCount);
        }
      }
    }

    return null;
  }, [
    expandedSection,
    currentSectionQuery.data,
    sectionImages.length,
    galleryIdForQuery,
    queryClient,
  ]);

  // Use backend statistics for total unselected count
  // Prefer count from filtered query (more accurate, always fresh)
  // Include statsDataUpdatedAt in calculation to ensure reactivity when query updates
  const totalUnselectedCount = useMemo(() => {
    if (unselectedCountFromFilteredQuery !== null) {
      return unselectedCountFromFilteredQuery;
    }
    if (imageStats && typeof imageStats === "object" && "unselectedCount" in imageStats) {
      return Number(imageStats.unselectedCount) ?? 0;
    }
    return 0;
  }, [unselectedCountFromFilteredQuery, imageStats]);

  // Calculate dynamic scroll container height accounting for all order separators
  // Base offset: header section (title + layout selector) + action buttons + spacing
  const scrollContainerHeight = useMemo(() => {
    if (deliveredOrders.length === 0) {
      // No orders: use fixed calculation (header + action buttons)
      return "calc(100vh - 174px)";
    }

    // Fixed top section: header (title + layout selector) + action buttons + spacing
    const fixedTopOffset = 174; // Base offset for header and action buttons

    // Each order section header is approximately 70-80px (px-5 py-3 with content)
    // Using 75px as average to account for wrapping content
    const orderHeaderHeight = 75;
    const numOrderSections = deliveredOrders.length;

    // Unselected section header (same height as order headers)
    const unselectedHeaderHeight = 75;

    // Spacing between sections: space-y-2 = 8px per gap
    // Total sections = order sections + unselected section
    // Number of gaps = total sections - 1 (space-y-2 adds margin-top to all except first)
    const totalSections = numOrderSections + 1; // orders + unselected
    const spacingBetweenSections = 8;
    const numGaps = totalSections - 1; // One gap before each section except the first

    // Total offset = fixed top + all order headers + unselected header + all spacing
    // Add small buffer (16px) to account for padding and prevent bottom cutoff
    const buffer = 16;
    const totalOffset =
      fixedTopOffset +
      numOrderSections * orderHeaderHeight +
      unselectedHeaderHeight +
      numGaps * spacingBetweenSections +
      buffer;

    return `calc(100vh - ${totalOffset}px)`;
  }, [deliveredOrders.length]);

  // Handler for deleting all unselected images
  const handleDeleteAllUnselectedClick = useCallback(() => {
    if (unselectedImages.length === 0) {
      return;
    }

    // Get all unselected image keys and filter out non-deletable ones
    const imageKeysToDelete = unselectedImages
      .map((img) => img.key ?? img.filename)
      .filter((key): key is string => {
        if (!key) {
          return false;
        }
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

  // Show loading if galleryId is not yet available from router (prevents flash of empty state)
  if (!galleryId) {
    // Return null to let GalleryLayoutWrapper handle the loading overlay
    // This ensures the sidebar is visible during loading
    return null;
  }

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

  return (
    <>
      {/* Next Steps Overlay */}
      <NextStepsOverlay />

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Zdjęcia w galerii
          </h1>
          <div className="flex items-center gap-4">
            <LayoutSelector layout={layout} onLayoutChange={setLayout} />
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {imagesLoading ? (
                <Loading size="sm" />
              ) : (
                <>
                  {totalGalleryImageCount}{" "}
                  {totalGalleryImageCount === 1
                    ? "zdjęcie"
                    : totalGalleryImageCount < 5
                      ? "zdjęcia"
                      : "zdjęć"}
                  {imagesFetching && (
                    <span className="ml-2 text-xs opacity-75">(aktualizacja...)</span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        {/* Action Buttons */}
        <div className="mb-4 flex items-center gap-3 flex-wrap">
          {!isSelectionMode && (
            <>
              <button
                onClick={() => openModal("photos-upload-modal")}
                className="px-4 py-2 bg-photographer-accent hover:bg-photographer-accentHover text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <Plus size={20} />
                Prześlij zdjęcia
              </button>
              {totalGalleryImageCount > 0 && (
                <button
                  onClick={toggleSelectionMode}
                  className="px-4 py-2 rounded-lg transition-colors flex items-center gap-2 bg-photographer-muted text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  <Square size={20} />
                  Wybierz zdjęcia
                </button>
              )}
            </>
          )}
          {isSelectionMode && (
            <>
              <span
                className="px-4 py-2 bg-photographer-elevated dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg flex items-center gap-2 justify-center"
                style={{ width: "165.81px" }}
              >
                <CheckSquare size={20} />
                Tryb wyboru
              </span>
              <button
                onClick={() => {
                  toggleSelectionMode();
                  clearSelection();
                }}
                className="px-4 py-2 rounded-lg transition-colors flex items-center gap-2 bg-photographer-muted text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 justify-center"
                style={{ width: "171.9px" }}
              >
                <X size={20} />
                Anuluj
              </button>
              <div className="flex items-center gap-4 ml-auto">
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
                  // Use section images for selection mode
                  const selectableImages = getSelectableImages(sectionImages);
                  const selectableCount = selectableImages.length;
                  const allSelected = selectableCount > 0 && selectedKeys.size === selectableCount;
                  return (
                    <>
                      <button
                        onClick={() => {
                          if (allSelected) {
                            deselectAll();
                          } else {
                            selectAll(sectionImages);
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
              <button
                onClick={handleBulkDeleteClick}
                disabled={isBulkDeleting || selectedKeys.size === 0}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 size={18} />
                Usuń {selectedKeys.size > 0 && `(${selectedKeys.size})`}
              </button>
            </>
          )}
        </div>

        {/* Images Grid - Grouped by Orders */}
        {statsLoading ? (
          <GalleryLoading text="Ładowanie sekcji zdjęć..." />
        ) : totalGalleryImageCount === 0 ? (
          <EmptyState
            // eslint-disable-next-line jsx-a11y/alt-text
            icon={<Image size={64} aria-hidden="true" />}
            title="Brak zdjęć w galerii"
            description="Prześlij swoje pierwsze zdjęcia, aby rozpocząć. Możesz przesłać wiele zdjęć jednocześnie."
            actionButton={{
              label: "Prześlij zdjęcia",
              onClick: () => openModal("photos-upload-modal"),
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
              const orderTotalCount = orderTotalCounts.get(orderId) ?? 0;

              // Always show order section even if no images loaded yet (for display purposes)
              const sectionId = `order-${orderId}`;
              const isExpanded = expandedSection === sectionId;
              const orderDisplayNumber = formatOrderDisplay(order);

              const handleGoToOrder = (e: React.MouseEvent) => {
                e.stopPropagation();
                if (galleryIdStr && orderId) {
                  useUnifiedStore.getState().setNavigationLoading(true);
                  void router.push(`/galleries/${galleryIdStr}/orders/${orderId}`);
                }
              };

              return (
                <div
                  key={orderId}
                  className="bg-white border border-photographer-border rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700 overflow-hidden"
                >
                  <div
                    onClick={() => toggleSection(sectionId)}
                    className={`w-full px-5 py-3 bg-photographer-elevated dark:bg-gray-900 flex items-center justify-between hover:bg-photographer-muted dark:hover:bg-gray-800 transition-colors cursor-pointer ${
                      isExpanded ? "rounded-t-lg" : "rounded-lg"
                    }`}
                  >
                    <div className="flex-1 text-left flex items-center gap-4 flex-wrap">
                      <div className="text-lg font-semibold text-gray-900 dark:text-white">
                        Zlecenie #{orderDisplayNumber}
                      </div>
                      {order.deliveryStatus && (
                        <DeliveryStatusBadge status={order.deliveryStatus} />
                      )}
                      <div className="text-base text-gray-500 dark:text-gray-400 hidden sm:inline">
                        {order.createdAt && <span>Utworzono: {formatDate(order.createdAt)}</span>}
                        {order.createdAt && order.deliveredAt && <span className="mx-2">•</span>}
                        {order.deliveredAt && (
                          <span>Dostarczono: {formatDate(order.deliveredAt)}</span>
                        )}
                        {!order.createdAt && !order.deliveredAt && (
                          <span className="text-gray-400">Brak dat</span>
                        )}
                      </div>
                      <div className="text-sm text-gray-400 dark:text-gray-500">
                        {orderTotalCount}{" "}
                        {orderTotalCount === 1
                          ? "zdjęcie"
                          : orderTotalCount < 5
                            ? "zdjęcia"
                            : "zdjęć"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={handleGoToOrder}
                        className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1.5 transition-colors"
                      >
                        <span>Przejdź do zlecenia</span>
                        <Link size={16} />
                      </button>
                      <div
                        className="p-1.5 hover:bg-photographer-muted dark:hover:bg-gray-700 rounded transition-colors"
                        aria-label={isExpanded ? "Zwiń sekcję" : "Rozwiń sekcję"}
                      >
                        <ChevronDown
                          size={18}
                          className={`text-gray-600 dark:text-gray-400 transition-transform flex-shrink-0 ${
                            isExpanded ? "transform rotate-180" : ""
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 rounded-b-lg bg-white dark:bg-gray-800">
                      <div
                        className="w-full overflow-auto table-scrollbar"
                        style={{
                          height: scrollContainerHeight,
                          minHeight: "400px",
                          overscrollBehavior: "none",
                        }}
                      >
                        <DashboardVirtuosoGrid
                          images={orderImages}
                          layout={layout}
                          renderImageItem={(img, idx, all) =>
                            renderImageItem(img, idx, all, layout)
                          }
                          hasNextPage={hasNextPage}
                          onLoadMore={fetchNextPage}
                          isFetchingNextPage={isFetchingNextPage}
                          isLoading={imagesLoading}
                          error={imagesError}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Unselected Section - Always show header */}
            <div className="bg-white border border-photographer-border rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700 overflow-hidden">
              <div
                onClick={() => toggleSection("unselected")}
                className={`w-full px-5 py-3 bg-photographer-elevated dark:bg-gray-900 flex items-center justify-between hover:bg-photographer-muted dark:hover:bg-gray-800 transition-colors cursor-pointer ${
                  expandedSection === "unselected" ? "rounded-t-lg" : "rounded-lg"
                }`}
              >
                <div className="flex-1 text-left flex items-center gap-4">
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    Niewybrane
                  </div>
                  <div className="text-sm text-gray-400 dark:text-gray-500">
                    {totalUnselectedCount}{" "}
                    {totalUnselectedCount === 1
                      ? "zdjęcie"
                      : totalUnselectedCount < 5
                        ? "zdjęcia"
                        : "zdjęć"}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {unselectedImages.length > 0 && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAllUnselectedClick();
                        }}
                        disabled={isBulkDeleting}
                        className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 flex items-center gap-1.5 px-3 py-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 size={16} />
                        <span>Usuń Wszystkie Niewybrane Zdjęcia</span>
                      </button>
                    </>
                  )}
                  <div
                    className="p-1.5 hover:bg-photographer-muted dark:hover:bg-gray-700 rounded transition-colors"
                    aria-label={expandedSection === "unselected" ? "Zwiń sekcję" : "Rozwiń sekcję"}
                  >
                    <ChevronDown
                      size={18}
                      className={`text-gray-600 dark:text-gray-400 transition-transform flex-shrink-0 ${
                        expandedSection === "unselected" ? "transform rotate-180" : ""
                      }`}
                    />
                  </div>
                </div>
              </div>
              {expandedSection === "unselected" && (
                <div className="px-4 pb-4 pt-2 rounded-b-lg bg-white dark:bg-gray-800">
                  {(imagesLoading || imagesFetching) && unselectedImages.length === 0 ? (
                    <GalleryLoading text="Ładowanie niewybranych zdjęć..." />
                  ) : unselectedImages.length > 0 ? (
                    <div
                      className="w-full overflow-auto table-scrollbar"
                      style={{
                        height: scrollContainerHeight,
                        minHeight: "400px",
                        overscrollBehavior: "none",
                      }}
                    >
                      <DashboardVirtuosoGrid
                        images={unselectedImages}
                        layout={layout}
                        renderImageItem={(img, idx, all) => renderImageItem(img, idx, all, layout)}
                        hasNextPage={hasNextPage}
                        onLoadMore={fetchNextPage}
                        isFetchingNextPage={isFetchingNextPage}
                        isLoading={imagesLoading}
                        error={imagesError}
                      />
                    </div>
                  ) : (
                    <EmptyState
                      // eslint-disable-next-line jsx-a11y/alt-text
                      icon={<Image size={64} aria-hidden="true" />}
                      title="Brak niewybranych zdjęć"
                      description="Wszystkie zdjęcia w galerii są częścią zleceń."
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        ) : // No delivered orders: show images directly with infinite scroll (no section wrapper)
        totalGalleryImageCount > 0 ? (
          // Render images directly without section wrapper when there are no orders
          (imagesLoading || imagesFetching) && images.length === 0 ? (
            <GalleryLoading text="Ładowanie zdjęć..." />
          ) : images.length > 0 ? (
            <div
              className="w-full overflow-auto table-scrollbar"
              style={{
                height: scrollContainerHeight,
                minHeight: "400px",
                overscrollBehavior: "none",
              }}
            >
              <DashboardVirtuosoGrid
                images={images}
                layout={layout}
                renderImageItem={(img, idx, all) => renderImageItem(img, idx, all, layout)}
                hasNextPage={hasNextPage}
                onLoadMore={fetchNextPage}
                isFetchingNextPage={isFetchingNextPage}
                isLoading={imagesLoading}
                error={imagesError}
              />
            </div>
          ) : (
            <EmptyState
              // eslint-disable-next-line jsx-a11y/alt-text
              icon={<Image size={64} aria-hidden="true" />}
              title="Brak zdjęć w galerii"
              description="Prześlij swoje pierwsze zdjęcia, aby rozpocząć. Możesz przesłać wiele zdjęć jednocześnie."
              actionButton={{
                label: "Prześlij zdjęcia",
                onClick: () => openModal("photos-upload-modal"),
                icon: <Upload size={18} />,
              }}
            />
          )
        ) : (
          // Fallback: show empty state if no delivered orders and no images
          <EmptyState
            // eslint-disable-next-line jsx-a11y/alt-text
            icon={<Image size={64} aria-hidden="true" />}
            title="Brak zdjęć w galerii"
            description="Prześlij swoje pierwsze zdjęcia, aby rozpocząć. Możesz przesłać wiele zdjęć jednocześnie."
            actionButton={{
              label: "Prześlij zdjęcia",
              onClick: () => openModal("photos-upload-modal"),
              icon: <Upload size={18} />,
            }}
          />
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
              setLimitExceededWizardOpen(true);
              // Close the upload modal when limit is exceeded
              handleUploadModalClose();
            },
            onUploadComplete: () => {
              setUploadModalOpen(false);
            },
            reloadGallery: reloadGalleryAfterUpload,
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

      {/* Limit Exceeded Wizard */}
      {galleryId && limitExceededData && (
        <PublishGalleryWizard
          isOpen={limitExceededWizardOpen}
          onClose={() => {
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
                  duration:
                    new URLSearchParams(window.location.search).get("duration") ?? undefined,
                  planKey: new URLSearchParams(window.location.search).get("planKey") ?? undefined,
                }
              : null
          }
          onUpgradeSuccess={async () => {
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
          openModal("photos-upload-modal");
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
      />
    </>
  );
}
