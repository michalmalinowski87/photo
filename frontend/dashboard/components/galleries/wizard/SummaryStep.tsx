import React from "react";

import { formatPrice } from "../../../lib/format-price";

interface Client {
  clientId: string;
  email?: string;
  [key: string]: unknown;
}

interface SummaryStepProps {
  selectionEnabled: boolean;
  galleryName: string;
  selectedClientId?: string;
  clientEmail: string;
  existingClients: Client[];
  packageName: string;
  includedCount: number;
  extraPriceCents: number;
  packagePriceCents: number;
  initialPaymentAmountCents: number;
}

export const SummaryStep: React.FC<SummaryStepProps> = ({
  selectionEnabled,
  galleryName,
  selectedClientId,
  clientEmail,
  existingClients,
  packageName,
  includedCount,
  extraPriceCents,
  packagePriceCents,
  initialPaymentAmountCents,
}) => {
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="text-center">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Podsumowanie</h3>
      </div>

      <div className="space-y-4 p-5 bg-gray-50/50 dark:bg-gray-800/30 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="space-y-3">
          <div className="flex justify-between items-center pb-3 border-b border-gray-200 dark:border-gray-700">
            <span className="text-sm text-gray-600 dark:text-gray-400">Typ galerii:</span>
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {selectionEnabled ? "Wybór przez klienta" : "Wszystkie zdjęcia"}
            </span>
          </div>
          <div className="flex justify-between items-center pb-3 border-b border-gray-200 dark:border-gray-700">
            <span className="text-sm text-gray-600 dark:text-gray-400">Nazwa galerii:</span>
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {galleryName ?? "Brak"}
            </span>
          </div>
          <div className="flex justify-between items-center pb-3 border-b border-gray-200 dark:border-gray-700">
            <span className="text-sm text-gray-600 dark:text-gray-400">Klient:</span>
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {selectedClientId
                ? (existingClients.find((c) => c.clientId === selectedClientId)?.email ??
                  "Nie wybrano")
                : (clientEmail ?? "Nie podano")}
            </span>
          </div>

          <div className="pt-3 space-y-2">
            <div className="text-xs font-semibold text-gray-900 dark:text-white mb-1.5">
              Pakiet cenowy:
            </div>
            <div className="pl-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Nazwa:</span>
                <span className="font-medium text-gray-900 dark:text-white">{packageName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Liczba zdjęć:</span>
                <span className="font-medium text-gray-900 dark:text-white">{includedCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Cena za dodatkowe:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formatPrice(extraPriceCents)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Cena pakietu:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formatPrice(packagePriceCents)}
                </span>
              </div>
              {initialPaymentAmountCents > 0 && (
                <div className="flex justify-between pt-1.5 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">
                    Kwota wpłacona przez klienta:
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatPrice(initialPaymentAmountCents)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="pt-3 space-y-2 border-t border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Plan galerii zostanie obliczony automatycznie po przesłaniu zdjęć.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
