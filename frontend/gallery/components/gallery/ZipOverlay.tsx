"use client";

interface ZipStatus {
  status?: "ready" | "generating" | "not_started";
  generating?: boolean;
  ready?: boolean;
  zipExists?: boolean;
  zipSize?: number;
  elapsedSeconds?: number;
  progress?: {
    processed: number;
    total: number;
    percent: number;
  };
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
  const progress = zipStatus?.progress;
  const processed = progress?.processed || 0;
  const total = progress?.total || totalPhotos;
  const percent = progress?.percent || 0;
  const elapsedSeconds = zipStatus?.elapsedSeconds || 0;

  // Estimate time remaining based on progress
  const estimateTimeRemaining = () => {
    if (!isGenerating || processed === 0 || total === 0) {
      // Rough estimate: ~0.5-1 second per photo
      const estimatedSeconds = Math.max(10, Math.ceil(totalPhotos * 0.75));
      if (estimatedSeconds < 60) {
        return `około ${estimatedSeconds} sekund`;
      }
      const minutes = Math.ceil(estimatedSeconds / 60);
      return `około ${minutes} ${minutes === 1 ? "minutę" : minutes < 5 ? "minuty" : "minut"}`;
    }

    const rate = processed / elapsedSeconds; // photos per second
    if (rate === 0) return "obliczanie...";
    
    const remaining = total - processed;
    const estimatedSeconds = Math.ceil(remaining / rate);
    
    if (estimatedSeconds < 60) {
      return `około ${estimatedSeconds} sekund`;
    }
    const minutes = Math.ceil(estimatedSeconds / 60);
    return `około ${minutes} ${minutes === 1 ? "minutę" : minutes < 5 ? "minuty" : "minut"}`;
  };

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
              Przygotowujemy archiwum ZIP z Twoimi zdjęciami. To może chwilę potrwać.
            </p>
            
            {progress && total > 0 && (
              <div className="w-full mb-4">
                <div className="flex justify-between text-sm text-white/60 mb-2">
                  <span>
                    {processed} / {total} zdjęć
                  </span>
                  <span>{Math.round(percent)}%</span>
                </div>
                <div className="w-full bg-white/20 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-white h-full transition-all duration-300"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            )}

            <p className="text-white/70 text-sm mb-6">
              Szacowany czas: {estimateTimeRemaining()}
            </p>

            <p className="text-white/60 text-xs">
              Możesz zamknąć to okno - pobieranie rozpocznie się automatycznie, gdy plik będzie gotowy.
            </p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin mb-6" />
            <h2 className="text-2xl font-semibold text-white mb-4">
              Przygotowywanie ZIP
            </h2>
            <p className="text-white/80 mb-6">
              Rozpoczynamy generowanie archiwum ZIP. To może chwilę potrwać.
            </p>
            <p className="text-white/60 text-xs">
              Możesz zamknąć to okno - pobieranie rozpocznie się automatycznie, gdy plik będzie gotowy.
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
