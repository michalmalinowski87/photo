"use client";

import { useRouter } from "next/navigation";
import { getPublicLandingUrl } from "@/lib/public-env";

interface GalleryLoadErrorProps {
  onRetry?: () => void;
}

export function GalleryLoadError({ onRetry }: GalleryLoadErrorProps) {
  const router = useRouter();

  const handleGoToMainPage = () => {
    if (typeof window !== "undefined") {
      const landingUrl = getPublicLandingUrl();
      if (landingUrl.startsWith("http")) {
        window.location.href = landingUrl;
      } else {
        router.push(landingUrl);
      }
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-16">
      <div className="max-w-2xl w-full text-center space-y-6">
        <h1 className="text-4xl font-bold text-gray-900">Oops!</h1>
        <h2 className="text-2xl font-semibold text-gray-800">Coś poszło nie tak</h2>
        <p className="text-lg text-gray-600">
          Nie udało się załadować galerii. Spróbuj ponownie później.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-4">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-6 py-3 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Spróbuj ponownie
            </button>
          )}
          <button
            type="button"
            onClick={handleGoToMainPage}
            className="px-6 py-3 bg-primary text-white rounded-lg hover:opacity-90 transition-opacity"
          >
            Strona główna
          </button>
        </div>
      </div>
    </div>
  );
}
