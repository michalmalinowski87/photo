import { StateCreator } from "zustand";

export interface DownloadProgress {
  id: string;
  orderId: string;
  galleryId: string;
  status: "generating" | "downloading" | "error" | "success";
  error?: string;
}

export interface DownloadSlice {
  downloads: Record<string, DownloadProgress>;
  addDownload: (id: string, download: Omit<DownloadProgress, "id">) => void;
  updateDownload: (id: string, updates: Partial<DownloadProgress>) => void;
  removeDownload: (id: string) => void;
  clearDownloads: () => void;
  clearCompletedDownloads: () => void;
}

export const createDownloadSlice: StateCreator<
  DownloadSlice,
  [["zustand/devtools", never]],
  [],
  DownloadSlice
> = (set) => ({
  downloads: {},

  addDownload: (id: string, download: Omit<DownloadProgress, "id">) => {
    set(
      (state) => ({
        downloads: {
          ...state.downloads,
          [id]: { ...download, id },
        },
      }),
      undefined,
      "download/addDownload"
    );
  },

  updateDownload: (id: string, updates: Partial<DownloadProgress>) => {
    set(
      (state) => {
        const download = state.downloads[id];
        if (!download) {
          return state;
        }
        return {
          downloads: {
            ...state.downloads,
            [id]: { ...download, ...updates },
          },
        };
      },
      undefined,
      "download/updateDownload"
    );
  },

  removeDownload: (id: string) => {
    set(
      (state) => {
        const { [id]: _removed, ...rest } = state.downloads;
        return { downloads: rest };
      },
      undefined,
      "download/removeDownload"
    );
  },

  clearDownloads: () => {
    set({ downloads: {} }, undefined, "download/clearDownloads");
  },

  clearCompletedDownloads: () => {
    set(
      (state) => {
        const filtered = Object.fromEntries(
          Object.entries(state.downloads).filter(
            ([_, download]) => download.status !== "success" && download.status !== "error"
          )
        );
        return { downloads: filtered };
      },
      undefined,
      "download/clearCompletedDownloads"
    );
      },
});

