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
 * Hook for adaptive polling based on user activity and page visibility.
 *
 * Matches the dashboard polling behavior:
 * - Tracks true inactivity (60s+ no user activity)
 * - Pauses regular polling when the tab is hidden
 * - Only triggers an immediate poll when returning from true idle (not just tab switch)
 * - Enforces a minimum poll interval (prevents tab-switch abuse)
 */
export function useAdaptivePolling(): UseAdaptivePollingResult {
  const [isActive, setIsActive] = useState(true);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [shouldPollImmediately, setShouldPollImmediately] = useState(false);

  const lastActivityTimeRef = useRef<number>(Date.now());
  const lastPollTimeRef = useRef<number>(Date.now());
  const lastImmediatePollTimeRef = useRef<number>(0);
  const inactivityCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const wasIdleRef = useRef<boolean>(false);
  const activityHandlerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTriggeringImmediatePollRef = useRef<boolean>(false);
  const hasTriggeredImmediate = useRef<boolean>(false);

  const handleActivity = useCallback(() => {
    if (activityHandlerTimeoutRef.current) {
      clearTimeout(activityHandlerTimeoutRef.current);
    }

    activityHandlerTimeoutRef.current = setTimeout(() => {
      const now = Date.now();
      const wasInactive = !isActive;
      lastActivityTimeRef.current = now;

      if (
        wasIdleRef.current &&
        !isTriggeringImmediatePollRef.current &&
        !hasTriggeredImmediate.current
      ) {
        isTriggeringImmediatePollRef.current = true;
        wasIdleRef.current = false;

        const timeSinceLastPoll = now - lastPollTimeRef.current;
        const timeSinceLastImmediatePoll = now - lastImmediatePollTimeRef.current;

        if (
          timeSinceLastPoll >= MIN_POLL_INTERVAL_MS &&
          timeSinceLastImmediatePoll >= MIN_POLL_INTERVAL_MS
        ) {
          hasTriggeredImmediate.current = true;
          lastImmediatePollTimeRef.current = now;
          setShouldPollImmediately(true);
          setTimeout(() => setShouldPollImmediately(false), 1000);
          setTimeout(() => {
            hasTriggeredImmediate.current = false;
          }, 1000);
        }

        setTimeout(() => {
          isTriggeringImmediatePollRef.current = false;
        }, 300);
      }

      if (wasInactive) {
        setIsActive(true);
      }
    }, 100);
  }, [isActive]);

  // Inactivity checker (true idle = 60s+ no activity)
  useEffect(() => {
    const checkInactivity = () => {
      const now = Date.now();
      const idleTime = now - lastActivityTimeRef.current;

      if (idleTime >= ACTIVITY_THRESHOLD_MS && isActive) {
        setIsActive(false);
        wasIdleRef.current = true;
      }
    };

    inactivityCheckIntervalRef.current = setInterval(checkInactivity, INACTIVITY_CHECK_INTERVAL_MS);
    checkInactivity();

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
      if (activityHandlerTimeoutRef.current) {
        clearTimeout(activityHandlerTimeoutRef.current);
      }
    };
  }, [handleActivity]);

  // Visibility affects regular polling interval only (no immediate poll on tab switch)
  useEffect(() => {
    let timer: NodeJS.Timeout;

    const handler = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const visible = document.visibilityState === "visible";
        setIsPageVisible(visible);
      }, 250);
    };

    document.addEventListener("visibilitychange", handler);
    setIsPageVisible(document.visibilityState === "visible");

    return () => {
      document.removeEventListener("visibilitychange", handler);
      clearTimeout(timer);
    };
  }, []);

  const resetTimer = useCallback(() => {
    lastPollTimeRef.current = Date.now();
    lastImmediatePollTimeRef.current = 0;
  }, []);

  const updateLastPollTime = useCallback(() => {
    lastPollTimeRef.current = Date.now();
  }, []);

  const interval = useMemo(() => {
    return isActive && isPageVisible ? ACTIVE_POLL_INTERVAL_MS : null;
  }, [isActive, isPageVisible]);

  return {
    interval,
    shouldPollImmediately,
    resetTimer,
    isActive,
    isPageVisible,
    updateLastPollTime,
  };
}

