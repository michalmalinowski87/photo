"use client";

import { useEffect, useRef } from "react";

/**
 * Comprehensive context menu prevention for desktop and mobile
 * Prevents right-click (desktop) and long-press (mobile) context menus
 * Also prevents drag/drop and text/image selection
 */
export function ContextMenuPrevention() {
  const touchStateRef = useRef<{
    startTime: number;
    startX: number;
    startY: number;
    isLongPress: boolean;
    timeoutId: NodeJS.Timeout | null;
  }>({
    startTime: 0,
    startX: 0,
    startY: 0,
    isLongPress: false,
    timeoutId: null,
  });

  useEffect(() => {
    // Prevent right-click (desktop)
    const preventContextMenu = (e: MouseEvent | TouchEvent) => {
      if (e.cancelable) {
        e.preventDefault();
        // TODO: Add PostHog tracking for rightClickAttempt when PostHog is installed
        // if (e instanceof MouseEvent && e.button === 2) {
        //   posthog.capture('gallery_app:right_click_attempt', {
        //     download_method: "right_click",
        //   });
        // }
      }
    };

    // Prevent long-press (mobile)
    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;

      const state = touchStateRef.current;
      
      // Clear any existing timeout
      if (state.timeoutId) {
        clearTimeout(state.timeoutId);
        state.timeoutId = null;
      }

      // Reset state
      state.startTime = Date.now();
      state.startX = touch.clientX;
      state.startY = touch.clientY;
      state.isLongPress = false;

      // Set timeout to mark as long press after 300ms
      state.timeoutId = setTimeout(() => {
        state.isLongPress = true;
        // TODO: Add PostHog tracking for longPressAttempt when PostHog is installed
        // posthog.capture('gallery_app:long_press_attempt', {
        //   download_method: "long_press",
        // });
      }, 300);
    };

    const handleTouchMove = (e: TouchEvent) => {
      const state = touchStateRef.current;
      const touch = e.touches[0];
      
      if (!touch) return;

      // If user has moved significantly, cancel long press detection
      const deltaX = Math.abs(touch.clientX - state.startX);
      const deltaY = Math.abs(touch.clientY - state.startY);
      const moveThreshold = 10; // pixels

      if (deltaX > moveThreshold || deltaY > moveThreshold) {
        // User is scrolling/moving, not long-pressing
        if (state.timeoutId) {
          clearTimeout(state.timeoutId);
          state.timeoutId = null;
        }
        state.isLongPress = false;
        return;
      }

      // Only prevent default if we're in a long-press scenario and event is cancelable
      if (state.isLongPress && e.cancelable) {
        e.preventDefault();
      }
    };

    const handleTouchEnd = () => {
      const state = touchStateRef.current;
      if (state.timeoutId) {
        clearTimeout(state.timeoutId);
        state.timeoutId = null;
      }
      state.isLongPress = false;
    };

    // Prevent drag/drop (saves image)
    const preventDrag = (e: DragEvent) => {
      if (e.cancelable) {
        e.preventDefault();
      }
    };

    // Prevent text/image selection
    const preventSelect = (e: Event) => {
      if (e.cancelable) {
        e.preventDefault();
      }
    };

    // Add event listeners
    document.addEventListener("contextmenu", preventContextMenu);
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    document.addEventListener("touchcancel", handleTouchEnd, { passive: true });
    document.addEventListener("dragstart", preventDrag);
    document.addEventListener("selectstart", preventSelect);

    return () => {
      const state = touchStateRef.current;
      if (state.timeoutId) {
        clearTimeout(state.timeoutId);
      }
      
      document.removeEventListener("contextmenu", preventContextMenu);
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchEnd);
      document.removeEventListener("dragstart", preventDrag);
      document.removeEventListener("selectstart", preventSelect);
    };
  }, []);

  return null;
}
