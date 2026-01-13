"use client";

interface DownloadOverlayProps {
  isVisible: boolean;
  isError?: boolean;
  onClose: () => void;
}

export function DownloadOverlay({
  isVisible,
  isError = false,
  onClose,
}: DownloadOverlayProps) {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/80 backdrop-blur-md">
      {isError ? (
        <div className="flex flex-col items-center justify-center text-center px-4">
          <h2 className="text-2xl font-semibold text-white mb-4">
            Błąd pobierania
          </h2>
          <p className="text-white/80 mb-8 max-w-md">
            Nie udało się pobrać zdjęcia. Spróbuj ponownie później. Jeśli problem będzie się powtarzał, skontaktuj się z fotografem.
          </p>
          <button
            onClick={onClose}
            className="btn-primary"
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
