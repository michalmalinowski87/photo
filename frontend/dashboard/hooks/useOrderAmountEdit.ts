import { useState, useCallback } from "react";

import { useUpdateOrder } from "./mutations/useOrderMutations";
import { formatApiError } from "../lib/api-service";
import { plnToCents, centsToPlnString } from "../lib/currency";

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
  const updateOrderMutation = useUpdateOrder();
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
      await updateOrderMutation.mutateAsync({
        galleryId: galleryId as string,
        orderId: orderId as string,
        data: {
          totalCents: newTotalCents,
        },
      });

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
  }, [galleryId, orderId, editingAmountValue, onSave, showToast, updateOrderMutation]);

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
