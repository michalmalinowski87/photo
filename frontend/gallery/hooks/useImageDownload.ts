"use client";

import { useMutation } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { apiFetch, formatApiError } from "@/lib/api";
import { getToken } from "@/lib/token";
import { getPublicApiUrl } from "@/lib/public-env";

const API_URL = getPublicApiUrl();

interface DownloadOptions {
  galleryId: string;
  imageKey: string;
  orderId?: string; // Optional orderId for downloading final images
  type?: 'final' | 'original'; // Image type: 'final' for finals, 'original' for originals (default)
  onProgress?: (progress: number) => void;
}

export interface DownloadState {
  showOverlay: boolean;
  isError: boolean;
}

/**
 * Detects if the current device is iOS
 */
function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * Detects if the current browser is Safari (including iOS Safari)
 */
function isSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes("safari") && !ua.includes("chrome") && !ua.includes("crios");
}

/**
 * Detects if the current device is mobile
 */
function isMobile(): boolean {
  if (typeof window === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

export function useImageDownload() {
  const [downloading, setDownloading] = useState(false);
  const [downloadState, setDownloadState] = useState<DownloadState>({
    showOverlay: false,
    isError: false,
  });
  const abortControllerRef = useRef<AbortController | null>(null);
  const downloadStartedRef = useRef<boolean>(false);
  const overlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const downloadMutation = useMutation({
    mutationFn: async ({ galleryId, imageKey, orderId, type }: Omit<DownloadOptions, "onProgress">) => {
      const token = getToken(galleryId);
      if (!token) {
        throw new Error("Missing token");
      }

      // Build query parameters for final images
      const params = new URLSearchParams();
      if (type === 'final' && orderId) {
        params.append('type', 'final');
        params.append('orderId', orderId);
      }

      const queryString = params.toString();
      const url = `${API_URL}/galleries/${galleryId}/images/${encodeURIComponent(imageKey)}/download${queryString ? `?${queryString}` : ''}`;

      // Request presigned URL for full quality image (original or final)
      const response = await apiFetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return response.data as { url: string; filename?: string };
    },
    onSuccess: async (data) => {
      const filename = data.filename || "image.jpg";
      const isIOSDevice = isIOS();
      const isSafariBrowser = isSafari();
      const isMobileDevice = isMobile();

      try {
        // Mark that download has started
        downloadStartedRef.current = true;
        
        // Clear overlay timeout since download started
        if (overlayTimeoutRef.current) {
          clearTimeout(overlayTimeoutRef.current);
          overlayTimeoutRef.current = null;
        }

        // iOS Safari has poor support for blob downloads and the download attribute
        // Use direct presigned URL with window.open for iOS devices
        // Note: The presigned URL points to the full-resolution original image (not thumbnail/preview)
        // Backend ensures this via s3Key from originals/ folder and Content-Disposition header
        if (isIOSDevice || (isSafariBrowser && isMobileDevice)) {
          // For iOS, open the presigned URL directly (full-resolution original)
          // The URL includes Content-Disposition: attachment header to encourage download
          // User can long-press the displayed image to save the full-resolution original
          // This is the most reliable approach for iOS Safari
          const newWindow = window.open(data.url, "_blank");
          if (!newWindow) {
            // Popup blocked - show error
            setDownloadState({
              showOverlay: true,
              isError: true,
            });
            setDownloading(false);
            return;
          }
          // Close overlay after a short delay for iOS
          setTimeout(() => {
            setDownloadState({ showOverlay: false, isError: false });
            setDownloading(false);
          }, 500);
          return;
        }

        // For Android and desktop browsers, trigger download via direct presigned URL.
        // The backend sets ResponseContentDisposition on the presigned URL, so the browser
        // receives the correct filename and starts the download immediately without
        // loading the full image into JS (avoids multi-second delay for large files).
        const link = document.createElement("a");
        link.href = data.url;
        link.download = filename;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // TODO: Add PostHog tracking for singlePhotoDownloadSuccess when PostHog is installed
        // posthog.capture('gallery_app:single_photo_download_success', {
        //   download_type: "single",
        //   download_method: "button",
        //   image_key: options.imageKey,
        //   order_id: options.orderId,
        //   image_type: options.type || "original",
        // });
        
        // Close overlay shortly after triggering download (browser handles the rest)
        setTimeout(() => {
          setDownloadState({ showOverlay: false, isError: false });
          setDownloading(false);
        }, 200);
      } catch (error) {
        console.error("Download error:", error);
        // TODO: Add PostHog tracking for singlePhotoDownloadError when PostHog is installed
        // posthog.capture('gallery_app:single_photo_download_error', {
        //   download_type: "single",
        //   download_method: "button",
        //   image_key: options.imageKey,
        //   order_id: options.orderId,
        //   image_type: options.type || "original",
        // });
        // Don't expose actual error message for security reasons
        setDownloadState({
          showOverlay: true,
          isError: true,
        });
        setDownloading(false);
      }
    },
    onError: (error) => {
      console.error("Download error:", formatApiError(error));
      // Track download error (note: imageKey not available in onError, will be tracked in download function)
      // Don't expose actual error message for security reasons
      setDownloadState({
        showOverlay: true,
        isError: true,
      });
      setDownloading(false);
    },
  });

  const download = async (options: DownloadOptions) => {
    // TODO: Add PostHog tracking for singlePhotoDownloadClick when PostHog is installed
    // posthog.capture('gallery_app:single_photo_download_click', {
    //   download_type: "single",
    //   download_method: "button",
    //   image_key: options.imageKey,
    //   order_id: options.orderId,
    //   image_type: options.type || "original",
    // });

    // Cancel any existing download
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Clear any existing overlay timeout
    if (overlayTimeoutRef.current) {
      clearTimeout(overlayTimeoutRef.current);
      overlayTimeoutRef.current = null;
    }

    // Reset download started flag
    downloadStartedRef.current = false;

    // Create new abort controller
    abortControllerRef.current = new AbortController();
    setDownloading(true);
    setDownloadState({ showOverlay: false, isError: false });

    // Set timeout to show overlay after 400ms if download hasn't started
    overlayTimeoutRef.current = setTimeout(() => {
      if (!downloadStartedRef.current) {
        setDownloadState({
          showOverlay: true,
          isError: false,
        });
      }
    }, 400);

    try {
      await downloadMutation.mutateAsync({
        galleryId: options.galleryId,
        imageKey: options.imageKey,
        orderId: options.orderId,
        type: options.type,
      });
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        // Error handling is done in onError callback
      }
    }
  };

  const cancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (overlayTimeoutRef.current) {
      clearTimeout(overlayTimeoutRef.current);
      overlayTimeoutRef.current = null;
    }
    setDownloading(false);
    setDownloadState({ showOverlay: false, isError: false });
  };

  const closeOverlay = () => {
    setDownloadState({ showOverlay: false, isError: false });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
    };
  }, []);

  return {
    download,
    cancel,
    closeOverlay,
    downloading: downloading || downloadMutation.isPending,
    error: downloadMutation.error,
    downloadState,
  };
}
