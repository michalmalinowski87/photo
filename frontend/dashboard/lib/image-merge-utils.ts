/**
 * Utility functions for merging and comparing gallery images
 */

import type { GalleryImage } from "../types";

/**
 * Normalize lastModified for comparison (handle string vs number)
 */
function normalizeLastModified(lm: number | string | undefined): number | undefined {
  if (lm === undefined) {
    return undefined;
  }
  return typeof lm === "string" ? new Date(lm).getTime() : lm;
}

/**
 * Check if image data has changed by comparing URLs and lastModified
 */
function hasImageDataChanged(currentImg: GalleryImage | undefined, newImg: GalleryImage): boolean {
  if (!currentImg) {
    return true;
  }

  const currentLastModified = normalizeLastModified(currentImg.lastModified);
  const newLastModified = normalizeLastModified(newImg.lastModified);

  return (
    currentImg.thumbUrl !== newImg.thumbUrl ||
    currentImg.thumbUrlFallback !== newImg.thumbUrlFallback ||
    currentImg.previewUrl !== newImg.previewUrl ||
    currentImg.previewUrlFallback !== newImg.previewUrlFallback ||
    currentImg.bigThumbUrl !== newImg.bigThumbUrl ||
    currentImg.bigThumbUrlFallback !== newImg.bigThumbUrlFallback ||
    currentImg.url !== newImg.url ||
    currentImg.finalUrl !== newImg.finalUrl ||
    currentLastModified !== newLastModified
  );
}

/**
 * Merge new images with existing images, preserving object references when data hasn't changed
 * This prevents unnecessary re-renders and state resets in LazyRetryableImage
 */
export function mergeGalleryImages(
  currentImages: GalleryImage[],
  newImages: GalleryImage[],
  deletingImageKeys: string[]
): GalleryImage[] {
  // Preserve images that are currently being deleted (they may not be in API response yet)
  const currentDeletingImages = currentImages.filter((img) => {
    const imgKey = img.key ?? img.filename;
    return imgKey && deletingImageKeys.includes(imgKey);
  });

  // Create a map of current images by key for quick lookup
  const currentImagesMap = new Map(
    currentImages.map((img) => [img.key ?? img.filename ?? "", img])
  );

  // Create a map of new images by key
  const newImagesMap = new Map(newImages.map((img) => [img.key ?? img.filename ?? "", img]));

  // Merge: preserve existing image objects when data hasn't changed
  const mergedImages: GalleryImage[] = [];

  // Process all images from new set (includes new and existing)
  newImagesMap.forEach((newImg, imgKey) => {
    const currentImg = currentImagesMap.get(imgKey);

    // If image exists and data hasn't changed, preserve the existing object
    if (currentImg && !hasImageDataChanged(currentImg, newImg)) {
      mergedImages.push(currentImg);
    } else {
      // New image or data changed - use new object
      mergedImages.push(newImg);
    }
  });

  // Add deleting images that aren't in new set (they may not be in API response yet)
  currentDeletingImages.forEach((img) => {
    const imgKey = img.key ?? img.filename;
    if (imgKey && !newImagesMap.has(imgKey)) {
      mergedImages.push(img);
    }
  });

  return mergedImages;
}
