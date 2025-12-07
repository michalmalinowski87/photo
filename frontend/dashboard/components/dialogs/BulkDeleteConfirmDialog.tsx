import { AlertTriangle } from "lucide-react";
import React from "react";

import Button from "../ui/button/Button";
import { Modal } from "../ui/modal";

interface BulkDeleteConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  count: number;
  loading?: boolean;
}

export const BulkDeleteConfirmDialog: React.FC<BulkDeleteConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  count,
  loading = false,
}) => {
  const handleConfirm = async () => {
    if (loading) {
      return;
    }
    await onConfirm();
  };

  const handleClose = () => {
    // Don't allow closing during loading
    if (loading) {
      return;
    }
    onClose();
  };

  const getMessage = () => {
    if (count === 1) {
      return "Czy na pewno chcesz usunąć wybrane zdjęcie?\n\nTa operacja jest nieodwracalna.";
    }
    return `Czy na pewno chcesz usunąć ${count} wybranych zdjęć?`;
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} showCloseButton={true} className="max-w-2xl">
      <div className="p-4">
        <div className="flex items-start gap-4 mb-5">
          <div className="flex-shrink-0 mt-1">
            <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-3xl font-semibold text-gray-900 dark:text-white mb-2">
              Usuń {count === 1 ? "zdjęcie" : "zdjęcia"}
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 whitespace-pre-line">
              {getMessage()}
            </p>
          </div>
        </div>

        {count > 1 && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              Wszystkie wybrane zdjęcia zostaną trwale usunięte i nie będzie możliwości ich przywrócenia.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={loading}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-500/10 border-red-300 dark:border-red-700"
          >
            Anuluj
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Usuwanie..." : `Usuń ${count === 1 ? "zdjęcie" : `${count} zdjęć`}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

