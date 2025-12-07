import { GalleryThumbnails, ProcessedPhotosView, ImageModal } from "@photocloud/gallery-components";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";

import { GalleryLoading } from "../../../components/ui/loading/Loading";
import withOwnerAuth from "../../../hocs/withOwnerAuth";
import { useDeleteGalleryImage } from "../../../hooks/mutations/useGalleryMutations";
import {
  useGallery,
  useGalleryImages,
  useGalleryDeliveredOrders,
} from "../../../hooks/queries/useGalleries";
import { useOrders } from "../../../hooks/queries/useOrders";
import api, { formatApiError } from "../../../lib/api-service";
import type { Order, GalleryImage } from "../../../types";

interface OwnerGalleryViewProps {
  token: string;
  ownerId: string;
  galleryId: string | string[] | undefined;
  mode: "owner";
}

function OwnerGalleryView({ token, galleryId }: OwnerGalleryViewProps) {
  const router = useRouter();
  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
  const galleryIdForQuery =
    galleryIdStr && typeof galleryIdStr === "string" ? galleryIdStr : undefined;

  const { data: gallery, isLoading: galleryLoading } = useGallery(galleryIdForQuery);
  const { data: imagesFromQuery = [], isLoading: imagesLoading } = useGalleryImages(
    galleryIdForQuery,
    "thumb"
  );
  const { data: orders = [], isLoading: ordersLoading } = useOrders(galleryIdForQuery);
  const { data: deliveredOrders = [] } = useGalleryDeliveredOrders(galleryIdForQuery);
  const deleteGalleryImageMutation = useDeleteGalleryImage();
  const [galleryName, setGalleryName] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [images, setImages] = useState<GalleryImage[]>([]);

  const loading = galleryLoading || imagesLoading || ordersLoading;
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

  // Load gallery on mount
  useEffect(() => {
    if (galleryId) {
      void loadGallery();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId]);

  function loadGallery(): void {
    setMessage("");
    if (!galleryIdForQuery) {
      return;
    }
    try {
      // Use React Query data - it's already fetched
      setImages(imagesFromQuery);

      // Check if there are delivered orders (using React Query data)
      const hasOrders = deliveredOrders.length > 0;
      setHasDeliveredOrders(hasOrders);

      // Get selected keys from active order (CLIENT_APPROVED, PREPARING_DELIVERY, or CHANGES_REQUESTED)
      const ordersList = orders;

      // Find active order (approved, preparing delivery, or changes requested)
      const activeOrder = ordersList.find((o): o is Order => {
        if (!o || typeof o !== "object" || !("deliveryStatus" in o) || !("orderId" in o)) {
          return false;
        }
        const status = (o as { deliveryStatus?: unknown }).deliveryStatus;
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

      // Get gallery name from React Query data
      setGalleryName(gallery?.galleryName ?? galleryIdForQuery);
    } catch (error) {
      setMessage(formatApiError(error));
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
    if (!galleryId) {
      setMessage("Gallery ID required");
      return;
    }
    const galleryIdStr = Array.isArray(galleryId) ? (galleryId[0] ?? "") : (galleryId ?? "");
    try {
      await deleteGalleryImageMutation.mutateAsync({
        galleryId: galleryIdStr,
        imageKeys: [filename],
      });

      setMessage("Photo deleted.");
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
          apiUrl={process.env.NEXT_PUBLIC_API_URL ?? ""}
          onImageClick={(index: number) => {
            setModalImageIndex(index);
          }}
          onFinalImagesChange={(images: GalleryImage[]) => {
            setFinalImages(images);
          }}
          apiFetch={async (url: string, options: RequestInit) => {
            // ProcessedPhotosView expects apiFetchWithAuth signature - route to API service
            const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
            const fullUrl = url.startsWith("http") ? url : `${apiUrl}${url}`;
            const relativeUrl = url.startsWith("http") ? new URL(url).pathname : url;

            try {
              // Route to appropriate API service method based on URL pattern
              if (relativeUrl.includes("/orders/delivered")) {
                // GET /galleries/{galleryId}/orders/delivered
                const galleryIdMatch = relativeUrl.match(/\/galleries\/([^/]+)\/orders\/delivered/);
                if (galleryIdMatch) {
                  const galleryId = galleryIdMatch[1];
                  const data = await api.galleries.checkDeliveredOrders(galleryId);
                  return {
                    data: { items: Array.isArray(data) ? data : data.items || [] },
                    response: new Response(JSON.stringify(data), { status: 200 }),
                  };
                }
              } else if (relativeUrl.includes("/final/images")) {
                // GET /galleries/{galleryId}/orders/{orderId}/final/images
                const match = relativeUrl.match(
                  /\/galleries\/([^/]+)\/orders\/([^/]+)\/final\/images/
                );
                if (match) {
                  const [, galleryId, orderId] = match;
                  const data = await api.orders.getFinalImages(galleryId, orderId);
                  return {
                    data,
                    response: new Response(JSON.stringify(data), { status: 200 }),
                  };
                }
              } else if (relativeUrl.includes("/final/zip") && options.method === "POST") {
                // POST /galleries/{galleryId}/orders/{orderId}/final/zip
                const match = relativeUrl.match(
                  /\/galleries\/([^/]+)\/orders\/([^/]+)\/final\/zip/
                );
                if (match) {
                  const [, galleryId, orderId] = match;
                  const result = await api.orders.downloadFinalZip(galleryId, orderId);
                  // Convert to expected format (base64 ZIP for backward compatibility)
                  if (result.zip) {
                    return {
                      data: { zip: result.zip, filename: result.filename },
                      response: new Response(
                        JSON.stringify({ zip: result.zip, filename: result.filename }),
                        {
                          status: 200,
                        }
                      ),
                    };
                  } else if (result.blob) {
                    // Convert blob to base64 for backward compatibility
                    const arrayBuffer = await result.blob.arrayBuffer();
                    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
                    return {
                      data: { zip: base64, filename: result.filename },
                      response: new Response(
                        JSON.stringify({ zip: base64, filename: result.filename }),
                        {
                          status: 200,
                        }
                      ),
                    };
                  }
                }
              }

              // Fallback: use direct fetch for any other endpoints
              const { getValidToken } = await import("../../../lib/api-service");
              const token = await getValidToken();
              const response = await fetch(fullUrl, {
                ...options,
                headers: {
                  ...options.headers,
                  Authorization: `Bearer ${token}`,
                },
              });
              const contentType = response.headers.get("content-type");
              const isJson = contentType?.includes("application/json") ?? false;
              const body: unknown = isJson ? await response.json() : await response.text();
              return { data: body, response };
            } catch (error) {
              // Return error in expected format
              const errorResponse = new Response(JSON.stringify({ error: String(error) }), {
                status: 500,
              });
              return { data: { error: String(error) }, response: errorResponse };
            }
          }}
        />
      )}

      {/* Purchase Additional Photos View */}
      {viewMode === "purchase" && (
        <div>
          {loading && images.length === 0 ? (
            <GalleryLoading />
          ) : (
            <>
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

              {images.length === 0 && !loading && galleryId && (
                <p className="text-gray-500 dark:text-gray-400 mt-6">
                  No images found. Make sure the gallery has uploaded photos.
                </p>
              )}
            </>
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
