/**
 * Normalize selectedKeys from order - handle both array and string formats
 */
export const normalizeSelectedKeys = (selectedKeys: unknown): string[] => {
  if (selectedKeys === undefined || selectedKeys === null) {
    return [];
  }
  if (Array.isArray(selectedKeys)) {
    return selectedKeys;
  }
  if (typeof selectedKeys === "string") {
    try {
      const parsed: unknown = JSON.parse(selectedKeys);
      return Array.isArray(parsed) ? (parsed as string[]) : [selectedKeys];
    } catch {
      return [selectedKeys];
    }
  }
  return [];
};

/**
 * Filter out deleted images from an array
 */
export const filterDeletedImages = <T extends { key?: string; filename?: string }>(
  images: T[],
  deletingImages: Set<string>,
  deletedImageKeys: Set<string>
): T[] => {
  return images.filter((img) => {
    const imgKey = img.key ?? img.filename;
    if (!imgKey) {
      return false;
    }
    // Skip if currently being deleted
    if (deletingImages.has(imgKey)) {
      return false;
    }
    // Skip if successfully deleted
    if (deletedImageKeys.has(imgKey)) {
      return false;
    }
    return true;
  });
};

