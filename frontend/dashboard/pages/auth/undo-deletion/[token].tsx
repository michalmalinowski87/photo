import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";

import Button from "../../../components/ui/button/Button";
import { Loading } from "../../../components/ui/loading/Loading";
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
        // Extract user-friendly error message
        let errorMessage = "";
        
        if (err?.body?.error) {
          const backendError = err.body.error;
          if (backendError.includes("Invalid or expired token")) {
            errorMessage = "Link jest nieprawidłowy lub wygasł. Sprawdź, czy używasz najnowszego linku z emaila.";
          } else if (backendError.includes("already been processed")) {
            errorMessage = "Usunięcie konta zostało już przetworzone i nie może być anulowane.";
          } else if (!backendError.includes("Nie udało się anulować usunięcia konta")) {
            errorMessage = backendError;
          }
        } else if (err?.message && !err.message.includes("refresh token") && !err.message.includes("Nie udało się anulować usunięcia konta")) {
          errorMessage = err.message;
        }
        
        setError(errorMessage);
      }
    };

    void processUndoDeletion();
  }, [token, minProcessingTimeElapsed, router]);

  const handleGoToLogin = () => {
    void router.push("/login");
  };

  return (
    <div className="flex flex-col items-center max-w-sm mx-auto h-dvh overflow-hidden justify-center px-4 -mt-16">
      <div className="flex items-center w-full py-8 border-b border-border/80 mb-8">
        <Link href="/login" className="flex items-center gap-x-2">
          <span className="text-xl font-bold text-brand-500">
            PhotoCloud
          </span>
        </Link>
      </div>

      <div className="flex flex-col w-full items-center">
        <div className="w-full" style={{ minHeight: "160px", width: "352px" }}>
          {status === "processing" && (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="mb-6">
                <Loading size="lg" />
              </div>
              <h2 className="text-2xl font-semibold mb-2 text-foreground">Przetwarzanie żądania...</h2>
              <p className="text-sm text-muted-foreground text-center">
                Anulowanie usunięcia konta w toku. Proszę czekać.
              </p>
            </div>
          )}

          {status === "success" && (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="mb-6">
                <CheckCircle2 className="w-16 h-16 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-2xl font-semibold mb-2 text-foreground">
                Usunięcie konta zostało anulowane
              </h2>
              <p className="text-sm text-muted-foreground text-center mb-6">
                Twoje konto pozostaje aktywne i możesz z niego normalnie korzystać.
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="mb-6">
                <AlertCircle className="w-16 h-16 text-error-400" />
              </div>
              <h2 className="text-2xl font-semibold mb-2 text-foreground">
                Nie udało się anulować usunięcia
              </h2>
              {error && (
                <p className="text-sm text-muted-foreground text-center mt-2">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        {status === "success" && (
          <>
            <div className="mb-6 p-4 bg-green-500/15 border border-green-700 rounded text-sm text-green-400 text-center w-full max-w-[352px]">
              Przekierowanie do strony logowania za {countdown} sekund{countdown !== 1 ? "y" : "ę"}...
            </div>
            <Button variant="primary" onClick={handleGoToLogin} className="w-full max-w-[352px]">
              Przejdź do logowania
            </Button>
          </>
        )}

        {status === "error" && (
          <>
            <Button variant="primary" onClick={handleGoToLogin} className="w-full max-w-[352px] mb-4">
              Przejdź do logowania
            </Button>
            <p className="text-sm text-muted-foreground text-center w-full max-w-[352px]">
              Jeśli problem nadal występuje, skontaktuj się z pomocą techniczną.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

