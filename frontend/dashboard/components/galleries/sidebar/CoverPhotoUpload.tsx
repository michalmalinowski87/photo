import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useRouter } from "next/router";
import React, { useState, useRef, useCallback, useEffect } from "react";

import {
  useUpdateGallery,
  useUploadCoverPhoto,
} from "../../../hooks/mutations/useGalleryMutations";
import { useGallery } from "../../../hooks/queries/useGalleries";
import { useToast } from "../../../hooks/useToast";
import { formatApiError } from "../../../lib/api-service";
import { queryKeys } from "../../../lib/react-query";
import { RetryableImage } from "../../ui/RetryableImage";

export const CoverPhotoUpload: React.FC = () => {
  const router = useRouter();
  const galleryIdParam = Array.isArray(router.query.id) ? router.query.id[0] : router.query.id;
  const galleryId = typeof galleryIdParam === "string" ? galleryIdParam : undefined;
  const queryClient = useQueryClient();

  // Use React Query hooks
  // placeholderData is already configured in useGallery to keep previous data during refetch
  const { data: gallery, isLoading } = useGallery(galleryId);
  const updateGalleryMutation = useUpdateGallery();
  const uploadCoverPhotoMutation = useUploadCoverPhoto();

  // Track upload phase: 'uploading' (S3 upload) or 'processing' (waiting for CloudFront)
  const [uploadPhase, setUploadPhase] = useState<"uploading" | "processing" | null>(null);
  // Track when image is actually loaded and ready to display
  const [imageReady, setImageReady] = useState(false);
  // Track if we've started an upload (to keep showing loading state until CloudFront URL is ready)
  const [hasStartedUpload, setHasStartedUpload] = useState(false);

  // Only show image when we have a final CloudFront URL (not S3, not blob) and image is ready
  const isUploadingOrProcessing = uploadCoverPhotoMutation.isPending;
  const hasCloudFrontUrl =
    gallery?.coverPhotoUrl &&
    typeof gallery.coverPhotoUrl === "string" &&
    !gallery.coverPhotoUrl.startsWith("blob:") &&
    !gallery.coverPhotoUrl.includes(".s3.") &&
    !gallery.coverPhotoUrl.includes("s3.amazonaws.com");
  
  // Keep showing loading state if we've started upload but don't have CloudFront URL yet
  const shouldShowLoadingState = isUploadingOrProcessing || (hasStartedUpload && !hasCloudFrontUrl);
  
  // Reset imageReady when upload starts or URL changes
  useEffect(() => {
    if (isUploadingOrProcessing || !hasCloudFrontUrl) {
      setImageReady(false);
    }
    // Clear hasStartedUpload when we have CloudFront URL
    if (hasCloudFrontUrl) {
      setHasStartedUpload(false);
    }
  }, [isUploadingOrProcessing, hasCloudFrontUrl]);
  
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Determine upload/processing states based on mutation and phase
  // If phase is not set yet but mutation is pending, default to uploading
  const isUploading = uploadCoverPhotoMutation.isPending && (uploadPhase === "uploading" || uploadPhase === null);
  const isProcessing = uploadCoverPhotoMutation.isPending && uploadPhase === "processing";
  

  // Handle mutation success/error with toasts
  useEffect(() => {
    if (uploadCoverPhotoMutation.isSuccess && uploadCoverPhotoMutation.data) {
      if (uploadCoverPhotoMutation.data.warning) {
        showToast(
          "warning",
          "Ostrzeżenie",
          "Okładka została przesłana, ale przetwarzanie trwa dłużej niż zwykle"
        );
      } else {
        showToast("success", "Sukces", "Okładka galerii została przesłana");
      }
      // The blob will be cleared automatically by the useEffect when real data arrives
      uploadCoverPhotoMutation.reset();
    }
  }, [
    uploadCoverPhotoMutation.isSuccess,
    uploadCoverPhotoMutation.data,
    uploadCoverPhotoMutation,
    showToast,
  ]);

  useEffect(() => {
    if (uploadCoverPhotoMutation.isError) {
      setUploadPhase(null);
      showToast(
        "error",
        "Błąd",
        formatApiError(uploadCoverPhotoMutation.error) ?? "Nie udało się przesłać okładki"
      );
      uploadCoverPhotoMutation.reset();
    }
  }, [
    uploadCoverPhotoMutation.isError,
    uploadCoverPhotoMutation.error,
    uploadCoverPhotoMutation,
    showToast,
  ]);


  // Track upload phase when a new upload starts
  useEffect(() => {
    if (uploadCoverPhotoMutation.isPending) {
      // If phase is null but mutation is pending, set to uploading
      if (uploadPhase === null) {
        setUploadPhase("uploading");
      }
      // After a short delay, switch to processing phase (S3 upload is quick, then we wait for CloudFront)
      // This gives a better UX - show "uploading" briefly, then "processing"
      if (uploadPhase === "uploading") {
        const timeoutId = setTimeout(() => {
          setUploadPhase("processing");
        }, 2000); // Switch to processing after 2 seconds (S3 upload should be done by then)
        return () => clearTimeout(timeoutId);
      }
      return undefined;
    } else {
      // Upload complete, reset phase
      setUploadPhase(null);
      return undefined;
    }
  }, [uploadCoverPhotoMutation.isPending, uploadPhase]);


  const handleCoverPhotoUpload = useCallback(
    (file: File): void => {
      if (!file || !galleryId || typeof galleryId !== "string") {
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        showToast("error", "Błąd", "Plik jest za duży. Maksymalny rozmiar to 5MB.");
        return;
      }

      // Set upload phase immediately and mark that we've started upload
      setUploadPhase("uploading");
      setHasStartedUpload(true);

      // Trigger the React Query mutation which handles the entire upload flow
      uploadCoverPhotoMutation.mutate({ galleryId, file });
    },
    [galleryId, showToast, uploadCoverPhotoMutation]
  );

  const handleRemoveCoverPhoto = useCallback(
    async (e: React.MouseEvent): Promise<void> => {
      e.stopPropagation(); // Prevent triggering the file input

      if (!galleryId || typeof galleryId !== "string") {
        return;
      }

      setUploadPhase(null);

      try {
        // Remove cover photo by setting coverPhotoUrl to null (backend expects null or empty string)
        await updateGalleryMutation.mutateAsync({
          galleryId,
          data: { coverPhotoUrl: null },
        });

        // Invalidate cover photo query cache to ensure UI updates
        if (galleryId) {
          await queryClient.invalidateQueries({
            queryKey: queryKeys.galleries.coverPhoto(galleryId),
          });
        }

        showToast("success", "Sukces", "Okładka galerii została usunięta");
      } catch (err: unknown) {
        showToast("error", "Błąd", formatApiError(err as Error) ?? "Nie udało się usunąć okładki");
      }
    },
    [galleryId, updateGalleryMutation, queryClient, showToast]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file?.type.startsWith("image/")) {
      handleCoverPhotoUpload(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file?.type.startsWith("image/")) {
      handleCoverPhotoUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsDragging(false);
  };

  return (
    <div className="py-3 border-b border-gray-200 dark:border-gray-800">
      <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Okładka galerii</div>
      <div
        className={`relative w-full h-48 rounded-lg border-2 border-dashed transition-colors ${
          isLoading || !gallery
            ? "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 cursor-default"
            : `cursor-pointer ${
                isDragging
                  ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
                  : hasCloudFrontUrl || shouldShowLoadingState
                    ? "border-gray-200 dark:border-gray-700"
                    : "border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800"
              }`
        }`}
        onDrop={isLoading || !gallery ? undefined : handleDrop}
        onDragOver={isLoading || !gallery ? undefined : handleDragOver}
        onDragLeave={isLoading || !gallery ? undefined : handleDragLeave}
        onClick={isLoading || !gallery ? undefined : () => fileInputRef.current?.click()}
      >
        {isLoading || !gallery ? (
          <div className="w-full h-full flex flex-col items-center justify-center">
            <div className="animate-pulse">
              <div className="w-12 h-12 bg-gray-300 dark:bg-gray-600 rounded-lg mb-2"></div>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Ładowanie...</div>
          </div>
        ) : shouldShowLoadingState ? (
          <div className="w-full h-full flex flex-col items-center justify-center cursor-pointer relative">
            {/* Dark overlay with upload/processing message */}
            <div className="absolute inset-0 bg-black bg-opacity-70 rounded-lg flex items-center justify-center z-10">
              <div className="text-white text-base font-semibold">
                {isProcessing ? "Przetwarzanie obrazu..." : "Przesyłanie do serwera..."}
              </div>
            </div>
            <Plus size={48} className="text-gray-400 dark:text-gray-500 mb-2 opacity-30" />
            <p className="text-sm text-gray-500 dark:text-gray-500 text-center px-4">
              {isProcessing ? "Przetwarzanie..." : "Przesyłanie..."}
            </p>
          </div>
        ) : hasCloudFrontUrl ? (
          <>
            <RetryableImage
              src={gallery.coverPhotoUrl as string}
              alt="Okładka galerii"
              className="w-full h-full object-cover rounded-lg pointer-events-none"
            />
            {/* Hidden image to detect when it's loaded */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={gallery.coverPhotoUrl as string}
              alt=""
              className="hidden"
              onLoad={() => {
                // Image has loaded, mark as ready
                setImageReady(true);
              }}
            />
            {/* Show loading overlay until image is ready */}
            {!imageReady && (
              <div className="absolute inset-0 bg-black bg-opacity-70 rounded-lg flex items-center justify-center z-10">
                <div className="text-white text-base font-semibold">
                  {isProcessing ? "Przetwarzanie obrazu..." : "Ładowanie obrazu..."}
                </div>
              </div>
            )}
            {/* Hover overlay - only show when image is ready */}
            {imageReady && (
              <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-50 transition-opacity rounded-lg flex flex-col items-center justify-center gap-2 group">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-sm font-medium">
                  Kliknij na obraz aby zmienić
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleRemoveCoverPhoto(e);
                  }}
                  disabled={updateGalleryMutation.isPending}
                  className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Usuń okładkę
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center cursor-pointer">
            {isUploading ? (
              <>
                <div className="absolute inset-0 bg-black bg-opacity-70 rounded-lg flex items-center justify-center">
                  <div className="text-white text-base font-semibold">Przesyłanie do serwera...</div>
                </div>
                <Plus size={48} className="text-gray-400 dark:text-gray-500 mb-2 opacity-30" />
                <p className="text-sm text-gray-500 dark:text-gray-500 text-center px-4">
                  Przesyłanie...
                </p>
              </>
            ) : isProcessing ? (
              <>
                <div className="absolute inset-0 bg-black bg-opacity-70 rounded-lg flex items-center justify-center">
                  <div className="text-white text-base font-semibold">Przetwarzanie obrazu...</div>
                </div>
                <Plus size={48} className="text-gray-400 dark:text-gray-500 mb-2 opacity-30" />
                <p className="text-sm text-gray-500 dark:text-gray-500 text-center px-4">
                  Przetwarzanie...
                </p>
              </>
            ) : (
              <>
                <Plus size={48} className="text-gray-400 dark:text-gray-500 mb-2" />
                <p className="text-sm text-gray-600 dark:text-gray-400 text-center px-4">
                  Przeciągnij zdjęcie tutaj lub kliknij aby wybrać
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">JPG, PNG (max 5MB)</p>
              </>
            )}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/jpg"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    </div>
  );
};
