"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSelection } from "@/hooks/useSelection";
import { useAuth } from "@/providers/AuthProvider";
import { hapticFeedback } from "@/utils/hapticFeedback";
import type { SelectionState } from "@/types/gallery";

interface ZipStatus {
  status?: "ready" | "generating" | "not_started";
  generating?: boolean;
  ready?: boolean;
  zipExists?: boolean;
  zipSize?: number;
  elapsedSeconds?: number;
  progress?: {
    processed: number;
    total: number;
    percent: number;
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
  showBuyMore?: boolean;
  onBuyMoreClick?: () => void;
  onDownloadZip?: () => void;
  zipStatus?: ZipStatus;
  showDownloadZip?: boolean;
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
  showUnselectedView = false,
  onUnselectedViewClick,
  showBuyMore = false,
  onBuyMoreClick,
  onDownloadZip,
  zipStatus,
  showDownloadZip = true,
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

  // Determine current state
  const state = selectionState
    ? selectionState.hasDeliveredOrder
      ? "delivered"
      : selectionState.changeRequestPending
      ? "changesRequested"
      : selectionState.approved || selectionState.hasClientApprovedOrder
      ? "approved"
      : "selecting"
    : "selecting";
  const shouldBeSticky = state === "selecting";

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
  const updateIndicatorPosition = useCallback(() => {
    const indicatorItemId = hoveredItem || activeItem;
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
  }, [activeItem, hoveredItem]);

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
  const effectiveBaseLimit = showUnselectedView ? 0 : baseLimit;
  // Compute overage locally for immediate UI correctness with optimistic selection updates.
  // Backend-provided overageCount/overageCents can lag behind selectedCount/selectedKeys changes.
  const computedOverageCount = extraPriceCents > 0 ? Math.max(0, selectedCount - effectiveBaseLimit) : 0;
  const computedOverageCents = computedOverageCount * extraPriceCents;
  // If extra-per-photo pricing is enabled, we still show the included limit (baseLimit),
  // and allow going over it (overageCount / overageCents).
  // If baseLimit is 0 and extra pricing exists, show "no limit" instead of "0".
  const limitDisplay = baseLimit > 0 ? baseLimit.toString() : extraPriceCents > 0 ? "no limit" : "0";
  const canApprove = selectedCount >= baseLimit;

  // Format price in PLN
  const formatPrice = (cents: number) => {
    return `${(cents / 100).toFixed(2)} zł`;
  };

  // Menu items based on state
  const getMenuItems = () => {
    if (state === "delivered") {
      const items = [
        { id: "delivered", label: "DOSTARCZONE" },
      ];
      // Only show "Niewybrane" if there's a price per additional photo
      if (extraPriceCents > 0) {
        items.push({ id: "unselected", label: "NIEWYBRANE" });
      }
      return items;
    } else if (state === "approved" || state === "changesRequested") {
      return [
        { id: "all", label: "WSZYSTKIE ZDJĘCIA" },
        { id: "selected", label: "WYBRANE" },
      ];
    } else {
      return [
        { id: "wybor", label: "WYBÓR ZDJĘĆ" },
      ];
    }
  };

  const menuItems = getMenuItems();

  // Set default active item based on state on mount and when state changes
  useEffect(() => {
    if (state === "selecting") {
      setActiveItem("wybor");
    } else if ((state === "approved" || state === "changesRequested") && viewMode === "all") {
      setActiveItem("all");
    } else if ((state === "approved" || state === "changesRequested") && viewMode === "selected") {
      setActiveItem("selected");
    } else if (state === "delivered") {
      if (showUnselectedView) {
        setActiveItem("unselected");
      } else {
        setActiveItem("delivered");
      }
    }
  }, [state, viewMode, showUnselectedView]);

  const handleItemClick = (itemId: string) => {
    hapticFeedback('light');
    setActiveItem(itemId);
    if (itemId === "all" && onViewModeChange) {
      onViewModeChange("all");
    } else if (itemId === "selected" && onViewModeChange) {
      onViewModeChange("selected");
    } else if (itemId === "delivered" && onDeliveredViewClick) {
      onDeliveredViewClick();
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

  // Check if approve button should be active (always active in selecting state when enabled)
  const isApproveActive = state === "selecting" && canApprove;

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
                (item.id === "delivered" && showDeliveredView) ||
                (item.id === "unselected" && showUnselectedView);
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
            {/* Selection status display (only in selecting state)
                Keep each piece as a sibling so spacing matches the rest of the right-side controls. */}
            {state === "selecting" && extraPriceCents > 0 && computedOverageCount > 0 && (
              <span className="text-xs text-gray-400 whitespace-nowrap">
                Dodatkowe ujęcia {computedOverageCount} × {formatPrice(extraPriceCents)} ={" "}
                {formatPrice(computedOverageCents)}
              </span>
            )}
            {state === "selecting" && (
              <span className="text-xs text-gray-400 whitespace-nowrap">
                Wybrane: {selectedCount} / {limitDisplay}
              </span>
            )}

            {/* Niewybrane view status - show price calculation for all selected photos */}
            {state === "delivered" && showUnselectedView && extraPriceCents > 0 && selectedCount > 0 && (
              <span className="text-xs text-gray-400 whitespace-nowrap">
                Dodatkowe ujęcia {selectedCount} × {formatPrice(extraPriceCents)} ={" "}
                {formatPrice(selectedCount * extraPriceCents)}
              </span>
            )}

            {/* Action buttons based on state */}
            {state === "selecting" && onApproveSelection && (
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
                aria-label="Zatwierdź wybór"
              >
                ZATWIERDŹ WYBÓR
              </button>
            )}

            {state === "approved" && onRequestChanges && (
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

            {state === "changesRequested" && onCancelChangeRequest && (
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

            {state === "delivered" && onDownloadZip && showDownloadZip && (
              <button
                ref={(el) => {
                  buttonRefs.current["downloadZip"] = el;
                }}
                onClick={() => {
                  hapticFeedback('medium');
                  onDownloadZip();
                }}
                onMouseEnter={() => handleItemHover("downloadZip")}
                onMouseLeave={() => handleItemHover(null)}
                className={`relative py-2 uppercase text-sm transition-all touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center whitespace-nowrap gap-2 ${
                  scroll ? "opacity-0 w-0 overflow-hidden pointer-events-none" : "opacity-100 w-auto"
                }`}
                style={{
                  color: hoveredItem === "downloadZip" ? "#666666" : "#AAAAAA",
                  fontWeight: hoveredItem === "downloadZip" ? "700" : "500",
                  letterSpacing: "0.05em",
                }}
                aria-label={zipStatus?.generating ? "Generowanie ZIP" : "Pobierz ZIP"}
              >
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
                {zipStatus?.generating ? "GENEROWANIE ZIP" : "POBIERZ ZIP"}
              </button>
            )}

            {state === "delivered" && showBuyMore && onBuyMoreClick && !showDeliveredView && (
              <button
                ref={(el) => {
                  buttonRefs.current["buyMore"] = el;
                }}
                onClick={() => {
                  if (selectedCount > 0) {
                    hapticFeedback('medium');
                    onBuyMoreClick();
                  }
                }}
                disabled={selectedCount === 0}
                onMouseEnter={() => {
                  if (selectedCount > 0) {
                    handleItemHover("buyMore");
                  }
                }}
                onMouseLeave={() => handleItemHover(null)}
                className={`relative py-2 uppercase text-sm transition-all touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center whitespace-nowrap ${
                  scroll ? "opacity-0 w-0 overflow-hidden pointer-events-none" : "opacity-100 w-auto"
                } ${selectedCount === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
                style={{
                  color: selectedCount === 0 
                    ? "#AAAAAA" 
                    : hoveredItem === "buyMore" 
                    ? "#666666" 
                    : "#AAAAAA",
                  fontWeight: selectedCount === 0 
                    ? "500" 
                    : hoveredItem === "buyMore" 
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
