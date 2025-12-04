import { Plus } from "lucide-react";
import React, { useState } from "react";

import { generatePassword } from "../../../lib/password";
import Button from "../../ui/button/Button";
import Input from "../../ui/input/InputField";
import Select from "../../ui/select/Select";

interface Client {
  clientId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  isCompany?: boolean;
  companyName?: string;
  nip?: string;
  [key: string]: unknown;
}

interface ClientStepProps {
  existingClients: Client[];
  selectedClientId?: string;
  clientEmail: string;
  clientPassword: string;
  isCompany: boolean;
  isVatRegistered: boolean;
  firstName: string;
  lastName: string;
  phone: string;
  nip: string;
  companyName: string;
  selectionEnabled: boolean;
  onClientSelect: (clientId: string) => void;
  onDataChange: (updates: {
    selectedClientId?: string;
    clientEmail?: string;
    clientPassword?: string;
    isCompany?: boolean;
    isVatRegistered?: boolean;
    firstName?: string;
    lastName?: string;
    phone?: string;
    nip?: string;
    companyName?: string;
  }) => void;
  onClientSave?: (clientData: {
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    isCompany: boolean;
    companyName: string;
    nip: string;
  }) => Promise<void>;
}

export const ClientStep: React.FC<ClientStepProps> = ({
  existingClients,
  selectedClientId,
  clientEmail,
  clientPassword,
  isCompany,
  isVatRegistered,
  firstName,
  lastName,
  phone,
  nip,
  companyName,
  selectionEnabled,
  onClientSelect,
  onDataChange,
  onClientSave,
}) => {
  const [saving, setSaving] = useState(false);

  const canSaveClient = () => {
    if (!clientEmail.trim()) {return false;}
    if (isCompany) {
      return !!(companyName.trim() && nip.trim());
    } else {
      return !!(firstName.trim() && lastName.trim());
    }
  };
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center space-y-2">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Dane klienta</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Wybierz istniejącego klienta lub wprowadź nowe dane
        </p>
      </div>
      <div className="space-y-6">
        {existingClients.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Wybierz klienta (opcjonalne)
            </label>
            <Select
              options={existingClients.map((client) => ({
                value: client.clientId,
                label: client.isCompany
                  ? `${client.companyName} (${client.email})`
                  : `${client.firstName} ${client.lastName} (${client.email})`,
              }))}
              placeholder="Wybierz klienta"
              value={selectedClientId ?? ""}
              onChange={(value) => {
                if (value) {
                  onClientSelect(value);
                } else {
                  onDataChange({
                    selectedClientId: undefined,
                    clientEmail: "",
                    firstName: "",
                    lastName: "",
                    companyName: "",
                    nip: "",
                    phone: "",
                    isCompany: false,
                    isVatRegistered: false,
                  });
                }
              }}
            />
          </div>
        )}

        <div className="space-y-4 p-6 bg-gray-50/50 dark:bg-gray-800/30 rounded-xl border border-gray-200 dark:border-gray-700">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Email klienta *
            </label>
            <Input
              type="email"
              placeholder="email@example.com"
              value={clientEmail}
              onChange={(e) => onDataChange({ clientEmail: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Hasło *
            </label>
            <div className="flex gap-2 items-stretch">
              <div className="flex-1">
                <Input
                  type="password"
                  placeholder="Hasło"
                  value={clientPassword}
                  onChange={(e) => onDataChange({ clientPassword: e.target.value })}
                  required
                />
              </div>
              <Button
                type="button"
                onClick={() => {
                  const newPassword = generatePassword();
                  onDataChange({ clientPassword: newPassword });
                }}
                className="bg-green-600 hover:bg-green-700 text-white whitespace-nowrap h-11 self-stretch"
              >
                Generuj
              </Button>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {selectionEnabled
                ? "Hasło do wyboru zdjęć przez klienta"
                : "Hasło do dostępu do finalnej galerii"}
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isCompany}
              onChange={(e) =>
                onDataChange({
                  isCompany: e.target.checked,
                  isVatRegistered: e.target.checked ? isVatRegistered : false,
                })
              }
              className="w-4 h-4 text-brand-500 rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Firma</span>
          </label>
          {isCompany ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Nazwa firmy *
                </label>
                <Input
                  type="text"
                  placeholder="Nazwa firmy"
                  value={companyName}
                  onChange={(e) => onDataChange({ companyName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  NIP *
                </label>
                <Input
                  type="text"
                  placeholder="NIP"
                  value={nip}
                  onChange={(e) => onDataChange({ nip: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isVatRegistered}
                  onChange={(e) => onDataChange({ isVatRegistered: e.target.checked })}
                  className="w-4 h-4 text-brand-500 rounded"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Firma zarejestrowana jako podatnik VAT
                </span>
              </label>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Imię *
                </label>
                <Input
                  type="text"
                  placeholder="Imię"
                  value={firstName}
                  onChange={(e) => onDataChange({ firstName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Nazwisko *
                </label>
                <Input
                  type="text"
                  placeholder="Nazwisko"
                  value={lastName}
                  onChange={(e) => onDataChange({ lastName: e.target.value })}
                />
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Telefon (opcjonalne)
            </label>
            <Input
              type="tel"
              placeholder="Telefon"
              value={phone}
              onChange={(e) => onDataChange({ phone: e.target.value })}
            />
          </div>
        </div>
      </div>
      {onClientSave && (
        <div className="flex justify-end -mt-[12px]">
          <button
            onClick={async () => {
              if (!canSaveClient()) {
                return;
              }
              setSaving(true);
              try {
                await onClientSave({
                  email: clientEmail.trim(),
                  firstName: firstName.trim(),
                  lastName: lastName.trim(),
                  phone: phone.trim(),
                  isCompany,
                  companyName: companyName.trim(),
                  nip: nip.trim(),
                });
              } finally {
                setSaving(false);
              }
            }}
            disabled={!!selectedClientId || saving || !canSaveClient()}
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
                <span>Zapisz klienta</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
