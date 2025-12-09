import { useState, useCallback } from "react";

import { useUpdateGalleryName } from "./mutations/useGalleryMutations";
import { formatApiError } from "../lib/api-service";

import { useToast } from "./useToast";

interface UseGalleryNameEditOptions {
  galleryId: string;
  currentGalleryName: string;
}

export const useGalleryNameEdit = ({
  galleryId,
  currentGalleryName,
}: UseGalleryNameEditOptions) => {
  const { showToast } = useToast();
  const updateGalleryNameMutation = useUpdateGalleryName();
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editingValue, setEditingValue] = useState<string>("");

  const handleStartEdit = useCallback((): void => {
    setEditingValue(currentGalleryName);
    setIsEditing(true);
  }, [currentGalleryName]);

  const handleCancelEdit = useCallback((): void => {
    setIsEditing(false);
    setEditingValue("");
  }, []);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!galleryId) {
      return;
    }

    const trimmedName = editingValue.trim();

    if (trimmedName.length === 0) {
      showToast("error", "Błąd", "Nazwa galerii nie może być pusta");
      return;
    }

    if (trimmedName.length > 100) {
      showToast("error", "Błąd", "Nazwa galerii nie może przekraczać 100 znaków");
      return;
    }

    if (trimmedName === currentGalleryName.trim()) {
      // No change, just exit edit mode
      setIsEditing(false);
      setEditingValue("");
      return;
    }

    try {
      await updateGalleryNameMutation.mutateAsync({
        galleryId,
        galleryName: trimmedName,
      });

      setIsEditing(false);
      setEditingValue("");
      showToast("success", "Sukces", "Nazwa galerii została zaktualizowana");
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    }
  }, [galleryId, editingValue, currentGalleryName, showToast, updateGalleryNameMutation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === "Enter") {
        e.preventDefault();
        void handleSave();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleCancelEdit();
      }
    },
    [handleSave, handleCancelEdit]
  );

  return {
    isEditing,
    editingValue,
    isSaving: updateGalleryNameMutation.isPending,
    setEditingValue,
    handleStartEdit,
    handleCancelEdit,
    handleSave,
    handleKeyDown,
  };
};
