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
  const onImageSelectRef = useRef(onImageSelect);
  const canSelectRef = useRef(canSelect);
  
  // Keep refs in sync with latest values
  useEffect(() => {
    onDownloadRef.current = onDownload;
    imagesRef.current = images;
    onPrefetchNextPageRef.current = onPrefetchNextPage;
    hasNextPageRef.current = hasNextPage;
    onGalleryCloseRef.current = onGalleryClose;
    selectedKeysRef.current = selectedKeys;
    onImageSelectRef.current = onImageSelect;
    canSelectRef.current = canSelect;
    // Reset prefetch trigger when new images are loaded
    if (images.length > imagesLengthRef.current) {
      prefetchTriggeredRef.current = false;
    }
  }, [onDownload, images, onPrefetchNextPage, hasNextPage, onGalleryClose, selectedKeys, onImageSelect, canSelect]);

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
        imagesLengthRef.current = imagesRef.current.length;
        
        // Track gallery open/close state
        const handleGalleryOpen = () => {
          isGalleryOpenRef.current = true;
        };
        
        const handleGalleryClose = () => {
          isGalleryOpenRef.current = false;
          if (onGalleryCloseRef.current) {
            onGalleryCloseRef.current();
          }
        };
        
        // Listen to gallery open/close events
        if (containerRef.current) {
          containerRef.current.addEventListener('lgAfterOpen', handleGalleryOpen);
          containerRef.current.addEventListener('lgBeforeClose', handleGalleryClose);
        }

        // Add custom selection toggle button to toolbar if selection is enabled
        const addSelectionButton = () => {
          if (!canSelectRef.current || !onImageSelectRef.current) return;
          
          const toolbar = document.querySelector('.lg-toolbar');
          if (!toolbar) return;

          // Remove existing selection button if any
          const existingBtn = toolbar.querySelector('.lg-selection-toggle');
          if (existingBtn) existingBtn.remove();

          // Create selection toggle button
          const selectionBtn = document.createElement('button');
          selectionBtn.className = 'lg-icon lg-selection-toggle';
          selectionBtn.setAttribute('aria-label', 'Toggle selection');
          selectionBtn.style.cssText = 'min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center; cursor: pointer;';
          
          // Update button icon based on current selection state
          const updateButtonIcon = () => {
            if (!galleryInstance) return;
            const currentIndex = galleryInstance.index ?? 0;
            const currentImage = imagesRef.current[currentIndex];
            if (currentImage && selectedKeysRef.current.has(currentImage.key)) {
              selectionBtn.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              `;
              selectionBtn.setAttribute('aria-label', 'Odznacz zdjęcie');
            } else {
              selectionBtn.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              `;
              selectionBtn.setAttribute('aria-label', 'Zaznacz zdjęcie');
            }
          };

          // Initial icon update
          updateButtonIcon();

          // Handle click
          selectionBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!galleryInstance) return;
            const currentIndex = galleryInstance.index ?? 0;
            const currentImage = imagesRef.current[currentIndex];
            if (currentImage && onImageSelectRef.current) {
              onImageSelectRef.current(currentImage.key);
              // Update icon after a short delay to reflect new state
              setTimeout(updateButtonIcon, 100);
            }
          });

          // Insert before close button (last item)
          const closeBtn = toolbar.querySelector('.lg-close');
          if (closeBtn) {
            toolbar.insertBefore(selectionBtn, closeBtn);
          } else {
            toolbar.appendChild(selectionBtn);
          }

          // Update icon on slide change
          const updateOnSlideChange = () => {
            updateButtonIcon();
          };
          if (containerRef.current) {
            containerRef.current.addEventListener('lgAfterSlide', updateOnSlideChange);
          }
        };

        // Add button after gallery opens
        if (canSelectRef.current && onImageSelectRef.current) {
          const addButtonAfterOpen = () => {
            setTimeout(addSelectionButton, 100);
          };
          if (containerRef.current) {
            containerRef.current.addEventListener('lgAfterOpen', addButtonAfterOpen);
          }
          // Also try to add immediately if gallery is already open
          setTimeout(addSelectionButton, 200);
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
            const fullImageUrl = image.url;
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
          };
          
          const handleGalleryClose = () => {
            isGalleryOpenRef.current = false;
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
          
          // Re-attach selection button if selection is enabled
          if (canSelectRef.current && onImageSelectRef.current) {
            const addButtonAfterOpen = () => {
              setTimeout(() => {
                const toolbar = document.querySelector('.lg-toolbar');
                if (!toolbar) return;

                const existingBtn = toolbar.querySelector('.lg-selection-toggle');
                if (existingBtn) existingBtn.remove();

                const selectionBtn = document.createElement('button');
                selectionBtn.className = 'lg-icon lg-selection-toggle';
                selectionBtn.setAttribute('aria-label', 'Toggle selection');
                selectionBtn.style.cssText = 'min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center; cursor: pointer;';
                
                const updateButtonIcon = () => {
                  if (!galleryInstance) return;
                  const currentIndex = galleryInstance.index ?? 0;
                  const currentImage = imagesRef.current[currentIndex];
                  if (currentImage && selectedKeysRef.current.has(currentImage.key)) {
                    selectionBtn.innerHTML = `
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    `;
                    selectionBtn.setAttribute('aria-label', 'Odznacz zdjęcie');
                  } else {
                    selectionBtn.innerHTML = `
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    `;
                    selectionBtn.setAttribute('aria-label', 'Zaznacz zdjęcie');
                  }
                };

                updateButtonIcon();

                selectionBtn.addEventListener('click', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!galleryInstance) return;
                  const currentIndex = galleryInstance.index ?? 0;
                  const currentImage = imagesRef.current[currentIndex];
                  if (currentImage && onImageSelectRef.current) {
                    onImageSelectRef.current(currentImage.key);
                    setTimeout(updateButtonIcon, 100);
                  }
                });

                const closeBtn = toolbar.querySelector('.lg-close');
                if (closeBtn) {
                  toolbar.insertBefore(selectionBtn, closeBtn);
                } else {
                  toolbar.appendChild(selectionBtn);
                }

                if (containerRef.current) {
                  containerRef.current.addEventListener('lgAfterSlide', updateButtonIcon);
                }
              }, 100);
            };
            if (containerRef.current) {
              containerRef.current.addEventListener('lgAfterOpen', addButtonAfterOpen);
            }
            setTimeout(() => {
              const toolbar = document.querySelector('.lg-toolbar');
              if (toolbar) {
                addButtonAfterOpen();
              }
            }, 300);
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

  return <div ref={containerRef}>{children}</div>;
}
