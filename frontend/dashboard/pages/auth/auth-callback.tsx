import type { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import React, { useEffect, useRef } from "react";

import { useAuth } from "../../context/AuthProvider";
import { exchangeCodeForTokens } from "../../lib/auth";

// Prevent static generation - this page uses client hooks
export const getServerSideProps: GetServerSideProps = () => {
  return Promise.resolve({ props: {} });
};

export default function AuthCallback() {
  const router = useRouter();
  const hasRedirected = useRef<boolean>(false);
  const hasProcessed = useRef<boolean>(false);
  const { setSessionExpired } = useAuth();

  useEffect(() => {
    // Wait for router to be ready (query params are populated asynchronously)
    if (!router.isReady) {
      return;
    }

    // Prevent double execution in React Strict Mode
    if (hasProcessed.current) {
      return;
    }

    // Prevent multiple redirects
    if (hasRedirected.current) {
      return;
    }

    const code = router.query.code;
    const state = router.query.state; // Contains returnUrl
    const error = router.query.error;

    if (error) {
      hasRedirected.current = true;
      // Redirect to dashboard login page
      const dashboardUrl =
        typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
      const returnUrl = state
        ? decodeURIComponent(typeof state === "string" ? state : state[0])
        : "/";
      window.location.href = `${dashboardUrl}/login?error=${encodeURIComponent(typeof error === "string" ? error : error[0])}&returnUrl=${encodeURIComponent(returnUrl)}`;
      return;
    }

    if (code) {
      hasProcessed.current = true; // Mark as processed to prevent double execution

      // Exchange authorization code for tokens
      // redirectUri must match exactly what was used in the authorization request
      if (typeof window === "undefined") {
        return;
      }

      const redirectUri = `${window.location.origin}/auth/auth-callback`;

      if (!redirectUri) {
        hasRedirected.current = true;
        const dashboardUrl = window.location.origin;
        const returnUrl = state
          ? decodeURIComponent(typeof state === "string" ? state : state[0])
          : "/";
        window.location.href = `${dashboardUrl}/login?error=missing_redirect_uri&returnUrl=${encodeURIComponent(returnUrl)}`;
        return;
      }

      void exchangeCodeForTokens(typeof code === "string" ? code : code[0], redirectUri)
        .then(() => {
          // Clear session expired state after successful token exchange
          setSessionExpired(false);

          // Successfully got tokens, redirect to returnUrl or default to root
          const returnUrl = state
            ? decodeURIComponent(typeof state === "string" ? state : state[0])
            : "/";
          // Ensure returnUrl is a valid path (prevent open redirect)
          const safeReturnUrl = returnUrl.startsWith("/") ? returnUrl : "/";
          void router.replace(safeReturnUrl);
        })
        .catch((_err) => {
          if (hasRedirected.current) {
            return; // Already redirected, prevent loop
          }
          hasRedirected.current = true;
          // Redirect to dashboard login page
          const dashboardUrl =
            typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
          const returnUrl = state
            ? decodeURIComponent(typeof state === "string" ? state : state[0])
            : "/";
          // Clear any stale PKCE verifier to prevent issues
          if (typeof window !== "undefined") {
            sessionStorage.removeItem("pkce_code_verifier");
          }
          window.location.href = `${dashboardUrl}/login?error=token_exchange_failed&returnUrl=${encodeURIComponent(returnUrl)}`;
        });
    } else {
      if (hasRedirected.current) {
        return; // Already redirected, prevent loop
      }
      hasRedirected.current = true;
      // No code, redirect to dashboard login page
      const dashboardUrl =
        typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
      const returnUrl = state
        ? decodeURIComponent(typeof state === "string" ? state : state[0])
        : "/";
      window.location.href = `${dashboardUrl}/login?returnUrl=${encodeURIComponent(returnUrl)}`;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.asPath, setSessionExpired]);

  return (
    <div style={{ padding: 24, textAlign: "center" }}>
      <div>Completing login...</div>
    </div>
  );
}
