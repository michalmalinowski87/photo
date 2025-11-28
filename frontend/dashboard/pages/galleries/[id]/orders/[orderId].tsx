import Link from "next/link";
import { useRouter } from "next/router";
import { useState, useEffect, useRef, useCallback } from "react";

import { GalleryPricingModal } from "../../../../components/galleries/GalleryPricingModal";
import PaymentConfirmationModal from "../../../../components/galleries/PaymentConfirmationModal";
import { DenyChangeRequestModal } from "../../../../components/orders/DenyChangeRequestModal";
import Badge from "../../../../components/ui/badge/Badge";
import Button from "../../../../components/ui/button/Button";
import { ConfirmDialog } from "../../../../components/ui/confirm/ConfirmDialog";
import { FullPageLoading, Loading } from "../../../../components/ui/loading/Loading";
import { usePhotoUploadHandler } from "../../../../components/upload/PhotoUploadHandler";
import {
  UploadProgressOverlay,
  type PerImageProgress,
} from "../../../../components/upload/UploadProgressOverlay";
import { useGallery } from "../../../../context/GalleryContext";
import { useToast } from "../../../../hooks/useToast";
import api, { formatApiError } from "../../../../lib/api-service";
import { initializeAuth, redirectToLandingSignIn } from "../../../../lib/auth-init";
import { getPricingModalData } from "../../../../lib/calculate-plan";
import { formatCurrencyInput, plnToCents, centsToPlnString } from "../../../../lib/currency";
import { formatPrice } from "../../../../lib/format-price";
import type { PricingModalData } from "../../../../lib/plan-types";
import { useGalleryStore } from "../../../../store/gallerySlice";
import { useOrderStore } from "../../../../store/orderSlice";
import { useUserStore } from "../../../../store/userSlice";

interface RetryableImageProps {
  src: string;
  alt: string;
  className?: string;
  maxRetries?: number;
  initialDelay?: number;
}

interface GalleryImage {
  id?: string;
  key?: string;
  filename?: string;
  url?: string;
  thumbUrl?: string;
  previewUrl?: string;
  finalUrl?: string;
  isPlaceholder?: boolean;
  uploadTimestamp?: number;
  uploadIndex?: number;
  size?: number;
  [key: string]: unknown;
}

interface Order {
  orderId: string;
  galleryId: string;
  orderNumber?: string;
  deliveryStatus?: string;
  paymentStatus?: string;
  totalCents?: number;
  createdAt?: string;
  selectedKeys?: string[];
  [key: string]: unknown;
}

interface Gallery {
  galleryId: string;
  ownerId?: string;
  name?: string;
  clientEmail?: string;
  selectionEnabled?: boolean;
  state?: string;
  isPaid?: boolean;
  [key: string]: unknown;
}

interface PaymentDetails {
  totalAmountCents: number;
  walletAmountCents: number;
  stripeAmountCents: number;
  balanceAfterPayment?: number;
}

interface ImagesResponse {
  images: GalleryImage[];
}

interface OrderUpdateEvent extends CustomEvent<{ orderId?: string; galleryId?: string }> {
  detail: {
    orderId?: string;
    galleryId?: string;
  };
}

type BadgeColor = "primary" | "success" | "error" | "warning" | "info" | "light" | "dark";

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
    }
  };

  const handleLoad = (): void => {
    setIsLoading(false);
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
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
          <Loading size="sm" />
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={imageSrc}
        alt={alt}
        className={`${className} ${isLoading ? "opacity-0" : "opacity-100"} transition-opacity`}
        onError={handleError}
        onLoad={handleLoad}
      />
    </div>
  );
};

export default function OrderDetail() {
  const { showToast } = useToast();
  const router = useRouter();
  const { id: galleryId, orderId } = router.query;
  // Get reloadGallery function from GalleryContext to refresh gallery data after payment
  const { reloadGallery } = useGallery();
  const [loading, setLoading] = useState<boolean>(true); // Start with true to prevent flicker
  const [error, setError] = useState<string>("");
  const [order, setOrder] = useState<Order | null>(null);
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [activeTab, setActiveTab] = useState<"originals" | "finals">("originals");
  const [denyModalOpen, setDenyModalOpen] = useState<boolean>(false);
  const [denyLoading, setDenyLoading] = useState<boolean>(false);
  const [originalImages, setOriginalImages] = useState<GalleryImage[]>([]);
  const [finalImages, setFinalImages] = useState<GalleryImage[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [imageToDelete, setImageToDelete] = useState<GalleryImage | null>(null);
  const [deletingImages, setDeletingImages] = useState<Set<string>>(new Set()); // Track which images are being deleted
  const [deletedImageKeys, setDeletedImageKeys] = useState<Set<string>>(new Set()); // Track successfully deleted images to prevent reappearance
  const deletingImagesRef = useRef<Set<string>>(new Set()); // Ref to track deleting images for closures
  const deletedImageKeysRef = useRef<Set<string>>(new Set()); // Ref to track deleted images for closures
  const [savingAmount, setSavingAmount] = useState<boolean>(false);
  const [isEditingAmount, setIsEditingAmount] = useState<boolean>(false);
  const [editingAmountValue, setEditingAmountValue] = useState<string>("");
  const [paymentLoading, setPaymentLoading] = useState<boolean>(false);
  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
  const [paymentDetails] = useState<PaymentDetails | null>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [pricingModalData, setPricingModalData] = useState<PricingModalData | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Define functions first (before useEffect hooks that use them)
  const loadWalletBalance = useCallback(async (): Promise<number> => {
    // Use cached wallet balance from Zustand store (userSlice handles caching)
    const { walletBalanceCents, refreshWalletBalance } = useUserStore.getState();
    if (walletBalanceCents !== null) {
      setWalletBalance(walletBalanceCents);
      return walletBalanceCents;
    }

    // If not cached, fetch and it will be cached by userSlice
    try {
      await refreshWalletBalance();
      const updatedBalance = useUserStore.getState().walletBalanceCents ?? 0;
      setWalletBalance(updatedBalance);
      return updatedBalance;
    } catch (_err) {
      // Silently fail - wallet balance is not critical for this page
      setWalletBalance(0);
      return 0;
    }
  }, []);

  /**
   * Load order data with intelligent caching:
   * - Checks Zustand cache first (30s TTL)
   * - Only fetches missing/stale data
   * - GalleryLayoutWrapper is the single source of truth for gallery data
   * - Order data is cached per orderId
   * - Images are always fetched (order-specific, not cached)
   */
  const loadOrderData = useCallback(
    async (forceRefresh = false): Promise<void> => {
      if (!galleryId || !orderId) {
        return;
      }

      setLoading(true);
      setError("");

      try {
        // Check cache first for order and gallery data
        const { getCachedOrder, setCurrentOrder, isOrderStale } = useOrderStore.getState();
        const { currentGallery, isGalleryStale } = useGalleryStore.getState();

        // Get cached order if available and fresh
        let orderData: Order | null = null;
        if (!forceRefresh && !isOrderStale(orderId as string, 30000)) {
          orderData = getCachedOrder(orderId as string, 30000);
        }

        // Get cached gallery if available and fresh
        let galleryData: Gallery | null = null;
        if (!forceRefresh && currentGallery?.galleryId === galleryId && !isGalleryStale(30000)) {
          galleryData = currentGallery;
        }

        // Fetch missing data
        const fetchPromises: Promise<Order | Gallery | ImagesResponse>[] = [];

        if (!orderData) {
          fetchPromises.push(
            api.orders.get(galleryId as string, orderId as string).then((data) => {
              orderData = data as Order;
              setCurrentOrder(orderData);
              return data as Order;
            })
          );
        }

        if (!galleryData) {
          fetchPromises.push(
            api.galleries.get(galleryId as string).then((data) => {
              galleryData = data as Gallery;
              const { setCurrentGallery } = useGalleryStore.getState();
              // Only set gallery if it has required fields (ownerId and state)
              if (galleryData?.galleryId && galleryData.ownerId && galleryData.state) {
                setCurrentGallery(galleryData as Parameters<typeof setCurrentGallery>[0]);
              }
              return data as Gallery;
            })
          );
        }

        // Always fetch images (not cached, order-specific)
        fetchPromises.push(
          api.galleries.getImages(galleryId as string).catch((err): ImagesResponse => {
            // Log error but don't fail the entire load
            console.error("Failed to load gallery images:", err);
            return { images: [] };
          })
        );

        // Wait for all fetches to complete
        const results = await Promise.all(fetchPromises);
        const imagesData = results[results.length - 1] as ImagesResponse; // Last result is always images

        // Use cached or fetched data
        if (!orderData && results.length > 0) {
          orderData = results[0] as Order;
        }
        if (!galleryData && results.length > 1) {
          galleryData = results[results.length - 2] as Gallery;
        }

        if (orderData) {
          setOrder(orderData);
        }
        if (galleryData) {
          setGallery(galleryData);
        }

        const images = imagesData.images ?? [];
        setOriginalImages(images);

        // Always try to load final images (for viewing) - upload restrictions are handled separately
        try {
          const finalResponse = await api.orders.getFinalImages(
            galleryId as string,
            orderId as string
          );
          // Map final images - keep finalUrl for download, use previewUrl/thumbUrl for display
          const mappedFinalImages = (finalResponse.images ?? []).map((img: GalleryImage) => ({
            ...img,
            url: img.previewUrl ?? img.thumbUrl ?? img.finalUrl ?? img.url ?? "", // Use WebP for display
            finalUrl: img.finalUrl ?? img.url ?? "", // Keep original for download
          }));

          // Filter out deleted images from API response
          const validApiImages = mappedFinalImages.filter((img: GalleryImage) => {
            const imgKey = img.key ?? img.filename;
            if (!imgKey) {
              return false;
            }
            // Skip if currently being deleted
            if (deletingImagesRef.current.has(imgKey)) {
              return false;
            }
            // Skip if successfully deleted
            if (deletedImageKeysRef.current.has(imgKey)) {
              return false;
            }
            return true;
          });

          // Set images directly - no placeholders
          setFinalImages(validApiImages);
        } catch (_err) {
          // Final images might not exist yet - set empty array
          setFinalImages([]);
        }
      } catch (err) {
        const errorMsg = formatApiError(err);
        setError(errorMsg ?? "Nie udało się załadować danych zlecenia");
        showToast("error", "Błąd", errorMsg ?? "Nie udało się załadować danych zlecenia");
      } finally {
        setLoading(false);
      }
    },
    [galleryId, orderId, showToast]
  );

  // Track per-image upload progress
  const [perImageProgress, setPerImageProgress] = useState<PerImageProgress[]>([]);
  const [isOverlayDismissed, setIsOverlayDismissed] = useState(false);

  // Use universal photo upload handler (after loadOrderData is defined)
  const {
    handleFileSelect,
    uploading,
    uploadProgress,
    perImageProgress: handlerPerImageProgress,
    isUploadComplete,
    cancelUpload,
  } = usePhotoUploadHandler({
    galleryId: galleryId as string,
    orderId: orderId as string,
    type: "finals",
    getInitialImageCount: () => finalImages.length,
    onPerImageProgress: (progress) => {
      setPerImageProgress(progress);
      // Reset dismissed state when new upload starts
      if (progress.length > 0 && progress.some((p) => p.status === "uploading")) {
        setIsOverlayDismissed(false);
      }
    },
    onImagesUpdated: (updatedImages) => {
      // For finals, map images to include previewUrl/thumbUrl/finalUrl structure
      const mappedImages = updatedImages.map((img: GalleryImage) => ({
        ...img,
        url: img.previewUrl ?? img.thumbUrl ?? img.finalUrl ?? img.url ?? "", // Use WebP for display
        finalUrl: img.finalUrl ?? img.url ?? "", // Keep original for download
      }));

      const validApiImages = mappedImages.filter((img: GalleryImage) => {
        const imgKey = img.key ?? img.filename;
        if (!imgKey) {
          return false;
        }
        if (deletingImagesRef.current.has(imgKey)) {
          return false;
        }
        if (deletedImageKeysRef.current.has(imgKey)) {
          return false;
        }
        return true;
      });

      // Only update if we have valid images with URLs
      if (validApiImages.length > 0) {
        setFinalImages(validApiImages);
      }
    },
    onUploadComplete: () => {
      // Reload final images from API after upload completes to ensure we have the latest data
      if (galleryId && orderId) {
        void loadOrderData();
      }
    },
    onOrderUpdated: (orderId) => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("orderUpdated", { detail: { orderId } }));
      }
    },
    loadOrderData,
    deletingImagesRef,
    deletedImageKeysRef,
  });

  // Sync refs with state so closures always have latest values
  useEffect(() => {
    deletingImagesRef.current = deletingImages;
  }, [deletingImages]);

  useEffect(() => {
    deletedImageKeysRef.current = deletedImageKeys;
  }, [deletedImageKeys]);

  useEffect(() => {
    initializeAuth(
      () => {
        if (galleryId && orderId) {
          void loadOrderData();
          void loadWalletBalance();
        }
      },
      () => {
        const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : (galleryId ?? "");
        const orderIdStr = Array.isArray(orderId) ? orderId[0] : (orderId ?? "");
        redirectToLandingSignIn(`/galleries/${galleryIdStr}/orders/${orderIdStr}`);
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId, orderId]); // Removed loadOrderData and loadWalletBalance from deps to avoid infinite loops

  // Listen for order updates from sidebar actions (e.g., mark as paid, send finals)
  useEffect(() => {
    if (!galleryId || !orderId) {
      return undefined;
    }

    const handleOrderUpdate = (event: Event) => {
      const customEvent = event as OrderUpdateEvent;
      // Only reload if this is the same order
      if (customEvent.detail?.orderId === orderId) {
        void loadOrderData();
      }
    };

    const handleGalleryPaymentCompleted = (event: Event) => {
      const customEvent = event as OrderUpdateEvent;
      // Reload order data when gallery payment is completed
      // This ensures the order view updates when gallery is paid via sidebar
      if (customEvent.detail?.galleryId === galleryId) {
        void loadOrderData();
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("orderUpdated", handleOrderUpdate);
      window.addEventListener("galleryPaymentCompleted", handleGalleryPaymentCompleted);
      return () => {
        window.removeEventListener("orderUpdated", handleOrderUpdate);
        window.removeEventListener("galleryPaymentCompleted", handleGalleryPaymentCompleted);
      };
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, galleryId]); // Removed loadOrderData from deps

  // Auto-set to finals tab only if selection is disabled (non-selection galleries)
  // Don't auto-switch when originals section is visible (even if originals are deleted, we show previews)
  useEffect(() => {
    if (gallery?.selectionEnabled === false) {
      setActiveTab("finals");
    }
    // Removed auto-switch for PREPARING_DELIVERY/DELIVERED since we keep the section visible for previews
  }, [gallery]);

  // Polling cleanup is handled by usePhotoUploadHandler hook

  const handlePayClick = async (): Promise<void> => {
    if (!galleryId || paymentLoading) {
      return;
    }

    setPaymentLoading(true);

    try {
      // Always calculate plan first - this will determine the best plan based on uploaded photos
      const modalData = await getPricingModalData(galleryId as string);
      setPricingModalData(modalData);
      setPaymentLoading(false);
    } catch (err) {
      const errorMsg = formatApiError(err);
      showToast("error", "Błąd", errorMsg ?? "Nie udało się obliczyć planu. Spróbuj ponownie.");
      setPaymentLoading(false);
    }
  };

  const handlePaymentConfirm = async (): Promise<void> => {
    if (!galleryId || !paymentDetails) {
      return;
    }

    setShowPaymentModal(false);
    setPaymentLoading(true);

    try {
      // Backend will automatically use full Stripe if wallet is insufficient (no partial payments)
      const data = await api.galleries.pay(galleryId as string, {});

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else if (data.paid) {
        showToast("success", "Sukces", "Galeria została opłacona z portfela!");
        // Reload gallery data to update payment status in sidebar and header
        if (reloadGallery) {
          await reloadGallery();
        }
        await loadOrderData();
        await loadWalletBalance();
      }
    } catch (err) {
      const errorMsg = formatApiError(err);
      showToast("error", "Błąd", errorMsg ?? "Nie udało się opłacić galerii");
    } finally {
      setPaymentLoading(false);
    }
  };

  // handleFileSelect is now provided by usePhotoUploadHandler hook above

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      void handleFileSelect(files);
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

  const handleDeleteFinalDirect = async (image: GalleryImage): Promise<void> => {
    const imageKey = image.key ?? image.filename;
    if (!imageKey || !galleryId || !orderId) {
      return;
    }

    // Prevent duplicate deletions
    if (deletingImages.has(imageKey)) {
      return;
    }

    // Mark image as being deleted
    setDeletingImages((prev) => new Set(prev).add(imageKey));

    // Optimistically remove image from local state immediately
    setFinalImages((prevImages) =>
      prevImages.filter((img) => (img.key ?? img.filename) !== imageKey)
    );

    try {
      await api.orders.deleteFinalImage(galleryId as string, orderId as string, imageKey);

      // Mark as successfully deleted to prevent reappearance
      setDeletedImageKeys((prev) => new Set(prev).add(imageKey));

      // Clear deleted key after 30 seconds to allow eventual consistency
      // This ensures deleted images don't reappear even if API returns stale data
      setTimeout(() => {
        setDeletedImageKeys((prev) => {
          const updated = new Set(prev);
          updated.delete(imageKey);
          return updated;
        });
      }, 30000);

      // Remove from deleting set and reload if no other deletions are in progress
      setDeletingImages((prev) => {
        const updated = new Set(prev);
        updated.delete(imageKey);
        // If this was the last deletion, reload data (will filter out deleted images)
        if (updated.size === 0) {
          // Use setTimeout to ensure state update completes before reload
          setTimeout(async () => {
            await loadOrderData();
            // Notify GalleryLayoutWrapper to reload order data and check for finals
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("orderUpdated", { detail: { orderId } }));
            }
          }, 0);
        }
        return updated;
      });

      showToast("success", "Sukces", "Zdjęcie zostało usunięte");
    } catch (err) {
      // On error, restore the image to the list (only if not in deletedImageKeys)
      if (!deletedImageKeys.has(imageKey)) {
        setFinalImages((prevImages) => {
          const restored = [...prevImages];
          restored.push(image);
          return restored;
        });
      }

      // Remove from deleting set
      setDeletingImages((prev) => {
        const updated = new Set(prev);
        updated.delete(imageKey);
        return updated;
      });

      showToast("error", "Błąd", formatApiError(err));
    }
  };

  const handleDeleteFinalImageClick = (image: GalleryImage): void => {
    const imageKey = image.key ?? image.filename;

    if (!imageKey) {
      return;
    }

    // Prevent deletion if already being deleted
    if (deletingImages.has(imageKey)) {
      return;
    }

    // Check if deletion confirmation is suppressed
    const suppressKey = "final_image_delete_confirm_suppress";
    const suppressUntil = localStorage.getItem(suppressKey);
    if (suppressUntil) {
      const suppressUntilTime = parseInt(suppressUntil, 10);
      if (Date.now() < suppressUntilTime) {
        // Suppression is still active, proceed directly with deletion
        void handleDeleteFinalDirect(image);
        return;
      } else {
        // Suppression expired, remove it
        localStorage.removeItem(suppressKey);
      }
    }

    setImageToDelete(image);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteFinal = async (suppressChecked?: boolean): Promise<void> => {
    if (!imageToDelete) {
      return;
    }

    const imageKey = imageToDelete.key ?? imageToDelete.filename;
    if (!imageKey || !galleryId || !orderId) {
      return;
    }

    // Prevent duplicate deletions
    if (deletingImages.has(imageKey)) {
      return;
    }

    // Mark image as being deleted
    setDeletingImages((prev) => new Set(prev).add(imageKey));

    // Optimistically remove image from local state immediately
    setFinalImages((prevImages) =>
      prevImages.filter((img) => (img.key ?? img.filename) !== imageKey)
    );

    try {
      await api.orders.deleteFinalImage(galleryId as string, orderId as string, imageKey);

      // Save suppression only after successful deletion
      if (suppressChecked) {
        const suppressKey = "final_image_delete_confirm_suppress";
        const suppressUntil = Date.now() + 15 * 60 * 1000;
        localStorage.setItem(suppressKey, suppressUntil.toString());
      }

      // Mark as successfully deleted to prevent reappearance
      setDeletedImageKeys((prev) => new Set(prev).add(imageKey));

      // Clear deleted key after 30 seconds to allow eventual consistency
      // This ensures deleted images don't reappear even if API returns stale data
      setTimeout(() => {
        setDeletedImageKeys((prev) => {
          const updated = new Set(prev);
          updated.delete(imageKey);
          return updated;
        });
      }, 30000);

      // Close modal only after successful deletion
      setDeleteConfirmOpen(false);
      setImageToDelete(null);

      // Remove from deleting set and reload if no other deletions are in progress
      setDeletingImages((prev) => {
        const updated = new Set(prev);
        updated.delete(imageKey);
        // If this was the last deletion, reload data (will filter out deleted images)
        if (updated.size === 0) {
          // Use setTimeout to ensure state update completes before reload
          setTimeout(async () => {
            await loadOrderData();
            // Notify GalleryLayoutWrapper to reload order data and check for finals
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("orderUpdated", { detail: { orderId } }));
            }
          }, 0);
        }
        return updated;
      });

      showToast("success", "Sukces", "Zdjęcie zostało usunięte");
    } catch (err) {
      // On error, restore the image to the list (only if not in deletedImageKeys)
      if (!deletedImageKeys.has(imageKey)) {
        setFinalImages((prevImages) => {
          const restored = [...prevImages];
          restored.push(imageToDelete);
          return restored;
        });
      }

      // Remove from deleting set
      setDeletingImages((prev) => {
        const updated = new Set(prev);
        updated.delete(imageKey);
        return updated;
      });

      showToast("error", "Błąd", formatApiError(err));
      // Keep modal open on error so user can retry
    }
  };

  const handleStartEditAmount = (): void => {
    if (!order) {
      return;
    }
    setEditingAmountValue(centsToPlnString(order.totalCents ?? 0));
    setIsEditingAmount(true);
  };

  const handleCancelEditAmount = (): void => {
    setIsEditingAmount(false);
    setEditingAmountValue("");
  };

  const handleSaveAmount = async (): Promise<void> => {
    if (!galleryId || !orderId || !order) {
      return;
    }

    const newTotalCents = plnToCents(editingAmountValue);

    setSavingAmount(true);
    try {
      await api.orders.update(galleryId as string, orderId as string, {
        totalCents: newTotalCents,
      });

      // Invalidate cache to force fresh data fetch
      const { invalidateOrderCache } = useOrderStore.getState();
      invalidateOrderCache(orderId as string);

      await loadOrderData(true); // Force refresh
      setIsEditingAmount(false);
      setEditingAmountValue("");
      showToast("success", "Sukces", "Kwota została zaktualizowana");
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    } finally {
      setSavingAmount(false);
    }
  };

  const handleApproveChangeRequest = async (): Promise<void> => {
    if (!galleryId || !orderId) {
      return;
    }

    try {
      await api.orders.approveChangeRequest(galleryId as string, orderId as string);

      // Invalidate cache to force fresh data fetch
      const { invalidateOrderCache, invalidateGalleryOrdersCache } = useOrderStore.getState();
      const { invalidateGalleryCache, invalidateGalleryOrdersCache: invalidateGalleryOrders } =
        useGalleryStore.getState();
      invalidateOrderCache(orderId as string);
      invalidateGalleryOrdersCache(galleryId as string);
      invalidateGalleryCache(galleryId as string);
      invalidateGalleryOrders(galleryId as string);

      showToast(
        "success",
        "Sukces",
        "Prośba o zmiany została zatwierdzona. Klient może teraz modyfikować wybór."
      );
      await loadOrderData(true); // Force refresh
      // Reload gallery to update order status in sidebar
      if (reloadGallery) {
        await reloadGallery();
      }
    } catch (err) {
      showToast(
        "error",
        "Błąd",
        formatApiError(err) ?? "Nie udało się zatwierdzić prośby o zmiany"
      );
    }
  };

  const handleDenyChangeRequest = (): void => {
    setDenyModalOpen(true);
  };

  const handleDenyConfirm = async (reason?: string): Promise<void> => {
    if (!galleryId || !orderId) {
      return;
    }

    setDenyLoading(true);

    try {
      await api.orders.denyChangeRequest(galleryId as string, orderId as string, reason);

      // Invalidate cache to force fresh data fetch
      const { invalidateOrderCache, invalidateGalleryOrdersCache } = useOrderStore.getState();
      const { invalidateGalleryCache, invalidateGalleryOrdersCache: invalidateGalleryOrders } =
        useGalleryStore.getState();
      invalidateOrderCache(orderId as string);
      invalidateGalleryOrdersCache(galleryId as string);
      invalidateGalleryCache(galleryId as string);
      invalidateGalleryOrders(galleryId as string);

      showToast(
        "success",
        "Sukces",
        "Prośba o zmiany została odrzucona. Zlecenie zostało przywrócone do poprzedniego statusu."
      );
      setDenyModalOpen(false);
      await loadOrderData(true); // Force refresh
      // Reload gallery to update order status in sidebar
      if (reloadGallery) {
        await reloadGallery();
      }
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err) ?? "Nie udało się odrzucić prośby o zmiany");
    } finally {
      setDenyLoading(false);
    }
  };

  const getDeliveryStatusBadge = (status?: string) => {
    const statusMap: Record<string, { color: BadgeColor; label: string }> = {
      CLIENT_SELECTING: { color: "info", label: "Wybór przez klienta" },
      CLIENT_APPROVED: { color: "success", label: "Zatwierdzone" },
      AWAITING_FINAL_PHOTOS: { color: "warning", label: "Oczekuje na finały" },
      CHANGES_REQUESTED: { color: "warning", label: "Prośba o zmiany" },
      PREPARING_FOR_DELIVERY: { color: "info", label: "Gotowe do wysyłki" },
      PREPARING_DELIVERY: { color: "info", label: "Oczekuje do wysłania" },
      DELIVERED: { color: "success", label: "Dostarczone" },
      CANCELLED: { color: "error", label: "Anulowane" },
    };

    const statusInfo = statusMap[status ?? ""] ?? {
      color: "light" as BadgeColor,
      label: status ?? "",
    };
    return (
      <Badge color={statusInfo.color} variant="light">
        {statusInfo.label}
      </Badge>
    );
  };

  const getPaymentStatusBadge = (status?: string) => {
    const statusMap: Record<string, { color: BadgeColor; label: string }> = {
      UNPAID: { color: "error", label: "Nieopłacone" },
      PARTIALLY_PAID: { color: "warning", label: "Częściowo opłacone" },
      PAID: { color: "success", label: "Opłacone" },
      REFUNDED: { color: "error", label: "Zwrócone" },
    };

    const statusInfo = statusMap[status ?? ""] ?? {
      color: "light" as BadgeColor,
      label: status ?? "",
    };
    return (
      <Badge color={statusInfo.color} variant="light">
        {statusInfo.label}
      </Badge>
    );
  };

  if (loading && !order) {
    return <FullPageLoading text="Ładowanie zlecenia..." />;
  }

  if (!order) {
    return (
      <div className="p-6">
        <div className="p-4 bg-error-50 border border-error-200 rounded-lg text-error-600">
          {error ?? "Nie znaleziono zlecenia"}
        </div>
      </div>
    );
  }

  // Normalize selectedKeys - handle both array and string formats
  // For non-selection galleries, empty/undefined selectedKeys means "all photos"
  let selectedKeys: string[] = [];
  if (order.selectedKeys !== undefined && order.selectedKeys !== null) {
    if (Array.isArray(order.selectedKeys)) {
      selectedKeys = order.selectedKeys;
    } else if (typeof order.selectedKeys === "string") {
      try {
        const parsed: unknown = JSON.parse(order.selectedKeys);
        selectedKeys = Array.isArray(parsed) ? (parsed as string[]) : [order.selectedKeys];
      } catch (_e) {
        selectedKeys = [order.selectedKeys];
      }
    }
  }
  const selectionEnabled = gallery?.selectionEnabled !== false; // Default to true if not specified

  // For non-selection galleries: always show ALL images (selectedKeys is irrelevant)
  // For selection galleries: show only selected images, or "no photos selected" if empty/undefined
  const shouldShowAllImages = !selectionEnabled;

  // Don't hide "Wybrane przez klienta" section - keep it visible for preview purposes
  // Originals are deleted after finals upload, but previews remain for display
  const hideSelectedSection = false; // Always show the section for preview purposes

  // Check if gallery is paid (not DRAFT state)
  const isGalleryPaid = gallery?.state !== "DRAFT" && gallery?.isPaid !== false;

  // Allow upload for final photos when gallery is paid and order is not in a blocked state
  // Block uploads only for: CANCELLED
  // Allow uploads for: CLIENT_APPROVED, AWAITING_FINAL_PHOTOS, PREPARING_DELIVERY, PREPARING_FOR_DELIVERY
  // Also allow uploads for non-selection galleries even if deliveryStatus is undefined (legacy orders)
  // Note: Backend uses PREPARING_DELIVERY (without "FOR")
  const blockedUploadStatuses = ["CANCELLED"];
  const canUploadFinals =
    isGalleryPaid &&
    !blockedUploadStatuses.includes(order.deliveryStatus ?? "") &&
    ((!selectionEnabled && !order.deliveryStatus) || // Legacy orders without deliveryStatus in non-selection galleries
      !order.deliveryStatus || // Allow if no status set
      order.deliveryStatus === "CLIENT_APPROVED" ||
      order.deliveryStatus === "AWAITING_FINAL_PHOTOS" ||
      order.deliveryStatus === "PREPARING_DELIVERY" ||
      order.deliveryStatus === "PREPARING_FOR_DELIVERY");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/galleries/${Array.isArray(galleryId) ? (galleryId[0] ?? "") : (galleryId ?? "")}`}
          >
            <Button variant="outline" size="sm">
              ← Powrót do galerii
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mt-4">
            Zlecenie #
            {order.orderNumber ??
              (order.orderId
                ? order.orderId.slice(-8)
                : ((Array.isArray(orderId) ? orderId[0] : orderId) ?? ""))}
          </h1>
        </div>
        <div className="flex gap-2">
          {getDeliveryStatusBadge(order.deliveryStatus)}
          {getPaymentStatusBadge(order.paymentStatus)}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-error-50 border border-error-200 rounded-lg text-error-600">
          {error}
        </div>
      )}

      {/* Change Request Actions */}
      {order.deliveryStatus === "CHANGES_REQUESTED" && (
        <div className="p-4 bg-warning-50 border border-warning-200 rounded-lg dark:bg-warning-500/10 dark:border-warning-500/20">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-warning-800 dark:text-warning-200 mb-1">
                Prośba o zmiany
              </div>
              <div className="text-xs text-warning-600 dark:text-warning-400">
                Klient prosi o możliwość modyfikacji wyboru. Zatwierdź, aby odblokować wybór, lub
                odrzuć, aby przywrócić poprzedni status.
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={handleApproveChangeRequest}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                Zatwierdź
              </Button>
              <Button size="sm" variant="outline" onClick={handleDenyChangeRequest}>
                Odrzuć
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Order Info */}
      <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Kwota dodatkowych usług
            </div>
            <div className="flex items-center gap-2">
              {isEditingAmount ? (
                <>
                  <input
                    type="text"
                    value={editingAmountValue}
                    onChange={(e) => {
                      const formatted = formatCurrencyInput(e.target.value);
                      setEditingAmountValue(formatted);
                    }}
                    className="text-lg font-semibold text-gray-900 dark:text-white bg-transparent border-0 border-b-2 border-gray-400 dark:border-gray-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400 px-0 py-0 max-w-[150px]"
                    autoFocus
                    disabled={savingAmount}
                  />
                  <span className="text-lg font-semibold text-gray-900 dark:text-white">PLN</span>
                  <button
                    onClick={handleSaveAmount}
                    disabled={savingAmount}
                    className="p-1 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Zapisz"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={handleCancelEditAmount}
                    disabled={savingAmount}
                    className="p-1 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Anuluj"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                  {savingAmount && <Loading size="sm" />}
                </>
              ) : (
                <>
                  <span className="text-lg font-semibold text-gray-900 dark:text-white">
                    {formatPrice(order.totalCents)}
                  </span>
                  <button
                    onClick={handleStartEditAmount}
                    className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
                    title="Edytuj kwotę"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Data utworzenia</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {order.createdAt ? new Date(order.createdAt).toLocaleDateString("pl-PL") : "-"}
            </div>
          </div>
          {selectionEnabled && order.selectedKeys && (
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Wybrane zdjęcia</div>
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                {selectedKeys.length} zdjęć
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs - Only show if selection is enabled and not in PREPARING_DELIVERY/DELIVERED status */}
      {selectionEnabled && !hideSelectedSection && (
        <div className="border-b border-gray-200 dark:border-gray-700">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab("originals")}
              className={`px-4 py-2 font-medium border-b-2 ${
                activeTab === "originals"
                  ? "border-brand-500 text-brand-600 dark:text-brand-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              }`}
            >
              Wybrane przez klienta ({selectedKeys.length})
            </button>
            <button
              onClick={() => setActiveTab("finals")}
              className={`px-4 py-2 font-medium border-b-2 ${
                activeTab === "finals"
                  ? "border-brand-500 text-brand-600 dark:text-brand-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              }`}
            >
              Finały ({finalImages.length})
            </button>
          </div>
        </div>
      )}

      {/* Tab Content */}
      {selectionEnabled && !hideSelectedSection && activeTab === "originals" && (
        <div className="space-y-4">
          {shouldShowAllImages ? (
            // Non-selection gallery: show all images
            <>
              {originalImages.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <p>Ładowanie zdjęć...</p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-4">
                  {originalImages.map((img, idx) => {
                    const imgKey = img.key ?? img.filename ?? img.id ?? `img-${idx}`;
                    return (
                      <div
                        key={imgKey ?? idx}
                        className="relative border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.previewUrl ?? img.thumbUrl ?? img.url ?? ""}
                          alt={imgKey}
                          className="w-full h-48 object-cover"
                          onError={(e) => {
                            // Fallback to thumbUrl if previewUrl fails
                            if (
                              img.previewUrl &&
                              img.thumbUrl &&
                              e.currentTarget.src === img.previewUrl
                            ) {
                              e.currentTarget.src = img.thumbUrl;
                            } else if (
                              img.thumbUrl &&
                              img.url &&
                              e.currentTarget.src === img.thumbUrl
                            ) {
                              e.currentTarget.src = img.url;
                            }
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : selectedKeys.length === 0 ? (
            // Selection gallery but no selectedKeys yet
            // If order has a delivery status that suggests photos should exist, show all images as fallback
            (order.deliveryStatus === "CLIENT_APPROVED" ||
              order.deliveryStatus === "AWAITING_FINAL_PHOTOS" ||
              order.deliveryStatus === "PREPARING_DELIVERY" ||
              order.deliveryStatus === "DELIVERED") &&
            originalImages.length > 0 ? (
              // Legacy order or missing selectedKeys - show all images as fallback
              <div className="space-y-2">
                <div className="p-2 bg-info-50 border border-info-200 rounded-lg dark:bg-info-500/10 dark:border-info-500/20">
                  <p className="text-xs text-info-800 dark:text-info-200">
                    Uwaga: Zlecenie nie ma zapisanych wybranych kluczy. Wyświetlane są wszystkie
                    zdjęcia.
                  </p>
                </div>
                <div className="grid grid-cols-4 gap-4">
                  {originalImages.map((img, idx) => {
                    const imgKey = img.key ?? img.filename ?? img.id ?? `img-${idx}`;
                    return (
                      <div
                        key={imgKey ?? idx}
                        className="relative border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.previewUrl ?? img.thumbUrl ?? img.url ?? ""}
                          alt={imgKey}
                          className="w-full h-48 object-cover"
                          onError={(e) => {
                            if (
                              img.previewUrl &&
                              img.thumbUrl &&
                              e.currentTarget.src === img.previewUrl
                            ) {
                              e.currentTarget.src = img.thumbUrl;
                            } else if (
                              img.thumbUrl &&
                              img.url &&
                              e.currentTarget.src === img.thumbUrl
                            ) {
                              e.currentTarget.src = img.url;
                            }
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <p>Klient nie wybrał jeszcze żadnych zdjęć.</p>
                {order.deliveryStatus && order.deliveryStatus !== "CLIENT_SELECTING" && (
                  <p className="mt-2 text-xs text-gray-400">
                    Status zlecenia: {order.deliveryStatus}
                  </p>
                )}
              </div>
            )
          ) : (
            // Selection gallery with selectedKeys: show filtered images
            <>
              {originalImages.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <p>Ładowanie zdjęć...</p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-4">
                  {originalImages
                    .filter((img) => {
                      // Try multiple key fields and normalize for comparison
                      const imgKey = (img.key ?? img.filename ?? img.id ?? "").toString().trim();
                      // Normalize selectedKeys for comparison (handle URL encoding, spaces, etc.)
                      const normalizedSelectedKeys = selectedKeys.map((k) => k.toString().trim());
                      return normalizedSelectedKeys.includes(imgKey);
                    })
                    .map((img, idx) => {
                      const imgKey = img.key ?? img.filename ?? img.id ?? `img-${idx}`;
                      return (
                        <div
                          key={imgKey ?? idx}
                          className="relative border-2 border-brand-500 ring-2 ring-brand-200 rounded-lg overflow-hidden"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.previewUrl ?? img.thumbUrl ?? img.url ?? ""}
                            alt={imgKey}
                            className="w-full h-48 object-cover"
                            onError={(e) => {
                              // Fallback to thumbUrl if previewUrl fails
                              if (
                                img.previewUrl &&
                                img.thumbUrl &&
                                e.currentTarget.src === img.previewUrl
                              ) {
                                e.currentTarget.src = img.thumbUrl;
                              } else if (
                                img.thumbUrl &&
                                img.url &&
                                e.currentTarget.src === img.thumbUrl
                              ) {
                                e.currentTarget.src = img.url;
                              }
                            }}
                          />
                        </div>
                      );
                    })}
                </div>
              )}
              {selectedKeys.length > 0 &&
                originalImages.length > 0 &&
                originalImages.filter((img) => {
                  const imgKey = (img.key ?? img.filename ?? img.id ?? "").toString().trim();
                  const normalizedSelectedKeys = selectedKeys.map((k) => k.toString().trim());
                  return normalizedSelectedKeys.includes(imgKey);
                }).length === 0 && (
                  <div className="p-4 bg-warning-50 border border-warning-200 rounded-lg dark:bg-warning-500/10 dark:border-warning-500/20">
                    <p className="text-sm text-warning-800 dark:text-warning-200">
                      Nie znaleziono zdjęć pasujących do wybranych kluczy. Wybrane klucze:{" "}
                      {selectedKeys.slice(0, 5).join(", ")}
                      {selectedKeys.length > 5 ? "..." : ""}
                    </p>
                    <p className="text-xs text-warning-600 dark:text-warning-400 mt-1">
                      Dostępne zdjęcia: {originalImages.length} | Wybrane klucze:{" "}
                      {selectedKeys.length}
                    </p>
                  </div>
                )}
            </>
          )}
        </div>
      )}

      {/* Show finals content when:
			     - Selection is disabled (always show finals)
			     - Selected section is hidden (finals uploaded, originals deleted - only show finals)
			     - Selection enabled and selected section visible, but user is on finals tab
			*/}
      {(!(selectionEnabled && !hideSelectedSection) || activeTab === "finals") && (
        <div className="space-y-4">
          {/* Show unpaid message if gallery is not paid */}
          {!isGalleryPaid && (
            <div className="p-4 bg-warning-50 border border-warning-200 rounded-lg dark:bg-warning-500/10 dark:border-warning-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-warning-800 dark:text-warning-200 mb-1">
                    Galeria nieopublikowana
                  </div>
                  <div className="text-xs text-warning-600 dark:text-warning-400">
                    Nie możesz przesłać zdjęć finalnych, ponieważ galeria nie została opublikowana.
                    Opublikuj galerię aby kontynuować.
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handlePayClick}
                  disabled={paymentLoading}
                >
                  {paymentLoading ? "Przetwarzanie..." : "Opublikuj galerię"}
                </Button>
              </div>
            </div>
          )}

          {/* Upload Progress Bar */}
          {uploading && uploadProgress.total > 0 && (
            <div className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-3 flex-1">
                  <Loading size="sm" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        Przesyłanie zdjęć finalnych...
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {uploadProgress.current} / {uploadProgress.total}
                      </span>
                    </div>
                    {uploadProgress.currentFileName && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {uploadProgress.currentFileName}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={cancelUpload}
                  className="ml-4 px-3 py-1.5 text-sm font-medium text-error-600 dark:text-error-400 hover:text-error-700 dark:hover:text-error-300 border border-error-300 dark:border-error-700 rounded-md hover:bg-error-50 dark:hover:bg-error-900/20 transition-colors"
                >
                  Anuluj
                </button>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-brand-500 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${(uploadProgress.current / uploadProgress.total) * 100}%`,
                  }}
                />
              </div>
              {uploadProgress.errors.length > 0 && (
                <div className="mt-2 text-xs text-error-600 dark:text-error-400">
                  Błędy: {uploadProgress.errors.length} | Sukcesy: {uploadProgress.successes}
                </div>
              )}
            </div>
          )}

          {canUploadFinals && (
            <div
              className={`relative w-full rounded-lg border-2 border-dashed transition-colors ${
                isDragging
                  ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
                  : "border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800"
              } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => !uploading && fileInputRef.current?.click()}
            >
              <div className="p-8 text-center cursor-pointer">
                {uploading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loading size="lg" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">Przesyłanie zdjęć...</p>
                  </div>
                ) : (
                  <>
                    <svg
                      className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500"
                      stroke="currentColor"
                      fill="none"
                      viewBox="0 0 48 48"
                      aria-hidden="true"
                    >
                      <path
                        d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <div className="mt-4">
                      <p className="text-base font-medium text-gray-900 dark:text-white">
                        Przeciągnij zdjęcia tutaj lub kliknij, aby wybrać
                      </p>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Obsługiwane formaty: JPG, PNG, GIF
                      </p>
                    </div>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files) {
                    void handleFileSelect(e.target.files);
                  }
                }}
                className="hidden"
              />
            </div>
          )}

          {finalImages.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              Brak zdjęć finalnych
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-4">
              {finalImages.map((img, idx) => {
                const imageKey = img.key ?? img.filename ?? "";

                return (
                  <div
                    key={imageKey ?? idx}
                    className="relative group border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden hover:border-brand-500 dark:hover:border-brand-400 transition-colors"
                  >
                    <div className="aspect-square relative">
                      <RetryableImage
                        src={img.previewUrl ?? img.thumbUrl ?? img.finalUrl ?? img.url ?? ""}
                        alt={imageKey}
                        className="w-full h-full object-cover rounded-lg"
                      />
                      {canUploadFinals && (
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity flex items-center justify-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteFinalImageClick(img);
                            }}
                            disabled={deletingImages.has(imageKey)}
                            className={`opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 text-sm font-medium rounded-md ${
                              deletingImages.has(imageKey)
                                ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                                : "bg-error-500 text-white hover:bg-error-600"
                            }`}
                            title={deletingImages.has(imageKey) ? "Usuwanie..." : "Usuń zdjęcie"}
                          >
                            {deletingImages.has(imageKey) ? "Usuwanie..." : "Usuń"}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                        {imageKey}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => {
          const imageKey = imageToDelete?.key ?? imageToDelete?.filename;
          if (!imageKey || !deletingImages.has(imageKey)) {
            setDeleteConfirmOpen(false);
            setImageToDelete(null);
          }
        }}
        onConfirm={handleDeleteFinal}
        title="Usuń zdjęcie"
        message={
          imageToDelete
            ? `Czy na pewno chcesz usunąć zdjęcie "${imageToDelete.key ?? imageToDelete.filename ?? ""}"?\nTa operacja jest nieodwracalna.`
            : ""
        }
        confirmText="Usuń"
        cancelText="Anuluj"
        variant="danger"
        loading={
          imageToDelete
            ? deletingImages.has(imageToDelete.key ?? imageToDelete.filename ?? "")
            : false
        }
        suppressKey="final_image_delete_confirm_suppress"
      />

      {/* Deny Change Request Modal */}
      <DenyChangeRequestModal
        isOpen={denyModalOpen}
        onClose={() => setDenyModalOpen(false)}
        onConfirm={handleDenyConfirm}
        loading={denyLoading}
      />

      {/* Pricing Modal - Show when user clicks publish gallery */}
      {pricingModalData && (
        <GalleryPricingModal
          isOpen={!!pricingModalData}
          onClose={() => {
            setPricingModalData(null);
          }}
          galleryId={galleryId as string}
          suggestedPlan={pricingModalData.suggestedPlan}
          originalsLimitBytes={pricingModalData.originalsLimitBytes}
          finalsLimitBytes={pricingModalData.finalsLimitBytes}
          uploadedSizeBytes={pricingModalData.uploadedSizeBytes}
          selectionEnabled={pricingModalData.selectionEnabled}
          usagePercentage={pricingModalData.usagePercentage}
          isNearCapacity={pricingModalData.isNearCapacity}
          isAtCapacity={pricingModalData.isAtCapacity}
          exceedsLargestPlan={pricingModalData.exceedsLargestPlan}
          nextTierPlan={pricingModalData.nextTierPlan ?? undefined}
          onPlanSelected={async () => {
            setPricingModalData(null);
            // Reload gallery data to update payment status
            if (reloadGallery) {
              await reloadGallery();
            }
            await loadOrderData();
            await loadWalletBalance();
          }}
        />
      )}

      {/* Upload Progress Overlay */}
      {(() => {
        const currentProgress =
          handlerPerImageProgress.length > 0 ? handlerPerImageProgress : perImageProgress;

        if (currentProgress.length === 0 || isOverlayDismissed) {
          return null;
        }

        return (
          <UploadProgressOverlay
            images={currentProgress}
            isUploadComplete={isUploadComplete}
            onDismiss={() => {
              setIsOverlayDismissed(true);
              setPerImageProgress([]);
            }}
          />
        );
      })()}

      {/* Payment Confirmation Modal */}
      {paymentDetails && (
        <PaymentConfirmationModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          onConfirm={handlePaymentConfirm}
          totalAmountCents={paymentDetails.totalAmountCents}
          walletBalanceCents={walletBalance}
          walletAmountCents={paymentDetails.walletAmountCents}
          stripeAmountCents={paymentDetails.stripeAmountCents}
          loading={paymentLoading}
        />
      )}
    </div>
  );
}
