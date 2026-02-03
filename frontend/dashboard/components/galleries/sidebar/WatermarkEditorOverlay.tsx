import { useQueryClient } from "@tanstack/react-query";
import React, { useState, useCallback, useEffect, useRef } from "react";

import {
  useUpdateBusinessInfo,
  useUploadGlobalWatermark,
} from "../../../hooks/mutations/useAuthMutations";
import { useUpdateGallery, useUploadWatermark } from "../../../hooks/mutations/useGalleryMutations";
import { useBusinessInfo } from "../../../hooks/queries/useAuth";
import { useGallery } from "../../../hooks/queries/useGalleries";
import { useToast } from "../../../hooks/useToast";
import { formatApiError } from "../../../lib/api-service";
import { queryKeys } from "../../../lib/react-query";
import type { Gallery } from "../../../types";
import Button from "../../ui/button/Button";
import { Modal } from "../../ui/modal";

import { WatermarkPatternSelector, type WatermarkPatternId } from "./WatermarkPatternSelector";

interface WatermarkEditorOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  galleryId: string;
  gallery: Gallery | null | undefined;
}

export const WatermarkEditorOverlay: React.FC<WatermarkEditorOverlayProps> = ({
  isOpen,
  onClose,
  galleryId,
  gallery,
}) => {
  const queryClient = useQueryClient();
  const { data: businessInfo } = useBusinessInfo();
  const { data: currentGallery } = useGallery(galleryId || undefined);
  const updateGalleryMutation = useUpdateGallery();
  const updateBusinessInfoMutation = useUpdateBusinessInfo();
  const uploadWatermarkMutation = useUploadWatermark();
  const uploadGlobalWatermarkMutation = useUploadGlobalWatermark();
  const { showToast } = useToast();

  const isGlobalWatermark = !galleryId || galleryId === "";
  const effectiveGallery = currentGallery ?? gallery;

  type WatermarkPositionShape = { pattern?: string; opacity?: number } | null | undefined;

  // Get current watermark settings.
  // For gallery: when gallery has no override, show global options so user can preview and override.
  const getInitialSettings = useCallback(() => {
    if (isGlobalWatermark) {
      const pos = businessInfo?.defaultWatermarkPosition as WatermarkPositionShape;
      return {
        pattern: (pos?.pattern as WatermarkPatternId | undefined) ?? "none",
        customWatermarkUrl: businessInfo?.defaultWatermarkUrl ?? null,
        opacity: pos?.opacity ?? 0.4,
        watermarkThumbnails: businessInfo?.defaultWatermarkThumbnails ?? false,
      };
    } else {
      const galleryPos = effectiveGallery?.watermarkPosition as WatermarkPositionShape;
      const galleryPattern = galleryPos?.pattern as WatermarkPatternId | undefined;
      const hasGalleryExplicitNone = galleryPattern === "none";
      const hasGalleryCustom = Boolean(effectiveGallery?.watermarkUrl);

      if (hasGalleryExplicitNone) {
        return {
          pattern: "none" as WatermarkPatternId,
          customWatermarkUrl: null,
          opacity: 0.4,
          watermarkThumbnails: false,
        };
      }
      if (hasGalleryCustom) {
        return {
          pattern: (galleryPattern ?? "custom") as WatermarkPatternId,
          customWatermarkUrl: effectiveGallery?.watermarkUrl ?? null,
          opacity: galleryPos?.opacity ?? 0.4,
          watermarkThumbnails: effectiveGallery?.watermarkThumbnails ?? false,
        };
      }
      // Gallery has no override: show global options so user can preview and override
      const globalPos = businessInfo?.defaultWatermarkPosition as WatermarkPositionShape;
      return {
        pattern:
          (globalPos?.pattern as WatermarkPatternId | undefined) ??
          (businessInfo?.defaultWatermarkUrl ? "custom" : "none"),
        customWatermarkUrl: businessInfo?.defaultWatermarkUrl ?? null,
        opacity: globalPos?.opacity ?? 0.4,
        watermarkThumbnails: businessInfo?.defaultWatermarkThumbnails ?? false,
      };
    }
  }, [isGlobalWatermark, businessInfo, effectiveGallery]);

  const [selectedPattern, setSelectedPattern] = useState<WatermarkPatternId>("none");
  const [customWatermarkUrl, setCustomWatermarkUrl] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(0.4);
  const [watermarkThumbnails, setWatermarkThumbnails] = useState(false);
  const [isLoadingWatermarks, setIsLoadingWatermarks] = useState(true);
  const wasRemovedRef = useRef(false); // Track if watermark was explicitly removed
  const noneSelectedRef = useRef(false); // Track if "none" was explicitly selected
  const userSelectedWatermarkRef = useRef(false); // Track if user manually selected a watermark
  const userChangedThumbnailsRef = useRef(false); // Track if user toggled "watermark thumbnails" this session

  // Initialize settings when overlay opens (only once when it first opens)
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (isOpen && !hasInitializedRef.current) {
      const settings = getInitialSettings();
      setSelectedPattern(settings.pattern);
      setCustomWatermarkUrl(settings.customWatermarkUrl);
      setOpacity(typeof settings.opacity === "number" ? settings.opacity : 0.4);
      setWatermarkThumbnails(
        typeof settings.watermarkThumbnails === "boolean" ? settings.watermarkThumbnails : false
      );
      setIsLoadingWatermarks(true); // Start with loading state when opening
      wasRemovedRef.current = false; // Reset removal flag when opening
      noneSelectedRef.current = false; // Reset "none" selection flag when opening
      userSelectedWatermarkRef.current = false; // Reset user selection flag when opening
      userChangedThumbnailsRef.current = false; // Reset so we can sync from server when data arrives
      hasInitializedRef.current = true;
    } else if (!isOpen) {
      hasInitializedRef.current = false;
      setIsLoadingWatermarks(false); // Reset loading state when closing
      wasRemovedRef.current = false;
      noneSelectedRef.current = false;
      userSelectedWatermarkRef.current = false;
      userChangedThumbnailsRef.current = false;
    }
  }, [isOpen, getInitialSettings]);

  // Sync watermarkThumbnails from server when overlay is open and source data updates
  const galleryPatternFromPos =
    effectiveGallery?.watermarkPosition &&
    typeof effectiveGallery.watermarkPosition === "object" &&
    "pattern" in effectiveGallery.watermarkPosition
      ? (effectiveGallery.watermarkPosition as { pattern?: string }).pattern
      : undefined;
  const galleryHasNoOverride = !effectiveGallery?.watermarkUrl && galleryPatternFromPos !== "none";
  const sourceThumbnails = isGlobalWatermark
    ? businessInfo?.defaultWatermarkThumbnails
    : (effectiveGallery?.watermarkThumbnails ??
      (galleryHasNoOverride ? businessInfo?.defaultWatermarkThumbnails : undefined));
  useEffect(() => {
    if (!isOpen || userChangedThumbnailsRef.current) return;
    // Only sync when we have a defined value from the server (true or false)
    if (typeof sourceThumbnails !== "boolean") return;
    const value = sourceThumbnails;
    setWatermarkThumbnails((prev) => (prev !== value ? value : prev));
  }, [isOpen, sourceThumbnails]);

  // Handle custom watermark upload
  const handleCustomWatermarkUpload = useCallback(
    async (file: File) => {
      try {
        if (isGlobalWatermark) {
          await uploadGlobalWatermarkMutation.mutateAsync({ file });
          showToast("success", "Sukces", "Znak wodny został przesłany");
          // Invalidate watermarks list to refresh the UI
          void queryClient.invalidateQueries({ queryKey: queryKeys.watermarks.list() });
          // Don't set as default - user must click SAVE to make it default
          // The watermark will appear in the list and user can select it
        } else {
          const result = await uploadWatermarkMutation.mutateAsync({
            galleryId,
            file,
          });
          if (result.watermarkUrl) {
            showToast("success", "Sukces", "Znak wodny został przesłany");
            // Invalidate watermarks list to refresh the UI
            void queryClient.invalidateQueries({ queryKey: queryKeys.watermarks.list() });
            // Don't set as default - user must click SAVE to make it default
          }
        }
      } catch (error) {
        showToast("error", "Błąd", formatApiError(error as Error));
      }
    },
    [
      galleryId,
      uploadWatermarkMutation,
      uploadGlobalWatermarkMutation,
      showToast,
      isGlobalWatermark,
      queryClient,
    ]
  );

  // Handle save
  const handleSave = useCallback(async () => {
    try {
      if (isGlobalWatermark) {
        await updateBusinessInfoMutation.mutateAsync({
          defaultWatermarkPosition: {
            pattern: selectedPattern,
            opacity,
          },
          defaultWatermarkUrl:
            selectedPattern === "custom" && customWatermarkUrl ? customWatermarkUrl : "",
          defaultWatermarkThumbnails: watermarkThumbnails,
        });
      } else {
        await updateGalleryMutation.mutateAsync({
          galleryId,
          data: {
            watermarkPosition: {
              pattern: selectedPattern,
              opacity,
            },
            watermarkUrl:
              selectedPattern === "custom" && customWatermarkUrl ? customWatermarkUrl : "",
            watermarkThumbnails,
          },
        });
      }

      showToast("success", "Sukces", "Ustawienia znaku wodnego zostały zapisane");
      onClose();
    } catch (error) {
      showToast("error", "Błąd", formatApiError(error as Error));
    }
  }, [
    isGlobalWatermark,
    selectedPattern,
    customWatermarkUrl,
    opacity,
    watermarkThumbnails,
    updateGalleryMutation,
    updateBusinessInfoMutation,
    galleryId,
    showToast,
    onClose,
  ]);

  // Handle remove watermark (clears the selected watermark from gallery/business info)
  const handleRemoveWatermark = useCallback(async () => {
    try {
      if (isGlobalWatermark) {
        await updateBusinessInfoMutation.mutateAsync({
          defaultWatermarkPosition: {
            pattern: "none",
            opacity: 0.4,
          },
          defaultWatermarkUrl: undefined,
          defaultWatermarkThumbnails: false,
        });
      } else {
        await updateGalleryMutation.mutateAsync({
          galleryId,
          data: {
            watermarkPosition: {
              pattern: "none",
              opacity: 0.4,
            },
            watermarkUrl: undefined,
            watermarkThumbnails: false,
          },
        });
      }

      // Update local state to reflect removal
      setSelectedPattern("none");
      setCustomWatermarkUrl(null);
      wasRemovedRef.current = true; // Mark as removed to prevent re-initialization
      // Note: The actual watermark deletion from DB/S3 is handled by WatermarkPatternSelector
      // This just clears the selection
      // Don't close the overlay - let user continue working
    } catch (error) {
      showToast("error", "Błąd", formatApiError(error as Error));
      throw error; // Re-throw so caller knows it failed
    }
  }, [isGlobalWatermark, updateGalleryMutation, updateBusinessInfoMutation, galleryId, showToast]);

  // Update custom watermark URL when it changes from backend (only on initial load, not after user selections)
  useEffect(() => {
    if (wasRemovedRef.current) {
      return;
    }

    // Don't override if user explicitly selected "none"
    if (noneSelectedRef.current || selectedPattern === "none") {
      return;
    }

    // Don't override if user has manually selected a watermark
    if (userSelectedWatermarkRef.current) {
      return;
    }

    if (isGlobalWatermark && businessInfo?.defaultWatermarkUrl) {
      setCustomWatermarkUrl(businessInfo.defaultWatermarkUrl);
      if (selectedPattern !== "custom") {
        setSelectedPattern("custom");
      }
    } else if (!isGlobalWatermark && effectiveGallery?.watermarkUrl) {
      const galleryUrl = effectiveGallery.watermarkUrl;
      if (galleryUrl !== customWatermarkUrl) {
        setCustomWatermarkUrl(galleryUrl);
        if (selectedPattern !== "custom") {
          setSelectedPattern("custom");
        }
      }
    }
  }, [
    isGlobalWatermark,
    businessInfo?.defaultWatermarkUrl,
    effectiveGallery?.watermarkUrl,
    selectedPattern,
    customWatermarkUrl,
  ]);

  const showThumbsBlock = selectedPattern !== "none";

  return (
    <Modal isOpen={isOpen} onClose={onClose} closeOnClickOutside={false} className="max-w-6xl">
      <div className="flex flex-col h-full max-h-[95vh]">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Ustawienia znaku wodnego
          </h2>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 relative">
          {isLoadingWatermarks && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm z-50">
              <div className="flex flex-col items-center justify-center gap-6 opacity-60">
                {/* Subtle loading indicator */}
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 bg-photographer-accent dark:bg-photographer-accent rounded-full animate-pulse"
                    style={{ animationDelay: "0s" }}
                  ></div>
                  <div
                    className="w-2 h-2 bg-photographer-accent dark:bg-photographer-accent rounded-full animate-pulse"
                    style={{ animationDelay: "0.2s" }}
                  ></div>
                  <div
                    className="w-2 h-2 bg-photographer-accent dark:bg-photographer-accent rounded-full animate-pulse"
                    style={{ animationDelay: "0.4s" }}
                  ></div>
                </div>
                {/* Loading message */}
                <p className="text-base text-gray-600 dark:text-gray-400 font-medium">
                  Ładowanie znaków wodnych...
                </p>
              </div>
            </div>
          )}
          <WatermarkPatternSelector
            selectedPattern={selectedPattern}
            customWatermarkUrl={customWatermarkUrl}
            opacity={opacity}
            onPatternChange={(pattern) => {
              setSelectedPattern(pattern);
              // When "none" is selected, also clear the custom watermark URL
              if (pattern === "none") {
                setCustomWatermarkUrl(null);
                noneSelectedRef.current = true; // Mark that "none" was explicitly selected
              } else {
                noneSelectedRef.current = false; // Clear flag when selecting something else
              }
            }}
            onCustomWatermarkUpload={handleCustomWatermarkUpload}
            onOpacityChange={setOpacity}
            onCustomWatermarkUrlChange={(url) => {
              setCustomWatermarkUrl(url);
              // Mark that user manually selected a watermark (not from backend sync)
              if (url !== null) {
                userSelectedWatermarkRef.current = true;
              }
            }}
            onRemoveWatermark={handleRemoveWatermark}
            uploadStatus={{
              isUploading:
                uploadWatermarkMutation.isPending || uploadGlobalWatermarkMutation.isPending,
              isProcessing: false, // Can be enhanced if we track processing state
            }}
            isOpen={isOpen}
            onLoadingStateChange={setIsLoadingWatermarks}
            showThumbPreview={showThumbsBlock && watermarkThumbnails}
          />
          {/* Watermark thumbnails: when on, thumb and bigThumb get one full-cover watermark; when off, only preview is watermarked */}
          {showThumbsBlock && (
            <div className="mt-6 flex flex-col gap-2 rounded-lg border border-photographer-border dark:border-gray-600 bg-photographer-bgSecondary dark:bg-gray-800/50 p-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="watermark-thumbnails"
                  checked={watermarkThumbnails}
                  onChange={(e) => {
                    userChangedThumbnailsRef.current = true;
                    setWatermarkThumbnails(e.target.checked);
                  }}
                  className="h-4 w-4 rounded border-gray-400 text-photographer-accent focus:ring-photographer-accent dark:border-gray-500 dark:bg-gray-700"
                />
                <label
                  htmlFor="watermark-thumbnails"
                  className="text-sm font-medium text-photographer-text dark:text-gray-200 cursor-pointer"
                >
                  Znak wodny na miniaturkach
                </label>
              </div>
              <p className="text-xs text-photographer-mutedText dark:text-gray-400 pl-7">
                Gdy włączone: miniatury i większe podglądy mają jeden znak wodny na całość. Gdy
                wyłączone: tylko duży podgląd (pełny ekran) ma znak wodny.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-photographer-border dark:border-gray-700 flex items-center justify-between gap-3">
          <p className="text-sm text-photographer-mutedText dark:text-gray-400">
            Zmiana znaku wodnego będzie miała efekt tylko dla nowo dodanych zdjęć.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose}>
              Anuluj
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateGalleryMutation.isPending || updateBusinessInfoMutation.isPending}
            >
              {updateGalleryMutation.isPending || updateBusinessInfoMutation.isPending
                ? "Zapisywanie..."
                : "Zapisz"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
