"use client";

import { useState, useEffect } from "react";
import { Grid3x3, LayoutGrid, LayoutDashboard, LayoutPanelTop, LogOut } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { useRouter } from "next/navigation";
import { useGalleryStatus } from "@/hooks/useGallery";
import type { GridLayout } from "./ImageGrid";

interface GalleryTopBarProps {
  gridLayout?: GridLayout;
  onGridLayoutChange?: (layout: GridLayout) => void;
}

export function GalleryTopBar({ 
  gridLayout,
  onGridLayoutChange,
}: GalleryTopBarProps) {
  const router = useRouter();
  const { logout, token, galleryId } = useAuth();
  const [scroll, setScroll] = useState(false);
  
  // Fetch gallery name via React Query (uses cached data from login if status endpoint fails)
  const { data: galleryStatus, isError } = useGalleryStatus(galleryId, token);
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
    logout();
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <header
      className={`sticky top-0 inset-x-0 h-20 md:h-24 w-full z-[99999] select-none transition-all ${
        scroll
          ? "bg-white/80 backdrop-blur-md backdrop-saturate-150"
          : "bg-white"
      }`}
    >
      <div className="w-full mx-auto px-8 md:px-12 lg:px-16 h-full flex items-center justify-between">
        {/* Left: Gallery name */}
        <button
          onClick={scrollToTop}
          className="text-5xl md:text-6xl text-gray-900 hover:opacity-70 transition-opacity truncate gallery-name-button"
          style={{ 
            fontFamily: "'The Wedding Signature', cursive"
          }}
        >
          {displayName}
        </button>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 sm:gap-4 md:gap-8 lg:gap-10">
          {/* Grid Layout Toggle */}
          {onGridLayoutChange && gridLayout && (
            <div className="flex items-center gap-2 bg-transparent">
              <button
                onClick={() => onGridLayoutChange("standard")}
                className={`h-11 w-11 md:h-9 md:w-9 rounded transition-colors flex items-center justify-center border-0 touch-manipulation ${
                  gridLayout === "standard"
                    ? "bg-transparent text-gray-900"
                    : "text-gray-400 hover:text-gray-600"
                }`}
                title="Układ standardowy"
                aria-label="Układ standardowy"
              >
                <Grid3x3 className="w-5 h-5 md:w-5 md:h-5" />
              </button>
              <button
                onClick={() => onGridLayoutChange("square")}
                className={`h-11 w-11 md:h-9 md:w-9 rounded transition-colors flex items-center justify-center border-0 touch-manipulation ${
                  gridLayout === "square"
                    ? "bg-transparent text-gray-900"
                    : "text-gray-400 hover:text-gray-600"
                }`}
                title="Układ kwadratowy"
                aria-label="Układ kwadratowy"
              >
                <LayoutGrid className="w-5 h-5 md:w-5 md:h-5" />
              </button>
              <button
                onClick={() => onGridLayoutChange("marble")}
                className={`h-11 w-11 md:h-9 md:w-9 rounded transition-colors flex items-center justify-center border-0 touch-manipulation ${
                  gridLayout === "marble"
                    ? "bg-transparent text-gray-900"
                    : "text-gray-400 hover:text-gray-600"
                }`}
                title="Układ mozaikowy"
                aria-label="Układ mozaikowy"
              >
                <LayoutDashboard className="w-5 h-5 md:w-5 md:h-5" />
              </button>
              <button
                onClick={() => onGridLayoutChange("carousel")}
                className={`h-11 w-11 md:h-9 md:w-9 rounded transition-colors flex items-center justify-center border-0 touch-manipulation ${
                  gridLayout === "carousel"
                    ? "bg-transparent text-gray-900"
                    : "text-gray-400 hover:text-gray-600"
                }`}
                title="Otwórz galerię"
                aria-label="Otwórz galerię"
              >
                <LayoutPanelTop className="w-5 h-5 md:w-5 md:h-5" />
              </button>
            </div>
          )}
          <div className="ml-3 sm:ml-0">
            <button
              onClick={handleLogout}
              className="btn-primary hidden sm:inline-flex touch-manipulation"
              aria-label="Wyloguj"
            >
              Wyloguj
            </button>
            <button
              onClick={handleLogout}
              className="h-11 w-11 md:h-9 md:w-9 rounded transition-colors flex items-center justify-center border-0 bg-black text-white hover:bg-gray-800 active:bg-gray-700 touch-manipulation sm:hidden"
              title="Wyloguj"
              aria-label="Wyloguj"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
