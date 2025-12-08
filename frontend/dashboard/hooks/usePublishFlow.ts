import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo } from "react";
import { create } from "zustand";

interface PublishFlowState {
  isOpen: boolean;
  galleryId: string | null;
  initialState: {
    duration?: string;
    planKey?: string;
  } | null;
  startPublishFlow: (
    galleryId: string,
    initialState?: { duration?: string; planKey?: string } | null
  ) => void;
  closePublishFlow: () => void;
}

// Global store for publish flow state
const usePublishFlowStore = create<PublishFlowState>((set) => ({
  isOpen: false,
  galleryId: null,
  initialState: null,
  startPublishFlow: (
    galleryId: string,
    initialState?: { duration?: string; planKey?: string } | null
  ) => {
    set({
      isOpen: true,
      galleryId,
      initialState: initialState ?? null,
    });
  },
  closePublishFlow: () => {
    set({
      isOpen: false,
      galleryId: null,
      initialState: null,
    });
  },
}));

/**
 * Hook to manage the publish gallery flow
 * Provides a centralized action to start the publish flow from anywhere
 * and handles URL params when returning from payment redirects
 */
export function usePublishFlow() {
  const router = useRouter();
  const { isOpen, galleryId, initialState, startPublishFlow, closePublishFlow } =
    usePublishFlowStore();

  // Check for URL params when returning from payment redirect
  // Only check once on mount to avoid re-triggering
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const publishParam = params.get("publish");
    const galleryParam = params.get("galleryId");
    const durationParam = params.get("duration");
    const planKeyParam = params.get("planKey");

    if (publishParam === "true" && galleryParam) {
      // Clean up URL params immediately
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("publish");
      newUrl.searchParams.delete("galleryId");
      newUrl.searchParams.delete("duration");
      newUrl.searchParams.delete("planKey");
      window.history.replaceState({}, "", newUrl.toString());

      // Start the publish flow with any preserved state
      // Use the store's startPublishFlow directly to avoid navigation (we're already on the right page)
      const preservedState =
        durationParam || planKeyParam
          ? {
              duration: durationParam ?? undefined,
              planKey: planKeyParam ?? undefined,
            }
          : null;

      // Use store action directly (don't use hook's startPublishFlow to avoid navigation)
      const store = usePublishFlowStore.getState();
      store.startPublishFlow(galleryParam, preservedState);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  /**
   * Action to start the publish flow
   * Can be called from any page/component
   * Optionally navigates to gallery page if not already there
   */
  const handleStartPublishFlow = useCallback(
    (
      targetGalleryId: string,
      flowInitialState?: { duration?: string; planKey?: string } | null
    ) => {
      // Get current galleryId from route if available
      const currentGalleryId = Array.isArray(router.query.id)
        ? router.query.id[0]
        : router.query.id;

      // If we're not on the gallery page, navigate there first
      // The wizard will open automatically via the store state
      if (currentGalleryId !== targetGalleryId || !router.pathname?.includes("/galleries/")) {
        void router.push(`/galleries/${targetGalleryId}`);
      }

      // Start the flow (this will set the store state)
      startPublishFlow(targetGalleryId, flowInitialState);
    },
    [router, startPublishFlow]
  );

  return {
    isOpen,
    galleryId,
    initialState,
    startPublishFlow: handleStartPublishFlow,
    closePublishFlow,
  };
}
