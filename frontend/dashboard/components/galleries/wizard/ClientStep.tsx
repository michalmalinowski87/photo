import { Plus, Check, X, Save } from "lucide-react";
import React, { useState, useMemo, useEffect } from "react";

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
    isVatRegistered: boolean;
  }, clientId?: string) => Promise<void>;
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

  // Determine if we're in edit mode (selected client with matching email)
  const isEditMode = useMemo(() => {
    if (!selectedClientId) {
      return false;
    }
    const selectedClient = existingClients.find((c) => c.clientId === selectedClientId);
    if (!selectedClient) {
      return false;
    }
    const selectedClientEmail = (selectedClient.email ?? "").trim().toLowerCase();
    const currentEmail = clientEmail.trim().toLowerCase();
    return selectedClientEmail === currentEmail;
  }, [selectedClientId, existingClients, clientEmail]);
  
  // Check if current email matches any existing client (excluding the currently selected client)
  // eslint-disable-next-line no-console
  const isDuplicateClient = useMemo(() => {
    const trimmedEmail = clientEmail.trim().toLowerCase();
    // eslint-disable-next-line no-console
    console.log("[DEBUG] isDuplicateClient check:", {
      trimmedEmail,
      selectedClientId,
      existingClientsCount: existingClients.length,
    });
    
    if (!trimmedEmail) {
      // eslint-disable-next-line no-console
      console.log("[DEBUG] No email, returning false");
      return false;
    }
    
    const isDuplicate = existingClients.some((client) => {
      // Skip the currently selected client when checking for duplicates
      if (selectedClientId && client.clientId === selectedClientId) {
        // eslint-disable-next-line no-console
        console.log("[DEBUG] Skipping selected client:", client.clientId);
        return false;
      }
      const existingEmail = (client.email ?? "").trim().toLowerCase();
      const matches = existingEmail === trimmedEmail;
      if (matches) {
        // eslint-disable-next-line no-console
        console.log("[DEBUG] Found duplicate email:", existingEmail, "for client:", client.clientId);
      }
      return matches;
    });
    
    // eslint-disable-next-line no-console
    console.log("[DEBUG] isDuplicateClient result:", isDuplicate);
    return isDuplicate;
  }, [clientEmail, existingClients, selectedClientId]);

  const canSaveClient = useMemo(() => {
    const trimmedEmail = clientEmail.trim();
    // eslint-disable-next-line no-console
    console.log("[DEBUG] canSaveClient check:", {
      trimmedEmail: trimmedEmail || "(empty)",
      isCompany,
      companyName: companyName.trim() || "(empty)",
      nip: nip.trim() || "(empty)",
      firstName: firstName.trim() || "(empty)",
      lastName: lastName.trim() || "(empty)",
      isDuplicateClient,
    });
    
    // Note: We allow saving in edit mode (when email matches selected client)
    // This is handled separately in canSaveClientInEditMode
    
    // Check all required fields (password is NOT required for saving client, only for wizard continuation)
    if (!trimmedEmail) {
      // eslint-disable-next-line no-console
      console.log("[DEBUG] ❌ No email");
      return false;
    }
    if (isCompany) {
      if (!companyName.trim() || !nip.trim()) {
        // eslint-disable-next-line no-console
        console.log("[DEBUG] ❌ Missing company fields");
        return false;
      }
    } else {
      if (!firstName.trim() || !lastName.trim()) {
        // eslint-disable-next-line no-console
        console.log("[DEBUG] ❌ Missing individual fields");
        return false;
      }
    }
    // Enable if email is different from existing clients (not a duplicate)
    const result = !isDuplicateClient;
    // eslint-disable-next-line no-console
    console.log("[DEBUG] ✅ canSaveClient result:", result);
    return result;
  }, [clientEmail, isCompany, companyName, nip, firstName, lastName, isDuplicateClient]);

  const disabledReason = useMemo(() => {
    // In edit mode, check required fields (password is NOT required for saving client)
    if (isEditMode) {
      const trimmedEmail = clientEmail.trim();
      if (!trimmedEmail) {
        return "Email klienta jest wymagany";
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
      return "";
    }
    
    // In create mode, check for duplicates (password is NOT required for saving client)
    const trimmedEmail = clientEmail.trim();
    if (!trimmedEmail) {
      return "Email klienta jest wymagany";
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
  }, [clientEmail, isCompany, companyName, nip, firstName, lastName, isDuplicateClient, isEditMode]);

  const isSaveDisabled = !canSaveClient;
  
  // Update canSaveClient to allow saving in edit mode
  const canSaveClientInEditMode = useMemo(() => {
    if (!isEditMode) {
      return canSaveClient;
    }
    // In edit mode, check required fields but allow saving even if email matches selected client
    // Password is NOT required for saving client, only for wizard continuation
    const trimmedEmail = clientEmail.trim();
    if (!trimmedEmail) {
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
    return true;
  }, [isEditMode, canSaveClient, clientEmail, isCompany, companyName, nip, firstName, lastName]);
  
  // Debug logging when values change
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("[DEBUG] Button state:", {
      canSaveClient,
      isSaveDisabled,
      disabledReason,
      clientEmail,
      selectedClientId,
    });
  }, [canSaveClient, isSaveDisabled, disabledReason, clientEmail, selectedClientId]);

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
                <div className="absolute right-0 bottom-[34px]">
                  <Button
                    type="button"
                    onClick={() => {
                      const newPassword = generatePassword();
                      onDataChange({ clientPassword: newPassword });
                    }}
                    className="text-green-600 dark:text-green-400 bg-transparent hover:bg-green-50 dark:hover:bg-green-900/20 whitespace-nowrap h-9 text-sm px-3 border-0 shadow-none"
                  >
                    Generuj hasło
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
          <div className="flex items-center gap-3 h-[38px]">
            <div className="flex-1">
              {isCompany && (
                <button
                  type="button"
                  onClick={() => onDataChange({ isVatRegistered: !isVatRegistered })}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border transition-all cursor-pointer
                    border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800
                    hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700
                    active:scale-[0.98]"
                >
                  {isVatRegistered ? (
                    <>
                      <Check size={16} className="text-green-600 dark:text-green-400" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Firma zarejestrowana jako podatnik VAT</span>
                    </>
                  ) : (
                    <>
                      <X size={16} className="text-red-500 dark:text-red-400" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Firma zarejestrowana jako podatnik VAT</span>
                    </>
                  )}
                </button>
              )}
            </div>
            <div className="group relative flex-shrink-0">
              <button
                onClick={async () => {
                  const canSave = isEditMode ? canSaveClientInEditMode : canSaveClient;
                  if (!canSave) {
                    return;
                  }
                  setSaving(true);
                  try {
                    // Only pass clientId if we're in edit mode and have a valid selectedClientId
                    const clientIdToUpdate = isEditMode && selectedClientId ? selectedClientId : undefined;
                    await onClientSave({
                      email: clientEmail.trim(),
                      firstName: firstName.trim(),
                      lastName: lastName.trim(),
                      phone: phone.trim(),
                      isCompany,
                      companyName: companyName.trim(),
                      nip: nip.trim(),
                      isVatRegistered,
                    }, clientIdToUpdate);
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={(isEditMode ? !canSaveClientInEditMode : isSaveDisabled) || saving}
                className={`flex items-center gap-2 text-base transition-colors opacity-70 hover:opacity-100 disabled:opacity-40 disabled:cursor-not-allowed ${
                  isEditMode
                    ? "text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:hover:text-blue-600 dark:disabled:hover:text-blue-400"
                    : "text-green-700 dark:text-green-500 hover:text-green-800 dark:hover:text-green-400 disabled:hover:text-green-700 dark:disabled:hover:text-green-500"
                }`}
              >
                {saving ? (
                  <>
                    <div className={`w-4 h-4 border-2 border-t-transparent rounded-full animate-spin ${
                      isEditMode ? "border-blue-600 dark:border-blue-400" : "border-green-700 dark:border-green-500"
                    }`}></div>
                    <span>Zapisywanie...</span>
                  </>
                ) : (
                  <>
                    {isEditMode ? <Save size={16} /> : <Plus size={16} />}
                    <span>{isEditMode ? "Zapisz klienta" : "Dodaj klienta"}</span>
                  </>
                )}
              </button>
              {(isEditMode ? !canSaveClientInEditMode : isSaveDisabled) && disabledReason && (
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
