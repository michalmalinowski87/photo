import { useQueryClient } from "@tanstack/react-query";
import { Upload, X } from "lucide-react";
import React, { useState, useCallback, useRef, useEffect } from "react";

import { useWatermarks } from "../../../hooks/queries/useWatermarks";
import api from "../../../lib/api-service";
import { queryKeys } from "../../../lib/react-query";
import { applyWatermark } from "../../../lib/watermark-utils";

export type WatermarkPatternId = "none" | "custom";

const PREVIEW_IMAGE_PATH = "/images/family-spending-time-together-home.webp";

interface CustomWatermark {
  id: string;
  url: string;
  name: string;
  createdAt?: string; // ISO timestamp for sorting (newest on right)
}

interface WatermarkPatternSelectorProps {
  selectedPattern: WatermarkPatternId;
  customWatermarkUrl: string | null;
  opacity: number;
  onPatternChange: (patternId: WatermarkPatternId) => void;
  onCustomWatermarkUpload: (file: File) => Promise<void>;
  onOpacityChange: (opacity: number) => void;
  onCustomWatermarkUrlChange?: (url: string | null) => void;
  onRemoveWatermark?: () => Promise<void>;
  uploadStatus?: {
    isUploading: boolean;
    isProcessing: boolean;
  };
  isOpen?: boolean; // Track if overlay is open to force updates on reopen
  onLoadingStateChange?: (isLoading: boolean) => void; // Callback to notify parent of loading state
  /** When true, show thumb preview column to the left of main preview (drawn from base + watermark like main preview, no reload) */
  showThumbPreview?: boolean;
}

const THUMB_PREVIEW_SIZE = 200; // square miniature

export const WatermarkPatternSelector: React.FC<WatermarkPatternSelectorProps> = ({
  selectedPattern,
  customWatermarkUrl,
  opacity,
  onPatternChange,
  onCustomWatermarkUpload,
  onOpacityChange,
  onCustomWatermarkUrlChange,
  onRemoveWatermark,
  uploadStatus = { isUploading: false, isProcessing: false },
  isOpen = true,
  onLoadingStateChange,
  showThumbPreview = false,
}) => {
  const queryClient = useQueryClient();
  const {
    data: watermarksData,
    isLoading: isLoadingWatermarks,
    isFetching: isFetchingWatermarks,
  } = useWatermarks();
  const [customWatermarks, setCustomWatermarks] = useState<CustomWatermark[]>([]);
  const [loadedImageIds, setLoadedImageIds] = useState<Set<string>>(new Set());
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());
  const [isGeneratingWatermark, setIsGeneratingWatermark] = useState(false);
  const [thumbWatermarkLoading, setThumbWatermarkLoading] = useState(false);
  const [baseImageLoaded, setBaseImageLoaded] = useState(false);
  const [uploadingWatermarkId, setUploadingWatermarkId] = useState<string | null>(null);
  const [deletingWatermarkId, setDeletingWatermarkId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const thumbPreviewCanvasRef = useRef<HTMLCanvasElement>(null);
  const baseImageRef = useRef<HTMLImageElement | null>(null);
  const watermarkImageRef = useRef<HTMLImageElement | null>(null);
  const thumbWatermarkImageRef = useRef<HTMLImageElement | null>(null);
  const redrawThumbPreviewRef = useRef<() => void>(() => {});
  const currentPatternRef = useRef<WatermarkPatternId | null>(null);
  const currentCustomUrlRef = useRef<string | null>(null);
  const watermarkImageCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const loadingStartTimeRef = useRef<number | null>(null);
  const hasNotifiedReadyRef = useRef(false);

  // Track when overlay opens to start loading timer
  useEffect(() => {
    if (isOpen && loadingStartTimeRef.current === null) {
      loadingStartTimeRef.current = Date.now();
      hasNotifiedReadyRef.current = false;
    } else if (!isOpen) {
      loadingStartTimeRef.current = null;
      hasNotifiedReadyRef.current = false;
    }
  }, [isOpen]);

  // Track loading state and notify parent
  useEffect(() => {
    if (!isOpen) {
      // When overlay closes, reset loading state
      if (onLoadingStateChange) {
        onLoadingStateChange(false);
      }
      return undefined;
    }

    // Watermarks are considered "ready" when:
    // 1. Query is not loading/fetching (initial load is complete)
    // 2. All watermark images with URLs have either loaded or failed
    // 3. Minimum loading time has passed (prevents blink from cached data)
    const watermarksWithUrls = customWatermarks.filter((w) => w.url && w.url !== "");
    const allImagesResolved =
      watermarksWithUrls.length === 0 ||
      watermarksWithUrls.every((w) => loadedImageIds.has(w.id) || failedImageIds.has(w.id));

    // Only consider ready if we've received data (even if empty) and all images are resolved
    const hasData = watermarksData !== undefined;
    const queryReady = hasData && !isLoadingWatermarks && !isFetchingWatermarks;

    // Ensure minimum loading time of 300ms to prevent blink
    const minLoadingTime = 300;
    const timeSinceOpen = loadingStartTimeRef.current
      ? Date.now() - loadingStartTimeRef.current
      : 0;
    const minTimeElapsed = timeSinceOpen >= minLoadingTime;

    const isReady = queryReady && allImagesResolved && minTimeElapsed;

    // Set up a timeout to check again after minimum loading time if not ready yet
    let timeoutId: NodeJS.Timeout | undefined;

    // If minimum time hasn't elapsed yet, always show loading (prevents blink)
    if (!minTimeElapsed) {
      if (onLoadingStateChange && !hasNotifiedReadyRef.current) {
        onLoadingStateChange(true);
      }
      // Set up timeout to re-check after minimum time
      if (loadingStartTimeRef.current) {
        const remainingTime = minLoadingTime - timeSinceOpen;
        if (remainingTime > 0) {
          timeoutId = setTimeout(() => {
            // Re-evaluate after minimum time
            const watermarksWithUrlsNow = customWatermarks.filter((w) => w.url && w.url !== "");
            const allImagesResolvedNow =
              watermarksWithUrlsNow.length === 0 ||
              watermarksWithUrlsNow.every(
                (w) => loadedImageIds.has(w.id) || failedImageIds.has(w.id)
              );
            const isReadyNow = queryReady && allImagesResolvedNow;

            if (isReadyNow && !hasNotifiedReadyRef.current && onLoadingStateChange) {
              hasNotifiedReadyRef.current = true;
              onLoadingStateChange(false);
            }
          }, remainingTime);
        }
      }
    } else {
      // Minimum time has elapsed, check if actually ready
      if (isReady && !hasNotifiedReadyRef.current) {
        hasNotifiedReadyRef.current = true;
        if (onLoadingStateChange) {
          onLoadingStateChange(false);
        }
      } else if (!isReady && !hasNotifiedReadyRef.current) {
        // Still not ready, keep loading state active
        if (onLoadingStateChange) {
          onLoadingStateChange(true);
        }
      }
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    isOpen,
    isLoadingWatermarks,
    isFetchingWatermarks,
    watermarksData,
    customWatermarks,
    loadedImageIds,
    failedImageIds,
    onLoadingStateChange,
  ]);

  // Reset loaded/failed image tracking when watermarks data changes or overlay opens
  useEffect(() => {
    if (isOpen && watermarksData) {
      // Reset tracking when new data arrives
      setLoadedImageIds(new Set());
      setFailedImageIds(new Set());
    }
  }, [isOpen, watermarksData]);

  // Load watermarks from API
  useEffect(() => {
    if (watermarksData) {
      const apiWatermarks: CustomWatermark[] = watermarksData.map((wm, index) => ({
        id: `api-${index}-${wm.url}`,
        url: wm.url,
        name: wm.name,
        createdAt: wm.createdAt, // Preserve creation timestamp
      }));
      setCustomWatermarks((prev) => {
        // Get existing watermarks with URLs (these are the "real" watermarks from API)
        const existingWatermarks = prev.filter((w) => w.url && w.url !== "");
        const existingUrls = new Set(existingWatermarks.map((w) => w.url));

        // Get all temp watermarks (those without URLs) - keep them even after upload completes
        // until they're matched with an API watermark
        const tempWatermarks = prev.filter((w) => !w.url || w.url === "");

        // Add new API watermarks that aren't already present (by URL)
        // This will include the newly uploaded watermark
        const newApiWatermarks = apiWatermarks.filter((w) => w.url && !existingUrls.has(w.url));

        // If we have new API watermarks and temp watermarks, try to match them by creation time
        // and remove the temp one if a matching API watermark appears
        const tempToRemove = new Set<string>();
        if (tempWatermarks.length > 0 && newApiWatermarks.length > 0) {
          // Find temp watermarks that can be replaced by new API watermarks
          // (they should have similar creation times - within 10 seconds)
          tempWatermarks.forEach((temp) => {
            if (!temp.createdAt) return;
            const tempTime = new Date(temp.createdAt).getTime();
            const matchingApi = newApiWatermarks.find((api) => {
              if (!api.createdAt) return false;
              const apiTime = new Date(api.createdAt).getTime();
              return Math.abs(apiTime - tempTime) < 10000; // Within 10 seconds
            });
            if (matchingApi) {
              tempToRemove.add(temp.id);
            }
          });
        }

        // Filter out temp watermarks that should be removed (replaced by API watermarks)
        const remainingTempWatermarks = tempWatermarks.filter((w) => !tempToRemove.has(w.id));

        // Merge all watermarks and sort by createdAt ascending (oldest first = left, newest last = right)
        // CSS grid flows left-to-right, so newest items at end of array appear on the right
        const allWatermarks = [
          ...remainingTempWatermarks,
          ...existingWatermarks,
          ...newApiWatermarks,
        ];
        return allWatermarks.sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          // Temp watermarks without createdAt go to the end (rightmost)
          if (!a.createdAt && b.createdAt) return 1; // Temp goes after (rightmost)
          if (a.createdAt && !b.createdAt) return -1; // Real watermark goes before temp
          if (!a.createdAt && !b.createdAt) return 0;
          return aTime - bTime; // Ascending: oldest first (left), newest last (right)
        });
      });
    }
  }, [watermarksData, uploadingWatermarkId]);

  // Load base image once
  useEffect(() => {
    // Only load if not already loaded
    if (baseImageRef.current) {
      // Base image already loaded, ensure canvas is set up and redraw
      const canvas = previewCanvasRef.current;
      if (canvas && baseImageRef.current) {
        canvas.width = baseImageRef.current.width;
        canvas.height = baseImageRef.current.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(baseImageRef.current, 0, 0);
          // If we have a cached watermark image, draw it immediately
          if (selectedPattern === "custom" && customWatermarkUrl) {
            const cachedImage = watermarkImageCache.current.get(customWatermarkUrl);
            if (cachedImage) {
              watermarkImageRef.current = cachedImage;
              currentPatternRef.current = selectedPattern;
              currentCustomUrlRef.current = customWatermarkUrl;
              ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
              ctx.drawImage(cachedImage, 0, 0);
              ctx.globalAlpha = 1.0;
            }
            // If no cached image, the updateWatermark effect will handle generating it
          }
        }
      }
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      baseImageRef.current = img;
      setBaseImageLoaded(true);
      const canvas = previewCanvasRef.current;
      if (canvas) {
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
        }
      }
      // Trigger watermark update after base image loads
      // This will be handled by the updateWatermark effect
    };
    img.src = PREVIEW_IMAGE_PATH;
  }, [selectedPattern, customWatermarkUrl, opacity]);

  // Generate watermark image when pattern changes
  const updateWatermark = useCallback(async () => {
    if (!baseImageRef.current || !previewCanvasRef.current) return;

    if (selectedPattern === "none") {
      currentPatternRef.current = selectedPattern;
      currentCustomUrlRef.current = null;
      watermarkImageRef.current = null;
      setIsGeneratingWatermark(false);

      // Clear canvas and draw only base image
      const canvas = previewCanvasRef.current;
      if (canvas && baseImageRef.current) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(baseImageRef.current, 0, 0);
        }
      }
      return;
    }

    if (selectedPattern === "custom") {
      if (!customWatermarkUrl) {
        // No custom watermark URL, show base image
        const canvas = previewCanvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx && baseImageRef.current) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(baseImageRef.current, 0, 0);
          }
        }
        return;
      }

      // Check if we have a cached image for this URL to avoid regeneration
      const cachedImage = watermarkImageCache.current.get(customWatermarkUrl);
      if (cachedImage) {
        watermarkImageRef.current = cachedImage;
        currentPatternRef.current = selectedPattern;
        currentCustomUrlRef.current = customWatermarkUrl;
        redrawPreview();
        return;
      }
    }

    // Generate new watermarked image
    setIsGeneratingWatermark(true);
    try {
      const blob = await fetch(PREVIEW_IMAGE_PATH).then((r) => r.blob());

      if (!customWatermarkUrl) {
        throw new Error("No custom watermark URL provided");
      }

      const watermarkedBlob = await applyWatermark(blob, customWatermarkUrl, 1.0);
      const watermarkedImg = new Image();
      watermarkedImg.crossOrigin = "anonymous";
      const blobUrl = URL.createObjectURL(watermarkedBlob);

      await new Promise<void>((resolve, reject) => {
        watermarkedImg.onload = () => {
          watermarkImageCache.current.set(customWatermarkUrl, watermarkedImg);
          watermarkImageRef.current = watermarkedImg;
          currentPatternRef.current = selectedPattern;
          currentCustomUrlRef.current = customWatermarkUrl;
          URL.revokeObjectURL(blobUrl);
          redrawPreview();
          resolve();
        };
        watermarkedImg.onerror = (error) => {
          URL.revokeObjectURL(blobUrl);
          reject(error);
        };
        watermarkedImg.src = blobUrl;
      });
    } catch (error) {
      console.error("Failed to generate watermark:", error);
    } finally {
      setIsGeneratingWatermark(false);
    }
  }, [selectedPattern, customWatermarkUrl]);

  // Update watermark when pattern or URL changes, or when overlay opens
  useEffect(() => {
    // Only update if base image is loaded
    if (baseImageRef.current && previewCanvasRef.current) {
      void updateWatermark();
    } else {
      // If base image isn't loaded yet, wait a bit and try again
      // This handles the case when overlay reopens and base image needs to be re-initialized
      const timer = setTimeout(() => {
        if (baseImageRef.current && previewCanvasRef.current) {
          void updateWatermark();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [selectedPattern, customWatermarkUrl, updateWatermark, isOpen]);

  // Redraw preview with current opacity (no regeneration, instant update)
  const redrawPreview = useCallback(() => {
    if (!previewCanvasRef.current || !baseImageRef.current) return;

    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear and draw base image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(baseImageRef.current, 0, 0);

    // Draw watermark overlay with current opacity
    if (selectedPattern === "custom" && watermarkImageRef.current && opacity > 0) {
      ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
      ctx.drawImage(watermarkImageRef.current, 0, 0);
      ctx.globalAlpha = 1.0;
    }
  }, [selectedPattern, opacity]);

  // Redraw thumb preview (base + full-cover watermark with opacity) – same pattern as main preview, no reload
  const redrawThumbPreview = useCallback(() => {
    const canvas = thumbPreviewCanvasRef.current;
    const base = baseImageRef.current;
    const wm = thumbWatermarkImageRef.current;
    if (!canvas || !base || selectedPattern !== "custom" || !wm) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = THUMB_PREVIEW_SIZE;
    canvas.height = THUMB_PREVIEW_SIZE;
    const s = Math.max(THUMB_PREVIEW_SIZE / base.width, THUMB_PREVIEW_SIZE / base.height);
    const w = base.width * s;
    const h = base.height * s;
    const x = (THUMB_PREVIEW_SIZE - w) / 2;
    const y = (THUMB_PREVIEW_SIZE - h) / 2;
    ctx.clearRect(0, 0, THUMB_PREVIEW_SIZE, THUMB_PREVIEW_SIZE);
    ctx.drawImage(base, x, y, w, h);

    const clampedOpacity = Math.max(0, Math.min(1, opacity));
    const sw = Math.max(THUMB_PREVIEW_SIZE / wm.width, THUMB_PREVIEW_SIZE / wm.height);
    const ww = wm.width * sw;
    const wh = wm.height * sw;
    const wx = (THUMB_PREVIEW_SIZE - ww) / 2;
    const wy = (THUMB_PREVIEW_SIZE - wh) / 2;
    ctx.globalAlpha = clampedOpacity;
    ctx.drawImage(wm, wx, wy, ww, wh);
    ctx.globalAlpha = 1;
  }, [selectedPattern, opacity]);

  redrawThumbPreviewRef.current = redrawThumbPreview;

  // Load thumb watermark image from URL when custom watermark is selected (for thumb full-cover draw)
  useEffect(() => {
    if (!showThumbPreview || selectedPattern !== "custom" || !customWatermarkUrl) {
      thumbWatermarkImageRef.current = null;
      setThumbWatermarkLoading(false);
      return undefined;
    }
    setThumbWatermarkLoading(true);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      thumbWatermarkImageRef.current = img;
      setThumbWatermarkLoading(false);
      redrawThumbPreviewRef.current();
    };
    img.onerror = () => {
      thumbWatermarkImageRef.current = null;
      setThumbWatermarkLoading(false);
    };
    img.src = customWatermarkUrl;
    return () => {
      img.onload = null;
      img.onerror = null;
      img.src = "";
      thumbWatermarkImageRef.current = null;
      setThumbWatermarkLoading(false);
    };
  }, [showThumbPreview, selectedPattern, customWatermarkUrl]);

  // When base image loads, redraw thumb if we have thumb watermark (so thumb updates without user touching opacity)
  useEffect(() => {
    if (baseImageLoaded && showThumbPreview && selectedPattern === "custom") {
      redrawThumbPreview();
    }
  }, [baseImageLoaded, showThumbPreview, selectedPattern, redrawThumbPreview]);

  // Update opacity instantly (no regeneration) – main preview and thumb both redraw
  useEffect(() => {
    if (selectedPattern === "custom" && watermarkImageRef.current) {
      void redrawPreview();
    } else if (selectedPattern === "none") {
      // Immediately redraw base image when "none" is selected to prevent blinking
      if (previewCanvasRef.current && baseImageRef.current) {
        const canvas = previewCanvasRef.current;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(baseImageRef.current, 0, 0);
        }
      }
    }
    if (showThumbPreview && selectedPattern === "custom" && thumbWatermarkImageRef.current) {
      redrawThumbPreview();
    }
  }, [opacity, selectedPattern, redrawPreview, showThumbPreview, redrawThumbPreview]);

  const handleFileSelect = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        return;
      }

      // Check if we've reached the maximum limit (9 watermarks)
      const currentCount = customWatermarks.filter((w) => w.url && w.url !== "").length;
      if (currentCount >= 9) {
        return; // Don't allow upload if already at limit
      }

      // Create a temporary watermark entry immediately to show upload status
      // This replaces the upload button with the processing overlay in the grid
      const tempId = `temp-${Date.now()}`;
      const now = new Date().toISOString();
      const tempWatermark: CustomWatermark = {
        id: tempId,
        url: "", // Don't use blob URL to avoid broken image display
        name: file.name,
        createdAt: now, // Set to current time so it appears at the end (rightmost)
      };
      setCustomWatermarks((prev) => {
        // Add temp watermark and sort by createdAt ascending (oldest first = left, newest last = right)
        // CSS grid flows left-to-right, so newest items at end of array appear on the right
        const updated = [...prev, tempWatermark];
        return updated.sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          if (!a.createdAt && b.createdAt) return 1; // Temp goes after (rightmost)
          if (a.createdAt && !b.createdAt) return -1; // Real watermark goes before temp
          if (!a.createdAt && !b.createdAt) return 0;
          return aTime - bTime; // Ascending: oldest first (left), newest last (right)
        });
      });
      setUploadingWatermarkId(tempId);

      // Validate file size (max 600x600px)
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);
        if (img.width > 600 || img.height > 600) {
          alert("Plik nie może być większy niż 600x600 px");
          // Remove temp watermark on validation error
          setCustomWatermarks((prev) => prev.filter((w) => w.id !== tempId));
          setUploadingWatermarkId(null);
          return;
        }

        // Upload first, then invalidate query to refresh (temp watermark will be replaced by API watermark)
        void onCustomWatermarkUpload(file)
          .then(() => {
            // Don't remove temp watermark immediately - let the API query update handle it
            // The useEffect will match the temp watermark with the new API watermark by creation time
            // and replace it in the same position
            setUploadingWatermarkId(null);
            // Invalidate to refresh from API (which should now include the new watermark)
            void queryClient.invalidateQueries({ queryKey: queryKeys.watermarks.list() });
          })
          .catch(() => {
            // Remove temp watermark on error
            setCustomWatermarks((prev) => prev.filter((w) => w.id !== tempId));
            setUploadingWatermarkId(null);
          });
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        alert("Nieprawidłowy plik obrazu");
        // Remove temp watermark on error
        setCustomWatermarks((prev) => prev.filter((w) => w.id !== tempId));
        setUploadingWatermarkId(null);
      };

      img.src = url;
    },
    [onCustomWatermarkUpload, customWatermarks, queryClient]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        void handleFileSelect(file);
      }
      e.target.value = "";
    },
    [handleFileSelect]
  );

  const handleRemoveCustomWatermark = useCallback(
    async (id: string, url: string) => {
      setDeletingWatermarkId(id);

      try {
        await api.watermarks.delete(url);

        // If this was the selected watermark, also clear the selection
        if (selectedPattern === "custom" && customWatermarkUrl === url && onRemoveWatermark) {
          await onRemoveWatermark();
          onPatternChange("none");
          if (onCustomWatermarkUrlChange) {
            onCustomWatermarkUrlChange(null);
          }
        }

        setCustomWatermarks((prev) => prev.filter((w) => w.id !== id));
        watermarkImageCache.current.delete(url);
        void queryClient.invalidateQueries({ queryKey: queryKeys.watermarks.list() });
        setDeletingWatermarkId(null);
      } catch (error) {
        console.error("Failed to remove watermark:", error);
        setCustomWatermarks((prev) => prev.filter((w) => w.id !== id));
        if (selectedPattern === "custom" && customWatermarkUrl === url) {
          if (onRemoveWatermark) {
            try {
              await onRemoveWatermark();
            } catch {
              // Ignore errors
            }
          }
          onPatternChange("none");
          if (onCustomWatermarkUrlChange) {
            onCustomWatermarkUrlChange(null);
          }
        }
        setDeletingWatermarkId(null);
      }

      if (url && url.startsWith("blob:")) {
        URL.revokeObjectURL(url);
      }
    },
    [
      selectedPattern,
      customWatermarkUrl,
      onPatternChange,
      onCustomWatermarkUrlChange,
      onRemoveWatermark,
      queryClient,
    ]
  );

  const handleSelectCustomWatermark = useCallback(
    (url: string) => {
      // Check if we have a cached image - if so, use it immediately for instant preview update
      const cachedImage = watermarkImageCache.current.get(url);
      if (cachedImage && previewCanvasRef.current && baseImageRef.current) {
        watermarkImageRef.current = cachedImage;
        currentPatternRef.current = "custom";
        currentCustomUrlRef.current = url;
        if (onCustomWatermarkUrlChange) {
          onCustomWatermarkUrlChange(url);
        }
        if (selectedPattern !== "custom") {
          onPatternChange("custom");
        }
        redrawPreview();
        return;
      }

      // No cached image - update URL and pattern, which will trigger regeneration
      if (onCustomWatermarkUrlChange) {
        onCustomWatermarkUrlChange(url);
      }
      if (selectedPattern !== "custom") {
        onPatternChange("custom");
      }
    },
    [onPatternChange, onCustomWatermarkUrlChange, selectedPattern, redrawPreview]
  );

  const [patternThumbnails, setPatternThumbnails] = useState<Record<string, string>>({});

  // Generate thumbnails for custom watermarks
  useEffect(() => {
    setPatternThumbnails((prev) => {
      const updated = { ...prev };
      customWatermarks.forEach((watermark) => {
        if (watermark.url && watermark.url !== "" && updated[watermark.id] !== watermark.url) {
          updated[watermark.id] = watermark.url;
        } else if (!watermark.url || watermark.url === "") {
          delete updated[watermark.id];
        }
      });
      return updated;
    });
  }, [customWatermarks]);

  // Count actual watermarks (excluding temporary placeholders without URLs)
  const actualWatermarkCount = customWatermarks.filter((w) => w.url && w.url !== "").length;
  const canUploadMore = actualWatermarkCount < 9;
  // Check if we're uploading a new watermark - only show upload button if not uploading
  // (the temp watermark in the grid will show the processing overlay)
  const isUploadingNewWatermark =
    uploadingWatermarkId !== null &&
    customWatermarks.some((w) => w.id === uploadingWatermarkId && !w.url);

  return (
    <div className="space-y-6">
      {/* Watermark Selection */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Wybierz znak wodny
        </h3>
        <div className="grid grid-cols-5 gap-3">
          {/* None option */}
          <button
            onClick={() => {
              if (onCustomWatermarkUrlChange) {
                onCustomWatermarkUrlChange(null);
              }
              onPatternChange("none");
            }}
            className={`
              relative aspect-square rounded-lg border-2 overflow-hidden
              transition-all hover:scale-105
              ${
                selectedPattern === "none"
                  ? "border-photographer-accent ring-2 ring-photographer-accentLight dark:ring-photographer-accent/30"
                  : "border-photographer-border dark:border-gray-600"
              }
            `}
          >
            <div className="w-full h-full bg-photographer-muted dark:bg-gray-800 flex items-center justify-center">
              <span className="text-xs text-photographer-text dark:text-gray-300 font-medium">
                Brak znaku wodnego
              </span>
            </div>
          </button>

          {/* Custom watermarks */}
          {customWatermarks.map((watermark) => {
            const isUploading =
              uploadingWatermarkId === watermark.id &&
              (uploadStatus.isUploading || uploadStatus.isProcessing);
            const isDeleting = deletingWatermarkId === watermark.id;
            const isProcessing = isUploading || isDeleting;
            const isSelected = selectedPattern === "custom" && customWatermarkUrl === watermark.url;
            const thumbnailUrl = patternThumbnails[watermark.id];
            const shouldShowImage = !isProcessing && thumbnailUrl;
            const shouldShowPlaceholder = !isProcessing && !thumbnailUrl;

            return (
              <div key={watermark.id} className="relative group">
                <button
                  onClick={() => !isProcessing && handleSelectCustomWatermark(watermark.url)}
                  disabled={isProcessing}
                  className={`
                    relative aspect-square rounded-lg border-2 overflow-hidden
                    transition-all hover:scale-105 w-full
                    ${isProcessing ? "cursor-not-allowed opacity-75" : ""}
                    ${
                      isSelected
                        ? "border-photographer-accent ring-2 ring-photographer-accentLight dark:ring-photographer-accent/30"
                        : "border-photographer-border dark:border-gray-600"
                    }
                  `}
                >
                  {shouldShowImage ? (
                    <img
                      src={thumbnailUrl}
                      alt={watermark.name}
                      className="w-full h-full object-cover"
                      onLoad={() => {
                        setLoadedImageIds((prev) => new Set(prev).add(watermark.id));
                      }}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        setFailedImageIds((prev) => new Set(prev).add(watermark.id));
                      }}
                    />
                  ) : shouldShowPlaceholder ? (
                    <div className="w-full h-full bg-photographer-muted dark:bg-gray-800 flex items-center justify-center">
                      <span className="text-xs text-photographer-mutedText dark:text-gray-500">
                        {watermark.name}
                      </span>
                    </div>
                  ) : null}
                  {/* Upload/Processing/Deleting Overlay */}
                  {isProcessing && (
                    <div className="absolute inset-0 bg-photographer-muted/90 dark:bg-gray-800/90 rounded-lg flex flex-col items-center justify-center animate-fade-in-out z-10">
                      <span className="text-xs font-medium text-photographer-accent dark:text-photographer-accentLight">
                        {isDeleting
                          ? "Usuwanie..."
                          : uploadStatus.isUploading
                            ? "Przesyłanie..."
                            : "Przetwarzanie..."}
                      </span>
                    </div>
                  )}
                </button>
                {!isUploading && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleRemoveCustomWatermark(watermark.id, watermark.url);
                    }}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}

          {/* Upload watermark button - only show if less than 9 watermarks and not currently uploading */}
          {canUploadMore && !isUploadingNewWatermark && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`
                relative aspect-square rounded-lg border-2 border-dashed overflow-hidden
                transition-all hover:scale-105 flex flex-col items-center justify-center
                border-photographer-border dark:border-gray-600 hover:border-photographer-accent dark:hover:border-photographer-accent
              `}
            >
              <Upload className="w-6 h-6 text-photographer-mutedText dark:text-gray-400 mb-1" />
              <span className="text-sm font-medium text-photographer-text dark:text-gray-400 text-center px-2">
                Dodaj znak wodny
              </span>
              <span className="text-[8px] text-photographer-mutedText dark:text-gray-500 opacity-70 text-center px-2 mt-0.5">
                PNG lub SVG, max. 600x600 px
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/svg+xml"
                onChange={handleFileInputChange}
                className="hidden"
              />
            </button>
          )}
        </div>
      </div>

      {/* Preview Section: thumb canvas (left, 5px margin) + main preview (right); then Przezroczystość under the images */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Podgląd</h3>
        <div className="relative flex flex-row items-start gap-0">
          {showThumbPreview ? (
            <div
              className="flex-shrink-0 relative rounded-lg overflow-hidden flex items-center justify-center mr-[5px]"
              style={{ width: THUMB_PREVIEW_SIZE, height: THUMB_PREVIEW_SIZE }}
            >
              <canvas
                ref={thumbPreviewCanvasRef}
                width={THUMB_PREVIEW_SIZE}
                height={THUMB_PREVIEW_SIZE}
                className="w-full h-full object-cover"
                style={{ display: "block" }}
              />
              {thumbWatermarkLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-black/30">
                  <div className="flex gap-1">
                    <div
                      className="w-2 h-2 rounded-full bg-photographer-accent animate-pulse"
                      style={{ animationDelay: "0ms" }}
                    />
                    <div
                      className="w-2 h-2 rounded-full bg-photographer-accent animate-pulse"
                      style={{ animationDelay: "150ms" }}
                    />
                    <div
                      className="w-2 h-2 rounded-full bg-photographer-accent animate-pulse"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : null}
          <div
            className="relative flex-1 min-w-0 rounded-lg overflow-hidden flex items-center justify-center"
            style={{ minHeight: "400px" }}
          >
            <canvas
              ref={previewCanvasRef}
              className="max-w-full max-h-[600px]"
              style={{ display: "block" }}
            />
            {isGeneratingWatermark && (
              <div className="absolute inset-0 rounded-lg flex items-center justify-center bg-white/50 dark:bg-black/30">
                <span className="text-sm text-photographer-mutedText dark:text-gray-500">
                  Ładowanie znaku wodnego...
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Przezroczystość under the images */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Przezroczystość
            </label>
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {Math.round(opacity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1.0"
            step="0.01"
            value={opacity}
            onChange={(e) => onOpacityChange(Number.parseFloat(e.target.value))}
            className="w-full h-2 bg-photographer-border rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-photographer-accent"
            style={{
              background: `linear-gradient(to right, #8B6F57 0%, #8B6F57 ${opacity * 100}%, #E3D3C4 ${opacity * 100}%, #E3D3C4 100%)`,
            }}
          />
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>
      </div>
    </div>
  );
};
