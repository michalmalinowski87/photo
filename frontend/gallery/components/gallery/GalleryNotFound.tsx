"use client";

import { useRouter } from "next/navigation";
import { getPublicLandingUrl } from "@/lib/public-env";

interface GalleryNotFoundProps {
  galleryId?: string;
}

export function GalleryNotFound({ galleryId }: GalleryNotFoundProps) {
  const router = useRouter();

  const handleGoToMainPage = () => {
    // Navigate to landing page or main site
    // Using window.location for external navigation if needed
    if (typeof window !== "undefined") {
      // Try to get the landing page URL from environment or use relative path
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
        {/* Icon/Illustration */}
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

        {/* Title */}
        <div className="space-y-4">
          <h1 className="text-3xl md:text-4xl font-semibold text-gray-900">
            Galeria nie została znaleziona
          </h1>
          <p className="text-lg md:text-xl text-gray-600 leading-relaxed">
            Niestety, galeria, której szukasz, nie jest już dostępna.
          </p>
        </div>

        {/* Explanation */}
        <div className="bg-gray-50 rounded-lg p-6 text-left space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Co mogło się stać?
          </h2>
          <ul className="space-y-2 text-gray-700">
            <li className="flex items-start">
              <span className="text-gray-400 mr-2">•</span>
              <span>Galeria mogła zostać usunięta przez właściciela</span>
            </li>
            <li className="flex items-start">
              <span className="text-gray-400 mr-2">•</span>
              <span>Link do galerii mógł wygasnąć</span>
            </li>
            <li className="flex items-start">
              <span className="text-gray-400 mr-2">•</span>
              <span>Galeria mogła zostać zarchiwizowana po zakończeniu projektu</span>
            </li>
            <li className="flex items-start">
              <span className="text-gray-400 mr-2">•</span>
              <span>Link, który otrzymałeś, mógł być nieprawidłowy lub nieaktualny</span>
            </li>
          </ul>
        </div>

        {/* Thank you message */}
        <div className="space-y-2">
          <p className="text-base text-gray-600">
            Dziękujemy za korzystanie z <span className="font-semibold">PixiProof</span>.
          </p>
          <p className="text-sm text-gray-500">
            Jeśli masz pytania lub potrzebujesz pomocy, skontaktuj się z właścicielem galerii.
          </p>
        </div>

        {/* Actions */}
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
