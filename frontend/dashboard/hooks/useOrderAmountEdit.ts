import { useState, useCallback } from "react";

import api, { formatApiError } from "../lib/api-service";
import { plnToCents, centsToPlnString } from "../lib/currency";
import { useGalleryStore } from "../store";
import { useOrderStore } from "../store";
import { useToast } from "./useToast";

interface UseOrderAmountEditOptions {
  galleryId: string | string[] | undefined;
  orderId: string | string[] | undefined;
  currentTotalCents: number;
  onSave?: () => Promise<void>;
}

export const useOrderAmountEdit = ({
  galleryId,
  orderId,
  currentTotalCents,
  onSave,
}: UseOrderAmountEditOptions) => {
  const { showToast } = useToast();
  const [savingAmount, setSavingAmount] = useState<boolean>(false);
  const [isEditingAmount, setIsEditingAmount] = useState<boolean>(false);
  const [editingAmountValue, setEditingAmountValue] = useState<string>("");

  const handleStartEditAmount = useCallback((): void => {
    setEditingAmountValue(centsToPlnString(currentTotalCents));
    setIsEditingAmount(true);
  }, [currentTotalCents]);

  const handleCancelEditAmount = useCallback((): void => {
    setIsEditingAmount(false);
    setEditingAmountValue("");
  }, []);

  const handleSaveAmount = useCallback(async (): Promise<void> => {
    if (!galleryId || !orderId) {
      return;
    }

    const newTotalCents = plnToCents(editingAmountValue);

    setSavingAmount(true);
    try {
      await api.orders.update(galleryId as string, orderId as string, {
        totalCents: newTotalCents,
      });

      // Invalidate all caches to ensure fresh data on next fetch
      const { invalidateOrderCache } = useOrderStore.getState();
      const { invalidateAllGalleryCaches } = useGalleryStore.getState();
      invalidateOrderCache(orderId as string);
      invalidateAllGalleryCaches(galleryId as string);

      if (onSave) {
        await onSave();
      }
      setIsEditingAmount(false);
      setEditingAmountValue("");
      showToast("success", "Sukces", "Kwota została zaktualizowana");
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    } finally {
      setSavingAmount(false);
    }
  }, [galleryId, orderId, editingAmountValue, onSave, showToast]);

  return {
    isEditingAmount,
    editingAmountValue,
    savingAmount,
    setEditingAmountValue,
    handleStartEditAmount,
    handleCancelEditAmount,
    handleSaveAmount,
  };
};
