import { createContext, useContext, ReactNode, useMemo, useEffect } from "react";

import { useGalleryStore, type Gallery } from "../store/gallerySlice";

interface GalleryContextType {
  gallery: Gallery | null;
  loading: boolean;
  error: string | null;
  galleryId: string | undefined;
  reloadGallery: () => Promise<void>;
  reloadOrder?: () => Promise<void>;
}

const GalleryContext = createContext<GalleryContextType | undefined>(undefined);

export function GalleryProvider({
  children,
  gallery,
  loading,
  error,
  galleryId,
  reloadGallery,
  reloadOrder,
}: {
  children: ReactNode;
  gallery: Gallery | null;
  loading: boolean;
  error: string | null;
  galleryId: string | undefined;
  reloadGallery: () => Promise<void>;
  reloadOrder?: () => Promise<void>;
}) {
  // Sync with Zustand store
  const { setCurrentGallery, setLoading, setError } = useGalleryStore();

  useEffect(() => {
    if (
      gallery &&
      typeof gallery === "object" &&
      "galleryId" in gallery &&
      typeof gallery.galleryId === "string" &&
      "ownerId" in gallery &&
      typeof gallery.ownerId === "string" &&
      "state" in gallery &&
      typeof gallery.state === "string"
    ) {
      setCurrentGallery(gallery as Gallery);
    }
  }, [gallery, setCurrentGallery]);

  useEffect(() => {
    setLoading(loading);
  }, [loading, setLoading]);

  useEffect(() => {
    setError(error);
  }, [error, setError]);

  const value = useMemo(
    () => ({ gallery, loading, error, galleryId, reloadGallery, reloadOrder }),
    [gallery, loading, error, galleryId, reloadGallery, reloadOrder]
  );

  return <GalleryContext.Provider value={value}>{children}</GalleryContext.Provider>;
}

export function useGallery() {
  const context = useContext(GalleryContext);
  if (context === undefined) {
    throw new Error("useGallery must be used within GalleryProvider");
  }
  return context;
}
