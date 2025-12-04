import { X, Check } from "lucide-react";
import React, { useState, useEffect, useRef, useCallback } from "react";

import { useToast } from "../../hooks/useToast";
import api, { formatApiError } from "../../lib/api-service";
import { initializeAuth } from "../../lib/auth-init";

import { ClientStep } from "./wizard/ClientStep";
import { GalleryNameStep } from "./wizard/GalleryNameStep";
import { GalleryTypeStep } from "./wizard/GalleryTypeStep";
import { PackageStep } from "./wizard/PackageStep";
import { SummaryStep } from "./wizard/SummaryStep";

interface CreateGalleryWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (galleryId: string) => void;
  devLocked?: boolean;
}

interface FieldErrors {
  galleryName?: string;
  packageName?: string;
  includedCount?: string;
  extraPriceCents?: string;
  packagePriceCents?: string;
  initialPaymentAmountCents?: string;
  clientEmail?: string;
  clientPassword?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  nip?: string;
  [key: string]: string | undefined;
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
  selectionEnabled?: boolean;

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
  devLocked = false,
}) => {
  const { showToast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [existingPackages, setExistingPackages] = useState<Package[]>([]);
  const [existingClients, setExistingClients] = useState<Client[]>([]);
  // Store raw input values to preserve decimal point while typing
  const [extraPriceInput, setExtraPriceInput] = useState<string | null>(null);
  const [packagePriceInput, setPackagePriceInput] = useState<string | null>(null);
  const [paymentAmountInput, setPaymentAmountInput] = useState<string | null>(null);
  // Ref to prevent duplicate API calls
  const dataLoadedRef = useRef(false);

  const [data, setData] = useState<WizardData>({
    galleryName: "",
    packageName: "",
    includedCount: 0,
    extraPriceCents: 0,
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

  const loadExistingPackages = useCallback(async () => {
    try {
      const response = await api.packages.list();
      const packages = Array.isArray(response) ? response : (response.items ?? []);
      setExistingPackages(packages);
    } catch (_err) {
      setExistingPackages([]);
    }
  }, []);

  const loadExistingClients = useCallback(async () => {
    try {
      const response = await api.clients.list();
      const clients = response.items ?? [];
      setExistingClients(clients);
    } catch (_err) {
      setExistingClients([]);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      if (!dataLoadedRef.current) {
        dataLoadedRef.current = true;
        initializeAuth(
          () => {
            // Token is handled by api-service automatically
            void loadExistingPackages();
            void loadExistingClients();
          },
          () => {
            if (typeof window !== "undefined") {
              window.location.href = `/login?returnUrl=${encodeURIComponent(window.location.pathname)}`;
            }
          }
        );
      }
      setCurrentStep(1);
      setFieldErrors({});
      // Reset input states
      setExtraPriceInput("");
      setPackagePriceInput("");
      setPaymentAmountInput("");
      setData({
        selectionEnabled: undefined,
        galleryName: "",
        packageName: "",
        includedCount: 0,
        extraPriceCents: 0,
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

  // Dev tools are initialized centrally in _app.tsx via initDevTools()
  // The wizard.open() command dispatches the 'openGalleryWizard' event
  // which AppLayout listens for

  const handlePackageSelect = (packageId: string) => {
    const pkg = existingPackages.find((p) => p.packageId === packageId);
    if (pkg) {
      const updates = {
        selectedPackageId: packageId,
        packageName: pkg.name ?? "",
        includedCount: pkg.includedPhotos ?? 0,
        extraPriceCents: pkg.pricePerExtraPhoto ?? 0,
        packagePriceCents: pkg.price ?? 0,
      };
      setData({ ...data, ...updates });
      // Clear related errors when package is selected
      const errorKeys = Object.keys(updates);
      const newErrors = { ...fieldErrors };
      errorKeys.forEach((key) => {
        if (newErrors[key as keyof FieldErrors]) {
          delete newErrors[key as keyof FieldErrors];
        }
      });
      setFieldErrors(newErrors);
      // Reset input states to show prefilled values
      setExtraPriceInput(null);
      setPackagePriceInput(null);
    }
  };

  const handleClientSelect = (clientId: string) => {
    const client = existingClients.find((c) => c.clientId === clientId);
    if (client) {
      const updates = {
        selectedClientId: clientId,
        clientEmail: client.email ?? "",
        isCompany: Boolean(client.isCompany),
        isVatRegistered: Boolean(client.isVatRegistered),
        firstName: client.firstName ?? "",
        lastName: client.lastName ?? "",
        companyName: client.companyName ?? "",
        nip: client.nip ?? "",
        phone: client.phone ?? "",
      };
      setData({ ...data, ...updates });
      // Clear related errors when client is selected
      const errorKeys = Object.keys(updates);
      const newErrors = { ...fieldErrors };
      errorKeys.forEach((key) => {
        if (newErrors[key as keyof FieldErrors]) {
          delete newErrors[key as keyof FieldErrors];
        }
      });
      setFieldErrors(newErrors);
    }
  };

  const validateStep = (step: number): boolean => {
    const errors: FieldErrors = {};
    let isValid = true;

    switch (step) {
      case 1:
        if (data.selectionEnabled === undefined) {
          isValid = false;
        }
        break;
      case 2:
        if (!data.galleryName.trim()) {
          errors.galleryName = "Nazwa galerii jest wymagana";
          isValid = false;
        }
        break;
      case 3:
        // Validate all required fields
        if (!data.packageName.trim()) {
          errors.packageName = "Nazwa pakietu jest wymagana";
          isValid = false;
        }
        if (data.includedCount === undefined || data.includedCount === null || data.includedCount <= 0) {
          errors.includedCount = "Liczba zdjęć w pakiecie jest wymagana";
          isValid = false;
        }
        if (data.extraPriceCents === undefined || data.extraPriceCents === null || data.extraPriceCents <= 0) {
          errors.extraPriceCents = "Cena za dodatkowe zdjęcie jest wymagana";
          isValid = false;
        }
        if (data.packagePriceCents === undefined || data.packagePriceCents === null || data.packagePriceCents <= 0) {
          errors.packagePriceCents = "Cena pakietu jest wymagana";
          isValid = false;
        }
        if (data.initialPaymentAmountCents < 0) {
          errors.initialPaymentAmountCents = "Kwota wpłacona nie może być ujemna";
          isValid = false;
        }
        break;
      case 4:
        if (data.selectedClientId) {
          // Existing client selected - no validation needed
          break;
        }
        if (!data.clientEmail.trim()) {
          errors.clientEmail = "Email klienta jest wymagany";
          isValid = false;
        }
        if (!data.clientPassword.trim()) {
          errors.clientPassword = "Hasło jest wymagane";
          isValid = false;
        }
        if (!data.isCompany) {
          if (!data.firstName.trim()) {
            errors.firstName = "Imię jest wymagane";
            isValid = false;
          }
          if (!data.lastName.trim()) {
            errors.lastName = "Nazwisko jest wymagane";
            isValid = false;
          }
        } else {
          if (!data.companyName.trim()) {
            errors.companyName = "Nazwa firmy jest wymagana";
            isValid = false;
          }
          if (!data.nip.trim()) {
            errors.nip = "NIP jest wymagany dla firm";
            isValid = false;
          }
        }
        break;
      case 5:
        // No validation needed for step 5
        break;
      default:
        break;
    }

    setFieldErrors(errors);
    return isValid;
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
    setFieldErrors({});

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
        selectionEnabled: data.selectionEnabled ?? false,
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

      const response = await api.galleries.create(requestBody);

      if (!response?.galleryId) {
        throw new Error("Brak ID galerii w odpowiedzi");
      }

      showToast("success", "Sukces", "Galeria została utworzona pomyślnie");
      onSuccess(response.galleryId);
      if (!devLocked) {
        onClose();
      }
    } catch (err: unknown) {
      const errorMsg = formatApiError(err);
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
            onSelectionEnabledChange={(enabled) => {
              setData({ ...data, selectionEnabled: enabled });
              // Auto-advance to next step when selection is made
              setTimeout(() => {
                setCurrentStep(2);
              }, 300);
            }}
          />
        );

      case 2:
        return (
          <GalleryNameStep
            galleryName={data.galleryName}
            onGalleryNameChange={(name) => {
              setData({ ...data, galleryName: name });
              if (fieldErrors.galleryName) {
                setFieldErrors({ ...fieldErrors, galleryName: undefined });
              }
            }}
            error={fieldErrors.galleryName}
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
            onDataChange={(updates) => {
              setData({ ...data, ...updates });
              // Clear related errors when data changes
              const errorKeys = Object.keys(updates);
              const newErrors = { ...fieldErrors };
              errorKeys.forEach((key) => {
                if (newErrors[key as keyof FieldErrors]) {
                  delete newErrors[key as keyof FieldErrors];
                }
              });
              setFieldErrors(newErrors);
            }}
            extraPriceInput={extraPriceInput}
            packagePriceInput={packagePriceInput}
            paymentAmountInput={paymentAmountInput}
            onExtraPriceInputChange={setExtraPriceInput}
            onPackagePriceInputChange={setPackagePriceInput}
            onPaymentAmountInputChange={setPaymentAmountInput}
            fieldErrors={{
              packageName: fieldErrors.packageName,
              includedCount: fieldErrors.includedCount,
              extraPriceCents: fieldErrors.extraPriceCents,
              packagePriceCents: fieldErrors.packagePriceCents,
              initialPaymentAmountCents: fieldErrors.initialPaymentAmountCents,
            }}
            onPackageSave={async (packageData) => {
              try {
                await api.packages.create(packageData);
                showToast("success", "Sukces", "Pakiet został zapisany");
                await loadExistingPackages();
              } catch (err) {
                showToast("error", "Błąd", formatApiError(err as Error));
              }
            }}
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
            selectionEnabled={data.selectionEnabled ?? false}
            onClientSelect={handleClientSelect}
            onDataChange={(updates) => {
              setData({ ...data, ...updates });
              // Clear related errors when data changes
              const errorKeys = Object.keys(updates);
              const newErrors = { ...fieldErrors };
              errorKeys.forEach((key) => {
                if (newErrors[key as keyof FieldErrors]) {
                  delete newErrors[key as keyof FieldErrors];
                }
              });
              // When switching between Individual and Company, clear errors for fields that are no longer relevant
              if (updates.isCompany !== undefined && updates.isCompany !== data.isCompany) {
                if (updates.isCompany) {
                  // Switching to Company - clear Individual field errors
                  delete newErrors.firstName;
                  delete newErrors.lastName;
                } else {
                  // Switching to Individual - clear Company field errors
                  delete newErrors.companyName;
                  delete newErrors.nip;
                }
              }
              setFieldErrors(newErrors);
            }}
            fieldErrors={{
              clientEmail: fieldErrors.clientEmail,
              clientPassword: fieldErrors.clientPassword,
              firstName: fieldErrors.firstName,
              lastName: fieldErrors.lastName,
              companyName: fieldErrors.companyName,
              nip: fieldErrors.nip,
            }}
            onClientSave={async (clientData) => {
              try {
                await api.clients.create(clientData);
                showToast("success", "Sukces", "Klient został zapisany");
                await loadExistingClients();
              } catch (err) {
                showToast("error", "Błąd", formatApiError(err as Error));
              }
            }}
          />
        );

      case 5:
        return (
          <SummaryStep
            selectionEnabled={data.selectionEnabled ?? false}
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

  // Step questions for Typeform-style header
  const getStepQuestion = (step: number): string => {
    switch (step) {
      case 1:
        return "Wybierz typ galerii";
      case 2:
        return "Jaką nazwę ma mieć galeria?";
      case 3:
        return "Ustaw pakiet cenowy";
      case 4:
        return "Kogo zaprosimy do tej galerii?";
      case 5:
        return "Sprawdź podsumowanie";
      default:
        return "";
    }
  };

  const getStepDescription = (step: number): string | null => {
    switch (step) {
      case 1:
        return "Jak klient będzie korzystał z galerii?";
      case 2:
        return "To pomoże Ci łatwo ją znaleźć później";
      case 3:
        return "Wybierz istniejący pakiet lub stwórz nowy";
      case 4:
        return "Wybierz istniejącego klienta lub dodaj nowego";
      case 5:
        return "Wszystko wygląda dobrze? Możesz teraz utworzyć galerię!";
      default:
        return null;
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="w-full h-full flex flex-col bg-gray-50 dark:bg-gray-dark overflow-hidden">
      {/* Modern Step Indicator - Bigger for better visibility */}
      <div className="px-6 py-6 md:py-8 bg-gray-50 dark:bg-gray-dark flex-shrink-0">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          {[
            { num: 1, label: "Typ" },
            { num: 2, label: "Nazwa" },
            { num: 3, label: "Pakiet" },
            { num: 4, label: "Klient" },
            { num: 5, label: "Podsumowanie" },
          ].map((step, index) => {
            const isActive = step.num === currentStep;
            const isCompleted = step.num < currentStep;
            const isLast = index === 4;

            return (
              <React.Fragment key={step.num}>
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`relative w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center text-sm md:text-base font-semibold transition-all duration-300 ${
                      isActive
                        ? "bg-brand-500 text-white scale-110"
                        : isCompleted
                          ? "bg-brand-100 dark:bg-brand-500/20 text-brand-600 dark:text-brand-400"
                          : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="w-5 h-5 md:w-6 md:h-6" strokeWidth={2.5} />
                    ) : (
                      step.num
                    )}
                  </div>
                  <span
                    className={`mt-3 text-xs md:text-sm font-medium transition-colors ${
                      isActive
                        ? "text-brand-600 dark:text-brand-400"
                        : isCompleted
                          ? "text-gray-600 dark:text-gray-400"
                          : "text-gray-400 dark:text-gray-500"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {!isLast && (
                  <div
                    className={`flex-1 h-1 mx-3 -mt-7 transition-all duration-300 ${
                      isCompleted
                        ? "bg-brand-300 dark:bg-brand-500"
                        : "bg-gray-200 dark:bg-gray-700"
                    }`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Content - Full height with Typeform-style spacing */}
      <div className="flex-1 overflow-y-auto min-h-0 bg-gray-50 dark:bg-gray-dark">
        <div className="min-h-full flex flex-col">
          {/* Close button - floating top right */}
          {!devLocked && (
            <button
              onClick={onClose}
              className="absolute top-6 right-6 z-10 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Zamknij"
            >
              <X className="w-5 h-5 text-gray-400 dark:text-gray-500" strokeWidth={2} />
            </button>
          )}

          {/* Step Content - Better space utilization */}
          <div className="flex-1 flex items-center justify-center px-6 md:px-8 lg:px-12 relative -mt-[200px]">
            <div className="w-full max-w-5xl mx-auto">
              {/* Step Question Header - Typeform style */}
              <div className={currentStep === 2 ? "mb-0" : currentStep === 4 ? "mb-8 md:mb-12 pt-[150px]" : "mb-8 md:mb-12"}>
                <div className="text-2xl md:text-3xl font-medium text-gray-900 dark:text-white mb-2">
                  {getStepQuestion(currentStep)} *
                </div>
                {getStepDescription(currentStep) && (
                  <p className="text-base text-gray-500 dark:text-gray-400 italic">
                    {getStepDescription(currentStep)}
                  </p>
                )}
              </div>

              {/* Step Content */}
              <div>{renderStep()}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer - Always rendered to prevent layout shift, buttons hidden on step 1 - Fixed height to prevent layout shifts */}
      <div className="flex items-center justify-between gap-4 px-6 py-6 bg-gray-50 dark:bg-gray-dark flex-shrink-0 h-24">
        {currentStep > 1 && (
          <button
            onClick={handleBack}
            disabled={loading}
            className="px-6 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← Wstecz
          </button>
        )}
        {currentStep === 1 && <div />}
        {currentStep > 1 && (
          <button
            onClick={currentStep < 5 ? handleNext : handleSubmit}
            disabled={loading}
            className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading
              ? "Przetwarzanie..."
              : currentStep < 5
                ? (
                    <>
                      OK <span className="text-lg">✓</span>
                    </>
                  )
                : "Utwórz galerię"}
          </button>
        )}
        {currentStep === 1 && <div />}
      </div>
    </div>
  );
};

export default CreateGalleryWizard;
