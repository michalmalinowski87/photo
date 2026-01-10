import Link from "next/link";
import { useRouter } from "next/router";
import React, { useState, useEffect, useRef } from "react";

import Button from "../components/ui/button/Button";
import Input from "../components/ui/input/InputField";
import { FullPageLoading } from "../components/ui/loading/Loading";
import { MobileWarningModal } from "../components/ui/mobile-warning/MobileWarningModal";
import { useAuth } from "../context/AuthProvider";
import { useIsMobile } from "../hooks/useIsMobile";
import { initAuth, signIn, getCurrentUser } from "../lib/auth";
import { setupDashboardAuthStatusListener } from "../lib/dashboard-auth-status";
import { shareTokensWithOtherDomains } from "../lib/token-sharing";

// Prevent static generation - this page uses client hooks
export const dynamic = "force-dynamic";

interface CognitoError extends Error {
  message: string;
  code?: string;
  name: string;
}

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [checkingSession, setCheckingSession] = useState<boolean>(true);
  const [showMobileWarning, setShowMobileWarning] = useState<boolean>(false);
  const hasRedirected = useRef<boolean>(false);
  const { setSessionExpired, updateAuthState } = useAuth();
  const isMobile = useIsMobile();

  useEffect(() => {
    // Setup auth status listener for landing page
    setupDashboardAuthStatusListener();

    // Initialize auth
    const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

    if (userPoolId && clientId) {
      initAuth(userPoolId, clientId);
    }

    // Check if user already has a valid session
    const checkExistingSession = (): void => {
      try {
        // Check localStorage for idToken
        const idToken = localStorage.getItem("idToken");
        if (idToken) {
          try {
            const payload = JSON.parse(atob(idToken.split(".")[1])) as { exp?: number };
            const now = Math.floor(Date.now() / 1000);
            if (payload.exp && payload.exp > now) {
              // Token is valid, redirect to returnUrl or root
              const queryReturnUrl = router.query.returnUrl;
              let returnUrl = "/";

              if (queryReturnUrl) {
                // User was redirected from a protected page, send them back there
                returnUrl = typeof queryReturnUrl === "string" ? queryReturnUrl : queryReturnUrl[0];
              }
              // For clean logins (no returnUrl query param), always go to root dashboard

              // Clear any stale authReturnUrl from sessionStorage
              if (typeof window !== "undefined") {
                sessionStorage.removeItem("authReturnUrl");
              }

              // Clear session expired state if user has valid session
              setSessionExpired(false);

              if (!hasRedirected.current) {
                hasRedirected.current = true;
                void router.push(returnUrl);
                return;
              }
            }
          } catch (_e) {
            // Token invalid, continue to show login form
          }
        }

        // Check Cognito SDK session
        const user = getCurrentUser();
        if (user) {
          const queryReturnUrl = router.query.returnUrl;
          let returnUrl = "/";

          if (queryReturnUrl) {
            // User was redirected from a protected page, send them back there
            returnUrl = typeof queryReturnUrl === "string" ? queryReturnUrl : queryReturnUrl[0];
          }
          // For clean logins (no returnUrl query param), always go to root dashboard

          // Clear any stale authReturnUrl from sessionStorage
          if (typeof window !== "undefined") {
            sessionStorage.removeItem("authReturnUrl");
          }

          // Clear session expired state if user has valid session
          setSessionExpired(false);

          if (!hasRedirected.current) {
            hasRedirected.current = true;
            void router.push(returnUrl);
            return;
          }
        }
      } catch (_e) {
        // Error checking session, continue to show login form
      } finally {
        setCheckingSession(false);
      }
    };

    void checkExistingSession();
  }, [router, setSessionExpired]);

  // Show mobile warning when on mobile device
  useEffect(() => {
    if (isMobile && !checkingSession) {
      // Check if user has already dismissed the warning in this session
      const dismissed = sessionStorage.getItem("mobile-warning-dismissed");
      if (dismissed !== "true") {
        setShowMobileWarning(true);
      }
    }
  }, [isMobile, checkingSession]);

  const handleSignIn = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Wprowadź email i hasło");
      return;
    }

    setLoading(true);
    try {
      // Login via SDK (stores tokens in localStorage)
      await signIn(email, password);

      // Share tokens with landing domain via postMessage
      shareTokensWithOtherDomains();

      // Clear session expired state after successful login
      setSessionExpired(false);

      // Immediately update auth state to prevent loading overlay flicker
      await updateAuthState();

      // Small delay to ensure postMessage is sent
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Redirect logic:
      // - If returnUrl is in query params (user was redirected from protected page), use it
      // - Otherwise, go to root dashboard '/' for clean logins
      const queryReturnUrl = router.query.returnUrl;
      let returnUrl = "/";

      if (queryReturnUrl) {
        // User was redirected from a protected page, send them back there
        returnUrl = typeof queryReturnUrl === "string" ? queryReturnUrl : queryReturnUrl[0];
      }
      // For clean logins (no returnUrl query param), always go to root dashboard

      // Clear any stale authReturnUrl from sessionStorage (it shouldn't be used for clean logins)
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("authReturnUrl");
      }

      void router.push(returnUrl);
      // Keep loading true - overlay will stay until redirect completes
    } catch (err) {
      const error = err as CognitoError;
      // Handle Cognito errors
      if (error.code === "NotAuthorizedException" || error.code === "UserNotFoundException") {
        setLoading(false); // Hide overlay on error so user can see the error message
        setError("Nieprawidłowy email lub hasło");
      } else if (error.code === "UserNotConfirmedException") {
        setError("Konto nie zostało zweryfikowane. Sprawdź email z kodem weryfikacyjnym.");
        // Keep loading true - overlay will stay until redirect completes
        void router.push(`/verify-email?email=${encodeURIComponent(email)}`);
      } else {
        setLoading(false); // Hide overlay on error so user can see the error message
        if (error.message) {
          setError(error.message);
        } else {
          setError("Nie udało się zalogować. Spróbuj ponownie.");
        }
      }
    }
  };

  if (checkingSession) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center max-w-sm w-full px-4">
          <div className="relative">
            <div className="border-[3px] border-primary rounded-full border-b-transparent animate-spin w-12 h-12"></div>
            <div className="absolute inset-0 border-[3px] border-transparent rounded-full border-t-primary/30"></div>
          </div>
          <p className="text-sm text-muted-foreground mt-4">Sprawdzanie sesji...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {loading && <FullPageLoading text="Logujemy Cię..." />}
      <MobileWarningModal isOpen={showMobileWarning} onClose={() => setShowMobileWarning(false)} />
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
          <h2 className="text-2xl font-semibold mb-2 text-foreground">Zaloguj się</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Zaloguj się, aby zarządzać swoimi galeriami i klientami
          </p>

          {error && (
            <div className="mb-4 p-3 bg-error-500/15 border border-error-700 rounded text-sm text-error-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSignIn} className="w-full space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Email
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="twoj@email.com"
                autoComplete="email"
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Hasło
                </label>
                <Link
                  href={`/forgot-password${router.query.returnUrl ? `?returnUrl=${encodeURIComponent(typeof router.query.returnUrl === "string" ? router.query.returnUrl : router.query.returnUrl[0])}` : ""}`}
                  className="text-sm text-primary font-medium hover:opacity-70 transition-opacity"
                >
                  Zapomniałeś hasła?
                </Link>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Wprowadź hasło"
                autoComplete="current-password"
                className="w-full"
              />
            </div>

            <Button type="submit" variant="primary" className="w-full" disabled={loading}>
              {loading ? "Logowanie..." : "Zaloguj się"}
            </Button>
          </form>
        </div>

        <div className="flex flex-col items-start w-full mt-8">
          <p className="text-sm text-muted-foreground">
            Logując się, akceptujesz nasze{" "}
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
            Nie masz konta?{" "}
            <Link href="/sign-up" className="text-primary font-bold">
              Zarejestruj się
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
