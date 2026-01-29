"use client";

import { getPublicLandingUrl } from "@/lib/public-env";

/**
 * Catches errors in the root layout. Must define its own <html> and <body>;
 * it replaces the root layout when triggered.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const handleGoToMainPage = () => {
    if (typeof window !== "undefined") {
      try {
        const landingUrl = getPublicLandingUrl();
        window.location.href = landingUrl.startsWith("http") ? landingUrl : landingUrl;
      } catch {
        window.location.href = "/";
      }
    }
  };

  return (
    <html lang="pl">
      <body className="min-h-screen bg-white font-sans antialiased flex items-center justify-center">
        <div className="min-h-screen flex items-center justify-center px-4 py-16">
          <div className="max-w-2xl w-full text-center space-y-6">
            <h1 className="text-4xl font-bold text-gray-900">Oops!</h1>
            <h2 className="text-2xl font-semibold text-gray-800">Coś poszło nie tak</h2>
            <p className="text-lg text-gray-600">
              Wystąpił nieoczekiwany błąd. Spróbuj ponownie później.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-4">
              <button
                type="button"
                onClick={() => reset()}
                className="px-6 py-3 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Spróbuj ponownie
              </button>
              <button
                type="button"
                onClick={handleGoToMainPage}
                className="px-6 py-3 bg-black text-white rounded-lg hover:opacity-90 transition-opacity"
              >
                Strona główna
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
