import { Check, ChevronRight, ChevronLeft } from "lucide-react";
import { useRouter } from "next/router";
import React, { useEffect, useLayoutEffect, useState, useCallback, useRef, useMemo } from "react";

import { useUpdateBusinessInfo } from "../../hooks/mutations/useAuthMutations";
import {
  useSendGalleryToClient,
  useUpdateGallery,
} from "../../hooks/mutations/useGalleryMutations";
import { useBusinessInfo } from "../../hooks/queries/useAuth";
import { useGallery } from "../../hooks/queries/useGalleries";
import { useOrder, useOrders, useOrderFinalImages } from "../../hooks/queries/useOrders";
import { useBottomRightOverlay } from "../../hooks/useBottomRightOverlay";
import { useGalleryCreationLoading } from "../../hooks/useGalleryCreationLoading";
import { usePublishFlow } from "../../hooks/usePublishFlow";
import { useToast } from "../../hooks/useToast";
import { useModalStore, useOverlayStore } from "../../store";
import { useGalleryType } from "../hocs/withGalleryType";
import { Tooltip } from "../ui/tooltip/Tooltip";

type NextStepsOverlayProps = Record<string, never>;

interface Step {
  id: string;
  label: string;
  completed: boolean | null; // null means step doesn't apply (e.g., send step for non-selection galleries)
}

export const NextStepsOverlay: React.FC<NextStepsOverlayProps> = () => {
  const router = useRouter();
  const { id: galleryId, orderId } = router.query;
  const { data: businessInfo } = useBusinessInfo();
  const updateGalleryMutation = useUpdateGallery();
  const updateBusinessInfoMutation = useUpdateBusinessInfo();
  const { showToast } = useToast();
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const overlayContext = useBottomRightOverlay();
  // Extract functions directly to avoid dependency issues
  const { setNextStepsVisible: setOverlayVisible, setNextStepsExpanded: setOverlayExpanded } =
    overlayContext;
  // Read current overlay state immediately to prevent flash
  const currentOverlayVisible = overlayContext.nextStepsVisible;
  const nextStepsOverlayExpanded = useOverlayStore((state) => state.nextStepsOverlayExpanded);
  const setNextStepsOverlayExpanded = useOverlayStore((state) => state.setNextStepsOverlayExpanded);

  // Get gallery and order IDs from router
  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
  const galleryIdForQuery =
    galleryIdStr && typeof galleryIdStr === "string" ? galleryIdStr : undefined;
  const orderIdStr = Array.isArray(orderId) ? orderId[0] : orderId;
  const orderIdForQuery = orderIdStr && typeof orderIdStr === "string" ? orderIdStr : undefined;

  // Get all data directly from React Query stores
  const { data: gallery, isLoading: galleryLoading } = useGallery(galleryIdForQuery);
  const { data: galleryOrders = [] } = useOrders(galleryIdForQuery);
  const { data: order } = useOrder(galleryIdForQuery, orderIdForQuery);
  const galleryCreationLoading = useGalleryCreationLoading();
  const { isNonSelectionGallery } = useGalleryType();
  const sendGalleryLinkToClientMutation = useSendGalleryToClient();

  // For non-selective galleries, if no orderId in URL, use first order from galleryOrders
  // This ensures we can check final images even when viewing the gallery page (not order page)
  const effectiveOrderIdForFinalImages = useMemo(() => {
    if (orderIdForQuery) {
      return orderIdForQuery;
    }
    // For non-selective galleries, use first order if available
    if (gallery?.selectionEnabled === false && galleryOrders.length > 0) {
      return galleryOrders[0]?.orderId;
    }
    return undefined;
  }, [orderIdForQuery, gallery?.selectionEnabled, galleryOrders]);

  const { data: finalImages = [] } = useOrderFinalImages(
    galleryIdForQuery,
    effectiveOrderIdForFinalImages
  );
  const finalImagesCount = finalImages.length;

  // Check if publish wizard should be open based on URL params
  const publishWizardOpen = useMemo(() => {
    if (!gallery?.galleryId) {
      return false;
    }
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    return params.get("publish") === "true" && params.get("galleryId") === gallery.galleryId;
  }, [gallery?.galleryId]);

  const [tutorialDisabled, setTutorialDisabled] = useState<boolean | null>(null);
  const [isSavingPreference, setIsSavingPreference] = useState(false);
  const [optimisticBytesUsed, setOptimisticBytesUsed] = useState<number | null>(null);
  const [widthReached13rem, setWidthReached13rem] = useState(false);
  const galleryRef = useRef(gallery);
  const isUpdatingCompletionRef = useRef(false); // Track if we're already updating completion status
  const hasInitializedVisibilityRef = useRef(false); // Track if we've initialized visibility on mount

  // Keep ref in sync with gallery prop
  useEffect(() => {
    galleryRef.current = gallery;
  }, [gallery]);

  // Check if we should hide the overlay (settings or publish view)
  // Priority: Store state > URL params (store state is the source of truth)
  const shouldHide = useMemo(() => {
    const isSettingsPage = router.pathname?.includes("/settings");

    // Store state is the primary source of truth - if wizard is closed in store, ignore URL params
    if (isSettingsPage || publishWizardOpen) {
      return Boolean(isSettingsPage || publishWizardOpen);
    }

    // Only check URL params if wizard is not open in store (fallback for initial page load)
    const routerHasPublish =
      router.query.publish === "true" && router.query.galleryId === gallery?.galleryId;

    // Also check actual URL for immediate updates
    let actualUrlHasPublish = false;
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      actualUrlHasPublish =
        params.get("publish") === "true" && params.get("galleryId") === gallery?.galleryId;
    }

    const hasPublishParamInUrl = routerHasPublish || actualUrlHasPublish;
    return Boolean(isSettingsPage || hasPublishParamInUrl);
  }, [
    router.pathname,
    router.query.publish,
    router.query.galleryId,
    gallery?.galleryId,
    publishWizardOpen,
  ]);

  // Load tutorial preference - deferred until overlay is expanded or user interacts
  const loadTutorialPreference = useCallback(() => {
    // Check if we already have the preference cached
    if (tutorialDisabled !== null) {
      return; // Already loaded
    }

    try {
      const disabled =
        businessInfo?.tutorialNextStepsDisabled === true ||
        businessInfo?.tutorialClientSendDisabled === true;
      setTutorialDisabled(disabled ?? false);
    } catch (error) {
      console.error("Failed to load tutorial preference:", error);
      // Default to showing if we can't load preference
      setTutorialDisabled(false);
    }
  }, [tutorialDisabled, businessInfo]);

  // Load preference when overlay is expanded (user shows interest)
  useEffect(() => {
    if (nextStepsOverlayExpanded && tutorialDisabled === null) {
      loadTutorialPreference();
    }
  }, [nextStepsOverlayExpanded, tutorialDisabled, loadTutorialPreference]);

  // Calculate steps using useMemo to prevent excessive re-renders
  // Use optimistic bytes if available for immediate updates
  const steps = useMemo((): Step[] => {
    if (!gallery || galleryLoading) {
      return [];
    }

    // Use optimistic bytes if available (for instant updates during uploads/deletions)
    // Otherwise use gallery.originalsBytesUsed
    const currentBytes = optimisticBytesUsed ?? gallery.originalsBytesUsed ?? 0;
    const uploadCompleted = currentBytes > 0;
    const publishCompleted = gallery.paymentStatus === "PAID" || gallery.state === "PAID_ACTIVE";

    // For non-selective galleries, show different steps
    // "Prześlij zdjęcia" checks for final images (not original photos)
    // No separate "Prześlij zdjęcia finalne" step needed
    if (gallery.selectionEnabled === false) {
      const finalUploadCompleted = finalImagesCount > 0;

      return [
        {
          id: "upload",
          label: "Prześlij zdjęcia",
          completed: finalUploadCompleted,
        },
        {
          id: "publish",
          label: "Opublikuj galerię",
          completed: publishCompleted,
        },
      ];
    }

    // For selective galleries, use original logic
    // Send step is completed when there's any order (gallery has been sent to client)
    // Use galleryOrders from React Query store
    const sendCompleted = galleryOrders.length > 0;

    return [
      {
        id: "upload",
        label: "Prześlij zdjęcia",
        completed: uploadCompleted,
      },
      {
        id: "publish",
        label: "Opublikuj galerię",
        completed: publishCompleted,
      },
      {
        id: "send",
        label: "Wyślij do klienta",
        completed: sendCompleted,
      },
    ];
  }, [gallery, galleryLoading, galleryOrders, optimisticBytesUsed, finalImagesCount]);

  // Clear optimistic bytes when gallery bytes update (after store confirms)
  useEffect(() => {
    if (!gallery?.originalsBytesUsed) {
      return;
    }

    setOptimisticBytesUsed((prev) => {
      if (prev === null) {
        return null; // Already cleared
      }
      const currentGalleryBytes = gallery.originalsBytesUsed ?? 0;
      // If gallery shows 0, clear optimistic state
      if (currentGalleryBytes === 0) {
        return null;
      }
      // If optimistic value matches gallery value (within small tolerance), clear it
      if (Math.abs(prev - currentGalleryBytes) < 1000) {
        // Close enough (within 1KB tolerance for rounding), clear optimistic state
        return null;
      }
      // Keep optimistic value if it doesn't match
      return prev;
    });
  }, [gallery?.originalsBytesUsed]);

  // Check if all applicable steps are completed (calculate before early return)
  const applicableSteps = steps.filter((step) => step.completed !== null);
  const allCompleted =
    applicableSteps.length > 0 && applicableSteps.every((step) => step.completed);

  // Check if gallery has completed setup from gallery object OR if all steps are completed
  // This prevents the overlay from showing when orders exist but nextStepsCompleted flag isn't set yet
  const galleryCompletedSetup = gallery?.nextStepsCompleted === true || allCompleted;

  // Measure and report width to context (if available)
  useEffect(() => {
    if (!overlayRef.current || !overlayContext) {
      return;
    }

    // Use ResizeObserver for accurate width measurement
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        const widthInRem = width / 16; // Convert px to rem (assuming 16px base)

        // Check if width has reached 13rem (208px)
        if (widthInRem >= 13) {
          setWidthReached13rem(true);
        } else if (!nextStepsOverlayExpanded) {
          setWidthReached13rem(false);
        }

        if (nextStepsOverlayExpanded) {
          overlayContext.setNextStepsWidth(width);
        } else {
          overlayContext.setNextStepsCollapsedWidth(width);
        }
      }
    });

    resizeObserver.observe(overlayRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [nextStepsOverlayExpanded, overlayContext]);

  // Initialize visibility synchronously on mount to prevent flash
  // Use useLayoutEffect to run before browser paint
  useLayoutEffect(() => {
    if (!overlayContext || hasInitializedVisibilityRef.current) {
      return;
    }

    // Calculate intended visibility (what it should be when not creating)
    const intendedVisible =
      !galleryCompletedSetup &&
      !shouldHide &&
      tutorialDisabled !== true &&
      !!gallery &&
      !galleryLoading &&
      steps.length > 0;

    // Hide overlay during gallery creation to avoid blinking
    const shouldBeVisible = intendedVisible && !galleryCreationLoading;
    const newVisible = Boolean(shouldBeVisible);
    const newExpanded = Boolean(nextStepsOverlayExpanded);

    // On initial mount, if we have a persisted visible state, preserve it during loading
    // This prevents the overlay from disappearing when navigating between routes
    // Also preserve state during gallery creation to prevent blinking
    const shouldPreserveState = (currentOverlayVisible && galleryLoading) || galleryCreationLoading;
    const finalVisible = shouldPreserveState ? currentOverlayVisible : newVisible;
    const finalExpanded = newExpanded;

    // Set initial visibility synchronously
    if (overlayContext.nextStepsVisible !== finalVisible) {
      setOverlayVisible(finalVisible);
    }
    if (overlayContext.nextStepsExpanded !== finalExpanded) {
      setOverlayExpanded(finalExpanded);
    }

    hasInitializedVisibilityRef.current = true;
  }, [
    overlayContext,
    galleryCompletedSetup,
    shouldHide,
    tutorialDisabled,
    gallery,
    galleryLoading,
    galleryCreationLoading,
    steps.length,
    nextStepsOverlayExpanded,
    setOverlayVisible,
    setOverlayExpanded,
    currentOverlayVisible,
  ]);

  // Update context when visibility or expansion state changes (if context available)
  // Use useMemo to calculate visibility once and prevent unnecessary updates
  // Hide overlay during gallery creation to avoid blinking - preserve intended visibility
  const calculatedVisibility = useMemo(() => {
    // Calculate intended visibility (what it should be when not creating)
    const intendedVisible =
      !galleryCompletedSetup &&
      !shouldHide &&
      tutorialDisabled !== true &&
      !!gallery &&
      !galleryLoading &&
      steps.length > 0;

    // Hide overlay during gallery creation, but preserve intended state
    // This prevents blinking when galleryCreationLoading toggles
    const shouldBeVisible = intendedVisible && !galleryCreationLoading;

    return {
      visible: Boolean(shouldBeVisible),
      expanded: Boolean(nextStepsOverlayExpanded),
      intendedVisible: Boolean(intendedVisible), // Track intended state for smooth transitions
    };
  }, [
    galleryCompletedSetup,
    shouldHide,
    tutorialDisabled,
    gallery,
    galleryLoading,
    steps.length,
    nextStepsOverlayExpanded,
    galleryCreationLoading,
  ]);

  // Track previous values to prevent unnecessary updates
  const prevVisibilityRef = useRef({
    visible: null as boolean | null,
    expanded: null as boolean | null,
  });
  const prevGalleryCreationLoadingRef = useRef<boolean | null>(null);
  const suppressUpdatesRef = useRef<boolean>(false);
  const pendingUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!overlayContext || !hasInitializedVisibilityRef.current) {
      return;
    }

    const { visible: newVisible, expanded: newExpanded } = calculatedVisibility;
    const prev = prevVisibilityRef.current;
    const prevGalleryCreationLoading = prevGalleryCreationLoadingRef.current;

    // If galleryCreationLoading is active, suppress all visibility updates and hide overlay
    if (galleryCreationLoading) {
      suppressUpdatesRef.current = true;
      // Clear any pending updates
      if (pendingUpdateTimeoutRef.current) {
        clearTimeout(pendingUpdateTimeoutRef.current);
        pendingUpdateTimeoutRef.current = null;
      }
      // Hide overlay immediately if it's visible
      if (overlayContext.nextStepsVisible) {
        setOverlayVisible(false);
        prev.visible = false;
      }
      prevGalleryCreationLoadingRef.current = galleryCreationLoading;
      return;
    }

    // If we just finished creating, set up a delayed update
    const justFinishedCreating =
      prevGalleryCreationLoading === true && galleryCreationLoading === false;

    if (justFinishedCreating) {
      suppressUpdatesRef.current = true;
      // Clear any existing pending update
      if (pendingUpdateTimeoutRef.current) {
        clearTimeout(pendingUpdateTimeoutRef.current);
      }
      // Capture intended expanded state for the timeout
      const targetExpanded = newExpanded;
      // Schedule update after state stabilizes (longer delay to let all updates settle)
      pendingUpdateTimeoutRef.current = setTimeout(() => {
        suppressUpdatesRef.current = false;
        // Re-check visibility one more time to ensure we have the latest state
        const currentIntended =
          !galleryCompletedSetup &&
          !shouldHide &&
          tutorialDisabled !== true &&
          !!gallery &&
          !galleryLoading &&
          steps.length > 0;
        const finalVisible = currentIntended;
        if (overlayContext.nextStepsVisible !== finalVisible) {
          setOverlayVisible(finalVisible);
          prev.visible = finalVisible;
        }
        if (overlayContext.nextStepsExpanded !== targetExpanded) {
          setOverlayExpanded(targetExpanded);
          prev.expanded = targetExpanded;
        }
        pendingUpdateTimeoutRef.current = null;
      }, 300); // Longer delay to ensure all state updates have settled

      prevGalleryCreationLoadingRef.current = galleryCreationLoading;
      return () => {
        if (pendingUpdateTimeoutRef.current) {
          clearTimeout(pendingUpdateTimeoutRef.current);
          pendingUpdateTimeoutRef.current = null;
        }
      };
    }

    // If we're suppressing updates (during transition), skip
    if (suppressUpdatesRef.current) {
      prevGalleryCreationLoadingRef.current = galleryCreationLoading;
      return;
    }

    // Normal update logic - only when not suppressing
    const visibilityChanged =
      overlayContext.nextStepsVisible !== newVisible && prev.visible !== newVisible;
    const expandedChanged =
      overlayContext.nextStepsExpanded !== newExpanded && prev.expanded !== newExpanded;

    if (visibilityChanged || expandedChanged) {
      if (visibilityChanged) {
        setOverlayVisible(newVisible);
        prev.visible = newVisible;
      }
      if (expandedChanged) {
        setOverlayExpanded(newExpanded);
        prev.expanded = newExpanded;
      }
    }

    prevGalleryCreationLoadingRef.current = galleryCreationLoading;

    // Explicit return for TypeScript (useEffect cleanup is optional)
    return undefined;
    // Only depend on calculated values, not store values (to prevent loops)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    calculatedVisibility.visible,
    calculatedVisibility.expanded,
    overlayContext,
    galleryCreationLoading,
    calculatedVisibility.intendedVisible,
    updateGalleryMutation,
  ]);

  // Reset optimistic bytes when gallery changes
  useEffect(() => {
    setOptimisticBytesUsed(null);
    // Reset initialization flag when gallery changes to re-initialize visibility
    hasInitializedVisibilityRef.current = false;
  }, [gallery?.galleryId]);

  // Auto-hide and mark as completed if all steps are completed (must be before early return)
  // Hide after 3 seconds when all steps are done (not immediately), then mark as completed permanently in database
  useEffect(() => {
    if (
      allCompleted &&
      gallery?.galleryId &&
      !galleryLoading &&
      steps.length > 0 &&
      !galleryCompletedSetup &&
      !isUpdatingCompletionRef.current // Prevent multiple updates
    ) {
      // Mark that we're updating to prevent duplicate calls
      isUpdatingCompletionRef.current = true;

      // First collapse if expanded
      if (nextStepsOverlayExpanded) {
        setNextStepsOverlayExpanded(false);
      }

      // Then hide completely and mark as completed in database after 3 seconds
      const timeoutId = setTimeout(async () => {
        try {
          // Update gallery in database to mark setup as completed
          await updateGalleryMutation.mutateAsync({
            galleryId: gallery.galleryId,
            data: {
              nextStepsCompleted: true,
            },
          });

          // React Query will automatically refetch and update the cache
          // No need for manual optimistic updates
        } catch (error) {
          console.error("Failed to mark gallery setup as completed:", error);
          // Reset flag on error so user can retry
          isUpdatingCompletionRef.current = false;
        }
      }, 3000); // Hide after 3 seconds if all completed

      return () => {
        clearTimeout(timeoutId);
        // Reset flag if effect is cleaned up before timeout completes
        isUpdatingCompletionRef.current = false;
      };
    }
    return undefined;
  }, [
    allCompleted,
    nextStepsOverlayExpanded,
    gallery?.galleryId, // Only depend on galleryId, not entire gallery object
    galleryLoading,
    steps.length,
    setNextStepsOverlayExpanded,
    galleryCompletedSetup,
    updateGalleryMutation,
  ]);

  // Reset update flag when gallery changes
  useEffect(() => {
    isUpdatingCompletionRef.current = false;
  }, [gallery?.galleryId]);

  const handleDontShowAgain = async (): Promise<void> => {
    // Load preference first if not loaded (needed for update)
    if (tutorialDisabled === null) {
      loadTutorialPreference();
    }

    setIsSavingPreference(true);
    try {
      await updateBusinessInfoMutation.mutateAsync({
        tutorialNextStepsDisabled: true,
      });
      setTutorialDisabled(true);
      showToast("info", "Ukryto", "Ten panel nie będzie już wyświetlany");
    } catch (error) {
      console.error("Failed to save tutorial preference:", error);
      showToast("error", "Błąd", "Nie udało się zapisać preferencji");
    } finally {
      setIsSavingPreference(false);
    }
  };

  // Calculate visibility (but keep component mounted to prevent flickering)
  // Hide if: gallery setup already completed, tutorial disabled, no gallery, loading, no steps, or in settings/publish view
  // Use the memoized calculated visibility
  const calculatedVisible = calculatedVisibility.visible;

  // On initial mount, use persisted overlay state to prevent flash
  // After initialization, use calculated value
  // This prevents the overlay from disappearing during route changes
  const isVisible = hasInitializedVisibilityRef.current
    ? calculatedVisible
    : currentOverlayVisible !== false
      ? currentOverlayVisible || calculatedVisible
      : calculatedVisible;

  // Check if gallery is paid for send step (only if gallery exists)
  const isPaid = gallery
    ? gallery.paymentStatus === "PAID" || gallery.state === "PAID_ACTIVE"
    : false;

  const { startPublishFlow } = usePublishFlow();
  const openModal = useModalStore((state) => state.openModal);

  const handlePublishClick = () => {
    if (!gallery?.galleryId) {
      return;
    }

    // Use centralized publish flow action
    startPublishFlow(gallery.galleryId);
  };

  const handleUploadClick = () => {
    if (!gallery?.galleryId) {
      return;
    }

    // For non-selective galleries, navigate to order page (where photos are uploaded)
    if (isNonSelectionGallery) {
      // Use order from URL if available, otherwise get first order from galleryOrders
      const targetOrderId =
        orderIdForQuery ?? (galleryOrders.length > 0 ? galleryOrders[0]?.orderId : null);
      if (targetOrderId) {
        void router.push(`/galleries/${gallery.galleryId}/orders/${targetOrderId}`);
      } else if (galleryOrders.length > 0) {
        // Fallback: try to get orderId from first order
        const firstOrder = galleryOrders[0];
        if (firstOrder?.orderId) {
          void router.push(`/galleries/${gallery.galleryId}/orders/${firstOrder.orderId}`);
        }
      }
    } else {
      // For selective galleries
      const isOnPhotosPage = router.pathname === "/galleries/[id]/photos";

      if (isOnPhotosPage && galleryIdStr === gallery.galleryId) {
        // Already on photos page - just open the modal via Zustand
        openModal("photos-upload-modal");
      } else {
        // Navigate to photos page and open modal via Zustand
        openModal("photos-upload-modal");
        void router.push(`/galleries/${gallery.galleryId}/photos`);
      }
    }
  };

  const handleUploadFinalClick = () => {
    if (gallery?.galleryId && order?.orderId) {
      void router.push(`/galleries/${gallery.galleryId}/orders/${order.orderId}`);
    }
  };

  const handleSendClick = async () => {
    if (gallery?.galleryId && isPaid) {
      try {
        await sendGalleryLinkToClientMutation.mutateAsync(gallery.galleryId);
        showToast("success", "Sukces", "Link do galerii został wysłany do klienta");
      } catch (_err) {
        showToast("error", "Błąd", "Nie udało się wysłać linku do galerii");
      }
    }
  };

  // Don't render at all if tutorial is permanently disabled
  if (tutorialDisabled === true) {
    return null;
  }

  return (
    <div
      ref={overlayRef}
      className={`fixed bottom-4 right-4 z-40 max-w-[calc(100vw-2rem)] ${
        isVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
      style={{
        width: nextStepsOverlayExpanded ? "17rem" : "4rem",
        transition: "width 400ms cubic-bezier(0.4, 0, 0.2, 1)",
        transformOrigin: "bottom right",
      }}
      data-expanded={nextStepsOverlayExpanded}
    >
      {/* Main container with refined shadows and backdrop */}
      <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border border-gray-200/80 dark:border-gray-700/80 rounded-2xl shadow-theme-xl overflow-hidden transition-all duration-300 hover:shadow-theme-lg">
        {/* Header with refined typography and spacing */}
        <button
          onClick={() => {
            setNextStepsOverlayExpanded(!nextStepsOverlayExpanded);
          }}
          className={`w-full flex items-center ${
            nextStepsOverlayExpanded ? "justify-between px-5 py-5" : "justify-center py-5"
          } border-b border-gray-100 dark:border-gray-800/50 transition-all duration-200 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 active:bg-gray-100/50 dark:active:bg-gray-800/50`}
          aria-label={nextStepsOverlayExpanded ? "Zwiń" : "Rozwiń"}
        >
          {nextStepsOverlayExpanded ? (
            <>
              <h3
                className="text-[16px] font-semibold tracking-[-0.01em] text-gray-900 dark:text-gray-50"
                style={{
                  transition: "opacity 200ms ease-out",
                  opacity: nextStepsOverlayExpanded && widthReached13rem ? 1 : 0,
                }}
              >
                Ukończ konfigurację
              </h3>
              <ChevronRight
                size={18}
                className="text-gray-400 dark:text-gray-500 transition-transform duration-200 hover:text-gray-600 dark:hover:text-gray-400 flex-shrink-0"
                strokeWidth={2.5}
              />
            </>
          ) : (
            <ChevronLeft
              size={24}
              className="text-gray-400 dark:text-gray-500 transition-transform duration-200 hover:text-gray-600 dark:hover:text-gray-400"
              strokeWidth={2.5}
            />
          )}
        </button>

        {/* Content with refined spacing and visual hierarchy */}
        <div ref={contentRef}>
          <div className={`px-5 ${nextStepsOverlayExpanded ? "py-5" : "py-4"} space-y-2.5`}>
            {steps.map((step) => {
              if (step.completed === null) {
                return null;
              }

              const isDisabled = step.id === "send" && !isPaid;

              const stepButton = (
                <button
                  key={step.id}
                  onClick={() => {
                    if (!step.completed && !isDisabled) {
                      if (step.id === "upload") {
                        handleUploadClick();
                      } else if (step.id === "publish") {
                        void handlePublishClick();
                      } else if (step.id === "send") {
                        void handleSendClick();
                      } else if (step.id === "uploadFinal") {
                        handleUploadFinalClick();
                      }
                    }
                  }}
                  disabled={step.completed || isDisabled}
                  className={`group w-full flex items-center ${
                    nextStepsOverlayExpanded ? "gap-3.5 px-3.5 py-3.5" : "justify-center py-2.5"
                  } rounded-xl text-left transition-all duration-200 ${
                    nextStepsOverlayExpanded
                      ? step.completed
                        ? "bg-gradient-to-br from-success-50 to-success-25 dark:from-success-950/30 dark:to-success-900/20 cursor-default shadow-sm"
                        : isDisabled
                          ? "bg-gray-50/50 dark:bg-gray-800/30 opacity-60 cursor-not-allowed"
                          : "bg-gray-50/80 dark:bg-gray-800/40 hover:bg-gray-100/80 dark:hover:bg-gray-700/50 hover:shadow-theme-sm cursor-pointer active:scale-[0.98]"
                      : "hover:bg-gray-50/50 dark:hover:bg-gray-800/30 cursor-pointer"
                  }`}
                >
                  {/* Status indicator with refined styling */}
                  <div
                    className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${
                      step.completed
                        ? "bg-gradient-to-br from-success-500 to-success-600 dark:from-success-500 dark:to-success-600 text-white shadow-lg shadow-success-500/25 scale-100"
                        : "bg-gray-200 dark:bg-gray-700 border-2 border-gray-300/50 dark:border-gray-600/50"
                    } ${!step.completed && !isDisabled ? "group-hover:border-brand-400 dark:group-hover:border-brand-500 group-hover:bg-gray-100 dark:group-hover:bg-gray-600" : ""}`}
                  >
                    {step.completed ? (
                      <Check className="w-5 h-5" strokeWidth={3} />
                    ) : (
                      <div
                        className={`w-2.5 h-2.5 rounded-full transition-colors ${
                          isDisabled
                            ? "bg-gray-400 dark:bg-gray-500"
                            : "bg-gray-400 dark:bg-gray-500 group-hover:bg-brand-500"
                        }`}
                      />
                    )}
                  </div>

                  {/* Label with refined typography */}
                  <div
                    className={`flex-1 ${
                      nextStepsOverlayExpanded ? "opacity-100" : "opacity-0 w-0 overflow-hidden"
                    }`}
                    style={{
                      transition: "opacity 200ms ease-out",
                      transitionDelay: nextStepsOverlayExpanded ? "450ms" : "0ms",
                    }}
                  >
                    <span
                      className={`text-[14px] font-medium tracking-[-0.01em] whitespace-nowrap ${
                        step.completed
                          ? "text-success-700 dark:text-success-400"
                          : isDisabled
                            ? "text-gray-500 dark:text-gray-500"
                            : "text-gray-800 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-gray-100"
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                </button>
              );

              // Wrap with tooltip when collapsed
              if (!nextStepsOverlayExpanded) {
                return (
                  <Tooltip key={step.id} content={step.label} side="top" align="end" fullWidth>
                    {stepButton}
                  </Tooltip>
                );
              }

              return stepButton;
            })}
          </div>

          {/* Footer with refined styling - Always reserves space for text */}
          <div className="relative px-5 py-3.5 border-t border-gray-100 dark:border-gray-800/50 bg-gradient-to-b from-transparent to-gray-50/30 dark:to-gray-900/30 h-[52px] flex items-center justify-center">
            {/* Invisible spacer to maintain height when collapsed */}
            <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
              <span className="text-[12px] text-transparent text-center py-1.5">
                Zamknij i nie pokazuj tego ponownie
              </span>
            </div>
            {/* Visible button that fades in - using div to avoid browser button styling artifacts */}
            <div
              onClick={() => {
                if (!isSavingPreference && tutorialDisabled !== null && nextStepsOverlayExpanded) {
                  void handleDontShowAgain();
                }
              }}
              className={`relative w-full text-[12px] font-medium text-center py-1.5 cursor-pointer select-none ${
                isSavingPreference || tutorialDisabled === null || !nextStepsOverlayExpanded
                  ? "opacity-40 cursor-not-allowed"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
              style={{
                transition: "opacity 200ms ease-out",
                transitionDelay: nextStepsOverlayExpanded ? "600ms" : "0ms",
                opacity: nextStepsOverlayExpanded ? 1 : 0,
                pointerEvents: nextStepsOverlayExpanded ? "auto" : "none",
                background: "transparent",
                border: "none",
                outline: "none",
                boxShadow: "none",
                borderRadius: nextStepsOverlayExpanded ? "0.375rem" : "0",
              }}
              onMouseEnter={(e) => {
                if (nextStepsOverlayExpanded && !isSavingPreference && tutorialDisabled !== null) {
                  e.currentTarget.style.background = "rgba(243, 244, 246, 0.5)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
              onMouseDown={(e) => {
                if (nextStepsOverlayExpanded && !isSavingPreference && tutorialDisabled !== null) {
                  e.currentTarget.style.background = "rgba(229, 231, 235, 0.5)";
                }
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
              role="button"
              tabIndex={
                nextStepsOverlayExpanded && !isSavingPreference && tutorialDisabled !== null
                  ? 0
                  : -1
              }
              onKeyDown={(e) => {
                if (
                  (e.key === "Enter" || e.key === " ") &&
                  !isSavingPreference &&
                  tutorialDisabled !== null &&
                  nextStepsOverlayExpanded
                ) {
                  e.preventDefault();
                  void handleDontShowAgain();
                }
              }}
            >
              {isSavingPreference ? "Zapisywanie..." : "Zamknij i nie pokazuj tego ponownie"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
