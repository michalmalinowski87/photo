"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getPublicLandingUrl } from "@/lib/public-env";

export default function Error({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // Log to error reporting service (no raw error in UI)
  }, [_error]);

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
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-16">
      <div className="max-w-2xl w-full text-center space-y-6">
        <h1 className="text-4xl font-bold text-foreground">Oops!</h1>
        <h2 className="text-2xl font-semibold text-foreground/90">Coś poszło nie tak</h2>
        <p className="text-lg text-foreground/70">
          Wystąpił nieoczekiwany błąd. Spróbuj ponownie później.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-4">
          <button
            type="button"
            onClick={() => reset()}
            className="px-6 py-3 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors"
          >
            Spróbuj ponownie
          </button>
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
