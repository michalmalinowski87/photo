"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useSelection } from "@/hooks/useSelection";
import { useAuth } from "@/providers/AuthProvider";
import { hapticFeedback } from "@/utils/hapticFeedback";
import type { SelectionState } from "@/types/gallery";

interface ZipStatus {
  status?: "ready" | "generating" | "not_started" | "error";
  generating?: boolean;
  ready?: boolean;
  zipExists?: boolean;
  zipSize?: number;
  error?: {
    message: string;
    attempts: number;
    canRetry: boolean;
  };
}

interface SecondaryMenuProps {
  selectedCount?: number;
  onApproveSelection?: () => void;
  onRequestChanges?: () => void;
  onCancelChangeRequest?: () => void;
  viewMode?: "all" | "selected";
  onViewModeChange?: (mode: "all" | "selected") => void;
  showDeliveredView?: boolean;
  onDeliveredViewClick?: () => void;
  showUnselectedView?: boolean;
  onUnselectedViewClick?: () => void;
  isUnselectedViewActive?: boolean;
  showBoughtView?: boolean;
  onBoughtViewClick?: () => void;
  hasDeliveredOrders?: boolean;
  hasInitialApprovedSelection?: boolean;
  isLocked?: boolean;
  isWybraneViewActive?: boolean;
  showBuyMore?: boolean;
  onBuyMoreClick?: () => void;
  onDownloadZip?: () => void;
  zipStatus?: ZipStatus;
  showDownloadZip?: boolean;
  hasMultipleOrders?: boolean;
}

export function SecondaryMenu({
  selectedCount = 0,
  onApproveSelection,
  onRequestChanges,
  onCancelChangeRequest,
  viewMode = "all",
  onViewModeChange,
  showDeliveredView = false,
  onDeliveredViewClick,
  showUnselectedView,
  onUnselectedViewClick,
  isUnselectedViewActive = false,
  showBoughtView,
  onBoughtViewClick,
  hasDeliveredOrders = false,
  hasInitialApprovedSelection = false,
  isLocked = false,
  isWybraneViewActive = false,
  showBuyMore = false,
  onBuyMoreClick,
  onDownloadZip,
  zipStatus,
  showDownloadZip = true,
  hasMultipleOrders = false,
}: SecondaryMenuProps) {
  const { galleryId } = useAuth();
  const { data: selectionState } = useSelection(galleryId);
  const [scroll, setScroll] = useState(false);
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number } | null>(null);
  const buttonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastScrollStateRef = useRef<boolean>(false);

  // Determine current state - simplified to match page.tsx logic
  const state = selectionState
    ? selectionState.changeRequestPending
      ? "changesRequested"
      : selectionState.hasClientApprovedOrder
      ? "approved"
      : selectionState.hasDeliveredOrder
      ? "delivered"
      : selectionState.approved
      ? "approved"
      : "selecting"
    : "selecting";
  const shouldBeSticky = state === "selecting";

  // Determine if selection is enabled - locked when isLocked is true
  const isSelectionEnabled = useMemo(() => {
    if (isLocked) return false;
    return state === "selecting" || (isUnselectedViewActive && state === "delivered");
  }, [state, isUnselectedViewActive, isLocked]);

  const hasError = zipStatus?.status === "error";
  const zipCtaText = hasError
    ? "BRAK PLIKU ZIP"
    : zipStatus?.ready
    ? "POBIERZ ZIP"
    : zipStatus?.generating
    ? "GENEROWANIE ZIP"
    : "PRZYGOTOWYWANIE ZIP";
  const zipCtaAriaLabel = hasError
    ? "Brak pliku ZIP - skontaktuj się z fotografem"
    : zipStatus?.ready
    ? "Pobierz ZIP"
    : zipStatus?.generating
    ? "Generowanie ZIP"
    : "Przygotowywanie ZIP";


  useEffect(() => {
    let rafId: number | null = null;
    const handleScroll = () => {
      // Cancel any pending animation frame
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      rafId = requestAnimationFrame(() => {
        const scrollY = window.scrollY;
        const shouldBeScrolled = scrollY > 30;
        
        // Only update if state actually changed
        if (shouldBeScrolled !== lastScrollStateRef.current) {
          lastScrollStateRef.current = shouldBeScrolled;
          setScroll(shouldBeScrolled);
        }
        rafId = null;
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);

  // Update indicator position when active/hovered item changes or window resizes
  // Priority: show hover indicator when hovering, otherwise show active indicator
  const updateIndicatorPosition = useCallback(() => {
    // Determine which menu item is currently active based on view state
    // This matches the logic used in the isActive check below
    let computedActiveItem: string | null = null;
    if (state === "selecting") {
      computedActiveItem = "wybor";
    } else if (isWybraneViewActive) {
      computedActiveItem = "bought";
    } else if (showBoughtView) {
      computedActiveItem = "bought";
    } else if (isUnselectedViewActive) {
      computedActiveItem = "unselected";
    } else if (showDeliveredView && !showBoughtView && !isUnselectedViewActive) {
      computedActiveItem = "delivered";
    }
    
    // Always show indicator for active item when not hovering, or show hover indicator when hovering
    const indicatorItemId = hoveredItem || computedActiveItem || activeItem;
    if (!indicatorItemId) {
      setIndicatorStyle(null);
      return;
    }

    const button = buttonRefs.current[indicatorItemId];
    const nav = button?.closest('nav');
    
    if (button && nav) {
      const navRect = nav.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      
      setIndicatorStyle({
        left: buttonRect.left - navRect.left,
        width: buttonRect.width,
      });
    }
  }, [activeItem, hoveredItem, state, showDeliveredView, showBoughtView, isUnselectedViewActive, isWybraneViewActive]);

  useEffect(() => {
    updateIndicatorPosition();
  }, [updateIndicatorPosition]);

  useEffect(() => {
    const handleResize = () => {
      setTimeout(updateIndicatorPosition, 0);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateIndicatorPosition]);

  // Calculate selection limit display
  const baseLimit = selectionState?.pricingPackage?.includedCount ?? 0;
  const extraPriceCents = selectionState?.pricingPackage?.extraPriceCents ?? 0;
  // In "Niewybrane" view (delivered state), all photos are additional - no base limit applies
  const effectiveBaseLimit = isUnselectedViewActive ? 0 : baseLimit;
  // Compute overage locally for immediate UI correctness with optimistic selection updates.
  // Backend-provided overageCount/overageCents can lag behind selectedCount/selectedKeys changes.
  const computedOverageCount = extraPriceCents > 0 ? Math.max(0, selectedCount - effectiveBaseLimit) : 0;
  const computedOverageCents = computedOverageCount * extraPriceCents;
  // If extra-per-photo pricing is enabled, we still show the included limit (baseLimit),
  // and allow going over it (overageCount / overageCents).
  // If baseLimit is 0 and extra pricing exists, show "no limit" instead of "0".
  const limitDisplay = baseLimit > 0 ? baseLimit.toString() : extraPriceCents > 0 ? "no limit" : "0";
  // In unselected view (buy more), can approve if at least one photo is selected
  // In regular selecting state, can approve if selectedCount >= baseLimit
  const canApprove = isUnselectedViewActive ? selectedCount > 0 : selectedCount >= baseLimit;

  // Format price in PLN
  const formatPrice = (cents: number) => {
    return `${(cents / 100).toFixed(2)} zł`;
  };

  // Simplified menu items based on unified section visibility logic
  // Sections: "wybor" (selecting), "wybrane" (initial approved), "dostarczone" (delivered),
  // "dokupione" (buy-more approved), "niewybrane" (unselected)
  const getMenuItems = () => {
    const items: Array<{ id: string; label: string }> = [];

    // Always show "WYBÓR ZDJĘĆ" when in selecting state
    if (state === "selecting") {
      items.push({ id: "wybor", label: "WYBÓR ZDJĘĆ" });
      return items;
    }

    // Show "DOSTARCZONE" when delivered orders exist (always visible if exists)
    if (hasDeliveredOrders) {
      items.push({ id: "delivered", label: "DOSTARCZONE" });
    }

    // Show "WYBRANE" (initial approval) or "DOKUPIONE" (buy-more) based on context
    // Unified logic: same section, different label
    if (showBoughtView !== undefined) {
      // Label depends on whether delivered orders exist
      const label = hasDeliveredOrders ? "DOKUPIONE" : "WYBRANE";
      items.push({ id: "bought", label });
    } else if (hasInitialApprovedSelection && !hasDeliveredOrders) {
      // Show "WYBRANE" for initial approval when no delivered orders
      items.push({ id: "bought", label: "WYBRANE ZDJĘCIA" });
    }

    // Show "NIEWYBRANE" if unselected photos exist and price per photo > 0
    if (showUnselectedView === true && extraPriceCents > 0) {
      items.push({ id: "unselected", label: "NIEWYBRANE" });
    }

    return items;
  };

  const menuItems = getMenuItems();

  // Set default active item based on state on mount and when state changes
  useEffect(() => {
    if (state === "selecting") {
      setActiveItem("wybor");
    } else if (isWybraneViewActive) {
      // When in "wybrane" view (initial approval), make "WYBRANE ZDJĘCIA" button active
      setActiveItem("bought");
    } else if ((state === "approved" || state === "changesRequested") && viewMode === "all") {
      setActiveItem("delivered");
    } else if ((state === "approved" || state === "changesRequested") && viewMode === "selected") {
      setActiveItem("bought");
    } else if (state === "delivered" || state === "approved" || state === "changesRequested") {
      if (showBoughtView) {
        setActiveItem("bought");
      } else if (isUnselectedViewActive) {
        // Use the actual view state to determine active item
        setActiveItem("unselected");
      } else {
        setActiveItem("delivered");
      }
    }
  }, [state, viewMode, isUnselectedViewActive, showBoughtView, showDeliveredView, isWybraneViewActive]);

  const handleItemClick = (itemId: string) => {
    hapticFeedback('light');
    setActiveItem(itemId);
    if (itemId === "all" && onViewModeChange) {
      onViewModeChange("all");
    } else if (itemId === "selected" && onViewModeChange) {
      onViewModeChange("selected");
    } else if (itemId === "delivered" && onDeliveredViewClick) {
      onDeliveredViewClick();
    } else if (itemId === "bought" && onBoughtViewClick) {
      onBoughtViewClick();
    } else if (itemId === "unselected" && onUnselectedViewClick) {
      onUnselectedViewClick();
    }
  };

  const handleItemHover = (itemId: string | null) => {
    setHoveredItem(itemId);
  };

  const handleApproveButtonHover = (isHovering: boolean) => {
    if (isHovering) {
      setHoveredItem("approve");
    } else {
      setHoveredItem(null);
    }
  };

  // Check if approve button should be active (always active in selecting state or unselected view when enabled)
  const isApproveActive = (state === "selecting" || isUnselectedViewActive) && canApprove;

  return (
    <nav
      className={`${shouldBeSticky ? "sticky top-20 md:top-24 z-[99998]" : "relative"} w-full bg-white transition-colors duration-300 ease-in-out ${
        scroll
          ? "bg-white/80 backdrop-blur-md backdrop-saturate-150"
          : "bg-white"
      }`}
      style={{ willChange: 'background-color' }}
    >
      {/* Separator line at the top with indicator inside */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gray-200 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        {indicatorStyle && !scroll && (
          <div
            className="absolute top-0 h-full bg-gray-400 opacity-60 transition-all duration-200"
            style={{
              left: `${indicatorStyle.left}px`,
              width: `${indicatorStyle.width}px`,
            }}
          />
        )}
      </div>
      
      <div className="w-full mx-auto px-8 md:px-12 lg:px-16 py-1.5" style={{ height: '44px', display: 'flex', alignItems: 'center' }}>
        <div className="flex items-center justify-end relative w-full" style={{ height: '44px' }}>
          {/* Left: Menu items */}
          <div className={`flex items-center gap-4 md:gap-6 lg:gap-8 transition-opacity duration-300 ease-in-out ${
            scroll ? "opacity-0 w-0 overflow-hidden pointer-events-none max-w-0" : "opacity-100 w-auto flex-1 max-w-full"
          }`} style={{ 
            transition: 'opacity 300ms ease-in-out, max-width 300ms ease-in-out',
            willChange: scroll ? 'opacity, max-width' : 'auto'
          }}>
            {menuItems.map((item) => {
              const isActive =
                (item.id === "all" && viewMode === "all") ||
                (item.id === "selected" && viewMode === "selected") ||
                (item.id === "wybor" && state === "selecting") ||
                (item.id === "delivered" && showDeliveredView && !showBoughtView && !isUnselectedViewActive && !isWybraneViewActive) ||
                (item.id === "bought" && (showBoughtView || isWybraneViewActive)) ||
                (item.id === "unselected" && isUnselectedViewActive);
              const isHovered = hoveredItem === item.id;
              
              return (
                <button
                  key={item.id}
                  ref={(el) => {
                    buttonRefs.current[item.id] = el;
                  }}
                  onClick={() => handleItemClick(item.id)}
                  onMouseEnter={() => handleItemHover(item.id)}
                  onMouseLeave={() => handleItemHover(null)}
                  className="relative py-2 uppercase text-sm transition-all touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
                  style={{
                    color: isActive || isHovered ? "#666666" : "#AAAAAA",
                    fontWeight: isActive || isHovered ? "700" : "500",
                    letterSpacing: "0.05em",
                  }}
                  aria-label={item.label}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Right: Selection status + Actions */}
          <div className="flex items-center justify-end gap-6 sm:gap-8 ml-auto flex-shrink-0" style={{ alignSelf: 'center' }}>
            {/* Selection status display - HIDE when in DOSTARCZONE view (only show ZIP-related UI) */}
            {!showDeliveredView && isSelectionEnabled && state === "selecting" && extraPriceCents > 0 && computedOverageCount > 0 && (
              <span className="text-xs text-gray-400 whitespace-nowrap">
                Dodatkowe ujęcia {computedOverageCount} × {formatPrice(extraPriceCents)} ={" "}
                {formatPrice(computedOverageCents)}
              </span>
            )}
            {!showDeliveredView && isSelectionEnabled && state === "selecting" && (
              <span className="text-xs text-gray-400 whitespace-nowrap">
                Wybrane: {selectedCount} / {limitDisplay}
              </span>
            )}

            {/* Niewybrane view status - show price calculation for all selected photos */}
            {!showDeliveredView && isSelectionEnabled && isUnselectedViewActive && extraPriceCents > 0 && selectedCount > 0 && (
              <span className="text-xs text-gray-400 whitespace-nowrap">
                Dodatkowe ujęcia {selectedCount} × {formatPrice(extraPriceCents)} ={" "}
                {formatPrice(selectedCount * extraPriceCents)}
              </span>
            )}
            {!showDeliveredView && isSelectionEnabled && isUnselectedViewActive && (
              <span className="text-xs text-gray-400 whitespace-nowrap">
                Wybrane: {selectedCount}
              </span>
            )}

            {/* Action buttons - HIDE all when in DOSTARCZONE view (only show ZIP-related UI) */}
            {/* Unified approve/buy button: "ZATWIERDŹ WYBÓR" or "KUP WIĘCEJ ZDJĘĆ" based on context */}
            {/* Locked when isLocked is true (approved, changesRequested, or hasClientApprovedOrder) */}
            {!showDeliveredView && !isLocked && (state === "selecting" || (isUnselectedViewActive && state === "delivered")) && onApproveSelection && (
              <button
                ref={(el) => {
                  buttonRefs.current["approve"] = el;
                }}
                onClick={() => {
                  hapticFeedback('medium');
                  onApproveSelection();
                }}
                disabled={!canApprove}
                onMouseEnter={() => handleApproveButtonHover(true)}
                onMouseLeave={() => handleApproveButtonHover(false)}
                className={`relative py-2 uppercase text-sm transition-all touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center whitespace-nowrap ${
                  !canApprove ? "opacity-50 cursor-not-allowed" : ""
                }`}
                style={{
                  color: (isApproveActive || hoveredItem === "approve") ? "#666666" : "#AAAAAA",
                  fontWeight: (isApproveActive || hoveredItem === "approve") ? "700" : "500",
                  letterSpacing: "0.05em",
                }}
                aria-label={isUnselectedViewActive ? "Kup więcej zdjęć" : "Zatwierdź wybór"}
              >
                {isUnselectedViewActive ? "KUP WIĘCEJ ZDJĘĆ" : "ZATWIERDŹ WYBÓR"}
              </button>
            )}

            {/* Show "Request Changes" button when locked (approved/changesRequested) and can request changes */}
            {/* Available in locked states (view-only with ability to request changes) */}
            {!showDeliveredView && isLocked && 
              !selectionState?.changeRequestPending && 
              !selectionState?.changeRequestsBlocked &&
              onRequestChanges && (
              <button
                ref={(el) => {
                  buttonRefs.current["requestChanges"] = el;
                }}
                onClick={() => {
                  hapticFeedback('medium');
                  onRequestChanges();
                }}
                onMouseEnter={() => handleItemHover("requestChanges")}
                onMouseLeave={() => handleItemHover(null)}
                className={`relative py-2 uppercase text-sm transition-all touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center whitespace-nowrap ${
                  scroll ? "opacity-0 w-0 overflow-hidden pointer-events-none" : "opacity-100 w-auto"
                }`}
                style={{
                  color: hoveredItem === "requestChanges" ? "#666666" : "#AAAAAA",
                  fontWeight: hoveredItem === "requestChanges" ? "700" : "500",
                  letterSpacing: "0.05em",
                }}
                aria-label="Poproś o zmiany"
              >
                POPROŚ O ZMIANY
              </button>
            )}

            {!showDeliveredView && state === "changesRequested" && onCancelChangeRequest && (
              <button
                ref={(el) => {
                  buttonRefs.current["cancelRequest"] = el;
                }}
                onClick={() => {
                  hapticFeedback('medium');
                  onCancelChangeRequest();
                }}
                onMouseEnter={() => handleItemHover("cancelRequest")}
                onMouseLeave={() => handleItemHover(null)}
                className={`relative py-2 uppercase text-sm transition-all touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center whitespace-nowrap ${
                  scroll ? "opacity-0 w-0 overflow-hidden pointer-events-none" : "opacity-100 w-auto"
                }`}
                style={{
                  color: hoveredItem === "cancelRequest" ? "#666666" : "#AAAAAA",
                  fontWeight: hoveredItem === "cancelRequest" ? "700" : "500",
                  letterSpacing: "0.05em",
                }}
                aria-label="Anuluj prośbę o zmiany"
              >
                ANULUJ PROŚBĘ
              </button>
            )}

            {/* ZIP download button - show when in DOSTARCZONE view (showDeliveredView) OR when state is delivered, but hide if multiple orders */}
            {(showDeliveredView || state === "delivered") && onDownloadZip && showDownloadZip && !hasMultipleOrders && (
              <button
                ref={(el) => {
                  buttonRefs.current["downloadZip"] = el;
                }}
                onClick={() => {
                  if (!hasError) {
                    hapticFeedback('medium');
                    onDownloadZip();
                  }
                }}
                disabled={hasError}
                onMouseEnter={() => {
                  if (!hasError) {
                    handleItemHover("downloadZip");
                  }
                }}
                onMouseLeave={() => handleItemHover(null)}
                className={`relative h-[44px] py-2 uppercase text-sm transition-all touch-manipulation min-w-[44px] flex items-center justify-center whitespace-nowrap gap-2 overflow-hidden ${
                  scroll ? "opacity-0 w-0 overflow-hidden pointer-events-none" : "opacity-100 w-auto"
                } ${hasError ? "cursor-not-allowed" : ""}`}
                style={{
                  color: hasError 
                    ? "#DC2626" // Red color for error state
                    : hoveredItem === "downloadZip" 
                    ? "#666666" 
                    : "#AAAAAA",
                  fontWeight: hoveredItem === "downloadZip" || hasError ? "700" : "500",
                  letterSpacing: "0.05em",
                }}
                aria-label={zipCtaAriaLabel}
              >
                {hasError ? (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                )}
                <span>{zipCtaText}</span>
              </button>
            )}

            {/* Hide "Buy More" button when in DOSTARCZONE view - only show ZIP-related UI */}
            {!showDeliveredView && state === "delivered" && showBuyMore && onBuyMoreClick && !isUnselectedViewActive && (
              <button
                ref={(el) => {
                  buttonRefs.current["buyMore"] = el;
                }}
                onClick={() => {
                  hapticFeedback('medium');
                  onBuyMoreClick();
                }}
                onMouseEnter={() => handleItemHover("buyMore")}
                onMouseLeave={() => handleItemHover(null)}
                className={`relative py-2 uppercase text-sm transition-all touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center whitespace-nowrap ${
                  scroll ? "opacity-0 w-0 overflow-hidden pointer-events-none" : "opacity-100 w-auto"
                }`}
                style={{
                  color: hoveredItem === "buyMore" 
                    ? "#666666" 
                    : "#AAAAAA",
                  fontWeight: hoveredItem === "buyMore" 
                    ? "700" 
                    : "500",
                  letterSpacing: "0.05em",
                }}
                aria-label="Kup więcej zdjęć"
              >
                KUP WIĘCEJ ZDJĘĆ
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
