import { StateCreator } from "zustand";

export interface TablePreferences {
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  itemsPerPage?: number;
}

export interface UISlice {
  tablePreferences: Record<string, TablePreferences>;
  setTablePreferences: (tableId: string, preferences: TablePreferences) => void;
  clearTablePreferences: (tableId?: string) => void;
  // Gallery creation flow state (persists across navigation)
  galleryCreationFlowActive: boolean;
  galleryCreationTargetId: string | null;
  setGalleryCreationFlowActive: (active: boolean, galleryId?: string) => void;
}

export const createUISlice: StateCreator<UISlice, [["zustand/devtools", never]], [], UISlice> = (
  set
) => ({
  tablePreferences: {},
  galleryCreationFlowActive: false,
  galleryCreationTargetId: null,

  setTablePreferences: (tableId: string, preferences: TablePreferences) => {
    set(
      (state) => ({
        tablePreferences: {
          ...state.tablePreferences,
          [tableId]: preferences,
        },
      }),
      undefined,
      `ui/setTablePreferences/${tableId}`
    );
  },

  clearTablePreferences: (tableId?: string) => {
    if (tableId) {
      set(
        (state) => {
          const { [tableId]: _removed, ...rest } = state.tablePreferences;
          return { tablePreferences: rest };
        },
        undefined,
        `ui/clearTablePreferences/${tableId}`
      );
    } else {
      set({ tablePreferences: {} }, undefined, "ui/clearTablePreferences/all");
    }
  },

  setGalleryCreationFlowActive: (active: boolean, galleryId?: string) => {
    set(
      {
        galleryCreationFlowActive: active,
        galleryCreationTargetId: active && galleryId ? galleryId : null,
      },
      undefined,
      `ui/setGalleryCreationFlowActive/${active ? galleryId ?? "true" : "false"}`
    );
  },
});
