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
    refetchInterval: 60 * 1000, // Refetch every minute when component is mounted
    ...options,
  });
}
