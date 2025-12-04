import { StateCreator } from "zustand";

export interface UploadProgress {
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

export interface UploadSlice {
  uploads: Record<string, UploadProgress>;
  addUpload: (id: string, upload: Omit<UploadProgress, "id">) => void;
  updateUpload: (id: string, updates: Partial<UploadProgress>) => void;
  removeUpload: (id: string) => void;
  clearUploads: (type?: "original" | "final" | "cover") => void;
  clearCompletedUploads: () => void;
}

export const createUploadSlice: StateCreator<
  UploadSlice,
  [["zustand/devtools", never]],
  [],
  UploadSlice
> = (set) => ({
  uploads: {},

  addUpload: (id: string, upload: Omit<UploadProgress, "id">) => {
    set(
      (state) => ({
        uploads: {
          ...state.uploads,
          [id]: { ...upload, id },
        },
      }),
      undefined,
      "upload/addUpload"
    );
  },

  updateUpload: (id: string, updates: Partial<UploadProgress>) => {
    set(
      (state) => {
        const upload = state.uploads[id];
        if (!upload) {
          return state;
        }
        return {
          uploads: {
            ...state.uploads,
            [id]: { ...upload, ...updates },
          },
        };
      },
      undefined,
      "upload/updateUpload"
    );
  },

  removeUpload: (id: string) => {
    set(
      (state) => {
        const { [id]: _removed, ...rest } = state.uploads;
        return { uploads: rest };
      },
      undefined,
      "upload/removeUpload"
    );
  },

  clearUploads: (type?: "original" | "final" | "cover") => {
    if (type) {
      set(
        (state) => {
          const filtered = Object.fromEntries(
            Object.entries(state.uploads).filter(([_, upload]) => upload.type !== type)
          );
          return { uploads: filtered };
        },
        undefined,
        `upload/clearUploads/${type}`
      );
    } else {
      set({ uploads: {} }, undefined, "upload/clearUploads/all");
    }
  },

  clearCompletedUploads: () => {
    set(
      (state) => {
        const filtered = Object.fromEntries(
          Object.entries(state.uploads).filter(
            ([_, upload]) => upload.status !== "completed" && upload.status !== "error"
          )
        );
        return { uploads: filtered };
      },
      undefined,
      "upload/clearCompletedUploads"
    );
  },
});

