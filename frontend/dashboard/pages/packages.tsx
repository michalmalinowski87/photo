import { X, Package, Plus } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

import Button from "../components/ui/button/Button";
import { ConfirmDialog } from "../components/ui/confirm/ConfirmDialog";
import { EmptyState } from "../components/ui/empty-state/EmptyState";
import Input from "../components/ui/input/InputField";
import { ContentViewLoading } from "../components/ui/loading/Loading";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../components/ui/table";
import { usePageLogger } from "../hooks/usePageLogger";
import { useToast } from "../hooks/useToast";
import api, { formatApiError } from "../lib/api-service";
import { formatCurrencyInput, plnToCents, centsToPlnString } from "../lib/currency";
import { formatPrice } from "../lib/format-price";

interface PricingPackage {
  packageId: string;
  name: string;
  includedPhotos: number;
  pricePerExtraPhoto: number;
  price: number;
  createdAt?: string;
}

interface PackageFormData {
  name: string;
  includedPhotos: number;
  pricePerExtraPhoto: number;
  price: number;
}

export default function Packages() {
  const { showToast } = useToast();
  const { logDataLoad, logDataLoaded, logDataError, logUserAction } = usePageLogger({
    pageName: "Packages",
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [initialLoad, setInitialLoad] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [packages, setPackages] = useState<PricingPackage[]>([]);
  const [showForm, setShowForm] = useState<boolean>(false);
  const [editingPackage, setEditingPackage] = useState<PricingPackage | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [packageToDelete, setPackageToDelete] = useState<string | null>(null);
  const [formData, setFormData] = useState<PackageFormData>({
    name: "",
    includedPhotos: 0,
    pricePerExtraPhoto: 0,
    price: 0,
  });
  const [pricePerExtraPhotoInput, setPricePerExtraPhotoInput] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState<string | null>(null);

  const loadPackages = useCallback(async (): Promise<void> => {
    logDataLoad("packages", {});
    setLoading(true);
    setError("");

    try {
      const data = await api.packages.list();
      const packagesData = (data.items ?? []) as PricingPackage[];
      logDataLoaded("packages", packagesData, { count: packagesData.length });
      setPackages(packagesData);

      if (initialLoad) {
        setInitialLoad(false);
      }
    } catch (err) {
      logDataError("packages", err);
      setError(formatApiError(err as Error));
    } finally {
      setLoading(false);
    }
  }, [initialLoad, logDataLoad, logDataLoaded, logDataError]);

  useEffect(() => {
    // Auth is handled by AuthProvider/ProtectedRoute - just load data
    void loadPackages();
  }, [loadPackages]);

  const handleCreate = (): void => {
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

  const handleEdit = (pkg: PricingPackage): void => {
    setEditingPackage(pkg);
    setFormData({
      name: pkg.name ?? "",
      includedPhotos: pkg.includedPhotos ?? 0,
      pricePerExtraPhoto: pkg.pricePerExtraPhoto ?? 0,
      price: pkg.price ?? 0,
    });
    setPricePerExtraPhotoInput(null);
    setPriceInput(null);
    setShowForm(true);
  };

  const handleSave = async (): Promise<void> => {
    setLoading(true);
    setError("");

    try {
      if (editingPackage) {
        await api.packages.update(editingPackage.packageId, formData);
      } else {
        await api.packages.create(formData);
      }

      setShowForm(false);
      await loadPackages();
      showToast(
        "success",
        "Sukces",
        editingPackage ? "Pakiet został zaktualizowany" : "Pakiet został utworzony"
      );
    } catch (err) {
      const errorMsg = formatApiError(err as Error);
      setError(errorMsg);
      showToast("error", "Błąd", errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (packageId: string): void => {
    setPackageToDelete(packageId);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async (): Promise<void> => {
    if (!packageToDelete) {
      return;
    }

    setLoading(true);
    setError("");
    setDeleteConfirmOpen(false);

    try {
      await api.packages.delete(packageToDelete);

      await loadPackages();
      showToast("success", "Sukces", "Pakiet został usunięty");
      setPackageToDelete(null);
    } catch (err) {
      const errorMsg = formatApiError(err as Error);
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
            <X size={20} />
          </button>
        </div>

        {error && <div>{error}</div>}

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
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                value={pricePerExtraPhotoInput ?? centsToPlnString(formData.pricePerExtraPhoto)}
                onChange={(e) => {
                  const formatted = formatCurrencyInput(e.target.value);
                  setPricePerExtraPhotoInput(formatted);
                  setFormData({
                    ...formData,
                    pricePerExtraPhoto: plnToCents(formatted),
                  });
                }}
                onBlur={() => {
                  if (!pricePerExtraPhotoInput || pricePerExtraPhotoInput === "") {
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
                value={priceInput ?? centsToPlnString(formData.price)}
                onChange={(e) => {
                  const formatted = formatCurrencyInput(e.target.value);
                  setPriceInput(formatted);
                  setFormData({
                    ...formData,
                    price: plnToCents(formatted),
                  });
                }}
                onBlur={() => {
                  if (!priceInput || priceInput === "") {
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
    return <ContentViewLoading text="Ładowanie pakietów..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Pakiety</h1>
        <button
          onClick={handleCreate}
          className="text-xl font-bold text-brand-500 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300 transition-colors flex items-center gap-2"
        >
          <span className="text-2xl">+</span>
          <span>Dodaj pakiet</span>
        </button>
      </div>

      {error && <div>{error}</div>}

      {packages.length === 0 ? (
        <EmptyState
          icon={<Package size={64} />}
          title="Brak pakietów"
          description="Utwórz swój pierwszy pakiet cenowy. Pakiety definiują liczbę zdjęć w pakiecie i cenę za dodatkowe zdjęcia."
          actionButton={{
            label: "Dodaj pakiet",
            onClick: handleCreate,
            icon: <Plus size={18} />,
          }}
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 dark:bg-gray-900">
                <TableCell
                  isHeader
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Nazwa
                </TableCell>
                <TableCell
                  isHeader
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Zdjęcia w pakiecie
                </TableCell>
                <TableCell
                  isHeader
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Cena za dodatkowe zdjęcie
                </TableCell>
                <TableCell
                  isHeader
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Cena pakietu
                </TableCell>
                <TableCell
                  isHeader
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Data utworzenia
                </TableCell>
                <TableCell
                  isHeader
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Akcje
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packages.map((pkg) => (
                <TableRow key={pkg.packageId} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <TableCell className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                    {pkg.name || "-"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                    {pkg.includedPhotos}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                    {formatPrice(pkg.pricePerExtraPhoto)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                    {formatPrice(pkg.price)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {pkg.createdAt ? new Date(pkg.createdAt).toLocaleDateString("pl-PL") : "-"}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleEdit(pkg)}>
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
