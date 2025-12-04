import { X, Check } from "lucide-react";
import React, { useState, useEffect, useRef, useCallback } from "react";

import { useToast } from "../../hooks/useToast";
import api, { formatApiError } from "../../lib/api-service";
import { initializeAuth } from "../../lib/auth-init";
import { useGalleryStore } from "../../store";
import Badge from "../ui/badge/Badge";
import { FullPageLoading } from "../ui/loading/Loading";

import { ClientStep } from "./wizard/ClientStep";
import { GalleryNameStep } from "./wizard/GalleryNameStep";
import { GalleryTypeStep } from "./wizard/GalleryTypeStep";
import { PackageStep } from "./wizard/PackageStep";

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
  packageName?: string;
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
  initialPaymentAmountCents: number;
}

const CreateGalleryWizard: React.FC<CreateGalleryWizardProps> = ({
  isOpen,
  onClose,
  onSuccess,
  devLocked = false,
}) => {
  const { showToast } = useToast();
  const { setGalleryCreationLoading } = useGalleryStore();
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
        packageName: pkg.name?.trim() ?? "",
        includedCount: Number(pkg.includedPhotos) || 0,
        extraPriceCents: Number(pkg.pricePerExtraPhoto) || 0,
        packagePriceCents: Number(pkg.price) || 0,
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
        // Validate all required fields (package name is optional)
        if (
          data.includedCount === undefined ||
          data.includedCount === null ||
          data.includedCount <= 0
        ) {
          errors.includedCount = "Liczba zdjęć w pakiecie jest wymagana";
          isValid = false;
        }
        if (
          data.extraPriceCents === undefined ||
          data.extraPriceCents === null ||
          data.extraPriceCents <= 0
        ) {
          errors.extraPriceCents = "Cena za dodatkowe zdjęcie jest wymagana";
          isValid = false;
        }
        if (
          data.packagePriceCents === undefined ||
          data.packagePriceCents === null ||
          data.packagePriceCents <= 0
        ) {
          errors.packagePriceCents = "Cena pakietu jest wymagana";
          isValid = false;
        }
        if (data.initialPaymentAmountCents < 0) {
          errors.initialPaymentAmountCents = "Kwota wpłacona nie może być ujemna";
          isValid = false;
        }
        break;
      case 4:
        // Password is always required for wizard continuation (gallery access)
        // but NOT required for saving client (passwords aren't saved with client data)
        if (!data.clientPassword.trim()) {
          errors.clientPassword = "Hasło jest wymagane";
          isValid = false;
        }

        if (data.selectedClientId) {
          // Existing client selected - no need to validate client fields
          break;
        }

        // For new clients, validate all required fields
        if (!data.clientEmail.trim()) {
          errors.clientEmail = "Email klienta jest wymagany";
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
      default:
        break;
    }

    setFieldErrors(errors);
    return isValid;
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateStep(4)) {
      return;
    }

    // Show loading overlay immediately
    setGalleryCreationLoading(true);
    setLoading(true);
    setFieldErrors({});

    try {
      interface CreateGalleryRequestBody {
        selectionEnabled: boolean;
        pricingPackage: {
          packageName?: string;
          includedCount: number;
          extraPriceCents: number;
          packagePriceCents: number;
        };
        galleryName?: string;
        initialPaymentAmountCents?: number;
        clientPassword?: string;
        clientEmail?: string;
        isVatRegistered?: boolean;
      }

      // Ensure all numeric values are proper numbers
      const includedCount = Number(data.includedCount) || 0;
      const extraPriceCents = Number(data.extraPriceCents) || 0;
      const packagePriceCents = Number(data.packagePriceCents) || 0;
      const initialPaymentAmountCents = Number(data.initialPaymentAmountCents) || 0;

      // Package name: only include if it's a non-empty string
      const packageName = data.packageName?.trim();
      const finalPackageName = packageName && packageName.length > 0 ? packageName : undefined;

      // Build pricingPackage object - only include packageName if it exists
      const pricingPackage: {
        packageName?: string;
        includedCount: number;
        extraPriceCents: number;
        packagePriceCents: number;
      } = {
        includedCount,
        extraPriceCents,
        packagePriceCents,
      };
      if (finalPackageName) {
        pricingPackage.packageName = finalPackageName;
      }

      const requestBody: CreateGalleryRequestBody = {
        selectionEnabled: data.selectionEnabled ?? false,
        pricingPackage,
      };

      // Add gallery name if provided
      const galleryName = data.galleryName?.trim();
      if (galleryName && galleryName.length > 0) {
        requestBody.galleryName = galleryName;
      }

      // Add initial payment amount if provided
      if (initialPaymentAmountCents > 0) {
        requestBody.initialPaymentAmountCents = initialPaymentAmountCents;
      }

      // Add client password if provided
      const clientPassword = data.clientPassword?.trim();
      if (clientPassword && clientPassword.length > 0) {
        requestBody.clientPassword = clientPassword;
      }

      // Add client data
      if (data.selectedClientId) {
        const client = existingClients.find((c) => c.clientId === data.selectedClientId);
        if (client?.email?.trim()) {
          requestBody.clientEmail = client.email.trim();
        }
      } else {
        const clientEmail = data.clientEmail?.trim();
        if (clientEmail && clientEmail.length > 0) {
          requestBody.clientEmail = clientEmail;
        }
        if (data.isCompany) {
          requestBody.isVatRegistered = Boolean(data.isVatRegistered);
        }
      }

      const response = await api.galleries.create(requestBody);

      if (!response?.galleryId) {
        throw new Error("Brak ID galerii w odpowiedzi");
      }

      showToast("success", "Sukces", "Galeria została utworzona pomyślnie");

      // Close wizard first for cleaner transition, then navigate
      // Keep loading overlay visible - it will be removed when gallery page is fully loaded
      if (!devLocked) {
        onClose();
      }
      // Navigate after closing wizard to ensure smooth transition
      onSuccess(response.galleryId);
    } catch (err: unknown) {
      // Hide loading overlay on error
      setGalleryCreationLoading(false);
      const errorMsg = formatApiError(err);
      showToast("error", "Błąd", errorMsg);
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (currentStep === 4) {
        // On step 4 (client step), create the gallery instead of going to next step
        void handleSubmit();
      } else {
        setCurrentStep((prev) => Math.min(prev + 1, 4));
      }
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
            onClientSave={async (clientData, clientId) => {
              try {
                if (clientId?.trim()) {
                  // Verify the client exists before updating
                  const clientExists = existingClients.some((c) => c.clientId === clientId);
                  if (clientExists) {
                    await api.clients.update(clientId, clientData);
                    showToast("success", "Sukces", "Klient został zaktualizowany");
                  } else {
                    // Client not found, create new instead
                    await api.clients.create(clientData);
                    showToast("success", "Sukces", "Klient został zapisany");
                  }
                } else {
                  await api.clients.create(clientData);
                  showToast("success", "Sukces", "Klient został zapisany");
                }
                await loadExistingClients();
              } catch (err) {
                showToast("error", "Błąd", formatApiError(err as Error));
              }
            }}
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
    <>
      {/* Full-screen loading overlay - shows immediately when creating gallery */}
      {loading && <FullPageLoading text="Tworzenie galerii..." />}
      <div className="w-full h-full flex flex-col bg-gray-50 dark:bg-gray-dark overflow-hidden relative">
        {/* Close button - top right of main container */}
        <button
          onClick={onClose}
          className="absolute top-[10px] right-[10px] z-10 w-10 h-10 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg transition-colors active:scale-[0.98] flex items-center justify-center"
          title="Zamknij"
        >
          <X className="w-5 h-5" strokeWidth={2} />
        </button>
        {/* Modern Step Indicator - Bigger for better visibility */}
        <div className="px-6 py-6 md:py-8 bg-gray-50 dark:bg-gray-dark flex-shrink-0">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            {[
              { num: 1, label: "Typ" },
              { num: 2, label: "Nazwa" },
              { num: 3, label: "Pakiet" },
              { num: 4, label: "Klient" },
            ].map((step, index) => {
              const isActive = step.num === currentStep;
              const isCompleted = step.num < currentStep;
              const isLast = index === 3;

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
            {/* Step Content - Better space utilization */}
            <div className="flex-1 flex px-6 md:px-8 lg:px-12 relative">
              <div className="w-full max-w-5xl mx-auto">
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
              className="px-6 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors active:scale-[0.98]"
            >
              ← Wstecz
            </button>
          )}
          {currentStep === 1 && (
            <button
              onClick={onClose}
              disabled={loading}
              className="px-5 py-3.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg transition-colors active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Anuluj
            </button>
          )}
          <div className="flex items-center gap-4 ml-auto">
            {/* Payment status - only for step 3 (Package step) */}
            {currentStep === 3 &&
              (() => {
                const packagePriceCentsForStatus = data.packagePriceCents ?? 0;
                // Always show "Nieopłacone" if no package price is set
                const paymentStatus =
                  packagePriceCentsForStatus === 0
                    ? "UNPAID"
                    : data.initialPaymentAmountCents === 0
                      ? "UNPAID"
                      : data.initialPaymentAmountCents >= packagePriceCentsForStatus
                        ? "PAID"
                        : "PARTIALLY_PAID";

                return (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Status płatności:
                    </span>
                    <Badge
                      color={
                        paymentStatus === "PAID"
                          ? "success"
                          : paymentStatus === "PARTIALLY_PAID"
                            ? "warning"
                            : "error"
                      }
                      variant="light"
                    >
                      {paymentStatus === "PAID"
                        ? "Opłacone"
                        : paymentStatus === "PARTIALLY_PAID"
                          ? "Częściowo opłacone"
                          : "Nieopłacone"}
                    </Badge>
                  </div>
                );
              })()}
            {currentStep > 1 && (
              <button
                onClick={handleNext}
                disabled={loading}
                className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  "Przetwarzanie..."
                ) : currentStep === 4 ? (
                  "Utwórz galerię"
                ) : (
                  <>
                    OK <span className="text-lg">✓</span>
                  </>
                )}
              </button>
            )}
          </div>
          {currentStep === 1 && <div />}
        </div>
      </div>
    </>
  );
};

export default CreateGalleryWizard;
