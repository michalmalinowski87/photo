import { X, Users, Plus, Pencil, Trash2, ArrowUpDown } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";

import Button from "../components/ui/button/Button";
import { ConfirmDialog } from "../components/ui/confirm/ConfirmDialog";
import { Dropdown } from "../components/ui/dropdown/Dropdown";
import { DropdownItem } from "../components/ui/dropdown/DropdownItem";
import { EmptyState } from "../components/ui/empty-state/EmptyState";
import Input from "../components/ui/input/InputField";
import { ContentViewLoading, InlineLoading } from "../components/ui/loading/Loading";
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

interface Client {
  clientId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  isCompany?: boolean;
  companyName?: string;
  nip?: string;
  createdAt?: string;
  [key: string]: unknown;
}

interface ClientFormData {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  isCompany: boolean;
  companyName: string;
  nip: string;
}

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
  const clients = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.items || []);
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
      email: client.email ?? "",
      firstName: client.firstName ?? "",
      lastName: client.lastName ?? "",
      phone: client.phone ?? "",
      isCompany: client.isCompany ?? false,
      companyName: client.companyName ?? "",
      nip: client.nip ?? "",
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {editingClient ? "Edytuj klienta" : "Dodaj klienta"}
          </h1>
          <button
            onClick={() => setShowForm(false)}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors"
            aria-label="Anuluj"
          >
            <X size={20} />
          </button>
        </div>

        {queryError && <div>{formatApiError(queryError)}</div>}

        <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                  className="w-4 h-4 text-brand-500 rounded"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Firma</span>
              </label>
            </div>

            {formData.isCompany ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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

  if (loading && !data) {
    return <ContentViewLoading text="Ładowanie klientów..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Klienci</h1>
        {/* Search Input - spans from title to sort dropdown */}
        {((!loading && clients.length > 0) || searchQuery) && (
          <div className="relative flex-1 min-w-[200px]">
            <Input
              type="text"
              placeholder="Szukaj (email, imię, nazwisko, firma, NIP, telefon)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full h-11 ${searchQuery ? "pr-10" : ""}`}
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
            className="flex items-center gap-2 px-4 py-2.5 h-11 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-theme-xs hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap"
          >
            <ArrowUpDown size={16} />
            <span>{getSortLabel()}</span>
          </button>
          <Dropdown
            isOpen={sortDropdownOpen}
            onClose={() => setSortDropdownOpen(false)}
            triggerRef={sortButtonRef}
            className="w-56 bg-white dark:bg-gray-900 shadow-xl rounded-lg border border-gray-200 dark:border-gray-700"
          >
            <div className="p-2">
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Sortuj według
              </div>
              <DropdownItem
                onClick={() => {
                  setSortBy("name");
                  setSortDropdownOpen(false);
                }}
                className={`px-3 py-2 text-sm ${
                  sortBy === "name"
                    ? "bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
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
                    ? "bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                Data {sortBy === "date" && (sortOrder === "asc" ? "↑" : "↓")}
              </DropdownItem>
              <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Kolejność
              </div>
              <DropdownItem
                onClick={() => {
                  setSortOrder("asc");
                  setSortDropdownOpen(false);
                }}
                className={`px-3 py-2 text-sm ${
                  sortOrder === "asc"
                    ? "bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
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
                    ? "bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
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
          className="flex items-center gap-2 px-4 py-2.5 h-11 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-theme-xs hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm font-normal text-brand-500 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300 whitespace-nowrap"
        >
          <Plus size={16} />
          <span>Dodaj klienta</span>
        </button>
      </div>

      {queryError && <div>{formatApiError(queryError)}</div>}

      {clients.length === 0 ? (
        searchQuery ? (
          <div className="pt-32 pb-8 text-center text-gray-500 dark:text-gray-400 text-xl">
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
        <div className="w-full relative">
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
              const estimatedItemHeight = 120; // Height of each table row (h-[120px])
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
              <TableHeader className="sticky top-0 z-10 bg-white dark:bg-gray-900">
                <TableRow className="bg-gray-100 dark:bg-gray-900">
                  <TableCell
                    isHeader
                    className="px-3 py-3 h-[68px] text-left text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                  >
                    Email
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-3 py-3 h-[68px] text-left text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                  >
                    Imię i nazwisko / Firma
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-3 py-3 h-[68px] text-center text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400 whitespace-nowrap w-[1%]"
                  >
                    Telefon
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-3 py-3 h-[68px] text-center text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400 whitespace-nowrap w-[1%]"
                  >
                    Data utworzenia
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-3 py-3 h-[68px] text-center text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400 whitespace-nowrap w-[1%]"
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
                      className={`h-[120px] ${
                        isEvenRow
                          ? "bg-white dark:bg-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/90"
                          : "bg-gray-50 dark:bg-gray-900/40 hover:bg-gray-100 dark:hover:bg-gray-800/40"
                      }`}
                    >
                      <TableCell className="px-3 py-5 text-base text-gray-900 dark:text-white align-middle">
                        {client.email}
                      </TableCell>
                      <TableCell className="px-3 py-5 text-base text-gray-900 dark:text-white align-middle">
                        {client.isCompany ? (
                          <div>
                            <div className="font-medium">{client.companyName}</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              NIP: {client.nip}
                            </div>
                          </div>
                        ) : (
                          `${client.firstName} ${client.lastName}`
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-5 text-base text-gray-500 dark:text-gray-400 align-middle text-center">
                        {client.phone ?? "-"}
                      </TableCell>
                      <TableCell className="px-3 py-5 text-base text-gray-500 dark:text-gray-400 align-middle text-center">
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
