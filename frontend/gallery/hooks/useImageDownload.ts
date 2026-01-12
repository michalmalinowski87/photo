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
    onSuccess: (data) => {
      // Trigger download using the presigned URL
      const link = document.createElement("a");
      link.href = data.url;
      link.download = data.filename || "image.jpg";
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setDownloading(false);
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
