import { useState, useEffect } from "react";
import { apiFetch, formatApiError } from "../lib/api";
import { getIdToken } from "../lib/auth";
import { initializeAuth, redirectToLandingSignIn } from "../lib/auth-init";
import { formatCurrencyInput, plnToCents, centsToPlnString } from "../lib/currency";
import Button from "../components/ui/button/Button";
import Input from "../components/ui/input/InputField";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../components/ui/table";
import { FullPageLoading } from "../components/ui/loading/Loading";
import { useToast } from "../hooks/useToast";
import { ConfirmDialog } from "../components/ui/confirm/ConfirmDialog";

export default function Packages() {
  const { showToast } = useToast();
  const [apiUrl, setApiUrl] = useState("");
  const [idToken, setIdToken] = useState("");
  const [loading, setLoading] = useState(true); // Start with true to prevent flicker
  const [initialLoad, setInitialLoad] = useState(true); // Track if this is the initial load
  const [error, setError] = useState("");
  const [packages, setPackages] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingPackage, setEditingPackage] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [packageToDelete, setPackageToDelete] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    includedPhotos: 0,
    pricePerExtraPhoto: 0,
    price: 0,
  });
  const [pricePerExtraPhotoInput, setPricePerExtraPhotoInput] = useState(null);
  const [priceInput, setPriceInput] = useState(null);

  useEffect(() => {
    setApiUrl(process.env.NEXT_PUBLIC_API_URL || "");
    initializeAuth(
      (token) => {
        setIdToken(token);
      },
      () => {
        redirectToLandingSignIn("/packages");
      }
    );
  }, []);

  useEffect(() => {
    if (apiUrl && idToken) {
      loadPackages();
    }
  }, [apiUrl, idToken]);

  const loadPackages = async () => {
    if (!apiUrl || !idToken) return;
    
    setLoading(true);
    setError("");
    
    try {
      const { data } = await apiFetch(`${apiUrl}/packages`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      
      setPackages(data.items || []);
      
      // Mark initial load as complete
      if (initialLoad) {
        setInitialLoad(false);
      }
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingPackage(null);
    setFormData({
      name: "",
      includedPhotos: 0,
      pricePerExtraPhoto: 0,
      price: 0,
    });
    setPricePerExtraPhotoInput(null);
    setPriceInput(null);
    setShowForm(true);
  };

  const handleEdit = (pkg) => {
    setEditingPackage(pkg);
    setFormData({
      name: pkg.name || "",
      includedPhotos: pkg.includedPhotos || 0,
      pricePerExtraPhoto: pkg.pricePerExtraPhoto || 0,
      price: pkg.price || 0,
    });
    setPricePerExtraPhotoInput(null);
    setPriceInput(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!apiUrl || !idToken) return;
    
    setLoading(true);
    setError("");
    
    try {
      if (editingPackage) {
        // Update
        await apiFetch(`${apiUrl}/packages/${editingPackage.packageId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify(formData),
        });
      } else {
        // Create
        await apiFetch(`${apiUrl}/packages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify(formData),
        });
      }
      
      setShowForm(false);
      await loadPackages();
      showToast("success", "Sukces", editingPackage ? "Pakiet został zaktualizowany" : "Pakiet został utworzony");
    } catch (err) {
      const errorMsg = formatApiError(err);
      setError(errorMsg);
      showToast("error", "Błąd", errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (packageId) => {
    setPackageToDelete(packageId);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!apiUrl || !idToken || !packageToDelete) return;
    
    setLoading(true);
    setError("");
    setDeleteConfirmOpen(false);
    
    try {
      await apiFetch(`${apiUrl}/packages/${packageToDelete}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      
      await loadPackages();
      showToast("success", "Sukces", "Pakiet został usunięty");
      setPackageToDelete(null);
    } catch (err) {
      const errorMsg = formatApiError(err);
      setError(errorMsg);
      showToast("error", "Błąd", errorMsg);
    } finally {
      setLoading(false);
    }
  };

  if (showForm) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {editingPackage ? "Edytuj pakiet" : "Dodaj pakiet"}
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
                Nazwa pakietu *
              </label>
              <Input
                type="text"
                placeholder="np. Basic, Standard, Pro"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Liczba zdjęć w pakiecie *
              </label>
              <Input
                type="number"
                placeholder="0"
                value={formData.includedPhotos === 0 ? "" : formData.includedPhotos}
                onChange={(e) => {
                  const value = e.target.value;
                  // Allow empty string or valid number
                  if (value === "" || /^\d+$/.test(value)) {
                    setFormData({
                      ...formData,
                      includedPhotos: value === "" ? 0 : parseInt(value, 10),
                    });
                  }
                }}
                min="0"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Cena za dodatkowe zdjęcie (PLN) *
              </label>
              <Input
                type="text"
                placeholder="5.00"
                value={pricePerExtraPhotoInput !== null ? pricePerExtraPhotoInput : centsToPlnString(formData.pricePerExtraPhoto)}
                onChange={(e) => {
                  const formatted = formatCurrencyInput(e.target.value);
                  setPricePerExtraPhotoInput(formatted);
                    setFormData({
                      ...formData,
                    pricePerExtraPhoto: plnToCents(formatted),
                    });
                }}
                onBlur={() => {
                  // Clear input state on blur if empty, let it use cents value
                  if (!pricePerExtraPhotoInput || pricePerExtraPhotoInput === '') {
                    setPricePerExtraPhotoInput(null);
                  }
                }}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Cena pakietu (PLN) *
              </label>
              <Input
                type="text"
                placeholder="0.00"
                value={priceInput !== null ? priceInput : centsToPlnString(formData.price)}
                onChange={(e) => {
                  const formatted = formatCurrencyInput(e.target.value);
                  setPriceInput(formatted);
                    setFormData({
                      ...formData,
                    price: plnToCents(formatted),
                    });
                }}
                onBlur={() => {
                  // Clear input state on blur if empty, let it use cents value
                  if (!priceInput || priceInput === '') {
                    setPriceInput(null);
                  }
                }}
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

  if (loading && initialLoad) {
    return <FullPageLoading text="Ładowanie pakietów..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Pakiety
        </h1>
        <button
          onClick={handleCreate}
          className="text-xl font-bold text-brand-500 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300 transition-colors flex items-center gap-2"
        >
          <span className="text-2xl">+</span>
          <span>Dodaj pakiet</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-error-50 border border-error-200 rounded-lg text-error-600 dark:bg-error-50 dark:border-error-200 dark:text-error-600">
          {error}
        </div>
      )}

      {packages.length === 0 ? (
        <div className="pt-32 pb-8 text-center text-gray-500 dark:text-gray-400 text-xl">
          Brak pakietów. Kliknij "Dodaj pakiet" aby dodać pierwszy.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 dark:bg-gray-900">
                <TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                  Nazwa
                </TableCell>
                <TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                  Zdjęcia w pakiecie
                </TableCell>
                <TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                  Cena za dodatkowe zdjęcie
                </TableCell>
                <TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                  Cena pakietu
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
              {packages.map((pkg) => (
                <TableRow
                  key={pkg.packageId}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <TableCell className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                    {pkg.name}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                    {pkg.includedPhotos}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                    {(pkg.pricePerExtraPhoto / 100).toFixed(2)} PLN
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                    {(pkg.price / 100).toFixed(2)} PLN
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {pkg.createdAt
                      ? new Date(pkg.createdAt).toLocaleDateString("pl-PL")
                      : "-"}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(pkg)}
                      >
                        Edytuj
                      </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteClick(pkg.packageId)}
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
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setPackageToDelete(null);
        }}
        onConfirm={handleDeleteConfirm}
        title="Usuń pakiet"
        message="Czy na pewno chcesz usunąć ten pakiet? Ta operacja jest nieodwracalna."
        confirmText="Usuń"
        cancelText="Anuluj"
        variant="danger"
        loading={loading}
      />
    </div>
  );
}
