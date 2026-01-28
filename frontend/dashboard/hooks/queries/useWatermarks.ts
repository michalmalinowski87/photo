import { useQuery, UseQueryOptions } from "@tanstack/react-query";
import api from "../../lib/api-service";
import { queryKeys } from "../../lib/react-query";

export interface Watermark {
  url: string;
  name: string;
  createdAt: string;
}

export function useWatermarks(
  options?: Omit<UseQueryOptions<Watermark[]>, "queryKey" | "queryFn">
) {
  return useQuery<Watermark[]>({
    queryKey: queryKeys.watermarks.list(),
    queryFn: async () => {
      const response = await api.watermarks.list();
      return response.watermarks || [];
    },
    ...options,
  });
}
