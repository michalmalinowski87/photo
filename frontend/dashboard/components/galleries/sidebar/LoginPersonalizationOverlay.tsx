import { ExternalLink } from "lucide-react";
import React, { useState, useCallback, useRef, useEffect } from "react";

import { useUpdateGallery } from "../../../hooks/mutations/useGalleryMutations";
import { useGallery } from "../../../hooks/queries/useGalleries";
import { useToast } from "../../../hooks/useToast";
import { formatApiError } from "../../../lib/api-service";
import { buildTenantGalleryLoginUrl } from "../../../lib/gallery-url";
import Button from "../../ui/button/Button";
import { Modal } from "../../ui/modal";

import { CoverPhotoPositioner } from "./CoverPhotoPositioner";
import { LayoutSelector, type LoginPageLayout } from "./LayoutSelector";

interface LoginPersonalizationOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  galleryId: string;
  coverPhotoUrl: string;
}

export const LoginPersonalizationOverlay: React.FC<LoginPersonalizationOverlayProps> = ({
  isOpen,
  onClose,
  galleryId,
  coverPhotoUrl,
}) => {
  const { data: gallery } = useGallery(galleryId);
  const updateGalleryMutation = useUpdateGallery();
  const { showToast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize state from gallery data
  const [selectedLayout, setSelectedLayout] = useState<LoginPageLayout>(
    (gallery?.loginPageLayout as LoginPageLayout) || "split"
  );
  const [coverPosition, setCoverPosition] = useState<{
    x?: number;
    y?: number;
    scale?: number;
    objectPosition?: string; // Legacy support
  }>(() => {
    // Use x, y directly if available (new format)
    if (
      gallery?.coverPhotoPosition?.x !== undefined &&
      gallery?.coverPhotoPosition?.y !== undefined
    ) {
      return {
        x: gallery.coverPhotoPosition.x,
        y: gallery.coverPhotoPosition.y,
        scale: gallery.coverPhotoPosition.scale,
      };
    }
    // Legacy support: use objectPosition
    if (gallery?.coverPhotoPosition?.objectPosition) {
      return {
        objectPosition: gallery.coverPhotoPosition.objectPosition,
        scale: gallery.coverPhotoPosition.scale,
      };
    }
    return { x: 0, y: 0, scale: 1 };
  });

  // Update state when gallery data changes
  useEffect(() => {
    if (gallery?.loginPageLayout) {
      setSelectedLayout(gallery.loginPageLayout as LoginPageLayout);
    }
    // Use x, y directly if available (new format)
    if (
      gallery?.coverPhotoPosition?.x !== undefined &&
      gallery?.coverPhotoPosition?.y !== undefined
    ) {
      setCoverPosition({
        x: gallery.coverPhotoPosition.x,
        y: gallery.coverPhotoPosition.y,
        scale: gallery.coverPhotoPosition.scale,
      });
    } else if (gallery?.coverPhotoPosition?.objectPosition) {
      // Legacy support
      setCoverPosition({
        objectPosition: gallery.coverPhotoPosition.objectPosition,
        scale: gallery.coverPhotoPosition.scale,
      });
    }
  }, [gallery]);

  const [previewWidth, setPreviewWidth] = useState(800);
  const [previewHeight, setPreviewHeight] = useState(500);

  // Calculate preview dimensions based on container to fit within viewport
  useEffect(() => {
    if (containerRef.current && isOpen) {
      const container = containerRef.current;
      const updateDimensions = () => {
        // Account for padding (px-6 = 48px total), layout selector height (~200px), and footer (~80px)
        const availableWidth = container.clientWidth - 48;
        const availableHeight = container.clientHeight - 280; // Header + layout selector + spacing + footer

        // Use aspect ratio similar to login page (roughly 16:10)
        const maxWidth = Math.min(availableWidth, 900);
        const maxHeight = Math.min(availableHeight, 560);

        // Maintain aspect ratio while fitting in available space
        const aspectRatio = 16 / 10;
        let width = maxWidth;
        let height = width / aspectRatio;

        if (height > maxHeight) {
          height = maxHeight;
          width = height * aspectRatio;
        }

        setPreviewWidth(Math.max(400, width));
        setPreviewHeight(Math.max(250, height));
      };

      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        updateDimensions();
      });

      window.addEventListener("resize", updateDimensions);
      return () => window.removeEventListener("resize", updateDimensions);
    }
  }, [isOpen]);

  const handleLayoutChange = useCallback((layout: LoginPageLayout) => {
    setSelectedLayout(layout);
  }, []);

  const handlePositionChange = useCallback(
    (position: { x?: number; y?: number; scale?: number; objectPosition?: string }) => {
      setCoverPosition(position);
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!galleryId) return;

    try {
      await updateGalleryMutation.mutateAsync({
        galleryId,
        data: {
          loginPageLayout: selectedLayout,
          coverPhotoPosition: {
            x: coverPosition.x,
            y: coverPosition.y,
            scale: coverPosition.scale,
            // Include objectPosition for backward compatibility if x/y not available
            ...(coverPosition.objectPosition && !coverPosition.x && !coverPosition.y
              ? { objectPosition: coverPosition.objectPosition }
              : {}),
          },
        },
      });

      showToast("success", "Sukces", "Ustawienia strony logowania zostały zapisane");
      onClose();
    } catch (error) {
      showToast(
        "error",
        "Błąd",
        formatApiError(error as Error) ?? "Nie udało się zapisać ustawień"
      );
    }
  }, [galleryId, selectedLayout, coverPosition, updateGalleryMutation, showToast, onClose]);

  const handleViewLiveTest = useCallback(async () => {
    if (!gallery || !galleryId) return;

    // Save current settings first before opening live preview
    try {
      await updateGalleryMutation.mutateAsync({
        galleryId,
        data: {
          loginPageLayout: selectedLayout,
          coverPhotoPosition: {
            x: coverPosition.x,
            y: coverPosition.y,
            scale: coverPosition.scale,
            // Include objectPosition for backward compatibility if x/y not available
            ...(coverPosition.objectPosition && !coverPosition.x && !coverPosition.y
              ? { objectPosition: coverPosition.objectPosition }
              : {}),
          },
        },
      });

      // Add cache-busting parameter to ensure fresh data
      const loginUrl = buildTenantGalleryLoginUrl(gallery);
      const separator = loginUrl.includes("?") ? "&" : "?";
      const urlWithCacheBust = `${loginUrl}${separator}_t=${Date.now()}`;
      window.open(urlWithCacheBust, "_blank", "noopener,noreferrer");
    } catch (error) {
      showToast(
        "error",
        "Błąd",
        formatApiError(error as Error) ?? "Nie udało się zapisać ustawień przed podglądem"
      );
    }
  }, [gallery, galleryId, selectedLayout, coverPosition, updateGalleryMutation, showToast]);

  const isLoading = updateGalleryMutation.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="max-w-6xl max-h-[90vh] flex flex-col"
      showCloseButton={true}
      closeOnClickOutside={false}
    >
      <div ref={containerRef} className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Personalizacja strony logowania
          </h2>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-6">
            {/* Layout Selector */}
            <div>
              <LayoutSelector
                selectedLayout={selectedLayout}
                onLayoutChange={handleLayoutChange}
                coverPhotoUrl={coverPhotoUrl}
                galleryName={
                  gallery?.galleryName && typeof gallery.galleryName === "string"
                    ? gallery.galleryName
                    : null
                }
              />
            </div>

            {/* Preview Section */}
            <div>
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Podgląd strony logowania
              </div>
              <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-900 flex items-center justify-center overflow-hidden">
                <div
                  className="flex-shrink-0"
                  style={{ width: previewWidth, height: previewHeight }}
                >
                  <CoverPhotoPositioner
                    key={selectedLayout}
                    coverPhotoUrl={coverPhotoUrl}
                    layout={selectedLayout}
                    galleryName={
                      gallery?.galleryName && typeof gallery.galleryName === "string"
                        ? gallery.galleryName
                        : null
                    }
                    initialPosition={coverPosition}
                    onPositionChange={handlePositionChange}
                    containerWidth={previewWidth}
                    containerHeight={previewHeight}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-4">
          <Button
            variant="outline"
            onClick={handleViewLiveTest}
            disabled={!gallery || isLoading}
            startIcon={<ExternalLink size={18} />}
          >
            Zobacz podgląd na żywo
          </Button>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose} disabled={isLoading}>
              Anuluj
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={isLoading}>
              {isLoading ? "Zapisywanie..." : "Zapisz"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
