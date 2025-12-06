import { StateCreator } from "zustand";

/**
 * GallerySlice - Empty slice
 * 
 * All gallery server state has been moved to React Query.
 * This slice is kept for type compatibility with UnifiedStore.
 * Gallery types should be imported from types/index.ts.
 */
export interface GallerySlice {
  // No state - all gallery data is in React Query cache
}

export const createGallerySlice: StateCreator<
  GallerySlice,
  [["zustand/devtools", never]],
  [],
  GallerySlice
> = () => ({
  // Empty slice - gallery state is now in React Query
});
