import { X, Package, Plus, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import Button from "../components/ui/button/Button";
import { ConfirmDialog } from "../components/ui/confirm/ConfirmDialog";
import { EmptyState } from "../components/ui/empty-state/EmptyState";
import Input from "../components/ui/input/InputField";
import { ContentViewLoading } from "../components/ui/loading/Loading";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../components/ui/table";
import { Tooltip } from "../components/ui/tooltip/Tooltip";
import {
  useCreatePackage,
  useDeletePackage,
  useUpdatePackage,
} from "../hooks/mutations/usePackageMutations";
import { usePackages } from "../hooks/queries/usePackages";
import { useToast } from "../hooks/useToast";
import { formatApiError } from "../lib/api-service";
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

  // Mutations
  const createPackageMutation = useCreatePackage();
  const updatePackageMutation = useUpdatePackage();
  const deletePackageMutation = useDeletePackage();

  // React Query hook
  const { data: packagesData, isLoading: loading, error } = usePackages();

  const packages = (packagesData?.items ?? []) as PricingPackage[];

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
    try {
      if (editingPackage) {
        await updatePackageMutation.mutateAsync({
          packageId: editingPackage.packageId,
          data: formData,
        });
      } else {
        await createPackageMutation.mutateAsync(formData);
      }

      setShowForm(false);
      showToast(
        "success",
        "Sukces",
        editingPackage ? "Pakiet został zaktualizowany" : "Pakiet został utworzony"
      );
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err as Error));
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

    setDeleteConfirmOpen(false);

    try {
      await deletePackageMutation.mutateAsync(packageToDelete);
      showToast("success", "Sukces", "Pakiet został usunięty");
      setPackageToDelete(null);
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err as Error));
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

        {error && <div>{formatApiError(error)}</div>}

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
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={createPackageMutation.isPending || updatePackageMutation.isPending}
            >
              {createPackageMutation.isPending || updatePackageMutation.isPending
                ? "Zapisywanie..."
                : "Zapisz"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (loading && !packagesData) {
    return <ContentViewLoading text="Ładowanie pakietów..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Pakiety</h1>
        <button
          onClick={handleCreate}
          className="text-xl text-brand-500 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300 transition-colors flex items-center gap-2"
        >
          <span className="text-2xl">+</span>
          <span>Dodaj pakiet</span>
        </button>
      </div>

      {error && <div>{formatApiError(error)}</div>}

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
        <div className="w-full">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-100 dark:bg-gray-900">
                <TableCell
                  isHeader
                  className="px-3 py-5 text-left text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Nazwa
                </TableCell>
                <TableCell
                  isHeader
                  className="px-3 py-5 text-left text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Zdjęcia w pakiecie
                </TableCell>
                <TableCell
                  isHeader
                  className="px-3 py-5 text-left text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Cena za dodatkowe zdjęcie
                </TableCell>
                <TableCell
                  isHeader
                  className="px-3 py-5 text-left text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Cena pakietu
                </TableCell>
                <TableCell
                  isHeader
                  className="px-3 py-5 text-left text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Data utworzenia
                </TableCell>
                <TableCell
                  isHeader
                  className="px-3 py-5 text-left text-sm font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Akcje
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packages.map((pkg, index) => {
                const isEvenRow = index % 2 === 0;
                return (
                  <TableRow
                    key={pkg.packageId}
                    className={`h-[120px] ${
                      isEvenRow
                        ? "bg-white dark:bg-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/90"
                        : "bg-gray-50 dark:bg-gray-900/40 hover:bg-gray-100 dark:hover:bg-gray-800/40"
                    }`}
                  >
                    <TableCell className="px-3 py-5 text-base font-medium text-gray-900 dark:text-white align-middle">
                      {pkg.name || "-"}
                    </TableCell>
                    <TableCell className="px-3 py-5 text-base text-gray-900 dark:text-white align-middle">
                      {pkg.includedPhotos}
                    </TableCell>
                    <TableCell className="px-3 py-5 text-base text-gray-900 dark:text-white align-middle">
                      {formatPrice(pkg.pricePerExtraPhoto)}
                    </TableCell>
                    <TableCell className="px-3 py-5 text-base text-gray-900 dark:text-white align-middle">
                      {formatPrice(pkg.price)}
                    </TableCell>
                    <TableCell className="px-3 py-5 text-base text-gray-500 dark:text-gray-400 align-middle">
                      {pkg.createdAt ? new Date(pkg.createdAt).toLocaleDateString("pl-PL") : "-"}
                    </TableCell>
                    <TableCell className="px-3 py-5 align-middle">
                      <div className="flex gap-2 items-center">
                        <Tooltip content="Edytuj">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(pkg)}
                            className="px-0 w-auto h-auto bg-transparent border-0 ring-0 shadow-none hover:bg-transparent dark:bg-transparent dark:hover:bg-transparent text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 -mr-4"
                          >
                            <Pencil className="w-5 h-5" />
                          </Button>
                        </Tooltip>
                        <Tooltip content="Usuń">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteClick(pkg.packageId)}
                            className="px-0 w-auto h-auto bg-transparent border-0 ring-0 shadow-none hover:bg-transparent dark:bg-transparent dark:hover:bg-transparent text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          >
                            <Trash2 className="w-5 h-5" />
                          </Button>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
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
        loading={deletePackageMutation.isPending}
      />
    </div>
  );
}
