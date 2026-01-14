"use client";

import { useMutation } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { apiFetch, formatApiError } from "@/lib/api";
import { getToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface DownloadOptions {
  galleryId: string;
  imageKey: string;
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
    mutationFn: async ({ galleryId, imageKey }: Omit<DownloadOptions, "onProgress">) => {
      const token = getToken(galleryId);
      if (!token) {
        throw new Error("Missing token");
      }

      // Request presigned URL for full quality image
      const response = await apiFetch(
        `${API_URL}/galleries/${galleryId}/images/${encodeURIComponent(imageKey)}/download`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

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

        // For Android and desktop browsers, use blob approach for better control
        // Fetch the full-resolution original image as a blob (presigned URL points to originals/)
        const response = await fetch(data.url);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        const blob = await response.blob();
        
        // Create a blob URL and trigger download
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = filename;
        // Don't set target="_blank" - this forces download instead of opening in new tab
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up blob URL after a short delay
        setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
        }, 100);
        
        // Close overlay after download starts
        setTimeout(() => {
          setDownloadState({ showOverlay: false, isError: false });
          setDownloading(false);
        }, 300);
      } catch (error) {
        console.error("Download error:", error);
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
      // Don't expose actual error message for security reasons
      setDownloadState({
        showOverlay: true,
        isError: true,
      });
      setDownloading(false);
    },
  });

  const download = async (options: DownloadOptions) => {
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
