import { useQuery, UseQueryOptions } from "@tanstack/react-query";

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
    position: string;
    scale: number;
  };
  referredByUserId?: string | null;
  referredByReferralCode?: string | null;
  /** True when user is referred and has not yet used their one-time referral discount (backend-computed). */
  shouldApplyReferralDiscount?: boolean;
  /** Discount percentage (10 or 15) determined at signup time based on referrer's status at that moment. Ensures first 9 referrals get 10%, 10th+ get 15%. */
  referredDiscountPercent?: number;
}

export function useBusinessInfo(
  options?: Omit<UseQueryOptions<BusinessInfo>, "queryKey" | "queryFn">
) {
  return useQuery<BusinessInfo>({
    queryKey: queryKeys.auth.businessInfo(),
    queryFn: () => api.auth.getBusinessInfo(),
    staleTime: 60 * 1000, // Business info changes rarely
    ...options,
  });
}

interface DeletionStatus {
  deletionScheduledAt?: string;
  status: string;
  deletionReason?: "manual" | "inactivity";
}

export function useDeletionStatus(
  options?: Omit<UseQueryOptions<DeletionStatus>, "queryKey" | "queryFn">
) {
  return useQuery<DeletionStatus>({
    queryKey: queryKeys.auth.deletionStatus(),
    queryFn: () => api.auth.getDeletionStatus(),
    staleTime: 30 * 1000, // Check deletion status frequently
    // Only poll if query is successful - stop polling on 404 or other errors
    refetchInterval: (query) => {
      // Stop polling if query failed with 404 (user not found) or other client errors
      if (query.state.error) {
        const errorWithStatus = query.state.error as { status?: number };
        const status = errorWithStatus?.status;
        // Don't poll if we got a 404 or other 4xx error
        if (status && status >= 400 && status < 500) {
          return false;
        }
      }
      // Poll every minute if query is successful or has server errors (which might recover)
      return 60 * 1000;
    },
    ...options,
  });
}

export interface ReferralData {
  referralCode: string | null;
  referralLink: string | null;
  earnedDiscountCodes: Array<{
    codeId: string;
    type: string;
    expiresAt: string;
    used: boolean;
    usedOnGalleryId?: string;
    status: "Active" | "Used" | "Expired";
  }>;
  referralCount: number;
  topInviterBadge: boolean;
  referralHistory: Array<{ date: string; rewardType: string }>;
}

export function useReferral(options?: Omit<UseQueryOptions<ReferralData>, "queryKey" | "queryFn">) {
  return useQuery<ReferralData>({
    queryKey: queryKeys.auth.referral(),
    queryFn: () => api.auth.getReferral(),
    staleTime: 60 * 1000,
    ...options,
  });
}
