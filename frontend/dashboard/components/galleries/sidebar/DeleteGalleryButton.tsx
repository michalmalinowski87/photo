import { Trash2 } from "lucide-react";
import React, { useState } from "react";

import { useNavigation } from "../../../hooks/useNavigation";
import { useToast } from "../../../hooks/useToast";
import api, { formatApiError } from "../../../lib/api-service";
import { useGalleryStore } from "../../../store";
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
  const { replace } = useNavigation();
  const { showToast } = useToast();
  const { clearCurrentGallery } = useGalleryStore();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const handleDeleteClick = () => {
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async (): Promise<void> => {
    if (!galleryId) {
      return;
    }

    // Show redirect overlay FIRST, before any other state changes
    // This ensures it covers everything immediately
    setIsRedirecting(true);
    setDeleteLoading(true);
    // Close dialog immediately to hide it behind the overlay
    setShowDeleteDialog(false);

    try {
      await api.galleries.delete(galleryId);

      // Clear gallery state explicitly before navigation
      clearCurrentGallery();

      // Navigate with explicit cleanup (navigation utility handles additional cleanup)
      void replace("/");

      // Show toast after navigation starts
      showToast("success", "Sukces", "Galeria została usunięta");
    } catch (err: unknown) {
      const errorMsg = formatApiError(err as Error);
      showToast("error", "Błąd", errorMsg ?? "Nie udało się usunąć galerii");
      // Hide redirect overlay on error so user can see the error
      setIsRedirecting(false);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      {isRedirecting && (
        <div className="fixed inset-0 flex items-center justify-center bg-white dark:bg-gray-900 z-[9999]">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-16 h-16 relative">
              <div className="absolute inset-0 border-4 border-gray-200 dark:border-gray-700 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-transparent border-t-brand-500 dark:border-t-brand-400 rounded-full animate-spin"></div>
            </div>
            <p className="text-gray-600 dark:text-gray-400 text-sm font-medium">
              Przekierowywanie...
            </p>
          </div>
        </div>
      )}

      <div className="mt-auto p-4 border-t border-gray-200 dark:border-gray-800">
        <Button
          size="sm"
          variant="outline"
          onClick={handleDeleteClick}
          disabled={deleteLoading}
          className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-500/10 border-red-300 dark:border-red-700"
          startIcon={<Trash2 size={16} />}
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
