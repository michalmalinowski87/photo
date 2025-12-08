import { X, Users, Plus, Pencil, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";

import Button from "../components/ui/button/Button";
import { ConfirmDialog } from "../components/ui/confirm/ConfirmDialog";
import { EmptyState } from "../components/ui/empty-state/EmptyState";
import Input from "../components/ui/input/InputField";
import { ContentViewLoading } from "../components/ui/loading/Loading";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../components/ui/table";
import { Tooltip } from "../components/ui/tooltip/Tooltip";
import {
  useCreateClient,
  useDeleteClient,
  useUpdateClient,
} from "../hooks/mutations/useClientMutations";
import { useClients } from "../hooks/queries/useClients";
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

interface PageHistoryItem {
  page: number;
  cursor: string | null;
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
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [paginationCursor, setPaginationCursor] = useState<string | null>(null);
  const [pageHistory, setPageHistory] = useState<PageHistoryItem[]>([{ page: 1, cursor: null }]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [clientToDelete, setClientToDelete] = useState<string | null>(null);

  // Build query params based on search vs pagination
  const queryParams = searchQuery
    ? {
        limit: "20",
        search: searchQuery,
        offset: ((currentPage - 1) * 20).toString(),
      }
    : paginationCursor
      ? { limit: "20", lastKey: paginationCursor }
      : { limit: "20" };

  // React Query hook
  const { data: clientsData, isLoading: loading, isFetching, error } = useClients(queryParams);

  const clients = clientsData?.items ?? [];
  const hasMore = clientsData?.hasMore ?? false;

  // Update pagination cursor when data changes (only for non-search pagination)
  useEffect(() => {
    if (!searchQuery && clientsData?.lastKey !== undefined) {
      setPaginationCursor(clientsData.lastKey);
    }
  }, [clientsData?.lastKey, searchQuery]);

  // Handle search query changes with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      setPageHistory([{ page: 1, cursor: null }]);
      setPaginationCursor(null);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

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

  const handleNextPage = (): void => {
    if (hasMore) {
      const nextPage = currentPage + 1;
      if (searchQuery) {
        setCurrentPage(nextPage);
      } else {
        if (paginationCursor) {
          const newCursor = paginationCursor;
          setCurrentPage(nextPage);
          const historyIndex = pageHistory.findIndex((h) => h.page === nextPage);
          if (historyIndex >= 0) {
            const newHistory = [...pageHistory];
            newHistory[historyIndex] = { page: nextPage, cursor: newCursor };
            setPageHistory(newHistory);
          } else {
            setPageHistory([...pageHistory, { page: nextPage, cursor: newCursor }]);
          }
        }
      }
    }
  };

  const handlePreviousPage = (): void => {
    if (currentPage > 1) {
      const previousPage = currentPage - 1;
      if (searchQuery) {
        setCurrentPage(previousPage);
      } else {
        const previousPageData = pageHistory.find((h) => h.page === previousPage);
        if (previousPageData) {
          setPaginationCursor(previousPageData.cursor);
          setCurrentPage(previousPage);
        } else {
          setPaginationCursor(null);
          setCurrentPage(1);
        }
      }
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

        {error && <div>{formatApiError(error)}</div>}

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

  if (loading && !clientsData) {
    return <ContentViewLoading text="Ładowanie klientów..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Klienci</h1>
        <button
          onClick={handleCreate}
          className="text-xl text-brand-500 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300 transition-colors flex items-center gap-2"
        >
          <span className="text-2xl">+</span>
          <span>Dodaj klienta</span>
        </button>
      </div>

      {error && <div>{formatApiError(error)}</div>}

      {(!loading && clients.length > 0) || searchQuery ? (
        <div className="pt-6 px-6 pb-1 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Szukaj (email, imię, nazwisko, firma, NIP, telefon)
            </label>
            <Input
              type="text"
              placeholder="Wpisz tekst do wyszukania..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      ) : null}

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
        <>
          <div className="w-full">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-100 dark:bg-gray-900">
                  <TableCell
                    isHeader
                    className="px-3 py-5 text-left text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                  >
                    Email
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-3 py-5 text-left text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                  >
                    Imię i nazwisko / Firma
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-3 py-5 text-center text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400 whitespace-nowrap w-[1%]"
                  >
                    Telefon
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-3 py-5 text-center text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400 whitespace-nowrap w-[1%]"
                  >
                    Data utworzenia
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-3 py-5 text-center text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400 whitespace-nowrap w-[1%]"
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
          </div>

          {clients.length > 0 && (currentPage > 1 || hasMore) && (
            <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Strona {currentPage}
                {clients.length === 20 && hasMore && " (więcej dostępne)"}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreviousPage}
                  disabled={isFetching || currentPage === 1}
                >
                  Poprzednia
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={isFetching || !hasMore}
                >
                  Następna
                </Button>
              </div>
            </div>
          )}
        </>
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
