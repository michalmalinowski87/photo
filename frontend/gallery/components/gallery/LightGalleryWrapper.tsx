"use client";

import { useEffect, useRef } from "react";
import type { ImageData } from "@/types/gallery";

// Suppress lightGallery license warnings in development - set up at module level
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalLog = console.log;
  
  const filterLightGalleryLicense = (message: string): boolean => {
    const lowerMessage = message.toLowerCase();
    return (lowerMessage.includes("lightgallery") || lowerMessage.includes("light gallery")) && 
           (lowerMessage.includes("license key") || 
            lowerMessage.includes("license") || 
            lowerMessage.includes("not valid for production") ||
            lowerMessage.includes("0000-0000-000-0000"));
  };
  
  console.warn = (...args: any[]) => {
    const message = args.map(arg => String(arg)).join(" ");
    if (filterLightGalleryLicense(message)) {
      return; // Suppress the warning
    }
    originalWarn.apply(console, args);
  };
  
  console.error = (...args: any[]) => {
    const message = args.map(arg => String(arg)).join(" ");
    if (filterLightGalleryLicense(message)) {
      return; // Suppress the error
    }
    originalError.apply(console, args);
  };
  
  console.log = (...args: any[]) => {
    const message = args.map(arg => String(arg)).join(" ");
    if (filterLightGalleryLicense(message)) {
      return; // Suppress the log
    }
    originalLog.apply(console, args);
  };
}

// Dynamic imports for lightgallery to avoid SSR issues
let lightGallery: any;
let lgThumbnail: any;
let lgZoom: any;
let lgFullscreen: any;
let lgHash: any;
let lgRotate: any;

interface LightGalleryWrapperProps {
  children: React.ReactNode;
  images: ImageData[];
  galleryId?: string;
  onDownload?: (imageUrl: string) => void;
  onGalleryReady?: (openGallery: (index: number) => void) => void;
}

export function LightGalleryWrapper({
  children,
  images,
  galleryId,
  onDownload,
  onGalleryReady,
}: LightGalleryWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const galleryInstanceRef = useRef<any>(null);
  const imagesLengthRef = useRef<number>(0);

  // Helper function to get gallery configuration
  const getGalleryConfig = (galleryId?: string) => {
    const isDevelopment = process.env.NODE_ENV === "development";
    
    return {
      selector: "a[data-src]", // Explicitly target anchor tags with data-src attribute
      plugins: [lgThumbnail, lgZoom, lgFullscreen, lgHash, lgRotate],
      // Use dev mode in development to suppress license warnings
      ...(isDevelopment ? { licenseKey: "0000-0000-000-0000" } : {}),
      speed: 400,
      mode: "lg-fade", // Smooth fade transition
      cssEasing: "ease-in-out",
      enableSwipe: true,
      enableDrag: true,
      // Hide default prev/next controls
      controls: false,
      // Thumbnail plugin config
      thumbnail: true,
      animateThumb: true,
      currentPagerPosition: "middle",
      thumbWidth: 80,
      thumbHeight: 80,
      thumbMargin: 4,
      enableThumbDrag: true,
      enableThumbSwipe: true,
      hideControlOnEnd: false,
      // Zoom plugin config - disable zoom UI buttons
      scale: 1.5,
      actualSize: false, // Hide actual size button
      enableZoomAfter: 300,
      showZoomInOutIcons: false, // Hide zoom in/out buttons
      // Hash plugin config (deep linking)
      hash: true,
      galleryId: galleryId ? `gallery-${galleryId}` : "gallery",
      // Rotate plugin - only enable rotate left/right, disable flip
      rotate: true,
      rotateLeft: true, // Enable rotate left button
      rotateRight: true, // Enable rotate right button
      flipVertical: false, // Disable flip vertical button
      flipHorizontal: false, // Disable flip horizontal button
      // Download plugin config
      download: true,
    };
  };

  // Initialize lightGallery
  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;

    // Dynamically import lightgallery
    const initGallery = async () => {
      try {
        // Load lightgallery (CSS will be handled via global imports or link tags)
        const lgModule = await import("lightgallery");
        lightGallery = lgModule.default;
        
        lgThumbnail = (await import("lightgallery/plugins/thumbnail")).default;
        lgZoom = (await import("lightgallery/plugins/zoom")).default;
        lgFullscreen = (await import("lightgallery/plugins/fullscreen")).default;
        lgHash = (await import("lightgallery/plugins/hash")).default;
        lgRotate = (await import("lightgallery/plugins/rotate")).default;
        // Note: Download functionality is built into lightGallery core, no separate plugin needed

        if (!containerRef.current || !lightGallery) {
          return;
        }

        // Destroy existing instance if it exists
        if (galleryInstanceRef.current) {
          try {
            galleryInstanceRef.current.destroy();
          } catch (error) {
            // Ignore errors during cleanup
          }
        }

        // Initialize lightgallery with selector to target anchor tags with data-src
        const galleryInstance = lightGallery(containerRef.current, getGalleryConfig(galleryId));

        galleryInstanceRef.current = galleryInstance;
        imagesLengthRef.current = images.length;

        // Expose method to open gallery at specific index
        if (onGalleryReady) {
          onGalleryReady((index: number) => {
            if (galleryInstance && typeof galleryInstance.openGallery === 'function') {
              galleryInstance.openGallery(index);
            } else if (containerRef.current) {
              // Fallback: programmatically click the first anchor tag
              const anchors = containerRef.current.querySelectorAll<HTMLAnchorElement>('a[data-src]');
              if (anchors[index]) {
                anchors[index].click();
              }
            }
          });
        }

        // Note: Download functionality removed - lightgallery doesn't have download plugin enabled
        // If download functionality is needed, enable the download plugin first
      } catch (error) {
        console.error("Failed to initialize lightgallery:", error);
      }
    };

    // Small delay to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      initGallery();
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      if (galleryInstanceRef.current) {
        try {
          galleryInstanceRef.current.destroy();
        } catch (error) {
          console.error("Error destroying lightgallery:", error);
        }
        galleryInstanceRef.current = null;
      }
    };
  }, [galleryId]); // Initialize once, don't depend on images or onDownload (download handler removed)

  // Refresh gallery when images change (for infinite scroll)
  useEffect(() => {
    if (!galleryInstanceRef.current || !containerRef.current) return;
    
    // Only refresh if the number of images has increased (new images loaded)
    if (images.length > imagesLengthRef.current) {
      try {
        // Destroy and recreate to pick up new anchor tags
        galleryInstanceRef.current.destroy();
        galleryInstanceRef.current = null;
        imagesLengthRef.current = images.length;
        
        // Reinitialize after a short delay to ensure DOM is updated
        // Only proceed if plugins are loaded
        setTimeout(() => {
          if (!containerRef.current || !lightGallery || !lgThumbnail) return;
          
          const galleryInstance = lightGallery(containerRef.current, getGalleryConfig(galleryId));
          galleryInstanceRef.current = galleryInstance;
          
          // Expose method to open gallery at specific index
          if (onGalleryReady) {
            onGalleryReady((index: number) => {
              if (galleryInstance && typeof galleryInstance.openGallery === 'function') {
                galleryInstance.openGallery(index);
              } else if (containerRef.current) {
                // Fallback: programmatically click the anchor tag at index
                const anchors = containerRef.current.querySelectorAll<HTMLAnchorElement>('a[data-src]');
                if (anchors[index]) {
                  anchors[index].click();
                }
              }
            });
          }
        }, 100);
      } catch (error) {
        console.error("Error refreshing lightgallery:", error);
      }
    }
  }, [images.length, galleryId]);

  // Note: lightgallery automatically detects anchor tags in the container
  // When images change (infinite scrolling), lightgallery will detect new anchor tags
  // No manual refresh needed - lightgallery handles it automatically

  return <div ref={containerRef}>{children}</div>;
}
