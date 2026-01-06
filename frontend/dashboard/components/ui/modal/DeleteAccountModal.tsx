import { AlertTriangle } from "lucide-react";
import { useState } from "react";

import Button from "../button/Button";
import Input from "../input/InputField";

import { Modal } from "./index";

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (confirmationPhrase: string) => void;
  loading?: boolean;
}

export const DeleteAccountModal = ({
  isOpen,
  onClose,
  onConfirm,
  loading = false,
}: DeleteAccountModalProps) => {
  const [confirmationPhrase, setConfirmationPhrase] = useState("");
  const [understoodChecked, setUnderstoodChecked] = useState(false);

  const handleClose = () => {
    if (loading) {
      return;
    }
    setConfirmationPhrase("");
    setUnderstoodChecked(false);
    onClose();
  };

  const handleConfirm = () => {
    if (loading) {
      return;
    }
    if (confirmationPhrase.trim() !== "Potwierdzam") {
      return;
    }
    if (!understoodChecked) {
      return;
    }
    onConfirm(confirmationPhrase.trim());
  };

  const canConfirm = confirmationPhrase.trim() === "Potwierdzam" && understoodChecked && !loading;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} showCloseButton={true} className="max-w-2xl">
      <div className="p-6">
        <div className="flex items-start gap-4 mb-5">
          <div className="flex-shrink-0 mt-1">
            <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-3xl font-semibold text-gray-900 dark:text-white mb-2">
              Usuń konto
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
              Ta operacja jest nieodwracalna. Wszystkie dane zostaną trwale usunięte.
            </p>
          </div>
        </div>

        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
            Konsekwencje usunięcia konta:
          </p>
          <ul className="text-sm text-red-700 dark:text-red-300 list-disc list-inside space-y-1">
            <li>
              Twoje konto, profil, galerie, zdjęcia, klienci i pakiety zostaną zaplanowane do
              trwałego usunięcia
            </li>
            <li>Galerie klientów będą zachowane do momentu ich wygaśnięcia</li>
            <li>
              Dane finansowe (saldo portfela, transakcje i faktury) zostaną zachowane zgodnie z
              wymogami prawnymi
            </li>
            <li>Masz 3 dni na anulowanie tej operacji</li>
          </ul>
        </div>

        <div className="mb-6">
          <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-2">
            Potwierdź wpisując "Potwierdzam"
          </label>
          <Input
            type="text"
            placeholder="Potwierdzam"
            value={confirmationPhrase}
            onChange={(e) => setConfirmationPhrase(e.target.value)}
            disabled={loading}
            required
          />
        </div>

        <div className="mb-6">
          <label className="flex items-start cursor-pointer group">
            <div className="relative flex items-center justify-center flex-shrink-0 mt-0.5">
              <input
                type="checkbox"
                checked={understoodChecked}
                onChange={(e) => !loading && setUnderstoodChecked(e.target.checked)}
                disabled={loading}
                className="sr-only"
              />
              <div
                className={`w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                  understoodChecked
                    ? "bg-red-600 border-red-600 dark:bg-red-500 dark:border-red-500"
                    : `bg-white border-gray-300 dark:bg-gray-700 dark:border-gray-600${loading ? "" : " group-hover:border-red-500 dark:group-hover:border-red-400"}`
                }`}
              >
                {understoodChecked && (
                  <svg
                    className="w-3.5 h-3.5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </div>
            </div>
            <span className="ml-3 text-base text-gray-700 dark:text-gray-300">
              Rozumiem, że ta operacja jest trwała i nieodwracalna
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={handleClose} disabled={loading}>
            Anuluj
          </Button>
          <Button variant="danger" onClick={handleConfirm} disabled={!canConfirm}>
            {loading ? "Usuwanie..." : "Usuń konto"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
