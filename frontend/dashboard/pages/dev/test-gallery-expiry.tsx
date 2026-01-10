"use client";

import { Clock, CheckCircle2, XCircle, Loader2, Calendar, Image as ImageIcon } from "lucide-react";
import type { GetServerSideProps } from "next";
import React, { useState, useEffect } from "react";

// Prevent static generation for this dev page
export const getServerSideProps: GetServerSideProps = () => {
  return Promise.resolve({ props: {} });
};

import { useToast } from "../../hooks/useToast";
import api from "../../lib/api-service";
import type { Order } from "../../types";

interface DeletionStatus {
  exists: boolean;
  expiresAt?: string;
  scheduleName?: string;
  deleted?: boolean;
  deletedAt?: string;
}

export default function TestGalleryExpiry() {
  const { showToast } = useToast();
  const [galleryId, setGalleryId] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSettingExpiry, setIsSettingExpiry] = useState(false);
  const [expiryDate, setExpiryDate] = useState("");
  const [expiryTime, setExpiryTime] = useState("");
  const [deletionStatus, setDeletionStatus] = useState<DeletionStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [progress, setProgress] = useState({ step: "", message: "" });

  // Helper to download random image
  async function getRandomImage(width = 800, height = 600): Promise<Blob> {
    const imageId = Math.floor(Math.random() * 1000);
    const url = `https://picsum.photos/${width}/${height}?random=${imageId}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch image");
    return await response.blob();
  }

  // Upload image to S3
  async function uploadImage(
    galleryId: string,
    filename: string,
    blob: Blob,
    isOriginal: boolean
  ): Promise<void> {
    const key = isOriginal ? `originals/${filename}` : filename;
    const presignResponse = (await api.uploads.getPresignedUrl({
      galleryId,
      key,
      contentType: "image/jpeg",
      fileSize: blob.size,
    })) as { url: string; key?: string; expiresInSeconds?: number }; // Backend returns key but TypeScript type doesn't include it

    await fetch(presignResponse.url, {
      method: "PUT",
      body: blob,
      headers: { "Content-Type": "image/jpeg" },
    });

    // Complete upload - construct the full S3 key (backend returns galleries/{galleryId}/{key})
    // If presignResponse.key exists, use it; otherwise construct it
    const s3Key = presignResponse.key ?? `galleries/${galleryId}/${key}`;

    if (!s3Key) {
      const errorMsg = `Failed to get S3 key from presign response. Response: ${JSON.stringify(presignResponse)}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    if (!blob.size || blob.size === 0) {
      const errorMessage = `Invalid file size: ${blob.size}`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }

    await api.uploads.completeUpload(galleryId, {
      key: s3Key,
      fileSize: blob.size,
    });
  }

  // Upload final image
  async function uploadFinalImage(
    galleryId: string,
    orderId: string,
    filename: string,
    blob: Blob
  ): Promise<void> {
    const presignResponse = await api.uploads.getFinalImagePresignedUrl(galleryId, orderId, {
      key: filename,
      contentType: "image/jpeg",
    });

    await fetch(presignResponse.url, {
      method: "PUT",
      body: blob,
      headers: { "Content-Type": "image/jpeg" },
    });
  }

  const handleCreateGallery = async () => {
    if (isCreating) return;

    setIsCreating(true);
    setProgress({ step: "creating", message: "Tworzenie galerii..." });

    try {
      // Create gallery (non-selection mode so order is created automatically)
      const gallery = await api.galleries.create({
        galleryName: `Test Expiry Gallery ${new Date().toLocaleString()}`,
        selectionEnabled: false,
        pricingPackage: {
          includedCount: 10,
          extraPriceCents: 500,
          packagePriceCents: 5000,
        },
      });

      setGalleryId(gallery.galleryId);
      setProgress({ step: "uploading-originals", message: "Przesyłanie 2 zdjęć oryginalnych..." });

      // Upload 2 original images
      for (let i = 1; i <= 2; i++) {
        const imageBlob = await getRandomImage(1920, 1080);
        const filename = `original-${i}-${Date.now()}.jpg`;
        await uploadImage(gallery.galleryId, filename, imageBlob, true);
        setProgress({
          step: "uploading-originals",
          message: `Przesyłanie zdjęcia oryginalnego ${i}/2...`,
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Get orders for the gallery
      const ordersResponse = await api.orders.getByGallery(gallery.galleryId);
      const orders: Order[] = Array.isArray(ordersResponse)
        ? ordersResponse
        : (ordersResponse.items ?? []);
      const order = orders[0];

      if (!order?.orderId) {
        throw new Error("Order not found");
      }

      setOrderId(order.orderId);
      setProgress({ step: "uploading-finals", message: "Przesyłanie 2 zdjęć finalnych..." });

      // Upload 2 final images
      for (let i = 1; i <= 2; i++) {
        const imageBlob = await getRandomImage(1920, 1080);
        const filename = `final-${i}-${Date.now()}.jpg`;
        await uploadFinalImage(gallery.galleryId, order.orderId, filename, imageBlob);
        setProgress({
          step: "uploading-finals",
          message: `Przesyłanie zdjęcia finalnego ${i}/2...`,
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Mark final upload as complete (optional - not critical for expiry testing)
      try {
        const ordersApi = api.orders as {
          markFinalUploadComplete?: (galleryId: string, orderId: string) => Promise<unknown>;
        };
        if (ordersApi.markFinalUploadComplete) {
          await ordersApi.markFinalUploadComplete(gallery.galleryId, order.orderId);
        }
      } catch (finalErr) {
        console.warn("Failed to mark final upload complete (non-critical):", finalErr);
      }

      setProgress({ step: "done", message: "Galerie utworzona pomyślnie!" });
      showToast(
        "success",
        "Sukces",
        "Galerie testowa utworzona z 2 zdjęciami oryginalnymi i 2 finalnymi!"
      );
    } catch (error) {
      showToast("error", "Błąd", `Nie udało się utworzyć galerii: ${String(error)}`);
      console.error("Failed to create gallery:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleSetExpiry = async () => {
    if (!galleryId || !expiryDate || !expiryTime || isSettingExpiry) return;

    setIsSettingExpiry(true);
    try {
      const expiresAt = new Date(`${expiryDate}T${expiryTime}`).toISOString();
      const result = await api.galleries.setExpiry(galleryId, expiresAt);

      showToast(
        "success",
        "Sukces",
        `Data wygaśnięcia ustawiona: ${new Date(expiresAt).toLocaleString()}`
      );
      setDeletionStatus({
        exists: true,
        expiresAt: result.expiresAt,
        scheduleName: result.scheduleName,
      });

      // Start polling for deletion status
      setIsPolling(true);
    } catch (error: unknown) {
      let errorMessage = "Nieznany błąd";
      const errorObj = error as {
        body?: { error?: string; message?: string };
        message?: string;
      };
      if (errorObj?.body?.error === "Missing required environment variables") {
        errorMessage =
          "Brak wymaganych zmiennych środowiskowych. Upewnij się, że infrastruktura została wdrożona z najnowszym kodem.";
      } else if (errorObj?.body?.message) {
        errorMessage = errorObj.body.message;
      } else if (errorObj?.message) {
        errorMessage = errorObj.message;
      } else {
        errorMessage = String(error);
      }
      showToast("error", "Błąd", `Nie udało się ustawić daty wygaśnięcia: ${errorMessage}`);
      console.error("Failed to set expiry:", error);
    } finally {
      setIsSettingExpiry(false);
    }
  };

  // Poll for deletion status
  useEffect(() => {
    if (!isPolling || !galleryId) return;

    const pollInterval = setInterval(async () => {
      try {
        const gallery = await api.galleries.get(galleryId);
        if (!gallery) {
          // Gallery deleted
          setDeletionStatus((prev) => ({
            exists: prev?.exists ?? true,
            expiresAt: prev?.expiresAt,
            scheduleName: prev?.scheduleName,
            deleted: true,
            deletedAt: new Date().toISOString(),
          }));
          setIsPolling(false);
          showToast("success", "Sukces", "Galerie została usunięta!");
        } else {
          // Update status
          const galleryWithExpiry = gallery as {
            expiresAt?: string;
            expiryScheduleName?: string;
          };
          setDeletionStatus({
            exists: true,
            expiresAt: galleryWithExpiry.expiresAt,
            scheduleName: galleryWithExpiry.expiryScheduleName,
            deleted: false,
          });
        }
      } catch (error: unknown) {
        const errorWithStatus = error as { status?: number };
        if (errorWithStatus.status === 404) {
          // Gallery deleted
          setDeletionStatus((prev) => ({
            exists: prev?.exists ?? true,
            expiresAt: prev?.expiresAt,
            scheduleName: prev?.scheduleName,
            deleted: true,
            deletedAt: new Date().toISOString(),
          }));
          setIsPolling(false);
          showToast("success", "Sukces", "Galerie została usunięta!");
        } else {
          console.error("Failed to poll gallery status:", error);
        }
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, [isPolling, galleryId, showToast]);

  // Set default expiry to 2 minutes from now
  useEffect(() => {
    const now = new Date();
    const twoMinutesFromNow = new Date(now.getTime() + 2 * 60 * 1000);
    setExpiryDate(twoMinutesFromNow.toISOString().split("T")[0]);
    setExpiryTime(twoMinutesFromNow.toTimeString().slice(0, 5));
  }, []);

  return (
    <div className="min-h-screen bg-photographer-background dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
            Test wygaśnięcia galerii
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Utwórz galerię testową z 2 zdjęciami oryginalnymi i 2 finalnymi, ustaw datę wygaśnięcia
            i śledź proces usuwania.
          </p>
        </div>

        {/* Create Gallery Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Krok 1: Utwórz galerię testową
          </h2>
          {!galleryId ? (
            <div>
              <button
                onClick={handleCreateGallery}
                disabled={isCreating}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Tworzenie...</span>
                  </>
                ) : (
                  <>
                    <ImageIcon className="w-5 h-5" />
                    <span>Utwórz galerię z 2 oryginalnymi i 2 finalnymi zdjęciami</span>
                  </>
                )}
              </button>
              {isCreating && progress.message && (
                <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">{progress.message}</p>
              )}
            </div>
          ) : (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-semibold">Galerie utworzona!</span>
              </div>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                ID galerii: <code className="font-mono">{galleryId}</code>
              </p>
              {orderId && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  ID zamówienia: <code className="font-mono">{orderId}</code>
                </p>
              )}
            </div>
          )}
        </div>

        {/* Set Expiry Section */}
        {galleryId && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Krok 2: Ustaw datę i godzinę wygaśnięcia
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Data wygaśnięcia
                  </label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    disabled={isSettingExpiry}
                    className="w-full px-4 py-2 border border-gray-400 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Godzina wygaśnięcia
                  </label>
                  <input
                    type="time"
                    value={expiryTime}
                    onChange={(e) => setExpiryTime(e.target.value)}
                    disabled={isSettingExpiry}
                    className="w-full px-4 py-2 border border-gray-400 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              <button
                onClick={handleSetExpiry}
                disabled={isSettingExpiry || !expiryDate || !expiryTime}
                className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isSettingExpiry ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Ustawianie...</span>
                  </>
                ) : (
                  <>
                    <Calendar className="w-5 h-5" />
                    <span>Ustaw datę wygaśnięcia</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Deletion Status Section */}
        {deletionStatus && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Krok 3: Status usuwania
            </h2>
            <div className="space-y-4">
              {deletionStatus.deleted ? (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
                    <XCircle className="w-5 h-5" />
                    <span className="font-semibold">Galerie została usunięta</span>
                  </div>
                  {deletionStatus.deletedAt && (
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                      Usunięta: {new Date(deletionStatus.deletedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                    <Clock className="w-5 h-5" />
                    <span className="font-semibold">Oczekiwanie na wygaśnięcie</span>
                    {isPolling && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
                  </div>
                  {deletionStatus.expiresAt && (
                    <div className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                      <p>
                        Data wygaśnięcia:{" "}
                        <span className="font-mono">
                          {new Date(deletionStatus.expiresAt).toLocaleString()}
                        </span>
                      </p>
                      <p>
                        Pozostało:{" "}
                        <span className="font-mono">
                          {Math.max(
                            0,
                            Math.round(
                              (new Date(deletionStatus.expiresAt).getTime() - Date.now()) / 1000
                            )
                          )}{" "}
                          sekund
                        </span>
                      </p>
                      {deletionStatus.scheduleName && (
                        <p>
                          Nazwa harmonogramu:{" "}
                          <code className="font-mono text-xs">{deletionStatus.scheduleName}</code>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Info Section */}
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>Uwaga:</strong> Ta strona tworzy galerię testową z 2 zdjęciami oryginalnymi i 2
            finalnymi. Po ustawieniu daty wygaśnięcia, system będzie sprawdzał status co 5 sekund
            (nie w czasie rzeczywistym). Galeria zostanie automatycznie usunięta przez EventBridge
            Scheduler w określonym czasie.
          </p>
        </div>
      </div>
    </div>
  );
}
