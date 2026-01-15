"use client";

import { hapticFeedback } from "@/utils/hapticFeedback";

interface ChangeRequestSubmittedOverlayProps {
  isVisible: boolean;
  onClose: () => void;
  onCancelRequest?: () => void;
}

export function ChangeRequestSubmittedOverlay({
  isVisible,
  onClose,
  onCancelRequest,
}: ChangeRequestSubmittedOverlayProps) {
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
          <h2 className="text-2xl font-bold text-gray-900">Prośba o zmiany zgłoszona</h2>
          <div className="mt-4 h-px w-full bg-gray-200" />
        </div>
        
        <div className="space-y-4 mb-6">
          <p className="text-lg font-medium text-gray-900">
            Fotograf został poinformowany, że chcesz wprowadzić zmiany w wyborze zdjęć.
          </p>
          <div className="space-y-3 text-base text-gray-600 leading-relaxed">
            <p>
              <strong>Co dalej?</strong>
            </p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>Fotograf otrzyma powiadomienie o Twojej prośbie</li>
              <li>Nie możesz jeszcze wprowadzać zmian</li>
              <li>Fotograf przeanalizuje Twoją prośbę i po akceptacji, możesz wprowadzić zmiany</li>
            </ul>
            <p className="pt-2">
              <strong>Możesz anulować prośbę w dowolnym momencie</strong> — użyj przycisku "ANULUJ PROŚBĘ" w menu.
            </p>
          </div>
        </div>

        <div className="flex gap-4 justify-end">
          {onCancelRequest && (
            <button
              onClick={() => {
                hapticFeedback('medium');
                // Keep this modal visible; the loading overlay will cover it.
                // Parent will swap modals on success (no page flash / no double modals).
                onCancelRequest();
              }}
              className="px-6 py-2 text-gray-600 hover:text-gray-900 transition-colors touch-manipulation min-h-[44px]"
              aria-label="Anuluj prośbę o zmiany"
            >
              Anuluj prośbę
            </button>
          )}
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
