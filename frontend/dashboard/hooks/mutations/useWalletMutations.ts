import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";

export function useCreateCheckout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { amountCents: number; type: string; redirectUrl?: string }) =>
      api.payments.createCheckout(data),
    onSuccess: () => {
      // Invalidate wallet balance after checkout (user might have topped up)
      queryClient.invalidateQueries({ queryKey: queryKeys.wallet.balance() });
    },
  });
}
