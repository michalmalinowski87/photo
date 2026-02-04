"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { LoginCoverPane, type GalleryPublicInfo } from "@/components/login/LoginCoverPane";
import { LoginFormPane } from "@/components/login/LoginFormPane";
import { GalleryRemoved } from "@/components/gallery/GalleryRemoved";
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
  const [loginPageLayout, setLoginPageLayout] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isPublicInfoLoading, setIsPublicInfoLoading] = useState(true);
  const [galleryRemoved, setGalleryRemoved] = useState(false);

  // Memoize callbacks to prevent unnecessary re-renders and API calls
  const handlePublicInfoLoadingChange = useCallback((loading: boolean) => {
    setIsPublicInfoLoading(loading);
  }, []);

  const handlePublicInfoLoaded = useCallback((info: GalleryPublicInfo) => {
    setGalleryName(info.galleryName);
    setLoginPageLayout(info.loginPageLayout || null);
    // Update document title for better SEO
    if (info.galleryName && typeof document !== "undefined") {
      document.title = `${info.galleryName} - PixiProof`;
    }
  }, []);

  const handleLoginStart = useCallback(() => {
    setIsLoggingIn(true);
  }, []);

  const handleLoginComplete = useCallback(() => {
    setIsLoggingIn(false);
  }, []);

  const handleGalleryRemoved = useCallback(() => {
    setGalleryRemoved(true);
  }, []);

  // Check if already logged in - memoize searchParams check
  const isLoginPreview = useMemo(
    () => searchParams?.get("loginPreview") === "1",
    [searchParams]
  );

  // Must be called before any early return (Rules of Hooks)
  const shouldShowLoading = useMemo(
    () => isPublicInfoLoading || isLoggingIn,
    [isPublicInfoLoading, isLoggingIn]
  );

  const layoutClasses = useMemo(() => {
    const layout = loginPageLayout || "split";
    switch (layout) {
      case "angled-split":
        return {
          container: "min-h-screen relative",
          coverPane: "absolute inset-0 w-full h-full min-h-[320px] md:min-h-screen overflow-hidden bg-gray-50 z-0",
          formPane: "absolute right-0 top-0 bottom-0 w-full md:w-[45%] min-h-[320px] md:min-h-screen bg-white flex items-center justify-center z-10",
          formPaneStyle: {
            clipPath: "polygon(25% 0%, 100% 0%, 100% 100%, 0% 100%)",
          } as React.CSSProperties,
        };
      case "centered":
        return {
          container: "min-h-screen relative overflow-hidden",
          coverPane: "absolute inset-0 w-full h-full",
          formPane: "absolute inset-0 z-10 w-full h-full flex items-center justify-center bg-white/80 backdrop-blur-sm px-6 py-10",
          formPaneStyle: {},
        };
      case "full-cover":
        return {
          container: "min-h-screen relative overflow-hidden",
          coverPane: "absolute inset-0 w-full h-full",
          formPane: "absolute inset-0 z-10 w-full h-full flex items-center justify-center bg-black/40 backdrop-blur-sm px-6 py-10",
          formPaneStyle: {},
        };
      case "split":
      default:
        return {
          container: "min-h-screen relative",
          coverPane: "absolute inset-0 w-full h-full min-h-[320px] md:min-h-screen overflow-hidden bg-gray-50 z-0",
          formPane: "absolute right-0 top-0 bottom-0 w-full md:w-[36%] min-h-[320px] md:min-h-screen bg-white flex items-center justify-center z-10",
          formPaneStyle: {},
        };
    }
  }, [loginPageLayout]);

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

  if (galleryRemoved) {
    return <GalleryRemoved />;
  }

  return (
    <div className="min-h-screen bg-white">
      <FullPageLoading
        isVisible={shouldShowLoading}
        text={isLoggingIn ? defaultLoginPageConfig.submitLoadingLabel : "Ładowanie..."}
      />
      <div className={layoutClasses.container} style={{ visibility: isPublicInfoLoading ? 'hidden' : 'visible' }}>
        <div className={layoutClasses.coverPane}>
          <LoginCoverPane
            galleryId={galleryId}
            apiUrl={apiUrl}
            onPublicInfoLoadingChange={handlePublicInfoLoadingChange}
            onPublicInfoLoaded={handlePublicInfoLoaded}
            onGalleryRemoved={handleGalleryRemoved}
            loginPageLayout={loginPageLayout}
          />
        </div>
        <div className={layoutClasses.formPane} style={layoutClasses.formPaneStyle}>
          {loginPageLayout === "angled-split" && (
            <div
              className="absolute left-0 top-0 bottom-0 w-px bg-gray-200"
              style={{
                transform: "skewX(-8deg)",
                transformOrigin: "top left",
              }}
            />
          )}
          <div
            className={loginPageLayout === "angled-split" ? "angled-split-form-wrapper" : "w-full"}
          >
            <LoginFormPane
              galleryId={galleryId}
              apiUrl={apiUrl}
              galleryName={galleryName}
              onLoginStart={handleLoginStart}
              onLoginComplete={handleLoginComplete}
              onGalleryRemoved={handleGalleryRemoved}
              loginPageLayout={loginPageLayout}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <LoginScreen />;
}
