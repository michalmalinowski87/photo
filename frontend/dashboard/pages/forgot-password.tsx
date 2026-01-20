import Link from "next/link";
import { useRouter } from "next/router";
import React, { useState, useEffect } from "react";

import Button from "../components/ui/button/Button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { initAuth, forgotPassword } from "../lib/auth";
import { getPublicLandingUrl } from "../lib/public-env";

interface CognitoError extends Error {
  message: string;
  code?: string;
  name: string;
}

// Prevent static generation - this page uses client hooks
export const dynamic = "force-dynamic";

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

    if (userPoolId && clientId) {
      initAuth(userPoolId, clientId);
    }
  }, []);

  const handleForgotPassword = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError("");

    if (!email) {
      setError("Wprowadź adres email");
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Nieprawidłowy format adresu email");
      return;
    }

    setLoading(true);
    try {
      await forgotPassword(email);
      setError("");
      // Redirect to verify-reset-code page
      const returnUrl = router.query.returnUrl ?? "/";
      void router.push(
        `/verify-reset-code?email=${encodeURIComponent(email)}${returnUrl ? `&returnUrl=${encodeURIComponent(typeof returnUrl === "string" ? returnUrl : returnUrl[0])}` : ""}`
      );
    } catch (err) {
      const error = err as CognitoError & { minutesUntilReset?: number };
      // Handle rate limit errors
      if (error.code === "RateLimitExceeded" || error.name === "RateLimitExceeded") {
        setError(
          error.message ||
            "Sprawdź swoją skrzynkę email - kod resetowania hasła mógł już dotrzeć. Sprawdź również folder spam."
        );
        return;
      }
      // Handle other errors
      if (error.message) {
        setError(error.message);
      } else {
        setError("Nie udało się wysłać kodu resetowania hasła. Spróbuj ponownie.");
      }
    } finally {
      setLoading(false);
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
        <h2 className="text-2xl font-semibold mb-2 text-foreground">Resetowanie hasła</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Wprowadź adres email powiązany z Twoim kontem. Wyślemy Ci kod weryfikacyjny do resetowania
          hasła.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-error-500/15 border border-error-700 rounded text-sm text-error-400">
            {error}
          </div>
        )}

        <form onSubmit={handleForgotPassword} className="w-full space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(""); // Clear error when user types
              }}
              placeholder="twoj@email.com"
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <Button type="submit" variant="primary" className="w-full" disabled={loading}>
            {loading ? "Wysyłanie..." : "Wyślij kod resetowania"}
          </Button>
        </form>
      </div>

      <div className="flex items-start mt-auto border-t border-border/80 py-6 w-full">
        <p className="text-sm text-muted-foreground">
          Pamiętasz hasło?{" "}
          <Link
            href={`/login${router.query.returnUrl ? `?returnUrl=${encodeURIComponent(typeof router.query.returnUrl === "string" ? router.query.returnUrl : router.query.returnUrl[0])}` : ""}`}
            className="text-primary font-bold hover:opacity-70 transition-opacity"
          >
            Zaloguj się
          </Link>
        </p>
      </div>
    </div>
  );
}
