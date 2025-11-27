import Link from "next/link";
import { useRouter } from "next/router";
import { useState, useRef, useEffect } from "react";

import { useToast } from "../../hooks/useToast";
import api, { formatApiError } from "../../lib/api-service";
import { getPlanRecommendation } from "../../lib/calculate-plan";
import { formatPrice } from "../../lib/format-price";
import type { PlanRecommendation } from "../../lib/plan-types";
import Button from "../ui/button/Button";
import { ConfirmDialog } from "../ui/confirm/ConfirmDialog";

interface RetryableImageProps {
  src: string;
  alt: string;
  className?: string;
  maxRetries?: number;
  initialDelay?: number;
}

// Component that retries loading an image until it's available on CloudFront
const RetryableImage: React.FC<RetryableImageProps> = ({
  src,
  alt,
  className = "",
  maxRetries = 30,
  initialDelay = 500,
}) => {
  const [imageSrc, setImageSrc] = useState<string>(src);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasLoaded, setHasLoaded] = useState<boolean>(false);
  const retryCountRef = useRef<number>(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    // Reset when src changes
    setImageSrc(src);
    retryCountRef.current = 0;
    setIsLoading(true);

    // Clear any pending retry
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    // Force image reload by clearing and setting src
    if (imgRef.current && src) {
      // Clear current src to force reload
      imgRef.current.src = "";
      // Use setTimeout to ensure the src is cleared before setting new one
      setTimeout(() => {
        if (imgRef.current && src) {
          imgRef.current.src = src;
        }
      }, 0);
    }
  }, [src]);

  const handleError = (): void => {
    retryCountRef.current += 1;
    const currentRetryCount = retryCountRef.current;

    if (currentRetryCount < maxRetries) {
      setIsLoading(true);
      setHasLoaded(false);

      // Exponential backoff: start with initialDelay, increase gradually
      const delay = Math.min(initialDelay * Math.pow(1.2, currentRetryCount - 1), 5000);

      retryTimeoutRef.current = setTimeout(() => {
        // Add cache-busting query parameter
        const separator = src.includes("?") ? "&" : "?";
        const retryUrl = `${src}${separator}_t=${Date.now()}&_r=${currentRetryCount}`;

        setImageSrc(retryUrl);

        // Force reload the image
        if (imgRef.current) {
          imgRef.current.src = retryUrl;
        }
      }, delay);
    } else {
      setIsLoading(false);
      setHasLoaded(false);
    }
  };

  const handleLoad = (): void => {
    setIsLoading(false);
    setHasLoaded(true);
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    // Cleanup timeout on unmount
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      {isLoading && (
        <div className="absolute inset-0 bg-gray-100 dark:bg-gray-800 flex items-center justify-center rounded-lg z-10">
          <div className="text-xs text-gray-500 dark:text-gray-400">Ładowanie obrazu...</div>
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={imageSrc}
        alt={alt}
        className={className}
        onError={handleError}
        onLoad={handleLoad}
        style={{
          opacity: hasLoaded ? 1 : 0,
          transition: "opacity 0.3s ease-in-out",
          display: hasLoaded ? "block" : "none",
        }}
      />
    </div>
  );
};

interface Gallery {
  galleryId: string;
  galleryName?: string;
  name?: string;
  coverPhotoUrl?: string;
  [key: string]: unknown;
}

interface Order {
  orderId: string;
  galleryId: string;
  [key: string]: unknown;
}

interface GallerySidebarProps {
  gallery: Gallery;
  isPaid: boolean;
  galleryUrl: string;
  onPay: () => void;
  onCopyUrl: () => void;
  onSendLink: () => void;
  onSettings: () => void;
  onReloadGallery?: () => Promise<void>;
  order?: Order;
  orderId?: string;
  sendLinkLoading?: boolean;
  onDownloadZip?: () => void;
  canDownloadZip?: boolean;
  onMarkOrderPaid?: () => void;
  onDownloadFinals?: () => void;
  onSendFinalsToClient?: () => void;
  onApproveChangeRequest?: () => void;
  onDenyChangeRequest?: () => void;
  hasFinals?: boolean;
  hasDeliveredOrders?: boolean | undefined;
  galleryLoading?: boolean;
}

export default function GallerySidebar({
  gallery,
  isPaid,
  galleryUrl,
  onPay,
  onCopyUrl,
  onSendLink,
  onSettings: _onSettings,
  onReloadGallery,
  order,
  orderId,
  sendLinkLoading = false,
  onDownloadZip,
  canDownloadZip,
  onMarkOrderPaid,
  onDownloadFinals,
  onSendFinalsToClient,
  onApproveChangeRequest,
  onDenyChangeRequest,
  hasFinals,
  hasDeliveredOrders,
  galleryLoading,
}: GallerySidebarProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [coverPhotoUrl, setCoverPhotoUrl] = useState(gallery?.coverPhotoUrl ?? null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [planRecommendation, setPlanRecommendation] = useState<PlanRecommendation | null>(null);
  const [isLoadingPlanRecommendation, setIsLoadingPlanRecommendation] = useState(false);

  // Update cover photo URL when gallery prop changes (backend already converts to CloudFront)
  useEffect(() => {
    const newUrl = gallery?.coverPhotoUrl ?? null;
    // Only update if URL actually changed to avoid unnecessary re-renders
    if (newUrl !== coverPhotoUrl) {
      setCoverPhotoUrl(newUrl);
    }
  }, [gallery?.coverPhotoUrl, coverPhotoUrl]);

  // Load plan recommendation when gallery is unpaid - refresh more aggressively
  useEffect(() => {
    if (galleryLoading || isPaid || !gallery?.galleryId) {
      return;
    }

    // Always try to load plan recommendation to get fresh size data
    setIsLoadingPlanRecommendation(true);
    getPlanRecommendation(gallery.galleryId)
      .then((recommendation) => {
        setPlanRecommendation(recommendation);
      })
      .catch((error) => {
        console.error("Failed to load plan recommendation:", error);
        setPlanRecommendation(null);
      })
      .finally(() => {
        setIsLoadingPlanRecommendation(false);
      });
  }, [gallery?.galleryId, gallery?.originalsBytesUsed, galleryLoading, isPaid]);

  // Listen for gallery updates (e.g., after uploads) to refresh plan recommendation
  useEffect(() => {
    if (galleryLoading || isPaid || !gallery?.galleryId) {
      return;
    }

    const handleGalleryUpdate = async () => {
      // Refresh plan recommendation when gallery is updated
      setIsLoadingPlanRecommendation(true);
      try {
        const recommendation = await getPlanRecommendation(gallery.galleryId);
        setPlanRecommendation(recommendation);
      } catch (error) {
        console.error("Failed to refresh plan recommendation:", error);
      } finally {
        setIsLoadingPlanRecommendation(false);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("galleryUpdated", handleGalleryUpdate);
      return () => {
        window.removeEventListener("galleryUpdated", handleGalleryUpdate);
      };
    }
  }, [gallery?.galleryId, galleryLoading, isPaid]);

  const handleBack = () => {
    if (typeof window !== "undefined" && gallery?.galleryId) {
      const referrerKey = `gallery_referrer_${gallery.galleryId}`;
      const referrerPath = sessionStorage.getItem(referrerKey);

      if (referrerPath) {
        void router.push(referrerPath);
      } else {
        void router.push("/");
      }
    } else {
      void router.push("/");
    }
  };

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
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err) ?? "Nie udało się przesłać okładki");
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

      showToast("success", "Sukces", "Okładka galerii została usunięta");
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err) ?? "Nie udało się usunąć okładki");
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

  const handleDeleteClick = () => {
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async (): Promise<void> => {
    if (!gallery?.galleryId) {
      return;
    }

    setDeleteLoading(true);

    try {
      await api.galleries.delete(gallery.galleryId);

      showToast("success", "Sukces", "Galeria została usunięta");
      setShowDeleteDialog(false);

      // Navigate back to galleries list
      void router.push("/");
    } catch (err: unknown) {
      const errorMsg = formatApiError(err);
      showToast("error", "Błąd", errorMsg ?? "Nie udało się usunąć galerii");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <aside className="fixed flex flex-col top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200 w-[380px]">
      {/* Back Button */}
      <div className="h-[76px] border-b border-gray-200 dark:border-gray-800 flex items-center">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-base font-semibold text-gray-900 hover:text-gray-700 dark:text-white dark:hover:text-gray-300 transition-colors"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M10 12L6 8L10 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Powrót
        </button>
      </div>

      {/* Gallery Info */}
      {!galleryLoading && gallery ? (
        <div className="py-6 border-b border-gray-200 dark:border-gray-800">
          <Link
            href={`/galleries/${gallery.galleryId}`}
            className="text-lg font-semibold text-gray-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 transition-colors cursor-pointer"
          >
            {gallery.galleryName ?? "Galeria"}
          </Link>
        </div>
      ) : (
        <div className="py-6 border-b border-gray-200 dark:border-gray-800">
          <div className="text-lg font-semibold text-gray-400 dark:text-gray-600">Ładowanie...</div>
        </div>
      )}

      {/* Cover Photo Section */}
      {!galleryLoading && gallery && (
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
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                      JPG, PNG (max 5MB)
                    </p>
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
      )}

      {/* Gallery URL */}
      {galleryUrl && (
        <div className="py-4 border-b border-gray-200 dark:border-gray-800">
          <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Adres www galerii:</div>
          <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs break-all text-blue-600 dark:text-blue-400 mb-2">
            {galleryUrl}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onCopyUrl();
              setUrlCopied(true);
              setTimeout(() => {
                setUrlCopied(false);
              }, 2500);
            }}
            className={`w-full transition-all duration-500 ease-in-out ${
              urlCopied
                ? "!bg-green-500 hover:!bg-green-600 !border-green-500 hover:!border-green-600 !text-white shadow-md"
                : ""
            }`}
          >
            <span className="relative inline-block min-w-[120px] h-5">
              <span
                className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ease-in-out ${
                  urlCopied ? "opacity-0 scale-90" : "opacity-100 scale-100"
                }`}
              >
                Kopiuj URL
              </span>
              <span
                className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ease-in-out ${
                  urlCopied ? "opacity-100 scale-100" : "opacity-0 scale-90"
                }`}
              >
                Skopiowano URL
              </span>
            </span>
          </Button>

          {/* Share Button - moved under Kopiuj URL */}
          {!galleryLoading &&
          gallery &&
          isPaid &&
          gallery.selectionEnabled &&
          gallery.clientEmail &&
          order?.deliveryStatus !== "PREPARING_DELIVERY" &&
          order?.deliveryStatus !== "PREPARING_FOR_DELIVERY" &&
          order?.deliveryStatus !== "DELIVERED" ? (
            <>
              {(() => {
                // Check if gallery has a CLIENT_SELECTING order
                const hasClientSelectingOrder =
                  gallery.orders &&
                  Array.isArray(gallery.orders) &&
                  gallery.orders.some((o: unknown) => {
                    const order = o as { deliveryStatus?: string };
                    return order.deliveryStatus === "CLIENT_SELECTING";
                  });

                // Check if gallery has any existing orders (for determining button text)
                const hasExistingOrders =
                  gallery.orders && Array.isArray(gallery.orders) && gallery.orders.length > 0;

                if (hasClientSelectingOrder) {
                  // Show disabled "Udostępniono klientowi" button
                  return (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="w-full mt-2"
                      startIcon={
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M8 2V14M2 8H14"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      }
                    >
                      Udostępniono klientowi
                    </Button>
                  ) as React.ReactNode;
                } else {
                  // Show enabled button - "Udostępnij klientowi" for new galleries, "Wyślij link do galerii" for existing orders
                  const buttonText = hasExistingOrders
                    ? "Wyślij link do galerii"
                    : "Udostępnij klientowi";
                  return (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={onSendLink}
                      disabled={sendLinkLoading}
                      className="w-full mt-2"
                      startIcon={
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M8 2V14M2 8H14"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      }
                    >
                      {sendLinkLoading ? "Wysyłanie..." : buttonText}
                    </Button>
                  ) as React.ReactNode;
                }
              })()}
            </>
          ) : null}
        </div>
      )}

      {/* Creation Date */}
      {(() => {
        if (!galleryLoading && gallery) {
          return (
            <div className="py-4 border-b border-gray-200 dark:border-gray-800">
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Utworzono:</div>
              <div className="text-sm text-gray-900 dark:text-white">
                {gallery.createdAt && typeof gallery.createdAt === "string"
                  ? new Date(gallery.createdAt).toLocaleDateString("pl-PL", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "-"}
              </div>
            </div>
          ) as React.ReactNode;
        }
        return null;
      })()}

      {/* Expiry Date */}
      {!galleryLoading && gallery && (
        <div className="py-4 border-b border-gray-200 dark:border-gray-800">
          <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Ważna do:</div>
          <div className="text-sm text-gray-900 dark:text-white">
            {(() => {
              let expiryDate: Date | null = null;

              if (!isPaid) {
                // UNPAID draft: 3 days from creation (TTL expiry)
                if (gallery.ttlExpiresAt && typeof gallery.ttlExpiresAt === "string") {
                  expiryDate = new Date(gallery.ttlExpiresAt);
                } else if (gallery.ttl && typeof gallery.ttl === "number") {
                  // TTL is in Unix epoch seconds
                  expiryDate = new Date(gallery.ttl * 1000);
                } else if (gallery.createdAt && typeof gallery.createdAt === "string") {
                  // Fallback: calculate 3 days from creation
                  expiryDate = new Date(
                    new Date(gallery.createdAt).getTime() + 3 * 24 * 60 * 60 * 1000
                  );
                }
              } else {
                // PAID: use expiresAt from plan
                if (gallery.expiresAt && typeof gallery.expiresAt === "string") {
                  expiryDate = new Date(gallery.expiresAt);
                }
              }

              if (expiryDate) {
                return expiryDate.toLocaleDateString("pl-PL", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }) as React.ReactNode;
              }

              return "-" as React.ReactNode;
            })()}
          </div>
        </div>
      )}

      {/* Navigation Menu */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1">
          <li>
            {gallery?.galleryId ? (
              <Link
                href={`/galleries/${gallery.galleryId}`}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  router.pathname === `/galleries/[id]` &&
                  !router.asPath.includes("/photos") &&
                  !router.asPath.includes("/settings")
                    ? "bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400"
                    : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
                }`}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M3 4C3 2.89543 3.89543 2 5 2H15C16.1046 2 17 2.89543 17 4V16C17 17.1046 16.1046 18 15 18H5C3.89543 18 3 17.1046 3 16V4ZM5 4V16H15V4H5ZM6 6H14V8H6V6ZM6 10H14V12H6V10ZM6 14H11V16H6V14Z"
                    fill="currentColor"
                  />
                </svg>
                <span>Zlecenia</span>
              </Link>
            ) : (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 dark:text-gray-600">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M3 4C3 2.89543 3.89543 2 5 2H15C16.1046 2 17 2.89543 17 4V16C17 17.1046 16.1046 18 15 18H5C3.89543 18 3 17.1046 3 16V4ZM5 4V16H15V4H5ZM6 6H14V8H6V6ZM6 10H14V12H6V10ZM6 14H11V16H6V14Z"
                    fill="currentColor"
                  />
                </svg>
                <span>Zlecenia</span>
              </div>
            )}
          </li>
          {/* Only show "Zdjęcia" if gallery is loaded AND selection is enabled */}
          {!galleryLoading && gallery && gallery.selectionEnabled !== false && (
            <li>
              <Link
                href={`/galleries/${gallery.galleryId}/photos`}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  router.pathname === `/galleries/[id]/photos`
                    ? "bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400"
                    : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
                }`}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M4 3C2.89543 3 2 3.89543 2 5V15C2 16.1046 2.89543 17 4 17H16C17.1046 17 18 16.1046 18 15V5C18 3.89543 17.1046 3 16 3H4ZM4 5H16V15H4V5ZM6 7C5.44772 7 5 7.44772 5 8C5 8.55228 5.44772 9 6 9C6.55228 9 7 8.55228 7 8C7 7.44772 6.55228 7 6 7ZM8 11L10.5 8.5L13 11L15 9V13H5V9L8 11Z"
                    fill="currentColor"
                  />
                </svg>
                <span>Zdjęcia</span>
              </Link>
            </li>
          )}
          <li>
            {!galleryLoading && gallery ? (
              hasDeliveredOrders === true ? (
                <div
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50"
                  title="Ustawienia galerii są zablokowane dla dostarczonych galerii"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M10 12C11.1046 12 12 11.1046 12 10C12 8.89543 11.1046 8 10 8C8.89543 8 8 8.89543 8 10C8 11.1046 8.89543 12 10 12Z"
                      fill="currentColor"
                    />
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M10 2C5.58172 2 2 5.58172 2 10C2 14.4183 5.58172 18 10 18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2ZM10 4C13.3137 4 16 6.68629 16 10C16 13.3137 13.3137 16 10 16C6.68629 16 4 13.3137 4 10C4 6.68629 6.68629 4 10 4ZM10 6C8.89543 6 8 6.89543 8 8C8 9.10457 8.89543 10 10 10C11.1046 10 12 9.10457 12 8C12 6.89543 11.1046 6 10 6Z"
                      fill="currentColor"
                    />
                  </svg>
                  <span>Ustawienia</span>
                </div>
              ) : hasDeliveredOrders === false ? (
                <Link
                  href={`/galleries/${gallery.galleryId}/settings`}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    router.pathname === `/galleries/[id]/settings`
                      ? "bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400"
                      : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
                  }`}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M10 12C11.1046 12 12 11.1046 12 10C12 8.89543 11.1046 8 10 8C8.89543 8 8 8.89543 8 10C8 11.1046 8.89543 12 10 12Z"
                      fill="currentColor"
                    />
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M10 2C5.58172 2 2 5.58172 2 10C2 14.4183 5.58172 18 10 18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2ZM10 4C13.3137 4 16 6.68629 16 10C16 13.3137 13.3137 16 10 16C6.68629 16 4 13.3137 4 10C4 6.68629 6.68629 4 10 4ZM10 6C8.89543 6 8 6.89543 8 8C8 9.10457 8.89543 10 10 10C11.1046 10 12 9.10457 12 8C12 6.89543 11.1046 6 10 6Z"
                      fill="currentColor"
                    />
                  </svg>
                  <span>Ustawienia</span>
                </Link>
              ) : (
                <div
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50"
                  title="Sprawdzanie statusu galerii..."
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M10 12C11.1046 12 12 11.1046 12 10C12 8.89543 11.1046 8 10 8C8.89543 8 8 8.89543 8 10C8 11.1046 8.89543 12 10 12Z"
                      fill="currentColor"
                    />
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M10 2C5.58172 2 2 5.58172 2 10C2 14.4183 5.58172 18 10 18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2ZM10 4C13.3137 4 16 6.68629 16 10C16 13.3137 13.3137 16 10 16C6.68629 16 4 13.3137 4 10C4 6.68629 6.68629 4 10 4ZM10 6C8.89543 6 8 6.89543 8 8C8 9.10457 8.89543 10 10 10C11.1046 10 12 9.10457 12 8C12 6.89543 11.1046 6 10 6Z"
                      fill="currentColor"
                    />
                  </svg>
                  <span>Ustawienia</span>
                </div>
              )
            ) : null}
          </li>
        </ul>
      </nav>

      {/* Order Actions Section - Show when on order page and gallery is paid */}
      {orderId && order && isPaid && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
          <div className="px-3 mb-3">
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Zlecenie
            </div>
            <div className="text-sm font-medium text-gray-900 dark:text-white">{orderId}</div>
          </div>

          <div className="space-y-2 px-3">
            {/* Download Selected Originals ZIP 
                - Available for CLIENT_APPROVED/AWAITING_FINAL_PHOTOS (before finals upload)
            */}
            {!galleryLoading &&
              gallery &&
              gallery.selectionEnabled !== false &&
              canDownloadZip &&
              onDownloadZip && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onDownloadZip}
                  className="w-full justify-start"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="mr-2"
                  >
                    <path
                      d="M10 2.5L5 7.5H8V13.5H12V7.5H15L10 2.5ZM3 15.5V17.5H17V15.5H3Z"
                      fill="currentColor"
                    />
                  </svg>
                  Pobierz wybrane oryginały (ZIP)
                </Button>
              )}

            {/* Download Finals - Only show if finals are uploaded */}
            {onDownloadFinals && hasFinals && (
              <Button
                size="sm"
                variant="outline"
                onClick={onDownloadFinals}
                className="w-full justify-start"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="mr-2"
                >
                  <path
                    d="M10 2.5L5 7.5H8V13.5H12V7.5H15L10 2.5ZM3 15.5V17.5H17V15.5H3Z"
                    fill="currentColor"
                  />
                </svg>
                Pobierz finały
              </Button>
            )}

            {/* Change Request Actions */}
            {order?.deliveryStatus === "CHANGES_REQUESTED" &&
              onApproveChangeRequest &&
              onDenyChangeRequest && (
                <>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={onApproveChangeRequest}
                    className="w-full justify-start bg-green-600 hover:bg-green-700 text-white"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 20 20"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="mr-2"
                    >
                      <path
                        d="M10 18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2C5.58172 2 2 5.58172 2 10C2 14.4183 5.58172 18 10 18Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M7 10L9 12L13 8"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Zatwierdź prośbę o zmiany
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onDenyChangeRequest}
                    className="w-full justify-start"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 20 20"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="mr-2"
                    >
                      <path
                        d="M10 18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2C5.58172 2 2 5.58172 2 10C2 14.4183 5.58172 18 10 18Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M7 7L13 13M13 7L7 13"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Odrzuć prośbę o zmiany
                  </Button>
                </>
              )}

            {/* Mark Order as Paid */}
            {onMarkOrderPaid && order?.paymentStatus !== "PAID" && (
              <Button
                size="sm"
                variant="outline"
                onClick={onMarkOrderPaid}
                className="w-full justify-start"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="mr-2"
                >
                  <path d="M8 13L4 9L5.41 7.59L8 10.17L14.59 3.58L16 5L8 13Z" fill="currentColor" />
                </svg>
                Oznacz jako opłacone
              </Button>
            )}

            {/* Send Finals to Client - Only show if finals are uploaded */}
            {onSendFinalsToClient && hasFinals && (
              <Button
                size="sm"
                variant="outline"
                onClick={onSendFinalsToClient}
                className="w-full justify-start"
                disabled={order?.deliveryStatus === "DELIVERED"}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="mr-2"
                >
                  <path
                    d="M2.5 5L10 10L17.5 5M2.5 15L10 20L17.5 15M2.5 10L10 15L17.5 10"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {order?.deliveryStatus === "DELIVERED"
                  ? "Finały wysłane"
                  : "Wyślij finały do klienta"}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Storage Usage Info - Show only on gallery pages, not on order pages */}
      {!orderId &&
        !galleryLoading &&
        gallery?.galleryId &&
        (() => {
          const formatBytes = (bytes: number | undefined | null): string => {
            if (!bytes || bytes === 0) {
              return "0.00 MB";
            }
            if (bytes < 1024 * 1024) {
              // Less than 1 MB, show in KB
              return `${(bytes / 1024).toFixed(2)} KB`;
            }
            if (bytes < 1024 * 1024 * 1024) {
              // Less than 1 GB, show in MB
              return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
            }
            return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
          };

          // Use plan recommendation data if available (more up-to-date), otherwise fall back to gallery data
          const originalsBytes =
            planRecommendation?.uploadedSizeBytes ??
            (gallery.originalsBytesUsed as number | undefined) ??
            0;
          const finalsBytes = (gallery.finalsBytesUsed as number | undefined) ?? 0;
          // Only show limits if gallery is paid (has a plan)
          const originalsLimit =
            isPaid &&
            (planRecommendation?.originalsLimitBytes ??
              (gallery.originalsLimitBytes as number | undefined))
              ? (planRecommendation?.originalsLimitBytes ??
                (gallery.originalsLimitBytes as number | undefined))
              : undefined;
          const finalsLimit = isPaid ? (gallery.finalsLimitBytes as number | undefined) : undefined;

          // Always show the section if gallery is loaded
          return (
            <div className="mt-auto p-4 border-t border-gray-200 dark:border-gray-800">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Wykorzystane miejsce
              </div>
              <div className="text-sm text-gray-700 dark:text-gray-300 mb-1">
                Oryginały: {formatBytes(originalsBytes)}
                {originalsLimit !== undefined && (
                  <span className="text-gray-500"> / {formatBytes(originalsLimit)}</span>
                )}
                {isLoadingPlanRecommendation && planRecommendation === null && (
                  <span className="ml-2 text-xs text-gray-400">(aktualizowanie...)</span>
                )}
              </div>
              <div className="text-sm text-gray-700 dark:text-gray-300">
                Finalne: {formatBytes(finalsBytes)}
                {finalsLimit !== undefined && (
                  <span className="text-gray-500"> / {formatBytes(finalsLimit)}</span>
                )}
              </div>
            </div>
          );
        })()}

      {/* UNPUBLISHED Banner - Only show when gallery is fully loaded and confirmed unpaid */}
      {!galleryLoading &&
        gallery?.galleryId &&
        !isPaid &&
        (() => {
          const formatBytes = (bytes: number | undefined | null): string => {
            if (!bytes || bytes === 0) {
              return "0 GB";
            }
            if (bytes < 1024 * 1024 * 1024) {
              return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
            }
            return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
          };

          const currentUploadedBytes = (gallery.originalsBytesUsed as number | undefined) ?? 0;
          const hasUploadedPhotos = currentUploadedBytes > 0;

          return (
            <div className="mt-auto p-4 border-t border-gray-200 dark:border-gray-800">
              <div className="p-3 bg-warning-50 border border-warning-200 rounded-lg dark:bg-warning-500/10 dark:border-warning-500/20">
                <div className="text-sm font-medium text-warning-800 dark:text-warning-200 mb-1">
                  Galeria nieopublikowana
                </div>

                {!hasUploadedPhotos ? (
                  <>
                    <div className="text-xs text-warning-600 dark:text-warning-400 mb-2">
                      Prześlij zdjęcia, aby system mógł wybrać optymalny plan dla Twojej galerii.
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => router.push(`/galleries/${gallery.galleryId}/photos`)}
                      className="w-full"
                    >
                      Przejdź do zdjęć
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="text-xs text-warning-600 dark:text-warning-400 mb-2">
                      System zaproponował plan na podstawie przesłanych zdjęć.
                    </div>

                    {/* Space Usage & Plan - Compact */}
                    <div className="bg-white dark:bg-gray-800 rounded p-2 mb-2 border border-warning-200 dark:border-warning-500/30">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          Wykorzystane:
                        </span>
                        <span className="text-xs font-semibold text-warning-600 dark:text-warning-400">
                          {formatBytes(currentUploadedBytes)}
                        </span>
                      </div>
                      {planRecommendation ? (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-600 dark:text-gray-400">Plan:</span>
                          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                            {planRecommendation.suggestedPlan.name} (
                            {formatPrice(planRecommendation.suggestedPlan.priceCents)})
                          </span>
                        </div>
                      ) : isLoadingPlanRecommendation ? (
                        <div className="text-xs text-gray-500 dark:text-gray-400 text-right">
                          Obliczanie...
                        </div>
                      ) : null}
                    </div>

                    <Button size="sm" variant="primary" onClick={onPay} className="w-full">
                      Opublikuj galerię
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })()}

      {/* Delete Gallery Button */}
      <div className="mt-auto p-4 border-t border-gray-200 dark:border-gray-800">
        <Button
          size="sm"
          variant="outline"
          onClick={handleDeleteClick}
          disabled={deleteLoading}
          className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-500/10 border-red-300 dark:border-red-700"
        >
          {deleteLoading ? "Usuwanie..." : "Usuń galerię"}
        </Button>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          if (!deleteLoading) {
            setShowDeleteDialog(false);
          }
        }}
        onConfirm={handleDeleteConfirm}
        title="Usuń galerię"
        message={`Czy na pewno chcesz usunąć galerię "${gallery?.galleryName ?? gallery?.galleryId}"?\n\nTa operacja jest nieodwracalna i usunie wszystkie zdjęcia, zlecenia i dane związane z tą galerią.`}
        confirmText="Usuń galerię"
        cancelText="Anuluj"
        variant="danger"
        loading={deleteLoading}
      />
    </aside>
  );
}
