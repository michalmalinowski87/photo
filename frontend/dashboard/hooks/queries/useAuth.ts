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

