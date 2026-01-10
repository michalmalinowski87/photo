import { CheckCircle2, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import Button from "../../../components/ui/button/Button";
import { Loading } from "../../../components/ui/loading/Loading";

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

        // Call the backend API (public endpoint, no auth required)
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        if (!apiUrl) {
          throw new Error("API URL not configured");
        }

        const response = await fetch(`${apiUrl}/auth/undo-deletion/${token}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Request failed" })) as { error?: string };
          const errorObj = new Error("Request failed") as Error & { body: { error?: string }; status: number };
          errorObj.body = errorData;
          errorObj.status = response.status;
          throw errorObj;
        }

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
      } catch (err: unknown) {
        setStatus("error");
        // Extract user-friendly error message
        let errorMessage = "";

        const errorWithBody = err as { body?: { error?: string }; message?: string; status?: number } | null;
        if (errorWithBody?.body?.error) {
          const backendError = errorWithBody.body.error;
          if (backendError.includes("Invalid or expired token")) {
            errorMessage =
              "Link jest nieprawidłowy lub wygasł. Sprawdź, czy używasz najnowszego linku z emaila.";
          } else if (backendError.includes("already been processed")) {
            errorMessage = "Usunięcie konta zostało już przetworzone i nie może być anulowane.";
          } else if (!backendError.includes("Nie udało się anulować usunięcia konta")) {
            errorMessage = backendError;
          }
        } else if (
          errorWithBody?.message &&
          !errorWithBody.message.includes("refresh token") &&
          !errorWithBody.message.includes("Nie udało się anulować usunięcia konta")
        ) {
          errorMessage = errorWithBody.message;
        }

        setError(errorMessage);
        return undefined;
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
          <span className="text-2xl font-bold text-brand-500">PhotoCloud</span>
        </Link>
      </div>

      <div className="flex flex-col w-full items-center">
        <div className="w-full" style={{ minHeight: "160px", width: "352px" }}>
          {status === "processing" && (
            <div className="flex flex-col items-center justify-center h-full animate-in fade-in duration-300">
              <div className="mb-8">
                <Loading size="lg" />
              </div>
              <h2 className="text-2xl font-semibold mb-3 text-foreground">
                Przetwarzanie żądania...
              </h2>
              <p className="text-sm text-muted-foreground text-center leading-relaxed">
                Anulowanie usunięcia konta w toku. Proszę czekać.
              </p>
            </div>
          )}

          {status === "success" && (
            <div className="flex flex-col items-center justify-center h-full animate-in fade-in duration-300">
              <div className="mb-6 flex items-center justify-center w-20 h-20 rounded-full bg-green-500/10 border-2 border-green-500/20">
                <CheckCircle2 className="w-12 h-12 text-white" strokeWidth={2.5} />
              </div>
              <h2 className="text-2xl font-semibold mb-3 text-foreground text-center">
                Usunięcie konta zostało anulowane
              </h2>
              <p className="text-sm text-muted-foreground text-center leading-relaxed px-2">
                Twoje konto pozostaje aktywne i możesz z niego normalnie korzystać.
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center justify-center h-full animate-in fade-in duration-300">
              <div className="mb-6 flex items-center justify-center w-20 h-20 rounded-full bg-error-500/10 border-2 border-error-500/20">
                <AlertCircle className="w-12 h-12 text-white" strokeWidth={2.5} />
              </div>
              <h2 className="text-2xl font-semibold mb-3 text-foreground text-center">
                Nie udało się anulować usunięcia
              </h2>
              {error && (
                <p className="text-sm text-muted-foreground text-center mt-2 leading-relaxed px-2">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        {status === "success" && (
          <div className="w-full max-w-[352px] mt-6 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-green-400 dark:text-green-300 text-center">
              Przekierowanie do strony logowania za{" "}
              <span className="font-semibold">{countdown}</span> sekund{countdown !== 1 ? "y" : "ę"}
              ...
            </div>
            <Button variant="primary" onClick={handleGoToLogin} className="w-full">
              Przejdź do logowania
            </Button>
          </div>
        )}

        {status === "error" && (
          <div className="w-full max-w-[352px] mt-6 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <Button variant="primary" onClick={handleGoToLogin} className="w-full">
              Przejdź do logowania
            </Button>
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              Jeśli problem nadal występuje, skontaktuj się z pomocą techniczną.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
