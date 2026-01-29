"use client";

import { hapticFeedback } from "@/utils/hapticFeedback";

interface ErrorAlertOverlayProps {
  isVisible: boolean;
  title?: string;
  message: string;
  onClose: () => void;
}

export function ErrorAlertOverlay({
  isVisible,
  title = "Błąd",
  message,
  onClose,
}: ErrorAlertOverlayProps) {
  if (!isVisible) return null;

  return (
    <div
      className="fixed inset-0 z-[100001] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          <div className="mt-3 h-px w-full bg-gray-200" />
        </div>
        <p className="text-gray-700 mb-6 leading-relaxed">{message}</p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              hapticFeedback("light");
              onClose();
            }}
            className="btn-primary touch-manipulation min-h-[44px]"
            aria-label="Zamknij"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
