"use client";

import React, { memo, useMemo } from "react";
import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch, formatApiError, type ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/react-query";
import { useAuth } from "@/providers/AuthProvider";
import { defaultLoginPageConfig } from "@/config/login-page";
import { getPublicLandingUrl } from "@/lib/public-env";

export const LoginFormPane = memo(function LoginFormPane({
  galleryId,
  apiUrl,
  galleryName,
  onLoginStart,
  onLoginComplete,
  onGalleryRemoved,
  loginPageLayout,
}: {
  galleryId: string;
  apiUrl: string;
  galleryName: string | null;
  onLoginStart?: () => void;
  onLoginComplete?: () => void;
  onGalleryRemoved?: () => void;
  loginPageLayout?: string | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { login } = useAuth();

  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const displayName = useMemo(() => galleryName || "Galeria", [galleryName]);

  const landingUrl = useMemo(() => getPublicLandingUrl(), []);
  const landingIsExternal = useMemo(() => landingUrl.startsWith("http"), [landingUrl]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!apiUrl || !galleryId || !password) {
      setError("Proszę wypełnić wszystkie pola");
      return;
    }

    // Make the loading overlay render immediately before starting the request.
    flushSync(() => {
      setLoading(true);
      setError("");
    });
    onLoginStart?.();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    try {
      const { data } = await apiFetch(`${apiUrl}/galleries/${galleryId}/client-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (typeof window !== "undefined") {
        sessionStorage.setItem(`gallery_token_${galleryId}`, data.token);
        if (data.galleryName) {
          sessionStorage.setItem(`gallery_name_${galleryId}`, data.galleryName);
        }
        sessionStorage.setItem(`just_logged_in_${galleryId}`, "true");
      }

      login(galleryId, data.token);

      if (data.galleryName) {
        queryClient.setQueryData(queryKeys.gallery.status(galleryId), {
          state: "PAID_ACTIVE",
          paymentStatus: "PAID",
          isPaid: true,
          galleryName: data.galleryName,
        });
      }

      // Keep loading overlay visible until public-info call completes
      try {
        const publicInfoResponse = await apiFetch(`${apiUrl}/galleries/${galleryId}/public-info`, {
          method: "GET",
        });
        
        // Store public-info data in sessionStorage so gallery page can use it immediately
        if (typeof window !== "undefined" && publicInfoResponse.data) {
          const publicInfo = publicInfoResponse.data as { galleryName?: string | null; coverPhotoUrl?: string | null };
          if (publicInfo.galleryName) {
            sessionStorage.setItem(`gallery_name_${galleryId}`, publicInfo.galleryName);
          }
          // Store public info for immediate use
          sessionStorage.setItem(`gallery_public_info_${galleryId}`, JSON.stringify(publicInfo));
        }
      } catch (publicInfoErr) {
        // Non-blocking: if public-info fails, still proceed to gallery page
        // The gallery page can handle missing public info gracefully
        console.warn("Failed to fetch public info after login:", publicInfoErr);
      }

      // Store a flag in sessionStorage to indicate we're transitioning
      // The gallery page can check this and show loading until it's ready
      if (typeof window !== "undefined") {
        sessionStorage.setItem(`gallery_loading_${galleryId}`, "true");
      }
      
      await new Promise((resolve) => setTimeout(resolve, 50));
      router.replace(`/${galleryId}`);
      
      // Keep overlay visible for a bit longer to cover the navigation transition
      // The gallery page will clear the loading flag when ready
      setTimeout(() => {
        onLoginComplete?.();
      }, 500);
    } catch (err) {
      const status = (err as ApiError).status;
      if (status === 404 && onGalleryRemoved) {
        onGalleryRemoved();
      } else {
        setError(formatApiError(err));
      }
      setLoading(false);
      onLoginComplete?.();
    }
  }

  // Form container should always be w-full - parent container sets layout-specific width
  // Form content width varies by layout to match preview
  const formContentClass = loginPageLayout === "angled-split"
    ? "w-full" // CSS override will constrain it to max-w-[20rem] with margins
    : "w-full max-w-md"; // Default max-width for other layouts

  // Adjust background and padding based on layout
  const sectionBg = loginPageLayout === "centered" || loginPageLayout === "full-cover"
    ? "bg-transparent" // No background for centered/full-cover - parent has the overlay
    : "bg-white";
  
  const sectionPadding = loginPageLayout === "angled-split" 
    ? "px-6 py-10" 
    : "px-6 py-10";

  return (
    <section className={`w-full min-h-[calc(100vh-320px)] md:min-h-screen ${sectionBg} flex items-center justify-center ${sectionPadding}`}>

      <div className={formContentClass}>
        <div className="mb-8">
          <h1
            className={`${loginPageLayout === "angled-split" ? "mt-5 text-4xl md:text-5xl" : loginPageLayout === "full-cover" ? "mt-5 text-5xl md:text-6xl text-white" : "mt-5 text-5xl md:text-6xl"} ${loginPageLayout === "full-cover" ? "text-white" : "text-gray-900"} ${loginPageLayout === "centered" || loginPageLayout === "full-cover" ? "text-center" : ""} truncate gallery-name-button`}
            style={{ fontFamily: "'The Wedding Signature', cursive" }}
            title={displayName}
          >
            {displayName}
          </h1>
          {loginPageLayout !== "angled-split" && (
            <p className={`mt-4 text-base ${loginPageLayout === "full-cover" ? "text-white/90" : "text-gray-600"} ${loginPageLayout === "centered" || loginPageLayout === "full-cover" ? "text-center" : ""}`}>
              {defaultLoginPageConfig.welcomeMessage}
            </p>
          )}
        </div>

        <form
          onSubmit={handleLogin}
          className={loginPageLayout === "angled-split" ? "space-y-5" : "space-y-5"}
          autoComplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
          data-bwignore="true"
          data-ddg-autofill="false"
          data-form-type="other"
        >
          <div>
            {loginPageLayout !== "angled-split" && (
              <label className={`block text-sm font-medium mb-2 ${loginPageLayout === "full-cover" ? "text-white" : "text-gray-700"}`}>
                {defaultLoginPageConfig.passwordLabel}
              </label>
            )}
            <input
              type="password"
              name="gallery-access-code"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={loginPageLayout === "angled-split" ? defaultLoginPageConfig.passwordPlaceholder : defaultLoginPageConfig.passwordPlaceholder}
              disabled={loading}
              className={`w-full px-4 py-3 text-base ${loginPageLayout === "full-cover" ? "border border-white/30 bg-white/90 text-gray-900 placeholder:text-gray-500 focus:border-white focus:ring-1 focus:ring-white" : "border border-gray-300 rounded-lg bg-white text-gray-900 focus:border-black focus:ring-1 focus:ring-black"} box-border transition-colors outline-none`}
              autoFocus
              // Prevent browsers/extensions from treating this as a saved-login password field.
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              data-1p-ignore="true"
              data-lpignore="true"
              data-bwignore="true"
              data-ddg-autofill="false"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="btn-primary w-full touch-manipulation"
          >
            {loading ? defaultLoginPageConfig.submitLoadingLabel : defaultLoginPageConfig.submitLabel}
          </button>
        </form>
      </div>
    </section>
  );
});

