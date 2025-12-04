import { Plus } from "lucide-react";
import React, { useState } from "react";

import { formatCurrencyInput, plnToCents, centsToPlnString } from "../../../lib/currency";
import { formatPrice } from "../../../lib/format-price";
import Badge from "../../ui/badge/Badge";
import Input from "../../ui/input/InputField";
import Select from "../../ui/select/Select";

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

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center space-y-2">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Pakiet cenowy</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Wybierz pakiet lub wprowadź dane ręcznie
        </p>
      </div>
      <div className="space-y-6">
        {existingPackages.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Wybierz pakiet (opcjonalne)
            </label>
            <Select
              options={existingPackages.map((pkg) => ({
                value: pkg.packageId,
                label: `${pkg.name} - ${formatPrice(pkg.price ?? 0)}`,
              }))}
              placeholder="Wybierz pakiet"
              value={selectedPackageId ?? ""}
              onChange={(value) => {
                if (value) {
                  onPackageSelect(value);
                } else {
                  onDataChange({ selectedPackageId: undefined });
                }
              }}
            />
          </div>
        )}

        <div className="space-y-4 p-6 bg-gray-50/50 dark:bg-gray-800/30 rounded-xl border border-gray-200 dark:border-gray-700">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Nazwa pakietu *
            </label>
            <Input
              type="text"
              placeholder="Nazwa pakietu"
              value={packageName}
              onChange={(e) => onDataChange({ packageName: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Liczba zdjęć w pakiecie
            </label>
            <Input
              type="number"
              placeholder="0"
              value={includedCount}
              onChange={(e) => onDataChange({ includedCount: parseInt(e.target.value) || 0 })}
              min="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Cena za dodatkowe zdjęcie (PLN)
            </label>
            <Input
              type="text"
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
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Cena pakietu (PLN)
            </label>
            <Input
              type="text"
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
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Kwota wpłacona przez klienta za pakiet (PLN)
            </label>
            <Input
              type="text"
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
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Kwota wpłacona przez klienta za pakiet zakupiony od fotografa
            </p>
          </div>
          {packagePriceCentsForStatus > 0 && (
            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <p className="text-sm text-gray-600 dark:text-gray-400">Status płatności:</p>
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
            </div>
          )}
        </div>
      </div>
      {onPackageSave && (
        <div className="flex justify-end -mt-[12px]">
          <button
            onClick={async () => {
              if (!packageName.trim()) {
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
            disabled={!!selectedPackageId || saving || !packageName.trim()}
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
        </div>
      )}
    </div>
  );
};
