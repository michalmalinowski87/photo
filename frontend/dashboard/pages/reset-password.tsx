import Link from "next/link";
import { useRouter } from "next/router";
import React, { useState, useEffect, useRef } from "react";

import Button from "../components/ui/button/Button";
import { Label } from "../components/ui/label";
import {
  PasswordInputWithStrength,
  PasswordInputWithToggle,
  PasswordStrengthResult,
  PasswordStrengthValidator,
} from "../components/ui/password-strength-validator";
import { initAuth, confirmForgotPassword } from "../lib/auth";
import { getPublicLandingUrl } from "../lib/public-env";

interface CognitoError extends Error {
  message: string;
  code?: string;
  name: string;
}

// Prevent static generation - this page uses client hooks
export const dynamic = "force-dynamic";

export default function ResetPassword() {
  const router = useRouter();
  const [code, setCode] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [passwordStrength, setPasswordStrength] = useState<PasswordStrengthResult | null>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const [validatorPosition, setValidatorPosition] = useState<{ top: number; left: number } | null>(
    null
  );

  useEffect(() => {
    const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

    if (userPoolId && clientId) {
      initAuth(userPoolId, clientId);
    }

    // Get email and code from query params
    const emailParam = router.query.email;
    const codeParam = router.query.code;

    if (emailParam) {
      setEmail(decodeURIComponent(typeof emailParam === "string" ? emailParam : emailParam[0]));
    } else {
      // No email provided, redirect to forgot-password
      void router.push("/forgot-password");
      return;
    }

    if (codeParam) {
      const decodedCode = decodeURIComponent(
        typeof codeParam === "string" ? codeParam : codeParam[0]
      );
      setCode(decodedCode.replace(/\D/g, "").slice(0, 6));
    }
  }, [router]);

  // Calculate validator position when password changes or on scroll/resize
  useEffect(() => {
    const updatePosition = () => {
      if (password && passwordInputRef.current) {
        const inputRect = passwordInputRef.current.getBoundingClientRect();
        setValidatorPosition({
          top: inputRect.top + window.scrollY - 4, // Align slightly above password input field
          left: inputRect.right + 16, // 16px = ml-4
        });
      } else {
        setValidatorPosition(null);
      }
    };

    updatePosition();

    if (password) {
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);

      return () => {
        window.removeEventListener("scroll", updatePosition, true);
        window.removeEventListener("resize", updatePosition);
      };
    }

    return undefined;
  }, [password]);

  const handleResetPassword = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError("");

    if (!password || !confirmPassword) {
      setError("Wszystkie pola są wymagane");
      return;
    }

    if (code?.length !== 6) {
      setError("Wprowadź 6-cyfrowy kod weryfikacyjny");
      return;
    }

    if (password !== confirmPassword) {
      setError("Hasła nie są identyczne");
      return;
    }

    // Validate password strength
    if (!passwordStrength?.meetsMinimum) {
      setError("Hasło nie spełnia wymagań bezpieczeństwa. Sprawdź wymagania poniżej.");
      return;
    }

    setLoading(true);
    try {
      await confirmForgotPassword(email, code, password);
      setSuccess(true);
      // Redirect to login after a short delay
      const returnUrl = router.query.returnUrl ?? "/";
      setTimeout(() => {
        void router.push(
          `/login${returnUrl ? `?returnUrl=${encodeURIComponent(typeof returnUrl === "string" ? returnUrl : returnUrl[0])}` : ""}`
        );
      }, 2000);
    } catch (err) {
      const error = err as CognitoError;
      // Handle Cognito errors - check both code and name properties for robustness
      if (error.code === "CodeMismatchException" || error.name === "CodeMismatchException") {
        setError("Nieprawidłowy kod weryfikacyjny");
      } else if (error.code === "ExpiredCodeException" || error.name === "ExpiredCodeException") {
        setError("Kod weryfikacyjny wygasł. Wyślij nowy kod.");
      } else if (
        error.code === "InvalidPasswordException" ||
        error.name === "InvalidPasswordException"
      ) {
        setError("Hasło nie spełnia wymagań bezpieczeństwa");
      } else if (error.message) {
        setError(error.message);
      } else {
        setError("Nie udało się zresetować hasła. Spróbuj ponownie.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="max-w-sm md:max-w-lg w-full mx-auto px-4 md:px-8">
          <div className="text-center">
            <div className="mb-5 text-green-600 text-5xl">✓</div>
            <h2 className="text-xl md:text-2xl font-semibold mb-3 text-foreground">
              Hasło zresetowane!
            </h2>
            <p className="text-base text-muted-foreground mb-8">
              Przekierowywanie do strony logowania...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start max-w-sm md:max-w-lg mx-auto h-dvh overflow-x-visible overflow-y-auto pt-4 md:pt-20 px-4 md:px-8 relative">
      <div className="flex items-center w-full py-10 border-b border-border/80">
        <Link href={getPublicLandingUrl()} className="flex flex-col items-start gap-1">
          <span className="text-2xl font-bold" style={{ color: "#465fff" }}>
            PixiProof
          </span>
        </Link>
      </div>

      <div className="flex flex-col w-full mt-10 relative">
        <h2 className="text-xl md:text-2xl font-semibold mb-3 text-foreground">Ustaw nowe hasło</h2>
        <p className="text-base md:text-lg text-muted-foreground mb-8">
          Wprowadź nowe hasło dla konta <strong>{email}</strong>
        </p>

        {code && (
          <div className="mb-5 p-4 bg-green-500/15 border border-green-700 rounded text-base text-green-400">
            Kod weryfikacyjny został zweryfikowany
          </div>
        )}

        {error && (
          <div className="mb-5 p-4 bg-error-500/15 border border-error-700 rounded text-base text-error-400">
            {error}
          </div>
        )}

        <form onSubmit={handleResetPassword} className="w-full space-y-5 md:space-y-6 relative">
          <div className="space-y-3 relative">
            <Label htmlFor="password">Nowe hasło</Label>
            <PasswordInputWithStrength
              ref={passwordInputRef}
              id="password"
              password={password}
              onPasswordChange={(value) => {
                setPassword(value);
                setError(""); // Clear error when user types
              }}
              onStrengthChange={setPasswordStrength}
              placeholder="Wprowadź nowe hasło"
              required
              autoComplete="new-password"
              minLength={8}
            />

            <div className="space-y-3">
              <Label htmlFor="confirmPassword">Potwierdź hasło</Label>
              <PasswordInputWithToggle
                id="confirmPassword"
                value={confirmPassword}
                onValueChange={(value) => {
                  setConfirmPassword(value);
                  setError(""); // Clear error when user types
                }}
                placeholder="Powtórz hasło"
                required
                autoComplete="new-password"
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="text-sm text-red-500 mt-2">Hasła nie są identyczne</p>
              )}
              {confirmPassword && password === confirmPassword && password.length > 0 && (
                <p className="text-sm text-green-500 mt-2">Hasła są identyczne</p>
              )}
            </div>

            {/* Password Strength Validator - Fixed Positioned Side Card */}
            {password && passwordStrength && validatorPosition && (
              <div
                className="fixed w-72 z-50 hidden md:block pointer-events-auto"
                style={{
                  top: `${validatorPosition.top}px`,
                  left: `${validatorPosition.left}px`,
                  maxHeight: "calc(100vh - 2rem)",
                }}
              >
                <div className="rounded-lg border border-border bg-card p-4 shadow-lg max-h-full overflow-y-auto">
                  <PasswordStrengthValidator
                    password={password}
                    minLength={8}
                    onStrengthChange={setPasswordStrength}
                    showToggle={false}
                  />
                </div>
              </div>
            )}
          </div>

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            disabled={loading || !passwordStrength?.meetsMinimum}
          >
            {loading ? "Resetowanie..." : "Zresetuj hasło"}
          </Button>
        </form>
      </div>
    </div>
  );
}
