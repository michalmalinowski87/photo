/**
 * Utility functions for handling filenames in the UI
 */

/**
 * Remove file extension from filename for display
 * This prevents confusion when photographers upload PNG/JPEG but we optimize to WebP
 *
 * Examples:
 * - "image.png" → "image"
 * - "photo.jpg" → "photo"
 * - "photo.webp" → "photo"
 * - "image.name.png" → "image.name"
 * - "no-extension" → "no-extension"
 */
export function removeFileExtension(filename: string | null | undefined): string {
  if (!filename) {
    return "";
  }

  // Find the last dot (to handle files like "image.name.png")
  const lastDotIndex = filename.lastIndexOf(".");

  // If no dot found, return as-is
  if (lastDotIndex === -1) {
    return filename;
  }

  // Return everything before the last dot
  return filename.substring(0, lastDotIndex);
}
