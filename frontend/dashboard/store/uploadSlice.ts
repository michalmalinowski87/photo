import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface UploadProgress {
  id: string;
  type: "original" | "final" | "cover";
  galleryId?: string;
  orderId?: string;
  current: number;
  total: number;
  currentFileName: string;
  errors: string[];
  successes: number;
  status: "uploading" | "completed" | "error" | "cancelled";
}

interface UploadState {
  uploads: Record<string, UploadProgress>;
  addUpload: (id: string, upload: Omit<UploadProgress, "id">) => void;
  updateUpload: (id: string, updates: Partial<UploadProgress>) => void;
  removeUpload: (id: string) => void;
  clearUploads: (type?: "original" | "final" | "cover") => void;
  clearCompletedUploads: () => void;
}

export const useUploadStore = create<UploadState>()(
  devtools(
    (set) => ({
      uploads: {},

      addUpload: (id: string, upload: Omit<UploadProgress, "id">) => {
        set((state) => ({
          uploads: {
            ...state.uploads,
            [id]: { ...upload, id },
          },
        }));
      },

      updateUpload: (id: string, updates: Partial<UploadProgress>) => {
        set((state) => {
          const upload = state.uploads[id];
          if (!upload) return state;
          return {
            uploads: {
              ...state.uploads,
              [id]: { ...upload, ...updates },
            },
          };
        });
      },

      removeUpload: (id: string) => {
        set((state) => {
          const { [id]: removed, ...rest } = state.uploads;
          return { uploads: rest };
        });
      },

      clearUploads: (type?: "original" | "final" | "cover") => {
        if (type) {
          set((state) => {
            const filtered = Object.fromEntries(
              Object.entries(state.uploads).filter(([_, upload]) => upload.type !== type)
            );
            return { uploads: filtered };
          });
        } else {
          set({ uploads: {} });
        }
      },

      clearCompletedUploads: () => {
        set((state) => {
          const filtered = Object.fromEntries(
            Object.entries(state.uploads).filter(
              ([_, upload]) => upload.status !== "completed" && upload.status !== "error"
            )
          );
          return { uploads: filtered };
        });
      },
    }),
    { name: "UploadStore" }
  )
);
