import React from "react";

import Button from "../ui/button/Button";
import { Modal } from "../ui/modal";

interface UploadRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResume: () => void;
  onClear: () => void;
  fileCount: number;
  galleryId: string;
  type: "originals" | "finals";
  orderId?: string;
}

export const UploadRecoveryModal: React.FC<UploadRecoveryModalProps> = ({
  isOpen,
  onClose,
  onResume,
  onClear,
  fileCount,
  galleryId,
  type,
  orderId,
}) => {
  const typeLabel = type === "finals" ? "zdjęć finalnych" : "zdjęć";

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md">
      <div className="p-6">
        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
          Odzyskiwanie przesyłania
        </h2>

        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Wykryto nieukończone przesyłanie {fileCount} {fileCount === 1 ? "pliku" : "plików"} {typeLabel}.
          Możesz wznowić przesyłanie lub je anulować.
        </p>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={onClear}>
            Anuluj i kontynuuj
          </Button>
          <Button variant="primary" onClick={onResume}>
            Wznów przesyłanie
          </Button>
        </div>
      </div>
    </Modal>
  );
};

