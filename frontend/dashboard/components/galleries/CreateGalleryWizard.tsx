import { useState, useEffect, useRef, useCallback } from "react";

import { useToast } from "../../hooks/useToast";
import { apiFetchWithAuth, formatApiError } from "../../lib/api";
import { getIdToken } from "../../lib/auth";
import {
  formatCurrencyInput,
  plnToCents as plnToCentsUtil,
  centsToPlnString as centsToPlnStringUtil,
} from "../../lib/currency";
import { formatPrice } from "../../lib/format-price";
import { generatePassword } from "../../lib/password";
import Button from "../ui/button/Button";

import { ClientStep } from "./wizard/ClientStep";
import { GalleryNameStep } from "./wizard/GalleryNameStep";
import { GalleryTypeStep } from "./wizard/GalleryTypeStep";
import { PackageStep } from "./wizard/PackageStep";
import { SummaryStep } from "./wizard/SummaryStep";

interface CreateGalleryWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (galleryId: string) => void;
}

interface Package {
  packageId: string;
  name?: string;
  includedPhotos?: number;
  pricePerExtraPhoto?: number;
  price?: number;
  [key: string]: unknown;
}

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

interface WizardData {
  // Step 1: Typ galerii
  selectionEnabled: boolean;

  // Step 2: Nazwa galerii
  galleryName: string;

  // Step 3: Pakiet cenowy
  selectedPackageId?: string;
  packageName: string;
  includedCount: number;
  extraPriceCents: number;
  packagePriceCents: number;

  // Step 4: Dane klienta
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

  // Step 5: Podsumowanie
  initialPaymentAmountCents: number;
}

const CreateGalleryWizard: React.FC<CreateGalleryWizardProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { showToast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [idToken, setIdToken] = useState("");
  const [existingPackages, setExistingPackages] = useState<Package[]>([]);
  const [existingClients, setExistingClients] = useState<Client[]>([]);
  const [galleryNameError, setGalleryNameError] = useState("");
  // Store raw input values to preserve decimal point while typing
  const [extraPriceInput, setExtraPriceInput] = useState<string | null>(null);
  const [packagePriceInput, setPackagePriceInput] = useState<string | null>(null);
  const [paymentAmountInput, setPaymentAmountInput] = useState<string | null>(null);
  // Ref to prevent duplicate API calls
  const dataLoadedRef = useRef(false);

  const [data, setData] = useState<WizardData>({
    selectionEnabled: true,
    galleryName: "",
    packageName: "Basic",
    includedCount: 1,
    extraPriceCents: 500,
    packagePriceCents: 0,
    clientEmail: "",
    clientPassword: "",
    isCompany: false,
    isVatRegistered: false,
    firstName: "",
    lastName: "",
    phone: "",
    nip: "",
    companyName: "",
    initialPaymentAmountCents: 0,
  });

  const loadExistingPackages = useCallback(
    async (token?: string, apiUrlParam?: string) => {
      const tokenToUse = token ?? idToken;
      const apiUrlToUse = apiUrlParam ?? apiUrl;
      if (!apiUrlToUse || !tokenToUse) {
        return;
      }
      try {
        const response = await apiFetchWithAuth(`${apiUrlToUse}/packages`);
        // apiFetch returns { data: body, response }
        // The API returns { items: [...], count: ... }
        const responseData = response.data as { items?: Package[] } | undefined;
        const packages = responseData?.items ?? [];
        setExistingPackages(packages);
      } catch (_err) {
        setExistingPackages([]);
      }
    },
    [idToken, apiUrl]
  );

  const loadExistingClients = useCallback(
    async (token?: string, apiUrlParam?: string) => {
      const tokenToUse = token ?? idToken;
      const apiUrlToUse = apiUrlParam ?? apiUrl;
      if (!apiUrlToUse || !tokenToUse) {
        return;
      }
      try {
        const response = await apiFetchWithAuth(`${apiUrlToUse}/clients`);
        // apiFetch returns { data: body, response }
        // The API returns { items: [...], count: ..., hasMore: ..., lastKey: ... }
        const responseData = response.data as { items?: Client[] } | undefined;
        const clients = responseData?.items ?? [];
        setExistingClients(clients);
      } catch (_err) {
        setExistingClients([]);
      }
    },
    [idToken, apiUrl]
  );

  useEffect(() => {
    if (isOpen) {
      if (!dataLoadedRef.current) {
        const apiUrlValue = process.env.NEXT_PUBLIC_API_URL ?? "";
        setApiUrl(apiUrlValue);
        dataLoadedRef.current = true;
        getIdToken()
          .then((token) => {
            setIdToken(token);
            // Pass apiUrl directly to avoid race condition with state update
            void loadExistingPackages(token, apiUrlValue);
            void loadExistingClients(token, apiUrlValue);
          })
          .catch(() => {
            if (typeof window !== "undefined") {
              window.location.href = `/login?returnUrl=${encodeURIComponent(window.location.pathname)}`;
            }
          });
      }
      setCurrentStep(1);
      setError("");
      setGalleryNameError("");
      // Reset input states
      setExtraPriceInput("");
      setPackagePriceInput("");
      setPaymentAmountInput("");
      setData({
        selectionEnabled: true,
        galleryName: "",
        packageName: "Basic",
        includedCount: 1,
        extraPriceCents: 500,
        packagePriceCents: 0,
        clientEmail: "",
        clientPassword: "",
        isCompany: false,
        isVatRegistered: false,
        firstName: "",
        lastName: "",
        phone: "",
        nip: "",
        companyName: "",
        initialPaymentAmountCents: 0,
      });
    } else {
      // Reset ref when wizard closes
      dataLoadedRef.current = false;
    }
  }, [isOpen, loadExistingPackages, loadExistingClients]);

  const handlePackageSelect = (packageId: string) => {
    const pkg = existingPackages.find((p) => p.packageId === packageId);
    if (pkg) {
      setData({
        ...data,
        selectedPackageId: packageId,
        packageName: pkg.name ?? "",
        includedCount: pkg.includedPhotos ?? 0,
        extraPriceCents: pkg.pricePerExtraPhoto ?? 0,
        packagePriceCents: pkg.price ?? 0,
      });
      // Reset input states to show prefilled values
      setExtraPriceInput(null);
      setPackagePriceInput(null);
    }
  };

  const handleClientSelect = (clientId: string) => {
    const client = existingClients.find((c) => c.clientId === clientId);
    if (client) {
      setData({
        ...data,
        selectedClientId: clientId,
        clientEmail: client.email ?? "",
        isCompany: Boolean(client.isCompany),
        isVatRegistered: Boolean(client.isVatRegistered),
        firstName: client.firstName ?? "",
        lastName: client.lastName ?? "",
        companyName: client.companyName ?? "",
        nip: client.nip ?? "",
        phone: client.phone ?? "",
      });
    }
  };

  // Use currency utilities
  const formatPriceInput = formatCurrencyInput;
  const plnToCents = plnToCentsUtil;
  const centsToPlnString = centsToPlnStringUtil;

  const validateStep = (step: number): boolean => {
    setError("");
    setGalleryNameError("");

    switch (step) {
      case 1:
        return true;
      case 2:
        if (!data.galleryName.trim()) {
          setError("Nazwa galerii jest wymagana");
          return false;
        }
        return true;
      case 3:
        if (!data.packageName.trim()) {
          setError("Nazwa pakietu jest wymagana");
          return false;
        }
        if (data.includedCount < 0 || data.extraPriceCents < 0 || data.packagePriceCents < 0) {
          setError("Wartości pakietu nie mogą być ujemne");
          return false;
        }
        if (data.initialPaymentAmountCents < 0) {
          setError("Kwota wpłacona nie może być ujemna");
          return false;
        }
        return true;
      case 4:
        if (data.selectedClientId) {
          return true; // Existing client selected
        }
        if (!data.clientEmail.trim()) {
          setError("Email klienta jest wymagany");
          return false;
        }
        if (!data.clientPassword.trim()) {
          setError("Hasło jest wymagane");
          return false;
        }
        if (!data.isCompany && (!data.firstName.trim() || !data.lastName.trim())) {
          setError("Imię i nazwisko są wymagane");
          return false;
        }
        if (data.isCompany && !data.companyName.trim()) {
          setError("Nazwa firmy jest wymagana");
          return false;
        }
        if (data.isCompany && !data.nip.trim()) {
          setError("NIP jest wymagany dla firm");
          return false;
        }
        return true;
      case 5:
        // No validation needed for step 5 - payment amount is collected in step 3
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, 5));
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateStep(5)) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      interface CreateGalleryRequestBody {
        selectionEnabled: boolean;
        pricingPackage: {
          packageName: string;
          includedCount: number;
          extraPriceCents: number;
          packagePriceCents: number;
        };
        galleryName: string;
        initialPaymentAmountCents: number;
        clientPassword: string;
        clientEmail?: string;
        isVatRegistered?: boolean;
      }

      const requestBody: CreateGalleryRequestBody = {
        selectionEnabled: data.selectionEnabled,
        pricingPackage: {
          packageName: data.packageName,
          includedCount: data.includedCount,
          extraPriceCents: data.extraPriceCents,
          packagePriceCents: data.packagePriceCents,
        },
        galleryName: data.galleryName.trim(),
        initialPaymentAmountCents: data.initialPaymentAmountCents,
        clientPassword: data.clientPassword.trim(),
      };

      // Add client data
      if (data.selectedClientId) {
        const client = existingClients.find((c) => c.clientId === data.selectedClientId);
        if (client) {
          requestBody.clientEmail = client.email ?? "";
        }
      } else {
        requestBody.clientEmail = data.clientEmail.trim();
        if (data.isCompany) {
          requestBody.isVatRegistered = Boolean(data.isVatRegistered);
        }
      }

      const response = await apiFetchWithAuth(`${apiUrl}/galleries`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const responseData = response.data as { galleryId: string } | undefined;
      if (!responseData?.galleryId) {
        throw new Error("Brak ID galerii w odpowiedzi");
      }

      showToast("success", "Sukces", "Galeria została utworzona pomyślnie");
      onSuccess(responseData.galleryId);
      onClose();
    } catch (err: unknown) {
      const errorMsg = formatApiError(err);
      setError(errorMsg);
      showToast("error", "Błąd", errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <GalleryTypeStep
            selectionEnabled={data.selectionEnabled}
            onSelectionEnabledChange={(enabled) => setData({ ...data, selectionEnabled: enabled })}
          />
        );

      case 2:
        return (
          <GalleryNameStep
            galleryName={data.galleryName}
            onGalleryNameChange={(name) => {
              setData({ ...data, galleryName: name });
              setGalleryNameError("");
            }}
            error={galleryNameError}
            onErrorChange={setGalleryNameError}
          />
        );

      case 3:
        return (
          <PackageStep
            existingPackages={existingPackages}
            selectedPackageId={data.selectedPackageId}
            packageName={data.packageName}
            includedCount={data.includedCount}
            extraPriceCents={data.extraPriceCents}
            packagePriceCents={data.packagePriceCents}
            initialPaymentAmountCents={data.initialPaymentAmountCents}
            onPackageSelect={handlePackageSelect}
            onDataChange={(updates) => setData({ ...data, ...updates })}
            extraPriceInput={extraPriceInput}
            packagePriceInput={packagePriceInput}
            paymentAmountInput={paymentAmountInput}
            onExtraPriceInputChange={setExtraPriceInput}
            onPackagePriceInputChange={setPackagePriceInput}
            onPaymentAmountInputChange={setPaymentAmountInput}
          />
        );

      case 4:
        return (
          <ClientStep
            existingClients={existingClients}
            selectedClientId={data.selectedClientId}
            clientEmail={data.clientEmail}
            clientPassword={data.clientPassword}
            isCompany={data.isCompany}
            isVatRegistered={data.isVatRegistered}
            firstName={data.firstName}
            lastName={data.lastName}
            phone={data.phone}
            nip={data.nip}
            companyName={data.companyName}
            selectionEnabled={data.selectionEnabled}
            onClientSelect={handleClientSelect}
            onDataChange={(updates) => setData({ ...data, ...updates })}
          />
        );

      case 5:
        return (
          <SummaryStep
            selectionEnabled={data.selectionEnabled}
            galleryName={data.galleryName}
            selectedClientId={data.selectedClientId}
            clientEmail={data.clientEmail}
            existingClients={existingClients}
            packageName={data.packageName}
            includedCount={data.includedCount}
            extraPriceCents={data.extraPriceCents}
            packagePriceCents={data.packagePriceCents}
            initialPaymentAmountCents={data.initialPaymentAmountCents}
          />
        );

      default:
        return null;
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="w-full h-[calc(100vh-140px)] flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 flex-shrink-0">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Utwórz galerię</h2>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <svg
            className="w-6 h-6 text-gray-500 dark:text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Progress Bar */}
      <div className="px-6 py-6 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          {[1, 2, 3, 4, 5].map((step) => (
            <div key={step} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center font-semibold text-sm transition-all duration-300 ${
                    step === currentStep
                      ? "bg-brand-500 text-white shadow-lg scale-110"
                      : step < currentStep
                        ? "bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400"
                        : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                  }`}
                >
                  {step < currentStep ? "✓" : step}
                </div>
                <div className="mt-2 text-xs text-center text-gray-600 dark:text-gray-400 font-medium">
                  {step === 1 && "Typ galerii"}
                  {step === 2 && "Nazwa"}
                  {step === 3 && "Pakiet"}
                  {step === 4 && "Klient"}
                  {step === 5 && "Podsumowanie"}
                </div>
              </div>
              {step < 5 && (
                <div
                  className={`flex-1 h-1 mx-2 rounded-full transition-all duration-300 ${
                    step < currentStep ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Content - Full height with vertical centering */}
      <div className="flex-1 overflow-y-auto min-h-0 relative">
        {error && (
          <div className="absolute top-8 left-1/2 transform -translate-x-1/2 z-10 max-w-4xl w-full px-8">
            <div className="p-4 bg-error-50 border border-error-200 rounded-xl text-error-600 dark:bg-error-500/10 dark:border-error-500/20 dark:text-error-400">
              {error}
            </div>
          </div>
        )}
        <div className="h-full flex items-center justify-center p-8">
          <div className="w-full max-w-6xl mx-auto">{renderStep()}</div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 p-6 border-t border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm flex-shrink-0">
        <Button
          variant="outline"
          onClick={currentStep === 1 ? onClose : handleBack}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-2"
        >
          {currentStep !== 1 && (
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M10 12L6 8L10 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          {currentStep === 1 ? "Anuluj" : "Wstecz"}
        </Button>
        <div className="flex gap-3 flex-1 justify-end">
          {currentStep < 5 ? (
            <Button
              onClick={handleNext}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2"
            >
              Dalej
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M6 12L10 8L6 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading} variant="primary" className="flex-1">
              {loading ? "Tworzenie..." : "Utwórz galerię"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateGalleryWizard;
