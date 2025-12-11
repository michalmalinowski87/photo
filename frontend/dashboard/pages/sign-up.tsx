import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useState, useEffect } from "react";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { initAuth, signUp } from "../lib/auth";

interface CognitoError extends Error {
  code?: string;
}

// Prevent static generation - this page uses client hooks
export const getServerSideProps: GetServerSideProps = () => {
  return Promise.resolve({ props: {} });
};

export default function SignUp() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

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

    if (password.length < 8) {
      setError("Hasło musi mieć co najmniej 8 znaków");
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
    } catch (err) {
      setLoading(false);
      const error = err as CognitoError;
      // Handle Cognito errors
      if (error.code === "UsernameExistsException") {
        setError("Użytkownik o tym adresie email już istnieje");
      } else if (error.code === "InvalidPasswordException") {
        setError("Hasło nie spełnia wymagań bezpieczeństwa");
      } else if (error.message) {
        setError(error.message);
      } else {
        setError("Nie udało się utworzyć konta. Spróbuj ponownie.");
      }
    }
  };

  return (
    <div className="flex flex-col items-start max-w-sm mx-auto h-dvh overflow-hidden pt-4 md:pt-20">
      <div className="flex items-center w-full py-8 border-b border-border/80">
        <Link href="/galleries" className="flex items-center gap-x-2">
          <span className="text-lg font-bold text-foreground">PhotoCloud</span>
        </Link>
      </div>

      <div className="flex flex-col w-full mt-8">
        <h2 className="text-2xl font-semibold mb-2 text-foreground">Zarejestruj się</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Utwórz konto i otrzymaj 1 darmową galerię do przetestowania
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSignUp} className="w-full space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="twoj@email.com"
              disabled={loading}
              required
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Hasło</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 znaków"
              disabled={loading}
              required
              autoComplete="new-password"
              minLength={8}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Potwierdź hasło</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Powtórz hasło"
              disabled={loading}
              required
              autoComplete="new-password"
            />
          </div>

          <Button type="submit" variant="primary" className="w-full" size="lg" disabled={loading}>
            {loading ? "Tworzenie konta..." : "Rozpocznij za darmo"}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground mt-4 text-center">
          Po rejestracji otrzymasz email z kodem weryfikacyjnym
        </p>
      </div>

      <div className="flex flex-col items-start w-full mt-8">
        <p className="text-sm text-muted-foreground">
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

      <div className="flex items-start mt-auto border-t border-border/80 py-6 w-full">
        <p className="text-sm text-muted-foreground">
          Masz już konto?{" "}
          <Link href="/login" className="text-primary font-bold">
            Zaloguj się
          </Link>
        </p>
      </div>
    </div>
  );
}
