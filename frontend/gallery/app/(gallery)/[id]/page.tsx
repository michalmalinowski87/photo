"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useCallback, useRef, useLayoutEffect } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { useGalleryImages } from "@/hooks/useGallery";
import { useImageDownload } from "@/hooks/useImageDownload";
import { GalleryTopBar } from "@/components/gallery/GalleryTopBar";
import { SecondaryMenu } from "@/components/gallery/SecondaryMenu";
import { VirtuosoGridComponent, type GridLayout } from "@/components/gallery/VirtuosoGrid";
import { LightGalleryWrapper } from "@/components/gallery/LightGalleryWrapper";
import { ContextMenuPrevention } from "@/components/gallery/ContextMenuPrevention";
import { DownloadOverlay } from "@/components/gallery/DownloadOverlay";

export default function GalleryPage() {
  const params = useParams();
  const router = useRouter();
  const { token, galleryId, isAuthenticated, isLoading } = useAuth();
  const id = params?.id as string;
  const [gridLayout, setGridLayout] = useState<GridLayout>("marble");
  const { download: downloadImage, downloadState, closeOverlay } = useImageDownload();
  const openGalleryRef = useRef<((index: number) => void) | null>(null);
  const hashPrefetchHandledRef = useRef(false);
  const openedFromCarouselRef = useRef(false);
  const layoutBeforeCarouselRef = useRef<GridLayout>("marble"); // Track layout before carousel was clicked
  
  // Use the ID from params as the stable galleryId (it doesn't change)
  const queryGalleryId = id || galleryId || "";

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !token || !galleryId)) {
      if (id) {
        router.replace(`/login/${id}`);
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
    prefetchNextPage,
  } = useGalleryImages(queryGalleryId, token, "thumb", 50);

  // All hooks must be called before any early returns
  const images = useMemo(() => {
    return data?.pages.flatMap((page) => page.images || []) || [];
  }, [data]);

  // Detect hash parameter on page load and prefetch enough pages to reach target slide
  useEffect(() => {
    if (typeof window === "undefined" || hashPrefetchHandledRef.current || !hasNextPage || isFetchingNextPage || imagesLoading || !data?.pages.length) return;
    
    // Parse hash to get target slide index
    // Format: #lg=gallery-{galleryId}&slide={index}
    const hash = window.location.hash;
    const slideMatch = hash.match(/slide=(\d+)/);
    if (!slideMatch) {
      hashPrefetchHandledRef.current = true; // No slide in hash, mark as handled
      return; // No slide parameter in hash
    }
    
    const targetSlideIndex = parseInt(slideMatch[1], 10);
    if (isNaN(targetSlideIndex) || targetSlideIndex < 0) {
      hashPrefetchHandledRef.current = true;
      return;
    }
    
    // Calculate how many pages we need (each page has 50 images)
    const imagesPerPage = 50;
    const currentImageCount = images.length;
    const pagesNeeded = Math.ceil((targetSlideIndex + 1) / imagesPerPage);
    const currentPages = data?.pages.length || 0;
    const pagesToFetch = pagesNeeded - currentPages;
    
    // Prefetch pages if needed
    if (pagesToFetch > 0 && hasNextPage) {
      hashPrefetchHandledRef.current = true; // Mark as handled to prevent re-running
      
      // Prefetch all needed pages sequentially
      const prefetchPages = async () => {
        for (let i = 0; i < pagesToFetch; i++) {
          if (!hasNextPage) break;
          await prefetchNextPage();
          // Small delay between prefetches to avoid overwhelming the server
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      };
      
      prefetchPages().catch((err) => {
        console.error('Error prefetching pages for hash navigation:', err);
      });
    } else {
      hashPrefetchHandledRef.current = true; // No pages to fetch, mark as handled
    }
  }, [images.length, data?.pages.length, hasNextPage, isFetchingNextPage, imagesLoading, prefetchNextPage]);

  // Aggressive prefetching: automatically prefetch next page when current page finishes loading
  // if user is in the lower portion of the page
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || !data?.pages.length) return;

    // Small delay to ensure DOM is updated after page load
    const timeoutId = setTimeout(() => {
      // Check if user is in the lower 60% of the page
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollPercentage = (scrollTop + windowHeight) / documentHeight;

      // If user is in lower 60% of page, automatically prefetch next page
      if (scrollPercentage > 0.4 && hasNextPage && !isFetchingNextPage) {
        prefetchNextPage();
      }
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [hasNextPage, isFetchingNextPage, prefetchNextPage, data?.pages.length]);

  // Handle carousel layout - open gallery when selected
  useEffect(() => {
    if (gridLayout === "carousel" && openGalleryRef.current && images.length > 0) {
      openedFromCarouselRef.current = true;
      
      // Small delay to ensure gallery is fully initialized
      const timeoutId = setTimeout(() => {
        // Open gallery at first image (index 0)
        // Layout reset will happen when gallery closes via onGalleryClose callback
        if (openGalleryRef.current) {
          openGalleryRef.current(0);
        }
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
    <div className="min-h-screen bg-white">
      <ContextMenuPrevention />
      <DownloadOverlay
        isVisible={downloadState.showOverlay}
        isError={downloadState.isError}
        onClose={closeOverlay}
      />
      <GalleryTopBar 
        gridLayout={gridLayout}
        onGridLayoutChange={(newLayout) => {
          // If switching to carousel, preserve the current layout
          if (newLayout === "carousel" && gridLayout !== "carousel") {
            layoutBeforeCarouselRef.current = gridLayout;
          }
          
          setGridLayout(newLayout);
        }}
      />
      <SecondaryMenu />
      <div className="w-full px-2 md:px-2 lg:px-2 py-4 md:py-4">
        <LightGalleryWrapper
          images={images}
          galleryId={galleryId || undefined}
          onDownload={handleDownload}
          onGalleryReady={(openGallery) => {
            openGalleryRef.current = openGallery;
          }}
          onPrefetchNextPage={prefetchNextPage}
          hasNextPage={hasNextPage || false}
          onGalleryClose={() => {
            if (openedFromCarouselRef.current) {
              setGridLayout("marble");
              openedFromCarouselRef.current = false;
              layoutBeforeCarouselRef.current = "marble"; // Reset the preserved layout
            }
          }}
        >
          <VirtuosoGridComponent
            images={images}
            layout={gridLayout === "carousel" ? layoutBeforeCarouselRef.current : gridLayout}
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
