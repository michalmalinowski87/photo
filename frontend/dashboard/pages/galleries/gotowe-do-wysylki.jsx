import { useState, useCallback } from "react";
import GalleryList from "../../components/galleries/GalleryList";
import { FullPageLoading } from "../../components/ui/loading/Loading";

export default function GalleriesGotoweDoWysylki() {
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);

  const handleLoadingChange = useCallback((isLoading, isInitialLoad) => {
    setLoading(isLoading);
    setInitialLoad(isInitialLoad);
  }, []);

  return (
    <>
      {loading && initialLoad && (
        <FullPageLoading text="Ładowanie galerii..." />
      )}
      <div className={loading && initialLoad ? "hidden" : "space-y-6"}>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Gotowe do wysyłki
        </h1>
        <GalleryList filter="gotowe-do-wysylki" onLoadingChange={handleLoadingChange} />
      </div>
    </>
  );
}

