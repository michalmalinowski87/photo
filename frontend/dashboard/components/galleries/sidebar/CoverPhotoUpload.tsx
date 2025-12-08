import { Plus } from "lucide-react";
import { useRouter } from "next/router";
import React, { useState, useRef, useEffect } from "react";

import { useUpdateGallery } from "../../../hooks/mutations/useGalleryMutations";
import { useGallery, useGalleryCoverPhoto } from "../../../hooks/queries/useGalleries";
import { usePresignedUrl } from "../../../hooks/queries/usePresignedUrl";
import { useToast } from "../../../hooks/useToast";
import { formatApiError } from "../../../lib/api-service";
import { RetryableImage } from "../../ui/RetryableImage";
import { Tooltip } from "../../ui/tooltip/Tooltip";

export const CoverPhotoUpload: React.FC = () => {
  const router = useRouter();
  const galleryIdParam = Array.isArray(router.query.id) ? router.query.id[0] : router.query.id;
  const galleryId = typeof galleryIdParam === "string" ? galleryIdParam : undefined;

  // Use React Query hooks
  const { data: gallery, isLoading } = useGallery(galleryId);
  const updateGalleryMutation = useUpdateGallery();
  const { refetch: refetchCoverPhoto } = useGalleryCoverPhoto(galleryId);

  const coverPhotoUrl = gallery?.coverPhotoUrl ?? null;
  const { showToast } = useToast();
  const [uploadingCover, setUploadingCover] = useState(false);
  const [processingCover, setProcessingCover] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [presignParams, setPresignParams] = useState<{
    key: string;
    contentType: string;
    fileSize: number;
    file: File;
  } | null>(null);

  // Use presigned URL hook when params are set
  const {
    data: presignResponse,
    isLoading: presignLoading,
    error: presignError,
  } = usePresignedUrl({
    galleryId: galleryId ?? "",
    key: presignParams?.key ?? "",
    contentType: presignParams?.contentType ?? "",
    fileSize: presignParams?.fileSize ?? 0,
    enabled: !!presignParams && !!galleryId,
  });

  // Handle upload once presigned URL is available
  useEffect(() => {
    if (!presignParams || !presignResponse?.url || presignLoading) {
      return;
    }

    const performUpload = async (): Promise<void> => {
      if (!galleryId || !presignParams) {
        return;
      }

      try {
        // Upload file to S3
        await fetch(presignResponse.url, {
          method: "PUT",
          body: presignParams.file,
          headers: {
            "Content-Type": presignParams.contentType,
          },
        });

        // Update gallery in backend with S3 URL - backend will convert it to CloudFront
        const s3Url = presignResponse.url.split("?")[0]; // Remove query params

        await updateGalleryMutation.mutateAsync({
          galleryId,
          data: { coverPhotoUrl: s3Url },
        });

        // Switch to processing state and poll for processed CloudFront URL
        setUploadingCover(false);
        setProcessingCover(true);

        // Poll the lightweight cover photo endpoint until we get a CloudFront URL
        let attempts = 0;
        const maxAttempts = 30;
        const pollInterval = 1000;

        while (attempts < maxAttempts) {
          attempts++;

          try {
            // Refetch cover photo using React Query
            const refetchResult = await refetchCoverPhoto();
            const fetchedUrl = refetchResult.data?.coverPhotoUrl;

            // Check if we have a CloudFront URL (not S3, not null)
            if (
              fetchedUrl &&
              typeof fetchedUrl === "string" &&
              !fetchedUrl.includes(".s3.") &&
              !fetchedUrl.includes("s3.amazonaws.com")
            ) {
              // Update gallery via mutation (will invalidate cache)
              if (galleryId) {
                await updateGalleryMutation.mutateAsync({
                  galleryId,
                  data: { coverPhotoUrl: fetchedUrl },
                });
              }
              setProcessingCover(false);
              showToast("success", "Sukces", "Okładka galerii została przesłana");
              setPresignParams(null); // Reset params
              return;
            }

            // Wait before next poll
            await new Promise((resolve) => setTimeout(resolve, pollInterval));
          } catch (pollErr) {
            console.error("Failed to poll for cover photo URL:", pollErr);
            // Continue polling on error
            await new Promise((resolve) => setTimeout(resolve, pollInterval));
          }
        }

        // Max attempts reached
        setProcessingCover(false);
        showToast(
          "warning",
          "Ostrzeżenie",
          "Okładka została przesłana, ale przetwarzanie trwa dłużej niż zwykle"
        );
        setPresignParams(null); // Reset params
      } catch (err: unknown) {
        setUploadingCover(false);
        setProcessingCover(false);
        setPresignParams(null); // Reset params on error
        showToast(
          "error",
          "Błąd",
          formatApiError(err as Error) ?? "Nie udało się przesłać okładki"
        );
      }
    };

    void performUpload();
  }, [
    presignResponse,
    presignLoading,
    presignParams,
    galleryId,
    updateGalleryMutation,
    refetchCoverPhoto,
    showToast,
  ]);

  // Handle presign errors
  useEffect(() => {
    if (presignError && presignParams) {
      setUploadingCover(false);
      setProcessingCover(false);
      setPresignParams(null);
      showToast(
        "error",
        "Błąd",
        formatApiError(presignError) ?? "Nie udało się uzyskać URL do przesłania"
      );
    }
  }, [presignError, presignParams, showToast]);

  const handleCoverPhotoUpload = (file: File): void => {
    if (!file || !galleryId || typeof galleryId !== "string") {
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showToast("error", "Błąd", "Plik jest za duży. Maksymalny rozmiar to 5MB.");
      return;
    }

    setUploadingCover(true);

    // Get presigned URL - use unique filename with timestamp to avoid CloudFront cache issues
    const timestamp = Date.now();
    const fileExtension = file.name.split(".").pop() ?? "jpg";
    const key = `cover_${timestamp}.${fileExtension}`;

    // Set params to trigger presigned URL query
    // The useEffect will handle the actual upload once the URL is available
    setPresignParams({
      key,
      contentType: file.type ?? "image/jpeg",
      fileSize: file.size,
      file,
    });
  };

  const handleRemoveCoverPhoto = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation(); // Prevent triggering the file input

    if (!galleryId || typeof galleryId !== "string") {
      return;
    }

    setUploadingCover(true);

    try {
      // Remove cover photo by setting coverPhotoUrl to null
      await updateGalleryMutation.mutateAsync({
        galleryId,
        data: { coverPhotoUrl: undefined },
      });
      showToast("success", "Sukces", "Okładka galerii została usunięta");
    } catch (err: unknown) {
      showToast("error", "Błąd", formatApiError(err as Error) ?? "Nie udało się usunąć okładki");
    } finally {
      setUploadingCover(false);
    }
  };

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
                  : coverPhotoUrl
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
        ) : coverPhotoUrl ? (
          <>
            <RetryableImage
              src={coverPhotoUrl}
              alt="Okładka galerii"
              className="w-full h-full object-cover rounded-lg pointer-events-none"
            />
            {processingCover && (
              <div className="absolute inset-0 bg-black bg-opacity-50 rounded-lg flex items-center justify-center">
                <div className="text-white text-sm font-medium">Przetwarzanie...</div>
              </div>
            )}
            <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-50 transition-opacity rounded-lg flex flex-col items-center justify-center gap-2 group">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-sm font-medium">
                {uploadingCover
                  ? "Przesyłanie..."
                  : processingCover
                    ? "Przetwarzanie..."
                    : "Kliknij na obraz aby zmienić"}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void handleRemoveCoverPhoto(e);
                }}
                disabled={uploadingCover || processingCover}
                className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Tooltip content="Usuń okładkę">
                  <span className="cursor-pointer">Usuń okładkę</span>
                </Tooltip>
              </button>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center cursor-pointer">
            {uploadingCover || processingCover ? (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {uploadingCover ? "Przesyłanie..." : "Przetwarzanie..."}
              </div>
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
