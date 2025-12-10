import { useEffect, useRef, useState, useCallback, useMemo } from "react";

interface UseAdaptivePollingResult {
  interval: number | null;
  shouldPollImmediately: boolean;
  resetTimer: () => void;
  isActive: boolean;
  isPageVisible: boolean;
  updateLastPollTime: () => void;
}

const ACTIVITY_THRESHOLD_MS = 60000; // 60 seconds of inactivity = idle
const INACTIVITY_CHECK_INTERVAL_MS = 10000; // Check every 10 seconds
const MIN_POLL_INTERVAL_MS = 15000; // Minimum 15 seconds between polls
const ACTIVE_POLL_INTERVAL_MS = 15000; // Poll every 15 seconds when active

/**
 * Hook for adaptive polling based on user activity and page visibility
 *
 * Features:
 * - Tracks user activity (mouse, keyboard, touch, scroll)
 * - Detects true inactivity (60s threshold) - NOT tab visibility
 * - Integrates with Page Visibility API (only pauses/resumes regular polling)
 * - Enforces minimum 15s interval between polls (prevents tab-switch abuse)
 * - Returns interval for polling (15s active, null idle/hidden)
 * - Returns shouldPollImmediately flag ONLY when recovering from true 60s+ idle
 * - Provides resetTimer function for mutations
 * - Provides updateLastPollTime function for polling hook to track poll times
 *
 * Key Design:
 * - Tab visibility changes do NOT trigger immediate polls (prevents abuse)
 * - Only true 60s+ user inactivity triggers immediate poll on return
 * - Visibility only affects regular polling interval (pause when hidden)
 */
export function useAdaptivePolling(): UseAdaptivePollingResult {
  const [isActive, setIsActive] = useState(true);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [shouldPollImmediately, setShouldPollImmediately] = useState(false);

  const lastActivityTimeRef = useRef<number>(Date.now());
  const lastPollTimeRef = useRef<number>(Date.now()); // Initialize to current time, not 0
  const lastImmediatePollTimeRef = useRef<number>(0);
  const inactivityCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const wasIdleRef = useRef<boolean>(false); // Track if we were truly idle (60s+ no activity)
  const activityHandlerTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Debounce activity handler
  const isTriggeringImmediatePollRef = useRef<boolean>(false); // Prevent multiple immediate poll triggers from same activity burst
  const hasTriggeredImmediate = useRef<boolean>(false); // Prevent repeated logs from rapid mouse events

  // Handle user activity - only triggers immediate poll if recovering from true idle (60s+)
  // Debounced to prevent multiple rapid fires from single user action
  const handleActivity = useCallback(() => {
    // Clear any pending activity handler
    if (activityHandlerTimeoutRef.current) {
      clearTimeout(activityHandlerTimeoutRef.current);
    }

    // Debounce activity handling to prevent rapid-fire events
    activityHandlerTimeoutRef.current = setTimeout(() => {
      const now = Date.now();
      const wasInactive = !isActive;
      lastActivityTimeRef.current = now;

      // Only if we were previously detected as truly idle (60s+), allow immediate poll
      // Use flag to prevent multiple triggers from same activity burst
      if (
        wasIdleRef.current &&
        !isTriggeringImmediatePollRef.current &&
        !hasTriggeredImmediate.current
      ) {
        isTriggeringImmediatePollRef.current = true;
        wasIdleRef.current = false; // Clear idle flag immediately to prevent duplicate logs

        const timeSinceLastPoll = now - lastPollTimeRef.current;
        const timeSinceLastImmediatePoll = now - lastImmediatePollTimeRef.current;

        // Only trigger immediate poll if minimum intervals have passed (prevents abuse)
        if (
          timeSinceLastPoll >= MIN_POLL_INTERVAL_MS &&
          timeSinceLastImmediatePoll >= MIN_POLL_INTERVAL_MS
        ) {
          hasTriggeredImmediate.current = true;
          lastImmediatePollTimeRef.current = now;
          setShouldPollImmediately(true);
          // Reset flag after a short delay to prevent multiple immediate polls
          setTimeout(() => setShouldPollImmediately(false), 1000);
          // Reset log guard after 1 second to allow future immediate polls
          setTimeout(() => {
            hasTriggeredImmediate.current = false;
          }, 1000);
        }

        // Reset trigger flag after short delay to allow future immediate polls
        setTimeout(() => {
          isTriggeringImmediatePollRef.current = false;
        }, 300);
      }

      if (wasInactive) {
        setIsActive(true);
      }
    }, 100); // 100ms debounce to batch rapid events
  }, [isActive]);

  // Inactivity checker - runs regardless of tab visibility
  // This is what determines "truly idle" (60s+ no activity)
  useEffect(() => {
    const checkInactivity = () => {
      const now = Date.now();
      const idleTime = now - lastActivityTimeRef.current;

      if (idleTime >= ACTIVITY_THRESHOLD_MS && isActive) {
        setIsActive(false);
        wasIdleRef.current = true; // This is the key flag!
      }
    };

    inactivityCheckIntervalRef.current = setInterval(checkInactivity, INACTIVITY_CHECK_INTERVAL_MS);
    checkInactivity(); // Initial check

    return () => {
      if (inactivityCheckIntervalRef.current) {
        clearInterval(inactivityCheckIntervalRef.current);
      }
    };
  }, [isActive]);

  // Track user activity events
  useEffect(() => {
    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "keydown",
      "click",
      "scroll",
      "touchstart",
      "touchmove",
    ];

    const handler = () => handleActivity();

    events.forEach((event) => {
      window.addEventListener(event, handler, { passive: true });
    });

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handler);
      });
      // Clean up any pending activity handler timeout
      if (activityHandlerTimeoutRef.current) {
        clearTimeout(activityHandlerTimeoutRef.current);
      }
    };
  }, [handleActivity]);

  // Visibility handler - ONLY affects polling interval, NOT immediate poll logic
  // Tab switches do NOT trigger immediate polls - only true 60s+ inactivity does
  // Debounced to prevent spam from rapid visibility changes
  useEffect(() => {
    let timer: NodeJS.Timeout;

    const handler = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const visible = document.visibilityState === "visible";
        setIsPageVisible(visible);
        // DO NOT trigger immediate poll here!
        // Only regular polling resumes when visible + active
      }, 250);
    };

    document.addEventListener("visibilitychange", handler);
    setIsPageVisible(document.visibilityState === "visible");

    return () => {
      document.removeEventListener("visibilitychange", handler);
      clearTimeout(timer);
    };
  }, []);

  // Reset timer function (for mutations)
  const resetTimer = useCallback(() => {
    lastPollTimeRef.current = Date.now();
    lastImmediatePollTimeRef.current = 0;
  }, []);

  // Update lastPollTime (called by polling hook after successful poll)
  const updateLastPollTime = useCallback(() => {
    lastPollTimeRef.current = Date.now();
  }, []);

  // Calculate interval: 15s when active and page visible, null when idle or hidden
  // Use useMemo to prevent unnecessary recalculations that could restart React Query polling
  const interval = useMemo(() => {
    return isActive && isPageVisible ? ACTIVE_POLL_INTERVAL_MS : null;
  }, [isActive, isPageVisible]);

  // Track interval changes (only when interval actually changes, not on every render)
  const prevIntervalRef = useRef<number | null>(null);
  useEffect(() => {
    if (prevIntervalRef.current !== interval) {
      prevIntervalRef.current = interval;
    }
  }, [interval]);

  return {
    interval,
    shouldPollImmediately,
    resetTimer,
    isActive,
    isPageVisible,
    updateLastPollTime,
  };
}
