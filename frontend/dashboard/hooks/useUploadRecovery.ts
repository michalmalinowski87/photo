import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";

interface UploadState {
  galleryId: string;
  orderId?: string;
  type: "originals" | "finals";
  url: string;
  uploadStartedAt: number;
  isActiveUpload: boolean;
  fileCount: number;
}

const getStorageKey = (galleryId: string, type: "originals" | "finals"): string => {
  return `uppy_upload_state_${galleryId}_${type}`;
};

const getAllUploadStates = (): Array<{ key: string; state: UploadState }> => {
  if (typeof window === "undefined") return [];

  const states: Array<{ key: string; state: UploadState }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("uppy_upload_state_")) {
      try {
        const state = JSON.parse(localStorage.getItem(key) || "{}") as UploadState;
        if (state.isActiveUpload) {
          states.push({ key, state });
        }
      } catch {
        // Ignore invalid entries
      }
    }
  }
  return states;
};

const clearUploadState = (galleryId: string, type: "originals" | "finals"): void => {
  if (typeof window === "undefined") return;
  const key = getStorageKey(galleryId, type);
  localStorage.removeItem(key);
};

export function useUploadRecovery() {
  const router = useRouter();
  const [recoveryState, setRecoveryState] = useState<UploadState | null>(null);
  const [showModal, setShowModal] = useState(false);

  const checkForRecovery = useCallback(() => {
    if (typeof window === "undefined") return;

    const states = getAllUploadStates();
    if (states.length > 0) {
      // Use the most recent state (highest uploadStartedAt)
      const mostRecent = states.reduce((prev, current) => {
        return current.state.uploadStartedAt > prev.state.uploadStartedAt ? current : prev;
      });

      // Only show recovery modal if we're NOT already on the target URL
      // If we're on the target URL, the page-level logic will handle opening the upload modal
      const currentUrl = window.location.href;
      const targetUrl = mostRecent.state.url;

      // Check if we're already on the target page (ignore query params and hash)
      const currentPath = new URL(currentUrl).pathname;
      const targetPath = new URL(targetUrl).pathname;

      if (currentPath === targetPath) {
        // We're already on the target page, don't show global recovery modal
        // The page will handle opening the upload modal
        return;
      }

      setRecoveryState(mostRecent.state);
      setShowModal(true);
    }
  }, []);

  useEffect(() => {
    // Check for recovery on mount
    checkForRecovery();
  }, [checkForRecovery]);

  const handleResume = useCallback(() => {
    if (!recoveryState) return;

    setShowModal(false);
    // Redirect to the stored URL
    router.push(recoveryState.url).then(() => {
      // The upload modal should be opened by the component at that URL
      // We'll rely on the component to detect recovery and open the modal
    });
  }, [recoveryState, router]);

  const handleClear = useCallback(() => {
    if (!recoveryState) return;

    // Clear localStorage state
    clearUploadState(recoveryState.galleryId, recoveryState.type);

    // Clear Golden Retriever's IndexedDB storage for this gallery/type
    // We need to access the IndexedDB directly since we don't have Uppy instance here
    if (typeof window !== "undefined" && "indexedDB" in window) {
      const dbName = `uppy-golden-retriever-${recoveryState.galleryId}-${recoveryState.type}`;
      const deleteRequest = indexedDB.deleteDatabase(dbName);
      deleteRequest.onsuccess = () => {
        // Golden Retriever IndexedDB cleared
      };
      deleteRequest.onerror = () => {
        // Failed to clear Golden Retriever IndexedDB
      };
    }

    setShowModal(false);
    setRecoveryState(null);
  }, [recoveryState]);

  return {
    recoveryState,
    showModal,
    handleResume,
    handleClear,
    checkForRecovery,
  };
}
