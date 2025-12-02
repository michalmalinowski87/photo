import React from "react";

import { useGalleryStore } from "../../store/gallerySlice";

interface Gallery {
  selectionEnabled?: boolean;
  [key: string]: unknown;
}

interface WithGalleryTypeProps {
  isNonSelectionGallery: boolean;
  gallery: Gallery | null;
}

/**
 * HOC that provides gallery type information to components
 */
export function withGalleryType<P extends object>(
  Component: React.ComponentType<P & WithGalleryTypeProps>
) {
  return function WithGalleryTypeComponent(props: P) {
    const gallery = useGalleryStore((state) => state.currentGallery);
    const isNonSelectionGallery = gallery?.selectionEnabled === false;

    return <Component {...props} isNonSelectionGallery={isNonSelectionGallery} gallery={gallery} />;
  };
}

/**
 * Hook to get gallery type information
 */
export function useGalleryType() {
  const gallery = useGalleryStore((state) => state.currentGallery);
  const isNonSelectionGallery = gallery?.selectionEnabled === false;

  return {
    isNonSelectionGallery,
    gallery,
    isSelectionGallery: !isNonSelectionGallery,
  };
}

/**
 * Conditional render component based on gallery type
 */
interface ConditionalRenderProps {
  children: React.ReactNode;
  showForSelection?: boolean;
  showForNonSelection?: boolean;
}

export function GalleryTypeConditional({ children, showForSelection, showForNonSelection }: ConditionalRenderProps) {
  const { isNonSelectionGallery } = useGalleryType();

  if (isNonSelectionGallery && showForNonSelection) {
    return <>{children}</>;
  }

  if (!isNonSelectionGallery && showForSelection) {
    return <>{children}</>;
  }

  return null;
}

