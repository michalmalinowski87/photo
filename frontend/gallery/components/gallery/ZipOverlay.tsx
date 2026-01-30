"use client";

interface ZipStatus {
  status?: "ready" | "generating" | "not_started" | "error";
  generating?: boolean;
  ready?: boolean;
  zipExists?: boolean;
  zipSize?: number;
  error?: {
    message: string;
    attempts: number;
    canRetry: boolean;
  };
}

interface ZipOverlayProps {
  isVisible: boolean;
  zipStatus?: ZipStatus;
  totalPhotos?: number;
  onClose: () => void;
  /** Called when user clicks "Pobierz ZIP" in the ready state. When omitted, ready state still shows but button is hidden or no-op. */
  onDownloadZip?: () => void;
}

export function ZipOverlay({
  isVisible,
  zipStatus,
  totalPhotos = 0,
  onClose,
  onDownloadZip,
}: ZipOverlayProps) {
  if (!isVisible) return null;

  const isGenerating = zipStatus?.generating || false;
  const isReady = zipStatus?.ready === true || zipStatus?.status === "ready";
  const hasError = zipStatus?.status === "error";
  const errorInfo = zipStatus?.error;

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/80 backdrop-blur-md">
      <div className="flex flex-col items-center justify-center text-center px-4 max-w-md">
        {hasError ? (
          <>
            <div className="w-16 h-16 border-4 border-red-500 rounded-full flex items-center justify-center mb-6">
              <svg
                className="w-8 h-8 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-white mb-4">Brak pliku ZIP</h2>
            <p className="text-white/80 mb-4">
              Niestety, automatyczne generowanie pliku ZIP nie powiodło się. Prosimy o kontakt z
              fotografem, aby uzyskać pomoc w pobraniu zdjęć.
            </p>
            <p className="text-white/80 text-sm mb-6">
              W międzyczasie możesz pobrać swoje ulubione zdjęcia za pomocą przycisku pobierania
              w prawym górnym rogu każdego zdjęcia.
            </p>
          </>
        ) : isReady ? (
          <>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6 bg-white/10 border border-white/20">
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-white mb-4">ZIP gotowy do pobrania</h2>
            <p className="text-white/80 mb-6">
              Archiwum ZIP z Twoimi zdjęciami jest gotowe. Kliknij poniżej, aby je pobrać.
            </p>
            {onDownloadZip && (
              <button
                onClick={onDownloadZip}
                className="mb-4 h-[56px] py-2 px-6 uppercase text-base touch-manipulation min-w-[44px] flex items-center justify-center whitespace-nowrap gap-2 text-white hover:text-white/90 transition-colors font-semibold"
                style={{ letterSpacing: "0.05em" }}
                aria-label="Pobierz ZIP"
              >
                <svg
                  className="w-5 h-5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                <span>Pobierz ZIP</span>
              </button>
            )}
          </>
        ) : isGenerating ? (
          <>
            <div className="flex items-center gap-2 mb-6">
              <div
                className="w-2 h-2 bg-white rounded-full animate-pulse"
                style={{ animationDelay: "0s" }}
              />
              <div
                className="w-2 h-2 bg-white/80 rounded-full animate-pulse"
                style={{ animationDelay: "0.2s" }}
              />
              <div
                className="w-2 h-2 bg-white/60 rounded-full animate-pulse"
                style={{ animationDelay: "0.4s" }}
              />
            </div>
            <h2 className="text-2xl font-semibold text-white mb-4">Generowanie ZIP</h2>
            <p className="text-white/80 mb-4">
              Przygotowujemy ZIP z Twoimi zdjęciami. To może chwilę potrwać, w zależności od liczby
              zdjęć w pakiecie.
            </p>
            <p className="text-white/70 text-sm mb-6">
              W międzyczasie możesz pobrać swoje ulubione zdjęcia za pomocą przycisku
              znajdującego się w prawym górnym rogu każdego zdjęcia (lub nad zdjęciem w widoku
              karuzeli).
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-6">
              <div
                className="w-2 h-2 bg-white rounded-full animate-pulse"
                style={{ animationDelay: "0s" }}
              />
              <div
                className="w-2 h-2 bg-white/80 rounded-full animate-pulse"
                style={{ animationDelay: "0.2s" }}
              />
              <div
                className="w-2 h-2 bg-white/60 rounded-full animate-pulse"
                style={{ animationDelay: "0.4s" }}
              />
            </div>
            <h2 className="text-2xl font-semibold text-white mb-4">Przygotowywanie ZIP</h2>
            <p className="text-white/80 mb-6">
              Archiwum ZIP jest przygotowywane. Jeśli zostało właśnie dostarczone dużo zdjęć,
              wygenerowanie ZIP może chwilę potrwać, w zależności od liczby zdjęć w pakiecie.
            </p>
            <p className="text-white/70 text-sm mb-6">
              W międzyczasie możesz pobrać swoje ulubione zdjęcia za pomocą przycisku pobierania
              znajdującego się w prawym górnym rogu każdego zdjęcia (lub nad zdjęciem w widoku
              karuzeli).
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
