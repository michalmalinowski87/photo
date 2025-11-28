import { useRouter } from "next/router";
import React, { useState } from "react";

import { useToast } from "../../../hooks/useToast";
import api, { formatApiError } from "../../../lib/api-service";
import Button from "../../ui/button/Button";
import { ConfirmDialog } from "../../ui/confirm/ConfirmDialog";

interface DeleteGalleryButtonProps {
  galleryId: string;
  galleryName?: string;
}

export const DeleteGalleryButton: React.FC<DeleteGalleryButtonProps> = ({
  galleryId,
  galleryName,
}) => {
  const router = useRouter();
  const { showToast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleDeleteClick = () => {
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async (): Promise<void> => {
    if (!galleryId) {
      return;
    }

    setDeleteLoading(true);

    try {
      await api.galleries.delete(galleryId);

      showToast("success", "Sukces", "Galeria została usunięta");
      setShowDeleteDialog(false);

      // Navigate back to galleries list
      void router.push("/");
    } catch (err: unknown) {
      const errorMsg = formatApiError(err as Error);
      showToast("error", "Błąd", errorMsg ?? "Nie udało się usunąć galerii");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <div className="mt-auto p-4 border-t border-gray-200 dark:border-gray-800">
        <Button
          size="sm"
          variant="outline"
          onClick={handleDeleteClick}
          disabled={deleteLoading}
          className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-500/10 border-red-300 dark:border-red-700"
        >
          {deleteLoading ? "Usuwanie..." : "Usuń galerię"}
        </Button>
      </div>

      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          if (!deleteLoading) {
            setShowDeleteDialog(false);
          }
        }}
        onConfirm={handleDeleteConfirm}
        title="Usuń galerię"
        message={`Czy na pewno chcesz usunąć galerię "${galleryName ?? galleryId}"?\n\nTa operacja jest nieodwracalna i usunie wszystkie zdjęcia, zlecenia i dane związane z tą galerią.`}
        confirmText="Usuń galerię"
        cancelText="Anuluj"
        variant="danger"
        loading={deleteLoading}
      />
    </>
  );
};
