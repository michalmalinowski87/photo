"use client";

import { hapticFeedback } from "@/utils/hapticFeedback";

interface ChangeRequestCanceledOverlayProps {
  isVisible: boolean;
  onClose: () => void;
}

export function ChangeRequestCanceledOverlay({
  isVisible,
  onClose,
}: ChangeRequestCanceledOverlayProps) {
  if (!isVisible) return null;

  return (
    <div
      className="fixed inset-0 z-[100001] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 md:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Prośba anulowana</h2>
          <div className="mt-4 h-px w-full bg-gray-200" />
        </div>
        
        <div className="space-y-4 mb-6">
          <p className="text-lg font-medium text-gray-900">
            Twoja prośba o zmiany została anulowana. Wybór został ponownie zatwierdzony.
          </p>
          <p className="text-base text-gray-600 leading-relaxed">
            Fotograf został poinformowany, że akceptujesz obecny wybór zdjęć. W tym trybie możesz tylko przeglądać zdjęcia — nie możesz wprowadzać zmian.
          </p>
        </div>

        <div className="flex gap-4 justify-end">
          <button
            onClick={() => {
              hapticFeedback('light');
              onClose();
            }}
            className="btn-primary touch-manipulation min-h-[44px]"
            aria-label="Zamknij"
          >
            Rozumiem
          </button>
        </div>
      </div>
    </div>
  );
}
