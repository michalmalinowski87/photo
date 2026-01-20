"use client";

import { useState, useEffect } from "react";
import { LogOut, HelpCircle, Grid3x3, LayoutGrid, LayoutDashboard, LayoutPanelTop } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { useGalleryStatus } from "@/hooks/useGallery";
import { hapticFeedback } from "@/utils/hapticFeedback";
import type { GridLayout } from "./VirtuosoGrid";

interface GalleryTopBarProps {
  onHelpClick?: () => void;
  gridLayout?: GridLayout;
  onGridLayoutChange?: (layout: GridLayout) => void;
  hideLogout?: boolean;
}

export function GalleryTopBar({
  onHelpClick,
  gridLayout,
  onGridLayoutChange,
  hideLogout = false,
}: GalleryTopBarProps) {
  const { logout, galleryId } = useAuth();
  const [scroll, setScroll] = useState(false);
  
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
      <div className="w-full mx-auto px-8 md:px-12 lg:px-16 h-20 md:h-24 flex items-center justify-between border-b border-gray-200">
        {/* Left: Gallery name */}
        <button
          onClick={scrollToTop}
          className="text-5xl md:text-6xl text-gray-900 hover:opacity-70 transition-opacity truncate gallery-name-button"
          style={{ 
            fontFamily: "'The Wedding Signature', cursive"
          }}
          aria-label="Scroll to top"
        >
          {displayName}
        </button>

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
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          )}
          
          {/* Logout */}
          {!hideLogout && (
            <>
              <button
                onClick={handleLogout}
                className="btn-primary hidden sm:inline-flex touch-manipulation"
                aria-label="Wyloguj"
              >
                Wyloguj
              </button>
              <button
                onClick={handleLogout}
                className="h-11 w-11 md:h-9 md:w-9 rounded-full transition-colors flex items-center justify-center border-0 bg-black text-white hover:bg-gray-800 active:bg-gray-700 touch-manipulation sm:hidden"
                title="Wyloguj"
                aria-label="Wyloguj"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
