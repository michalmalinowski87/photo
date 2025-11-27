import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface DownloadProgress {
  id: string;
  orderId: string;
  galleryId: string;
  status: "generating" | "downloading" | "error" | "success";
  error?: string;
}

interface DownloadState {
  downloads: Record<string, DownloadProgress>;
  addDownload: (id: string, download: Omit<DownloadProgress, "id">) => void;
  updateDownload: (id: string, updates: Partial<DownloadProgress>) => void;
  removeDownload: (id: string) => void;
  clearDownloads: () => void;
  clearCompletedDownloads: () => void;
}

export const useDownloadStore = create<DownloadState>()(
  devtools(
    (set) => ({
      downloads: {},

      addDownload: (id: string, download: Omit<DownloadProgress, "id">) => {
        set((state) => ({
          downloads: {
            ...state.downloads,
            [id]: { ...download, id },
          },
        }));
      },

      updateDownload: (id: string, updates: Partial<DownloadProgress>) => {
        set((state) => {
          const download = state.downloads[id];
          if (!download) return state;
          return {
            downloads: {
              ...state.downloads,
              [id]: { ...download, ...updates },
            },
          };
        });
      },

      removeDownload: (id: string) => {
        set((state) => {
          const { [id]: removed, ...rest } = state.downloads;
          return { downloads: rest };
        });
      },

      clearDownloads: () => {
        set({ downloads: {} });
      },

      clearCompletedDownloads: () => {
        set((state) => {
          const filtered = Object.fromEntries(
            Object.entries(state.downloads).filter(
              ([_, download]) => download.status !== "success" && download.status !== "error"
            )
          );
          return { downloads: filtered };
        });
      },
    }),
    { name: "DownloadStore" }
  )
);
