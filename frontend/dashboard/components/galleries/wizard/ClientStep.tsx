import { Plus, Check, X } from "lucide-react";
import React, { useState, useMemo } from "react";

import { generatePassword } from "../../../lib/password";
import Button from "../../ui/button/Button";
import TypeformInput from "../../ui/input/TypeformInput";
import SearchableSelect from "../../ui/select/SearchableSelect";

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
  fieldErrors?: {
    clientEmail?: string;
    clientPassword?: string;
    firstName?: string;
    lastName?: string;
    companyName?: string;
    nip?: string;
  };
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
  fieldErrors = {},
  onClientSave,
}) => {
  const [saving, setSaving] = useState(false);

  // Check if current email matches any existing client
  const isDuplicateClient = useMemo(() => {
    const trimmedEmail = clientEmail.trim().toLowerCase();
    if (!trimmedEmail) {
      return false;
    }
    
    const isDuplicate = existingClients.some((client) => {
      const existingEmail = (client.email ?? "").trim().toLowerCase();
      return existingEmail === trimmedEmail;
    });
    
    return isDuplicate;
  }, [clientEmail, existingClients]);

  const canSaveClient = useMemo(() => {
    const trimmedEmail = clientEmail.trim();
    // Check all required fields
    if (!trimmedEmail) {
      return false;
    }
    if (!clientPassword.trim()) {
      return false;
    }
    if (isCompany) {
      if (!companyName.trim() || !nip.trim()) {
        return false;
      }
    } else {
      if (!firstName.trim() || !lastName.trim()) {
        return false;
      }
    }
    // Enable if email is different from existing clients (not a duplicate)
    return !isDuplicateClient;
  }, [clientEmail, clientPassword, isCompany, companyName, nip, firstName, lastName, isDuplicateClient]);

  const disabledReason = useMemo(() => {
    const trimmedEmail = clientEmail.trim();
    if (!trimmedEmail) {
      return "Email klienta jest wymagany";
    }
    if (!clientPassword.trim()) {
      return "Hasło jest wymagane";
    }
    if (isCompany) {
      if (!companyName.trim()) {
        return "Nazwa firmy jest wymagana";
      }
      if (!nip.trim()) {
        return "NIP jest wymagany";
      }
    } else {
      if (!firstName.trim()) {
        return "Imię jest wymagane";
      }
      if (!lastName.trim()) {
        return "Nazwisko jest wymagane";
      }
    }
    if (isDuplicateClient) {
      return "Klient o tym adresie email już istnieje";
    }
    return "";
  }, [clientEmail, clientPassword, isCompany, companyName, nip, firstName, lastName, isDuplicateClient]);

  const isSaveDisabled = !canSaveClient;

  const clientOptions = existingClients.map((client) => ({
    value: client.clientId,
    label: client.isCompany
      ? client.companyName ?? ""
      : `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() || "Bez nazwy",
    subLabel: client.email ?? "",
  }));

  return (
    <div className="w-full space-y-4">
      {existingClients.length > 0 && (
        <div>
          <SearchableSelect
            options={clientOptions}
            label=""
            placeholder="Wybierz klienta"
            searchPlaceholder="Szukaj po imieniu, nazwisku, email..."
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
            emptyMessage="Nie znaleziono klientów"
          />
        </div>
      )}

      <div>
        <div className="space-y-0">
          <div>
            <TypeformInput
              type="email"
              label="Email klienta"
              placeholder="email@example.com"
              value={clientEmail}
              onChange={(e) => onDataChange({ clientEmail: e.target.value })}
              error={!!fieldErrors.clientEmail}
              errorMessage={fieldErrors.clientEmail}
              required
              autoFocus
            />
          </div>

          <div>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <TypeformInput
                  type="password"
                  label="Hasło"
                  placeholder="Hasło"
                  value={clientPassword}
                  onChange={(e) => onDataChange({ clientPassword: e.target.value })}
                  required
                  error={!!fieldErrors.clientPassword}
                  errorMessage={fieldErrors.clientPassword}
                  hint={
                    !fieldErrors.clientPassword
                      ? selectionEnabled
                        ? "Hasło do wyboru zdjęć przez klienta"
                        : "Hasło do dostępu do finalnej galerii"
                      : undefined
                  }
                />
                <div className="absolute right-0 bottom-[36px]">
                  <Button
                    type="button"
                    onClick={() => {
                      const newPassword = generatePassword();
                      onDataChange({ clientPassword: newPassword });
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white whitespace-nowrap h-11"
                  >
                    Generuj
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2 mt-12">
          <div className="flex gap-6 pb-1">
          <button
            type="button"
            onClick={() =>
              onDataChange({
                isCompany: false,
                isVatRegistered: false,
              })
            }
            className={`text-base font-medium transition-colors border-b-2 pb-2 ${
              !isCompany
                ? "border-gray-900 dark:border-gray-300 text-gray-900 dark:text-white"
                : "border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
            }`}
          >
            Osoba fizyczna
          </button>
          <button
            type="button"
            onClick={() =>
              onDataChange({
                isCompany: true,
                isVatRegistered,
              })
            }
            className={`text-base font-medium transition-colors border-b-2 pb-2 ${
              isCompany
                ? "border-gray-900 dark:border-gray-300 text-gray-900 dark:text-white"
                : "border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
            }`}
          >
            Firma
          </button>
          </div>

        {isCompany ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <TypeformInput
                  type="text"
                  label="Nazwa firmy"
                  placeholder="Nazwa firmy"
                  value={companyName}
                  onChange={(e) => onDataChange({ companyName: e.target.value })}
                  required
                  error={!!fieldErrors.companyName}
                  errorMessage={fieldErrors.companyName}
                />
              </div>
              <div>
                <TypeformInput
                  type="text"
                  label="NIP"
                  placeholder="NIP"
                  value={nip}
                  onChange={(e) => onDataChange({ nip: e.target.value })}
                  required
                  error={!!fieldErrors.nip}
                  errorMessage={fieldErrors.nip}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <TypeformInput
                type="text"
                label="Imię"
                placeholder="Imię"
                value={firstName}
                onChange={(e) => onDataChange({ firstName: e.target.value })}
                required
                error={!!fieldErrors.firstName}
                errorMessage={fieldErrors.firstName}
              />
            </div>
            <div>
              <TypeformInput
                type="text"
                label="Nazwisko"
                placeholder="Nazwisko"
                value={lastName}
                onChange={(e) => onDataChange({ lastName: e.target.value })}
                required
                error={!!fieldErrors.lastName}
                errorMessage={fieldErrors.lastName}
              />
            </div>
          </div>
        )}

        <div>
          <TypeformInput
            type="tel"
            label="Telefon"
            placeholder="Telefon"
            value={phone}
            onChange={(e) => onDataChange({ phone: e.target.value })}
          />
        </div>
        </div>
      </div>

      {onClientSave && (
        <div className="pt-2">
          <div className="flex items-center justify-between gap-3">
            {isCompany && (
              <button
                type="button"
                onClick={() => onDataChange({ isVatRegistered: !isVatRegistered })}
                className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
              >
                {isVatRegistered ? (
                  <>
                    <Check size={16} className="text-brand-500 dark:text-brand-400" />
                    <span>Firma zarejestrowana jako podatnik VAT</span>
                  </>
                ) : (
                  <>
                    <X size={16} className="text-gray-400 dark:text-gray-500" />
                    <span>Firma zarejestrowana jako podatnik VAT</span>
                  </>
                )}
              </button>
            )}
            {!isCompany && <div />}
            <div className="group relative">
              <button
                onClick={async () => {
                  if (!canSaveClient) {
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
                disabled={isSaveDisabled || saving}
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
              {isSaveDisabled && disabledReason && (
                <div className="absolute bottom-full right-0 mb-2 w-80 max-w-[calc(100vw-2rem)] p-2 bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
                  {disabledReason}
                  <div className="absolute top-full right-8 -mt-1 border-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
