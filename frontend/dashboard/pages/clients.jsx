import { useState, useEffect } from "react";
import { apiFetch, formatApiError } from "../lib/api";
import { getIdToken } from "../lib/auth";
import { initializeAuth, redirectToLandingSignIn } from "../lib/auth-init";
import Button from "../components/ui/button/Button";
import Input from "../components/ui/input/InputField";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../components/ui/table";

export default function Clients() {
  const [apiUrl, setApiUrl] = useState("");
  const [idToken, setIdToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [clients, setClients] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [formData, setFormData] = useState({
    email: "",
    firstName: "",
    lastName: "",
    phone: "",
    isCompany: false,
    companyName: "",
    nip: "",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [paginationCursor, setPaginationCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [pageHistory, setPageHistory] = useState([{ page: 1, cursor: null }]);

  useEffect(() => {
    setApiUrl(process.env.NEXT_PUBLIC_API_URL || "");
    initializeAuth(
      (token) => {
        setIdToken(token);
      },
      () => {
        redirectToLandingSignIn("/clients");
      }
    );
  }, []);

  useEffect(() => {
    if (apiUrl && idToken) {
      loadClients(1, null, "");
    }
  }, [apiUrl, idToken]);

  // Debounce search
  useEffect(() => {
    if (!apiUrl || !idToken) return;
    
      const timer = setTimeout(() => {
      setCurrentPage(1);
      setPageHistory([{ page: 1, cursor: null }]);
      loadClients(1, null, searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadClients = async (page, lastKey, search) => {
    if (!apiUrl || !idToken) return;
    
    setLoading(true);
    setError("");
    
    try {
      const params = new URLSearchParams();
      params.append('limit', '20');
      
      if (search) {
        // Use offset-based pagination for search
        const offset = (page - 1) * 20;
        params.append('search', search);
        params.append('offset', offset.toString());
      } else {
        // Use cursor-based pagination for normal listing
        if (lastKey) {
          params.append('lastKey', lastKey);
        }
      }
      
      const { data } = await apiFetch(`${apiUrl}/clients?${params.toString()}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      setClients(data.items || []);
      setHasMore(data.hasMore || false);
      const newCursor = data.lastKey || null;
      setPaginationCursor(newCursor);
      setCurrentPage(page);
      
      // Update page history (only for non-search)
      if (!search) {
        const historyIndex = pageHistory.findIndex(h => h.page === page);
        if (historyIndex >= 0) {
          const newHistory = [...pageHistory];
          newHistory[historyIndex] = { page, cursor: lastKey };
          setPageHistory(newHistory);
        } else {
          setPageHistory([...pageHistory, { page, cursor: lastKey }]);
        }
      }
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
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

  const handleEdit = (client) => {
    setEditingClient(client);
    setFormData({
      email: client.email || "",
      firstName: client.firstName || "",
      lastName: client.lastName || "",
      phone: client.phone || "",
      isCompany: client.isCompany || false,
      companyName: client.companyName || "",
      nip: client.nip || "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!apiUrl || !idToken) return;
    
    setLoading(true);
    setError("");
    
    try {
      if (editingClient) {
        // Update
        await apiFetch(`${apiUrl}/clients/${editingClient.clientId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify(formData),
        });
      } else {
        // Create
        await apiFetch(`${apiUrl}/clients`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify(formData),
        });
      }
      
      setShowForm(false);
      await loadClients(currentPage, pageHistory.find(h => h.page === currentPage)?.cursor || null, searchQuery);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (clientId) => {
    if (!apiUrl || !idToken) return;
    if (!confirm("Czy na pewno chcesz usunąć tego klienta?")) return;
    
    setLoading(true);
    setError("");
    
    try {
      await apiFetch(`${apiUrl}/clients/${clientId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      
      await loadClients(currentPage, pageHistory.find(h => h.page === currentPage)?.cursor || null, searchQuery);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleNextPage = () => {
    if (hasMore) {
      const nextPage = currentPage + 1;
      if (searchQuery) {
        // For search, use offset-based pagination
        loadClients(nextPage, null, searchQuery);
      } else {
        // For normal listing, use cursor-based pagination
        if (paginationCursor) {
          loadClients(nextPage, paginationCursor, searchQuery);
        }
      }
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      const previousPage = currentPage - 1;
      if (searchQuery) {
        // For search, use offset-based pagination
        loadClients(previousPage, null, searchQuery);
      } else {
        // For normal listing, use cursor-based pagination
        const previousPageData = pageHistory.find(h => h.page === previousPage);
        if (previousPageData) {
          loadClients(previousPage, previousPageData.cursor, searchQuery);
        } else {
          loadClients(1, null, searchQuery);
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
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {error && (
          <div className="p-4 bg-error-50 border border-error-200 rounded-lg text-error-600 dark:bg-error-50 dark:border-error-200 dark:text-error-600">
            {error}
          </div>
        )}

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
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
              />
            </div>
            
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isCompany}
                  onChange={(e) =>
                    setFormData({ ...formData, isCompany: e.target.checked })
                  }
                  className="w-4 h-4 text-brand-500 rounded"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Firma
                </span>
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
                    onChange={(e) =>
                      setFormData({ ...formData, companyName: e.target.value })
                    }
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
                    onChange={(e) =>
                      setFormData({ ...formData, nip: e.target.value })
                    }
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
                    onChange={(e) =>
                      setFormData({ ...formData, firstName: e.target.value })
                    }
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
                    onChange={(e) =>
                      setFormData({ ...formData, lastName: e.target.value })
                    }
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
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
              />
            </div>
          </div>
          
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Anuluj
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={loading}>
              {loading ? "Zapisywanie..." : "Zapisz"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Klienci
        </h1>
        <Button variant="primary" onClick={handleCreate}>
          + Dodaj klienta
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-error-50 border border-error-200 rounded-lg text-error-600 dark:bg-error-50 dark:border-error-200 dark:text-error-600">
          {error}
        </div>
      )}

      {/* Search - only show if there are clients (or if we have a search query to allow clearing) */}
      {(!loading && clients.length > 0) || searchQuery ? (
        <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
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

      {loading && clients.length === 0 ? (
        <div className="flex items-center justify-center p-8">
          <p className="text-gray-600 dark:text-gray-400">Ładowanie...</p>
        </div>
      ) : clients.length === 0 ? (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          {searchQuery ? "Brak wyników wyszukiwania." : "Brak klientów. Kliknij \"Dodaj klienta\" aby dodać pierwszego."}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 dark:bg-gray-900">
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                    Email
                  </TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                    Imię i nazwisko / Firma
                  </TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                    Telefon
                  </TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                    Data utworzenia
                  </TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                    Akcje
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => (
                  <TableRow
                    key={client.clientId}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                      {client.email}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                      {client.isCompany ? (
                        <div>
                          <div className="font-medium">{client.companyName}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            NIP: {client.nip}
                          </div>
                        </div>
                      ) : (
                        `${client.firstName} ${client.lastName}`
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {client.phone || "-"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {client.createdAt
                        ? new Date(client.createdAt).toLocaleDateString("pl-PL")
                        : "-"}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(client)}
                        >
                          Edytuj
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(client.clientId)}
                        >
                          Usuń
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {clients.length > 0 && (
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
                  disabled={loading || currentPage === 1}
                >
                  Poprzednia
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={loading || !hasMore}
                >
                  Następna
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
