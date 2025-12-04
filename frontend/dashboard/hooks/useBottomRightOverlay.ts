import { useMemo } from "react";

import { useOverlayStore } from "../store";

/**
 * Hook for managing bottom right overlay state
 * Uses Zustand store for state management
 *
 * @returns Overlay state and actions
 */
export const useBottomRightOverlay = () => {
  const nextStepsVisible = useOverlayStore((state) => state.nextStepsVisible);
  const nextStepsExpanded = useOverlayStore((state) => state.nextStepsExpanded);
  const nextStepsWidth = useOverlayStore((state) => state.nextStepsWidth);
  const nextStepsCollapsedWidth = useOverlayStore((state) => state.nextStepsCollapsedWidth);
  const setNextStepsVisible = useOverlayStore((state) => state.setNextStepsVisible);
  const setNextStepsExpanded = useOverlayStore((state) => state.setNextStepsExpanded);
  const setNextStepsWidth = useOverlayStore((state) => state.setNextStepsWidth);
  const setNextStepsCollapsedWidth = useOverlayStore((state) => state.setNextStepsCollapsedWidth);

  return useMemo(
    () => ({
      nextStepsVisible,
      nextStepsExpanded,
      nextStepsWidth,
      nextStepsCollapsedWidth,
      setNextStepsVisible,
      setNextStepsExpanded,
      setNextStepsWidth,
      setNextStepsCollapsedWidth,
    }),
    [
      nextStepsVisible,
      nextStepsExpanded,
      nextStepsWidth,
      nextStepsCollapsedWidth,
      setNextStepsVisible,
      setNextStepsExpanded,
      setNextStepsWidth,
      setNextStepsCollapsedWidth,
    ]
  );
};
