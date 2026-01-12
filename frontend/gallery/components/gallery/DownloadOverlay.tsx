"use client";

import { X } from "lucide-react";

interface DownloadOverlayProps {
  isVisible: boolean;
  isError?: boolean;
  errorMessage?: string;
  onClose: () => void;
}

export function DownloadOverlay({
  isVisible,
  isError = false,
  errorMessage,
  onClose,
}: DownloadOverlayProps) {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/80 backdrop-blur-md">
      {isError ? (
        <div className="flex flex-col items-center justify-center text-center px-4">
          <div className="flex items-center gap-4 mb-6">
            <h2 className="text-2xl font-semibold text-white">
              Błąd pobierania
            </h2>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white transition-colors p-1 rounded-md hover:bg-white/10"
              aria-label="Zamknij"
            >
              <X size={24} />
            </button>
          </div>
          <p className="text-white/80 mb-6 max-w-md">
            {errorMessage ||
              "Wystąpił błąd podczas pobierania zdjęcia. Spróbuj ponownie."}
          </p>
          <button
            onClick={onClose}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            Zamknij
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center text-center px-4">
          <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin mb-6" />
          <h2 className="text-2xl font-semibold text-white mb-2">
            Przygotowywanie pobierania
          </h2>
          <p className="text-white/80">
            Pobieranie powinno rozpocząć się wkrótce...
          </p>
        </div>
      )}
    </div>
  );
}
