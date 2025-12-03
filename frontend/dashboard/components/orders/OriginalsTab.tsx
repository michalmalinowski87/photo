import { ImageFallbackUrls } from "../../lib/image-fallback";
import { LazyRetryableImage } from "../ui/LazyRetryableImage";

interface GalleryImage {
  id?: string;
  key?: string;
  filename?: string;
  url?: string;
  thumbUrl?: string;
  thumbUrlFallback?: string;
  previewUrl?: string;
  previewUrlFallback?: string;
  bigThumbUrl?: string;
  bigThumbUrlFallback?: string;
  [key: string]: unknown;
}

interface OriginalsTabProps {
  images: GalleryImage[];
  selectedKeys: string[];
  selectionEnabled: boolean;
  deliveryStatus?: string;
}

export function OriginalsTab({
  images,
  selectedKeys,
  selectionEnabled,
  deliveryStatus,
}: OriginalsTabProps) {
  const shouldShowAllImages = !selectionEnabled;

  // Helper to render image grid
  const renderImageGrid = (imagesToRender: GalleryImage[], highlightSelected = false) => (
    <div className="grid grid-cols-4 gap-4">
      {imagesToRender.map((img, idx) => {
        const imgKey = img.key ?? img.filename ?? img.id ?? `img-${idx}`;
        return (
          <div
            key={imgKey ?? idx}
            className={`relative ${
              highlightSelected
                ? "border-2 border-brand-500 ring-2 ring-brand-200"
                : "border border-gray-200 dark:border-gray-700"
            } rounded-lg overflow-hidden`}
          >
            <LazyRetryableImage
              imageData={img as ImageFallbackUrls}
              alt={imgKey}
              className="w-full h-48 object-cover"
              preferredSize="thumb"
            />
          </div>
        );
      })}
    </div>
  );

  // Non-selection gallery: show all images
  if (shouldShowAllImages) {
    if (images.length === 0) {
      return (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          <p>Ładowanie zdjęć...</p>
        </div>
      );
    }
    return <div className="space-y-4">{renderImageGrid(images)}</div>;
  }

  // Selection gallery but no selectedKeys yet
  if (selectedKeys.length === 0) {
    // If order has a delivery status that suggests photos should exist, show all images as fallback
    const shouldShowFallback =
      (deliveryStatus === "CLIENT_APPROVED" ||
        deliveryStatus === "AWAITING_FINAL_PHOTOS" ||
        deliveryStatus === "PREPARING_DELIVERY" ||
        deliveryStatus === "DELIVERED") &&
      images.length > 0;

    if (shouldShowFallback) {
      return (
        <div className="space-y-2">
          <div className="p-2 bg-info-50 border border-info-200 rounded-lg dark:bg-info-500/10 dark:border-info-500/20">
            <p className="text-xs text-info-800 dark:text-info-200">
              Uwaga: Zlecenie nie ma zapisanych wybranych kluczy. Wyświetlane są wszystkie zdjęcia.
            </p>
          </div>
          {renderImageGrid(images)}
        </div>
      );
    }

    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        <p>Klient nie wybrał jeszcze żadnych zdjęć.</p>
        {deliveryStatus && deliveryStatus !== "CLIENT_SELECTING" && (
          <p className="mt-2 text-xs text-gray-400">Status zlecenia: {deliveryStatus}</p>
        )}
      </div>
    );
  }

  // Selection gallery with selectedKeys: show filtered images
  const normalizedSelectedKeys = selectedKeys.map((k) => k.toString().trim());
  const filteredImages = images.filter((img) => {
    const imgKey = (img.key ?? img.filename ?? img.id ?? "").toString().trim();
    return normalizedSelectedKeys.includes(imgKey);
  });

  if (images.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        <p>Ładowanie zdjęć...</p>
      </div>
    );
  }

  if (filteredImages.length === 0) {
    return (
      <div className="p-4 bg-warning-50 border border-warning-200 rounded-lg dark:bg-warning-500/10 dark:border-warning-500/20">
        <p className="text-sm text-warning-800 dark:text-warning-200">
          Nie znaleziono zdjęć pasujących do wybranych kluczy. Wybrane klucze:{" "}
          {selectedKeys.slice(0, 5).join(", ")}
          {selectedKeys.length > 5 ? "..." : ""}
        </p>
        <p className="text-xs text-warning-600 dark:text-warning-400 mt-1">
          Dostępne zdjęcia: {images.length} | Wybrane klucze: {selectedKeys.length}
        </p>
      </div>
    );
  }

  return <div className="space-y-4">{renderImageGrid(filteredImages, true)}</div>;
}
