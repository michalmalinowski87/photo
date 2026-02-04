"use client";

import { useEffect, useRef } from "react";

/**
 * Adds long-press/right-click feedback to download buttons
 * Makes download button blink + heartbeat effect when user tries to long-press or right-click
 */
export function DownloadButtonFeedback() {
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      const downloadButton = target.closest('.lg-download, [data-lg-download], .download-button');
      
      if (downloadButton) {
        const touch = e.touches[0];
        if (touch) {
          touchStartRef.current = {
            x: touch.clientX,
            y: touch.clientY,
            time: Date.now(),
          };

          // Start long-press detection
          longPressTimeoutRef.current = setTimeout(() => {
            // Trigger heartbeat effect
            downloadButton.classList.add('heartbeat');
            // TODO: Add PostHog tracking for downloadButtonRightClick (long_press) when PostHog is installed
            // posthog.capture('gallery_app:download_button_right_click', {
            //   download_method: "long_press",
            // });
            // Remove after animation completes
            setTimeout(() => {
              downloadButton.classList.remove('heartbeat');
            }, 600);
          }, 300);
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (touchStartRef.current && longPressTimeoutRef.current) {
        const touch = e.touches[0];
        if (touch) {
          const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
          const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
          
          // If moved more than 10px, cancel long-press
          if (deltaX > 10 || deltaY > 10) {
            if (longPressTimeoutRef.current) {
              clearTimeout(longPressTimeoutRef.current);
              longPressTimeoutRef.current = null;
            }
            touchStartRef.current = null;
          }
        }
      }
    };

    const handleTouchEnd = () => {
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
      }
      touchStartRef.current = null;
    };

    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const downloadButton = target.closest('.lg-download, [data-lg-download], .download-button');
      
      if (downloadButton) {
        // Trigger heartbeat effect on right-click attempt
        downloadButton.classList.add('heartbeat');
        // TODO: Add PostHog tracking for downloadButtonRightClick (right_click) when PostHog is installed
        // posthog.capture('gallery_app:download_button_right_click', {
        //   download_method: "right_click",
        // });
        setTimeout(() => {
          downloadButton.classList.remove('heartbeat');
        }, 600);
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
      }
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  return null;
}
