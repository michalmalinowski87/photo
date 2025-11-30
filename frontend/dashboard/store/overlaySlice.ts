import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface OverlayState {
  nextStepsVisible: boolean;
  nextStepsExpanded: boolean;
  nextStepsWidth: number;
  nextStepsCollapsedWidth: number;
  setNextStepsVisible: (visible: boolean) => void;
  setNextStepsExpanded: (expanded: boolean) => void;
  setNextStepsWidth: (width: number) => void;
  setNextStepsCollapsedWidth: (width: number) => void;
}

export const useOverlayStore = create<OverlayState>()(
  devtools(
    (set) => ({
      nextStepsVisible: false,
      nextStepsExpanded: true,
      nextStepsWidth: 384, // w-96 = 384px
      nextStepsCollapsedWidth: 64, // w-16 = 4rem = 64px

      setNextStepsVisible: (visible: boolean) => {
        set({ nextStepsVisible: visible });
      },

      setNextStepsExpanded: (expanded: boolean) => {
        set({ nextStepsExpanded: expanded });
      },

      setNextStepsWidth: (width: number) => {
        set({ nextStepsWidth: width });
      },

      setNextStepsCollapsedWidth: (width: number) => {
        set({ nextStepsCollapsedWidth: width });
      },
    }),
    { name: "OverlayStore" }
  )
);
