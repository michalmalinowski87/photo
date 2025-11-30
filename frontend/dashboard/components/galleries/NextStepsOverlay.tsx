import { useRouter } from "next/router";
import React, { useEffect, useState, useCallback, useRef } from "react";

import { useBottomRightOverlay } from "../../context/BottomRightOverlayContext";
import { useToast } from "../../hooks/useToast";
import api from "../../lib/api-service";
import { useGalleryStore } from "../../store/gallerySlice";

interface Gallery {
  galleryId: string;
  originalsBytesUsed?: number;
  paymentStatus?: string;
  state?: string;
  selectionEnabled?: boolean;
  [key: string]: unknown;
}

interface Order {
  orderId: string;
  [key: string]: unknown;
}

interface NextStepsOverlayProps {
  gallery: Gallery | null;
  orders?: Order[];
  galleryLoading?: boolean;
}

interface Step {
  id: string;
  label: string;
  completed: boolean | null; // null means step doesn't apply (e.g., send step for non-selection galleries)
}

export const NextStepsOverlay: React.FC<NextStepsOverlayProps> = ({
  gallery,
  orders = [],
  galleryLoading = false,
}) => {
  const router = useRouter();
  const { showToast } = useToast();
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const overlayContext = useBottomRightOverlay();
  const galleryStore = useGalleryStore();
  // Use type assertions to fix Zustand type inference issues
  const nextStepsOverlayExpanded = (galleryStore as { nextStepsOverlayExpanded: boolean }).nextStepsOverlayExpanded;
  const setNextStepsOverlayExpanded = (galleryStore as { setNextStepsOverlayExpanded: (expanded: boolean) => void }).setNextStepsOverlayExpanded;
  
  const [tutorialDisabled, setTutorialDisabled] = useState<boolean | null>(null);
  const [isSavingPreference, setIsSavingPreference] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [optimisticBytesUsed, setOptimisticBytesUsed] = useState<number | null>(null);
  const [widthReached13rem, setWidthReached13rem] = useState(false);
  const galleryRef = useRef(gallery);
  
  // Keep ref in sync with gallery prop
  useEffect(() => {
    galleryRef.current = gallery;
  }, [gallery]);
  
  // Check if we should hide the overlay (settings or publish view)
  const shouldHide = Boolean(
    router.pathname?.includes("/settings") ||
    (router.query.publish === "true" && router.query.galleryId === gallery?.galleryId)
  );

  // Load tutorial preference - deferred until overlay is expanded or user interacts
  const loadTutorialPreference = useCallback(async () => {
    // Check if we already have the preference cached
    if (tutorialDisabled !== null) {
      return; // Already loaded
    }

    try {
      const businessInfo = await api.auth.getBusinessInfo();
      const disabled =
        businessInfo.tutorialNextStepsDisabled === true ||
        businessInfo.tutorialClientSendDisabled === true;
      setTutorialDisabled(disabled);
    } catch (error) {
      console.error("Failed to load tutorial preference:", error);
      // Default to showing if we can't load preference
      setTutorialDisabled(false);
    }
  }, [tutorialDisabled]);

  // Load preference when overlay is expanded (user shows interest)
  useEffect(() => {
    if (nextStepsOverlayExpanded && tutorialDisabled === null) {
      void loadTutorialPreference();
    }
  }, [nextStepsOverlayExpanded, tutorialDisabled, loadTutorialPreference]);

  // Calculate steps with debouncing to prevent flickering
  // Use optimistic bytes if available for immediate updates
  const calculateSteps = useCallback((): Step[] => {
    if (!gallery || galleryLoading) {
      return [];
    }

    // Use optimistic bytes if available (for instant updates during uploads/deletions)
    // Otherwise use gallery.originalsBytesUsed
    const currentBytes = optimisticBytesUsed ?? gallery.originalsBytesUsed ?? 0;
    const uploadCompleted = currentBytes > 0;
    const publishCompleted =
      gallery.paymentStatus === "PAID" || gallery.state === "PAID_ACTIVE";
    const sendCompleted =
      gallery.selectionEnabled !== false ? orders.length > 0 : null;

    return [
      {
        id: "upload",
        label: "Prześlij zdjęcia",
        completed: uploadCompleted,
      },
      {
        id: "publish",
        label: "Opublikuj galerię",
        completed: publishCompleted,
      },
      {
        id: "send",
        label: "Wyślij do klienta",
        completed: sendCompleted,
      },
    ];
  }, [gallery, galleryLoading, orders.length, optimisticBytesUsed]);

  // Update steps with debouncing
  useEffect(() => {
    if (!gallery || galleryLoading) {
      setSteps([]);
      return;
    }

    // Debounce updates to prevent flickering
    const timeoutId = setTimeout(() => {
      setSteps(calculateSteps());
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [gallery, galleryLoading, orders.length, calculateSteps]);

  // Listen for gallery updates with optimistic updates (when photos are added/removed)
  useEffect(() => {
    if (!gallery?.galleryId) {
      return;
    }

    const handleGalleryUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ 
        galleryId?: string; 
        sizeDelta?: number; 
        isUpload?: boolean;
      }>;
      
      // Only react to updates for this gallery
      if (customEvent.detail?.galleryId !== gallery.galleryId && customEvent.detail?.galleryId) {
        return;
      }

      // If sizeDelta is provided, update optimistically (instant UI update)
      if (customEvent.detail?.sizeDelta !== undefined) {
        const sizeDelta = customEvent.detail.sizeDelta;
        
        // Optimistic update: immediately adjust bytes
        setOptimisticBytesUsed((prev) => {
          const currentGalleryBytes = galleryRef.current?.originalsBytesUsed ?? 0;
          // Use prev if available (even if it's 0), only fall back to gallery if prev is null
          const currentBytes = prev ?? currentGalleryBytes;
          const newBytes = Math.max(0, currentBytes + sizeDelta);
          return newBytes;
        });
        
        // Recalculate steps immediately with optimistic value
        setSteps(calculateSteps());
      } else {
        // No sizeDelta - this is a refresh event (e.g., after polling completes)
        // Clear optimistic state if it matches the gallery value (confirmed by reload)
        setOptimisticBytesUsed((prev) => {
          if (prev === null) {
            return null; // Already cleared
          }
          const currentGalleryBytes = galleryRef.current?.originalsBytesUsed ?? 0;
          // If gallery shows 0, clear optimistic state
          if (currentGalleryBytes === 0) {
            return null;
          }
          // If optimistic value matches gallery value (within small tolerance), clear it
          if (Math.abs(prev - currentGalleryBytes) < 1000) {
            // Close enough (within 1KB tolerance for rounding), clear optimistic state
            return null;
          }
          // Keep optimistic value if it doesn't match
          return prev;
        });
        
        // Recalculate steps with confirmed gallery data
        setSteps(calculateSteps());
      }
    };

    const handleOrdersUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ galleryId?: string }>;
      // Only react to updates for this gallery
      if (customEvent.detail?.galleryId === gallery.galleryId || !customEvent.detail?.galleryId) {
        // Recalculate steps when orders change
        setSteps(calculateSteps());
      }
    };

    window.addEventListener("galleryUpdated", handleGalleryUpdate);
    window.addEventListener("galleryOrdersUpdated", handleOrdersUpdate);

    return () => {
      window.removeEventListener("galleryUpdated", handleGalleryUpdate);
      window.removeEventListener("galleryOrdersUpdated", handleOrdersUpdate);
    };
  }, [gallery?.galleryId, calculateSteps]);

  // Check if all applicable steps are completed (calculate before early return)
  const applicableSteps = steps.filter((step) => step.completed !== null);
  const allCompleted = applicableSteps.length > 0 && applicableSteps.every((step) => step.completed);


  // Measure and report width to context (if available)
  useEffect(() => {
    if (!overlayRef.current || !overlayContext) {
      return;
    }

    // Use ResizeObserver for accurate width measurement
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        const widthInRem = width / 16; // Convert px to rem (assuming 16px base)
        
        // Check if width has reached 13rem (208px)
        if (widthInRem >= 13) {
          setWidthReached13rem(true);
        } else if (!nextStepsOverlayExpanded) {
          setWidthReached13rem(false);
        }
        
        if (nextStepsOverlayExpanded) {
          overlayContext.setNextStepsWidth(width);
        } else {
          overlayContext.setNextStepsCollapsedWidth(width);
        }
      }
    });

    resizeObserver.observe(overlayRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [nextStepsOverlayExpanded, overlayContext]);

  // Update context when visibility or expansion state changes (if context available)
  useEffect(() => {
    if (!overlayContext) {
      return;
    }

    const shouldBeVisible =
      !shouldHide &&
      tutorialDisabled !== true && 
      !!gallery && 
      !galleryLoading && 
      steps.length > 0;
    overlayContext.setNextStepsVisible(Boolean(shouldBeVisible));
    overlayContext.setNextStepsExpanded(Boolean(nextStepsOverlayExpanded));
  }, [
    tutorialDisabled,
    gallery,
    galleryLoading,
    steps.length,
    nextStepsOverlayExpanded,
    overlayContext,
    shouldHide,
  ]);

  // Also watch for changes in gallery.originalsBytesUsed and orders to update steps immediately
  // This ensures steps update when photos are added/removed even if the gallery object reference doesn't change
  // Skip if we have optimistic bytes (means we're in the middle of uploads/deletions)
  useEffect(() => {
    if (!gallery || galleryLoading) {
      return;
    }
    
    // If we have optimistic bytes, skip this update - the event handler will update when ready
    if (optimisticBytesUsed !== null) {
      return;
    }
    
    // Recalculate steps when key gallery properties change
    const newSteps = calculateSteps();
    setSteps(newSteps);
  }, [
    gallery?.originalsBytesUsed, 
    gallery?.paymentStatus, 
    gallery?.state, 
    orders.length, 
    calculateSteps, 
    gallery, 
    galleryLoading,
    optimisticBytesUsed
  ]);
  
  // Reset optimistic bytes when gallery changes
  useEffect(() => {
    setOptimisticBytesUsed(null);
  }, [gallery?.galleryId]);

  // Auto-collapse if all steps are completed (must be before early return)
  useEffect(() => {
    if (allCompleted && nextStepsOverlayExpanded && gallery && !galleryLoading && steps.length > 0) {
      const timeoutId = setTimeout(() => {
        setNextStepsOverlayExpanded(false);
      }, 3000); // Auto-collapse after 3 seconds if all completed

      return () => {
        clearTimeout(timeoutId);
      };
    }
    return undefined;
  }, [allCompleted, nextStepsOverlayExpanded, gallery, galleryLoading, steps.length, setNextStepsOverlayExpanded]);

  const handleDontShowAgain = async (): Promise<void> => {
    // Load preference first if not loaded (needed for update)
    if (tutorialDisabled === null) {
      await loadTutorialPreference();
    }

    setIsSavingPreference(true);
    try {
      await api.auth.updateBusinessInfo({
        tutorialNextStepsDisabled: true,
      });
      setTutorialDisabled(true);
      showToast(
        "info",
        "Ukryto",
        "Ten panel nie będzie już wyświetlany"
      );
    } catch (error) {
      console.error("Failed to save tutorial preference:", error);
      showToast("error", "Błąd", "Nie udało się zapisać preferencji");
    } finally {
      setIsSavingPreference(false);
    }
  };

  // Calculate visibility (but keep component mounted to prevent flickering)
  const isVisible = !shouldHide && 
                    tutorialDisabled !== true && 
                    !!gallery && 
                    !galleryLoading && 
                    steps.length > 0;

  // Check if gallery is paid for send step (only if gallery exists)
  const isPaid = gallery ? (gallery.paymentStatus === "PAID" || gallery.state === "PAID_ACTIVE") : false;

  const handlePublishClick = () => {
    if (gallery?.galleryId) {
      // Trigger publish wizard via custom event (same as sidebar button)
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("openPublishWizard", { detail: { galleryId: gallery.galleryId } }));
      }
    }
  };

  const handleUploadClick = () => {
    if (gallery?.galleryId) {
      void router.push(`/galleries/${gallery.galleryId}/photos`);
    }
  };

  const handleSendClick = () => {
    if (gallery?.galleryId && isPaid) {
      // Trigger send link via custom event (same as sidebar button)
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("sendGalleryLink", { detail: { galleryId: gallery.galleryId } }));
      }
    }
  };

  // Don't render at all if tutorial is permanently disabled
  if (tutorialDisabled === true) {
    return null;
  }

  return (
    <div
      ref={overlayRef}
      className={`fixed bottom-4 right-4 z-40 max-w-[calc(100vw-2rem)] ${
        isVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
      style={{
        width: nextStepsOverlayExpanded ? "17rem" : "4rem",
        transition: "width 400ms cubic-bezier(0.4, 0, 0.2, 1)",
        transformOrigin: "bottom right",
      }}
      data-expanded={nextStepsOverlayExpanded}
    >
      {/* Main container with refined shadows and backdrop */}
      <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border border-gray-200/80 dark:border-gray-700/80 rounded-2xl shadow-theme-xl overflow-hidden transition-all duration-300 hover:shadow-theme-lg">
        {/* Header with refined typography and spacing */}
        <button
          onClick={() => {
            setNextStepsOverlayExpanded(!nextStepsOverlayExpanded);
          }}
          className={`w-full flex items-center ${
            nextStepsOverlayExpanded ? "justify-between px-5" : "justify-center"
          } py-4 border-b border-gray-100 dark:border-gray-800/50 transition-all duration-200 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 active:bg-gray-100/50 dark:active:bg-gray-800/50`}
          aria-label={nextStepsOverlayExpanded ? "Zwiń" : "Rozwiń"}
          title={nextStepsOverlayExpanded ? "Zwiń" : "Rozwiń - Ukończ konfigurację"}
        >
          {nextStepsOverlayExpanded ? (
            <>
              <h3 
                className="text-[15px] font-semibold tracking-[-0.01em] text-gray-900 dark:text-gray-50"
                style={{
                  transition: "opacity 200ms ease-out",
                  opacity: nextStepsOverlayExpanded && widthReached13rem ? 1 : 0,
                }}
              >
                Ukończ konfigurację
              </h3>
              <svg
                className="w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform duration-200 hover:text-gray-600 dark:hover:text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </>
          ) : (
            <svg
              className="w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform duration-200 hover:text-gray-600 dark:hover:text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          )}
        </button>

        {/* Content with refined spacing and visual hierarchy */}
        <div ref={contentRef}>
          <div className={`px-5 ${nextStepsOverlayExpanded ? "py-5" : "py-4"} space-y-2.5`}>
            {steps.map((step) => {
              if (step.completed === null) {
                return null;
              }

              const isDisabled = step.id === "send" && !isPaid;

              return (
                <button
                  key={step.id}
                  onClick={() => {
                    if (!step.completed && !isDisabled) {
                      if (step.id === "upload") {
                        handleUploadClick();
                      } else if (step.id === "publish") {
                        handlePublishClick();
                      } else if (step.id === "send") {
                        handleSendClick();
                      }
                    }
                  }}
                  disabled={step.completed || isDisabled}
                  className={`group w-full flex items-center ${
                    nextStepsOverlayExpanded ? "gap-3.5 px-3.5 py-3.5" : "justify-center py-2.5"
                  } rounded-xl text-left transition-all duration-200 ${
                    nextStepsOverlayExpanded
                      ? step.completed
                        ? "bg-gradient-to-br from-success-50 to-success-25 dark:from-success-950/30 dark:to-success-900/20 cursor-default shadow-sm"
                        : isDisabled
                          ? "bg-gray-50/50 dark:bg-gray-800/30 opacity-60 cursor-not-allowed"
                          : "bg-gray-50/80 dark:bg-gray-800/40 hover:bg-gray-100/80 dark:hover:bg-gray-700/50 hover:shadow-theme-sm cursor-pointer active:scale-[0.98]"
                      : "hover:bg-gray-50/50 dark:hover:bg-gray-800/30 cursor-pointer"
                  }`}
                >
                  {/* Status indicator with refined styling */}
                  <div
                    className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${
                      step.completed
                        ? "bg-gradient-to-br from-success-500 to-success-600 dark:from-success-500 dark:to-success-600 text-white shadow-lg shadow-success-500/25 scale-100"
                        : "bg-gray-200 dark:bg-gray-700 border-2 border-gray-300/50 dark:border-gray-600/50"
                    } ${!step.completed && !isDisabled ? "group-hover:border-brand-400 dark:group-hover:border-brand-500 group-hover:bg-gray-100 dark:group-hover:bg-gray-600" : ""}`}
                  >
                    {step.completed ? (
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : (
                      <div className={`w-2.5 h-2.5 rounded-full transition-colors ${
                        isDisabled 
                          ? "bg-gray-400 dark:bg-gray-500" 
                          : "bg-gray-400 dark:bg-gray-500 group-hover:bg-brand-500"
                      }`} />
                    )}
                  </div>

                  {/* Label with refined typography */}
                  <div
                    className={`flex-1 ${
                      nextStepsOverlayExpanded ? "opacity-100" : "opacity-0 w-0 overflow-hidden"
                    }`}
                    style={{
                      transition: "opacity 200ms ease-out",
                      transitionDelay: nextStepsOverlayExpanded ? "450ms" : "0ms",
                    }}
                  >
                    <span
                      className={`text-[14px] font-medium tracking-[-0.01em] whitespace-nowrap ${
                        step.completed
                          ? "text-success-700 dark:text-success-400"
                          : isDisabled
                            ? "text-gray-500 dark:text-gray-500"
                            : "text-gray-800 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-gray-100"
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer with refined styling - Always reserves space for text */}
          <div className="relative px-5 py-3.5 border-t border-gray-100 dark:border-gray-800/50 bg-gradient-to-b from-transparent to-gray-50/30 dark:to-gray-900/30 h-[52px] flex items-center justify-center">
            {/* Invisible spacer to maintain height when collapsed */}
            <div 
              className="absolute inset-0 flex items-center justify-center"
              aria-hidden="true"
            >
              <span className="text-[12px] text-transparent text-center py-1.5">
                Zamknij i nie pokazuj tego ponownie
              </span>
            </div>
            {/* Visible button that fades in - using div to avoid browser button styling artifacts */}
            <div
              onClick={() => {
                if (!isSavingPreference && tutorialDisabled !== null && nextStepsOverlayExpanded) {
                  void handleDontShowAgain();
                }
              }}
              className={`relative w-full text-[12px] font-medium text-center py-1.5 cursor-pointer select-none ${
                isSavingPreference || tutorialDisabled === null || !nextStepsOverlayExpanded
                  ? "opacity-40 cursor-not-allowed"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
              style={{
                transition: "opacity 200ms ease-out",
                transitionDelay: nextStepsOverlayExpanded ? "600ms" : "0ms",
                opacity: nextStepsOverlayExpanded ? 1 : 0,
                pointerEvents: nextStepsOverlayExpanded ? "auto" : "none",
                background: "transparent",
                border: "none",
                outline: "none",
                boxShadow: "none",
                borderRadius: nextStepsOverlayExpanded ? "0.375rem" : "0",
              }}
              onMouseEnter={(e) => {
                if (nextStepsOverlayExpanded && !isSavingPreference && tutorialDisabled !== null) {
                  e.currentTarget.style.background = "rgba(243, 244, 246, 0.5)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
              onMouseDown={(e) => {
                if (nextStepsOverlayExpanded && !isSavingPreference && tutorialDisabled !== null) {
                  e.currentTarget.style.background = "rgba(229, 231, 235, 0.5)";
                }
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
              role="button"
              tabIndex={nextStepsOverlayExpanded && !isSavingPreference && tutorialDisabled !== null ? 0 : -1}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !isSavingPreference && tutorialDisabled !== null && nextStepsOverlayExpanded) {
                  e.preventDefault();
                  void handleDontShowAgain();
                }
              }}
            >
              {isSavingPreference ? "Zapisywanie..." : "Zamknij i nie pokazuj tego ponownie"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

