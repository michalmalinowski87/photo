"use client";

import { useMutation } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { apiFetch, formatApiError } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface DownloadOptions {
  galleryId: string;
  token: string;
  imageKey: string;
  onProgress?: (progress: number) => void;
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
  const abortControllerRef = useRef<AbortController | null>(null);

  const downloadMutation = useMutation({
    mutationFn: async ({ galleryId, token, imageKey }: Omit<DownloadOptions, "onProgress">) => {
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
            // Popup blocked - fallback to creating a link
            const link = document.createElement("a");
            link.href = data.url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.style.display = "none";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }
          setDownloading(false);
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
        
        setDownloading(false);
      } catch (error) {
        console.error("Download error:", error);
        // Fallback: try direct download link
        // For mobile browsers that don't support blob downloads well
        if (isMobileDevice) {
          // On mobile, open in new tab as fallback
          const newWindow = window.open(data.url, "_blank");
          if (!newWindow) {
            const link = document.createElement("a");
            link.href = data.url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.style.display = "none";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }
        } else {
          // Desktop fallback: try direct link with download attribute
          const link = document.createElement("a");
          link.href = data.url;
          link.download = filename;
          link.style.display = "none";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
        setDownloading(false);
      }
    },
    onError: (error) => {
      console.error("Download error:", formatApiError(error));
      setDownloading(false);
    },
  });

  const download = async (options: DownloadOptions) => {
    // Cancel any existing download
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();
    setDownloading(true);

    try {
      await downloadMutation.mutateAsync({
        galleryId: options.galleryId,
        token: options.token,
        imageKey: options.imageKey,
      });
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        throw error;
      }
    }
  };

  const cancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setDownloading(false);
    }
  };

  return {
    download,
    cancel,
    downloading: downloading || downloadMutation.isPending,
    error: downloadMutation.error,
  };
}
