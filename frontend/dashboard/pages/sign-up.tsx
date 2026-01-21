import Link from "next/link";
import { useRouter } from "next/router";
import React, { useState, useEffect, useRef } from "react";

import Button from "../components/ui/button/Button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { FullPageLoading } from "../components/ui/loading/Loading";
import {
  PasswordInputWithStrength,
  PasswordInputWithToggle,
  PasswordStrengthResult,
  PasswordStrengthValidator,
} from "../components/ui/password-strength-validator";
import { initAuth, signUp, checkUserVerificationStatus } from "../lib/auth";
import { getPublicLandingUrl } from "../lib/public-env";

interface CognitoError extends Error {
  message: string;
  code?: string;
  name: string;
}

// Prevent static generation - this page uses client hooks
export const dynamic = "force-dynamic";

export default function SignUp() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [error, setError] = useState<string>("");
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

    // Check for error from query params
    const errorParam = router.query.error;
    if (errorParam) {
      setError(decodeURIComponent(typeof errorParam === "string" ? errorParam : errorParam[0]));
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

  const handleSignUp = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError("");

    // Validation
    if (!email || !password || !confirmPassword) {
      setError("Wszystkie pola są wymagane");
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
      await signUp(email, password);
      // Redirect to verification page with email
      const returnUrl = router.query.returnUrl ?? "/";
      void router.push(
        `/verify-email?email=${encodeURIComponent(email)}${returnUrl ? `&returnUrl=${encodeURIComponent(typeof returnUrl === "string" ? returnUrl : returnUrl[0])}` : ""}`
      );
      // Keep loading true - overlay will stay until redirect completes
    } catch (err) {
      const error = err as CognitoError & { minutesUntilReset?: number };
      // Handle rate limit errors - check if account was created
      if (error.code === "RateLimitExceeded" || error.name === "RateLimitExceeded") {
        setLoading(false); // Hide overlay to check account status
        // Check if account was created despite rate limit error
        try {
          const verificationStatus = await checkUserVerificationStatus(email);
          const returnUrl = router.query.returnUrl ?? "/";
          
          // If account exists (verified or unverified), redirect to verification
          if (verificationStatus === "verified" || verificationStatus === "unverified") {
            void router.push(
              `/verify-email?email=${encodeURIComponent(email)}${returnUrl ? `&returnUrl=${encodeURIComponent(typeof returnUrl === "string" ? returnUrl : returnUrl[0])}` : ""}`
            );
            return;
          }
        } catch (_checkError) {
          // If check fails, fall through to show error message
        }
        // Account was not created - show user-friendly error
        setError(
          "Nie udało się utworzyć konta w tym momencie. Spróbuj ponownie za chwilę."
        );
        return;
      }
      // Handle Cognito errors
      if (error.code === "UsernameExistsException") {
        // User already exists - check if email is verified
        try {
          const verificationStatus = await checkUserVerificationStatus(email);
          const returnUrl = router.query.returnUrl ?? "/";

          if (verificationStatus === "verified") {
            // User exists and is verified - redirect to login
            // Keep loading true - overlay will stay until redirect completes
            void router.push(
              `/login?email=${encodeURIComponent(email)}${returnUrl ? `&returnUrl=${encodeURIComponent(typeof returnUrl === "string" ? returnUrl : returnUrl[0])}` : ""}`
            );
            return;
          } else if (verificationStatus === "unverified") {
            // User exists but email is not verified - restart verification flow
            // Keep loading true - overlay will stay until redirect completes
            void router.push(
              `/verify-email?email=${encodeURIComponent(email)}${returnUrl ? `&returnUrl=${encodeURIComponent(typeof returnUrl === "string" ? returnUrl : returnUrl[0])}` : ""}`
            );
            return;
          }
        } catch (_checkError) {
          // If check fails, fall through to show error message
        }
        setLoading(false); // Hide overlay on error so user can see the error message
        // Fallback error message if check fails
        setError("Użytkownik o tym adresie email już istnieje");
      } else {
        setLoading(false); // Hide overlay on error so user can see the error message
        if (error.code === "InvalidPasswordException") {
          setError("Hasło nie spełnia wymagań bezpieczeństwa");
        } else if (error.message) {
          setError(error.message);
        } else {
          setError("Nie udało się utworzyć konta. Spróbuj ponownie.");
        }
      }
    }
  };

  return (
    <>
      {loading && <FullPageLoading text="Tworzymy Twoje konto..." />}
      <div className="flex flex-col items-start max-w-sm md:max-w-lg mx-auto h-dvh overflow-x-visible overflow-y-auto pt-4 md:pt-20 px-4 md:px-8 relative">
        <div className="flex items-center w-full py-10 border-b border-border/80">
          <Link href={getPublicLandingUrl()} className="flex items-center gap-x-3">
            <span className="text-2xl font-bold" style={{ color: "#465fff" }}>
              PhotoCloud
            </span>
          </Link>
        </div>

        <div className="flex flex-col w-full mt-10 relative">
          <h2 className="text-xl md:text-2xl font-semibold mb-3 text-foreground">
            Zarejestruj się
          </h2>
          <p className="text-base md:text-lg text-muted-foreground mb-8">
            Utwórz konto i otrzymaj 1 darmową galerię do przetestowania
          </p>

          {error && (
            <div className="mb-5 p-4 bg-error-500/15 border border-error-700 rounded text-base text-error-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSignUp} className="w-full space-y-5 md:space-y-6 relative">
            <div className="space-y-3">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="twoj@email.com"
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-2 relative">
              <Label htmlFor="password">Hasło</Label>
              <PasswordInputWithStrength
                ref={passwordInputRef}
                id="password"
                password={password}
                onPasswordChange={(value) => {
                  setPassword(value);
                  setError(""); // Clear error when user types
                }}
                onStrengthChange={setPasswordStrength}
                placeholder="Wprowadź hasło"
                required
                autoComplete="new-password"
                minLength={8}
              />

              <div className="space-y-2">
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
              {loading ? "Tworzenie konta..." : "Rozpocznij za darmo"}
            </Button>
          </form>

          <p className="text-sm text-muted-foreground mt-5 text-center">
            Po rejestracji otrzymasz email z kodem weryfikacyjnym
          </p>

          <div className="flex flex-col items-start w-full mt-10">
            <p className="text-base text-muted-foreground">
              Rejestrując się, akceptujesz nasze{" "}
              <Link href="/terms" className="text-primary font-bold">
                Warunki korzystania{" "}
              </Link>
              i{" "}
              <Link href="/privacy" className="text-primary font-bold">
                Politykę prywatności
              </Link>
            </p>
          </div>
        </div>

        <div className="flex items-start mt-auto border-t border-border/80 py-8 w-full">
          <p className="text-base text-muted-foreground">
            Masz już konto?{" "}
            <Link href="/login" className="text-primary font-bold">
              Zaloguj się
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
