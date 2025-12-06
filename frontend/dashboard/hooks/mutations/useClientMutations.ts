import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";

interface ClientFormData {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  isCompany: boolean;
  companyName: string;
  nip: string;
}

export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ClientFormData) => api.clients.create(data),
    onSuccess: () => {
      // Invalidate all client lists to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.lists() });
    },
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ clientId, data }: { clientId: string; data: ClientFormData }) =>
      api.clients.update(clientId, data),
    onSuccess: (_, variables) => {
      // Invalidate specific client detail
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.detail(variables.clientId) });
      // Invalidate all client lists to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.lists() });
    },
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (clientId: string) => api.clients.delete(clientId),
    onSuccess: (_, clientId) => {
      // Remove specific client from cache
      queryClient.removeQueries({ queryKey: queryKeys.clients.detail(clientId) });
      // Invalidate all client lists to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.lists() });
    },
  });
}
