import Link from "next/link";
import { useRouter } from "next/router";
import React, { useState, useEffect } from "react";

import Button from "../components/ui/button/Button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { initAuth, confirmSignUp, resendConfirmationCode } from "../lib/auth";

interface CognitoError extends Error {
  code?: string;
  name?: string;
}

// Prevent static generation - this page uses client hooks
export const dynamic = "force-dynamic";

export default function VerifyEmail() {
  const router = useRouter();
  const [code, setCode] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [resending, setResending] = useState<boolean>(false);
  const [resendCooldown, setResendCooldown] = useState<number>(0); // Seconds remaining
  const [resendMessage, setResendMessage] = useState<string>(""); // Success or warning message for resend
  const [resendMessageType, setResendMessageType] = useState<"success" | "warning" | "">(""); // Type of resend message

  useEffect(() => {
    const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

    if (userPoolId && clientId) {
      initAuth(userPoolId, clientId);
    }

    // Get email from query params
    const emailParam = router.query.email;
    if (emailParam) {
      setEmail(decodeURIComponent(typeof emailParam === "string" ? emailParam : emailParam[0]));
    } else {
      // No email provided, redirect to sign-up
      void router.push("/sign-up");
    }
  }, [router]);

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) {
      return;
    }
    const timer = setTimeout(() => {
      setResendCooldown(resendCooldown - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Clear success message when cooldown reaches zero
  useEffect(() => {
    if (resendCooldown === 0 && resendMessageType === "success") {
      setResendMessage("");
      setResendMessageType("");
    }
  }, [resendCooldown, resendMessageType]);

  const handleVerify = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError("");

    if (code?.length !== 6) {
      setError("Wprowadź 6-cyfrowy kod weryfikacyjny");
      return;
    }

    setLoading(true);
    try {
      await confirmSignUp(email, code);
      setSuccess(true);
      // Redirect to login after a short delay
      const returnUrl = router.query.returnUrl ?? "/";
      setTimeout(() => {
        void router.push(
          `/login?verified=true${returnUrl ? `&returnUrl=${encodeURIComponent(typeof returnUrl === "string" ? returnUrl : returnUrl[0])}` : ""}`
        );
      }, 2000);
    } catch (err) {
      const error = err as CognitoError;
      // Handle Cognito errors - check both code and name properties for robustness
      if (error.code === "CodeMismatchException" || error.name === "CodeMismatchException") {
        setError("Nieprawidłowy kod weryfikacyjny");
      } else if (error.code === "ExpiredCodeException" || error.name === "ExpiredCodeException") {
        setError("Kod weryfikacyjny wygasł. Wyślij nowy kod.");
      } else if (error.message) {
        setError(error.message);
      } else {
        setError("Nie udało się zweryfikować konta. Spróbuj ponownie.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async (): Promise<void> => {
    // Prevent multiple clicks during cooldown
    if (resendCooldown > 0) {
      return;
    }

    setError("");
    setResendMessage("");
    setResendMessageType("");
    setResending(true);

    try {
      await resendConfirmationCode(email);
      setError("");
      // Start 1-minute cooldown
      setResendCooldown(60);
      // Show success message under the button
      setResendMessage("Kod weryfikacyjny został wysłany ponownie. Sprawdź swoją skrzynkę email.");
      setResendMessageType("success");
    } catch (err) {
      const error = err as CognitoError & { minutesUntilReset?: number };
      // Handle rate limit errors
      if (error.code === "RateLimitExceeded" || error.name === "RateLimitExceeded") {
        // Use the friendly message from backend, or provide a fallback
        const rateLimitMessage =
          error.message ||
          "Sprawdź swoją skrzynkę email - kod weryfikacyjny mógł już dotrzeć. Sprawdź również folder spam i wszystkie wcześniejsze wiadomości.";
        setResendMessage(rateLimitMessage);
        setResendMessageType("warning");
        // Still start cooldown even on rate limit error to prevent spam
        setResendCooldown(60);
        return;
      }
      // For other errors, show under the button as warning
      const errorMessage = error.message || "Nie udało się wysłać nowego kodu. Spróbuj ponownie.";
      setResendMessage(errorMessage);
      setResendMessageType("warning");
      // Start cooldown even on error to prevent spam
      setResendCooldown(60);
    } finally {
      setResending(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="max-w-sm w-full mx-auto px-4">
          <div className="text-center">
            <div className="mb-4 text-green-600 text-4xl">✓</div>
            <h2 className="text-2xl font-semibold mb-2 text-foreground">Konto zweryfikowane!</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Przekierowywanie do strony logowania...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start max-w-sm mx-auto h-dvh overflow-hidden pt-4 md:pt-20">
      <div className="flex items-center w-full py-8 border-b border-border/80">
        <Link
          href={process.env.NEXT_PUBLIC_LANDING_URL ?? "http://localhost:3002"}
          className="flex items-center gap-x-2"
        >
          <span className="text-xl font-bold" style={{ color: "#465fff" }}>
            PhotoCloud
          </span>
        </Link>
      </div>

      <div className="flex flex-col w-full mt-8">
        <h2 className="text-2xl font-semibold mb-2 text-foreground">Weryfikacja email</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Wprowadź 6-cyfrowy kod weryfikacyjny wysłany na adres <strong>{email}</strong>
        </p>

        {error && (
          <div className="mb-4 p-3 bg-error-500/15 border border-error-700 rounded text-sm text-error-400">
            {error}
          </div>
        )}

        <form onSubmit={handleVerify} className="w-full space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">Kod weryfikacyjny</Label>
            <Input
              id="code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              required
              maxLength={6}
              className="text-center text-2xl tracking-widest"
              autoFocus
            />
          </div>

          <Button type="submit" variant="primary" className="w-full" disabled={loading}>
            {loading ? "Weryfikowanie..." : "Zweryfikuj konto"}
          </Button>
        </form>

        <div className="mt-4 text-center space-y-2">
          <button
            type="button"
            onClick={handleResendCode}
            disabled={resending || resendCooldown > 0}
            className="text-primary font-bold hover:underline disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {resending
              ? "Wysyłanie..."
              : resendCooldown > 0
                ? `Wyślij nowy kod (${resendCooldown}s)`
                : "Wyślij nowy kod"}
          </button>
          {resendMessage && (
            <div
              className={`text-sm px-3 py-2 rounded ${
                resendMessageType === "success"
                  ? "bg-green-500/15 border border-green-700 text-green-400"
                  : "bg-error-500/15 border border-error-700 text-error-400"
              }`}
            >
              {resendMessage}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-start mt-auto border-t border-border/80 py-6 w-full">
        <p className="text-sm text-muted-foreground">
          Nie otrzymałeś kodu? Sprawdź folder spam lub{" "}
          <button
            type="button"
            onClick={handleResendCode}
            disabled={resending || resendCooldown > 0}
            className="text-primary font-bold hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resending ? "Wysyłanie..." : "wyślij ponownie"}
          </button>
        </p>
      </div>
    </div>
  );
}
