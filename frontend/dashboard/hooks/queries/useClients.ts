import { useQuery, UseQueryOptions } from "@tanstack/react-query";
import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";

interface Client {
  clientId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  isCompany?: boolean;
  companyName?: string;
  nip?: string;
  [key: string]: any;
}

interface ListResponse<T> {
  items: T[];
  hasMore?: boolean;
  lastKey?: string | null;
}

export function useClients(
  params?: {
    limit?: string | number;
    offset?: string | number;
    lastKey?: string;
    page?: string | number;
    itemsPerPage?: string | number;
    search?: string;
  },
  options?: Omit<UseQueryOptions<ListResponse<Client>>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: queryKeys.clients.list(params),
    queryFn: () => api.clients.list(params),
    staleTime: 30 * 1000,
    ...options,
  });
}

export function useClient(
  clientId: string | undefined,
  options?: Omit<UseQueryOptions<Client>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: [...queryKeys.clients.all, "detail", clientId],
    queryFn: () => api.clients.get(clientId!),
    enabled: !!clientId,
    staleTime: 30 * 1000,
    ...options,
  });
}
