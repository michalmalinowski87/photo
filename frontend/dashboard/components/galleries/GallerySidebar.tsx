import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Button from "../ui/button/Button";
import { apiFetch, formatApiError } from "../../lib/api";
import { getIdToken } from "../../lib/auth";
import { useToast } from "../../hooks/useToast";

interface GallerySidebarProps {
  gallery: any;
  isPaid: boolean;
  galleryUrl: string;
  onPay: () => void;
  onCopyUrl: () => void;
  onSendLink: () => void;
  onSettings: () => void;
}

export default function GallerySidebar({
  gallery,
  isPaid,
  galleryUrl,
  onPay,
  onCopyUrl,
  onSendLink,
  onSettings,
}: GallerySidebarProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [coverPhotoUrl, setCoverPhotoUrl] = useState(gallery?.coverPhotoUrl || null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  // Update cover photo URL when gallery prop changes
  useEffect(() => {
    if (gallery?.coverPhotoUrl) {
      setCoverPhotoUrl(gallery.coverPhotoUrl);
    }
  }, [gallery?.coverPhotoUrl]);

  const handleBack = () => {
    if (typeof window !== "undefined" && gallery?.galleryId) {
      const referrerKey = `gallery_referrer_${gallery.galleryId}`;
      const referrerPath = sessionStorage.getItem(referrerKey);
      
      if (referrerPath) {
        router.push(referrerPath);
      } else {
        router.push("/");
      }
    } else {
      router.push("/");
    }
  };

  const handleCoverPhotoUpload = async (file) => {
    if (!file || !gallery?.galleryId) return;
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showToast("error", "Błąd", "Plik jest za duży. Maksymalny rozmiar to 5MB.");
      return;
    }
    
    setUploadingCover(true);
    
    try {
      const idToken = await getIdToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
      
      // Get presigned URL - key should be relative to galleries/{galleryId}/
      const key = `cover.jpg`;
      const presignResponse = await apiFetch(`${apiUrl}/uploads/presign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          galleryId: gallery.galleryId,
          key,
          contentType: file.type || "image/jpeg",
          fileSize: file.size,
        }),
      });
      
      // Upload file to S3
      await fetch(presignResponse.data.url, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type || "image/jpeg",
        },
      });
      
      // Build CloudFront URL for the cover photo
      const cloudfrontDomain = process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN;
      const fullKey = presignResponse.data.key; // This is galleries/{galleryId}/cover.jpg
      const newCoverUrl = cloudfrontDomain 
        ? `https://${cloudfrontDomain}/${fullKey.split('/').map(encodeURIComponent).join('/')}`
        : presignResponse.data.url.split('?')[0];
      
      // Update gallery in backend (if there's an endpoint for this)
      try {
        await apiFetch(`${apiUrl}/galleries/${gallery.galleryId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            coverPhotoUrl: newCoverUrl,
          }),
        });
      } catch (err) {
        // If update endpoint doesn't exist, that's okay - we'll just use the URL
        console.warn("Could not update gallery cover photo URL:", err);
      }
      
      setCoverPhotoUrl(newCoverUrl);
      showToast("success", "Sukces", "Okładka galerii została przesłana");
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err) || "Nie udało się przesłać okładki");
    } finally {
      setUploadingCover(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleCoverPhotoUpload(file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleCoverPhotoUpload(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
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
      <div className="py-6 border-b border-gray-200 dark:border-gray-800">
        <Link
          href={`/galleries/${gallery?.galleryId}`}
          className="text-lg font-semibold text-gray-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 transition-colors cursor-pointer"
        >
          {gallery?.galleryName || "Galeria"}
        </Link>
      </div>

      {/* Cover Photo Section */}
      <div className="py-4 border-b border-gray-200 dark:border-gray-800">
        <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">Okładka galerii</div>
        <div
          className={`relative w-full h-48 rounded-lg border-2 border-dashed transition-colors ${
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
              <img
                src={coverPhotoUrl}
                alt="Okładka galerii"
                className="w-full h-full object-cover rounded-lg"
              />
              <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-50 transition-opacity rounded-lg flex items-center justify-center group">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-sm font-medium">
                  {uploadingCover ? "Przesyłanie..." : "Kliknij aby zmienić"}
                </div>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center cursor-pointer">
              {uploadingCover ? (
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Przesyłanie...
                </div>
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

      {/* Share Button */}
      {isPaid && gallery?.selectionEnabled && gallery?.clientEmail && (
        <div className="py-4 border-b border-gray-200 dark:border-gray-800">
          <Button
            variant="primary"
            onClick={onSendLink}
            className="w-full"
            startIcon={
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 2V14M2 8H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            }
          >
            Udostępnij klientowi
          </Button>
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
              <span className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ease-in-out ${
                urlCopied ? "opacity-0 scale-90" : "opacity-100 scale-100"
              }`}>
                Kopiuj URL
              </span>
              <span className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ease-in-out ${
                urlCopied ? "opacity-100 scale-100" : "opacity-0 scale-90"
              }`}>
                Skopiowano URL
              </span>
            </span>
          </Button>
        </div>
      )}

      {/* Creation Date */}
      <div className="py-4 border-b border-gray-200 dark:border-gray-800">
        <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Utworzono:</div>
        <div className="text-sm text-gray-900 dark:text-white">
          {gallery?.createdAt
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

      {/* Expiry Date */}
      <div className="py-4 border-b border-gray-200 dark:border-gray-800">
        <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Ważna do:</div>
        <div className="text-sm text-gray-900 dark:text-white">
          {(() => {
            if (!gallery) return "-";
            
            let expiryDate = null;
            
            if (!isPaid) {
              // UNPAID draft: 3 days from creation (TTL expiry)
              if (gallery.ttlExpiresAt) {
                expiryDate = new Date(gallery.ttlExpiresAt);
              } else if (gallery.ttl) {
                // TTL is in Unix epoch seconds
                expiryDate = new Date(gallery.ttl * 1000);
              } else if (gallery.createdAt) {
                // Fallback: calculate 3 days from creation
                expiryDate = new Date(new Date(gallery.createdAt).getTime() + 3 * 24 * 60 * 60 * 1000);
              }
            } else {
              // PAID: use expiresAt from plan
              if (gallery.expiresAt) {
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
              });
            }
            
            return "-";
          })()}
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1">
          <li>
            <Link
              href={`/galleries/${gallery?.galleryId}`}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                router.pathname === `/galleries/[id]` && !router.asPath.includes('/photos') && !router.asPath.includes('/settings')
                  ? "bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400"
                  : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
              }`}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 4C3 2.89543 3.89543 2 5 2H15C16.1046 2 17 2.89543 17 4V16C17 17.1046 16.1046 18 15 18H5C3.89543 18 3 17.1046 3 16V4ZM5 4V16H15V4H5ZM6 6H14V8H6V6ZM6 10H14V12H6V10ZM6 14H11V16H6V14Z" fill="currentColor"/>
              </svg>
              <span>Zlecenia</span>
            </Link>
          </li>
          <li>
            <Link
              href={`/galleries/${gallery?.galleryId}/photos`}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                router.pathname === `/galleries/[id]/photos`
                  ? "bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400"
                  : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
              }`}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 3C2.89543 3 2 3.89543 2 5V15C2 16.1046 2.89543 17 4 17H16C17.1046 17 18 16.1046 18 15V5C18 3.89543 17.1046 3 16 3H4ZM4 5H16V15H4V5ZM6 7C5.44772 7 5 7.44772 5 8C5 8.55228 5.44772 9 6 9C6.55228 9 7 8.55228 7 8C7 7.44772 6.55228 7 6 7ZM8 11L10.5 8.5L13 11L15 9V13H5V9L8 11Z" fill="currentColor"/>
              </svg>
              <span>Zdjęcia</span>
            </Link>
          </li>
          <li>
            <Link
              href={`/galleries/${gallery?.galleryId}/settings`}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                router.pathname === `/galleries/[id]/settings`
                  ? "bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400"
                  : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
              }`}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 12C11.1046 12 12 11.1046 12 10C12 8.89543 11.1046 8 10 8C8.89543 8 8 8.89543 8 10C8 11.1046 8.89543 12 10 12Z" fill="currentColor"/>
                <path fillRule="evenodd" clipRule="evenodd" d="M10 2C5.58172 2 2 5.58172 2 10C2 14.4183 5.58172 18 10 18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2ZM10 4C13.3137 4 16 6.68629 16 10C16 13.3137 13.3137 16 10 16C6.68629 16 4 13.3137 4 10C4 6.68629 6.68629 4 10 4ZM10 6C8.89543 6 8 6.89543 8 8C8 9.10457 8.89543 10 10 10C11.1046 10 12 9.10457 12 8C12 6.89543 11.1046 6 10 6Z" fill="currentColor"/>
              </svg>
              <span>Ustawienia</span>
            </Link>
          </li>
        </ul>
      </nav>

      {/* UNPAID Banner */}
      {!isPaid && (
        <div className="mt-auto p-4 border-t border-gray-200 dark:border-gray-800">
          <div className="p-3 bg-error-50 border border-error-200 rounded-lg dark:bg-error-500/10 dark:border-error-500/20">
            <div className="text-sm font-medium text-error-800 dark:text-error-200 mb-1">
              Galeria nieopłacona
            </div>
            <div className="text-xs text-error-600 dark:text-error-400 mb-3">
              Galeria wygaśnie za 3 dni jeśli nie zostanie opłacona.
            </div>
            <Button
              size="sm"
              variant="primary"
              onClick={onPay}
              className="w-full"
            >
              Opłać galerię
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}

