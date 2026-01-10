import { useMutation, useQueryClient } from "@tanstack/react-query";

import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";

export function useRequestDeletion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ confirmationPhrase }: { confirmationPhrase: string }) =>
      api.auth.requestDeletion(confirmationPhrase),
    onSuccess: () => {
      // Invalidate deletion status to refetch
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.deletionStatus() });
    },
  });
}

export function useCancelDeletion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.auth.cancelDeletion(),
    onSuccess: () => {
      // Invalidate deletion status to refetch
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.deletionStatus() });
    },
  });
}
