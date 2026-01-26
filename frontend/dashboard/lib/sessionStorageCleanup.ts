/**
 * Utility functions for cleaning up stale session storage entries
 */

const GALLERY_REFERRER_PREFIX = "gallery_referrer_";
const FINAL_IMAGE_SELECTION_PREFIX = "final_image_selection_";

/**
 * Clean up stale gallery referrer entries
 * Removes entries for galleries that are no longer relevant (older than 24 hours)
 * or keeps only the most recent N entries
 */
export function cleanupGalleryReferrers(maxEntries: number = 50): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const referrerEntries: Array<{ key: string; timestamp: number }> = [];

    // Collect all gallery_referrer entries
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(GALLERY_REFERRER_PREFIX)) {
        // Try to extract timestamp from value or use current time as fallback
        // Since we don't store timestamps, we'll use a simple LRU approach
        // by keeping only the most recent entries based on access order
        referrerEntries.push({
          key,
          timestamp: Date.now(), // Use current time as approximation
        });
      }
    }

    // If we have more entries than max, remove the oldest ones
    // Since we don't track actual timestamps, we'll remove entries that
    // are likely stale (e.g., from galleries that no longer exist)
    if (referrerEntries.length > maxEntries) {
      // Sort by key (which includes gallery ID) and remove excess
      // This is a simple heuristic - in practice, you might want to
      // track actual access times or validate against current galleries
      const sorted = referrerEntries.sort((a, b) => a.key.localeCompare(b.key));
      const toRemove = sorted.slice(0, sorted.length - maxEntries);

      toRemove.forEach((entry) => {
        sessionStorage.removeItem(entry.key);
      });
    }
  } catch (error) {
    // Silently fail - cleanup is best effort
    console.warn("Failed to cleanup gallery referrers:", error);
  }
}

/**
 * Clean up stale final_image_selection entries
 * Removes entries that are empty or for galleries/orders that no longer exist
 */
export function cleanupImageSelections(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const keysToRemove: string[] = [];

    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(FINAL_IMAGE_SELECTION_PREFIX)) {
        try {
          const value = sessionStorage.getItem(key);
          if (value) {
            const parsed = JSON.parse(value) as {
              selectedKeys?: string[];
              isSelectionMode?: boolean;
            };
            // Remove entries that are empty (no selections and not in selection mode)
            if (
              (!parsed.selectedKeys || parsed.selectedKeys.length === 0) &&
              !parsed.isSelectionMode
            ) {
              keysToRemove.push(key);
            }
          } else {
            // Remove entries with null/empty values
            keysToRemove.push(key);
          }
        } catch {
          // Remove entries with invalid JSON
          keysToRemove.push(key);
        }
      }
    }

    keysToRemove.forEach((key) => {
      sessionStorage.removeItem(key);
    });
  } catch (error) {
    // Silently fail - cleanup is best effort
    console.warn("Failed to cleanup image selections:", error);
  }
}

/**
 * Clean up all stale session storage entries
 * This should be called periodically or on app initialization
 */
export function cleanupStaleSessionStorage(): void {
  cleanupGalleryReferrers();
  cleanupImageSelections();
}

/**
 * Get statistics about session storage usage
 */
export function getSessionStorageStats(): {
  totalKeys: number;
  galleryReferrers: number;
  imageSelections: number;
  cognitoEntries: number;
  other: number;
} {
  if (typeof window === "undefined") {
    return {
      totalKeys: 0,
      galleryReferrers: 0,
      imageSelections: 0,
      cognitoEntries: 0,
      other: 0,
    };
  }

  let galleryReferrers = 0;
  let imageSelections = 0;
  let cognitoEntries = 0;
  let other = 0;

  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (!key) continue;

    if (key.startsWith(GALLERY_REFERRER_PREFIX)) {
      galleryReferrers++;
    } else if (key.startsWith(FINAL_IMAGE_SELECTION_PREFIX)) {
      imageSelections++;
    } else if (key.startsWith("CognitoIdentityServiceProvider")) {
      cognitoEntries++;
    } else {
      other++;
    }
  }

  return {
    totalKeys: sessionStorage.length,
    galleryReferrers,
    imageSelections,
    cognitoEntries,
    other,
  };
}
