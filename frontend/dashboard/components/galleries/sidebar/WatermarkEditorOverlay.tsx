import { useQueryClient } from "@tanstack/react-query";
import React, { useState, useCallback, useEffect, useRef } from "react";

import { useUpdateBusinessInfo, useUploadGlobalWatermark } from "../../../hooks/mutations/useAuthMutations";
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
  const effectiveGallery = currentGallery || gallery;

  // Get current watermark settings
  const getInitialSettings = useCallback(() => {
    if (isGlobalWatermark) {
      const pos = businessInfo?.defaultWatermarkPosition as any;
      return {
        pattern: (pos?.pattern as WatermarkPatternId) || "none",
        customWatermarkUrl: businessInfo?.defaultWatermarkUrl || null,
        opacity: pos?.opacity ?? 0.4,
      };
    } else {
      const pos = effectiveGallery?.watermarkPosition as any;
      return {
        pattern: (pos?.pattern as WatermarkPatternId) || (effectiveGallery?.watermarkUrl ? "custom" : "none"),
        customWatermarkUrl: effectiveGallery?.watermarkUrl || null,
        opacity: pos?.opacity ?? 0.4,
      };
    }
  }, [isGlobalWatermark, businessInfo, effectiveGallery]);

  const [selectedPattern, setSelectedPattern] = useState<WatermarkPatternId>("none");
  const [customWatermarkUrl, setCustomWatermarkUrl] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(0.4);
  const [isLoadingWatermarks, setIsLoadingWatermarks] = useState(true);
  const wasRemovedRef = useRef(false); // Track if watermark was explicitly removed
  const noneSelectedRef = useRef(false); // Track if "none" was explicitly selected
  const userSelectedWatermarkRef = useRef(false); // Track if user manually selected a watermark

  // Initialize settings when overlay opens (only once when it first opens)
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (isOpen && !hasInitializedRef.current) {
      const settings = getInitialSettings();
      setSelectedPattern(settings.pattern);
      setCustomWatermarkUrl(settings.customWatermarkUrl);
      setOpacity(settings.opacity);
      setIsLoadingWatermarks(true); // Start with loading state when opening
      wasRemovedRef.current = false; // Reset removal flag when opening
      noneSelectedRef.current = false; // Reset "none" selection flag when opening
      userSelectedWatermarkRef.current = false; // Reset user selection flag when opening
      hasInitializedRef.current = true;
    } else if (!isOpen) {
      hasInitializedRef.current = false;
      setIsLoadingWatermarks(false); // Reset loading state when closing
      wasRemovedRef.current = false;
      noneSelectedRef.current = false;
      userSelectedWatermarkRef.current = false;
    }
  }, [isOpen, getInitialSettings]);

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
    [galleryId, uploadWatermarkMutation, uploadGlobalWatermarkMutation, showToast, isGlobalWatermark, queryClient]
  );

  // Handle save
  const handleSave = useCallback(async () => {
    try {
      if (isGlobalWatermark) {
        await updateBusinessInfoMutation.mutateAsync({
          defaultWatermarkPosition: {
            pattern: selectedPattern,
            opacity,
          } as any,
          // Explicitly set defaultWatermarkUrl: clear it when "none", set it when "custom"
          defaultWatermarkUrl: selectedPattern === "custom" && customWatermarkUrl
            ? customWatermarkUrl
            : "", // Clear when "none" or no URL (empty string clears in DB)
        });
      } else {
        await updateGalleryMutation.mutateAsync({
          galleryId,
          data: {
            watermarkPosition: {
              pattern: selectedPattern,
              opacity,
            } as any,
            // Explicitly set watermarkUrl: clear it when "none", set it when "custom"
            watermarkUrl: selectedPattern === "custom" && customWatermarkUrl
              ? customWatermarkUrl
              : "", // Clear when "none" or no URL (empty string removes in DB)
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
          } as any,
          defaultWatermarkUrl: undefined,
        });
      } else {
        await updateGalleryMutation.mutateAsync({
          galleryId,
          data: {
            watermarkPosition: {
              pattern: "none",
              opacity: 0.4,
            } as any,
            watermarkUrl: undefined,
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
  }, [
    isGlobalWatermark,
    updateGalleryMutation,
    updateBusinessInfoMutation,
    galleryId,
    showToast,
  ]);

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
  }, [isGlobalWatermark, businessInfo?.defaultWatermarkUrl, effectiveGallery?.watermarkUrl, selectedPattern, customWatermarkUrl]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} closeOnClickOutside={false} className="max-w-6xl">
      <div className="flex flex-col h-full max-h-[95vh]">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">Ustawienia znaku wodnego</h2>
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
              isUploading: uploadWatermarkMutation.isPending || uploadGlobalWatermarkMutation.isPending,
              isProcessing: false, // Can be enhanced if we track processing state
            }}
            isOpen={isOpen}
            onLoadingStateChange={setIsLoadingWatermarks}
          />
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
