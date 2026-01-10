import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";

interface WalletBalance {
  balanceCents: number;
}

interface WalletTransaction {
  [key: string]: unknown;
}

interface WalletTransactionsResponse {
  transactions: WalletTransaction[];
  hasMore?: boolean;
  lastKey?: string | null;
}

export function useWalletBalance(
  options?: Omit<UseQueryOptions<WalletBalance>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: queryKeys.wallet.balance(),
    queryFn: () => api.wallet.getBalance(),
    staleTime: 10 * 1000, // Balance changes more frequently
    ...options,
  });
}

export function useWalletTransactions(
  params?: {
    limit?: string | number;
    offset?: string | number;
    lastKey?: string;
    page?: string | number;
    itemsPerPage?: string | number;
  },
  options?: Omit<UseQueryOptions<WalletTransactionsResponse>, "queryKey" | "queryFn">
) {
  return useQuery<WalletTransactionsResponse>({
    queryKey: queryKeys.wallet.transactions(params),
    queryFn: async () => {
      const response = await api.wallet.getTransactions(params);
      return {
        transactions: response.transactions as WalletTransaction[],
        hasMore: response.hasMore,
        lastKey: response.lastKey,
      };
    },
    staleTime: 30 * 1000,
    ...options,
  });
}
