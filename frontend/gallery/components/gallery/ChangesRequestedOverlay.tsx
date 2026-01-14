"use client";

import { X } from "lucide-react";

interface ChangesRequestedOverlayProps {
  isVisible: boolean;
  onClose: () => void;
  onCancelRequest: () => void;
}

export function ChangesRequestedOverlay({
  isVisible,
  onClose,
  onCancelRequest,
}: ChangesRequestedOverlayProps) {
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
        <div className="flex items-start justify-between mb-6">
          <h2 className="text-2xl font-bold">Zmiany zgłoszone</h2>
          <button
            onClick={onClose}
            className="h-11 w-11 rounded-full flex items-center justify-center bg-gray-100 hover:bg-gray-200 transition-colors touch-manipulation"
            aria-label="Zamknij"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="space-y-4 mb-6">
          <p>
            Zgłosiłeś prośbę o zmiany — fotograf został poinformowany.
          </p>
          <p>
            W tym trybie możesz tylko przeglądać zdjęcia i swój aktualny wybór — nie możesz wprowadzać zmian. 
            Aby edytować ponownie, anuluj prośbę. To chroni pracę fotografa na wypadek, gdyby edycja już się rozpoczęła.
          </p>
          <p className="text-sm text-gray-600">
            Dziękujemy za zrozumienie!
          </p>
        </div>

        <div className="flex gap-4 justify-end">
          <button
            onClick={onCancelRequest}
            className="btn-primary touch-manipulation min-h-[44px]"
            aria-label="Anuluj prośbę o zmiany"
          >
            Anuluj prośbę
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2 text-gray-600 hover:text-gray-900 transition-colors touch-manipulation min-h-[44px]"
            aria-label="Zamknij"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}
