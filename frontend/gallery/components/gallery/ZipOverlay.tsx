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
  totalBytes?: number;
  onClose: () => void;
}

export function ZipOverlay({
  isVisible,
  zipStatus,
  totalPhotos = 0,
  totalBytes,
  onClose,
}: ZipOverlayProps) {
  if (!isVisible) return null;

  const isGenerating = zipStatus?.generating || false;
  const progress = zipStatus?.progress;
  const processed = progress?.processed || 0;
  const total = progress?.total || totalPhotos;
  const percent = progress?.percent || 0;
  const elapsedSeconds = zipStatus?.elapsedSeconds || 0;

  const formatDurationShort = (seconds: number) => {
    const sec = Math.max(0, Math.round(seconds));
    if (sec < 60) return `${sec} s`;
    const minutes = Math.round(sec / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours} h ${mins} min` : `${hours} h`;
  };

  const estimateEtaRangeSeconds = (): { minSeconds: number; maxSeconds: number } | null => {
    const safeTotalPhotos = Math.max(0, totalPhotos || 0);
    const safeTotalBytes = typeof totalBytes === "number" && totalBytes > 0 ? totalBytes : undefined;

    // If we have progress + elapsed time, use it as the primary ETA signal.
    if (isGenerating && processed > 0 && total > 0 && elapsedSeconds > 0) {
      const rate = processed / elapsedSeconds; // photos per second
      if (rate > 0) {
        const remaining = Math.max(0, total - processed);
        const remainingSeconds = remaining / rate;
        const minSeconds = Math.max(10, Math.floor(remainingSeconds * 0.7));
        const maxSeconds = Math.max(minSeconds + 10, Math.ceil(remainingSeconds * 1.3));
        return { minSeconds, maxSeconds };
      }
    }

    // Otherwise, estimate from total size (preferred) or photo count fallback.
    // These min/max bounds are intentionally conservative to set expectations.
    if (safeTotalBytes !== undefined) {
      const MB = 1024 * 1024;
      const throughputMinMBps = 3; // worst-case
      const throughputMaxMBps = 12; // best-case

      const bytesSecondsMin = safeTotalBytes / (throughputMaxMBps * MB);
      const bytesSecondsMax = safeTotalBytes / (throughputMinMBps * MB);

      // Overhead per photo (listing, ZIP entries, multipart completion, etc.)
      const overheadSeconds = Math.min(90, safeTotalPhotos * 0.15);

      const minSeconds = Math.max(10, Math.round(bytesSecondsMin + overheadSeconds));
      const maxSeconds = Math.max(minSeconds + 10, Math.round(bytesSecondsMax + overheadSeconds));
      return { minSeconds, maxSeconds };
    }

    if (safeTotalPhotos > 0) {
      const perPhotoMin = 0.2;
      const perPhotoMax = 1.0;
      const minSeconds = Math.max(10, Math.round(safeTotalPhotos * perPhotoMin));
      const maxSeconds = Math.max(minSeconds + 10, Math.round(safeTotalPhotos * perPhotoMax));
      return { minSeconds, maxSeconds };
    }

    return null;
  };

  const eta = estimateEtaRangeSeconds();
  const etaLabel =
    eta === null
      ? "obliczanie..."
      : eta.maxSeconds - eta.minSeconds <= 15
      ? `około ${formatDurationShort(eta.maxSeconds)}`
      : `${formatDurationShort(eta.minSeconds)}–${formatDurationShort(eta.maxSeconds)}`;

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
              Szacowany czas: {etaLabel}
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
              Archiwum ZIP jest przygotowywane. Jeśli zostało właśnie dostarczone dużo zdjęć, wygenerowanie ZIP może chwilę potrwać.
            </p>
            <p className="text-white/70 text-sm mb-6">
              Szacowany czas: {etaLabel}
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
