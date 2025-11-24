import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { apiFetch, formatApiError } from "../../../../lib/api";
import { getIdToken } from "../../../../lib/auth";
import { initializeAuth, redirectToLandingSignIn } from "../../../../lib/auth-init";
import Button from "../../../../components/ui/button/Button";
import Badge from "../../../../components/ui/badge/Badge";
import { Modal } from "../../../../components/ui/modal";
import Input from "../../../../components/ui/input/InputField";
import { FullPageLoading } from "../../../../components/ui/loading/Loading";
import { useToast } from "../../../../hooks/useToast";

export default function OrderDetail() {
  const { showToast } = useToast();
  const router = useRouter();
  const { id: galleryId, orderId } = router.query;
  const [apiUrl, setApiUrl] = useState("");
  const [idToken, setIdToken] = useState("");
  const [loading, setLoading] = useState(true); // Start with true to prevent flicker
  const [error, setError] = useState("");
  const [order, setOrder] = useState(null);
  const [gallery, setGallery] = useState(null);
  const [activeTab, setActiveTab] = useState("originals");
  const [originalImages, setOriginalImages] = useState([]);
  const [finalImages, setFinalImages] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [imageToDelete, setImageToDelete] = useState(null);

  useEffect(() => {
    setApiUrl(process.env.NEXT_PUBLIC_API_URL || "");
    initializeAuth(
      (token) => {
        setIdToken(token);
      },
      () => {
        redirectToLandingSignIn(`/galleries/${galleryId}/orders/${orderId}`);
      }
    );
  }, [galleryId, orderId]);

  useEffect(() => {
    if (apiUrl && idToken && galleryId && orderId) {
      loadOrderData();
    }
  }, [apiUrl, idToken, galleryId, orderId]);

  const loadOrderData = async () => {
    if (!apiUrl || !idToken || !galleryId || !orderId) return;
    
    setLoading(true);
    setError("");
    
    try {
      const [orderResponse, galleryResponse, imagesResponse] = await Promise.all([
        apiFetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
        apiFetch(`${apiUrl}/galleries/${galleryId}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
        apiFetch(`${apiUrl}/galleries/${galleryId}/images`, {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
      ]);
      
      const orderData = orderResponse.data;
      setOrder(orderData);
      setGallery(galleryResponse.data);
      
      // Load original images
      const imagesData = imagesResponse.data;
      setOriginalImages(imagesData.images || []);
      
      // Load final images if order is delivered or preparing delivery
      if (
        orderData.deliveryStatus === "DELIVERED" ||
        orderData.deliveryStatus === "PREPARING_FOR_DELIVERY"
      ) {
        try {
          const finalResponse = await apiFetch(
            `${apiUrl}/galleries/${galleryId}/orders/${orderId}/final/images`,
            {
              headers: { Authorization: `Bearer ${idToken}` },
            }
          );
          setFinalImages(finalResponse.data.images || []);
        } catch (err) {
          // Final images might not exist yet
          setFinalImages([]);
        }
      }
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleUploadFinals = async () => {
    if (!apiUrl || !idToken || !galleryId || !orderId || selectedFiles.length === 0) return;
    
    setUploading(true);
    setError("");
    
    try {
      // Get presigned URLs for each file
      const uploadPromises = selectedFiles.map(async (file) => {
        const key = `galleries/${galleryId}/final/${orderId}/${file.name}`;
        const presignResponse = await apiFetch(`${apiUrl}/uploads/presign`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            galleryId,
            key,
            contentType: file.type || "image/jpeg",
            fileSize: file.size,
          }),
        });
        
        // Upload file
        await fetch(presignResponse.data.url, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type || "image/jpeg",
          },
        });
      });
      
      await Promise.all(uploadPromises);
      
      // Reload final images
      await loadOrderData();
      setSelectedFiles([]);
      
      // Show success message
      showToast("success", "Sukces", "Zdjęcia zostały przesłane");
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFinal = async (filename) => {
    if (!apiUrl || !idToken || !galleryId || !orderId) return;
    
    try {
      await apiFetch(
        `${apiUrl}/galleries/${galleryId}/orders/${orderId}/final/images/${encodeURIComponent(filename)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${idToken}` },
        }
      );
      
      await loadOrderData();
      setShowDeleteModal(false);
      setImageToDelete(null);
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  const handleDownloadZip = async () => {
    if (!apiUrl || !idToken || !galleryId || !orderId) return;
    
    try {
      // Check if ZIP exists, if not generate it
      if (!order.zipKey) {
        await apiFetch(
          `${apiUrl}/galleries/${galleryId}/orders/${orderId}/generate-zip`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${idToken}` },
          }
        );
        // Reload order to get zipKey
        await loadOrderData();
      }
      
      // Download ZIP
      const zipUrl = `${apiUrl}/galleries/${galleryId}/orders/${orderId}/zip`;
      const response = await fetch(zipUrl, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${orderId}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        throw new Error("Nie udało się pobrać pliku ZIP");
      }
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  const getDeliveryStatusBadge = (status) => {
    const statusMap = {
      CLIENT_SELECTING: { color: "info", label: "Wybór przez klienta" },
      CLIENT_APPROVED: { color: "success", label: "Zatwierdzone" },
      AWAITING_FINAL_PHOTOS: { color: "warning", label: "Oczekuje na finały" },
      CHANGES_REQUESTED: { color: "warning", label: "Prośba o zmiany" },
      PREPARING_FOR_DELIVERY: { color: "info", label: "Gotowe do wysyłki" },
      DELIVERED: { color: "success", label: "Dostarczone" },
      CANCELLED: { color: "error", label: "Anulowane" },
    };
    
    const statusInfo = statusMap[status] || { color: "light", label: status };
    return (
      <Badge color={statusInfo.color} variant="light">
        {statusInfo.label}
      </Badge>
    );
  };

  const getPaymentStatusBadge = (status) => {
    const statusMap = {
      UNPAID: { color: "error", label: "Nieopłacone" },
      PARTIALLY_PAID: { color: "warning", label: "Częściowo opłacone" },
      PAID: { color: "success", label: "Opłacone" },
      REFUNDED: { color: "error", label: "Zwrócone" },
    };
    
    const statusInfo = statusMap[status] || { color: "light", label: status };
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
          {error || "Nie znaleziono zlecenia"}
        </div>
      </div>
    );
  }

  const selectedKeys = order.selectedKeys || [];
  const canUploadFinals =
    order.deliveryStatus === "CLIENT_APPROVED" ||
    order.deliveryStatus === "PREPARING_FOR_DELIVERY" ||
    order.deliveryStatus === "DELIVERED";
  const canDownloadZip = order.zipKey || canUploadFinals;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/galleries/${galleryId}`}>
            <Button variant="outline" size="sm">
              ← Powrót do galerii
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mt-4">
            Zlecenie #{order.orderNumber || (order.orderId ? order.orderId.slice(-8) : orderId)}
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

      {/* Order Info */}
      <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Kwota</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {((order.totalCents || 0) / 100).toFixed(2)} PLN
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Data utworzenia</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {order.createdAt
                ? new Date(order.createdAt).toLocaleDateString("pl-PL")
                : "-"}
            </div>
          </div>
          {order.selectedKeys && (
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Wybrane zdjęcia
              </div>
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                {selectedKeys.length} zdjęć
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
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
            Oryginały ({originalImages.length})
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

      {/* Tab Content */}
      {activeTab === "originals" && (
        <div className="space-y-4">
          <div className="p-4 bg-info-50 border border-info-200 rounded-lg">
            <p className="text-sm text-info-800 dark:text-info-200">
              <strong>Wybrane zdjęcia przez klienta:</strong> {selectedKeys.length} z{" "}
              {originalImages.length}
            </p>
            {selectedKeys.length > 0 && (
              <div className="mt-2 text-xs text-info-600 dark:text-info-400">
                Klucze: {selectedKeys.slice(0, 5).join(", ")}
                {selectedKeys.length > 5 && "..."}
              </div>
            )}
          </div>

          <div className="grid grid-cols-4 gap-4">
            {originalImages.map((img, idx) => {
              const isSelected = selectedKeys.includes(img.key);
              return (
                <div
                  key={idx}
                  className={`relative border-2 rounded-lg overflow-hidden ${
                    isSelected
                      ? "border-brand-500 ring-2 ring-brand-200"
                      : "border-gray-200 dark:border-gray-700"
                  }`}
                >
                  <img
                    src={img.url}
                    alt={img.key}
                    className="w-full h-48 object-cover"
                  />
                  {isSelected && (
                    <div className="absolute top-2 right-2">
                      <Badge color="success" variant="solid">
                        Wybrane
                      </Badge>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "finals" && (
        <div className="space-y-4">
          {canUploadFinals && (
            <div className="p-4 bg-white border border-gray-200 rounded-lg dark:bg-gray-800 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                Prześlij zdjęcia finalne
              </h3>
              <div className="flex gap-3">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="flex-1"
                />
                <Button
                  variant="primary"
                  onClick={handleUploadFinals}
                  disabled={selectedFiles.length === 0 || uploading}
                >
                  {uploading ? "Przesyłanie..." : "Prześlij"}
                </Button>
              </div>
              {selectedFiles.length > 0 && (
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Wybrano {selectedFiles.length} plików
                </p>
              )}
            </div>
          )}

          {finalImages.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              Brak zdjęć finalnych
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-4">
              {finalImages.map((img, idx) => (
                <div
                  key={idx}
                  className="relative border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                >
                  <img
                    src={img.url}
                    alt={img.key}
                    className="w-full h-48 object-cover"
                  />
                  {canUploadFinals && (
                    <div className="absolute top-2 right-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setImageToDelete(img.key);
                          setShowDeleteModal(true);
                        }}
                      >
                        Usuń
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {canDownloadZip && (
          <Button variant="primary" onClick={handleDownloadZip}>
            Pobierz ZIP
          </Button>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setImageToDelete(null);
        }}
      >
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Usuń zdjęcie
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Czy na pewno chcesz usunąć to zdjęcie? Ta operacja jest nieodwracalna.
          </p>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteModal(false);
                setImageToDelete(null);
              }}
            >
              Anuluj
            </Button>
            <Button
              variant="primary"
              onClick={() => imageToDelete && handleDeleteFinal(imageToDelete)}
            >
              Usuń
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

