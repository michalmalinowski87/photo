"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSelection } from "@/hooks/useSelection";
import { useAuth } from "@/providers/AuthProvider";
import type { SelectionState } from "@/types/gallery";

interface SecondaryMenuProps {
  selectedCount?: number;
  onApproveSelection?: () => void;
  onRequestChanges?: () => void;
  onCancelChangeRequest?: () => void;
  viewMode?: "all" | "selected";
  onViewModeChange?: (mode: "all" | "selected") => void;
  showDeliveredView?: boolean;
  onDeliveredViewClick?: () => void;
  showBuyMore?: boolean;
  onBuyMoreClick?: () => void;
  onDownloadZip?: () => void;
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
  showBuyMore = false,
  onBuyMoreClick,
  onDownloadZip,
}: SecondaryMenuProps) {
  const { token, galleryId } = useAuth();
  const { data: selectionState } = useSelection(galleryId, token);
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
  const baseLimit = selectionState?.pricingPackage?.includedCount || 0;
  const extraPriceCents = selectionState?.pricingPackage?.extraPriceCents || 0;
  const overageCount = selectionState?.overageCount || 0;
  const overageCents = selectionState?.overageCents || 0;
  const limitDisplay = extraPriceCents > 0 ? "no limit" : baseLimit.toString();
  const canApprove = selectedCount >= baseLimit;

  // Format price in PLN
  const formatPrice = (cents: number) => {
    return `${(cents / 100).toFixed(2)} zł`;
  };

  // Menu items based on state
  const getMenuItems = () => {
    if (state === "delivered") {
      return [
        { id: "delivered", label: "DOSTARCZONE ZDJĘCIA" },
      ];
    } else if (state === "approved" || state === "changesRequested") {
      return [
        { id: "all", label: "WSZYSTKIE ZDJĘCIA" },
        { id: "selected", label: "WYBRANE ZDJĘCIA" },
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
      setActiveItem("delivered");
    }
  }, [state, viewMode]);

  const handleItemClick = (itemId: string) => {
    setActiveItem(itemId);
    if (itemId === "all" && onViewModeChange) {
      onViewModeChange("all");
    } else if (itemId === "selected" && onViewModeChange) {
      onViewModeChange("selected");
    } else if (itemId === "delivered" && onDeliveredViewClick) {
      onDeliveredViewClick();
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
      className={`sticky top-20 md:top-24 w-full bg-white z-[99998] transition-colors duration-300 ease-in-out ${
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
                (item.id === "delivered" && showDeliveredView);
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
            {/* Selection status display (only in selecting state) - moved to right */}
            {state === "selecting" && (
              <div className="flex items-center gap-2 text-xs text-gray-400 whitespace-nowrap">
                <span>
                  Wybrane: {selectedCount} / {limitDisplay}
                </span>
                {overageCount > 0 && (
                  <span className="text-gray-500">
                    Do zapłaty: +{formatPrice(overageCents)}
                  </span>
                )}
              </div>
            )}

            {/* Action buttons based on state */}
            {state === "selecting" && onApproveSelection && (
              <button
                ref={(el) => {
                  buttonRefs.current["approve"] = el;
                }}
                onClick={onApproveSelection}
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

            {(state === "approved" || state === "changesRequested") && onRequestChanges && (
              <button
                onClick={onRequestChanges}
                className={`text-sm text-gray-600 hover:text-gray-900 transition-all duration-300 touch-manipulation min-h-[44px] px-4 ${
                  scroll ? "opacity-0 w-0 overflow-hidden pointer-events-none" : "opacity-100 w-auto"
                }`}
                aria-label="Poproś o zmiany"
              >
                Poproś o zmiany
              </button>
            )}

            {state === "changesRequested" && onCancelChangeRequest && (
              <button
                onClick={onCancelChangeRequest}
                className={`text-sm text-gray-600 hover:text-gray-900 transition-all duration-300 touch-manipulation min-h-[44px] px-4 ${
                  scroll ? "opacity-0 w-0 overflow-hidden pointer-events-none" : "opacity-100 w-auto"
                }`}
                aria-label="Anuluj prośbę o zmiany"
              >
                Anuluj prośbę
              </button>
            )}

            {state === "delivered" && onDownloadZip && (
              <button
                onClick={onDownloadZip}
                className={`btn-primary touch-manipulation min-h-[44px] transition-all duration-300 ${
                  scroll ? "opacity-0 w-0 overflow-hidden pointer-events-none" : "opacity-100 w-auto"
                }`}
                aria-label="Pobierz ZIP"
              >
                Pobierz ZIP
              </button>
            )}

            {state === "delivered" && showBuyMore && onBuyMoreClick && (
              <button
                onClick={onBuyMoreClick}
                className={`text-sm text-gray-600 hover:text-gray-900 transition-all duration-300 touch-manipulation min-h-[44px] px-4 ${
                  scroll ? "opacity-0 w-0 overflow-hidden pointer-events-none" : "opacity-100 w-auto"
                }`}
                aria-label="Kup więcej zdjęć"
              >
                Kup więcej zdjęć
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
