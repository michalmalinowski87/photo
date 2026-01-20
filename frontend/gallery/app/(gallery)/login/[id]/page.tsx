"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { LoginCoverPane } from "@/components/login/LoginCoverPane";
import { LoginFormPane } from "@/components/login/LoginFormPane";
import { getPublicApiUrl } from "@/lib/public-env";

function LoginScreen() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuth();
  const galleryId = params?.id as string;

  const [apiUrl, setApiUrl] = useState("");
  const [galleryName, setGalleryName] = useState<string | null>(null);

  useEffect(() => {
    setApiUrl(getPublicApiUrl());
  }, []);

  // Check if already logged in
  useEffect(() => {
    const isLoginPreview = searchParams?.get("loginPreview") === "1";
    if (isLoginPreview) {
      return;
    }

    if (isAuthenticated && galleryId) {
      router.replace(`/${galleryId}`);
    }
  }, [galleryId, router, isAuthenticated, searchParams]);

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

  return (
    <div className="min-h-screen bg-white">
      <div className="min-h-screen flex flex-col md:flex-row">
        <LoginCoverPane
          galleryId={galleryId}
          apiUrl={apiUrl}
          onPublicInfoLoaded={(info) => setGalleryName(info.galleryName)}
        />
        <LoginFormPane galleryId={galleryId} apiUrl={apiUrl} galleryName={galleryName} />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <LoginScreen />;
}
