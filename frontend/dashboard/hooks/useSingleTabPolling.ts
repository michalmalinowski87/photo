/* eslint-disable no-console */
import { useEffect, useRef, useState } from "react";

import { useAdaptivePolling } from "./useAdaptivePolling";

const CHANNEL_NAME = "photo-cloud-polling-leader";
const HEARTBEAT_INTERVAL = 5000; // 5s
const LEADER_TIMEOUT = HEARTBEAT_INTERVAL * 3; // 15s - if no heartbeat for this long, leader is dead
const LEADER_CHECK_INTERVAL = 3000; // Check every 3s if leader is alive

// Shared across all tabs (module scope)
let channel: BroadcastChannel | null = null;
let isLeader = false;
let heartbeatInterval: NodeJS.Timeout | null = null;

/**
 * Hook for single-tab polling using BroadcastChannel leader election
 *
 * Features:
 * - Only one tab polls at a time (the leader)
 * - Leader election via BroadcastChannel (modern, instant, reliable)
 * - Heartbeat mechanism to detect leader tab closure
 * - Automatic leadership transfer when leader tab becomes inactive
 * - Integrates with adaptive polling for activity-based intervals
 *
 * Usage:
 * - Use `shouldPoll` instead of checking `interval !== null`
 * - Use `shouldPollImmediately` for immediate polls (only when leader)
 * - Call `forcePollInLeaderTab()` to trigger a poll in the leader tab
 */
export function useSingleTabPolling() {
  const { interval, shouldPollImmediately, updateLastPollTime, resetTimer } = useAdaptivePolling();
  const [isLeaderState, setIsLeaderState] = useState(false);

  // These are per-tab!
  const lastHeartbeatRef = useRef<number>(0);
  const tabIdRef = useRef<string>(`tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  const leaderCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Send heartbeat (only if leader)
  const sendHeartbeat = () => {
    channel?.postMessage({
      type: "heartbeat",
      ts: Date.now(),
      tabId: tabIdRef.current,
    });
  };

  const stopLeaderCheck = () => {
    if (leaderCheckIntervalRef.current) {
      clearInterval(leaderCheckIntervalRef.current);
      leaderCheckIntervalRef.current = null;
    }
  };

  // Become leader (only one should win)
  const becomeLeader = () => {
    if (isLeader) return;

    const now = Date.now();
    const timeSinceLast = now - lastHeartbeatRef.current;

    // If we saw a heartbeat from another tab very recently → don't fight
    if (timeSinceLast > 0 && timeSinceLast < HEARTBEAT_INTERVAL * 1.5) {
      return;
    }

    isLeader = true;
    setIsLeaderState(true);
    console.log("[PollingLeader] This tab is now the leader");
    // Stop checking for leader health since we're now the leader
    stopLeaderCheck();
    // Don't send immediate heartbeat - let the interval handle it
    // This prevents race conditions where we receive our own heartbeat
    heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    // Send first heartbeat after a small delay to avoid immediate conflicts
    setTimeout(sendHeartbeat, 100);
  };

  const startLeaderCheck = () => {
    // Clear any existing check
    if (leaderCheckIntervalRef.current) {
      clearInterval(leaderCheckIntervalRef.current);
    }

    // Only check if we're not the leader and tab is visible
    if (isLeader || document.visibilityState !== "visible") {
      return;
    }

    leaderCheckIntervalRef.current = setInterval(() => {
      // Don't check if we're now the leader or tab is hidden
      if (isLeader || document.visibilityState !== "visible") {
        stopLeaderCheck();
        return;
      }

      const now = Date.now();
      const timeSinceLastHeartbeat = now - lastHeartbeatRef.current;

      // If we haven't seen a heartbeat in a while, the leader is probably dead
      if (lastHeartbeatRef.current === 0 || timeSinceLastHeartbeat > LEADER_TIMEOUT) {
        console.log("[PollingLeader] Leader appears to be dead, attempting to become leader", {
          timeSinceLastHeartbeat: `${Math.round(timeSinceLastHeartbeat / 1000)}s`,
          timeout: `${LEADER_TIMEOUT / 1000}s`,
        });
        becomeLeader();
      }
    }, LEADER_CHECK_INTERVAL);
  };

  const resignLeader = () => {
    if (!isLeader) return;
    isLeader = false;
    setIsLeaderState(false);
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    console.log("[PollingLeader] This tab resigned leadership");
    // Start checking for leader health since we're now a follower
    startLeaderCheck();
  };

  useEffect(() => {
    if (!channel) {
      channel = new BroadcastChannel(CHANNEL_NAME);

      channel.onmessage = (e: MessageEvent) => {
        const data = e.data as { type: string; ts?: number; tabId?: string };
        if (data.type !== "heartbeat") return;

        const now = Date.now();
        const age = data.ts ? now - data.ts : Infinity;

        // Ignore our own heartbeats (shouldn't happen, but safety check)
        if (data.tabId === tabIdRef.current) {
          return;
        }

        // Update our view of the world (only for other tabs' heartbeats)
        if (age < HEARTBEAT_INTERVAL * 2) {
          lastHeartbeatRef.current = now;
        }

        // If heartbeat is from another tab and recent → resign if we thought we were leader
        if (data.tabId && data.tabId !== tabIdRef.current && age < HEARTBEAT_INTERVAL * 2) {
          resignLeader();
        } else if (data.tabId && data.tabId !== tabIdRef.current) {
          // We saw a heartbeat from another tab, so we know there's a leader
          // Make sure we're checking for leader health
          if (!isLeader && document.visibilityState === "visible") {
            startLeaderCheck();
          }
        }
      };
    }

    let visibilityTimeout: NodeJS.Timeout | null = null;
    const handleVisibility = () => {
      // Clear any pending visibility change
      if (visibilityTimeout) {
        clearTimeout(visibilityTimeout);
      }

      if (document.visibilityState === "visible") {
        // Debounce visibility changes to avoid rapid leader switching
        // Wait a bit to see if there's already a leader
        visibilityTimeout = setTimeout(() => {
          if (document.visibilityState === "visible") {
            becomeLeader();
          }
        }, 200); // Small delay to let other tabs settle
      } else {
        // Hidden → give up leadership immediately (better UX)
        resignLeader();
      }
    };

    // Try to become leader on mount (if visible)
    if (document.visibilityState === "visible") {
      // Small delay on mount too to avoid race conditions
      setTimeout(() => {
        if (document.visibilityState === "visible") {
          becomeLeader();
        } else {
          // If we didn't become leader, start checking for leader health
          startLeaderCheck();
        }
      }, 200);
    } else {
      // Tab is hidden on mount, start checking when it becomes visible
      startLeaderCheck();
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (visibilityTimeout) {
        clearTimeout(visibilityTimeout);
      }
      stopLeaderCheck();
      resignLeader();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const forcePollInLeaderTab = () => {
    channel?.postMessage({ type: "force-poll" });
  };

  return {
    shouldPoll: isLeaderState && interval !== null,
    shouldPollImmediately: shouldPollImmediately && isLeaderState,
    forcePollInLeaderTab,
    isLeader: isLeaderState,
    updateLastPollTime,
    resetTimer,
  };
}
