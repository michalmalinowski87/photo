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
import { DownloadOverlay } from "@/components/gallery/DownloadOverlay";

export default function GalleryPage() {
  const params = useParams();
  const router = useRouter();
  const { token, galleryId, galleryName, isAuthenticated, isLoading } = useAuth();
  const id = params?.id as string;
  const [gridLayout, setGridLayout] = useState<GridLayout>("marble");
  const { download: downloadImage, downloadState, closeOverlay } = useImageDownload();
  const openGalleryRef = useRef<((index: number) => void) | null>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !token || !galleryId)) {
      if (id) {
        router.push(`/login/${id}`);
      }
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
        // Reset to marble layout after opening
        setGridLayout("marble");
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }
  }, [gridLayout, images.length]);

  const handleDownload = useCallback(async (imageKey: string) => {
    if (!galleryId || !token || !imageKey) {
      return;
    }

    try {
      await downloadImage({
        galleryId,
        token,
        imageKey,
      });
    } catch (error) {
      console.error("Failed to download image:", error);
      // Error is handled by the download hook and shown in overlay
    }
  }, [galleryId, token, downloadImage]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Ładowanie...</div>
      </div>
    );
  }

  if (!isAuthenticated || !token || !galleryId) {
    return null; // Redirect is happening
  }

  if (imagesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Ładowanie zdjęć...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-600">Błąd ładowania galerii: {String(error)}</div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-background">
      <ContextMenuPrevention />
      <DownloadOverlay
        isVisible={downloadState.showOverlay}
        isError={downloadState.isError}
        onClose={closeOverlay}
      />
      <GalleryTopBar 
        galleryName={galleryName || undefined}
        gridLayout={gridLayout}
        onGridLayoutChange={setGridLayout}
      />
      <div className="container mx-auto px-4 py-8">
        <LightGalleryWrapper
          images={images}
          galleryId={galleryId || undefined}
          onDownload={handleDownload}
          onGalleryReady={(openGallery) => {
            openGalleryRef.current = openGallery;
          }}
        >
          <VirtuosoGridComponent
            images={images}
            layout={gridLayout === "carousel" ? "marble" : gridLayout}
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
