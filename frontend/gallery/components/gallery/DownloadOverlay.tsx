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
    <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-background rounded-lg shadow-2xl p-8 max-w-md w-full mx-4 border border-border">
        {isError ? (
          <>
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-2xl font-semibold text-foreground">
                Błąd pobierania
              </h2>
              <button
                onClick={onClose}
                className="text-foreground/60 hover:text-foreground transition-colors p-1 rounded-md hover:bg-background/50"
                aria-label="Zamknij"
              >
                <X size={24} />
              </button>
            </div>
            <p className="text-foreground/80 mb-6">
              {errorMessage ||
                "Wystąpił błąd podczas pobierania zdjęcia. Spróbuj ponownie."}
            </p>
            <button
              onClick={onClose}
              className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              Zamknij
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-6" />
              <h2 className="text-2xl font-semibold text-foreground mb-2">
                Przygotowywanie pobierania
              </h2>
              <p className="text-foreground/80">
                Pobieranie powinno rozpocząć się wkrótce...
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
