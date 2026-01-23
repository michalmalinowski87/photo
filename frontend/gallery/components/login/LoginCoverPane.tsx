"use client";

import React from "react";
import Image from "next/image";
import { apiFetch } from "@/lib/api";
import { CoverAreaLoading } from "@/components/ui/CoverAreaLoading";
import { PhotoCloudMark } from "@/components/branding/PhotoCloudMark";
import { getQuoteForGallery, getRotatingQuoteForGallery } from "@/lib/quotes";

export interface GalleryPublicInfo {
  galleryName: string | null;
  coverPhotoUrl: string | null;
}

export function LoginCoverPane({
  galleryId,
  apiUrl,
  onPublicInfoLoaded,
  onPublicInfoLoadingChange,
}: {
  galleryId: string;
  apiUrl: string;
  onPublicInfoLoaded?: (info: GalleryPublicInfo) => void;
  onPublicInfoLoadingChange?: (loading: boolean) => void;
}) {
  const [publicInfo, setPublicInfo] = React.useState<GalleryPublicInfo | null>(null);
  // Start with the cover loader visible (per requested UX).
  const [isLoading, setIsLoading] = React.useState(true);
  const fetchControllerRef = React.useRef<AbortController | null>(null);
  const lastFetchedRef = React.useRef<{ galleryId: string; apiUrl: string } | null>(null);

  React.useEffect(() => {
    if (!galleryId || !apiUrl) {
      // If we can't fetch yet, keep loader until we can.
      // But ensure parent knows we're still loading
      if (!galleryId || !apiUrl) {
        onPublicInfoLoadingChange?.(true);
      }
      return;
    }

    // If we already fetched for this exact galleryId/apiUrl combination, don't fetch again
    if (
      lastFetchedRef.current &&
      lastFetchedRef.current.galleryId === galleryId &&
      lastFetchedRef.current.apiUrl === apiUrl &&
      publicInfo !== null
    ) {
      return;
    }

    // If there's already a fetch in progress, abort it and start a new one
    if (fetchControllerRef.current) {
      fetchControllerRef.current.abort();
    }

    const controller = new AbortController();
    fetchControllerRef.current = controller;
    setIsLoading(true);
    onPublicInfoLoadingChange?.(true);

    (async () => {
      try {
        const { data } = await apiFetch(`${apiUrl}/galleries/${galleryId}/public-info`, {
          method: "GET",
          signal: controller.signal,
        });

        const info = data as GalleryPublicInfo;
        setPublicInfo(info);
        lastFetchedRef.current = { galleryId, apiUrl };
        onPublicInfoLoaded?.(info);
      } catch {
        // Non-blocking: if we can't load public info, assume no cover and show PhotoCloud fallback.
        setPublicInfo({ galleryName: null, coverPhotoUrl: null });
      } finally {
        // Only update state if this request wasn't aborted
        if (!controller.signal.aborted) {
          setIsLoading(false);
          onPublicInfoLoadingChange?.(false);
          fetchControllerRef.current = null;
        }
      }
    })();

    return () => {
      controller.abort();
      fetchControllerRef.current = null;
    };
  }, [galleryId, apiUrl, onPublicInfoLoaded, onPublicInfoLoadingChange]);

  const coverPhotoUrl = publicInfo?.coverPhotoUrl || null;
  const isResolved = publicInfo !== null;
  // Important: initial render must be deterministic to avoid hydration mismatch.
  const [quote, setQuote] = React.useState(() => getQuoteForGallery(galleryId));

  React.useEffect(() => {
    // Rotate after mount (client-only). This avoids server/client text mismatch on hydration.
    setQuote(getRotatingQuoteForGallery(galleryId));
  }, [galleryId]);

  return (
    <section className="relative w-full md:w-[55%] min-h-[320px] md:min-h-screen overflow-hidden bg-gray-50">
      {/* Workflow: start with loader → then render cover OR fallback once resolved */}
      {isResolved ? (
        coverPhotoUrl ? (
          <Image
            src={coverPhotoUrl}
            alt=""
            fill
            className="object-cover object-center"
            priority
            unoptimized={coverPhotoUrl.startsWith("http")}
            sizes="(max-width: 768px) 100vw, 55vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-full max-w-xl px-10 text-center">
              <PhotoCloudMark variant="full" className="mx-auto" />

              {quote ? (
                <figure className="mt-10 mx-auto max-w-lg">
                  <blockquote className="relative text-base md:text-lg text-gray-700/60 leading-relaxed italic">
                    <span className="absolute -left-3 -top-6 text-6xl text-gray-900/35 select-none">“</span>
                    {quote.text}
                  </blockquote>
                  <figcaption className="mt-4 text-sm text-gray-700/55 text-right">
                    — {quote.author}
                  </figcaption>
                  {quote.work ? (
                    <div className="mt-1 text-xs text-gray-600/45 text-right">
                      {quote.work}
                    </div>
                  ) : null}
                </figure>
              ) : (
                <div className="mt-8 text-sm text-gray-600">
                  Profesjonalne galerie dla fotografów.
                </div>
              )}
            </div>
          </div>
        )
      ) : null}

      {/* Loader overlay: cover pane only, never blocks the login form */}
      {isLoading && <CoverAreaLoading />}
    </section>
  );
}

