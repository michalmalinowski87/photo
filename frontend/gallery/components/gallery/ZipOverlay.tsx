"use client";

interface ZipStatus {
  status?: "ready" | "generating" | "not_started";
  generating?: boolean;
  ready?: boolean;
  zipExists?: boolean;
  zipSize?: number;
}

interface ZipOverlayProps {
  isVisible: boolean;
  zipStatus?: ZipStatus;
  totalPhotos?: number;
  onClose: () => void;
}

export function ZipOverlay({
  isVisible,
  zipStatus,
  totalPhotos = 0,
  onClose,
}: ZipOverlayProps) {
  if (!isVisible) return null;

  const isGenerating = zipStatus?.generating || false;

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/80 backdrop-blur-md">
      <div className="flex flex-col items-center justify-center text-center px-4 max-w-md">
        {isGenerating ? (
          <>
            <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin mb-6" />
            <h2 className="text-2xl font-semibold text-white mb-4">
              Generowanie ZIP
            </h2>
            <p className="text-white/80 mb-4">
              Przygotowujemy archiwum ZIP z Twoimi zdjęciami. To może chwilę potrwać, w zależności od liczby zdjęć w pakiecie.
            </p>
            <p className="text-white/70 text-sm mb-6">
              W międzyczasie możesz pobrać swoje ulubione zdjęcia za pomocą przycisku pobierania znajdującego się w prawym górnym rogu każdego zdjęcia (lub nad zdjęciem w widoku karuzeli).
            </p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin mb-6" />
            <h2 className="text-2xl font-semibold text-white mb-4">
              Przygotowywanie ZIP
            </h2>
            <p className="text-white/80 mb-6">
              Archiwum ZIP jest przygotowywane. Jeśli zostało właśnie dostarczone dużo zdjęć, wygenerowanie ZIP może chwilę potrwać, w zależności od liczby zdjęć w pakiecie.
            </p>
            <p className="text-white/70 text-sm mb-6">
              W międzyczasie możesz pobrać swoje ulubione zdjęcia za pomocą przycisku pobierania znajdującego się w prawym górnym rogu każdego zdjęcia (lub nad zdjęciem w widoku karuzeli).
            </p>
          </>
        )}

        <button
          onClick={onClose}
          className="mt-6 px-6 py-2 text-white border border-white/30 rounded hover:bg-white/10 transition-colors"
        >
          Zamknij
        </button>
      </div>
    </div>
  );
}
