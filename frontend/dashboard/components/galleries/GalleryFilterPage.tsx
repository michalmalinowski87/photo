import { useState, useCallback, useMemo, useEffect } from "react";

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
  const [loading, setLoading] = useState<boolean>(true);
  const [initialLoad, setInitialLoad] = useState<boolean>(true);
  const [publishWizardOpen, setPublishWizardOpen] = useState<boolean>(false);

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

  const handleLoadingChange = useCallback((isLoading: boolean, isInitialLoad: boolean) => {
    setLoading(isLoading);
    setInitialLoad(isInitialLoad);
  }, []);

  const handleWizardOpenChange = useCallback((_isOpen: boolean) => {
    // Store state is managed separately
  }, []);

  // Don't show FullPageLoading if wizard should open from URL (prevents layout issues)
  const showFullPageLoading =
    loading && initialLoad && !publishWizardOpen && !shouldOpenWizardFromUrl;

  return (
    <>
      {showFullPageLoading && <FullPageLoading text={loadingText} />}
      <div className="space-y-6">
        {!publishWizardOpen && (
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{title}</h1>
        )}
        <GalleryList
          filter={filter}
          onLoadingChange={handleLoadingChange}
          onWizardOpenChange={handleWizardOpenChange}
        />
      </div>
    </>
  );
}
