import React, { ComponentType } from "react";
import {
  useImageUploadWithPlaceholders,
  UploadConfig,
  UploadType,
  GalleryImage,
  UploadProgress,
} from "../hooks/useImageUploadWithPlaceholders";

export interface WithImageUploadPlaceholdersProps {
  handleFileSelect: (files: FileList | null) => Promise<void>;
  uploading: boolean;
  uploadProgress: UploadProgress;
  cancelUpload: () => void;
}

interface HOCConfig {
  type: UploadType;
  getGalleryId: (props: any) => string;
  getOrderId?: (props: any) => string | undefined;
  onPlaceholdersCreated?: (props: any, placeholders: GalleryImage[]) => void;
  onImagesUpdated?: (props: any, images: GalleryImage[]) => void;
  onUploadComplete?: (props: any) => void;
  onValidationNeeded?: (props: any, data: any) => void;
  onOrderUpdated?: (props: any, orderId: string) => void;
  loadOrderData?: (props: any) => Promise<void>;
  reloadGallery?: (props: any) => Promise<void>;
}

/**
 * HOC that provides image upload functionality with placeholders
 * Distinguishes between 'finals' (order) and 'originals' (gallery) uploads
 */
export function withImageUploadPlaceholders<P extends object>(
  WrappedComponent: ComponentType<P & WithImageUploadPlaceholdersProps>,
  hocConfig: HOCConfig
) {
  return function ImageUploadPlaceholdersComponent(props: P) {
    const config: UploadConfig = {
      galleryId: hocConfig.getGalleryId(props),
      orderId: hocConfig.getOrderId?.(props),
      type: hocConfig.type,
      onPlaceholdersCreated: hocConfig.onPlaceholdersCreated
        ? (placeholders: GalleryImage[], currentImages: GalleryImage[]) => {
            hocConfig.onPlaceholdersCreated!(props, placeholders);
            return currentImages.length;
          }
        : undefined,
      onImagesUpdated: hocConfig.onImagesUpdated
        ? (images) => hocConfig.onImagesUpdated!(props, images)
        : undefined,
      onUploadComplete: hocConfig.onUploadComplete
        ? () => hocConfig.onUploadComplete!(props)
        : undefined,
      onValidationNeeded: hocConfig.onValidationNeeded
        ? (data) => hocConfig.onValidationNeeded!(props, data)
        : undefined,
      onOrderUpdated: hocConfig.onOrderUpdated
        ? (orderId) => hocConfig.onOrderUpdated!(props, orderId)
        : undefined,
      loadOrderData: hocConfig.loadOrderData ? () => hocConfig.loadOrderData!(props) : undefined,
      reloadGallery: hocConfig.reloadGallery ? () => hocConfig.reloadGallery!(props) : undefined,
    };

    const { handleFileSelect, uploading, uploadProgress, cancelUpload } =
      useImageUploadWithPlaceholders(config);

    return (
      <WrappedComponent
        {...(props as P)}
        handleFileSelect={handleFileSelect}
        uploading={uploading}
        uploadProgress={uploadProgress}
        cancelUpload={cancelUpload}
      />
    );
  };
}
