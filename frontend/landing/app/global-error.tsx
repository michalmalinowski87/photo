"use client";

/**
 * Catches errors in the root layout. Must define its own <html> and <body>;
 * it replaces the root layout when triggered.
 */
export default function GlobalError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pl">
      <body className="min-h-screen bg-white font-sans antialiased flex items-center justify-center overflow-x-hidden">
        <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16 text-gray-900">
          <div className="text-center max-w-md">
            <h1 className="text-4xl font-bold mb-4">Oops!</h1>
            <h2 className="text-2xl font-semibold mb-4">Coś poszło nie tak</h2>
            <p className="text-gray-600 mb-8">
              Wystąpił nieoczekiwany błąd. Spróbuj ponownie później.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => reset()}
                className="px-6 py-3 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Spróbuj ponownie
              </button>
              <a
                href="/"
                className="inline-block px-6 py-3 bg-[#8B6F57] text-white rounded-lg hover:opacity-90 transition-opacity"
              >
                Strona główna
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
