import React, { useState, useEffect } from "react";

import Button from "../button/Button";
import { Modal } from "../modal";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (suppressChecked?: boolean) => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "info";
  loading?: boolean;
  suppressKey?: string; // localStorage key for suppressing the dialog
  onSuppressChange?: (suppressed: boolean) => void; // Callback when suppress option changes
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Potwierdź",
  cancelText = "Anuluj",
  variant = "danger",
  loading = false,
  suppressKey,
  onSuppressChange: _onSuppressChange,
}) => {
  const [suppressChecked, setSuppressChecked] = useState(false);

  // Reset checkbox state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSuppressChecked(false);
    }
  }, [isOpen]);

  const handleConfirm = () => {
    // Pass checkbox state to parent - parent will save suppression after successful completion
    // Don't reset checkbox state - keep it visible during loading
    onConfirm(suppressChecked);
  };

  const handleClose = () => {
    // Don't allow closing during loading
    if (loading) {
      return;
    }
    // Reset checkbox state when canceling (suppression is NOT saved)
    setSuppressChecked(false);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} showCloseButton={true} className="max-w-2xl">
      <div className="p-4">
        <h2 className="text-3xl font-semibold text-gray-900 dark:text-white mb-5">{title}</h2>

        <p className="text-lg text-gray-600 dark:text-gray-400 mb-6 whitespace-pre-line">
          {message}
        </p>

        {suppressKey && (
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
            <label
              className={`flex items-start ${loading ? "cursor-not-allowed opacity-60" : "cursor-pointer group"}`}
            >
              <div className="relative flex items-center justify-center flex-shrink-0 mt-0.5">
                <input
                  type="checkbox"
                  checked={suppressChecked}
                  onChange={(e) => !loading && setSuppressChecked(e.target.checked)}
                  disabled={loading}
                  className="sr-only"
                />
                <div
                  className={`w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                    suppressChecked
                      ? "bg-brand-600 border-brand-600 dark:bg-brand-500 dark:border-brand-500"
                      : `bg-white border-gray-300 dark:bg-gray-700 dark:border-gray-600${loading ? "" : " group-hover:border-brand-500 dark:group-hover:border-brand-400"}`
                  }`}
                >
                  {suppressChecked && (
                    <svg
                      className="w-3.5 h-3.5 text-white"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2.5"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path d="M5 13l4 4L19 7"></path>
                    </svg>
                  )}
                </div>
              </div>
              <span className="ml-3 text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
                Nie pokazuj tego przez następne 15 minut
              </span>
            </label>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={loading}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-500/10 border-red-300 dark:border-red-700"
          >
            {cancelText}
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={loading}
            className={
              variant === "danger"
                ? "bg-red-600 hover:bg-red-700 text-white"
                : variant === "warning"
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "bg-green-600 hover:bg-green-700 text-white"
            }
          >
            {loading ? "Przetwarzanie..." : confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
