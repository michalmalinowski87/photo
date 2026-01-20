"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch, formatApiError } from "@/lib/api";
import { queryKeys } from "@/lib/react-query";
import { useAuth } from "@/providers/AuthProvider";
import { defaultLoginPageConfig } from "@/config/login-page";
import { FullPageLoading } from "@/components/ui/Loading";
import { getPublicLandingUrl } from "@/lib/public-env";

export function LoginFormPane({
  galleryId,
  apiUrl,
  galleryName,
}: {
  galleryId: string;
  apiUrl: string;
  galleryName: string | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { login } = useAuth();

  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const displayName = galleryName || "Galeria";

  const landingUrl = getPublicLandingUrl();
  const landingIsExternal = landingUrl.startsWith("http");

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

      await new Promise((resolve) => setTimeout(resolve, 50));
      router.replace(`/${galleryId}`);
    } catch (err) {
      setError(formatApiError(err));
      setLoading(false);
    }
  }

  return (
    <section className="w-full md:w-[45%] min-h-[calc(100vh-320px)] md:min-h-screen bg-white flex items-center justify-center px-6 py-10">
      {/* Keep this mounted so the portal is "warmed up" and can show instantly on submit */}
      <FullPageLoading
        isVisible={loading}
        text={defaultLoginPageConfig.submitLoadingLabel}
      />

      <div className="w-full max-w-md">
        <div className="mb-8">
          <h1
            className="mt-5 text-5xl md:text-6xl text-gray-900 truncate gallery-name-button"
            style={{ fontFamily: "'The Wedding Signature', cursive" }}
            title={displayName}
          >
            {displayName}
          </h1>
          <p className="mt-4 text-base text-gray-600">
            {defaultLoginPageConfig.welcomeMessage}
          </p>
        </div>

        <form
          onSubmit={handleLogin}
          className="space-y-5"
          autoComplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
          data-bwignore="true"
          data-ddg-autofill="false"
          data-form-type="other"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {defaultLoginPageConfig.passwordLabel}
            </label>
            <input
              type="password"
              name="gallery-access-code"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={defaultLoginPageConfig.passwordPlaceholder}
              disabled={loading}
              className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg box-border transition-colors outline-none focus:border-black focus:ring-1 focus:ring-black"
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
}

