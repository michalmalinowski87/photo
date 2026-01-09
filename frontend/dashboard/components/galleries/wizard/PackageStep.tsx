import { Plus, ArrowLeft, Save } from "lucide-react";
import React, { useState, useMemo, useEffect } from "react";

import { formatCurrencyInput, plnToCents, centsToPlnString } from "../../../lib/currency";
import { formatPrice } from "../../../lib/format-price";
import TypeformInput from "../../ui/input/TypeformInput";
import SearchableSelect from "../../ui/select/SearchableSelect";

interface Package {
  packageId: string;
  name?: string;
  includedPhotos?: number;
  pricePerExtraPhoto?: number;
  price?: number;
  [key: string]: unknown;
}

interface PackageStepProps {
  existingPackages: Package[];
  selectedPackageId?: string;
  packageName?: string;
  includedCount: number;
  extraPriceCents: number;
  packagePriceCents: number;
  initialPaymentAmountCents: number;
  onPackageSelect: (packageId: string) => void;
  onDataChange: (updates: {
    selectedPackageId?: string;
    packageName?: string;
    includedCount?: number;
    extraPriceCents?: number;
    packagePriceCents?: number;
    initialPaymentAmountCents?: number;
  }) => void;
  extraPriceInput: string | null;
  packagePriceInput: string | null;
  paymentAmountInput: string | null;
  onExtraPriceInputChange: (value: string | null) => void;
  onPackagePriceInputChange: (value: string | null) => void;
  onPaymentAmountInputChange: (value: string | null) => void;
  fieldErrors?: {
    selectedPackageId?: string;
    packageName?: string;
    includedCount?: string;
    extraPriceCents?: string;
    packagePriceCents?: string;
    initialPaymentAmountCents?: string;
  };
  onPackageSave?: (packageData: {
    name: string;
    includedPhotos: number;
    pricePerExtraPhoto: number;
    price: number;
  }) => Promise<void>;
}

export const PackageStep = ({
  existingPackages,
  selectedPackageId,
  packageName,
  includedCount,
  extraPriceCents,
  packagePriceCents,
  initialPaymentAmountCents,
  onPackageSelect,
  onDataChange,
  extraPriceInput,
  packagePriceInput,
  paymentAmountInput,
  onExtraPriceInputChange,
  onPackagePriceInputChange,
  onPaymentAmountInputChange,
  fieldErrors = {},
  onPackageSave,
}: PackageStepProps) => {
  const [saving, setSaving] = useState(false);
  const [isFormMode, setIsFormMode] = useState(false);

  const formatPriceInput = formatCurrencyInput;

  // Check if current form values match any existing package exactly (excluding name if empty)
  const isDuplicatePackage = useMemo(() => {
    const trimmedName = packageName?.trim() ?? "";

    const isDuplicate = existingPackages.some((pkg) => {
      // If name is provided, check if all values match exactly
      if (trimmedName) {
        const matches =
          (pkg.name?.trim() ?? "") === trimmedName &&
          (pkg.includedPhotos ?? 0) === includedCount &&
          (pkg.pricePerExtraPhoto ?? 0) === extraPriceCents &&
          (pkg.price ?? 0) === packagePriceCents;
        return matches;
      }
      // If name is empty, only check if values match (excluding name)
      return (
        (pkg.includedPhotos ?? 0) === includedCount &&
        (pkg.pricePerExtraPhoto ?? 0) === extraPriceCents &&
        (pkg.price ?? 0) === packagePriceCents
      );
    });

    return isDuplicate;
  }, [packageName, includedCount, extraPriceCents, packagePriceCents, existingPackages]);

  const canSavePackage = useMemo(() => {
    // Check all required fields (name and extraPriceCents are optional)
    // Validation must match CreateGalleryWizard validateStep for consistency
    if (includedCount === undefined || includedCount === null || includedCount <= 0) {
      return false;
    }
    if (packagePriceCents === undefined || packagePriceCents === null || packagePriceCents <= 0) {
      return false;
    }
    // extraPriceCents is optional - only validate it's not negative if provided
    if (extraPriceCents !== undefined && extraPriceCents !== null && extraPriceCents < 0) {
      return false;
    }
    // Enable if values are different from existing packages (not a duplicate)
    return !isDuplicatePackage;
  }, [includedCount, packagePriceCents, extraPriceCents, isDuplicatePackage]);

  // Reset form mode when package is selected
  useEffect(() => {
    if (selectedPackageId && isFormMode) {
      setIsFormMode(false);
    }
  }, [selectedPackageId, isFormMode]);

  // Automatically show form mode when there are no packages
  useEffect(() => {
    if (existingPackages.length === 0 && !isFormMode) {
      setIsFormMode(true);
    }
  }, [existingPackages.length, isFormMode]);

  // Show form mode if user has manually entered data (no selectedPackageId but has package data)
  useEffect(() => {
    const hasManualData = !selectedPackageId && (
      (packageName && packageName.trim() !== "") ||
      includedCount > 0 ||
      extraPriceCents > 0 ||
      packagePriceCents > 0
    );
    if (hasManualData && !isFormMode) {
      setIsFormMode(true);
    }
  }, [selectedPackageId, packageName, includedCount, extraPriceCents, packagePriceCents, isFormMode]);

  // Selector mode - step2-style layout
  if (!isFormMode) {
    return (
      <div className="w-full mt-[150px]">
        <div className="mb-8 md:mb-12">
          <div className="text-2xl md:text-3xl font-medium text-photographer-heading dark:text-white mb-2">
            Ustaw pakiet cenowy *
          </div>
          <p className="text-base text-photographer-mutedText dark:text-gray-400 italic">
            Wybierz istniejący pakiet lub stwórz nowy
          </p>
        </div>
        <div className="flex flex-col gap-6">
          {existingPackages.length > 0 && (
            <div className="w-full">
              <SearchableSelect
                options={existingPackages.map((pkg) => {
                  const namePart = pkg.name ? `${pkg.name} • ` : "";
                  const pricePart = formatPrice(pkg.price ?? 0);
                  const photosPart = `${pkg.includedPhotos ?? 0} zdjęć`;
                  const extraPricePart = formatPrice(pkg.pricePerExtraPhoto ?? 0);

                  return {
                    value: pkg.packageId,
                    label: `${namePart}${pricePart}`,
                    subLabel: `${photosPart} • ${extraPricePart} za dodatkowe`,
                  };
                })}
                label=""
                placeholder="Wybierz pakiet"
                searchPlaceholder="Szukaj pakietu..."
                value={selectedPackageId ?? ""}
                onChange={(value) => {
                  if (value) {
                    onPackageSelect(value);
                  } else {
                    onDataChange({ selectedPackageId: undefined });
                  }
                }}
                emptyMessage="Nie znaleziono pakietów"
                error={!!fieldErrors.selectedPackageId}
                className="[&_button]:text-2xl [&_button]:pb-3 [&_input]:text-2xl [&_input]:pb-3 [&_button]:pt-2 [&_input]:pt-2"
              />
              {fieldErrors.selectedPackageId && (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                  {fieldErrors.selectedPackageId}
                </p>
              )}
            </div>
          )}

          <div>
            <TypeformInput
              type="text"
              label="Kwota wpłacona przez klienta (PLN)"
              placeholder="0.00"
              value={paymentAmountInput ?? centsToPlnString(initialPaymentAmountCents)}
              onChange={(e) => {
                const formatted = formatPriceInput(e.target.value);
                onPaymentAmountInputChange(formatted);
                onDataChange({
                  initialPaymentAmountCents: plnToCents(formatted),
                });
              }}
              onBlur={() => {
                if (!paymentAmountInput || paymentAmountInput === "") {
                  onPaymentAmountInputChange(null);
                }
              }}
              error={!!fieldErrors.initialPaymentAmountCents}
              errorMessage={fieldErrors.initialPaymentAmountCents}
              hint="Kwota wpłacona przez klienta za pakiet zakupiony od fotografa"
            />
          </div>
        </div>

        <div className="flex justify-center mt-28">
          <button
            onClick={() => {
              setIsFormMode(true);
              onDataChange({
                selectedPackageId: undefined,
                packageName: "",
                includedCount: 0,
                extraPriceCents: 0,
                packagePriceCents: 0,
                initialPaymentAmountCents: 0,
              });
            }}
            className="relative p-10 md:p-12 rounded-2xl border-2 border-photographer-border dark:border-gray-700 bg-photographer-elevated dark:bg-gray-800/30 hover:border-photographer-darkBeige dark:hover:border-gray-600 hover:bg-photographer-muted dark:hover:bg-gray-800/50 transition-all duration-300 active:scale-[0.98] flex flex-col items-center space-y-4 opacity-90 hover:opacity-100"
          >
            <div className="w-20 h-20 rounded-full bg-photographer-accent dark:bg-photographer-accentDark flex items-center justify-center">
              <Plus className="w-10 h-10 text-white" strokeWidth={2} />
            </div>
            <div className="text-center">
              <div className="text-xl font-semibold mb-2 text-photographer-heading dark:text-white">
                Wprowadź dane pakietu ręcznie
              </div>
              <div className="text-sm text-photographer-mutedText dark:text-gray-400">
                Wypełnij formularz, aby ustawić pakiet dla tej galerii
              </div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // Form mode - package form with reordered fields
  return (
    <div className="w-full space-y-8 mt-[150px]">
      <div className="mb-8 md:mb-12">
        <div className="text-2xl md:text-3xl font-medium text-gray-900 dark:text-white mb-2">
          Ustaw pakiet cenowy *
        </div>
        <p className="text-base text-gray-500 dark:text-gray-400 italic">
          Wybierz istniejący pakiet lub stwórz nowy
        </p>
      </div>
      {/* Back to selector button - only show when packages exist */}
      {existingPackages.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => {
              setIsFormMode(false);
              // Clear manual entry data when going back to selection
              onDataChange({
                selectedPackageId: undefined,
                packageName: "",
                includedCount: 0,
                extraPriceCents: 0,
                packagePriceCents: 0,
                initialPaymentAmountCents: 0,
              });
              // Clear input states
              onExtraPriceInputChange(null);
              onPackagePriceInputChange(null);
              onPaymentAmountInputChange(null);
            }}
            className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
          >
            <ArrowLeft size={16} />
            Wróć do wyboru
          </button>
        </div>
      )}

      <div className="space-y-6">
        {/* Reordered fields: Row 1 - Package price + Payment amount */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <TypeformInput
              type="text"
              label="Cena pakietu (PLN) *"
              placeholder="0.00"
              value={packagePriceInput ?? centsToPlnString(packagePriceCents)}
              onChange={(e) => {
                const formatted = formatPriceInput(e.target.value);
                onPackagePriceInputChange(formatted);
                onDataChange({ packagePriceCents: plnToCents(formatted) });
              }}
              onBlur={() => {
                if (!packagePriceInput || packagePriceInput === "") {
                  onPackagePriceInputChange(null);
                }
              }}
              error={!!fieldErrors.packagePriceCents}
              errorMessage={fieldErrors.packagePriceCents}
              autoFocus
            />
          </div>
          <div>
            <TypeformInput
              type="text"
              label="Kwota wpłacona przez klienta (PLN)"
              placeholder="0.00"
              value={paymentAmountInput ?? centsToPlnString(initialPaymentAmountCents)}
              onChange={(e) => {
                const formatted = formatPriceInput(e.target.value);
                onPaymentAmountInputChange(formatted);
                onDataChange({
                  initialPaymentAmountCents: plnToCents(formatted),
                });
              }}
              onBlur={() => {
                if (!paymentAmountInput || paymentAmountInput === "") {
                  onPaymentAmountInputChange(null);
                }
              }}
              error={!!fieldErrors.initialPaymentAmountCents}
              errorMessage={fieldErrors.initialPaymentAmountCents}
              hint="Kwota wpłacona przez klienta za pakiet zakupiony od fotografa"
            />
          </div>
        </div>

        {/* Reordered fields: Row 2 - Number of photos + Price per additional photo */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <TypeformInput
              type="text"
              label="Liczba zdjęć w pakiecie *"
              placeholder="0"
              value={includedCount || ""}
              onChange={(e) => {
                const value = e.target.value;
                // Only allow digits
                if (value === "" || /^\d+$/.test(value)) {
                  onDataChange({ includedCount: value === "" ? 0 : parseInt(value, 10) || 0 });
                }
              }}
              error={!!fieldErrors.includedCount}
              errorMessage={fieldErrors.includedCount}
            />
          </div>
          <div>
            <TypeformInput
              type="text"
              label="Cena za dodatkowe zdjęcie (PLN)"
              placeholder="0.00"
              value={extraPriceInput ?? centsToPlnString(extraPriceCents)}
              onChange={(e) => {
                const formatted = formatPriceInput(e.target.value);
                onExtraPriceInputChange(formatted);
                onDataChange({ extraPriceCents: plnToCents(formatted) });
              }}
              onBlur={() => {
                if (!extraPriceInput || extraPriceInput === "") {
                  onExtraPriceInputChange(null);
                }
              }}
              error={!!fieldErrors.extraPriceCents}
              errorMessage={fieldErrors.extraPriceCents}
            />
          </div>
        </div>

        {/* Package name field - optional, at the bottom */}
        <div>
          <TypeformInput
            type="text"
            name="package-name"
            label="Nazwa pakietu"
            placeholder="Nazwa pakietu (opcjonalne)"
            value={packageName ?? ""}
            onChange={(e) => onDataChange({ packageName: e.target.value || undefined })}
            error={!!fieldErrors.packageName}
            errorMessage={fieldErrors.packageName}
            autoComplete="off"
          />
        </div>

        <div className="pt-4">
          <div className="flex items-center justify-between gap-3">
            <div />
            {onPackageSave && (
              <div className="group relative">
                <button
                  onClick={async () => {
                    if (!canSavePackage) {
                      return;
                    }
                    setSaving(true);
                    try {
                      // Use package name if provided, otherwise use empty string (will be auto-generated on backend or use default)
                      await onPackageSave({
                        name: packageName?.trim() ?? "",
                        includedPhotos: includedCount,
                        pricePerExtraPhoto: extraPriceCents,
                        price: packagePriceCents,
                      });
                      // Reset payment amount when new package is saved
                      onDataChange({ initialPaymentAmountCents: 0 });
                      onPaymentAmountInputChange(null);
                    } finally {
                      setSaving(false);
                    }
                  }}
                  disabled={!canSavePackage || saving}
                  className="flex items-center gap-2 text-lg text-photographer-accentDark dark:text-green-500 hover:text-photographer-accentDark dark:hover:text-green-400 transition-colors opacity-70 hover:opacity-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-photographer-accentDark dark:disabled:hover:text-green-500"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-photographer-accentDark dark:border-green-500 border-t-transparent rounded-full animate-spin"></div>
                      <span>Zapisywanie...</span>
                    </>
                  ) : (
                    <>
                      <Save size={18} />
                      <span>Zapisz pakiet</span>
                    </>
                  )}
                </button>
                {!canSavePackage && (
                  <div className="absolute bottom-full right-0 mb-2 w-60 max-w-[calc(100vw-2rem)] p-2 bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
                    Wypełnij wszystkie wymagane pola
                    <div className="absolute top-full right-8 -mt-1 border-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
