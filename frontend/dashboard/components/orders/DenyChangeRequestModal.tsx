import { useState } from "react";

import Button from "../ui/button/Button";
import { Modal } from "../ui/modal";

interface DenyChangeRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void;
  loading?: boolean;
}

export const DenyChangeRequestModal: React.FC<DenyChangeRequestModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  loading = false,
}) => {
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    onConfirm(reason.trim() || undefined);
    setReason(""); // Reset on confirm
  };

  const handleClose = () => {
    if (!loading) {
      setReason(""); // Reset on close
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} className="max-w-lg">
      <div className="p-6">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
          Odrzuć prośbę o zmiany
        </h2>

        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          Czy na pewno chcesz odrzucić prośbę klienta o zmiany?
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Powód odrzucenia{" "}
            <span className="text-gray-500 dark:text-gray-400">(opcjonalne, ale zalecane)</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Podaj powód odrzucenia prośby o zmiany. To pomoże klientowi zrozumieć decyzję..."
            rows={4}
            disabled={loading}
            className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:placeholder-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Powód zostanie dołączony do wiadomości e-mail wysłanej do klienta
          </p>
        </div>

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Anuluj
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {loading ? "Odrzucanie..." : "Odrzuć"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
