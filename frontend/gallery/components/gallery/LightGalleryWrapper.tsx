"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ImageData } from "@/types/gallery";
import { LightGalleryToolbarButtons } from "./LightGalleryToolbarButtons";

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
  onDownload?: (imageKey: string) => void; // Receives image key, not URL
  onGalleryReady?: (openGallery: (index: number) => void) => void;
  onPrefetchNextPage?: () => void; // Callback to prefetch next page of images
  hasNextPage?: boolean; // Whether there are more pages to load
  onGalleryClose?: () => void; // Callback when gallery is closed
  enableDownload?: boolean; // Whether to enable download button (disabled during selection stage)
  selectedKeys?: Set<string>;
  onImageSelect?: (key: string) => void;
  canSelect?: boolean;
  showSelectionIndicators?: boolean;
  baseLimit?: number;
  extraPriceCents?: number;
  currentSelectedCount?: number;
  showPhotoBookUi?: boolean;
  showPhotoPrintUi?: boolean;
  photoBookKeys?: string[];
  photoPrintKeys?: string[];
  photoBookCount?: number;
  photoPrintCount?: number;
  onTogglePhotoBook?: (key: string) => void;
  onTogglePhotoPrint?: (key: string) => void;
}

export function LightGalleryWrapper({
  children,
  images,
  galleryId,
  onDownload,
  onGalleryReady,
  onPrefetchNextPage,
  hasNextPage = false,
  onGalleryClose,
  enableDownload = false, // Default to false for selection stage
  selectedKeys = new Set(),
  onImageSelect,
  canSelect = false,
  showSelectionIndicators = false,
  baseLimit = 0,
  extraPriceCents = 0,
  currentSelectedCount = 0,
  showPhotoBookUi = false,
  showPhotoPrintUi = false,
  photoBookKeys = [],
  photoPrintKeys = [],
  photoBookCount = 0,
  photoPrintCount = 0,
  onTogglePhotoBook,
  onTogglePhotoPrint,
}: LightGalleryWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const galleryInstanceRef = useRef<any>(null);
  const imagesLengthRef = useRef<number>(0);
  const downloadHandlerRef = useRef<((e: Event) => void) | null>(null);
  const onDownloadRef = useRef(onDownload);
  const imagesRef = useRef(images);
  const onPrefetchNextPageRef = useRef(onPrefetchNextPage);
  const hasNextPageRef = useRef(hasNextPage);
  const onGalleryCloseRef = useRef(onGalleryClose);
  const prefetchTriggeredRef = useRef(false);
  const slideChangeHandlerRef = useRef<((e: Event) => void) | null>(null);
  const isGalleryOpenRef = useRef(false);
  const currentGalleryIndexRef = useRef<number>(0);
  const selectedKeysRef = useRef(selectedKeys);
  const isGalleryReadyRef = useRef(false);
  const onImageSelectRef = useRef(onImageSelect);
  const canSelectRef = useRef(canSelect);
  const baseLimitRef = useRef(baseLimit);
  const extraPriceCentsRef = useRef(extraPriceCents);
  const currentSelectedCountRef = useRef(currentSelectedCount);
  const showPhotoBookUiRef = useRef(showPhotoBookUi);
  const showPhotoPrintUiRef = useRef(showPhotoPrintUi);
  const photoBookKeysRef = useRef(photoBookKeys);
  const photoPrintKeysRef = useRef(photoPrintKeys);
  const photoBookCountRef = useRef(photoBookCount);
  const photoPrintCountRef = useRef(photoPrintCount);
  const onTogglePhotoBookRef = useRef(onTogglePhotoBook);
  const onTogglePhotoPrintRef = useRef(onTogglePhotoPrint);
  const [toolbarEl, setToolbarEl] = useState<HTMLElement | null>(null);
  const [currentGalleryIndex, setCurrentGalleryIndex] = useState(0);
  const setToolbarElRef = useRef(setToolbarEl);
  const setCurrentGalleryIndexRef = useRef(setCurrentGalleryIndex);
  setToolbarElRef.current = setToolbarEl;
  setCurrentGalleryIndexRef.current = setCurrentGalleryIndex;

  useEffect(() => {
    onDownloadRef.current = onDownload;
    imagesRef.current = images;
    onPrefetchNextPageRef.current = onPrefetchNextPage;
    hasNextPageRef.current = hasNextPage;
    onGalleryCloseRef.current = onGalleryClose;
    selectedKeysRef.current = selectedKeys;
    onImageSelectRef.current = onImageSelect;
    canSelectRef.current = canSelect;
    baseLimitRef.current = baseLimit;
    extraPriceCentsRef.current = extraPriceCents;
    currentSelectedCountRef.current = currentSelectedCount;
    showPhotoBookUiRef.current = showPhotoBookUi;
    showPhotoPrintUiRef.current = showPhotoPrintUi;
    photoBookKeysRef.current = photoBookKeys;
    photoPrintKeysRef.current = photoPrintKeys;
    photoBookCountRef.current = photoBookCount;
    photoPrintCountRef.current = photoPrintCount;
    onTogglePhotoBookRef.current = onTogglePhotoBook;
    onTogglePhotoPrintRef.current = onTogglePhotoPrint;
    if (images.length > imagesLengthRef.current) {
      prefetchTriggeredRef.current = false;
    }
  }, [onDownload, images, onPrefetchNextPage, hasNextPage, onGalleryClose, selectedKeys, onImageSelect, canSelect, baseLimit, extraPriceCents, currentSelectedCount, showPhotoBookUi, showPhotoPrintUi, photoBookKeys, photoPrintKeys, photoBookCount, photoPrintCount, onTogglePhotoBook, onTogglePhotoPrint]);

  // Keyboard support while LightGallery is open:
  // Space / Enter toggles selection for the current photo.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isGalleryOpenRef.current) return;
      if (!canSelectRef.current || !onImageSelectRef.current) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.repeat) return;

      const isActivationKey = e.key === "Enter" || e.key === " " || e.code === "Space";
      if (!isActivationKey) return;

      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
        // If the selection button itself is focused, let the browser's native button activation handle it.
        if (target.closest?.(".lg-selection-toggle")) return;
      }

      e.preventDefault();
      e.stopPropagation();

      // Prefer clicking the actual toolbar button so its label updates consistently.
      const btn = document.querySelector<HTMLButtonElement>(".lg-toolbar .lg-selection-toggle");
      if (btn) {
        btn.click();
        return;
      }

      // Fallback: toggle selection directly.
      const galleryInstance = galleryInstanceRef.current;
      const currentIndex = galleryInstance?.index ?? currentGalleryIndexRef.current;
      const currentImage = imagesRef.current[currentIndex];
      if (currentImage?.key) {
        onImageSelectRef.current(currentImage.key);
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

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
      // Disable start animation to prevent initialization animation when updateSlides is called
      startAnimationDuration: 0, // Set to 0 to disable zoom from image animation
      startClass: "", // Empty string to prevent start class from being applied
      enableSwipe: true,
      enableDrag: true,
      loop: false, // Disable looping - prevents going back from first item when pages are loading
      hideControlOnEnd: true, // Hide prev/next buttons on first/last image
      // Show prev/next controls with custom styling
      controls: true,
      // Thumbnail plugin config
      thumbnail: true,
      animateThumb: true,
      currentPagerPosition: "middle",
      thumbWidth: 80,
      thumbHeight: 80,
      thumbMargin: 4,
      enableThumbDrag: true,
      enableThumbSwipe: true,
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
      // Download plugin config - only enable when final photos are delivered
      download: enableDownload,
      // Explicitly enable close button (should be default, but making it explicit)
      close: true,
      // Mobile settings - ensure close button is always visible even when download is enabled
      // This fixes a known lightGallery issue where close button disappears when download is enabled
      mobileSettings: {
        controls: true,
        showCloseIcon: true,
        download: enableDownload,
        rotate: true,
      },
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
        
        // Mark as not ready during initialization
        isGalleryReadyRef.current = false;
        if (containerRef.current) {
          containerRef.current.removeAttribute('data-lg-ready');
        }

        // Initialize lightgallery with selector to target anchor tags with data-src
        const galleryInstance = lightGallery(containerRef.current, getGalleryConfig(galleryId));

        galleryInstanceRef.current = galleryInstance;
        imagesLengthRef.current = imagesRef.current.length;
        isGalleryReadyRef.current = true;
        
        // Mark container as ready so anchor clicks can proceed
        if (containerRef.current) {
          containerRef.current.setAttribute('data-lg-ready', 'true');
        }
        
        // Track gallery open/close state
        const handleGalleryOpen = () => {
          isGalleryOpenRef.current = true;
          setTimeout(() => {
            const toolbar = document.querySelector('.lg-toolbar');
            if (canSelectRef.current && toolbar) {
              setToolbarElRef.current?.(toolbar as HTMLElement);
              const idx = galleryInstanceRef.current?.index ?? 0;
              setCurrentGalleryIndexRef.current?.(idx);
            }
          }, 100);
          // Ensure close button exists - fix for lightGallery bug where close button disappears when download is enabled
          setTimeout(() => {
            const toolbar = document.querySelector('.lg-toolbar');
            const closeBtn = toolbar?.querySelector('.lg-close');
            
            // If close button is missing, create it
            if (toolbar && !closeBtn) {
              const newCloseBtn = document.createElement('button');
              newCloseBtn.className = 'lg-close lg-icon';
              newCloseBtn.setAttribute('aria-label', 'Close');
              newCloseBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
              newCloseBtn.onclick = () => {
                if (galleryInstanceRef.current) {
                  galleryInstanceRef.current.closeGallery();
                }
              };
              toolbar.appendChild(newCloseBtn);
            }
          }, 200);
        };
        
        const handleGalleryClose = () => {
          isGalleryOpenRef.current = false;
          setToolbarElRef.current?.(null);
          if (onGalleryCloseRef.current) {
            onGalleryCloseRef.current();
          }
        };
        
        // Listen to gallery open/close events
        if (containerRef.current) {
          containerRef.current.addEventListener('lgAfterOpen', handleGalleryOpen);
          containerRef.current.addEventListener('lgBeforeClose', handleGalleryClose);
        }

        // Intercept download button clicks - use document-level listener since lightGallery creates buttons dynamically
        // Only set up download handler if downloads are enabled
        if (enableDownload && onDownloadRef.current) {
          // Remove existing handler if any
          if (downloadHandlerRef.current) {
            document.removeEventListener('click', downloadHandlerRef.current, true);
          }
          
          // Listen for clicks on download buttons at document level
          const downloadClickHandler = (e: Event) => {
            const target = e.target as HTMLElement;
            // Check if clicked element is a download button or inside one
            const downloadButton = target.closest('.lg-download, [data-lg-download]');
            if (downloadButton) {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              
              // Get current slide index from lightGallery instance
              const currentIndex = galleryInstance?.index ?? 0;
              const currentImage = imagesRef.current[currentIndex];
              
              if (currentImage && currentImage.key && onDownloadRef.current) {
                // Pass the image key - the handler will use it correctly
                onDownloadRef.current(currentImage.key);
              }
            }
          };

          // Store handler in ref for cleanup
          downloadHandlerRef.current = downloadClickHandler;
          
          // Add event listener at document level with capture phase to catch before lightGallery
          document.addEventListener('click', downloadClickHandler, true);
        }

        // Listen to slide change events to prefetch next page when approaching end
        // AND ensure thumbnails update properly on slide change
        if (containerRef.current) {
          // Remove existing handler if any
          if (slideChangeHandlerRef.current) {
            containerRef.current.removeEventListener('lgAfterSlide', slideChangeHandlerRef.current);
          }
          
          const handleSlideChange = (event: any) => {
            const currentIndex = event.detail?.index ?? galleryInstance?.index ?? 0;
            currentGalleryIndexRef.current = currentIndex;
            setCurrentGalleryIndexRef.current?.(currentIndex);
            const totalImages = imagesRef.current.length;
            const imagesUntilEnd = totalImages - currentIndex - 1;
            
            // Ensure thumbnail container scrolls to show active thumbnail
            // lightGallery should handle this automatically, but we ensure it happens
            if (galleryInstance) {
              try {
                // Get all thumbnails - lightGallery uses .lg-thumb-item class
                const thumbnails = document.querySelectorAll('.lg-thumb-item');
                
                // Ensure current index is within bounds
                if (currentIndex >= 0 && currentIndex < thumbnails.length) {
                  const activeThumb = thumbnails[currentIndex] as HTMLElement;
                  
                  if (activeThumb) {
                    // Scroll active thumbnail into view smoothly
                    activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                  }
                }
              } catch (error) {
                // Ignore errors - thumbnail scrolling is non-critical
              }
            }
            
            // Prefetch when within 40 images of the end for much earlier loading
            // This ensures images are ready well before the user reaches them
            if (imagesUntilEnd <= 40 && hasNextPageRef.current && !prefetchTriggeredRef.current && onPrefetchNextPageRef.current) {
              prefetchTriggeredRef.current = true;
              onPrefetchNextPageRef.current();
            }
          };

          // Store handler in ref for cleanup
          slideChangeHandlerRef.current = handleSlideChange;
          
          // lightGallery fires 'lgAfterSlide' event after slide change
          containerRef.current.addEventListener('lgAfterSlide', handleSlideChange);
        }

        // Expose method to open gallery at specific index
        if (onGalleryReady) {
          onGalleryReady((index: number) => {
            if (galleryInstance && typeof galleryInstance.openGallery === 'function') {
              galleryInstance.openGallery(index);
              // Check if we should prefetch immediately when opening near the end
              const totalImages = imagesRef.current.length;
              const imagesUntilEnd = totalImages - index - 1;
              if (imagesUntilEnd <= 40 && hasNextPageRef.current && onPrefetchNextPageRef.current) {
                // Small delay to ensure gallery is open
                setTimeout(() => {
                  if (hasNextPageRef.current && onPrefetchNextPageRef.current && !prefetchTriggeredRef.current) {
                    prefetchTriggeredRef.current = true;
                    onPrefetchNextPageRef.current();
                  }
                }, 500);
              }
            } else if (containerRef.current) {
              // Fallback: programmatically click the first anchor tag
              const anchors = containerRef.current.querySelectorAll<HTMLAnchorElement>('a[data-src]');
              if (anchors[index]) {
                anchors[index].click();
              }
            }
          });
        }
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
      // Clean up download click handler
      if (downloadHandlerRef.current) {
        document.removeEventListener('click', downloadHandlerRef.current, true);
        downloadHandlerRef.current = null;
      }
      // Clean up slide change listener
      if (containerRef.current && slideChangeHandlerRef.current) {
        containerRef.current.removeEventListener('lgAfterSlide', slideChangeHandlerRef.current);
        slideChangeHandlerRef.current = null;
      }
      if (galleryInstanceRef.current) {
        try {
          galleryInstanceRef.current.destroy();
        } catch (error) {
          console.error("Error destroying lightgallery:", error);
        }
        galleryInstanceRef.current = null;
      }
    };
  }, [galleryId, enableDownload]); // Include enableDownload in dependencies

  // Refresh gallery when images change (for infinite scroll)
  useEffect(() => {
    if (!galleryInstanceRef.current || !containerRef.current) return;
    
    // Only refresh if the number of images has increased (new images loaded)
    if (imagesRef.current.length > imagesLengthRef.current) {
      try {
        // Reset prefetch trigger when new images are loaded
        prefetchTriggeredRef.current = false;
        
        // If gallery is currently open, use updateSlides to add new items dynamically
        if (isGalleryOpenRef.current && galleryInstanceRef.current) {
          // Store current index
          const currentIndex = galleryInstanceRef.current?.index ?? currentGalleryIndexRef.current;
          currentGalleryIndexRef.current = currentIndex;
          
          // Get current gallery items
          const currentItems = galleryInstanceRef.current.galleryItems || [];
          const oldLength = imagesLengthRef.current;
          const newLength = imagesRef.current.length;
          
          // Get new images that were added (from oldLength to newLength)
          const newImages = imagesRef.current.slice(oldLength);
          
          // Create new gallery items from new images
          const newItems = newImages.map((image) => {
            const imageUrl = image.bigThumbUrl || image.thumbnailUrl || image.url;
            const previewUrl = image.previewUrl || image.url;
            // Best available: original never exposed in gallery app, so use preview
            const fullImageUrl = image.url ?? image.previewUrl ?? image.bigThumbUrl ?? image.thumbnailUrl;
            const carouselThumbUrl = image.thumbnailUrl || (image as any).thumbUrl || image.bigThumbUrl || image.url;
            
            return {
              src: fullImageUrl,
              thumb: carouselThumbUrl,
              subHtml: image.key || '',
            };
          });
          
          // Combine existing items with new items
          const updatedItems = [...currentItems, ...newItems];
          
          // Update slides using updateSlides method (works when gallery is open)
          // Temporarily disable start animation to prevent preview element initialization animation
          try {
            const originalSpeed = galleryInstanceRef.current.settings?.speed ?? 400;
            const originalStartAnimationDuration = galleryInstanceRef.current.settings?.startAnimationDuration ?? 0;
            const originalStartClass = galleryInstanceRef.current.settings?.startClass ?? "";
            
            // Disable start animation during update to prevent initialization animation
            if (galleryInstanceRef.current.settings) {
              galleryInstanceRef.current.settings.speed = 0;
              galleryInstanceRef.current.settings.startAnimationDuration = 0; // Disable start animation
              galleryInstanceRef.current.settings.startClass = ""; // Prevent start class
            }
            
            // Update slides without animation
            galleryInstanceRef.current.updateSlides(updatedItems, currentIndex);
            
            // Restore original settings after update completes
            setTimeout(() => {
              if (galleryInstanceRef.current?.settings) {
                galleryInstanceRef.current.settings.speed = originalSpeed;
                galleryInstanceRef.current.settings.startAnimationDuration = originalStartAnimationDuration;
                galleryInstanceRef.current.settings.startClass = originalStartClass;
              }
            }, 50);
          } catch (error) {
            console.error('Failed to update slides:', error);
          }
          
          // Update images length ref to prevent re-triggering
          imagesLengthRef.current = imagesRef.current.length;
          
          return; // Exit early - don't destroy/recreate
        }
        
        // Gallery is closed - safe to destroy and recreate
        
        // Destroy and recreate to pick up new anchor tags
        galleryInstanceRef.current.destroy();
        galleryInstanceRef.current = null;
        imagesLengthRef.current = imagesRef.current.length;
        
        // Reinitialize after a short delay to ensure DOM is updated
        // Only proceed if plugins are loaded
        setTimeout(() => {
          if (!containerRef.current || !lightGallery || !lgThumbnail) return;
          
          const galleryInstance = lightGallery(containerRef.current, getGalleryConfig(galleryId));
          galleryInstanceRef.current = galleryInstance;
          
          // Track gallery open/close state for recreated instance
          const handleGalleryOpen = () => {
            isGalleryOpenRef.current = true;
            setTimeout(() => {
              const toolbar = document.querySelector('.lg-toolbar');
              if (canSelectRef.current && toolbar) {
                setToolbarElRef.current?.(toolbar as HTMLElement);
                const idx = galleryInstanceRef.current?.index ?? 0;
                setCurrentGalleryIndexRef.current?.(idx);
              }
            }, 100);
            // Ensure close button exists - fix for lightGallery bug where close button disappears when download is enabled
            setTimeout(() => {
              const toolbar = document.querySelector('.lg-toolbar');
              const closeBtn = toolbar?.querySelector('.lg-close');
              
              // If close button is missing, create it
              if (toolbar && !closeBtn) {
                const newCloseBtn = document.createElement('button');
                newCloseBtn.className = 'lg-close lg-icon';
                newCloseBtn.setAttribute('aria-label', 'Close');
                newCloseBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
                newCloseBtn.onclick = () => {
                  if (galleryInstance) {
                    galleryInstance.closeGallery();
                  }
                };
                toolbar.appendChild(newCloseBtn);
              }
            }, 200);
          };
          
          const handleGalleryClose = () => {
            isGalleryOpenRef.current = false;
            setToolbarElRef.current?.(null);
            if (onGalleryCloseRef.current) {
              onGalleryCloseRef.current();
            }
          };
          
          if (containerRef.current) {
            containerRef.current.addEventListener('lgAfterOpen', handleGalleryOpen);
            containerRef.current.addEventListener('lgBeforeClose', handleGalleryClose);
          }
          
          // Re-attach download handler after refresh - only if downloads are enabled
          if (enableDownload && onDownloadRef.current) {
            // Remove existing handler if any
            if (downloadHandlerRef.current) {
              document.removeEventListener('click', downloadHandlerRef.current, true);
            }
            
            const handleDownloadClick = (e: Event) => {
              const target = e.target as HTMLElement;
              const downloadButton = target.closest('.lg-download, [data-lg-download]');
              if (downloadButton) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                const currentIndex = galleryInstance?.index ?? 0;
                const currentImage = imagesRef.current[currentIndex];
                
                if (currentImage && currentImage.key && onDownloadRef.current) {
                  // Use the image key directly
                  onDownloadRef.current(currentImage.key);
                }
              }
            };

            // Store handler in ref for cleanup
            downloadHandlerRef.current = handleDownloadClick;
            document.addEventListener('click', handleDownloadClick, true);
          }
          
          // Re-attach slide change listener for prefetching and thumbnail updates
          if (containerRef.current) {
            // Remove existing handler if any
            if (slideChangeHandlerRef.current) {
              containerRef.current.removeEventListener('lgAfterSlide', slideChangeHandlerRef.current);
            }
            
            const handleSlideChange = (event: any) => {
              const currentIndex = event.detail?.index ?? galleryInstance?.index ?? 0;
              currentGalleryIndexRef.current = currentIndex;
              setCurrentGalleryIndexRef.current?.(currentIndex);
              const totalImages = imagesRef.current.length;
              const imagesUntilEnd = totalImages - currentIndex - 1;
              
              // Ensure thumbnail container scrolls to show active thumbnail
              if (galleryInstance) {
                try {
                  const thumbnails = document.querySelectorAll('.lg-thumb-item');
                  
                  // Ensure current index is within bounds
                  if (currentIndex >= 0 && currentIndex < thumbnails.length) {
                    const activeThumb = thumbnails[currentIndex] as HTMLElement;
                    
                    if (activeThumb) {
                      // Scroll active thumbnail into view smoothly
                      activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                    }
                  }
                } catch (error) {
                  // Ignore errors
                }
              }
              
              // Prefetch when within 40 images of the end for much earlier loading
              // This ensures images are ready well before the user reaches them
              if (imagesUntilEnd <= 40 && hasNextPageRef.current && !prefetchTriggeredRef.current && onPrefetchNextPageRef.current) {
                prefetchTriggeredRef.current = true;
                onPrefetchNextPageRef.current();
              }
            };

            // Store handler in ref for cleanup
            slideChangeHandlerRef.current = handleSlideChange;
            containerRef.current.addEventListener('lgAfterSlide', handleSlideChange);
          }
          
          // Expose method to open gallery at specific index
          if (onGalleryReady) {
            onGalleryReady((index: number) => {
              if (galleryInstance && typeof galleryInstance.openGallery === 'function') {
                galleryInstance.openGallery(index);
                // Check if we should prefetch immediately when opening near the end
                const totalImages = imagesRef.current.length;
                const imagesUntilEnd = totalImages - index - 1;
                if (imagesUntilEnd <= 40 && hasNextPageRef.current && onPrefetchNextPageRef.current) {
                  // Small delay to ensure gallery is open
                  setTimeout(() => {
                    if (hasNextPageRef.current && onPrefetchNextPageRef.current && !prefetchTriggeredRef.current) {
                      prefetchTriggeredRef.current = true;
                      onPrefetchNextPageRef.current();
                    }
                  }, 500);
                }
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
  }, [images.length, galleryId]); // images.length is stable, only changes when count changes

  // Note: lightgallery automatically detects anchor tags in the container
  // When images change (infinite scrolling), lightgallery will detect new anchor tags
  // No manual refresh needed - lightgallery handles it automatically

  return (
    <>
      <div ref={containerRef} data-lg-container>{children}</div>
      {toolbarEl &&
        canSelect &&
        onImageSelect &&
        createPortal(
          <LightGalleryToolbarButtons
            currentIndex={currentGalleryIndex}
            images={images}
            selectedKeys={selectedKeys}
            photoBookKeys={photoBookKeys ?? []}
            photoPrintKeys={photoPrintKeys ?? []}
            photoBookCount={photoBookCount ?? 0}
            photoPrintCount={photoPrintCount ?? 0}
            showPhotoBookUi={showPhotoBookUi}
            showPhotoPrintUi={showPhotoPrintUi}
            baseLimit={baseLimit}
            extraPriceCents={extraPriceCents}
            currentSelectedCount={currentSelectedCount}
            onImageSelect={onImageSelect}
            onTogglePhotoBook={onTogglePhotoBook}
            onTogglePhotoPrint={onTogglePhotoPrint}
          />,
          toolbarEl
        )}
    </>
  );
}
