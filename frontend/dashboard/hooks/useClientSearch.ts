import { useState, useEffect, useCallback } from "react";

import api, { formatApiError } from "../lib/api-service";

interface Client {
  clientId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  isCompany?: boolean;
  companyName?: string;
  nip?: string;
  [key: string]: unknown;
}

interface PageHistoryItem {
  page: number;
  cursor: string | null;
}

interface UseClientSearchReturn {
  clients: Client[];
  loading: boolean;
  error: string;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  refresh: () => Promise<void>;
  hasMore: boolean;
}

/**
 * Reusable hook for searching and listing clients
 * Extracted from clients.tsx for use in wizard and other components
 */
export const useClientSearch = (initialLimit: number = 20): UseClientSearchReturn => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [paginationCursor, setPaginationCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [pageHistory, setPageHistory] = useState<PageHistoryItem[]>([{ page: 1, cursor: null }]);

  const loadClients = useCallback(
    async (page: number, lastKey: string | null, search: string) => {
      setLoading(true);
      setError("");

      try {
        const params: Record<string, string> = {};
        params.limit = initialLimit.toString();

        if (search) {
          const offset = (page - 1) * initialLimit;
          params.search = search;
          params.offset = offset.toString();
        } else {
          if (lastKey) {
            params.lastKey = lastKey;
          }
        }

        const data = await api.clients.list(params);
        setClients(data.items ?? []);
        setHasMore(data.hasMore ?? false);
        const newCursor = data.lastKey ?? null;
        setPaginationCursor(newCursor);
        setCurrentPage(page);

        if (!search) {
          const historyIndex = pageHistory.findIndex((h) => h.page === page);
          if (historyIndex >= 0) {
            const newHistory = [...pageHistory];
            newHistory[historyIndex] = { page, cursor: lastKey };
            setPageHistory(newHistory);
          } else {
            setPageHistory([...pageHistory, { page, cursor: lastKey }]);
          }
        }
      } catch (err) {
        setError(formatApiError(err as Error));
      } finally {
        setLoading(false);
      }
    },
    [initialLimit, pageHistory]
  );

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      setPageHistory([{ page: 1, cursor: null }]);
      void loadClients(1, null, searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, loadClients]);

  const refresh = useCallback(async () => {
    await loadClients(currentPage, paginationCursor, searchQuery);
  }, [currentPage, paginationCursor, searchQuery, loadClients]);

  return {
    clients,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    refresh,
    hasMore,
  };
};
