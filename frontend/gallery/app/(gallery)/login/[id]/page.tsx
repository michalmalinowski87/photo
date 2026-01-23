"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { LoginCoverPane } from "@/components/login/LoginCoverPane";
import { LoginFormPane } from "@/components/login/LoginFormPane";
import { FullPageLoading } from "@/components/ui/Loading";
import { defaultLoginPageConfig } from "@/config/login-page";
import { getPublicApiUrl } from "@/lib/public-env";

// Get API URL at module level to avoid useEffect delay
const API_URL = typeof window !== "undefined" ? getPublicApiUrl() : "";

function LoginScreen() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuth();
  const galleryId = params?.id as string;

  // Use module-level API URL or get it on mount (fallback for SSR)
  const [apiUrl] = useState(() => API_URL || (typeof window !== "undefined" ? getPublicApiUrl() : ""));
  const [galleryName, setGalleryName] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isPublicInfoLoading, setIsPublicInfoLoading] = useState(true);

  // Memoize callbacks to prevent unnecessary re-renders and API calls
  const handlePublicInfoLoadingChange = useCallback((loading: boolean) => {
    setIsPublicInfoLoading(loading);
  }, []);

  const handlePublicInfoLoaded = useCallback((info: { galleryName: string | null }) => {
    setGalleryName(info.galleryName);
    // Update document title for better SEO
    if (info.galleryName && typeof document !== "undefined") {
      document.title = `${info.galleryName} - PhotoCloud`;
    }
  }, []);

  const handleLoginStart = useCallback(() => {
    setIsLoggingIn(true);
  }, []);

  const handleLoginComplete = useCallback(() => {
    setIsLoggingIn(false);
  }, []);

  // Check if already logged in - memoize searchParams check
  const isLoginPreview = useMemo(
    () => searchParams?.get("loginPreview") === "1",
    [searchParams]
  );

  useEffect(() => {
    if (isLoginPreview) {
      return;
    }

    if (isAuthenticated && galleryId) {
      router.replace(`/${galleryId}`);
    }
  }, [galleryId, router, isAuthenticated, isLoginPreview]);

  if (!galleryId) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <div className="text-lg text-gray-900 font-medium">Wymagane ID galerii</div>
          <div className="mt-2 text-sm text-gray-600">
            Link do galerii jest nieprawidłowy lub niekompletny.
          </div>
        </div>
      </div>
    );
  }

  // Show loading overlay until public-info is loaded OR during login
  const shouldShowLoading = useMemo(
    () => isPublicInfoLoading || isLoggingIn,
    [isPublicInfoLoading, isLoggingIn]
  );

  return (
    <div className="min-h-screen bg-white">
      {/* Loading overlay at page level - show until public-info loads, then during login */}
      <FullPageLoading
        isVisible={shouldShowLoading}
        text={isLoggingIn ? defaultLoginPageConfig.submitLoadingLabel : "Ładowanie..."}
      />
      {/* Always render components so they can make API calls, but overlay will hide content */}
      <div className="min-h-screen flex flex-col md:flex-row" style={{ visibility: isPublicInfoLoading ? 'hidden' : 'visible' }}>
        <LoginCoverPane
          galleryId={galleryId}
          apiUrl={apiUrl}
          onPublicInfoLoadingChange={handlePublicInfoLoadingChange}
          onPublicInfoLoaded={handlePublicInfoLoaded}
        />
        <LoginFormPane 
          galleryId={galleryId} 
          apiUrl={apiUrl} 
          galleryName={galleryName}
          onLoginStart={handleLoginStart}
          onLoginComplete={handleLoginComplete}
        />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <LoginScreen />;
}
