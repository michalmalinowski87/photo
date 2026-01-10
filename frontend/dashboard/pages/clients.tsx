import { X, Users, Plus, Pencil, Trash2, ArrowUpDown } from "lucide-react";
import type { GetServerSideProps } from "next";
import dynamic from "next/dynamic";
import { useState, useEffect, useRef, useMemo } from "react";

import Button from "../components/ui/button/Button";
import { Dropdown } from "../components/ui/dropdown/Dropdown";
import { DropdownItem } from "../components/ui/dropdown/DropdownItem";
import { EmptyState } from "../components/ui/empty-state/EmptyState";
import Input from "../components/ui/input/InputField";
import { ContentAreaLoadingOverlay, InlineLoading } from "../components/ui/loading/Loading";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../components/ui/table";
import { Tooltip } from "../components/ui/tooltip/Tooltip";
import {
  useCreateClient,
  useDeleteClient,
  useUpdateClient,
} from "../hooks/mutations/useClientMutations";
import { useInfiniteClients } from "../hooks/useInfiniteClients";
import { useToast } from "../hooks/useToast";
import { formatApiError } from "../lib/api-service";
import type { Client } from "../types";

interface ClientFormData {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  isCompany: boolean;
  companyName: string;
  nip: string;
}

// Lazy load ConfirmDialog - only shown when delete confirmation is open
const ConfirmDialog = dynamic(() => import("../components/ui/confirm/ConfirmDialog").then((mod) => ({ default: mod.ConfirmDialog })), {
  ssr: false,
});

// Prevent static generation - this page uses client hooks
export const getServerSideProps: GetServerSideProps = () => {
  return Promise.resolve({ props: {} });
};

export default function Clients() {
  const { showToast } = useToast();

  // Mutations
  const createClientMutation = useCreateClient();
  const updateClientMutation = useUpdateClient();
  const deleteClientMutation = useDeleteClient();

  const [showForm, setShowForm] = useState<boolean>(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState<ClientFormData>({
    email: "",
    firstName: "",
    lastName: "",
    phone: "",
    isCompany: false,
    companyName: "",
    nip: "",
  });
  // Search state with debouncing
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>("");
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 600);
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [clientToDelete, setClientToDelete] = useState<string | null>(null);

  // Sort state - persisted in localStorage
  const [sortBy, setSortBy] = useState<"name" | "date">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("clientsListSortBy");
      return saved === "name" || saved === "date" ? saved : "date";
    }
    return "date";
  });
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("clientsListSortOrder");
      return saved === "asc" || saved === "desc" ? saved : "desc";
    }
    return "desc";
  });
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const sortButtonRef = useRef<HTMLButtonElement | null>(null);

  // Save sort preferences
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("clientsListSortBy", sortBy);
      localStorage.setItem("clientsListSortOrder", sortOrder);
    }
  }, [sortBy, sortOrder]);

  const getSortLabel = () => {
    const sortLabels: Record<"name" | "date", string> = {
      name: "Nazwa",
      date: "Data",
    };
    const orderLabel = sortOrder === "asc" ? "rosnąco" : "malejąco";
    return `${sortLabels[sortBy]} (${orderLabel})`;
  };

  // React Query hook with infinite scroll
  const {
    data,
    isLoading: loading,
    error: queryError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteClients({
    limit: 20,
    search: debouncedSearchQuery || undefined,
    sortBy,
    sortOrder,
  });

  // Flatten pages into a single array of clients
  const clients = useMemo((): Client[] => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => {
      if (page && typeof page === "object" && "items" in page && Array.isArray(page.items)) {
        return page.items as Client[];
      }
      return [] as Client[];
    });
  }, [data]);

  const handleCreate = (): void => {
    setEditingClient(null);
    setFormData({
      email: "",
      firstName: "",
      lastName: "",
      phone: "",
      isCompany: false,
      companyName: "",
      nip: "",
    });
    setShowForm(true);
  };

  const handleEdit = (client: Client): void => {
    setEditingClient(client);
    setFormData({
      email: typeof client.email === "string" ? client.email : "",
      firstName: typeof client.firstName === "string" ? client.firstName : "",
      lastName: typeof client.lastName === "string" ? client.lastName : "",
      phone: typeof client.phone === "string" ? client.phone : "",
      isCompany: typeof client.isCompany === "boolean" ? client.isCompany : false,
      companyName: typeof client.companyName === "string" ? client.companyName : "",
      nip: typeof client.nip === "string" ? client.nip : "",
    });
    setShowForm(true);
  };

  const handleSave = async (): Promise<void> => {
    try {
      if (editingClient) {
        await updateClientMutation.mutateAsync({
          clientId: editingClient.clientId,
          data: formData,
        });
      } else {
        await createClientMutation.mutateAsync(formData);
      }

      setShowForm(false);
      showToast(
        "success",
        "Sukces",
        editingClient ? "Klient został zaktualizowany" : "Klient został utworzony"
      );
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err as Error));
    }
  };

  const handleDeleteClick = (clientId: string): void => {
    setClientToDelete(clientId);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async (): Promise<void> => {
    if (!clientToDelete) {
      return;
    }

    setDeleteConfirmOpen(false);

    try {
      await deleteClientMutation.mutateAsync(clientToDelete);
      showToast("success", "Sukces", "Klient został usunięty");
      setClientToDelete(null);
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err as Error));
    }
  };

  if (showForm) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-photographer-heading dark:text-white">
            {editingClient ? "Edytuj klienta" : "Dodaj klienta"}
          </h1>
          <button
            onClick={() => setShowForm(false)}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-photographer-elevated hover:bg-photographer-muted dark:bg-gray-700 dark:hover:bg-gray-600 text-photographer-text dark:text-gray-300 transition-colors"
            aria-label="Anuluj"
          >
            <X size={20} />
          </button>
        </div>

        {queryError && <div>{formatApiError(queryError)}</div>}

        <div className="p-6 bg-photographer-surface border border-photographer-border rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-photographer-text dark:text-gray-300 mb-2">
                Email *
              </label>
              <Input
                type="email"
                placeholder="email@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isCompany}
                  onChange={(e) => setFormData({ ...formData, isCompany: e.target.checked })}
                  className="w-4 h-4 text-photographer-accent rounded"
                />
                <span className="text-sm font-medium text-photographer-text dark:text-gray-300">
                  Firma
                </span>
              </label>
            </div>

            {formData.isCompany ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-photographer-text dark:text-gray-300 mb-2">
                    Nazwa firmy *
                  </label>
                  <Input
                    type="text"
                    placeholder="Nazwa firmy"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-photographer-text dark:text-gray-300 mb-2">
                    NIP *
                  </label>
                  <Input
                    type="text"
                    placeholder="NIP"
                    value={formData.nip}
                    onChange={(e) => setFormData({ ...formData, nip: e.target.value })}
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-photographer-text dark:text-gray-300 mb-2">
                    Imię *
                  </label>
                  <Input
                    type="text"
                    placeholder="Imię"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-photographer-text dark:text-gray-300 mb-2">
                    Nazwisko *
                  </label>
                  <Input
                    type="text"
                    placeholder="Nazwisko"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-photographer-text dark:text-gray-300 mb-2">
                Telefon
              </label>
              <Input
                type="tel"
                placeholder="+48 123 456 789"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Anuluj
            </Button>
            <Button
              variant="primary"
              onClick={() => handleSave()}
              disabled={createClientMutation.isPending || updateClientMutation.isPending}
            >
              {createClientMutation.isPending || updateClientMutation.isPending
                ? "Zapisywanie..."
                : "Zapisz"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Determine if this is initial load (no data yet)
  const isInitialLoad =
    loading && clients.length === 0 && (!data || !('pages' in data) || !(data as { pages?: unknown[] }).pages || (data as { pages: unknown[] }).pages.length === 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-3xl font-bold text-photographer-heading dark:text-white">Klienci</h1>
        {/* Search Input - spans from title to sort dropdown */}
        {((!loading && clients.length > 0) || searchQuery) && (
          <div className="relative flex-1 min-w-[150px]">
            <Input
              type="text"
              placeholder="Szukaj (email, imię, nazwisko, firma, NIP, telefon)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full ${searchQuery ? "pr-10" : ""}`}
              hideErrorSpace={true}
              autoComplete="off"
              autoFocus={false}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-5 h-5 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                aria-label="Wyczyść wyszukiwanie"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}

        {/* Sort Dropdown */}
        <div className="relative">
          <button
            ref={sortButtonRef}
            onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
            className="flex items-center gap-2 px-4 py-2.5 h-11 bg-photographer-surface dark:bg-gray-800 border border-photographer-border dark:border-gray-700 rounded-lg shadow-theme-xs hover:bg-photographer-elevated dark:hover:bg-gray-700 transition-colors text-sm text-photographer-text dark:text-gray-300 whitespace-nowrap"
          >
            <ArrowUpDown size={16} />
            <span>{getSortLabel()}</span>
          </button>
          <Dropdown
            isOpen={sortDropdownOpen}
            onClose={() => setSortDropdownOpen(false)}
            triggerRef={sortButtonRef}
            className="w-56 bg-photographer-surface dark:bg-gray-900 shadow-xl rounded-lg border border-photographer-border dark:border-gray-700"
          >
            <div className="p-2">
              <div className="px-3 py-2 text-xs font-semibold text-photographer-mutedText dark:text-gray-400 uppercase tracking-wider">
                Sortuj według
              </div>
              <DropdownItem
                onClick={() => {
                  setSortBy("name");
                  setSortDropdownOpen(false);
                }}
                className={`px-3 py-2 text-sm ${
                  sortBy === "name"
                    ? "bg-photographer-accentLight/50 dark:bg-photographer-accent/20 text-photographer-accent dark:text-photographer-accent"
                    : "text-photographer-text dark:text-gray-300 hover:bg-photographer-elevated dark:hover:bg-gray-800"
                }`}
              >
                Nazwa {sortBy === "name" && (sortOrder === "asc" ? "↑" : "↓")}
              </DropdownItem>
              <DropdownItem
                onClick={() => {
                  setSortBy("date");
                  setSortDropdownOpen(false);
                }}
                className={`px-3 py-2 text-sm ${
                  sortBy === "date"
                    ? "bg-photographer-accentLight/50 dark:bg-photographer-accent/20 text-photographer-accent dark:text-photographer-accent"
                    : "text-photographer-text dark:text-gray-300 hover:bg-photographer-elevated dark:hover:bg-gray-800"
                }`}
              >
                Data {sortBy === "date" && (sortOrder === "asc" ? "↑" : "↓")}
              </DropdownItem>
              <div className="border-t border-photographer-border dark:border-gray-700 my-1" />
              <div className="px-3 py-2 text-xs font-semibold text-photographer-mutedText dark:text-gray-400 uppercase tracking-wider">
                Kolejność
              </div>
              <DropdownItem
                onClick={() => {
                  setSortOrder("asc");
                  setSortDropdownOpen(false);
                }}
                className={`px-3 py-2 text-sm ${
                  sortOrder === "asc"
                    ? "bg-photographer-accentLight/50 dark:bg-photographer-accent/20 text-photographer-accent dark:text-photographer-accent"
                    : "text-photographer-text dark:text-gray-300 hover:bg-photographer-elevated dark:hover:bg-gray-800"
                }`}
              >
                Rosnąco ↑
              </DropdownItem>
              <DropdownItem
                onClick={() => {
                  setSortOrder("desc");
                  setSortDropdownOpen(false);
                }}
                className={`px-3 py-2 text-sm ${
                  sortOrder === "desc"
                    ? "bg-photographer-accentLight/50 dark:bg-photographer-accent/20 text-photographer-accent dark:text-photographer-accent"
                    : "text-photographer-text dark:text-gray-300 hover:bg-photographer-elevated dark:hover:bg-gray-800"
                }`}
              >
                Malejąco ↓
              </DropdownItem>
            </div>
          </Dropdown>
        </div>

        {/* Add Client Button */}
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2.5 h-11 bg-photographer-surface dark:bg-gray-800 border border-photographer-border dark:border-gray-700 rounded-lg shadow-theme-xs hover:bg-photographer-elevated dark:hover:bg-gray-700 transition-colors text-sm font-normal text-photographer-heading hover:text-photographer-accentHover dark:text-gray-400 dark:hover:text-gray-300 whitespace-nowrap"
        >
          <Plus size={16} />
          <span>Dodaj klienta</span>
        </button>
      </div>

      {queryError && <div>{formatApiError(queryError)}</div>}

      {!isInitialLoad && clients.length === 0 ? (
        searchQuery ? (
          <div className="pt-32 pb-8 text-center text-photographer-mutedText dark:text-gray-400 text-xl">
            Brak wyników wyszukiwania.
          </div>
        ) : (
          <EmptyState
            icon={<Users size={64} />}
            title="Brak klientów"
            description="Zacznij od dodania pierwszego klienta. Klienci pozwalają Ci zarządzać kontaktami i przypisywać ich do galerii."
            actionButton={{
              label: "Dodaj klienta",
              onClick: handleCreate,
              icon: <Plus size={18} />,
            }}
          />
        )
      ) : (
        <div
          className="w-full relative"
          style={{ minHeight: isInitialLoad ? "calc(100vh - 200px)" : undefined }}
        >
          {isInitialLoad && <ContentAreaLoadingOverlay text="Ładowanie klientów..." />}
          <div
            className="w-full overflow-auto table-scrollbar"
            style={{
              height: "calc(100vh - 200px)",
              minHeight: "800px",
              overscrollBehavior: "none",
            }}
            onScroll={(e) => {
              const target = e.target as HTMLElement;
              const scrollTop = target.scrollTop;
              const clientHeight = target.clientHeight;

              // Use same item-based prefetching as galleries for consistency
              // Calculate how many items are remaining based on scroll position
              const estimatedItemHeight = 72; // Height of each table row (h-[72px] - scaled to 75% then reduced by 20%)
              const totalItemsRendered = clients.length;

              // Calculate which item index is currently at the bottom of viewport
              const scrollBottom = scrollTop + clientHeight;
              const itemsScrolled = Math.floor(scrollBottom / estimatedItemHeight);

              // Calculate distance from end (same logic as galleries)
              const distanceFromEnd = totalItemsRendered - itemsScrolled;
              const prefetchThreshold = 25; // Same threshold as galleries

              // Don't fetch if there's an error or already fetching
              if (
                distanceFromEnd <= prefetchThreshold &&
                hasNextPage &&
                !isFetchingNextPage &&
                !queryError
              ) {
                void fetchNextPage();
              }
            }}
          >
            <Table className="w-full relative">
              <TableHeader className="sticky top-0 z-10 bg-photographer-darkBeige dark:bg-gray-900">
                <TableRow className="bg-photographer-darkBeige dark:bg-gray-900">
                  <TableCell
                    isHeader
                    className="px-3 py-3 h-[51px] text-left text-sm font-medium text-photographer-mutedText uppercase tracking-wider dark:text-gray-400"
                  >
                    Email
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-3 py-3 h-[51px] text-left text-sm font-medium text-photographer-mutedText uppercase tracking-wider dark:text-gray-400"
                  >
                    Imię i nazwisko / Firma
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-3 py-3 h-[51px] text-center text-sm font-medium text-photographer-mutedText uppercase tracking-wider dark:text-gray-400 whitespace-nowrap w-[1%]"
                  >
                    Telefon
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-3 py-3 h-[51px] text-center text-sm font-medium text-photographer-mutedText uppercase tracking-wider dark:text-gray-400 whitespace-nowrap w-[1%]"
                  >
                    Data utworzenia
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-3 py-3 h-[51px] text-center text-sm font-medium text-photographer-mutedText uppercase tracking-wider dark:text-gray-400 whitespace-nowrap w-[1%]"
                  >
                    Akcje
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client, index) => {
                  const isEvenRow = index % 2 === 0;
                  return (
                    <TableRow
                      key={client.clientId}
                      className={`h-[72px] ${
                        isEvenRow
                          ? "bg-photographer-lightBeige dark:bg-gray-800/50 hover:bg-photographer-muted dark:hover:bg-gray-800/90"
                          : "bg-photographer-muted dark:bg-gray-900/40 hover:bg-photographer-darkBeige dark:hover:bg-gray-800/40"
                      }`}
                    >
                      <TableCell className="px-3 py-5 text-base text-photographer-heading dark:text-white align-middle">
                        {client.email}
                      </TableCell>
                      <TableCell className="px-3 py-5 text-base text-photographer-heading dark:text-white align-middle">
                        {client.isCompany ? (
                          <div>
                            <div className="font-medium">
                              {typeof client.companyName === "string" ? client.companyName : ""}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              NIP: {typeof client.nip === "string" ? client.nip : ""}
                            </div>
                          </div>
                        ) : (
                          `${typeof client.firstName === "string" ? client.firstName : ""} ${typeof client.lastName === "string" ? client.lastName : ""}`
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-5 text-base text-photographer-heading dark:text-white align-middle text-center">
                        {client.phone ?? "-"}
                      </TableCell>
                      <TableCell className="px-3 py-5 text-base text-photographer-heading dark:text-white align-middle text-center">
                        {client.createdAt
                          ? new Date(String(client.createdAt)).toLocaleDateString("pl-PL")
                          : "-"}
                      </TableCell>
                      <TableCell className="px-3 py-5 align-middle text-center">
                        <div className="flex items-center justify-center">
                          <Tooltip content="Edytuj">
                            <button
                              onClick={() => handleEdit(client)}
                              className="flex items-center justify-center w-8 h-8 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 rounded hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors mr-0.5"
                              aria-label="Edytuj"
                            >
                              <Pencil className="w-5 h-5" />
                            </button>
                          </Tooltip>
                          <Tooltip content="Usuń">
                            <button
                              onClick={() => handleDeleteClick(client.clientId)}
                              className="flex items-center justify-center w-8 h-8 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 rounded hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                              aria-label="Usuń"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {isFetchingNextPage && (
              <div className="flex justify-center py-4">
                <InlineLoading text="Ładowanie więcej klientów..." />
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setClientToDelete(null);
        }}
        onConfirm={() => {
          void handleDeleteConfirm();
        }}
        title="Usuń klienta"
        message="Czy na pewno chcesz usunąć tego klienta? Ta operacja jest nieodwracalna."
        confirmText="Usuń"
        cancelText="Anuluj"
        variant="danger"
        loading={deleteClientMutation.isPending}
      />
    </div>
  );
}
