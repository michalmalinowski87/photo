import React, { useState, useRef } from "react";

import { useToast } from "../../../hooks/useToast";
import api, { formatApiError } from "../../../lib/api-service";
import { RetryableImage } from "../../ui/RetryableImage";

interface Gallery {
  galleryId: string;
  coverPhotoUrl?: string;
  [key: string]: unknown;
}

interface CoverPhotoUploadProps {
  gallery: Gallery | null;
  galleryLoading: boolean;
  coverPhotoUrl: string | null;
  onCoverPhotoChange: (url: string | null) => void;
  onReloadGallery?: () => Promise<void>;
}

export const CoverPhotoUpload: React.FC<CoverPhotoUploadProps> = ({
  gallery,
  galleryLoading,
  coverPhotoUrl,
  onCoverPhotoChange,
  onReloadGallery,
}) => {
  const { showToast } = useToast();
  const [uploadingCover, setUploadingCover] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleCoverPhotoUpload = async (file: File): Promise<void> => {
    if (!file || !gallery?.galleryId) {
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showToast("error", "Błąd", "Plik jest za duży. Maksymalny rozmiar to 5MB.");
      return;
    }

    setUploadingCover(true);

    try {
      // Get presigned URL - use unique filename with timestamp to avoid CloudFront cache issues
      const timestamp = Date.now();
      const fileExtension = file.name.split(".").pop() ?? "jpg";
      const key = `cover_${timestamp}.${fileExtension}`;
      const presignResponse = await api.uploads.getPresignedUrl({
        galleryId: gallery.galleryId,
        key,
        contentType: file.type ?? "image/jpeg",
        fileSize: file.size,
      });

      // Upload file to S3
      await fetch(presignResponse.url, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type ?? "image/jpeg",
        },
      });

      // Update gallery in backend with S3 URL - backend will convert it to CloudFront
      const s3Url = presignResponse.url.split("?")[0]; // Remove query params

      await api.galleries.update(gallery.galleryId, {
        coverPhotoUrl: s3Url,
      });

      // Reload gallery data to get the CloudFront URL from backend
      if (onReloadGallery) {
        await onReloadGallery();
      }

      showToast("success", "Sukces", "Okładka galerii została przesłana");
    } catch (err: unknown) {
      showToast("error", "Błąd", formatApiError(err as Error) ?? "Nie udało się przesłać okładki");
    } finally {
      setUploadingCover(false);
    }
  };

  const handleRemoveCoverPhoto = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation(); // Prevent triggering the file input

    if (!gallery?.galleryId) {
      return;
    }

    setUploadingCover(true);

    try {
      // Remove cover photo by setting coverPhotoUrl to null
      await api.galleries.update(gallery.galleryId, {
        coverPhotoUrl: null,
      });

      // Reload gallery data to ensure consistency
      if (onReloadGallery) {
        await onReloadGallery();
      }

      onCoverPhotoChange(null);
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
      void handleCoverPhotoUpload(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file?.type.startsWith("image/")) {
      void handleCoverPhotoUpload(file);
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

  if (galleryLoading || !gallery) {
    return null;
  }

  return (
    <div className="py-4 border-b border-gray-200 dark:border-gray-800">
      <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">Okładka galerii</div>
      <div
        className={`relative w-full h-48 rounded-lg border-2 border-dashed transition-colors cursor-pointer ${
          isDragging
            ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
            : coverPhotoUrl
              ? "border-gray-200 dark:border-gray-700"
              : "border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800"
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        {coverPhotoUrl ? (
          <>
            <RetryableImage
              src={coverPhotoUrl}
              alt="Okładka galerii"
              className="w-full h-full object-cover rounded-lg pointer-events-none"
              maxRetries={30}
              initialDelay={500}
            />
            <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-50 transition-opacity rounded-lg flex flex-col items-center justify-center gap-2 group">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-sm font-medium">
                {uploadingCover ? "Przesyłanie..." : "Kliknij na obraz aby zmienić"}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void handleRemoveCoverPhoto(e);
                }}
                disabled={uploadingCover}
                className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                title="Usuń okładkę"
              >
                Usuń okładkę
              </button>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center cursor-pointer">
            {uploadingCover ? (
              <div className="text-sm text-gray-600 dark:text-gray-400">Przesyłanie...</div>
            ) : (
              <>
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="text-gray-400 dark:text-gray-500 mb-2"
                >
                  <path
                    d="M12 5V19M5 12H19"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
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
