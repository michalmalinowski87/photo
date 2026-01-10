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
