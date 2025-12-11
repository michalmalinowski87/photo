import Link from "next/link";
import { useRouter } from "next/router";
import React, { useState, useEffect } from "react";

import Button from "../components/ui/button/Button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { initAuth, confirmSignUp, resendConfirmationCode } from "../lib/auth";

interface CognitoError extends Error {
  code?: string;
}

// Prevent static generation - this page uses client hooks
export const dynamic = 'force-dynamic';

export default function VerifyEmail() {
  const router = useRouter();
  const [code, setCode] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [resending, setResending] = useState<boolean>(false);

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
      // Handle Cognito errors
      if (error.code === "CodeMismatchException") {
        setError("Nieprawidłowy kod weryfikacyjny");
      } else if (error.code === "ExpiredCodeException") {
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
    setError("");
    setResending(true);

    try {
      await resendConfirmationCode(email);
      setError("");
      // Show success message
      // Note: In production, use toast notification instead of alert
      // showToast("success", "Sukces", "Nowy kod weryfikacyjny został wysłany na Twój adres email");
    } catch (err) {
      const error = err as CognitoError;
      if (error.message) {
        setError(error.message);
      } else {
        setError("Nie udało się wysłać nowego kodu. Spróbuj ponownie.");
      }
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
        <Link href="/galleries" className="flex items-center gap-x-2">
          <span className="text-xl font-bold" style={{ color: '#465fff' }}>PhotoCloud</span>
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

          <Button 
            type="submit" 
            variant="primary" 
            className="w-full" 
            disabled={loading}
          >
            {loading ? "Weryfikowanie..." : "Zweryfikuj konto"}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={handleResendCode}
            disabled={resending}
            className="text-primary font-bold hover:underline disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {resending ? "Wysyłanie..." : "Wyślij nowy kod"}
          </button>
        </div>
      </div>

      <div className="flex items-start mt-auto border-t border-border/80 py-6 w-full">
        <p className="text-sm text-muted-foreground">
          Nie otrzymałeś kodu? Sprawdź folder spam lub{" "}
          <button
            type="button"
            onClick={handleResendCode}
            disabled={resending}
            className="text-primary font-bold hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resending ? "Wysyłanie..." : "wyślij ponownie"}
          </button>
        </p>
      </div>
    </div>
  );
}
