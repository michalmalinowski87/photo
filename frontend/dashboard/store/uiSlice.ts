import { create } from "zustand";
import { persist, devtools } from "zustand/middleware";

interface TablePreferences {
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  itemsPerPage?: number;
}

interface UIState {
  tablePreferences: Record<string, TablePreferences>;
  setTablePreferences: (tableId: string, preferences: TablePreferences) => void;
  clearTablePreferences: (tableId?: string) => void;
}

export const useUIStore = create<UIState>()(
  devtools(
    persist(
      (set) => ({
        tablePreferences: {},

        setTablePreferences: (tableId: string, preferences: TablePreferences) => {
          set((state) => ({
            tablePreferences: {
              ...state.tablePreferences,
              [tableId]: preferences,
            },
          }));
        },

        clearTablePreferences: (tableId?: string) => {
          if (tableId) {
            set((state) => {
              const { [tableId]: _removed, ...rest } = state.tablePreferences;
              return { tablePreferences: rest };
            });
          } else {
            set({ tablePreferences: {} });
          }
        },
      }),
      {
        name: "ui-preferences-storage",
        // Only persist UI preferences, not ephemeral data
      }
    ),
    { name: "UIStore" }
  )
);
