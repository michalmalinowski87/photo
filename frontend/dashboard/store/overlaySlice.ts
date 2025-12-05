import { StateCreator } from "zustand";

export interface OverlaySlice {
  nextStepsVisible: boolean;
  nextStepsExpanded: boolean;
  nextStepsWidth: number;
  nextStepsCollapsedWidth: number;
  setNextStepsVisible: (visible: boolean) => void;
  setNextStepsExpanded: (expanded: boolean) => void;
  setNextStepsWidth: (width: number) => void;
  setNextStepsCollapsedWidth: (width: number) => void;
}

export const createOverlaySlice: StateCreator<
  OverlaySlice,
  [["zustand/devtools", never]],
  [],
  OverlaySlice
> = (set) => ({
  nextStepsVisible: false,
  nextStepsExpanded: true,
  nextStepsWidth: 384, // w-96 = 384px
  nextStepsCollapsedWidth: 64, // w-16 = 4rem = 64px

  setNextStepsVisible: (visible: boolean) => {
    set({ nextStepsVisible: visible }, undefined, "overlay/setNextStepsVisible");
  },

  setNextStepsExpanded: (expanded: boolean) => {
    set({ nextStepsExpanded: expanded }, undefined, "overlay/setNextStepsExpanded");
  },

  setNextStepsWidth: (width: number) => {
    set({ nextStepsWidth: width }, undefined, "overlay/setNextStepsWidth");
  },

  setNextStepsCollapsedWidth: (width: number) => {
    set({ nextStepsCollapsedWidth: width }, undefined, "overlay/setNextStepsCollapsedWidth");
  },
});
