import { useCallback, useState, useEffect } from "react";

interface UseImageSelectionOptions {
  storageKey?: string;
}

interface UseImageSelectionReturn {
  selectedKeys: Set<string>;
  isSelectionMode: boolean;
  lastClickedIndex: number | null;
  toggleSelectionMode: () => void;
  handleImageClick: (
    imageKey: string,
    index: number,
    event: MouseEvent,
    images: Array<{ key?: string; filename?: string }>
  ) => void;
  selectAll: (images: Array<{ key?: string; filename?: string }>) => void;
  deselectAll: () => void;
  clearSelection: () => void;
  toggleImage: (imageKey: string, index: number) => void;
  selectRange: (
    startIndex: number,
    endIndex: number,
    images: Array<{ key?: string; filename?: string }>
  ) => void;
}

/**
 * Hook for managing image selection with OS-like keyboard combinations:
 * - SHIFT+Click: Range selection (select all between last clicked and current)
 * - CTRL/CMD+Click: Toggle single image selection
 * - Normal click: Single selection (clears others)
 */
export function useImageSelection(options: UseImageSelectionOptions = {}): UseImageSelectionReturn {
  const { storageKey = "image_selection" } = options;

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

  // Load selection state from sessionStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as {
          selectedKeys?: string[];
          isSelectionMode?: boolean;
        };
        if (parsed.selectedKeys && Array.isArray(parsed.selectedKeys)) {
          setSelectedKeys(new Set(parsed.selectedKeys));
        }
        if (typeof parsed.isSelectionMode === "boolean") {
          setIsSelectionMode(parsed.isSelectionMode);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, [storageKey]);

  // Persist selection state to sessionStorage
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          selectedKeys: Array.from(selectedKeys),
          isSelectionMode,
        })
      );
    } catch {
      // Ignore storage errors (e.g., quota exceeded)
    }
  }, [selectedKeys, isSelectionMode, storageKey]);

  const toggleSelectionMode = useCallback(() => {
    setIsSelectionMode((prev) => {
      const newMode = !prev;
      if (!newMode) {
        // Clear selection when exiting selection mode
        setSelectedKeys(new Set());
        setLastClickedIndex(null);
      }
      return newMode;
    });
  }, []);

  const getImageKey = useCallback((image: { key?: string; filename?: string }): string | null => {
    return image.key ?? image.filename ?? null;
  }, []);

  const toggleImage = useCallback((imageKey: string, index: number) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(imageKey)) {
        next.delete(imageKey);
      } else {
        next.add(imageKey);
      }
      return next;
    });
    setLastClickedIndex(index);
  }, []);

  const selectRange = useCallback(
    (startIndex: number, endIndex: number, images: Array<{ key?: string; filename?: string }>) => {
      const start = Math.min(startIndex, endIndex);
      const end = Math.max(startIndex, endIndex);

      const rangeKeys = images
        .slice(start, end + 1)
        .map(getImageKey)
        .filter((key): key is string => key !== null);

      // Union with existing selection (keep already selected)
      setSelectedKeys((prev) => new Set([...prev, ...rangeKeys]));
      setLastClickedIndex(endIndex);
    },
    [getImageKey]
  );

  const handleImageClick = useCallback(
    (
      imageKey: string,
      index: number,
      event: MouseEvent,
      images: Array<{ key?: string; filename?: string }>
    ) => {
      if (!isSelectionMode) {
        return;
      }

      if (event.shiftKey && lastClickedIndex !== null) {
        // Range selection
        selectRange(lastClickedIndex, index, images);
      } else if (event.ctrlKey || event.metaKey) {
        // Toggle single image
        toggleImage(imageKey, index);
      } else {
        // Normal click: always toggle the clicked image while preserving other selections
        setSelectedKeys((current) => {
          const newSet = new Set(current);
          if (newSet.has(imageKey)) {
            // Already selected, unselect it (keep other selections)
            newSet.delete(imageKey);
            setLastClickedIndex(newSet.size > 0 ? index : null);
            return newSet;
          } else {
            // Not selected, add it to the selection (preserve all existing selections)
            newSet.add(imageKey);
            setLastClickedIndex(index);
            return newSet;
          }
        });
      }
    },
    [isSelectionMode, lastClickedIndex, selectRange, toggleImage]
  );

  const selectAll = useCallback(
    (images: Array<{ key?: string; filename?: string }>) => {
      const allKeys = images.map(getImageKey).filter((key): key is string => key !== null);
      setSelectedKeys(new Set(allKeys));
    },
    [getImageKey]
  );

  const deselectAll = useCallback(() => {
    setSelectedKeys(new Set());
    setLastClickedIndex(null);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
    setLastClickedIndex(null);
  }, []);

  return {
    selectedKeys,
    isSelectionMode,
    lastClickedIndex,
    toggleSelectionMode,
    handleImageClick,
    selectAll,
    deselectAll,
    clearSelection,
    toggleImage,
    selectRange,
  };
}
