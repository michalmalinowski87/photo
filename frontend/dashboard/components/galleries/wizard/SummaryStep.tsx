import { Image, User, Package, CheckCircle2 } from "lucide-react";
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
    <div className="w-full">
      {/* Vertical Stack Layout - Modern Design */}
      <div className="flex flex-col gap-5">
        {/* Gallery Info Card */}
        <div className="group relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200/60 dark:border-gray-700/60 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-brand-50/50 to-transparent dark:from-brand-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
          <div className="relative p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-500/10">
                <Image className="w-5 h-5 text-brand-600 dark:text-brand-400" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Galeria
              </h3>
            </div>
            <div className="space-y-3.5">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Typ</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {selectionEnabled ? "Wybór przez klienta" : "Wszystkie zdjęcia"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Nazwa</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white break-words">
                  {galleryName || "Brak"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Client Info Card */}
        <div className="group relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200/60 dark:border-gray-700/60 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-50/50 to-transparent dark:from-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
          <div className="relative p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-purple-50 dark:bg-purple-500/10">
                <User className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Klient
              </h3>
            </div>
            <div className="space-y-3.5">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Email</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white break-all">
                  {(selectedClient?.email ?? clientEmail) || "Nie podano"}
                </p>
              </div>
              {selectedClient?.firstName && (
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Imię i nazwisko</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {selectedClient.firstName} {selectedClient.lastName}
                  </p>
                </div>
              )}
              {selectedClient?.companyName && (
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Firma</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {selectedClient.companyName}
                  </p>
                  {selectedClient.nip && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 font-normal">
                      NIP: {selectedClient.nip}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Package Info Card */}
        <div className="group relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200/60 dark:border-gray-700/60 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/50 to-transparent dark:from-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
          <div className="relative p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-500/10">
                <Package className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Pakiet
              </h3>
            </div>
            <div className="space-y-3.5">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Nazwa</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{packageName}</p>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Zdjęć</p>
                  <p className="text-base font-bold text-gray-900 dark:text-white">
                    {includedCount}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Za dodatkowe</p>
                  <p className="text-base font-bold text-gray-900 dark:text-white">
                    {formatPrice(extraPriceCents)}
                  </p>
                </div>
              </div>
              <div className="pt-3.5 border-t border-gray-200/80 dark:border-gray-700/80">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Cena pakietu</p>
                <p className="text-xl font-bold text-brand-600 dark:text-brand-400">
                  {formatPrice(packagePriceCents)}
                </p>
              </div>
              {initialPaymentAmountCents > 0 && (
                <div className="pt-3.5 border-t border-gray-200/80 dark:border-gray-700/80">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Wpłacono</p>
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {formatPrice(initialPaymentAmountCents)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modern Info Footer */}
      <div className="mt-6 flex items-center gap-3 p-4 rounded-lg bg-gray-50/50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50">
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex-shrink-0">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
          Plan galerii zostanie obliczony automatycznie po przesłaniu zdjęć.
        </p>
      </div>
    </div>
  );
};
