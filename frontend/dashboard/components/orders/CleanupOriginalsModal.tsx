import React from "react";

import Button from "../ui/button/Button";
import { Modal } from "../ui/modal";

interface CleanupOriginalsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export const CleanupOriginalsModal = ({
  isOpen,
  onClose,
  onConfirm,
  onCancel,
}: CleanupOriginalsModalProps) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-lg">
      <div className="p-6">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
          Usuń wybrane oryginały?
        </h2>

        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Czy chcesz usunąć wybrane oryginały? To działanie jest nieodwracalne i usunie oryginały,
          podglądy oraz miniatury dla wybranych zdjęć.
        </p>

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onCancel}>
            Nie
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Tak
          </Button>
        </div>
      </div>
    </Modal>
  );
};
