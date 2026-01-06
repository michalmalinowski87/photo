import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";

import Button from "../../../components/ui/button/Button";
import api from "../../../lib/api-service";

// Prevent static generation - this page uses client hooks
export const dynamic = "force-dynamic";

type Status = "processing" | "success" | "error";

export default function UndoDeletion() {
  const router = useRouter();
  const { token } = router.query;
  const [status, setStatus] = useState<Status>("processing");
  const [error, setError] = useState<string>("");
  const [countdown, setCountdown] = useState(5);
  const [minProcessingTimeElapsed, setMinProcessingTimeElapsed] = useState(false);

  useEffect(() => {
    // Ensure minimum 3 seconds processing time
    const processingTimer = setTimeout(() => {
      setMinProcessingTimeElapsed(true);
    }, 3000);

    return () => clearTimeout(processingTimer);
  }, []);

  useEffect(() => {
    if (!token || typeof token !== "string") {
      return;
    }

    const processUndoDeletion = async () => {
      try {
        // Wait for minimum processing time
        if (!minProcessingTimeElapsed) {
          await new Promise((resolve) => {
            const checkInterval = setInterval(() => {
              if (minProcessingTimeElapsed) {
                clearInterval(checkInterval);
                resolve(undefined);
              }
            }, 100);
          });
        }

        // Call the backend API
        await api.auth.undoDeletion(token);
        setStatus("success");

        // Start countdown
        const countdownInterval = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(countdownInterval);
              void router.push("/login");
              return 0;
            }
            return prev - 1;
          });
        }, 1000);

        return () => clearInterval(countdownInterval);
      } catch (err: any) {
        setStatus("error");
        const errorMessage =
          err?.body?.error ||
          err?.message ||
          "Nie udało się anulować usunięcia konta. Token może być nieprawidłowy lub wygasły.";
        setError(errorMessage);
      }
    };

    void processUndoDeletion();
  }, [token, minProcessingTimeElapsed, router]);

  const handleGoToLogin = () => {
    void router.push("/login");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center mb-8">
          <Link href="/login" className="flex items-center gap-x-2">
            <span className="text-xl font-bold" style={{ color: "#465fff" }}>
              PhotoCloud
            </span>
          </Link>
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-8">
          {status === "processing" && (
            <div className="text-center">
              <div className="flex justify-center mb-6">
                <Loader2 className="w-16 h-16 text-blue-600 dark:text-blue-400 animate-spin" />
              </div>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                Przetwarzanie żądania...
              </h1>
              <p className="text-base text-gray-600 dark:text-gray-400">
                Anulowanie usunięcia konta w toku. Proszę czekać.
              </p>
            </div>
          )}

          {status === "success" && (
            <div className="text-center">
              <div className="flex justify-center mb-6">
                <CheckCircle2 className="w-16 h-16 text-green-600 dark:text-green-400" />
              </div>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                Usunięcie konta zostało anulowane
              </h1>
              <p className="text-base text-gray-600 dark:text-gray-400 mb-6">
                Twoje konto pozostaje aktywne i możesz z niego normalnie korzystać.
              </p>
              <div className="mb-6">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Przekierowanie do strony logowania za {countdown} sekund{countdown !== 1 ? "y" : "ę"}...
                </p>
                <Button variant="primary" onClick={handleGoToLogin} className="w-full">
                  Przejdź do logowania
                </Button>
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="text-center">
              <div className="flex justify-center mb-6">
                <AlertCircle className="w-16 h-16 text-red-600 dark:text-red-400" />
              </div>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                Nie udało się anulować usunięcia
              </h1>
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
              </div>
              <div className="space-y-3">
                <Button variant="primary" onClick={handleGoToLogin} className="w-full">
                  Przejdź do logowania
                </Button>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Jeśli problem nadal występuje, skontaktuj się z pomocą techniczną.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

