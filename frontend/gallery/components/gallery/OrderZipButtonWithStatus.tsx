"use client";

import { useZipStatus } from "@/hooks/useZipStatus";
import { OrderZipButton } from "./OrderZipButton";
import { useCallback } from "react";
import { getToken } from "@/lib/token";
import { getPublicApiUrl } from "@/lib/public-env";
import { useQueryClient } from "@tanstack/react-query";

interface OrderZipButtonWithStatusProps {
  galleryId: string | null;
  orderId: string;
  isOwnerPreview?: boolean;
  onError?: () => void;
  onGenerating?: () => void;
}

export function OrderZipButtonWithStatus({
  galleryId,
  orderId,
  isOwnerPreview = false,
  onError,
  onGenerating,
}: OrderZipButtonWithStatusProps) {
  const queryClient = useQueryClient();
  const { data: zipStatus } = useZipStatus(
    galleryId,
    orderId,
    !!galleryId && !!orderId && !isOwnerPreview
  );

  const handleDownloadZip = useCallback(async () => {
    if (isOwnerPreview) {
      return;
    }
    if (!galleryId || !orderId) return;

    // If ZIP has error status, show error overlay
    if (zipStatus?.status === "error") {
      if (onError) onError();
      return;
    }

    // If ZIP is not ready (generating or not started), show ZIP overlay (status + ETA).
    // We'll still attempt download below when status is unknown/not_started; 404 becomes a normal "preparing" state.
    if (zipStatus?.generating) {
      if (onGenerating) onGenerating();
      return;
    }

    const token = getToken(galleryId);
    if (!token) {
      return;
    }

    try {
      const API_URL = getPublicApiUrl();

      // If status says "ready", just download.
      // Otherwise, try anyway (to avoid stale status); treat 404/202 as "preparing".
      if (!zipStatus?.ready) {
        if (onGenerating) onGenerating();
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const response = await fetch(
        `${API_URL}/galleries/${galleryId}/orders/${orderId}/final/zip`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      // 404 => ZIP not yet created (normal). 202 => backend-side generation (defensive).
      if (response.status === 404 || response.status === 202) {
        if (onGenerating) onGenerating();
        // Kick status polling to refresh soon.
        void queryClient.invalidateQueries({ queryKey: ["zipStatus", galleryId, orderId, "final"] });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to download ZIP");
      }

      // Backend returns JSON with CloudFront signed URL, not the ZIP blob directly
      const data = await response.json();
      if (data.url) {
        // Download from CloudFront signed URL
        const downloadUrl = data.url;
        const filename = data.filename || `gallery-${orderId}.zip`;
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        throw new Error("No download URL in response");
      }
    } catch (error) {
      console.error("Failed to download ZIP:", error);
      if (onError) onError();
    }
  }, [isOwnerPreview, galleryId, orderId, zipStatus, queryClient, onError, onGenerating]);

  return (
    <OrderZipButton
      zipStatus={zipStatus}
      onDownloadZip={handleDownloadZip}
      disabled={isOwnerPreview}
    />
  );
}
