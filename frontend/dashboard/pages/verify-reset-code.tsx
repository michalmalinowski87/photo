import Link from "next/link";
import { useRouter } from "next/router";
import React, { useState, useEffect } from "react";

import Button from "../components/ui/button/Button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { initAuth, resendResetCode } from "../lib/auth";
import { getPublicLandingUrl } from "../lib/public-env";

interface CognitoError extends Error {
  message: string;
  code?: string;
  name: string;
}

// Prevent static generation - this page uses client hooks
export const dynamic = "force-dynamic";

export default function VerifyResetCode() {
  const router = useRouter();
  const [code, setCode] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [error, setError] = useState<string>("");
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
      // No email provided, redirect to forgot-password
      void router.push("/forgot-password");
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

  const handleVerify = (e: React.FormEvent): void => {
    e.preventDefault();
    setError("");

    if (code?.length !== 6) {
      setError("Wprowadź 6-cyfrowy kod weryfikacyjny");
      return;
    }

    // Redirect to reset-password page with code
    const returnUrl = router.query.returnUrl ?? "/";
    void router.push(
      `/reset-password?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}${returnUrl ? `&returnUrl=${encodeURIComponent(typeof returnUrl === "string" ? returnUrl : returnUrl[0])}` : ""}`
    );
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
      await resendResetCode(email);
      setError("");
      // Start 1-minute cooldown
      setResendCooldown(60);
      // Show success message under the button
      setResendMessage(
        "Kod resetowania hasła został wysłany ponownie. Sprawdź swoją skrzynkę email."
      );
      setResendMessageType("success");
    } catch (err) {
      const error = err as CognitoError & { minutesUntilReset?: number };
      // Handle rate limit errors
      if (error.code === "RateLimitExceeded" || error.name === "RateLimitExceeded") {
        // Use the friendly message from backend, or provide a fallback
        const rateLimitMessage =
          error.message ||
          "Sprawdź swoją skrzynkę email - kod resetowania hasła mógł już dotrzeć. Sprawdź również folder spam i wszystkie wcześniejsze wiadomości.";
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

  return (
    <div className="flex flex-col items-start max-w-sm mx-auto h-dvh overflow-hidden pt-4 md:pt-20">
      <div className="flex items-center w-full py-8 border-b border-border/80">
        <Link href={getPublicLandingUrl()} className="flex items-center gap-x-2">
          <span className="text-xl font-bold" style={{ color: "#465fff" }}>
            PhotoCloud
          </span>
        </Link>
      </div>

      <div className="flex flex-col w-full mt-8">
        <h2 className="text-2xl font-semibold mb-2 text-foreground">Weryfikacja kodu</h2>
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

          <Button type="submit" variant="primary" className="w-full" disabled={code.length !== 6}>
            Kontynuuj
          </Button>
        </form>

        <div className="mt-4 text-center space-y-2">
          <button
            type="button"
            onClick={handleResendCode}
            disabled={resending || resendCooldown > 0}
            className="text-primary font-bold hover:opacity-70 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed text-sm"
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
            className="text-primary font-bold hover:opacity-70 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resending ? "Wysyłanie..." : "wyślij ponownie"}
          </button>
        </p>
      </div>
    </div>
  );
}
