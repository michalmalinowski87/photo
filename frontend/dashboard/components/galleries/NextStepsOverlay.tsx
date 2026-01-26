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

interface Step {
  id: string;
  label: string;
  completed: boolean | null; // null means step doesn't apply (e.g., send step for non-selection galleries)
}

export const NextStepsOverlay = () => {
  const router = useRouter();
  const { id: galleryId, orderId } = router.query;
  const { data: businessInfo } = useBusinessInfo();
  const updateGalleryMutation = useUpdateGallery();
  const updateBusinessInfoMutation = useUpdateBusinessInfo();
  const { showToast } = useToast();
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Track if send link request is in flight to prevent concurrent calls
  const isSendingRef = useRef(false);
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
  const {
    data: gallery,
    isLoading: galleryLoading,
    isFetching: galleryFetching,
  } = useGallery(galleryIdForQuery);
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

  // Removed publishWizardOpen - we now use publishFlowIsOpen from store which is the source of truth

  const [tutorialDisabled, setTutorialDisabled] = useState<boolean | null>(null);
  const [isSavingPreference, setIsSavingPreference] = useState(false);
  const [optimisticBytesUsed, setOptimisticBytesUsed] = useState<number | null>(null);
  const galleryRef = useRef(gallery);
  const isUpdatingCompletionRef = useRef(false); // Track if we're already updating completion status
  const hasInitializedVisibilityRef = useRef(false); // Track if we've initialized visibility on mount
  const prevGalleryCreationLoadingRef = useRef<boolean | null>(null); // Track previous gallery creation loading state

  // Keep ref in sync with gallery prop
  useEffect(() => {
    galleryRef.current = gallery;
  }, [gallery]);

  // Get publish flow state from store (actual source of truth)
  const { isOpen: publishFlowIsOpen, startPublishFlow } = usePublishFlow();

  // Check if we should hide the overlay (settings or publish view)
  // Priority: Store state > Actual URL > router.query (store state is the source of truth, actual URL is most up-to-date)
  const shouldHide = useMemo(() => {
    const isSettingsPage = router.pathname?.includes("/settings");

    // Store state is the primary source of truth - if wizard is closed in store, ignore URL params completely
    // This prevents stale router.query from hiding the overlay after wizard closes
    if (isSettingsPage) {
      return true;
    }

    if (publishFlowIsOpen) {
      return true;
    }

    // If wizard is closed in store (publishFlowIsOpen === false), trust the store and ignore URL params
    // This prevents stale router.query from hiding overlay after wizard closes
    // Only check actual URL (not router.query which can be stale) as a safety check
    // If actual URL has publish param but store says closed, trust the store (wizard was just closed)
    let actualUrlHasPublish = false;
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      actualUrlHasPublish =
        params.get("publish") === "true" && params.get("galleryId") === gallery?.galleryId;
    }

    // Only hide if actual URL has publish param (don't trust router.query which can be stale)
    // Since store says wizard is closed, we should ignore URL params, but check actual URL for safety
    return Boolean(actualUrlHasPublish);
  }, [router.pathname, gallery?.galleryId, publishFlowIsOpen]);

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
    } catch (_error) {
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

  // Check if gallery has completed setup - prioritize database flag to prevent flicker
  // If nextStepsCompleted is true in gallery data, use that directly (don't recalculate)
  const galleryCompletedSetup = gallery?.nextStepsCompleted === true;

  // Only calculate allCompleted if gallery doesn't have the flag set yet
  // This prevents flicker from recalculating when data updates
  const applicableSteps = steps.filter((step) => step.completed !== null);
  const allCompleted =
    !galleryCompletedSetup &&
    applicableSteps.length > 0 &&
    applicableSteps.every((step) => step.completed);

  // Use either the database flag OR the calculated value (but prioritize database flag)
  const isCompleted = galleryCompletedSetup || allCompleted;

  // Measure and report width to context (if available)
  useEffect(() => {
    if (!overlayRef.current || !overlayContext) {
      return;
    }

    // Use ResizeObserver for accurate width measurement
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;

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

    // Read persisted expanded state directly from store (only on initial mount)
    // This ensures we respect user's previous preference without causing re-renders
    const persistedExpanded = useOverlayStore.getState().nextStepsOverlayExpanded;

    // If we just finished creating a gallery, always expand regardless of persisted state
    // Check if galleryCreationLoading just transitioned from true to false
    const justFinishedCreating =
      prevGalleryCreationLoadingRef.current === true && galleryCreationLoading === false;

    // Expand overlay on initial mount if it should be visible (first appearance)
    // If gallery was just created, always expand. Otherwise use persisted state if available, otherwise expand by default
    const newExpanded = shouldBeVisible
      ? justFinishedCreating
        ? true
        : (persistedExpanded ?? true)
      : Boolean(persistedExpanded);

    // Update ref to track gallery creation loading state for next render
    prevGalleryCreationLoadingRef.current = galleryCreationLoading;

    // On initial mount, preserve persisted state to prevent flicker on refresh
    // If persisted state says hidden (false), keep it hidden until we have definitive proof it should be visible
    // This prevents the overlay from flashing when React Query returns stale cached data on refresh
    // Key fix: If persisted state is false on initial mount, keep it hidden (respect user's previous dismissal)
    // Only show if persisted state is true OR if we're not on initial mount anymore
    const isInitialMount = !hasInitializedVisibilityRef.current;
    const shouldPreserveHiddenState = isInitialMount && !currentOverlayVisible;
    const shouldPreserveVisibleState =
      (currentOverlayVisible && galleryLoading) || galleryCreationLoading;
    const shouldPreserveState = shouldPreserveHiddenState || shouldPreserveVisibleState;
    const finalVisible = shouldPreserveState ? currentOverlayVisible : newVisible;
    const finalExpanded = newExpanded;

    // Set initial visibility synchronously
    if (overlayContext.nextStepsVisible !== finalVisible) {
      setOverlayVisible(finalVisible);
    }
    if (overlayContext.nextStepsExpanded !== finalExpanded) {
      setOverlayExpanded(finalExpanded);
      // Also update nextStepsOverlayExpanded to keep states in sync
      setNextStepsOverlayExpanded(finalExpanded);
    }

    hasInitializedVisibilityRef.current = true;
  }, [
    overlayContext,
    galleryCompletedSetup,
    shouldHide,
    tutorialDisabled,
    gallery,
    galleryLoading,
    galleryFetching,
    galleryCreationLoading,
    steps.length,
    // REMOVED nextStepsOverlayExpanded from dependencies to prevent effect from re-running on user actions
    setOverlayVisible,
    setOverlayExpanded,
    setNextStepsOverlayExpanded,
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
  const suppressUpdatesRef = useRef<boolean>(false);
  const pendingUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track if we should suppress updates until fresh data arrives (when persisted state was false)

  useEffect(() => {
    if (!overlayContext || !hasInitializedVisibilityRef.current) {
      return;
    }

    const { visible: newVisible } = calculatedVisibility;
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
      // Hide overlay temporarily during gallery creation (don't mark as dismissed)
      if (overlayContext.nextStepsVisible && gallery?.galleryId) {
        setOverlayVisible(false);
        prev.visible = false;
        // Don't set nextStepsOverlayDismissed during creation - we'll reset it when creation finishes
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
      // Reset nextStepsOverlayDismissed if it was set during creation (shouldn't persist)
      // Only reset if gallery is not completed and not actually dismissed by user
      if (
        gallery?.galleryId &&
        gallery.nextStepsOverlayDismissed === true &&
        !galleryCompletedSetup
      ) {
        updateGalleryMutation.mutate({
          galleryId: gallery.galleryId,
          data: {
            nextStepsOverlayDismissed: false,
          },
        });
      }
      // When overlay first appears after gallery creation, expand it by default
      const targetExpanded = true; // Always expand on first appearance after creation
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
          // Also update nextStepsOverlayExpanded to keep states in sync
          setNextStepsOverlayExpanded(targetExpanded);
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
    // Only manage visibility here - expansion is user-controlled and should not be auto-updated

    // Only update visibility if:
    // 1. We're not respecting persisted hidden state, OR
    // 2. The new visibility matches what we want (show when it should be visible)
    const effectiveNewVisible = newVisible;

    const visibilityChanged =
      overlayContext.nextStepsVisible !== effectiveNewVisible &&
      prev.visible !== effectiveNewVisible;

    if (visibilityChanged) {
      setOverlayVisible(effectiveNewVisible);
      prev.visible = effectiveNewVisible;
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

    // Reset nextStepsOverlayDismissed if it was incorrectly set (e.g., from previous bug)
    // Only reset if gallery is not completed and flag is set
    if (
      gallery?.galleryId &&
      gallery.nextStepsOverlayDismissed === true &&
      gallery.nextStepsCompleted !== true &&
      !galleryLoading &&
      !galleryCreationLoading
    ) {
      // Check if steps are actually incomplete before resetting
      const hasIncompleteSteps = steps.some((step) => step.completed === false);
      if (hasIncompleteSteps) {
        updateGalleryMutation.mutate({
          galleryId: gallery.galleryId,
          data: {
            nextStepsOverlayDismissed: false,
          },
        });
      }
    }
  }, [
    gallery?.galleryId,
    gallery?.nextStepsOverlayDismissed,
    gallery?.nextStepsCompleted,
    galleryLoading,
    galleryCreationLoading,
    steps,
    updateGalleryMutation,
  ]);

  // Auto-hide and mark as completed if all steps are completed (must be before early return)
  // Hide after 3 seconds when all steps are done (not immediately), then mark as completed permanently in database
  useEffect(() => {
    if (
      allCompleted &&
      gallery?.galleryId &&
      !galleryLoading &&
      steps.length > 0 &&
      !gallery?.nextStepsCompleted && // Only update if database flag isn't set yet
      !isUpdatingCompletionRef.current // Prevent multiple updates
    ) {
      // Mark that we're updating to prevent duplicate calls
      isUpdatingCompletionRef.current = true;

      // First collapse if expanded
      if (nextStepsOverlayExpanded) {
        setNextStepsOverlayExpanded(false);
        // Also update overlayContext to keep states in sync
        setOverlayExpanded(false);
      }

      // Then hide completely and mark as completed in database after 3 seconds
      const timeoutId = setTimeout(async () => {
        try {
          // Update gallery in database to mark setup as completed and overlay as dismissed
          await updateGalleryMutation.mutateAsync({
            galleryId: gallery.galleryId,
            data: {
              nextStepsCompleted: true,
              nextStepsOverlayDismissed: true,
            },
          });

          // React Query will automatically refetch and update the cache
          // No need for manual optimistic updates
        } catch (_error) {
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
    gallery?.nextStepsCompleted,
    galleryLoading,
    steps.length,
    setNextStepsOverlayExpanded,
    setOverlayExpanded,
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

    if (!gallery?.galleryId) {
      showToast("error", "Błąd", "Brak danych galerii");
      return;
    }

    setIsSavingPreference(true);
    try {
      // Update gallery to mark overlay as dismissed (this is the primary source of truth now)
      await updateGalleryMutation.mutateAsync({
        galleryId: gallery.galleryId,
        data: {
          nextStepsOverlayDismissed: true,
        },
      });

      // Also update business info preference for consistency
      await updateBusinessInfoMutation.mutateAsync({
        tutorialNextStepsDisabled: true,
      });

      setTutorialDisabled(true);
      showToast("info", "Ukryto", "Ten panel nie będzie już wyświetlany");
    } catch (_error) {
      showToast("error", "Błąd", "Nie udało się zapisać preferencji");
    } finally {
      setIsSavingPreference(false);
    }
  };

  // Check if gallery is paid for send step (only if gallery exists)
  const isPaid = gallery
    ? gallery.paymentStatus === "PAID" || gallery.state === "PAID_ACTIVE"
    : false;

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

  const handleSendClick = useCallback(async () => {
    // Atomic check-and-set: if already sending, return immediately
    if (
      !gallery?.galleryId ||
      !isPaid ||
      isSendingRef.current ||
      sendGalleryLinkToClientMutation.isPending
    ) {
      return;
    }

    // Set flag immediately to prevent race conditions (atomic operation)
    isSendingRef.current = true;

    try {
      await sendGalleryLinkToClientMutation.mutateAsync(gallery.galleryId);
      showToast("success", "Sukces", "Link do galerii został wysłany do klienta");
    } catch (err) {
      // Only show error if it's not the "already in progress" error
      const errorMessage =
        err instanceof Error ? err.message : "Nie udało się wysłać linku do galerii";
      if (!errorMessage.includes("already in progress")) {
        showToast("error", "Błąd", "Nie udało się wysłać linku do galerii");
      }
    } finally {
      // Reset flag after request completes (success or error)
      isSendingRef.current = false;
    }
  }, [gallery?.galleryId, isPaid, sendGalleryLinkToClientMutation, showToast]);

  // Calculate visibility values before early returns (needed for logging)
  const overlayDismissed = gallery?.nextStepsOverlayDismissed === true;
  const calculatedVisible = calculatedVisibility.visible;
  const shouldShow = !overlayDismissed && !isCompleted && !tutorialDisabled && calculatedVisible;

  // Dead simple visibility logic
  // Don't show overlay if gallery is loading/fetching or not available yet (prevents flicker from stale cache)
  if (galleryLoading || galleryFetching || !gallery) {
    return null;
  }

  // Don't render if dismissed, completed, or tutorial disabled
  if (overlayDismissed || isCompleted || tutorialDisabled === true) {
    return null;
  }

  // Use expansion state from context (set synchronously in useLayoutEffect) to prevent flicker
  const isExpanded = overlayContext?.nextStepsExpanded ?? nextStepsOverlayExpanded;

  return (
    <div
      ref={overlayRef}
      className={`fixed bottom-4 right-4 z-40 max-w-[calc(100vw-2rem)] ${
        shouldShow ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
      style={{
        width: isExpanded ? "17rem" : "4rem",
        transition: "width 400ms cubic-bezier(0.4, 0, 0.2, 1)",
        transformOrigin: "bottom right",
      }}
      data-expanded={isExpanded}
    >
      {/* Main container with refined shadows and backdrop */}
      <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border border-gray-400/80 dark:border-gray-700/80 rounded-2xl shadow-theme-xl overflow-hidden transition-all duration-300 hover:shadow-theme-lg">
        {/* Header with refined typography and spacing */}
        <button
          onClick={() => {
            // Use the current state value from context to avoid stale closures
            const currentExpanded = overlayContext?.nextStepsExpanded ?? nextStepsOverlayExpanded;
            const newExpanded = !currentExpanded;
            // Update both states to keep them in sync
            setOverlayExpanded(newExpanded);
            setNextStepsOverlayExpanded(newExpanded);
          }}
          className={`relative w-full flex items-center ${
            isExpanded ? "justify-between px-5 py-5" : "justify-center py-5"
          } border-b border-gray-100 dark:border-gray-800/50 transition-all duration-200 hover:bg-photographer-background/50 dark:hover:bg-gray-800/30 active:bg-photographer-elevated/50 dark:active:bg-gray-800/50`}
          aria-label={isExpanded ? "Zwiń" : "Rozwiń"}
        >
          {/* Invisible spacer to maintain layout and prevent jumping */}
          <div
            className="absolute inset-0 flex items-center justify-between px-5"
            aria-hidden="true"
          >
            <span className="text-base font-semibold tracking-[-0.01em] text-transparent whitespace-nowrap">
              Ukończ konfigurację
            </span>
            <div className="w-[18px] flex-shrink-0" />
          </div>
          {/* Visible title that fades in when expanding */}
          <h3
            className="relative text-base font-semibold tracking-[-0.01em] text-photographer-accentDark dark:text-photographer-accent whitespace-nowrap"
            style={{
              transition: "opacity 200ms ease-out",
              transitionDelay: isExpanded ? "200ms" : "0ms",
              opacity: isExpanded ? 1 : 0,
              pointerEvents: isExpanded ? "auto" : "none",
            }}
          >
            Ukończ konfigurację
          </h3>
          {/* Chevron icons */}
          {isExpanded ? (
            <ChevronRight
              size={18}
              className="relative text-gray-400 dark:text-gray-500 transition-transform duration-200 hover:text-gray-600 dark:hover:text-gray-400 flex-shrink-0"
              strokeWidth={2.5}
            />
          ) : (
            <ChevronLeft
              size={24}
              className="relative text-gray-400 dark:text-gray-500 transition-transform duration-200 hover:text-gray-600 dark:hover:text-gray-400 flex-shrink-0"
              strokeWidth={2.5}
            />
          )}
        </button>

        {/* Content with refined spacing and visual hierarchy */}
        <div ref={contentRef}>
          <div className={`px-5 ${isExpanded ? "py-5" : "py-4"} space-y-2.5`}>
            {steps.map((step) => {
              if (step.completed === null) {
                return null;
              }

              // Check if gallery has photos
              // For selective galleries: check original photos
              // For non-selective galleries: check final images
              const hasPhotos = isNonSelectionGallery
                ? finalImagesCount > 0
                : (gallery?.originalsBytesUsed ?? 0) > 0;

              // Disable publish step if no photos, or send step if not paid
              const isDisabled =
                (step.id === "publish" && !hasPhotos) || (step.id === "send" && !isPaid);

              // Get tooltip content for disabled publish step
              const tooltipContent =
                step.id === "publish" && isDisabled && !hasPhotos
                  ? "Najpierw prześlij zdjęcia"
                  : step.label;

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
                    isExpanded ? "gap-3.5 px-3.5 py-3.5" : "justify-center py-2.5"
                  } rounded-xl text-left transition-all duration-200 ${
                    isExpanded
                      ? step.completed
                        ? "bg-gradient-to-br from-photographer-accentLight/60 to-photographer-accentLight/40 dark:from-success-950/30 dark:to-success-900/20 cursor-default shadow-sm"
                        : isDisabled
                          ? "bg-photographer-background/50 dark:bg-gray-800/30 opacity-60 cursor-not-allowed"
                          : "bg-photographer-elevated dark:bg-gray-800/50 border border-photographer-border/50 dark:border-gray-700/50 hover:bg-photographer-muted/60 dark:hover:bg-gray-700/60 hover:shadow-theme-sm cursor-pointer active:scale-[0.98]"
                      : "hover:bg-photographer-background/50 dark:hover:bg-gray-800/30 cursor-pointer"
                  }`}
                >
                  {/* Status indicator with refined styling */}
                  <div
                    className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${
                      step.completed
                        ? "bg-gradient-to-br from-photographer-accentDark to-photographer-accentHover dark:from-success-600 dark:to-success-700 text-white shadow-lg shadow-photographer-accentDark/25 scale-100"
                        : "bg-photographer-muted dark:bg-gray-700 border-2 border-gray-400/50 dark:border-gray-600/50"
                    } ${!step.completed && !isDisabled ? "group-hover:border-photographer-accent dark:group-hover:border-photographer-accent group-hover:bg-photographer-elevated dark:group-hover:bg-gray-600" : ""}`}
                  >
                    {step.completed ? (
                      <Check className="w-5 h-5" strokeWidth={3} />
                    ) : (
                      <div
                        className={`w-2.5 h-2.5 rounded-full transition-colors ${
                          isDisabled
                            ? "bg-gray-400 dark:bg-gray-500"
                            : "bg-gray-400 dark:bg-gray-500 group-hover:bg-photographer-accent"
                        }`}
                      />
                    )}
                  </div>

                  {/* Label with refined typography */}
                  <div
                    className={`flex-1 ${
                      isExpanded ? "opacity-100" : "opacity-0 w-0 overflow-hidden"
                    }`}
                    style={{
                      transition: "opacity 200ms ease-out",
                      transitionDelay:
                        isExpanded && step.id === "publish" ? "0ms" : isExpanded ? "450ms" : "0ms",
                    }}
                  >
                    <span
                      className={`text-sm font-medium tracking-[-0.01em] whitespace-nowrap block ${
                        step.completed
                          ? "text-photographer-accentDark dark:text-success-400"
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

              // Wrap with tooltip when collapsed or when disabled publish step
              // Only wrap publish step in tooltip when collapsed OR when disabled (not when expanded and enabled)
              // When expanded and publish step is enabled, don't wrap in Tooltip to avoid rendering delays
              if (!isExpanded) {
                return (
                  <Tooltip
                    key={step.id}
                    content={tooltipContent}
                    side="top"
                    align="end"
                    fullWidth={true}
                  >
                    {stepButton}
                  </Tooltip>
                );
              }

              // When expanded, only wrap disabled publish step in Tooltip
              if (isExpanded && step.id === "publish" && isDisabled && !hasPhotos) {
                return (
                  <Tooltip
                    key={step.id}
                    content={tooltipContent}
                    side="top"
                    align="center"
                    fullWidth={true}
                  >
                    {stepButton}
                  </Tooltip>
                );
              }

              return stepButton;
            })}
          </div>

          {/* Footer with refined styling - Always reserves space for text */}
          <div className="relative px-5 py-3.5 border-t border-gray-100 dark:border-gray-800/50 bg-gradient-to-b from-transparent to-gray-50/30 dark:to-gray-900/30 h-[39px] flex items-center justify-center">
            {/* Invisible spacer to maintain height when collapsed */}
            <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
              <span className="text-theme-xs text-transparent text-center py-1.5">
                Zamknij i nie pokazuj tego ponownie
              </span>
            </div>
            {/* Visible button that fades in - using div to avoid browser button styling artifacts */}
            <div
              onClick={() => {
                // Allow click even if tutorialDisabled is null - handleDontShowAgain will load it if needed
                if (!isSavingPreference && isExpanded) {
                  void handleDontShowAgain();
                }
              }}
              className={`relative w-full text-theme-xs font-medium text-center py-1.5 select-none ${
                isSavingPreference || !isExpanded
                  ? "opacity-40 cursor-not-allowed text-gray-400 dark:text-gray-500"
                  : "cursor-pointer text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
              style={{
                transition: "opacity 200ms ease-out",
                transitionDelay: isExpanded ? "200ms" : "0ms",
                opacity: isExpanded ? 1 : 0,
                pointerEvents: isExpanded && !isSavingPreference ? "auto" : "none",
                background: "transparent",
                border: "none",
                outline: "none",
                boxShadow: "none",
                borderRadius: isExpanded ? "0.375rem" : "0",
              }}
              onMouseEnter={(e) => {
                if (isExpanded && !isSavingPreference) {
                  e.currentTarget.style.background = "rgba(243, 244, 246, 0.5)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
              onMouseDown={(e) => {
                if (isExpanded && !isSavingPreference) {
                  e.currentTarget.style.background = "rgba(229, 231, 235, 0.5)";
                }
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
              role="button"
              tabIndex={isExpanded && !isSavingPreference ? 0 : -1}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !isSavingPreference && isExpanded) {
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
