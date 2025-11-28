import { GalleryThumbnails, ProcessedPhotosView, ImageModal } from "@photocloud/gallery-components";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";

import withOwnerAuth from "../../../hocs/withOwnerAuth";
import { apiFetchWithAuth, formatApiError } from "../../../lib/api";

interface OwnerGalleryViewProps {
  token: string;
  ownerId: string;
  galleryId: string | string[] | undefined;
  mode: "owner";
}

interface GalleryImage {
  key: string;
  url?: string;
  [key: string]: unknown;
}

interface Order {
  orderId: string;
  deliveryStatus?: string;
  selectedKeys?: string[];
  [key: string]: unknown;
}

interface ImagesResponse {
  images?: GalleryImage[];
  [key: string]: unknown;
}

interface OrdersResponse {
  items?: Order[];
  [key: string]: unknown;
}

interface GalleryResponse {
  galleryName?: string;
  [key: string]: unknown;
}

function OwnerGalleryView({ token, galleryId }: OwnerGalleryViewProps) {
  const router = useRouter();
  const [apiUrl, setApiUrl] = useState<string>("");
  const [galleryName, setGalleryName] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [modalImageIndex, setModalImageIndex] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"purchase" | "processed">("purchase");
  const [finalImages, setFinalImages] = useState<GalleryImage[]>([]);
  const [hasDeliveredOrders, setHasDeliveredOrders] = useState<boolean>(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // Default to processed view if processed items exist after load
  useEffect(() => {
    if (hasDeliveredOrders && viewMode === "purchase" && !loading) {
      setViewMode("processed");
    }
  }, [hasDeliveredOrders, loading, viewMode]);

  useEffect(() => {
    setApiUrl(process.env.NEXT_PUBLIC_API_URL ?? "");
  }, []);

  // Load gallery on mount
  useEffect(() => {
    if (apiUrl && galleryId && token) {
      void loadGallery();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, galleryId, token]);

  async function loadGallery(): Promise<void> {
    setMessage("");
    setLoading(true);
    if (!apiUrl || !galleryId || !token) {
      setLoading(false);
      return;
    }
    const galleryIdStr = Array.isArray(galleryId) ? (galleryId[0] ?? "") : (galleryId ?? "");
    try {
      const [imagesResponse, deliveredOrdersResponse, ordersResponse] = await Promise.allSettled([
        apiFetchWithAuth<ImagesResponse>(`${apiUrl}/galleries/${galleryIdStr}/images`, {}, token),
        apiFetchWithAuth<OrdersResponse>(
          `${apiUrl}/galleries/${galleryIdStr}/orders/delivered`,
          {},
          token
        ),
        apiFetchWithAuth<OrdersResponse>(`${apiUrl}/galleries/${galleryIdStr}/orders`, {}, token),
      ]);

      if (imagesResponse.status === "fulfilled") {
        const imagesData = imagesResponse.value.data;
        if (imagesData && typeof imagesData === "object" && "images" in imagesData) {
          setImages(Array.isArray(imagesData.images) ? imagesData.images : []);
        }
      }

      // Check if there are delivered or preparing_delivery orders
      if (deliveredOrdersResponse.status === "fulfilled") {
        const ordersData = deliveredOrdersResponse.value.data;
        if (ordersData && typeof ordersData === "object" && "items" in ordersData) {
          const hasOrders = (Array.isArray(ordersData.items) ? ordersData.items.length : 0) > 0;
          setHasDeliveredOrders(hasOrders);
        } else {
          setHasDeliveredOrders(false);
        }
      } else {
        setHasDeliveredOrders(false);
      }

      // Get selected keys from active order (CLIENT_APPROVED, PREPARING_DELIVERY, or CHANGES_REQUESTED)
      if (ordersResponse.status === "fulfilled") {
        const ordersData = ordersResponse.value.data;
        if (!ordersData || typeof ordersData !== "object" || !("items" in ordersData)) {
          setSelectedKeys(new Set());
          setLoading(false);
          return;
        }
        const orders = Array.isArray(ordersData.items) ? ordersData.items : [];

        // Find active order (approved, preparing delivery, or changes requested)
        const activeOrder = orders.find((o): o is Order => {
          if (!o || typeof o !== "object" || !("deliveryStatus" in o)) {
            return false;
          }
          const status = o.deliveryStatus;
          return (
            status === "CLIENT_APPROVED" ||
            status === "PREPARING_DELIVERY" ||
            status === "CHANGES_REQUESTED"
          );
        });

        if (activeOrder?.selectedKeys && Array.isArray(activeOrder.selectedKeys)) {
          setSelectedKeys(new Set(activeOrder.selectedKeys));
        } else {
          setSelectedKeys(new Set());
        }
      } else {
        setSelectedKeys(new Set());
      }

      // Try to get gallery name from gallery info
      try {
        const galleryResponse = await apiFetchWithAuth<GalleryResponse>(
          `${apiUrl}/galleries/${galleryIdStr}`,
          {},
          token
        );
        const gallery = galleryResponse.data;
        setGalleryName(gallery.galleryName ?? galleryIdStr);
      } catch (_e) {
        // Gallery info not available, that's OK
        setGalleryName(galleryIdStr);
      }
    } catch (error) {
      setMessage(formatApiError(error));
    } finally {
      setLoading(false);
    }
  }

  async function deletePhoto(filename: string): Promise<void> {
    if (
      // eslint-disable-next-line no-alert
      !window.confirm(
        `Are you sure you want to delete "${filename}"? This will permanently delete the photo from originals, previews, and thumbnails.`
      )
    ) {
      return;
    }
    setMessage("");
    if (!apiUrl || !galleryId || !token) {
      setMessage("Not authenticated");
      return;
    }
    const galleryIdStr = Array.isArray(galleryId) ? (galleryId[0] ?? "") : (galleryId ?? "");
    try {
      const response = await apiFetchWithAuth(
        `${apiUrl}/galleries/${String(galleryIdStr)}/photos/${encodeURIComponent(filename)}`,
        {
          method: "DELETE",
        },
        token
      );
      const responseData: unknown = response.data;
      if (
        responseData &&
        typeof responseData === "object" &&
        "storageUsedMB" in responseData &&
        "storageLimitMB" in responseData &&
        typeof (responseData as { storageUsedMB?: unknown }).storageUsedMB === "number" &&
        typeof (responseData as { storageLimitMB?: unknown }).storageLimitMB === "number"
      ) {
        const storageUsedMB = (responseData as { storageUsedMB: number }).storageUsedMB;
        const storageLimitMB = (responseData as { storageLimitMB: number }).storageLimitMB;
        setMessage(`Photo deleted. Storage: ${storageUsedMB} MB / ${storageLimitMB} MB`);
      } else {
        setMessage("Photo deleted.");
      }
      // Reload gallery to refresh images and storage
      void loadGallery();
    } catch (error) {
      setMessage(formatApiError(error));
    }
  }

  function openModal(index: number): void {
    setModalImageIndex(index);
  }

  function closeModal(): void {
    setModalImageIndex(null);
  }

  function navigateModal(direction: "next" | "prev"): void {
    if (modalImageIndex === null) {
      return;
    }
    const currentImages = viewMode === "processed" ? finalImages : images;
    if (currentImages.length === 0) {
      return;
    }
    const newIndex =
      direction === "next"
        ? (modalImageIndex + 1) % currentImages.length
        : (modalImageIndex - 1 + currentImages.length) % currentImages.length;
    setModalImageIndex(newIndex);
  }

  // If viewMode is 'processed' but there are no delivered orders, switch back to 'purchase'
  useEffect(() => {
    if (viewMode === "processed" && !hasDeliveredOrders && !loading) {
      setViewMode("purchase");
    }
  }, [viewMode, hasDeliveredOrders, loading]);

  return (
    <div style={{ padding: 24, maxWidth: "100%", boxSizing: "border-box" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <h1 style={{ margin: 0 }}>{galleryName ?? "Gallery View"}</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => loadGallery()}
            disabled={loading}
            className={`px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded cursor-pointer text-sm ${
              loading ? "cursor-not-allowed opacity-50" : ""
            }`}
            title="Refresh gallery data"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          {/* View Mode Toggle - Only show if there are delivered/preparing_delivery orders */}
          {hasDeliveredOrders && (
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
              <button
                onClick={() => setViewMode("processed")}
                className={`px-4 py-2 border-none rounded cursor-pointer text-sm ${
                  viewMode === "processed"
                    ? "bg-brand-600 dark:bg-brand-500 text-white font-bold"
                    : "bg-transparent text-gray-500 dark:text-gray-400 font-normal"
                }`}
              >
                Processed Photos
              </button>
              <button
                onClick={() => setViewMode("purchase")}
                className={`px-4 py-2 border-none rounded cursor-pointer text-sm ${
                  viewMode === "purchase"
                    ? "bg-brand-600 dark:bg-brand-500 text-white font-bold"
                    : "bg-transparent text-gray-500 dark:text-gray-400 font-normal"
                }`}
              >
                Original Photos
              </button>
            </div>
          )}
          <button
            onClick={() => router.push("/galleries")}
            className="px-4 py-2 bg-gray-500 dark:bg-gray-500 text-white border-none rounded cursor-pointer text-sm"
          >
            Back to Galleries
          </button>
        </div>
      </div>

      {/* Processed Photos View */}
      {viewMode === "processed" && (
        <ProcessedPhotosView
          galleryId={typeof galleryId === "string" ? galleryId : ""}
          token={token}
          apiUrl={apiUrl}
          onImageClick={(index: number) => {
            setModalImageIndex(index);
          }}
          onFinalImagesChange={(images: GalleryImage[]) => {
            setFinalImages(images);
          }}
          apiFetch={(url: string, options: RequestInit) => apiFetchWithAuth(url, options, token)}
        />
      )}

      {/* Purchase Additional Photos View */}
      {viewMode === "purchase" && (
        <div>
          {/* Image Grid - Owner can view but not select, shows client's selection */}
          <GalleryThumbnails
            images={images as unknown as never[]}
            selectedKeys={selectedKeys}
            onToggle={null}
            onDelete={deletePhoto}
            onImageClick={openModal}
            canSelect={false}
            showDeleteButton={true}
          />

          {images.length === 0 && !loading && apiUrl && galleryId && token && (
            <p className="text-gray-500 dark:text-gray-400 mt-6">
              No images found. Make sure the gallery has uploaded photos.
            </p>
          )}
        </div>
      )}

      {message && (
        <div
          className={`mt-4 p-3 rounded ${
            message.includes("Error")
              ? "bg-error-50 dark:bg-error-500/15 text-error-600 dark:text-error-400"
              : "bg-success-50 dark:bg-success-500/15 text-success-600 dark:text-success-400"
          }`}
        >
          {message}
        </div>
      )}

      {/* Image Modal */}
      {modalImageIndex !== null &&
        (() => {
          const currentImages = viewMode === "processed" ? finalImages : images;
          const currentImage = currentImages[modalImageIndex];
          if (!currentImage) {
            return null;
          }

          return (
            <ImageModal
              image={currentImage as unknown as never}
              images={currentImages as unknown as never[]}
              index={modalImageIndex}
              onClose={closeModal}
              onNavigate={navigateModal}
              onToggle={() => {}}
              canSelect={false}
              isProcessed={viewMode === "processed"}
              selectedKeys={viewMode === "purchase" ? selectedKeys : undefined}
            />
          );
        })()}
    </div>
  );
}

export default withOwnerAuth(OwnerGalleryView);
