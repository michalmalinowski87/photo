"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiFetch, formatApiError } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";

function LoginForm() {
  const router = useRouter();
  const params = useParams();
  const { login, isAuthenticated } = useAuth();
  const galleryId = params?.id as string;

  const [apiUrl, setApiUrl] = useState("");
  const [password, setPassword] = useState("");
  const [galleryName, setGalleryName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    setApiUrl(process.env.NEXT_PUBLIC_API_URL || "");
  }, []);

  // Check if already logged in
  useEffect(() => {
    if (!galleryId || !apiUrl) return;

    const token = localStorage.getItem(`gallery_token_${galleryId}`);
    if (token && isAuthenticated) {
      router.replace(`/gallery/${galleryId}`);
    } else {
      setChecking(false);
    }
  }, [galleryId, apiUrl, router, isAuthenticated]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!apiUrl || !galleryId || !password) {
      setError("Proszę wypełnić wszystkie pola");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data } = await apiFetch(`${apiUrl}/galleries/${galleryId}/client-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      // Store token and login
      login(galleryId, data.token, data.galleryName);

      // Redirect to gallery
      router.push(`/gallery/${galleryId}`);
    } catch (err) {
      setError(formatApiError(err));
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-purple-800">
        <div className="bg-white p-10 rounded-xl shadow-lg text-center">
          <div className="text-lg text-gray-600">Ładowanie...</div>
        </div>
      </div>
    );
  }

  const displayName = galleryName || "Twoja Galeria";

  if (!galleryId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-purple-800">
        <div className="bg-white p-10 rounded-xl shadow-lg text-center">
          <div className="text-lg text-red-600">Wymagane ID galerii</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-purple-600 to-purple-800">
      {/* Cover Photo Area - Future: customizable position and design */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Login Form Card - Lightweight design */}
          <div className="bg-white/95 backdrop-blur-sm p-8 md:p-12 rounded-2xl shadow-xl">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-medium text-gray-900 mb-2">{displayName}</h1>
              <p className="text-base text-gray-600 mt-2">
                Wprowadź hasło, aby uzyskać dostęp do zdjęć
              </p>
            </div>

            <form onSubmit={handleLogin}>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hasło
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Wprowadź hasło do galerii"
                  disabled={loading}
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg box-border transition-colors outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                  autoFocus
                />
              </div>

              {error && (
                <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !password}
                className="w-full py-3.5 text-base font-medium text-white rounded-lg cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-700 hover:to-purple-900 shadow-md disabled:shadow-none"
              >
                {loading ? "Logowanie..." : "Zaloguj się"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div>Ładowanie...</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
