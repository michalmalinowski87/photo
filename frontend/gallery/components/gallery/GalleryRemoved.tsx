"use client";

import { useRouter } from "next/navigation";
import { getPublicLandingUrl } from "@/lib/public-env";

/**
 * Shown when a gallery has been removed (getPublicInfo or clientLogin returns 404).
 * Informs the user to contact their photographer and provides a button to the main landing page.
 */
export function GalleryRemoved() {
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
      <div className="max-w-2xl w-full text-center space-y-8">
        <div className="flex justify-center">
          <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center">
            <svg
              className="w-12 h-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
        </div>

        <div className="space-y-4">
          <h1 className="text-3xl md:text-4xl font-semibold text-gray-900">
            Galeria została usunięta
          </h1>
          <p className="text-lg md:text-xl text-gray-600 leading-relaxed">
            Ta galeria nie jest już dostępna. Jeśli potrzebujesz dostępu do zdjęć lub masz
            pytania, skontaktuj się ze swoim fotografem.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-base text-gray-600">
            Dziękujemy za korzystanie z <span className="font-semibold">PhotoCloud</span>.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
          <button
            onClick={handleGoToMainPage}
            className="btn-primary touch-manipulation min-h-[44px] px-8 w-full sm:w-auto"
            aria-label="Przejdź do strony głównej"
          >
            Przejdź do strony głównej
          </button>
          <p className="text-sm text-gray-500 sm:ml-4">
            lub zamknij tę kartę
          </p>
        </div>
      </div>
    </div>
  );
}
