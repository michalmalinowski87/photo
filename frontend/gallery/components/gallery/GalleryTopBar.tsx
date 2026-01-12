"use client";

import { useState, useEffect } from "react";
import { Grid3x3, LayoutGrid, LayoutDashboard, LayoutPanelTop } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { useRouter } from "next/navigation";
import type { GridLayout } from "./ImageGrid";

interface GalleryTopBarProps {
  galleryName?: string;
  gridLayout?: GridLayout;
  onGridLayoutChange?: (layout: GridLayout) => void;
}

export function GalleryTopBar({ 
  galleryName, 
  gridLayout,
  onGridLayoutChange,
}: GalleryTopBarProps) {
  const router = useRouter();
  const { logout, galleryName: authGalleryName } = useAuth();
  const [scroll, setScroll] = useState(false);

  const displayName = galleryName || authGalleryName || "Gallery";

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
      className={`sticky top-0 inset-x-0 h-20 md:h-24 w-full border-b z-[99999] select-none transition-all ${
        scroll
          ? "border-background/80 bg-background/40 backdrop-blur-md"
          : "border-transparent"
      }`}
    >
      <div className="container mx-auto px-4 md:px-6 h-full flex items-center justify-between">
        {/* Left: Gallery name */}
        <button
          onClick={scrollToTop}
          className="text-2xl md:text-3xl font-semibold text-foreground hover:opacity-80 transition-opacity truncate"
        >
          {displayName}
        </button>

        {/* Right: Actions */}
        <div className="flex items-center gap-3 md:gap-6">
          {/* Grid Layout Toggle */}
          {onGridLayoutChange && gridLayout && (
            <div className="hidden md:flex items-center gap-2 bg-background/50 dark:bg-background/30 rounded-lg p-1 backdrop-blur-sm border border-border/50">
              <button
                onClick={() => onGridLayoutChange("standard")}
                className={`h-10 w-10 rounded-md transition-colors flex items-center justify-center ${
                  gridLayout === "standard"
                    ? "bg-primary/20 dark:bg-primary/30 text-primary shadow-sm"
                    : "text-foreground/60 hover:text-foreground dark:hover:text-foreground/80"
                }`}
                title="Standard Layout"
                aria-label="Standard Layout"
              >
                <Grid3x3 size={20} />
              </button>
              <button
                onClick={() => onGridLayoutChange("square")}
                className={`h-10 w-10 rounded-md transition-colors flex items-center justify-center ${
                  gridLayout === "square"
                    ? "bg-primary/20 dark:bg-primary/30 text-primary shadow-sm"
                    : "text-foreground/60 hover:text-foreground dark:hover:text-foreground/80"
                }`}
                title="Square Layout"
                aria-label="Square Layout"
              >
                <LayoutGrid size={20} />
              </button>
              <button
                onClick={() => onGridLayoutChange("marble")}
                className={`h-10 w-10 rounded-md transition-colors flex items-center justify-center ${
                  gridLayout === "marble"
                    ? "bg-primary/20 dark:bg-primary/30 text-primary shadow-sm"
                    : "text-foreground/60 hover:text-foreground dark:hover:text-foreground/80"
                }`}
                title="Masonry Layout"
                aria-label="Masonry Layout"
              >
                <LayoutDashboard size={20} />
              </button>
              <button
                onClick={() => onGridLayoutChange("carousel")}
                className={`h-10 w-10 rounded-md transition-colors flex items-center justify-center ${
                  gridLayout === "carousel"
                    ? "bg-primary/20 dark:bg-primary/30 text-primary shadow-sm"
                    : "text-foreground/60 hover:text-foreground dark:hover:text-foreground/80"
                }`}
                title="Open Gallery"
                aria-label="Open Gallery"
              >
                <LayoutPanelTop size={20} />
              </button>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="px-5 py-2.5 text-base md:text-lg font-medium text-foreground hover:text-foreground transition-colors rounded-lg hover:bg-white/10"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
