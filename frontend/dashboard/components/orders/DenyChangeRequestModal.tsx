import { AlertTriangle } from "lucide-react";
import { useState } from "react";

import Button from "../ui/button/Button";
import { Modal } from "../ui/modal";

interface DenyChangeRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason?: string, preventFutureChangeRequests?: boolean) => void;
  loading?: boolean;
}

export const DenyChangeRequestModal: React.FC<DenyChangeRequestModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  loading = false,
}) => {
  const [reason, setReason] = useState("");

  const handleConfirm = (preventFutureChangeRequests: boolean = false) => {
    onConfirm(reason.trim() || undefined, preventFutureChangeRequests);
    setReason(""); // Reset on confirm
  };

  const handleClose = () => {
    if (!loading) {
      setReason(""); // Reset on close
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} showCloseButton={true} className="max-w-2xl">
      <div className="p-6">
        <div className="flex items-start gap-4 mb-5">
          <div className="flex-shrink-0 mt-1">
            <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-3xl font-semibold text-gray-900 dark:text-white mb-2">
              Odrzuć prośbę o zmiany
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
              Czy na pewno chcesz odrzucić prośbę klienta o zmiany?
            </p>
          </div>
        </div>

        <div className="mb-6">
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

        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={loading}
            className="text-gray-700 hover:text-gray-900 hover:bg-gray-50 dark:text-gray-300 dark:hover:text-gray-100 dark:hover:bg-white/5 border-gray-300 dark:border-gray-700"
          >
            Anuluj
          </Button>
          <Button
            variant="primary"
            onClick={() => handleConfirm(false)}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Odrzucanie..." : "Odrzuć"}
          </Button>
          <Button
            variant="primary"
            onClick={() => handleConfirm(true)}
            disabled={loading}
            startIcon={<AlertTriangle className="w-4 h-4" />}
            className="bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Odrzucanie..." : "Odrzuć i zablokuj przyszłe prośby"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
