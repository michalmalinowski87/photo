import { useRouter } from "next/router";

interface NoPhotosUploadedBannerProps {
  galleryId: string;
}

export const NoPhotosUploadedBanner: React.FC<NoPhotosUploadedBannerProps> = ({ galleryId }) => {
  const router = useRouter();

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-5 mb-6 border border-amber-200 dark:border-amber-800/30">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40">
          <svg
            className="w-5 h-5 text-amber-600 dark:text-amber-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            Brak przesłanych zdjęć
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
            Prześlij zdjęcia, aby system mógł wybrać optymalny plan dla Twojej galerii.
          </p>
          <ol className="list-decimal list-inside text-sm text-gray-700 dark:text-gray-300 space-y-1 mb-4">
            <li>Przejdź do sekcji zdjęć w galerii</li>
            <li>Prześlij zdjęcia do galerii</li>
            <li>Po przesłaniu zdjęć opublikuj galerię i wybierz plan</li>
          </ol>
          <button
            onClick={() => router.push(`/galleries/${galleryId}/photos`)}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 px-6 py-3 text-white font-semibold transition-colors shadow-sm hover:shadow-md"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span>Przejdź do zdjęć</span>
          </button>
        </div>
      </div>
    </div>
  );
};
