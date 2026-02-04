"use client";

import { useState, useEffect } from "react";
import {
  LogOut,
  HelpCircle,
  Grid3x3,
  LayoutGrid,
  LayoutDashboard,
  LayoutPanelTop,
  Eye,
} from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { useGalleryStatus } from "@/hooks/useGallery";
import { hapticFeedback } from "@/utils/hapticFeedback";
import type { GridLayout } from "./VirtuosoGrid";
import { OwnerPreviewInfoOverlay } from "./OwnerPreviewInfoOverlay";
import { PostHogActions } from "@photocloud/posthog-types";

interface GalleryTopBarProps {
  onHelpClick?: () => void;
  gridLayout?: GridLayout;
  onGridLayoutChange?: (layout: GridLayout) => void;
  isOwnerPreview?: boolean;
  disableLogout?: boolean;
}

export function GalleryTopBar({
  onHelpClick,
  gridLayout,
  onGridLayoutChange,
  isOwnerPreview = false,
  disableLogout = false,
}: GalleryTopBarProps) {
  const { logout, galleryId } = useAuth();
  const [scroll, setScroll] = useState(false);
  const [showOwnerPreviewInfo, setShowOwnerPreviewInfo] = useState(false);
  
  // Fetch gallery name via React Query (uses cached data from login if status endpoint fails)
  const { data: galleryStatus } = useGalleryStatus(galleryId);
  const displayName = galleryStatus?.galleryName || "Galeria";

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 8) {
        setScroll(true);
      } else {
        setScroll(false);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleLogout = () => {
    if (disableLogout) {
      return;
    }
    hapticFeedback('medium');
    logout();
  };

  const scrollToTop = () => {
    hapticFeedback('light');
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <header
      className={`sticky top-0 inset-x-0 w-full z-[99999] select-none transition-all ${
        scroll
          ? "bg-white/80 backdrop-blur-md backdrop-saturate-150"
          : "bg-white"
      }`}
    >
      {/* First row: Gallery name (left) + Help + Logout (right) */}
      <div className="relative w-full mx-auto px-8 md:px-12 lg:px-16 h-20 md:h-24 flex items-center justify-between border-b border-gray-200">
        {/* Left: Gallery name */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={scrollToTop}
            className="text-5xl md:text-6xl text-gray-900 hover:opacity-70 transition-opacity truncate gallery-name-button"
            style={{
              fontFamily: "'The Wedding Signature', cursive",
            }}
            aria-label="Scroll to top"
          >
            {displayName}
          </button>
        </div>

        {isOwnerPreview && (
          <div className="absolute left-1/2 -translate-x-1/2">
            <button
              type="button"
              onClick={() => {
                hapticFeedback("light");
                setShowOwnerPreviewInfo(true);
              }}
              className="inline-flex items-center gap-2 bg-transparent border-0 p-0 m-0 text-red-900 text-lg md:text-xl font-semibold whitespace-nowrap cursor-pointer hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2"
              title="Tryb podglądu fotografa — kliknij, aby zobaczyć szczegóły"
              aria-label="Tryb podglądu fotografa — pokaż szczegóły"
            >
              <Eye className="w-5 h-5" />
              <span>Podgląd fotografa</span>
            </button>
          </div>
        )}

        {/* Right: Layout selector + Help + Logout */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Layout selector */}
          {onGridLayoutChange && gridLayout && (
            <div className="flex items-center gap-1 sm:gap-2 bg-transparent">
              <button
                onClick={() => {
                  hapticFeedback('light');
                  onGridLayoutChange("standard");
                }}
                className={`h-11 w-11 sm:h-9 sm:w-9 rounded transition-all flex items-center justify-center border-0 touch-manipulation ${
                  gridLayout === "standard"
                    ? "bg-transparent text-gray-900"
                    : "text-gray-400 hover:text-gray-600"
                }`}
                title="Układ standardowy"
                aria-label="Układ standardowy"
                data-ph-action={PostHogActions.galleryApp.layoutChange}
                data-ph-property-gallery_app_layout="standard"
              >
                <Grid3x3 className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  hapticFeedback('light');
                  onGridLayoutChange("square");
                }}
                className={`h-11 w-11 sm:h-9 sm:w-9 rounded transition-all flex items-center justify-center border-0 touch-manipulation ${
                  gridLayout === "square"
                    ? "bg-transparent text-gray-900"
                    : "text-gray-400 hover:text-gray-600"
                }`}
                title="Układ kwadratowy"
                aria-label="Układ kwadratowy"
                data-ph-action={PostHogActions.galleryApp.layoutChange}
                data-ph-property-gallery_app_layout="square"
              >
                <LayoutGrid className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  hapticFeedback('light');
                  onGridLayoutChange("marble");
                }}
                className={`h-11 w-11 sm:h-9 sm:w-9 rounded transition-all flex items-center justify-center border-0 touch-manipulation ${
                  gridLayout === "marble"
                    ? "bg-transparent text-gray-900"
                    : "text-gray-400 hover:text-gray-600"
                }`}
                title="Układ mozaikowy"
                aria-label="Układ mozaikowy"
                data-ph-action={PostHogActions.galleryApp.layoutChange}
                data-ph-property-gallery_app_layout="marble"
              >
                <LayoutDashboard className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  hapticFeedback('light');
                  onGridLayoutChange("carousel");
                }}
                className={`h-11 w-11 sm:h-9 sm:w-9 rounded transition-all flex items-center justify-center border-0 touch-manipulation ${
                  gridLayout === "carousel"
                    ? "bg-transparent text-gray-900"
                    : "text-gray-400 hover:text-gray-600"
                }`}
                title="Otwórz galerię"
                aria-label="Otwórz galerię"
                data-ph-action={PostHogActions.galleryApp.layoutChange}
                data-ph-property-gallery_app_layout="carousel"
              >
                <LayoutPanelTop className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Help icon - matches layout selector style */}
          {onHelpClick && (
            <button
              onClick={() => {
                hapticFeedback('light');
                onHelpClick();
              }}
              className="h-11 w-11 sm:h-9 sm:w-9 rounded transition-all flex items-center justify-center border-0 touch-manipulation bg-transparent text-gray-400 hover:text-gray-600"
              title="Pomoc"
              aria-label="Pomoc"
              data-ph-action={PostHogActions.galleryApp.helpOverlayOpen}
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          )}

          {/* Logout */}
          <>
            <button
              onClick={handleLogout}
              disabled={disableLogout}
              className={`btn-primary !hidden sm:!inline-flex touch-manipulation ${
                disableLogout ? "opacity-50 cursor-not-allowed" : ""
              }`}
              aria-label="Wyloguj"
              title={
                disableLogout
                  ? "Wylogowanie jest wyłączone w trybie podglądu"
                  : "Wyloguj"
              }
              data-ph-action={PostHogActions.galleryApp.clientLogoutClick}
            >
              Wyloguj
            </button>
            <button
              onClick={handleLogout}
              disabled={disableLogout}
              className={`h-11 w-11 md:h-9 md:w-9 rounded-full transition-colors flex items-center justify-center border-0 bg-black text-white hover:bg-gray-800 active:bg-gray-700 touch-manipulation sm:!hidden ${
                disableLogout ? "opacity-50 cursor-not-allowed" : ""
              }`}
              title={
                disableLogout
                  ? "Wylogowanie jest wyłączone w trybie podglądu"
                  : "Wyloguj"
              }
              aria-label="Wyloguj"
              data-ph-action={PostHogActions.galleryApp.clientLogoutClick}
            >
              <LogOut className="w-5 h-5" />
            </button>
          </>
        </div>
      </div>

      <OwnerPreviewInfoOverlay
        isVisible={showOwnerPreviewInfo}
        onClose={() => setShowOwnerPreviewInfo(false)}
      />
    </header>
  );
}
