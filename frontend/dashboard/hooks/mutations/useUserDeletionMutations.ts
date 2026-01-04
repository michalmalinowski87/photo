import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";

export function useRequestDeletion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (email: string) => api.auth.requestDeletion(email),
    onSuccess: () => {
      // Invalidate deletion status to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.deletionStatus() });
    },
  });
}

export function useCancelDeletion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.auth.cancelDeletion(),
    onSuccess: () => {
      // Invalidate deletion status to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.deletionStatus() });
    },
  });
}

