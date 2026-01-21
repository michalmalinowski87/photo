import { useRouter } from "next/router";
import React, { useState, useEffect } from "react";

import Button from "../components/ui/button/Button";
import { CodeInput } from "../components/ui/code-input";
import {
  initAuth,
  resendConfirmationCode,
} from "../lib/auth";

interface CognitoError extends Error {
  message: string;
  code?: string;
  name: string;
}

// Prevent static generation - this page uses client hooks
export const dynamic = "force-dynamic";

export default function VerifyEmail() {
  const router = useRouter();
  const [code, setCode] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [error, setError] = useState<string>("");
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

  const handleVerifyCode = async (): Promise<void> => {
    setError("");

    if (code?.length !== 6) {
      setError("Wprowadź 6-cyfrowy kod weryfikacyjny");
      return;
    }

    setLoading(true);
    try {
      // Just validate format and redirect - actual verification happens in register-subdomain
      const returnUrl = router.query.returnUrl ?? "/";
      const returnUrlParam = returnUrl ? `&returnUrl=${encodeURIComponent(typeof returnUrl === "string" ? returnUrl : returnUrl[0])}` : "";
      const redirectUrl = `/register-subdomain?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}${returnUrlParam}`;
      // Use router.push and ensure it completes
      void router.push(redirectUrl);
      // Keep loading state - page will change
    } catch (err) {
      // Handle redirect errors
      setError("Nie udało się przekierować. Spróbuj ponownie.");
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

  // Code verification step - Apple style
  return (
    <div className="flex flex-col items-center justify-start min-h-screen px-4 pt-[25vh] md:pt-[30vh]">
      <div className="w-full max-w-md text-center space-y-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold mb-3 text-foreground">
            Weryfikacja email
          </h1>
          <p className="text-base md:text-lg text-muted-foreground">
            Wprowadź 6-cyfrowy kod weryfikacyjny wysłany na adres
          </p>
          <p className="text-base md:text-lg font-medium text-foreground mt-1">{email}</p>
        </div>

        {error && (
          <div className="mx-auto max-w-md p-4 bg-error-500/15 border border-error-700 rounded-lg text-base text-error-400">
            {error}
          </div>
        )}

        <div className="space-y-6">
          <CodeInput
            value={code}
            onChange={setCode}
            length={6}
            autoFocus
            disabled={loading}
            error={!!error}
          />

          {code.length === 6 && (
            <Button
              type="button"
              variant="primary"
              className="w-full"
              onClick={handleVerifyCode}
              disabled={loading}
            >
              {loading ? "Weryfikowanie..." : "Kontynuuj"}
            </Button>
          )}
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={handleResendCode}
            disabled={resending || resendCooldown > 0}
            className="text-primary font-medium hover:underline disabled:opacity-50 disabled:cursor-not-allowed text-base"
          >
            {resending
              ? "Wysyłanie..."
              : resendCooldown > 0
                ? `Wyślij nowy kod (${resendCooldown}s)`
                : "Nie otrzymałeś kodu? Wyślij ponownie"}
          </button>
          {resendMessage && (
            <div
              className={`text-sm px-4 py-3 rounded-lg ${
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
    </div>
  );
}
