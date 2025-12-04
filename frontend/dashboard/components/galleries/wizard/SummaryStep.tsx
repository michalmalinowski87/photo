import React from "react";

import { formatPrice } from "../../../lib/format-price";

interface Client {
  clientId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  nip?: string;
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
  const selectedClient = existingClients.find((c) => c.clientId === selectedClientId);

  return (
    <div className="w-full space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
        {/* Gallery Details */}
        <div className="space-y-6">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
              Typ galerii
            </p>
            <p className="text-lg text-gray-900 dark:text-white">
              {selectionEnabled ? "Wybór przez klienta" : "Wszystkie zdjęcia"}
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
              Nazwa galerii
            </p>
            <p className="text-lg text-gray-900 dark:text-white">{galleryName || "Brak"}</p>
          </div>
        </div>

        {/* Client Details */}
        <div className="space-y-6">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
              Klient
            </p>
            <div className="space-y-1">
              <p className="text-lg text-gray-900 dark:text-white">
                {selectedClient?.email || clientEmail || "Nie podano"}
              </p>
              {selectedClient?.firstName && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedClient.firstName} {selectedClient.lastName}
                </p>
              )}
              {selectedClient?.companyName && (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {selectedClient.companyName}
                  </p>
                  {selectedClient.nip && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      NIP: {selectedClient.nip}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Package Details */}
        <div className="space-y-4 md:col-span-2">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">
            Pakiet cenowy
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Nazwa:</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {packageName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Liczba zdjęć:</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {includedCount}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Cena za dodatkowe:
              </span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {formatPrice(extraPriceCents)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Cena pakietu:</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {formatPrice(packagePriceCents)}
              </span>
            </div>
            {initialPaymentAmountCents > 0 && (
              <div className="flex justify-between pt-3 border-t border-gray-200 dark:border-gray-700 md:col-span-2">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Kwota wpłacona:
                </span>
                <span className="text-sm font-bold text-brand-600 dark:text-brand-400">
                  {formatPrice(initialPaymentAmountCents)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="pt-4">
        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
          Plan galerii zostanie obliczony automatycznie po przesłaniu zdjęć.
        </p>
      </div>
    </div>
  );
};
