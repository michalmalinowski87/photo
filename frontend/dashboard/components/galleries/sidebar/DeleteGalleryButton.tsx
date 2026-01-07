import { Trash2 } from "lucide-react";
import React, { useState } from "react";

import { useDeleteGallery } from "../../../hooks/mutations/useGalleryMutations";
import { useNavigation } from "../../../hooks/useNavigation";
import { usePublishFlow } from "../../../hooks/usePublishFlow";
import { useToast } from "../../../hooks/useToast";
import { formatApiError } from "../../../lib/api-service";
import Button from "../../ui/button/Button";
import { ConfirmDialog } from "../../ui/confirm/ConfirmDialog";
import { FullPageLoading } from "../../ui/loading/Loading";

interface DeleteGalleryButtonProps {
  galleryId: string;
  galleryName?: string;
}

export const DeleteGalleryButton = ({ galleryId, galleryName }: DeleteGalleryButtonProps) => {
  const { replace } = useNavigation();
  const { showToast } = useToast();
  const { closePublishFlow } = usePublishFlow();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Use React Query mutation for delete operation
  const deleteGalleryMutation = useDeleteGallery();

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
    // Close dialog immediately to hide it behind the overlay
    setShowDeleteDialog(false);

    try {
      await deleteGalleryMutation.mutateAsync(galleryId);

      // Close publish flow if it's open for this gallery
      closePublishFlow();

      // Navigate with explicit cleanup (navigation utility handles additional cleanup)
      // React Query cache will be invalidated automatically by the mutation
      void replace("/");

      // Show toast after navigation starts
      showToast("success", "Sukces", "Galeria została usunięta");
    } catch (err: unknown) {
      const errorMsg = formatApiError(err as Error);
      showToast("error", "Błąd", errorMsg ?? "Nie udało się usunąć galerii");
      // Hide redirect overlay on error so user can see the error
      setIsRedirecting(false);
    }
  };

  return (
    <>
      {isRedirecting && <FullPageLoading text="Usuwanie galerii..." />}

      <div className="mt-auto p-3">
        <Button
          size="md"
          variant="outline"
          onClick={handleDeleteClick}
          disabled={deleteGalleryMutation.isPending}
          className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-500/10 border-red-300 dark:border-red-700"
          startIcon={<Trash2 size={20} />}
        >
          {deleteGalleryMutation.isPending ? "Usuwanie..." : "Usuń galerię"}
        </Button>
      </div>

      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          if (!deleteGalleryMutation.isPending) {
            setShowDeleteDialog(false);
          }
        }}
        onConfirm={handleDeleteConfirm}
        title="Usuń galerię"
        message={`Czy na pewno chcesz usunąć galerię "${galleryName ?? galleryId}"?\n\nTa operacja jest nieodwracalna i usunie wszystkie zdjęcia, zlecenia i dane związane z tą galerią.`}
        confirmText="Usuń galerię"
        cancelText="Anuluj"
        variant="danger"
        loading={deleteGalleryMutation.isPending}
      />
    </>
  );
};
