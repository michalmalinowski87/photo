import { useState, useCallback } from "react";

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
  const [loading, setLoading] = useState<boolean>(true);
  const [initialLoad, setInitialLoad] = useState<boolean>(true);

  const handleLoadingChange = useCallback((isLoading: boolean, isInitialLoad: boolean) => {
    setLoading(isLoading);
    setInitialLoad(isInitialLoad);
  }, []);

  return (
    <>
      {loading && initialLoad && <FullPageLoading text={loadingText} />}
      <div className={loading && initialLoad ? "hidden" : "space-y-6"}>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{title}</h1>
        <GalleryList filter={filter} onLoadingChange={handleLoadingChange} />
      </div>
    </>
  );
}
