import { createContext, useContext, ReactNode } from "react";

interface GalleryContextType {
  gallery: any;
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
  reloadOrder
}: { 
  children: ReactNode;
  gallery: any;
  loading: boolean;
  error: string | null;
  galleryId: string | undefined;
  reloadGallery: () => Promise<void>;
  reloadOrder?: () => Promise<void>;
}) {
  return (
    <GalleryContext.Provider value={{ gallery, loading, error, galleryId, reloadGallery, reloadOrder }}>
      {children}
    </GalleryContext.Provider>
  );
}

export function useGallery() {
  const context = useContext(GalleryContext);
  if (context === undefined) {
    throw new Error("useGallery must be used within GalleryProvider");
  }
  return context;
}

