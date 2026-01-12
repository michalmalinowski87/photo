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
            className="px-6 py-3 bg-[#8B6F57] text-white rounded font-bold text-base uppercase tracking-wider shadow-[0px_0px_1px_rgba(30,26,23,0.05),0px_2px_4px_rgba(30,26,23,0.08)] hover:bg-[#7A5F4A] hover:shadow-[0px_2px_4px_rgba(30,26,23,0.05),0px_8px_16px_rgba(30,26,23,0.08)] transition-all duration-300 ease-out active:scale-95 active:shadow-[0px_0px_1px_rgba(30,26,23,0.05),0px_0.5px_2px_rgba(30,26,23,0.08)]"
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
