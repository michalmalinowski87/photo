import { useState, useCallback, useMemo, useEffect } from "react";
import { LayoutDashboard, List as ListIcon } from "lucide-react";

import { useGalleries } from "../../hooks/queries/useGalleries";
import { usePageLogger } from "../../hooks/usePageLogger";
import { FullPageLoading } from "../ui/loading/Loading";

import GalleryList from "./GalleryList";

interface GalleryFilterPageProps {
  title: string;
  filter:
    | "unpaid"
    | "wyslano"
    | "wybrano"
    | "prosba-o-zmiany"
    | "gotowe-do-wysylki"
    | "dostarczone";
  loadingText?: string;
}

/**
 * Reusable component for gallery filter pages
 * Provides consistent UI and loading state management
 */
export default function GalleryFilterPage({
  title,
  filter,
  loadingText = "Ładowanie galerii...",
}: GalleryFilterPageProps) {
  usePageLogger({ pageName: `GalleryFilterPage-${filter}`, logRouteChanges: false });
  const [publishWizardOpen, setPublishWizardOpen] = useState<boolean>(false);
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState<boolean>(false);

  // Use React Query to get loading state
  const { isLoading: loading } = useGalleries(filter);

  // Track initial load
  useEffect(() => {
    if (!loading && !hasInitiallyLoaded) {
      setHasInitiallyLoaded(true);
    }
  }, [loading, hasInitiallyLoaded]);

  // Check if URL params indicate wizard should open (prevents showing FullPageLoading)
  const shouldOpenWizardFromUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    const params = new URLSearchParams(window.location.search);
    return params.get("publish") === "true" && params.get("galleryId") !== null;
  }, []);

  // Set wizard state from URL params on mount
  useEffect(() => {
    if (shouldOpenWizardFromUrl && !publishWizardOpen && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const galleryParam = params.get("galleryId");

      if (galleryParam) {
        setPublishWizardOpen(true);

        // Clear URL params after reading them
        setTimeout(() => {
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete("publish");
          newUrl.searchParams.delete("galleryId");
          newUrl.searchParams.delete("duration");
          newUrl.searchParams.delete("planKey");
          window.history.replaceState({}, "", newUrl.toString());
        }, 0);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleWizardOpenChange = useCallback((_isOpen: boolean) => {
    // Store state is managed separately
  }, []);

  // Don't show FullPageLoading if wizard should open from URL (prevents layout issues)
  const showFullPageLoading =
    loading && !hasInitiallyLoaded && !publishWizardOpen && !shouldOpenWizardFromUrl;

  // View mode state - shared with GalleryList
  const [viewMode, setViewMode] = useState<"list" | "cards">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("galleryListViewMode");
      return (saved === "list" || saved === "cards") ? saved : "cards";
    }
    return "cards";
  });

  // Save view mode preference
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("galleryListViewMode", viewMode);
    }
  }, [viewMode]);

  return (
    <>
      {showFullPageLoading && <FullPageLoading text={loadingText} />}
      <div className="space-y-6">
        {!publishWizardOpen && (
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{title}</h1>
            <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode("cards")}
                className={`p-3 rounded-md transition-colors ${
                  viewMode === "cards"
                    ? "bg-white dark:bg-gray-700 text-brand-600 dark:text-brand-400 shadow-sm"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                }`}
                aria-label="Widok kart"
              >
                <LayoutDashboard size={24} />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-3 rounded-md transition-colors ${
                  viewMode === "list"
                    ? "bg-white dark:bg-gray-700 text-brand-600 dark:text-brand-400 shadow-sm"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                }`}
                aria-label="Widok listy"
              >
                <ListIcon size={24} />
              </button>
            </div>
          </div>
        )}
        <GalleryList 
          filter={filter} 
          onWizardOpenChange={handleWizardOpenChange}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      </div>
    </>
  );
}
