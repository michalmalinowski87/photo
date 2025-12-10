import { AlertTriangle, Image as ImageIcon } from "lucide-react";
import { useRouter } from "next/router";

interface NoPhotosUploadedBannerProps {
  galleryId: string;
}

export const NoPhotosUploadedBanner = ({ galleryId }: NoPhotosUploadedBannerProps) => {
  const router = useRouter();

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-5 mb-6 border border-amber-200 dark:border-amber-800/30">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" strokeWidth={2} />
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
            <ImageIcon className="w-5 h-5" strokeWidth={2} />
            <span>Przejdź do zdjęć</span>
          </button>
        </div>
      </div>
    </div>
  );
};
