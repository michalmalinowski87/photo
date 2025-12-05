import { useCallback } from "react";

import { formatApiError } from "../lib/api-service";
import { useGalleryStore } from "../store";

import { useToast } from "./useToast";

interface UseGalleryDataOptions {
  galleryId: string | string[] | undefined;
}

/**
 * Simplified hook that calls store actions directly
 * All state is managed in the store, no local state setters needed
 */
export const useGalleryData = ({ galleryId }: UseGalleryDataOptions) => {
  const { showToast } = useToast();
  const { setError, fetchGallery, fetchGalleryOrders } = useGalleryStore();

  const loadGalleryData = useCallback(async () => {
    if (!galleryId) {
      return;
    }

    setError(null);

    try {
      await fetchGallery(galleryId as string);
    } catch (err) {
      const errorMsg = formatApiError(err);
      setError(errorMsg ?? "Nie udało się załadować danych galerii");
      showToast("error", "Błąd", errorMsg ?? "Nie udało się załadować danych galerii");
    }
  }, [galleryId, setError, fetchGallery, showToast]);

  const loadGalleryOrders = useCallback(async () => {
    if (!galleryId) {
      return;
    }

    try {
      await fetchGalleryOrders(galleryId as string);
    } catch (_err) {
      // Store action handles errors internally
    }
  }, [galleryId, fetchGalleryOrders]);

  return {
    loadGalleryData,
    loadGalleryOrders,
  };
};
