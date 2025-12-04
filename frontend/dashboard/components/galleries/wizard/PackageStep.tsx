import { Plus } from "lucide-react";
import React, { useState, useMemo } from "react";

import { formatCurrencyInput, plnToCents, centsToPlnString } from "../../../lib/currency";
import { formatPrice } from "../../../lib/format-price";
import Badge from "../../ui/badge/Badge";
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
  packageName: string;
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

export const PackageStep: React.FC<PackageStepProps> = ({
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
}) => {
  const [saving, setSaving] = useState(false);
  // Calculate payment status based on package price and payment amount
  const packagePriceCentsForStatus = packagePriceCents ?? 0;
  const paymentStatusForPakiet =
    initialPaymentAmountCents === 0
      ? "UNPAID"
      : initialPaymentAmountCents >= packagePriceCentsForStatus
        ? "PAID"
        : "PARTIALLY_PAID";

  const formatPriceInput = formatCurrencyInput;

  // Check if current form values match any existing package exactly
  const isDuplicatePackage = useMemo(() => {
    const trimmedName = packageName.trim();
    if (!trimmedName) {
      return false;
    }
    
    const isDuplicate = existingPackages.some((pkg) => {
      // Check if all values match exactly (including the selected package if it matches)
      const matches = (
        (pkg.name?.trim() ?? "") === trimmedName &&
        (pkg.includedPhotos ?? 0) === includedCount &&
        (pkg.pricePerExtraPhoto ?? 0) === extraPriceCents &&
        (pkg.price ?? 0) === packagePriceCents
      );
      
      // If a package is selected and it matches, it's a duplicate (can't save same package)
      // If a different package matches, it's also a duplicate
      return matches;
    });
    
    return isDuplicate;
  }, [packageName, includedCount, extraPriceCents, packagePriceCents, existingPackages]);

  const canSavePackage = useMemo(() => {
    const trimmedName = packageName.trim();
    // Check all required fields
    if (!trimmedName) {
      return false;
    }
    if (includedCount === undefined || includedCount === null) {
      return false;
    }
    if (packagePriceCents === undefined || packagePriceCents === null) {
      return false;
    }
    if (extraPriceCents === undefined || extraPriceCents === null) {
      return false;
    }
    // Enable if values are different from existing packages (not a duplicate)
    return !isDuplicatePackage;
  }, [packageName, includedCount, packagePriceCents, extraPriceCents, isDuplicatePackage]);

  const disabledReason = useMemo(() => {
    const trimmedName = packageName.trim();
    if (!trimmedName) {
      return "Nazwa pakietu jest wymagana";
    }
    if (includedCount === undefined || includedCount === null) {
      return "Liczba zdjęć w pakiecie jest wymagana";
    }
    if (packagePriceCents === undefined || packagePriceCents === null || packagePriceCents === 0) {
      return "Cena pakietu jest wymagana";
    }
    if (extraPriceCents === undefined || extraPriceCents === null) {
      return "Cena za dodatkowe zdjęcie jest wymagana";
    }
    if (isDuplicatePackage) {
      return "Pakiet o takich samych wartościach już istnieje";
    }
    return "";
  }, [packageName, includedCount, packagePriceCents, extraPriceCents, isDuplicatePackage]);

  const isSaveDisabled = saving || !canSavePackage;

  return (
    <div className="w-full space-y-8">
      {existingPackages.length > 0 && (
        <div>
          <SearchableSelect
            options={existingPackages.map((pkg) => ({
              value: pkg.packageId,
              label: `${pkg.name} - ${formatPrice(pkg.price ?? 0)}`,
            }))}
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
          />
        </div>
      )}

      <div className="space-y-6">
        <div>
          <TypeformInput
            type="text"
            name="package-name"
            label="Nazwa pakietu *"
            placeholder="Nazwa pakietu"
            value={packageName}
            onChange={(e) => onDataChange({ packageName: e.target.value })}
            error={!!fieldErrors.packageName}
            errorMessage={fieldErrors.packageName}
            autoComplete="off"
            autoFocus
          />
        </div>

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
              label="Cena za dodatkowe zdjęcie (PLN) *"
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

        <div className="pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600 dark:text-gray-400">Status płatności:</span>
              <Badge
                color={
                  paymentStatusForPakiet === "PAID"
                    ? "success"
                    : paymentStatusForPakiet === "PARTIALLY_PAID"
                      ? "warning"
                      : "error"
                }
                variant="light"
              >
                {paymentStatusForPakiet === "PAID"
                  ? "Opłacone"
                  : paymentStatusForPakiet === "PARTIALLY_PAID"
                    ? "Częściowo opłacone"
                    : "Nieopłacone"}
              </Badge>
            </div>
            {onPackageSave && (
              <div className="group relative">
                <button
                  onClick={async () => {
                    if (!packageName.trim() || isDuplicatePackage) {
                      return;
                    }
                    setSaving(true);
                    try {
                      await onPackageSave({
                        name: packageName.trim(),
                        includedPhotos: includedCount,
                        pricePerExtraPhoto: extraPriceCents,
                        price: packagePriceCents,
                      });
                    } finally {
                      setSaving(false);
                    }
                  }}
                  disabled={isSaveDisabled}
                  className="flex items-center gap-2 text-base text-brand-500 dark:text-brand-400 hover:text-brand-600 dark:hover:text-brand-300 transition-colors opacity-70 hover:opacity-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-brand-500 dark:disabled:hover:text-brand-400"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-brand-500 dark:border-brand-400 border-t-transparent rounded-full animate-spin"></div>
                      <span>Zapisywanie...</span>
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      <span>Zapisz pakiet</span>
                    </>
                  )}
                </button>
                {isSaveDisabled && disabledReason && (
                  <div className="absolute bottom-full right-0 mb-2 w-80 max-w-[calc(100vw-2rem)] p-2 bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
                    {disabledReason}
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
