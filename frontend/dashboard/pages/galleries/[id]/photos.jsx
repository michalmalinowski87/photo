import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { apiFetch, formatApiError } from "../../../lib/api";
import { initializeAuth, redirectToLandingSignIn } from "../../../lib/auth-init";
import { useGallery } from "../../../context/GalleryContext";
import Button from "../../../components/ui/button/Button";
import { FullPageLoading, Loading } from "../../../components/ui/loading/Loading";
import { useToast } from "../../../hooks/useToast";

export default function GalleryPhotos() {
  const router = useRouter();
  const { id: galleryId } = router.query;
  const { showToast } = useToast();
  const { gallery, loading: galleryLoading } = useGallery();
  const [apiUrl, setApiUrl] = useState("");
  const [idToken, setIdToken] = useState("");
  const [loading, setLoading] = useState(true); // Start with true to prevent flicker
  const [error, setError] = useState("");
  const [images, setImages] = useState([]);

  useEffect(() => {
    setApiUrl(process.env.NEXT_PUBLIC_API_URL || "");
    if (router.isReady && galleryId) {
      initializeAuth(
        (token) => {
          setIdToken(token);
        },
        () => {
          redirectToLandingSignIn(`/galleries/${galleryId}/photos`);
        }
      );
    }
  }, [router.isReady, galleryId]);

  useEffect(() => {
    if (router.isReady && apiUrl && idToken && galleryId) {
      loadPhotos();
    }
  }, [router.isReady, apiUrl, idToken, galleryId]);

  const loadPhotos = async () => {
    if (!apiUrl || !idToken || !galleryId) return;
    
    setLoading(true);
    setError("");
    
    try {
      const photosResponse = await apiFetch(`${apiUrl}/galleries/${galleryId}/images`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      
      // The photos API returns { images, count, galleryId }
      setImages(photosResponse.data.images || []);
    } catch (err) {
      console.error("Error loading photos:", err);
      const errorMsg = formatApiError(err);
      setError(errorMsg);
      showToast("error", "Błąd", errorMsg || "Nie udało się załadować zdjęć");
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePhoto = async (filename) => {
    if (!apiUrl || !idToken || !galleryId) return;
    
    if (!confirm(`Czy na pewno chcesz usunąć zdjęcie "${filename}"?`)) {
      return;
    }
    
    try {
      await apiFetch(`${apiUrl}/galleries/${galleryId}/photos/${encodeURIComponent(filename)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      
      showToast("success", "Sukces", "Zdjęcie zostało usunięte");
      await loadPhotos();
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    }
  };

  // Gallery data comes from GalleryContext (provided by GalleryLayoutWrapper)
  if (galleryLoading) {
    return <FullPageLoading text="Ładowanie galerii..." />;
  }

  if (!gallery) {
    return null; // Error is handled by GalleryLayoutWrapper
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Zdjęcia w galerii
          </h1>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {loading ? (
              <Loading size="sm" />
            ) : (
              <>
                {images.length} {images.length === 1 ? "zdjęcie" : images.length < 5 ? "zdjęcia" : "zdjęć"}
              </>
            )}
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
            <Loading size="lg" text="Ładowanie zdjęć..." />
          </div>
        ) : images.length === 0 ? (
          <div className="p-12 text-center bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
            <p className="text-gray-500 dark:text-gray-400">
              Brak zdjęć w galerii. Prześlij zdjęcia aby rozpocząć.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {images.map((img, idx) => (
              <div
                key={idx}
                className="relative group border border-gray-200 rounded-lg overflow-hidden bg-white dark:bg-gray-800 dark:border-gray-700"
              >
                <div className="aspect-square relative">
                  <img
                    src={img.thumbUrl || img.previewUrl || img.url}
                    alt={img.key || img.filename}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity flex items-center justify-center">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeletePhoto(img.key || img.filename)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Usuń
                    </Button>
                  </div>
                </div>
                <div className="p-2">
                  <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                    {img.key || img.filename}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

