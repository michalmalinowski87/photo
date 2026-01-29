import { useMutation, useQueryClient } from "@tanstack/react-query";

import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";

interface BusinessInfo {
  businessName?: string;
  email?: string;
  phone?: string;
  address?: string;
  nip?: string;
  welcomePopupShown?: boolean;
  tutorialNextStepsDisabled?: boolean;
  tutorialClientSendDisabled?: boolean;
  defaultWatermarkUrl?: string;
  defaultWatermarkThumbnails?: boolean;
  defaultWatermarkPosition?: {
    // New pattern-based system
    pattern?: string;
    opacity?: number;
    // Legacy: old positioning system
    corner?: string;
    offsetX?: number;
    offsetY?: number;
    x?: number;
    y?: number;
    scale?: number;
    position?: string;
  };
}

export function useChangePassword() {
  return useMutation({
    mutationFn: ({
      currentPassword,
      newPassword,
    }: {
      currentPassword: string;
      newPassword: string;
    }) => api.auth.changePassword(currentPassword, newPassword),
    // Password change doesn't affect cached data, so no invalidation needed
  });
}

export function useUpdateBusinessInfo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      businessName?: string;
      email?: string;
      phone?: string;
      address?: string;
      nip?: string;
      welcomePopupShown?: boolean;
      tutorialNextStepsDisabled?: boolean;
      tutorialClientSendDisabled?: boolean;
      defaultWatermarkUrl?: string;
      defaultWatermarkThumbnails?: boolean;
      defaultWatermarkPosition?: {
        // Pattern-based system
        pattern?: string;
        opacity?: number;
        // Corner-relative positioning (preferred)
        corner?: string;
        offsetX?: number;
        offsetY?: number;
        // Legacy: absolute positioning
        x?: number;
        y?: number;
        scale?: number;
        rotation?: number;
        // Legacy support
        position?: string;
      };
    }) => api.auth.updateBusinessInfo(data),
    onSuccess: (_, variables) => {
      // Update cache directly with new data if available
      queryClient.setQueryData(queryKeys.auth.businessInfo(), (old: BusinessInfo | undefined) => ({
        ...old,
        ...variables,
      }));
      // Also invalidate to ensure consistency
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.businessInfo() });
    },
  });
}

/**
 * Upload global watermark mutation
 * Handles the complete upload flow for user-level default watermark
 */
export function useUploadGlobalWatermark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ file }: { file: File }) => {
      // Step 1: Get presigned URL
      const timestamp = Date.now();
      const fileExtension = file.name.split(".").pop() ?? "png";
      const key = `watermark_${timestamp}.${fileExtension}`;

      const presignResponse = await api.uploads.getPresignedUserWatermarkUrl({
        key,
        contentType: file.type ?? "image/png",
        fileSize: file.size,
      });

      // Step 2: Upload file to S3
      await fetch(presignResponse.url, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type ?? "image/png",
        },
      });

      // Step 3: Get S3 URL and add to watermark collection (don't set as default)
      const s3Url = presignResponse.url.split("?")[0]; // Remove query params

      // Add watermark to collection with S3 URL (backend will convert to CloudFront in list endpoint)
      try {
        await api.watermarks.add({ url: s3Url, name: file.name });
      } catch (err) {
        // May already exist, that's okay
        console.warn("Failed to add watermark to collection:", err);
      }

      // Step 4: Poll watermarks list to get CloudFront URL (backend converts S3 to CloudFront)
      const maxAttempts = 30;
      const pollInterval = 1000;
      const s3Key = s3Url.split("/").pop() || key;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));

        try {
          const watermarksList = await api.watermarks.list();
          const uploadedWatermark = watermarksList.watermarks?.find(
            (wm) => wm.url && (wm.url.includes(s3Key) || wm.url.includes(key))
          );

          if (uploadedWatermark?.url) {
            const fetchedUrl = uploadedWatermark.url;
            // Check if we have a CloudFront URL (not S3)
            if (
              fetchedUrl &&
              typeof fetchedUrl === "string" &&
              !fetchedUrl.includes(".s3.") &&
              !fetchedUrl.includes("s3.amazonaws.com")
            ) {
              return { success: true, watermarkUrl: fetchedUrl };
            }
          }
        } catch {
          // Continue polling on error
        }
      }

      // Max attempts reached - return S3 URL (will be converted by backend when listing)
      return {
        success: true,
        watermarkUrl: s3Url,
        warning: "Processing taking longer than usual",
      };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.businessInfo() });
    },
  });
}
