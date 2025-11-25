import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { apiFetch, formatApiError } from "../../../../lib/api";
import { getIdToken } from "../../../../lib/auth";
import { initializeAuth, redirectToLandingSignIn } from "../../../../lib/auth-init";
import Button from "../../../../components/ui/button/Button";
import Badge from "../../../../components/ui/badge/Badge";
import { Modal } from "../../../../components/ui/modal";
import { ConfirmDialog } from "../../../../components/ui/confirm/ConfirmDialog";
import { DenyChangeRequestModal } from "../../../../components/orders/DenyChangeRequestModal";
import Input from "../../../../components/ui/input/InputField";
import { FullPageLoading, Loading } from "../../../../components/ui/loading/Loading";
import { useToast } from "../../../../hooks/useToast";
import { formatCurrencyInput, plnToCents, centsToPlnString } from "../../../../lib/currency";
import PaymentConfirmationModal from "../../../../components/galleries/PaymentConfirmationModal";
import { useGallery } from "../../../../context/GalleryContext";
import { useZipDownload } from "../../../../context/ZipDownloadContext";

// Component that retries loading an image until it's available on CloudFront
const RetryableImage = ({ src, alt, className, maxRetries = 30, initialDelay = 500 }) => {
  const [imageSrc, setImageSrc] = useState(src);
  const [retryCount, setRetryCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const retryTimeoutRef = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    // Reset when src changes
    setImageSrc(src);
    setRetryCount(0);
    setIsLoading(true);
    setHasLoaded(false);
    
    // Clear any pending retry
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    
    // Force image reload by clearing and setting src
    if (imgRef.current && src) {
      // Clear current src to force reload
      imgRef.current.src = '';
      // Use setTimeout to ensure the src is cleared before setting new one
      setTimeout(() => {
        if (imgRef.current && src) {
          imgRef.current.src = src;
        }
      }, 0);
    }
  }, [src]);

  const handleError = () => {
    setRetryCount(currentRetryCount => {
      const nextRetryCount = currentRetryCount + 1;
      
      if (currentRetryCount < maxRetries) {
        setIsLoading(true);
        setHasLoaded(false);
        
        // Exponential backoff: start with initialDelay, increase gradually
        const delay = Math.min(initialDelay * Math.pow(1.2, currentRetryCount), 5000);
        
        retryTimeoutRef.current = setTimeout(() => {
          // Add cache-busting query parameter
          const separator = src.includes('?') ? '&' : '?';
          const retryUrl = `${src}${separator}_t=${Date.now()}&_r=${nextRetryCount}`;
          
          setImageSrc(retryUrl);
          
          // Force reload the image
          if (imgRef.current) {
            imgRef.current.src = retryUrl;
          }
        }, delay);
        
        return nextRetryCount;
      } else {
        setIsLoading(false);
        setHasLoaded(false);
        return currentRetryCount;
      }
    });
  };

  const handleLoad = () => {
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
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
          <Loading size="sm" />
        </div>
      )}
      <img
        ref={imgRef}
        src={imageSrc}
        alt={alt}
        className={`${className} ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity`}
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
  const { startZipDownload, updateZipDownload, removeZipDownload } = useZipDownload();
  const [apiUrl, setApiUrl] = useState("");
  const [idToken, setIdToken] = useState("");
  const [loading, setLoading] = useState(true); // Start with true to prevent flicker
  const [error, setError] = useState("");
  const [order, setOrder] = useState(null);
  const [gallery, setGallery] = useState(null);
  const [activeTab, setActiveTab] = useState("originals");
  const [denyModalOpen, setDenyModalOpen] = useState(false);
  const [denyLoading, setDenyLoading] = useState(false);
  const [originalImages, setOriginalImages] = useState([]);
  const [finalImages, setFinalImages] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({
    current: 0,
    total: 0,
    currentFileName: '',
    errors: [],
    successes: 0,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [imageToDelete, setImageToDelete] = useState(null);
  const [deletingImages, setDeletingImages] = useState(new Set()); // Track which images are being deleted
  const [deletedImageKeys, setDeletedImageKeys] = useState(new Set()); // Track successfully deleted images to prevent reappearance
  const deletingImagesRef = useRef(new Set()); // Ref to track deleting images for closures
  const deletedImageKeysRef = useRef(new Set()); // Ref to track deleted images for closures
  const [shouldSuppressDeleteConfirm, setShouldSuppressDeleteConfirm] = useState(false);
  const [savingAmount, setSavingAmount] = useState(false);
  const [isEditingAmount, setIsEditingAmount] = useState(false);
  const [editingAmountValue, setEditingAmountValue] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const fileInputRef = useRef(null);
  const uploadCancelRef = useRef(false); // Track if upload was cancelled

  // Sync refs with state so closures always have latest values
  useEffect(() => {
    deletingImagesRef.current = deletingImages;
  }, [deletingImages]);

  useEffect(() => {
    deletedImageKeysRef.current = deletedImageKeys;
  }, [deletedImageKeys]);

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
      loadWalletBalance();
    }
  }, [apiUrl, idToken, galleryId, orderId]);

  // Listen for order updates from sidebar actions (e.g., mark as paid, send finals)
  useEffect(() => {
    if (!apiUrl || !idToken || !galleryId || !orderId) return;

    const handleOrderUpdate = (event) => {
      // Only reload if this is the same order
      if (event.detail?.orderId === orderId) {
        loadOrderData();
      }
    };

    const handleGalleryPaymentCompleted = (event) => {
      // Reload order data when gallery payment is completed
      // This ensures the order view updates when gallery is paid via sidebar
      if (event.detail?.galleryId === galleryId) {
        loadOrderData();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('orderUpdated', handleOrderUpdate);
      window.addEventListener('galleryPaymentCompleted', handleGalleryPaymentCompleted);
      return () => {
        window.removeEventListener('orderUpdated', handleOrderUpdate);
        window.removeEventListener('galleryPaymentCompleted', handleGalleryPaymentCompleted);
      };
    }
  }, [orderId, apiUrl, idToken, galleryId]);

  // Auto-set to finals tab if selection is disabled or if originals section should be hidden
  useEffect(() => {
    if (gallery && gallery.selectionEnabled === false) {
      setActiveTab("finals");
    } else if (order) {
      const orderObj = typeof order === 'string' ? (() => {
        try {
          return JSON.parse(order);
        } catch {
          return {};
        }
      })() : (order || {});
      
      // Only hide if backup addon is NOT purchased (with backup addon, originals should always be visible)
      const hasBackupAddon = gallery?.hasBackupStorage === true;
      const shouldHideSelectedSection = !hasBackupAddon && (
        orderObj.deliveryStatus === "PREPARING_DELIVERY" || 
        orderObj.deliveryStatus === "PREPARING_FOR_DELIVERY" ||
        orderObj.deliveryStatus === "DELIVERED"
      );
      
      if (shouldHideSelectedSection && gallery?.selectionEnabled !== false && activeTab === "originals") {
        setActiveTab("finals");
      }
    }
  }, [gallery, order, activeTab]);

  const loadWalletBalance = async () => {
    if (!apiUrl || !idToken) return 0;
    
    try {
      const { data } = await apiFetch(`${apiUrl}/wallet/balance`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const balance = data.balanceCents || 0;
      setWalletBalance(balance);
      return balance;
    } catch (err) {
      // Silently fail - wallet balance is not critical for this page
      console.error("Failed to load wallet balance:", err);
      setWalletBalance(0);
      return 0;
    }
  };

  const handlePayClick = async () => {
    if (!apiUrl || !idToken || !galleryId || paymentLoading) return;
    
    setPaymentLoading(true);

    try {
      // Reload wallet balance to ensure we have the latest balance
      const currentBalance = await loadWalletBalance();
      
      // IMPORTANT: Always send dryRun: true to prevent any wallet deduction
      const { data } = await apiFetch(`${apiUrl}/galleries/${galleryId}/pay`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}` 
        },
        body: JSON.stringify({ dryRun: true }),
      });

      // Verify this is a dry run response (safety check)
      if (!data.dryRun) {
        console.warn('Warning: Payment endpoint did not return dryRun flag');
      }

      setPaymentDetails({
        totalAmountCents: data.totalAmountCents,
        walletAmountCents: data.walletAmountCents,
        stripeAmountCents: data.stripeAmountCents,
        balanceAfterPayment: currentBalance - data.walletAmountCents,
      });
      setShowPaymentModal(true);
    } catch (err) {
      const errorMsg = formatApiError(err);
      showToast("error", "Błąd", errorMsg || "Nie udało się przygotować płatności");
    } finally {
      setPaymentLoading(false);
    }
  };

  const handlePaymentConfirm = async () => {
    if (!apiUrl || !idToken || !galleryId || !paymentDetails) return;

    setShowPaymentModal(false);
    setPaymentLoading(true);

    try {
      // If wallet balance is insufficient (split payment), force full Stripe payment
      const forceStripeOnly = paymentDetails.walletAmountCents > 0 && paymentDetails.stripeAmountCents > 0;
      
      const { data } = await apiFetch(`${apiUrl}/galleries/${galleryId}/pay`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}` 
        },
        body: JSON.stringify({ forceStripeOnly }),
      });
      
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
      showToast("error", "Błąd", errorMsg || "Nie udało się opłacić galerii");
    } finally {
      setPaymentLoading(false);
    }
  };

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
      
      let orderData = orderResponse.data;
      // Parse if orderData is a string (shouldn't happen, but handle it just in case)
      if (typeof orderData === 'string') {
        try {
          orderData = JSON.parse(orderData);
        } catch (e) {
          // Silently handle parse error
        }
      }
      setOrder(orderData);
      setGallery(galleryResponse.data);
      
      // Load original images
      const imagesData = imagesResponse.data;
      setOriginalImages(imagesData.images || []);
      
      // Load final images if order status allows it OR if selection is disabled
      const galleryData = galleryResponse.data;
      const selectionEnabled = galleryData?.selectionEnabled !== false;
      
      // Auto-switch to finals tab if originals section should be hidden
      // BUT only hide if backup addon is NOT purchased (with backup addon, originals should always be visible)
      const hasBackupAddon = galleryData?.hasBackupStorage === true;
      const shouldHideSelectedSection = !hasBackupAddon && (
        orderData.deliveryStatus === "PREPARING_DELIVERY" || 
        orderData.deliveryStatus === "PREPARING_FOR_DELIVERY" ||
        orderData.deliveryStatus === "DELIVERED"
      );
      if (shouldHideSelectedSection && selectionEnabled && activeTab === "originals") {
        setActiveTab("finals");
      }
      
      if (
        !selectionEnabled ||
        orderData.deliveryStatus === "CLIENT_APPROVED" ||
        orderData.deliveryStatus === "AWAITING_FINAL_PHOTOS" ||
        orderData.deliveryStatus === "PREPARING_DELIVERY" ||
        orderData.deliveryStatus === "PREPARING_FOR_DELIVERY" ||
        orderData.deliveryStatus === "DELIVERED"
      ) {
        try {
          const finalResponse = await apiFetch(
            `${apiUrl}/galleries/${galleryId}/orders/${orderId}/final/images`,
            {
              headers: { Authorization: `Bearer ${idToken}` },
            }
          );
          // Map final images to use finalUrl as url for consistency
          const mappedFinalImages = (finalResponse.data.images || []).map(img => ({
            ...img,
            url: img.finalUrl || img.url // Use finalUrl from API, fallback to url
          }));
          
          // Merge new images with existing placeholders (same logic as originals)
          setFinalImages((prevImages) => {
            const now = Date.now();
            // Separate placeholders and existing real images
            const existingPlaceholders = prevImages.filter((img) => img.isPlaceholder);
            const existingRealImages = prevImages.filter((img) => !img.isPlaceholder);
            
            // Create a map of existing real images by key for quick lookup
            const existingImageKeys = new Set(existingRealImages.map((img) => img.key || img.filename));
            
            // Filter out images that are currently being deleted or have been successfully deleted
            // This prevents flickering/reappearance when deleting multiple images quickly
            // Use refs to ensure we have the latest values even in closures
            const imagesToAdd = mappedFinalImages.filter((img) => {
              const imgKey = img.key || img.filename;
              // Skip if already in our list
              if (existingImageKeys.has(imgKey)) {
                return false;
              }
              // Skip if currently being deleted (use ref for latest value)
              if (deletingImagesRef.current.has(imgKey)) {
                return false;
              }
              // Skip if successfully deleted (use ref for latest value, prevents reappearance due to eventual consistency)
              if (deletedImageKeysRef.current.has(imgKey)) {
                return false;
              }
              return true;
            });
            
            // If we have new images and placeholders, replace placeholders with new images
            if (imagesToAdd.length > 0 && existingPlaceholders.length > 0) {
              // Sort placeholders by upload timestamp, then by uploadIndex (oldest first)
              const sortedPlaceholders = [...existingPlaceholders].sort((a, b) => {
                if (a.uploadTimestamp !== b.uploadTimestamp) {
                  return a.uploadTimestamp - b.uploadTimestamp;
                }
                return (a.uploadIndex || 0) - (b.uploadIndex || 0);
              });
              
              // Replace placeholders with new images (one-to-one replacement)
              const numToReplace = Math.min(imagesToAdd.length, sortedPlaceholders.length);
              const placeholdersToKeep = sortedPlaceholders.slice(numToReplace);
              
              // Keep only recent placeholders that weren't replaced (less than 15 seconds old)
              const recentPlaceholders = placeholdersToKeep.filter(
                (placeholder) => (now - placeholder.uploadTimestamp) < 15000
              );
              
              // Clean up blob URLs for replaced placeholders
              sortedPlaceholders.slice(0, numToReplace).forEach(placeholder => {
                if (placeholder.url && placeholder.url.startsWith('blob:')) {
                  URL.revokeObjectURL(placeholder.url);
                }
              });
              
              // Maintain order: existing real images, then new images, then remaining placeholders
              return [...existingRealImages, ...imagesToAdd, ...recentPlaceholders];
            }
            
            // If no new images but we have placeholders, keep only recent ones
            if (existingPlaceholders.length > 0 && imagesToAdd.length === 0) {
              const recentPlaceholders = existingPlaceholders.filter(
                (placeholder) => (now - placeholder.uploadTimestamp) < 15000
              );
              
              // Remove any placeholders older than 30 seconds as a safety measure
              const finalPlaceholders = recentPlaceholders.filter(
                (placeholder) => (now - placeholder.uploadTimestamp) < 30000
              );
              
              // Clean up blob URLs for removed placeholders
              existingPlaceholders.filter(p => !finalPlaceholders.includes(p)).forEach(placeholder => {
                if (placeholder.url && placeholder.url.startsWith('blob:')) {
                  URL.revokeObjectURL(placeholder.url);
                }
              });
              
              return [...existingRealImages, ...finalPlaceholders];
            }
            
            // No placeholders, just return existing + new images
            return [...existingRealImages, ...imagesToAdd];
          });
        } catch (err) {
          // Final images might not exist yet - keep existing placeholders
          setFinalImages((prevImages) => {
            const now = Date.now();
            // Keep only recent placeholders (less than 15 seconds old)
            const recentPlaceholders = prevImages.filter(
              (img) => img.isPlaceholder && (now - img.uploadTimestamp) < 15000
            );
            const existingRealImages = prevImages.filter((img) => !img.isPlaceholder);
            return [...existingRealImages, ...recentPlaceholders];
          });
        }
      }
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (files) => {
    if (!files || files.length === 0) return;
    
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      showToast("error", "Błąd", "Wybierz pliki graficzne");
      return;
    }
    
    if (!apiUrl || !idToken || !galleryId || !orderId) return;
    
    setUploading(true);
    uploadCancelRef.current = false; // Reset cancellation flag
    setError("");
    
    // Initialize upload progress
    setUploadProgress({
      current: 0,
      total: imageFiles.length,
      currentFileName: '',
      errors: [],
      successes: 0,
    });
    
    // Capture initial real image count BEFORE adding placeholders
    const initialFinalImageCount = finalImages.filter((img) => !img.isPlaceholder).length;
    
    // Create placeholders immediately for better UX (same pattern as originals)
    // Use a unique timestamp per upload batch to track which placeholders belong together
    const uploadBatchId = Date.now();
    const placeholders = imageFiles.map((file, index) => ({
      key: file.name,
      filename: file.name,
      url: URL.createObjectURL(file), // Use blob URL for placeholder preview
      isPlaceholder: true,
      uploadTimestamp: uploadBatchId, // Same timestamp for all in this batch
      uploadIndex: index, // Track order within batch
      size: file.size
    }));
    
    // Add placeholders to final images immediately
    setFinalImages((prev) => [...prev, ...placeholders]);
    
    try {
      const token = await getIdToken();
      
      // Helper function to retry a request with exponential backoff and jitter
      const retryWithBackoff = async (fn, maxRetries = 5, baseDelay = 500) => {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            return await fn();
          } catch (error) {
            if (attempt === maxRetries - 1) throw error;
            // Exponential backoff with jitter: 0.5s, 1s, 2s, 4s, 8s
            const exponentialDelay = baseDelay * Math.pow(2, attempt);
            const jitter = Math.random() * 0.3 * exponentialDelay; // Add up to 30% jitter
            const delay = exponentialDelay + jitter;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      };
      
      // Dynamic batch sizing: start larger, reduce if errors occur
      let currentBatchSize = Math.min(15, Math.max(5, Math.floor(imageFiles.length / 10)));
      let consecutiveErrors = 0;
      const uploadErrors = [];
      let uploadSuccesses = 0;
      
      // Process uploads in batches with adaptive sizing
      for (let i = 0; i < imageFiles.length; i += currentBatchSize) {
        // Check for cancellation
        if (uploadCancelRef.current) {
          throw new Error('Upload cancelled by user');
        }
        
        const batch = imageFiles.slice(i, i + currentBatchSize);
        const batchStartTime = Date.now();
        let batchErrors = 0;
        
        // Process batch with individual error handling
        const batchResults = await Promise.allSettled(
          batch.map(async (file, batchIndex) => {
            const globalIndex = i + batchIndex;
            
            // Check for cancellation before each file
            if (uploadCancelRef.current) {
              throw new Error('Upload cancelled');
            }
            
            // Update progress
            setUploadProgress((prev) => ({
              ...prev,
              current: globalIndex + 1,
              currentFileName: file.name,
            }));
            
            try {
              // Use the dedicated final upload endpoint which handles the correct S3 path
              const presignResponse = await retryWithBackoff(async () => {
                return await apiFetch(
                  `${apiUrl}/galleries/${galleryId}/orders/${orderId}/final/upload`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                      key: file.name,
                      contentType: file.type || "image/jpeg",
                    }),
                  }
                );
              });
              
              // Upload file to S3 with timeout
              const uploadController = new AbortController();
              const uploadTimeout = setTimeout(() => uploadController.abort(), 300000); // 5 min timeout
              
              try {
                const uploadResponse = await fetch(presignResponse.data.url, {
                  method: "PUT",
                  body: file,
                  headers: {
                    "Content-Type": file.type || "image/jpeg",
                  },
                  signal: uploadController.signal,
                });
                
                clearTimeout(uploadTimeout);
                
                if (!uploadResponse.ok) {
                  throw new Error(`Failed to upload ${file.name}: ${uploadResponse.status} ${uploadResponse.statusText}`);
                }
                
                uploadSuccesses++;
                return { success: true, file: file.name };
              } catch (uploadError) {
                clearTimeout(uploadTimeout);
                throw uploadError;
              }
            } catch (error) {
              const errorMessage = error.message || 'Unknown error';
              uploadErrors.push({ file: file.name, error: errorMessage });
              batchErrors++;
              return { success: false, file: file.name, error: errorMessage };
            }
          })
        );
        
        // Update progress with batch results
        setUploadProgress((prev) => ({
          ...prev,
          successes: uploadSuccesses,
          errors: uploadErrors,
        }));
        
        // Adaptive batch sizing: reduce if too many errors, increase if successful
        if (batchErrors > 0) {
          consecutiveErrors++;
          // Reduce batch size if we're getting errors (minimum 3)
          currentBatchSize = Math.max(3, Math.floor(currentBatchSize * 0.7));
        } else {
          consecutiveErrors = 0;
          // Gradually increase batch size if successful (maximum 20)
          if (currentBatchSize < 20) {
            currentBatchSize = Math.min(20, Math.floor(currentBatchSize * 1.1));
          }
        }
        
        // Dynamic delay between batches based on batch size and errors
        // Larger batches = longer delay, errors = longer delay
        const baseDelay = 100;
        const errorPenalty = batchErrors * 50;
        const batchSizePenalty = currentBatchSize * 10;
        const delay = baseDelay + errorPenalty + batchSizePenalty;
        
        // Only delay if there are more batches to process
        if (i + currentBatchSize < imageFiles.length && !uploadCancelRef.current) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      // Final progress update
      setUploadProgress((prev) => ({
        ...prev,
        current: imageFiles.length,
        currentFileName: '',
      }));
      
      // Show summary toast
      if (uploadErrors.length === 0) {
        showToast("success", "Sukces", `Wszystkie ${imageFiles.length} zdjęć finalnych zostało przesłanych`);
      } else if (uploadSuccesses > 0) {
        showToast(
          "warning",
          "Częściowy sukces",
          `Przesłano ${uploadSuccesses} z ${imageFiles.length} zdjęć finalnych. ${uploadErrors.length} nie powiodło się.`
        );
      } else {
        showToast("error", "Błąd", `Nie udało się przesłać żadnego zdjęcia finalnego. Sprawdź konsolę.`);
      }
      
      // Call completion endpoint - it will check S3 state server-side
      // This is idempotent and safe - checks actual S3 files, not client claims
      // Only call if we have at least some successful uploads
      if (uploadSuccesses > 0 && !uploadCancelRef.current) {
        try {
          await apiFetch(
            `${apiUrl}/galleries/${galleryId}/orders/${orderId}/final/upload-complete`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
            }
          );
          
          // Reload order data immediately to get updated status
          await loadOrderData();
          
          // Notify GalleryLayoutWrapper to reload order data after status update
          // This ensures the sidebar order actions appear when deliveryStatus changes to PREPARING_DELIVERY
          if (typeof window !== 'undefined') {
            console.log('Order page: Dispatching orderUpdated event after upload-complete', { orderId });
            window.dispatchEvent(new CustomEvent('orderUpdated', { detail: { orderId } }));
          }
        } catch (completeErr) {
          // If completion fails, show warning but don't fail the upload
          // The endpoint can be called again later - it's idempotent
          showToast("warning", "Ostrzeżenie", "Zdjęcia zostały przesłane. Jeśli originals nie zostały usunięte, spróbuj ponownie.");
          console.error("Upload completion processing failed:", completeErr);
        }
      }
      
      // Poll for final images to appear on CloudFront
      // Images need time to propagate through CloudFront
      // initialFinalImageCount was captured before placeholders were added
      const expectedNewImageCount = imageFiles.length;
      let attempts = 0;
      const maxAttempts = 60; // 60 attempts = ~60 seconds max
      const pollInterval = 1000; // Check every second
      
      const pollForFinalImages = async () => {
        attempts++;
        
        try {
          const finalResponse = await apiFetch(
            `${apiUrl}/galleries/${galleryId}/orders/${orderId}/final/images`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          
          const mappedFinalImages = (finalResponse.data.images || []).map(img => ({
            ...img,
            url: img.finalUrl || img.url // Use finalUrl from API, fallback to url
          }));
          
          // Merge new images with existing placeholders (same logic as loadOrderData)
          setFinalImages((prevImages) => {
            const now = Date.now();
            // Separate placeholders and existing real images
            const existingPlaceholders = prevImages.filter((img) => img.isPlaceholder);
            const existingRealImages = prevImages.filter((img) => !img.isPlaceholder);
            
            // Create a map of existing real images by key for quick lookup
            const existingImageKeys = new Set(existingRealImages.map((img) => img.key || img.filename));
            
            // Filter out images that are currently being deleted or have been successfully deleted
            // This prevents flickering/reappearance when deleting multiple images quickly
            // Use refs to ensure we have the latest values even in closures
            const imagesToAdd = mappedFinalImages.filter((img) => {
              const imgKey = img.key || img.filename;
              // Skip if already in our list
              if (existingImageKeys.has(imgKey)) {
                return false;
              }
              // Skip if currently being deleted (use ref for latest value)
              if (deletingImagesRef.current.has(imgKey)) {
                return false;
              }
              // Skip if successfully deleted (use ref for latest value, prevents reappearance due to eventual consistency)
              if (deletedImageKeysRef.current.has(imgKey)) {
                return false;
              }
              return true;
            });
            
            // If we have new images and placeholders, replace placeholders with new images
            if (imagesToAdd.length > 0 && existingPlaceholders.length > 0) {
              // Sort placeholders by upload timestamp, then by uploadIndex (oldest first)
              const sortedPlaceholders = [...existingPlaceholders].sort((a, b) => {
                if (a.uploadTimestamp !== b.uploadTimestamp) {
                  return a.uploadTimestamp - b.uploadTimestamp;
                }
                return (a.uploadIndex || 0) - (b.uploadIndex || 0);
              });
              
              // Replace placeholders with new images (one-to-one replacement)
              const numToReplace = Math.min(imagesToAdd.length, sortedPlaceholders.length);
              const placeholdersToKeep = sortedPlaceholders.slice(numToReplace);
              
              // Keep only recent placeholders that weren't replaced (less than 15 seconds old)
              const recentPlaceholders = placeholdersToKeep.filter(
                (placeholder) => (now - placeholder.uploadTimestamp) < 15000
              );
              
              // Clean up blob URLs for replaced placeholders
              sortedPlaceholders.slice(0, numToReplace).forEach(placeholder => {
                if (placeholder.url && placeholder.url.startsWith('blob:')) {
                  URL.revokeObjectURL(placeholder.url);
                }
              });
              
              // Maintain order: existing real images, then new images, then remaining placeholders
              return [...existingRealImages, ...imagesToAdd, ...recentPlaceholders];
            }
            
            // If no new images but we have placeholders, keep only recent ones
            if (existingPlaceholders.length > 0 && imagesToAdd.length === 0) {
              const recentPlaceholders = existingPlaceholders.filter(
                (placeholder) => (now - placeholder.uploadTimestamp) < 15000
              );
              
              // Remove any placeholders older than 30 seconds as a safety measure
              const finalPlaceholders = recentPlaceholders.filter(
                (placeholder) => (now - placeholder.uploadTimestamp) < 30000
              );
              
              // Clean up blob URLs for removed placeholders
              existingPlaceholders.filter(p => !finalPlaceholders.includes(p)).forEach(placeholder => {
                if (placeholder.url && placeholder.url.startsWith('blob:')) {
                  URL.revokeObjectURL(placeholder.url);
                }
              });
              
              return [...existingRealImages, ...finalPlaceholders];
            }
            
            // No placeholders, just return existing + new images
            return [...existingRealImages, ...imagesToAdd];
          });
          
          // Check if we have new images (count real images, not placeholders)
          const currentRealImageCount = mappedFinalImages.filter(img => !img.isPlaceholder).length;
          const hasNewImages = currentRealImageCount >= initialFinalImageCount + expectedNewImageCount;
          
          // If we have new images or max attempts reached, stop polling
          if (hasNewImages || attempts >= maxAttempts) {
            // Clean up any remaining blob URLs from placeholders
            setFinalImages((prevImages) => {
              const remainingPlaceholders = prevImages.filter(img => img.isPlaceholder);
              remainingPlaceholders.forEach(placeholder => {
                if (placeholder.url && placeholder.url.startsWith('blob:')) {
                  URL.revokeObjectURL(placeholder.url);
                }
              });
              return prevImages;
            });
            showToast("success", "Sukces", `${imageFiles.length} zdjęć zostało przesłanych`);
            
            // Notify GalleryLayoutWrapper to reload order data so sidebar updates
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('orderUpdated', { detail: { orderId } }));
            }
            
            return;
          }
          
          // Continue polling
          setTimeout(pollForFinalImages, pollInterval);
        } catch (err) {
          console.error("Error polling for final images:", err);
          // On error, still reload final images (will merge with placeholders)
          await loadOrderData();
          
          // Notify GalleryLayoutWrapper to reload order data
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('orderUpdated', { detail: { orderId } }));
          }
          
          // Continue polling unless we've hit max attempts
          if (attempts < maxAttempts) {
            setTimeout(pollForFinalImages, pollInterval);
          } else {
            // Clean up any remaining blob URLs
            setFinalImages((prevImages) => {
              const remainingPlaceholders = prevImages.filter(img => img.isPlaceholder);
              remainingPlaceholders.forEach(placeholder => {
                if (placeholder.url && placeholder.url.startsWith('blob:')) {
                  URL.revokeObjectURL(placeholder.url);
                }
              });
              return prevImages;
            });
            showToast("success", "Sukces", `${imageFiles.length} zdjęć zostało przesłanych`);
          }
        }
      };
      
      // Start polling after a short delay
      setTimeout(pollForFinalImages, 500);
    } catch (err) {
      // On error, remove placeholders and clean up blob URLs
      setFinalImages((prevImages) => {
        const placeholdersToRemove = prevImages.filter((img) => img.isPlaceholder);
        // Clean up blob URLs before removing
        placeholdersToRemove.forEach(placeholder => {
          if (placeholder.url && placeholder.url.startsWith('blob:')) {
            URL.revokeObjectURL(placeholder.url);
          }
        });
        return prevImages.filter((img) => !img.isPlaceholder);
      });
      if (uploadCancelRef.current) {
        showToast("info", "Anulowano", "Przesyłanie zdjęć finalnych zostało anulowane");
      } else {
        const errorMsg = formatApiError(err) || "Nie udało się przesłać zdjęć finalnych";
        showToast("error", "Błąd", errorMsg);
        console.error("Final upload error:", err);
      }
    } finally {
      setUploading(false);
      setUploadProgress({
        current: 0,
        total: 0,
        currentFileName: '',
        errors: [],
        successes: 0,
      });
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files);
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

  const handleDeleteFinalClick = (image) => {
    const imageKey = image.key || image.filename;
    
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
        handleDeleteFinalDirect(image);
        return;
      } else {
        // Suppression expired, remove it
        localStorage.removeItem(suppressKey);
      }
    }
    
    setImageToDelete(image);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteFinalDirect = async (image) => {
    const imageKey = image.key || image.filename;
    if (!apiUrl || !idToken || !galleryId || !orderId) return;
    
    // Prevent duplicate deletions
    if (deletingImages.has(imageKey)) {
      return;
    }
    
    // Mark image as being deleted
    setDeletingImages((prev) => new Set(prev).add(imageKey));
    
    // Optimistically remove image from local state immediately
    setFinalImages((prevImages) => prevImages.filter((img) => (img.key || img.filename) !== imageKey));
    
    try {
      await apiFetch(
        `${apiUrl}/galleries/${galleryId}/orders/${orderId}/final/images/${encodeURIComponent(imageKey)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${idToken}` },
        }
      );
      
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
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('orderUpdated', { detail: { orderId } }));
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

  const handleDeleteFinal = async (suppressChecked) => {
    if (!imageToDelete) return;
    
    const imageKey = imageToDelete.key || imageToDelete.filename;
    if (!apiUrl || !idToken || !galleryId || !orderId) return;
    
    // Prevent duplicate deletions
    if (deletingImages.has(imageKey)) {
      return;
    }
    
    // Store suppression preference - will save to localStorage only after successful deletion
    setShouldSuppressDeleteConfirm(suppressChecked);
    
    // Mark image as being deleted
    setDeletingImages((prev) => new Set(prev).add(imageKey));
    
    // Optimistically remove image from local state immediately
    setFinalImages((prevImages) => prevImages.filter((img) => (img.key || img.filename) !== imageKey));
    
    try {
      await apiFetch(
        `${apiUrl}/galleries/${galleryId}/orders/${orderId}/final/images/${encodeURIComponent(imageKey)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${idToken}` },
        }
      );
      
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
      setShouldSuppressDeleteConfirm(false);
      
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
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('orderUpdated', { detail: { orderId } }));
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
      setShouldSuppressDeleteConfirm(false);
    }
  };

  const handleStartEditAmount = () => {
    const orderObj = typeof order === 'string' ? (() => {
      try {
        return JSON.parse(order);
      } catch {
        return {};
      }
    })() : order;
    setEditingAmountValue(centsToPlnString(orderObj.totalCents || 0));
    setIsEditingAmount(true);
  };

  const handleCancelEditAmount = () => {
    setIsEditingAmount(false);
    setEditingAmountValue("");
  };

  const handleSaveAmount = async () => {
    if (!apiUrl || !idToken || !galleryId || !orderId || !order) return;
    
    // Parse order if it's a string
    const orderObj = typeof order === 'string' ? (() => {
      try {
        return JSON.parse(order);
      } catch {
        return {};
      }
    })() : order;
    
    const newTotalCents = plnToCents(editingAmountValue);
    
    setSavingAmount(true);
    try {
      await apiFetch(
        `${apiUrl}/galleries/${galleryId}/orders/${orderId}`,
        {
          method: "PATCH",
          headers: { 
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ totalCents: newTotalCents })
        }
      );
      
      await loadOrderData();
      setIsEditingAmount(false);
      setEditingAmountValue("");
      showToast("success", "Sukces", "Kwota została zaktualizowana");
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    } finally {
      setSavingAmount(false);
    }
  };

  const handleApproveChangeRequest = async () => {
    if (!apiUrl || !idToken || !galleryId || !orderId) return;
    
    try {
      const response = await apiFetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}/approve-change`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` }
      });
      
      showToast("success", "Sukces", "Prośba o zmiany została zatwierdzona. Klient może teraz modyfikować wybór.");
      await loadOrderData();
      // Reload gallery to update order status in sidebar
      if (reloadGallery) {
        await reloadGallery();
      }
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err) || "Nie udało się zatwierdzić prośby o zmiany");
    }
  };

  const handleDenyChangeRequest = () => {
    setDenyModalOpen(true);
  };

  const handleDenyConfirm = async (reason) => {
    if (!apiUrl || !idToken || !galleryId || !orderId) return;
    
    setDenyLoading(true);
    
    try {
      const response = await apiFetch(`${apiUrl}/galleries/${galleryId}/orders/${orderId}/deny-change`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: reason || undefined })
      });
      
      showToast("success", "Sukces", "Prośba o zmiany została odrzucona. Zlecenie zostało przywrócone do poprzedniego statusu.");
      setDenyModalOpen(false);
      await loadOrderData();
      // Reload gallery to update order status in sidebar
      if (reloadGallery) {
        await reloadGallery();
      }
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err) || "Nie udało się odrzucić prośby o zmiany");
    } finally {
      setDenyLoading(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!apiUrl || !idToken || !galleryId || !orderId || !order) return;
    
    // Parse order if it's a string
    const orderObj = typeof order === 'string' ? (() => {
      try {
        return JSON.parse(order);
      } catch {
        return {};
      }
    })() : order;
    
    // Start download progress indicator
    const downloadId = startZipDownload(String(orderId), String(galleryId));
    
    const pollForZip = async () => {
      try {
        const zipUrl = `${apiUrl}/galleries/${galleryId}/orders/${orderId}/zip`;
        const response = await fetch(zipUrl, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        
        // Handle 202 - ZIP is being generated
        if (response.status === 202) {
          updateZipDownload(downloadId, { status: 'generating' });
          // Retry after delay
          setTimeout(() => {
            pollForZip();
          }, 2000); // Poll every 2 seconds
          return;
        }
        
        // Handle 200 - ZIP is ready
        if (response.ok && response.headers.get('content-type')?.includes('application/zip')) {
          updateZipDownload(downloadId, { status: 'downloading' });
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${orderId}.zip`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          
          updateZipDownload(downloadId, { status: 'success' });
          setError(''); // Clear any previous errors
          // Auto-dismiss after 3 seconds
          setTimeout(() => {
            removeZipDownload(downloadId);
          }, 3000);
        } else if (response.ok) {
          // JSON response (error or other status)
          const data = await response.json();
          const errorMsg = data.error || "Nie udało się pobrać pliku ZIP";
          updateZipDownload(downloadId, { status: 'error', error: errorMsg });
          setError(errorMsg);
        } else {
          // Error response
          const errorData = await response.json().catch(() => ({ error: 'Nie udało się pobrać pliku ZIP' }));
          const errorMsg = errorData.error || "Nie udało się pobrać pliku ZIP";
          updateZipDownload(downloadId, { status: 'error', error: errorMsg });
          setError(errorMsg);
        }
      } catch (err) {
        const errorMsg = formatApiError(err);
        updateZipDownload(downloadId, { status: 'error', error: errorMsg });
        setError(errorMsg);
      }
    };
    
    // Start polling
    pollForZip();
  };

  const getDeliveryStatusBadge = (status) => {
    const statusMap = {
      CLIENT_SELECTING: { color: "info", label: "Wybór przez klienta" },
      CLIENT_APPROVED: { color: "success", label: "Zatwierdzone" },
      AWAITING_FINAL_PHOTOS: { color: "warning", label: "Oczekuje na finały" },
      CHANGES_REQUESTED: { color: "warning", label: "Prośba o zmiany" },
      PREPARING_FOR_DELIVERY: { color: "info", label: "Gotowe do wysyłki" },
      PREPARING_DELIVERY: { color: "info", label: "Oczekuje do wysłania" },
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

  // Ensure order is an object (parse if it's a string)
  const orderObj = typeof order === 'string' ? (() => {
    try {
      return JSON.parse(order);
    } catch {
      return {};
    }
  })() : (order || {});
  
  const selectedKeys = orderObj.selectedKeys || [];
  const selectionEnabled = gallery?.selectionEnabled !== false; // Default to true if not specified
  
  // Hide "Wybrane przez klienta" section when finals are uploaded (PREPARING_DELIVERY or DELIVERED)
  // BUT only hide if backup addon is NOT purchased (with backup addon, originals should always be visible)
  const hasBackupAddon = gallery?.hasBackupStorage === true;
  const hideSelectedSection = !hasBackupAddon && (
    orderObj.deliveryStatus === "PREPARING_DELIVERY" || 
    orderObj.deliveryStatus === "PREPARING_FOR_DELIVERY" ||
    orderObj.deliveryStatus === "DELIVERED"
  );
  
  // Check if gallery is paid (not DRAFT state)
  const isGalleryPaid = gallery?.state !== "DRAFT" && gallery?.isPaid !== false;
  
  // Allow upload for final photos when order status allows it AND gallery is paid
  // Statuses: CLIENT_APPROVED, AWAITING_FINAL_PHOTOS, PREPARING_DELIVERY
  // Also allow uploads for non-selection galleries even if deliveryStatus is undefined (legacy orders)
  // Note: Backend uses PREPARING_DELIVERY (without "FOR")
  const canUploadFinals = isGalleryPaid && (
    (!selectionEnabled && !orderObj.deliveryStatus) || // Legacy orders without deliveryStatus in non-selection galleries
    orderObj.deliveryStatus === "CLIENT_APPROVED" ||
    orderObj.deliveryStatus === "AWAITING_FINAL_PHOTOS" ||
    orderObj.deliveryStatus === "PREPARING_DELIVERY" // Backend sets this status after finals upload
  );
      // ZIP download is available if:
      // 1. Backup addon exists (always available regardless of status)
      // 2. Order is in CLIENT_APPROVED or AWAITING_FINAL_PHOTOS status (before finals upload)
      // 3. Order is DELIVERED (for one-time download if no backup addon)
  const canDownloadZip = hasBackupAddon || canUploadFinals || orderObj.deliveryStatus === "DELIVERED" || orderObj.deliveryStatus === "CLIENT_APPROVED";

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
            Zlecenie #{orderObj.orderNumber || (orderObj.orderId ? orderObj.orderId.slice(-8) : orderId)}
          </h1>
        </div>
        <div className="flex gap-2">
          {getDeliveryStatusBadge(orderObj.deliveryStatus)}
          {getPaymentStatusBadge(orderObj.paymentStatus)}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-error-50 border border-error-200 rounded-lg text-error-600">
          {error}
        </div>
      )}

      {/* Change Request Actions */}
      {orderObj.deliveryStatus === 'CHANGES_REQUESTED' && (
        <div className="p-4 bg-warning-50 border border-warning-200 rounded-lg dark:bg-warning-500/10 dark:border-warning-500/20">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-warning-800 dark:text-warning-200 mb-1">
                Prośba o zmiany
              </div>
              <div className="text-xs text-warning-600 dark:text-warning-400">
                Klient prosi o możliwość modyfikacji wyboru. Zatwierdź, aby odblokować wybór, lub odrzuć, aby przywrócić poprzedni status.
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
              <Button
                size="sm"
                variant="outline"
                onClick={handleDenyChangeRequest}
              >
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
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Kwota dodatkowych usług</div>
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
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  <button
                    onClick={handleCancelEditAmount}
                    disabled={savingAmount}
                    className="p-1 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Anuluj"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  {savingAmount && (
                    <Loading size="sm" />
                  )}
                </>
              ) : (
                <>
                  <span className="text-lg font-semibold text-gray-900 dark:text-white">
                    {((orderObj.totalCents || 0) / 100).toFixed(2)} PLN
                  </span>
                  <button
                    onClick={handleStartEditAmount}
                    className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
                    title="Edytuj kwotę"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Data utworzenia</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {orderObj.createdAt
                ? new Date(orderObj.createdAt).toLocaleDateString("pl-PL")
                : "-"}
            </div>
          </div>
          {selectionEnabled && orderObj.selectedKeys && (
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
          {selectedKeys.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <p>Klient nie wybrał jeszcze żadnych zdjęć.</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-4">
              {originalImages
                .filter((img) => selectedKeys.includes(img.key))
                .map((img, idx) => (
                  <div
                    key={idx}
                    className="relative border-2 border-brand-500 ring-2 ring-brand-200 rounded-lg overflow-hidden"
                  >
                    <img
                      src={img.previewUrl || img.thumbUrl || img.url}
                      alt={img.key}
                      className="w-full h-48 object-cover"
                      onError={(e) => {
                        // Fallback to thumbUrl if previewUrl fails
                        if (img.previewUrl && img.thumbUrl && e.currentTarget.src === img.previewUrl) {
                          e.currentTarget.src = img.thumbUrl;
                        }
                      }}
                    />
                    <div className="absolute top-2 right-2">
                      <Badge color="success" variant="solid">
                        Wybrane
                      </Badge>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {(selectionEnabled ? activeTab === "finals" : true) && (
        <div className="space-y-4">
          {/* Show unpaid message if gallery is not paid */}
          {!isGalleryPaid && (
            <div className="p-4 bg-error-50 border border-error-200 rounded-lg dark:bg-error-500/10 dark:border-error-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-error-800 dark:text-error-200 mb-1">
                    Galeria nieopłacona
                  </div>
                  <div className="text-xs text-error-600 dark:text-error-400">
                    Nie możesz przesłać zdjęć finalnych, ponieważ galeria nie została opłacona. Opłać galerię aby kontynuować.
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handlePayClick}
                  disabled={paymentLoading}
                >
                  {paymentLoading ? "Przetwarzanie..." : "Opłać galerię"}
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
                  onClick={() => {
                    uploadCancelRef.current = true;
                    setUploading(false);
                  }}
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
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Przesyłanie zdjęć...
                    </p>
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
                    handleFileSelect(e.target.files);
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
                const isPlaceholder = img.isPlaceholder;
                
                return (
                  <div
                    key={img.key || img.filename || idx}
                    className={`relative group border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden hover:border-brand-500 dark:hover:border-brand-400 transition-colors ${
                      isPlaceholder ? "cursor-default" : ""
                    }`}
                  >
                    <div className="aspect-square relative">
                      {isPlaceholder ? (
                        <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center rounded-lg">
                          <div className="text-center space-y-2">
                            <Loading size="sm" />
                            <div className="text-xs text-gray-500 dark:text-gray-400 px-2">
                              Przetwarzanie...
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <RetryableImage
                            src={img.finalUrl || img.url}
                            alt={img.key || img.filename}
                            className="w-full h-full object-cover rounded-lg"
                          />
                          {canUploadFinals && (
                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity flex items-center justify-center">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteFinalClick(img);
                                }}
                                disabled={deletingImages.has(img.key || img.filename)}
                                className={`opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 text-sm font-medium rounded-md ${
                                  deletingImages.has(img.key || img.filename)
                                    ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                                    : "bg-error-500 text-white hover:bg-error-600"
                                }`}
                                title={deletingImages.has(img.key || img.filename) ? "Usuwanie..." : "Usuń zdjęcie"}
                              >
                                {deletingImages.has(img.key || img.filename) ? "Usuwanie..." : "Usuń"}
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {!isPlaceholder && (
                      <div className="p-2">
                        <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                          {img.key || img.filename}
                        </p>
                      </div>
                    )}
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
          const imageKey = imageToDelete?.key || imageToDelete?.filename;
          if (!imageKey || !deletingImages.has(imageKey)) {
            setDeleteConfirmOpen(false);
            setImageToDelete(null);
            setShouldSuppressDeleteConfirm(false);
          }
        }}
        onConfirm={handleDeleteFinal}
        title="Usuń zdjęcie"
        message={imageToDelete ? `Czy na pewno chcesz usunąć zdjęcie "${imageToDelete.key || imageToDelete.filename}"?\nTa operacja jest nieodwracalna.` : ""}
        confirmText="Usuń"
        cancelText="Anuluj"
        variant="danger"
        loading={imageToDelete ? deletingImages.has(imageToDelete.key || imageToDelete.filename) : false}
        suppressKey="final_image_delete_confirm_suppress"
      />

      {/* Deny Change Request Modal */}
      <DenyChangeRequestModal
        isOpen={denyModalOpen}
        onClose={() => setDenyModalOpen(false)}
        onConfirm={handleDenyConfirm}
        loading={denyLoading}
      />

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

