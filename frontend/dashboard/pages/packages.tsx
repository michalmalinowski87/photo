import { X, Package, Plus, Pencil, Trash2, Search, ArrowUpDown } from "lucide-react";
import type { GetServerSideProps } from "next";
import { useState, useMemo, useRef, useEffect } from "react";

import Button from "../components/ui/button/Button";
import { ConfirmDialog } from "../components/ui/confirm/ConfirmDialog";
import { Dropdown } from "../components/ui/dropdown/Dropdown";
import { DropdownItem } from "../components/ui/dropdown/DropdownItem";
import { EmptyState } from "../components/ui/empty-state/EmptyState";
import Input from "../components/ui/input/InputField";
import { ContentAreaLoadingOverlay, InlineLoading } from "../components/ui/loading/Loading";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../components/ui/table";
import { Tooltip } from "../components/ui/tooltip/Tooltip";
import {
  useCreatePackage,
  useDeletePackage,
  useUpdatePackage,
} from "../hooks/mutations/usePackageMutations";
import { useInfinitePackages } from "../hooks/useInfinitePackages";
import { useToast } from "../hooks/useToast";
import { formatApiError } from "../lib/api-service";
import { formatCurrencyInput, plnToCents, centsToPlnString } from "../lib/currency";
import { formatPrice } from "../lib/format-price";

interface PricingPackage {
  packageId: string;
  name?: string;
  includedPhotos?: number;
  pricePerExtraPhoto?: number;
  price?: number;
  createdAt?: string;
  [key: string]: unknown;
}

interface PackageFormData {
  name: string;
  includedPhotos: number;
  pricePerExtraPhoto?: number; // Optional
  price: number;
}

// Prevent static generation - this page uses client hooks
export const getServerSideProps: GetServerSideProps = () => {
  return Promise.resolve({ props: {} });
};

export default function Packages() {
  const { showToast } = useToast();

  // Mutations
  const createPackageMutation = useCreatePackage();
  const updatePackageMutation = useUpdatePackage();
  const deletePackageMutation = useDeletePackage();

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

  // Sort state - persisted in localStorage
  const [sortBy, setSortBy] = useState<"name" | "price" | "pricePerExtraPhoto" | "date">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("packagesListSortBy");
      return saved === "name" ||
        saved === "price" ||
        saved === "pricePerExtraPhoto" ||
        saved === "date"
        ? saved
        : "date";
    }
    return "date";
  });
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("packagesListSortOrder");
      return saved === "asc" || saved === "desc" ? saved : "desc";
    }
    return "desc";
  });
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const sortButtonRef = useRef<HTMLButtonElement | null>(null);

  // Save sort preferences
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("packagesListSortBy", sortBy);
      localStorage.setItem("packagesListSortOrder", sortOrder);
    }
  }, [sortBy, sortOrder]);

  const getSortLabel = () => {
    const sortLabels: Record<"name" | "price" | "pricePerExtraPhoto" | "date", string> = {
      name: "Nazwa",
      price: "Cena pakietu",
      pricePerExtraPhoto: "Cena za zdjęcie",
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
  } = useInfinitePackages({
    limit: 20,
    search: debouncedSearchQuery || undefined,
    sortBy,
    sortOrder,
  });

  // Flatten pages into a single array of packages
  const packages = useMemo((): PricingPackage[] => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => {
      if (page && typeof page === "object" && "items" in page && Array.isArray(page.items)) {
        return page.items as PricingPackage[];
      }
      return [] as PricingPackage[];
    });
  }, [data]);

  const [showForm, setShowForm] = useState<boolean>(false);
  const [editingPackage, setEditingPackage] = useState<PricingPackage | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [packageToDelete, setPackageToDelete] = useState<string | null>(null);
  const [formData, setFormData] = useState<PackageFormData>({
    name: "",
    includedPhotos: 0,
    pricePerExtraPhoto: undefined, // Optional, start as undefined
    price: 0,
  });
  const [pricePerExtraPhotoInput, setPricePerExtraPhotoInput] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState<string | null>(null);

  const handleCreate = (): void => {
    setEditingPackage(null);
    setFormData({
      name: "",
      includedPhotos: 0,
      pricePerExtraPhoto: undefined, // Optional, start as undefined
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
      pricePerExtraPhoto: pkg.pricePerExtraPhoto ?? undefined, // Optional
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
            className="w-10 h-10 rounded-full flex items-center justify-center bg-photographer-elevated hover:bg-photographer-muted dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors"
            aria-label="Anuluj"
          >
            <X size={20} />
          </button>
        </div>

        {queryError && <div>{formatApiError(queryError)}</div>}

        <div className="p-6 bg-white border border-gray-400 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Nazwa pakietu
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
                Cena za dodatkowe zdjęcie (PLN)
              </label>
              <Input
                type="text"
                placeholder="5.00"
                value={pricePerExtraPhotoInput ?? (formData.pricePerExtraPhoto ? centsToPlnString(formData.pricePerExtraPhoto) : "")}
                onChange={(e) => {
                  const formatted = formatCurrencyInput(e.target.value);
                  setPricePerExtraPhotoInput(formatted);
                  const cents = plnToCents(formatted);
                  setFormData({
                    ...formData,
                    pricePerExtraPhoto: cents > 0 ? cents : undefined, // Only set if > 0, otherwise undefined
                  });
                }}
                onBlur={() => {
                  if (!pricePerExtraPhotoInput || pricePerExtraPhotoInput === "") {
                    setPricePerExtraPhotoInput(null);
                    setFormData({
                      ...formData,
                      pricePerExtraPhoto: undefined, // Clear to undefined when empty
                    });
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

  // Determine if this is initial load (no data yet)
  const isInitialLoad = loading && packages.length === 0 && (!data || !data.pages || data.pages.length === 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Pakiety</h1>

        {/* Search Input - spans from title to sort dropdown */}
        <div className="relative flex-1 min-w-[150px]">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10">
            <Search size={18} className="text-gray-400 dark:text-gray-500" />
          </div>
          <Input
            type="text"
            placeholder="Szukaj (nazwa pakietu)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`pl-9 ${searchQuery ? "pr-10" : "pr-4"}`}
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

        {/* Sort Dropdown */}
        <div className="relative">
          <button
            ref={sortButtonRef}
            onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
            className="flex items-center gap-2 px-4 py-2.5 h-11 bg-white dark:bg-gray-800 border border-gray-400 dark:border-gray-700 rounded-lg shadow-theme-xs hover:bg-photographer-background dark:hover:bg-gray-700 transition-colors text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap"
          >
            <ArrowUpDown size={16} />
            <span>{getSortLabel()}</span>
          </button>
          <Dropdown
            isOpen={sortDropdownOpen}
            onClose={() => setSortDropdownOpen(false)}
            triggerRef={sortButtonRef}
            className="w-64 bg-white dark:bg-gray-900 shadow-xl rounded-lg border border-gray-400 dark:border-gray-700"
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
                        ? "bg-photographer-accentLight/50 dark:bg-photographer-accent/20 text-photographer-accent dark:text-photographer-accent"
                    : "text-gray-700 dark:text-gray-300 hover:bg-photographer-elevated dark:hover:bg-gray-800"
                }`}
              >
                Nazwa {sortBy === "name" && (sortOrder === "asc" ? "↑" : "↓")}
              </DropdownItem>
              <DropdownItem
                onClick={() => {
                  setSortBy("price");
                  setSortDropdownOpen(false);
                }}
                className={`px-3 py-2 text-sm ${
                  sortBy === "price"
                        ? "bg-photographer-accentLight/50 dark:bg-photographer-accent/20 text-photographer-accent dark:text-photographer-accent"
                    : "text-gray-700 dark:text-gray-300 hover:bg-photographer-elevated dark:hover:bg-gray-800"
                }`}
              >
                Cena pakietu {sortBy === "price" && (sortOrder === "asc" ? "↑" : "↓")}
              </DropdownItem>
              <DropdownItem
                onClick={() => {
                  setSortBy("pricePerExtraPhoto");
                  setSortDropdownOpen(false);
                }}
                className={`px-3 py-2 text-sm ${
                  sortBy === "pricePerExtraPhoto"
                        ? "bg-photographer-accentLight/50 dark:bg-photographer-accent/20 text-photographer-accent dark:text-photographer-accent"
                    : "text-gray-700 dark:text-gray-300 hover:bg-photographer-elevated dark:hover:bg-gray-800"
                }`}
              >
                Cena za zdjęcie{" "}
                {sortBy === "pricePerExtraPhoto" && (sortOrder === "asc" ? "↑" : "↓")}
              </DropdownItem>
              <DropdownItem
                onClick={() => {
                  setSortBy("date");
                  setSortDropdownOpen(false);
                }}
                className={`px-3 py-2 text-sm ${
                  sortBy === "date"
                        ? "bg-photographer-accentLight/50 dark:bg-photographer-accent/20 text-photographer-accent dark:text-photographer-accent"
                    : "text-gray-700 dark:text-gray-300 hover:bg-photographer-elevated dark:hover:bg-gray-800"
                }`}
              >
                Data {sortBy === "date" && (sortOrder === "asc" ? "↑" : "↓")}
              </DropdownItem>
              <div className="border-t border-gray-400 dark:border-gray-700 my-1" />
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
                        ? "bg-photographer-accentLight/50 dark:bg-photographer-accent/20 text-photographer-accent dark:text-photographer-accent"
                    : "text-gray-700 dark:text-gray-300 hover:bg-photographer-elevated dark:hover:bg-gray-800"
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
                    : "text-gray-700 dark:text-gray-300 hover:bg-photographer-elevated dark:hover:bg-gray-800"
                }`}
              >
                Malejąco ↓
              </DropdownItem>
            </div>
          </Dropdown>
        </div>

        {/* Add Package Button */}
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2.5 h-11 bg-photographer-surface dark:bg-gray-800 border border-photographer-border dark:border-gray-700 rounded-lg shadow-theme-xs hover:bg-photographer-elevated dark:hover:bg-gray-700 transition-colors text-sm font-normal text-photographer-heading hover:text-photographer-accentHover dark:text-gray-400 dark:hover:text-gray-300 whitespace-nowrap"
        >
          <Plus size={16} />
          <span>Dodaj pakiet</span>
        </button>
      </div>

      {queryError && <div>{formatApiError(queryError)}</div>}

      {!isInitialLoad && packages.length === 0 ? (
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
        <div className="w-full relative" style={{ minHeight: isInitialLoad ? "calc(100vh - 200px)" : undefined }}>
          {isInitialLoad && <ContentAreaLoadingOverlay text="Ładowanie pakietów..." />}
          <div
            className="w-full overflow-auto"
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
              const totalItemsRendered = packages.length;

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
                    Nazwa
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-3 py-3 h-[51px] text-center text-sm font-medium text-photographer-mutedText uppercase tracking-wider dark:text-gray-400 whitespace-nowrap w-[1%]"
                  >
                    Zdjęcia w pakiecie
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-3 py-3 h-[68px] text-center text-sm font-medium text-photographer-mutedText uppercase tracking-wider dark:text-gray-400 w-[1%]"
                  >
                    <div className="flex flex-col leading-tight">
                      <span className="whitespace-nowrap">Cena za</span>
                      <span className="whitespace-nowrap">dodatkowe zdjęcie</span>
                    </div>
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-3 py-3 h-[51px] text-center text-sm font-medium text-photographer-mutedText uppercase tracking-wider dark:text-gray-400 whitespace-nowrap w-[1%]"
                  >
                    Cena pakietu
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
                {packages.map((pkg, index) => {
                  const isEvenRow = index % 2 === 0;
                  return (
                    <TableRow
                      key={pkg.packageId}
                      className={`h-[72px] ${
                        isEvenRow
                          ? "bg-photographer-lightBeige dark:bg-gray-800/50 hover:bg-photographer-muted dark:hover:bg-gray-800/90"
                          : "bg-photographer-muted dark:bg-gray-900/40 hover:bg-photographer-darkBeige dark:hover:bg-gray-800/40"
                      }`}
                    >
                      <TableCell className="px-3 py-5 text-base font-medium text-gray-900 dark:text-white align-middle">
                        {pkg.name ?? "-"}
                      </TableCell>
                      <TableCell className="px-3 py-5 text-base text-gray-900 dark:text-white align-middle text-center">
                        {pkg.includedPhotos}
                      </TableCell>
                      <TableCell className="px-3 py-5 text-base text-gray-900 dark:text-white align-middle text-center">
                        {formatPrice(pkg.pricePerExtraPhoto)}
                      </TableCell>
                      <TableCell className="px-3 py-5 text-base text-gray-900 dark:text-white align-middle text-center">
                        {formatPrice(pkg.price)}
                      </TableCell>
                      <TableCell className="px-3 py-5 text-base text-gray-900 dark:text-white align-middle text-center">
                        {pkg.createdAt ? new Date(pkg.createdAt).toLocaleDateString("pl-PL") : "-"}
                      </TableCell>
                      <TableCell className="px-3 py-5 align-middle text-center">
                        <div className="flex items-center justify-center">
                          <Tooltip content="Edytuj">
                            <button
                              onClick={() => handleEdit(pkg)}
                              className="flex items-center justify-center w-8 h-8 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 rounded hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors mr-0.5"
                              aria-label="Edytuj"
                            >
                              <Pencil className="w-5 h-5" />
                            </button>
                          </Tooltip>
                          <Tooltip content="Usuń">
                            <button
                              onClick={() => handleDeleteClick(pkg.packageId)}
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
                {isFetchingNextPage && (
                  <TableRow>
                    <TableCell colSpan={6} className="px-3 py-5">
                      <div className="flex justify-center py-4">
                        <InlineLoading text="Ładowanie więcej pakietów..." />
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
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
