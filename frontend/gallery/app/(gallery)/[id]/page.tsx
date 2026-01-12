"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { useGalleryImages } from "@/hooks/useGallery";
import { useImageDownload } from "@/hooks/useImageDownload";
import { GalleryTopBar } from "@/components/gallery/GalleryTopBar";
import { VirtuosoGridComponent, type GridLayout } from "@/components/gallery/VirtuosoGrid";
import { LightGalleryWrapper } from "@/components/gallery/LightGalleryWrapper";
import { ContextMenuPrevention } from "@/components/gallery/ContextMenuPrevention";

export default function GalleryPage() {
  const params = useParams();
  const router = useRouter();
  const { token, galleryId, galleryName, isAuthenticated, isLoading } = useAuth();
  const id = params?.id as string;
  const [gridLayout, setGridLayout] = useState<GridLayout>("standard");
  const { download: downloadImage } = useImageDownload();
  const openGalleryRef = useRef<((index: number) => void) | null>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !token || !galleryId)) {
      router.push(`/gallery/login/${id}`);
    }
  }, [isLoading, isAuthenticated, token, galleryId, id, router]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: imagesLoading,
    error,
  } = useGalleryImages(galleryId || "", token || "", "thumb", 50);

  // All hooks must be called before any early returns
  const images = useMemo(() => {
    return data?.pages.flatMap((page) => page.images || []) || [];
  }, [data]);

  // Handle carousel layout - open gallery when selected
  useEffect(() => {
    if (gridLayout === "carousel" && openGalleryRef.current && images.length > 0) {
      // Small delay to ensure gallery is fully initialized
      const timeoutId = setTimeout(() => {
        // Open gallery at first image (index 0)
        if (openGalleryRef.current) {
          openGalleryRef.current(0);
        }
        // Reset to standard layout after opening
        setGridLayout("standard");
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }
  }, [gridLayout, images.length]);

  const handleDownload = useCallback(async (imageUrl: string) => {
    // Extract image key from URL if needed, or use the URL directly
    // For now, try to extract key from URL or use full URL
    if (!galleryId || !token) return;

    // Extract key from URL (assuming URL format)
    const urlParts = imageUrl.split("/");
    const imageKey = urlParts[urlParts.length - 1] || imageUrl;

    try {
      await downloadImage({
        galleryId,
        token,
        imageKey,
      });
    } catch (error) {
      console.error("Failed to download image:", error);
      // Fallback: open URL in new tab
      window.open(imageUrl, "_blank");
    }
  }, [galleryId, token, downloadImage]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated || !token || !galleryId) {
    return null; // Redirect is happening
  }

  if (imagesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Loading images...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-600">Error loading gallery: {String(error)}</div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-background">
      <ContextMenuPrevention />
      <GalleryTopBar 
        galleryName={galleryName || undefined}
        gridLayout={gridLayout}
        onGridLayoutChange={setGridLayout}
      />
      <div className="container mx-auto px-4 py-8">
        <LightGalleryWrapper
          images={images}
          galleryId={galleryId || undefined}
          onGalleryReady={(openGallery) => {
            openGalleryRef.current = openGallery;
          }}
        >
          <VirtuosoGridComponent
            images={images}
            layout={gridLayout === "carousel" ? "standard" : gridLayout}
            hasNextPage={hasNextPage}
            onLoadMore={() => fetchNextPage()}
            isFetchingNextPage={isFetchingNextPage}
            galleryId={galleryId || undefined}
          />
        </LightGalleryWrapper>
      </div>
    </div>
  );
}
