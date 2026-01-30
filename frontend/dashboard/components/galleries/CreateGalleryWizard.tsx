import { X, Check } from "lucide-react";
import React, { useState, useEffect } from "react";

import { useUpdateClient, useCreateClient } from "../../hooks/mutations/useClientMutations";
import { useCreateGallery } from "../../hooks/mutations/useGalleryMutations";
import { useCreatePackage } from "../../hooks/mutations/usePackageMutations";
import { useClients } from "../../hooks/queries/useClients";
import { usePackages } from "../../hooks/queries/usePackages";
import { useToast } from "../../hooks/useToast";
import { formatApiError } from "../../lib/api-service";
import { useUnifiedStore } from "../../store/unifiedStore";
import type { Gallery } from "../../types";

import { ClientStep } from "./wizard/ClientStep";
import { GalleryNameStep } from "./wizard/GalleryNameStep";
import { GalleryTypeStep } from "./wizard/GalleryTypeStep";
import { PackageStep } from "./wizard/PackageStep";

interface CreateGalleryWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (galleryId: string, orderId?: string, selectionEnabled?: boolean) => void;
  devLocked?: boolean;
}

interface FieldErrors {
  galleryName?: string;
  selectedPackageId?: string;
  packageName?: string;
  includedCount?: string;
  extraPriceCents?: string;
  packagePriceCents?: string;
  initialPaymentAmountCents?: string;
  photoBookCount?: string;
  photoPrintCount?: string;
  selectedClientId?: string;
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
  photoBookCount?: number;
  photoPrintCount?: number;

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

function SubmitButton({
  onSubmit: _onSubmit,
  disabled,
}: {
  onSubmit: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="px-6 h-14 w-full bg-photographer-accent hover:bg-photographer-accentHover text-white rounded-lg text-base font-medium transition-colors active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
    >
      {disabled ? "Przetwarzanie..." : "Utwórz galerię"}
    </button>
  );
}

const CreateGalleryWizard = ({
  isOpen,
  onClose,
  onSuccess,
  devLocked = false,
}: CreateGalleryWizardProps) => {
  const { showToast } = useToast();
  const createGalleryMutation = useCreateGallery();
  const createPackageMutation = useCreatePackage();
  const updateClientMutation = useUpdateClient();
  const createClientMutation = useCreateClient();
  // Derive loading state from mutations instead of Zustand
  const loading =
    createGalleryMutation.isPending ||
    createPackageMutation.isPending ||
    updateClientMutation.isPending ||
    createClientMutation.isPending;
  const [currentStep, setCurrentStep] = useState(1);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // Store raw input values to preserve decimal point while typing
  const [extraPriceInput, setExtraPriceInput] = useState<string | null>(null);
  const [packagePriceInput, setPackagePriceInput] = useState<string | null>(null);
  const [paymentAmountInput, setPaymentAmountInput] = useState<string | null>(null);

  // Use React Query hooks for packages and clients
  const { data: packagesData } = usePackages();
  const { data: clientsData } = useClients();

  // Extract packages and clients from query responses
  const existingPackages: Package[] = packagesData
    ? Array.isArray(packagesData)
      ? packagesData
      : (packagesData.items ?? [])
    : [];
  const existingClients: Client[] = clientsData
    ? Array.isArray(clientsData)
      ? clientsData
      : (clientsData.items ?? [])
    : [];

  const [data, setData] = useState<WizardData>({
    galleryName: "",
    packageName: "",
    includedCount: 0,
    extraPriceCents: 0,
    packagePriceCents: 0,
    photoBookCount: 0,
    photoPrintCount: 0,
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

  useEffect(() => {
    if (isOpen) {
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
        photoBookCount: 0,
        photoPrintCount: 0,
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
    }
  }, [isOpen]);

  // Dev tools are initialized centrally in _app.tsx via initDevTools()
  // The wizard.open() command dispatches the 'openGalleryWizard' event
  // which AppLayout listens for

  const handlePackageSelect = (packageId: string) => {
    const pkg = existingPackages.find((p) => p.packageId === packageId);
    if (pkg) {
      const cap = Number(pkg.includedPhotos) || 0;
      const updates = {
        selectedPackageId: packageId,
        packageName: pkg.name?.trim() ?? "",
        includedCount: cap,
        extraPriceCents: Number(pkg.pricePerExtraPhoto) || 0,
        packagePriceCents: Number(pkg.price) || 0,
        photoBookCount: Math.max(0, Math.min((pkg as { photoBookCount?: number }).photoBookCount ?? 0, cap)),
        photoPrintCount: Math.max(0, Math.min((pkg as { photoPrintCount?: number }).photoPrintCount ?? 0, cap)),
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
        } else if (data.galleryName.trim().length > 100) {
          errors.galleryName = "Nazwa galerii nie może przekraczać 100 znaków";
          isValid = false;
        }
        break;
      case 3:
        // Check if package is selected OR manual form data exists
        const hasManualPackageData =
          (data.packageName?.trim() ?? "") !== "" ||
          data.includedCount > 0 ||
          data.packagePriceCents > 0;

        if (!data.selectedPackageId && !hasManualPackageData) {
          errors.selectedPackageId = "Wybierz pakiet lub wprowadź dane pakietu ręcznie";
          isValid = false;
        }

        // If package is selected, no need to validate form fields
        if (data.selectedPackageId) {
          break;
        }

        // Validate all required fields for manual entry (package name is optional)
        if (
          data.includedCount === undefined ||
          data.includedCount === null ||
          data.includedCount <= 0
        ) {
          errors.includedCount = "Liczba zdjęć w pakiecie jest wymagana";
          isValid = false;
        }
        // extraPriceCents is optional - only validate it's not negative if provided
        if (
          data.extraPriceCents !== undefined &&
          data.extraPriceCents !== null &&
          data.extraPriceCents < 0
        ) {
          errors.extraPriceCents = "Cena za dodatkowe zdjęcie nie może być ujemna";
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
        const cap = data.includedCount ?? 0;
        const nBook = data.photoBookCount ?? 0;
        if (nBook < 0 || nBook > cap) {
          errors.photoBookCount =
            "Liczba zdjęć do albumu musi być od 0 do liczby zdjęć w pakiecie";
          isValid = false;
        }
        const nPrint = data.photoPrintCount ?? 0;
        if (nPrint < 0 || nPrint > cap) {
          errors.photoPrintCount =
            "Liczba zdjęć do druku musi być od 0 do liczby zdjęć w pakiecie";
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

        // Check if client is selected OR manual form data exists
        const hasManualClientData =
          (data.clientEmail && data.clientEmail.trim() !== "") ||
          (data.firstName && data.firstName.trim() !== "") ||
          (data.lastName && data.lastName.trim() !== "") ||
          (data.companyName && data.companyName.trim() !== "") ||
          (data.nip && data.nip.trim() !== "");

        if (!data.selectedClientId && !hasManualClientData) {
          errors.selectedClientId = "Wybierz klienta lub wprowadź dane klienta ręcznie";
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

    // Loading state is now derived from mutation.isPending
    setFieldErrors({});

    // Activate gallery creation flow immediately - this ensures overlay persists through navigation
    const setGalleryCreationFlowActive = useUnifiedStore.getState().setGalleryCreationFlowActive;
    setGalleryCreationFlowActive(true);

    try {
      interface CreateGalleryRequestBody {
        selectionEnabled: boolean;
        pricingPackage: {
          packageName?: string;
          includedCount: number;
          extraPriceCents: number;
          packagePriceCents: number;
          photoBookCount?: number;
          photoPrintCount?: number;
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

      // Build pricingPackage object - only counts (offer = count > 0)
      const pricingPackage: {
        packageName?: string;
        includedCount: number;
        extraPriceCents: number;
        packagePriceCents: number;
        photoBookCount?: number;
        photoPrintCount?: number;
      } = {
        includedCount,
        extraPriceCents,
        packagePriceCents,
        photoBookCount: Math.max(0, Math.min(data.photoBookCount ?? 0, includedCount)),
        photoPrintCount: Math.max(0, Math.min(data.photoPrintCount ?? 0, includedCount)),
      };
      if (finalPackageName) {
        pricingPackage.packageName = finalPackageName;
      }

      // Validate selectionEnabled is set before proceeding
      if (data.selectionEnabled === undefined) {
        throw new Error("Typ galerii musi być wybrany");
      }

      const requestBody: CreateGalleryRequestBody = {
        selectionEnabled: data.selectionEnabled,
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

      const response = await createGalleryMutation.mutateAsync(
        requestBody as unknown as Partial<Gallery>
      );

      if (!response?.galleryId) {
        throw new Error("Brak ID galerii w odpowiedzi");
      }

      // Update flow with galleryId - this ensures overlay persists until photos page is ready
      setGalleryCreationFlowActive(true, response.galleryId);

      showToast("success", "Sukces", "Galeria została utworzona pomyślnie");

      // Close wizard first for cleaner transition, then navigate
      // Keep loading overlay visible - it will be removed when gallery page is fully loaded
      if (!devLocked) {
        onClose();
      }
      // Navigate after closing wizard to ensure smooth transition
      // Pass orderId and selectionEnabled for proper routing
      // Gallery type allows additional properties via [key: string]: unknown
      const orderId =
        typeof response === "object" && response !== null && "orderId" in response
          ? typeof response.orderId === "string"
            ? response.orderId
            : undefined
          : undefined;
      // Use the actual response value, defaulting based on whether orderId exists
      // If orderId exists, it's definitely non-selective (selectionEnabled = false)
      // If orderId doesn't exist, check response.selectionEnabled, default to true if undefined
      const responseSelectionEnabled =
        typeof response === "object" &&
        response !== null &&
        "selectionEnabled" in response &&
        typeof response.selectionEnabled === "boolean"
          ? response.selectionEnabled
          : undefined;
      const selectionEnabled = orderId ? false : (responseSelectionEnabled ?? true);

      onSuccess(response.galleryId, orderId, selectionEnabled);
    } catch (err: unknown) {
      // Clear flow on error - overlay should disappear
      setGalleryCreationFlowActive(false);
      // Loading state is automatically handled by mutation.isPending
      const errorMsg = formatApiError(err);
      showToast("error", "Błąd", errorMsg);
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

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentStep === 4) {
      await handleSubmit();
    } else {
      handleNext();
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
            photoBookCount={data.photoBookCount}
            photoPrintCount={data.photoPrintCount}
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
              selectedPackageId: fieldErrors.selectedPackageId,
              packageName: fieldErrors.packageName,
              includedCount: fieldErrors.includedCount,
              extraPriceCents: fieldErrors.extraPriceCents,
              packagePriceCents: fieldErrors.packagePriceCents,
              initialPaymentAmountCents: fieldErrors.initialPaymentAmountCents,
              photoBookCount: fieldErrors.photoBookCount,
              photoPrintCount: fieldErrors.photoPrintCount,
            }}
            onPackageSave={async (packageData) => {
              try {
                await createPackageMutation.mutateAsync(packageData);
                showToast("success", "Sukces", "Pakiet został zapisany");
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
              selectedClientId: fieldErrors.selectedClientId,
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
                    await updateClientMutation.mutateAsync({ clientId, data: clientData });
                    showToast("success", "Sukces", "Klient został zaktualizowany");
                  } else {
                    // Client not found, create new instead
                    await createClientMutation.mutateAsync(clientData);
                    showToast("success", "Sukces", "Klient został zapisany");
                  }
                } else {
                  await createClientMutation.mutateAsync(clientData);
                  showToast("success", "Sukces", "Klient został zapisany");
                }
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
      {/* Loading overlay is handled globally by AppLayout - no need for local overlay */}
      <div className="w-full h-full flex flex-col bg-photographer-background dark:bg-gray-dark overflow-hidden relative">
        {/* Close button - top right of main container */}
        <button
          onClick={onClose}
          className="absolute top-[10px] right-[10px] z-10 w-10 h-10 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-photographer-elevated dark:hover:bg-gray-800 border border-gray-400 dark:border-gray-700 rounded-lg transition-colors active:scale-[0.98] flex items-center justify-center"
          title="Zamknij"
        >
          <X className="w-5 h-5" strokeWidth={2} />
        </button>
        {/* Modern Step Indicator - Bigger for better visibility */}
        <div className="px-6 py-6 md:py-8 bg-photographer-background dark:bg-gray-dark flex-shrink-0">
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
                          ? "bg-photographer-accent text-white scale-110"
                          : isCompleted
                            ? "bg-photographer-accentLight/50 dark:bg-photographer-accent/20 text-photographer-accent dark:text-photographer-accent"
                            : "bg-photographer-border dark:bg-gray-700 text-photographer-mutedText dark:text-gray-400"
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
                          ? "text-photographer-accent dark:text-photographer-accent"
                          : isCompleted
                            ? "text-photographer-text dark:text-gray-400"
                            : "text-photographer-mutedText dark:text-gray-500"
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  {!isLast && (
                    <div
                      className={`flex-1 h-1 mx-3 -mt-7 transition-all duration-300 ${
                        isCompleted
                          ? "bg-photographer-accentLight dark:bg-photographer-accent"
                          : "bg-photographer-muted dark:bg-gray-700"
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Content - Full height with Typeform-style spacing */}
        <div className="flex-1 overflow-y-auto min-h-0 bg-photographer-background dark:bg-gray-dark">
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
        <div className="flex items-center gap-4 px-6 py-6 bg-photographer-background dark:bg-gray-dark flex-shrink-0 min-h-[88px]">
          {/* Step 1: Show Anuluj button, and Next Step only if gallery type is selected */}
          {currentStep === 1 && (
            <>
              <button
                onClick={onClose}
                disabled={loading}
                className="w-40 px-8 h-14 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 border border-gray-400 dark:border-gray-700 rounded-lg transition-colors active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed bg-transparent hover:bg-photographer-elevated dark:hover:bg-gray-800 flex items-center justify-center"
              >
                Anuluj
              </button>
              {data.selectionEnabled !== undefined && (
                <button
                  onClick={handleNext}
                  disabled={loading}
                  className="flex-1 px-6 h-14 bg-photographer-accent hover:bg-photographer-accentHover text-white rounded-lg text-base font-medium transition-colors active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {loading ? "Przetwarzanie..." : "Następny Krok"}
                </button>
              )}
            </>
          )}
          {/* Steps 2-4: Show Wstecz button on the left, Continue/Submit button on the right */}
          {currentStep > 1 && (
            <>
              <button
                onClick={handleBack}
                disabled={loading}
                className="w-40 px-8 h-14 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 border border-gray-400 dark:border-gray-700 rounded-lg transition-colors active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed bg-transparent hover:bg-photographer-elevated dark:hover:bg-gray-800 flex items-center justify-center"
              >
                Wstecz
              </button>
              {currentStep === 4 ? (
                <form onSubmit={handleFormSubmit} className="flex-1">
                  <SubmitButton onSubmit={handleSubmit} disabled={loading} />
                </form>
              ) : (
                <button
                  onClick={handleNext}
                  disabled={loading}
                  className="flex-1 px-6 h-14 bg-photographer-accent hover:bg-photographer-accentHover text-white rounded-lg text-base font-medium transition-colors active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {loading ? "Przetwarzanie..." : "Następny Krok"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default CreateGalleryWizard;
