import { useState, useEffect } from "react";
import { apiFetch, formatApiError } from "../lib/api";
import { getIdToken } from "../lib/auth";
import { initializeAuth, redirectToLandingSignIn } from "../lib/auth-init";
import Button from "../components/ui/button/Button";
import Input from "../components/ui/input/InputField";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../components/ui/table";
import { FullPageLoading } from "../components/ui/loading/Loading";

export default function Packages() {
  const [apiUrl, setApiUrl] = useState("");
  const [idToken, setIdToken] = useState("");
  const [loading, setLoading] = useState(true); // Start with true to prevent flicker
  const [initialLoad, setInitialLoad] = useState(true); // Track if this is the initial load
  const [error, setError] = useState("");
  const [packages, setPackages] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingPackage, setEditingPackage] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    includedPhotos: 0,
    pricePerExtraPhoto: 0,
    price: 0,
  });

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
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (packageId) => {
    if (!apiUrl || !idToken) return;
    if (!confirm("Czy na pewno chcesz usunąć ten pakiet?")) return;
    
    setLoading(true);
    setError("");
    
    try {
      await apiFetch(`${apiUrl}/packages/${packageId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      
      await loadPackages();
    } catch (err) {
      setError(formatApiError(err));
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
                value={formData.includedPhotos}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    includedPhotos: parseInt(e.target.value) || 0,
                  })
                }
                min="0"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Cena za dodatkowe zdjęcie (grosze) *
              </label>
              <Input
                type="number"
                placeholder="500"
                value={formData.pricePerExtraPhoto}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    pricePerExtraPhoto: parseInt(e.target.value) || 0,
                  })
                }
                min="0"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {(formData.pricePerExtraPhoto / 100).toFixed(2)} PLN
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Cena pakietu (grosze) *
              </label>
              <Input
                type="number"
                placeholder="0"
                value={formData.price}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    price: parseInt(e.target.value) || 0,
                  })
                }
                min="0"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {(formData.price / 100).toFixed(2)} PLN
              </p>
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
        <Button variant="primary" onClick={handleCreate}>
          + Dodaj pakiet
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-error-50 border border-error-200 rounded-lg text-error-600 dark:bg-error-50 dark:border-error-200 dark:text-error-600">
          {error}
        </div>
      )}

      {packages.length === 0 ? (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
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
                        onClick={() => handleDelete(pkg.packageId)}
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
    </div>
  );
}
