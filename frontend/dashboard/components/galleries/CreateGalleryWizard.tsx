import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Button from "../ui/button/Button";
import Input from "../ui/input/InputField";
import Select from "../ui/select/Select";
import Badge from "../ui/badge/Badge";
import { apiFetch, formatApiError } from "../../lib/api";
import { getIdToken } from "../../lib/auth";

interface CreateGalleryWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (galleryId: string) => void;
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
  
  // Step 5: Plan galerii
  plan: string;
  hasBackupStorage: boolean;
  
  // Step 6: Podsumowanie
  initialPaymentAmountCents: number;
}

const PRICING_PLANS = [
  { value: "1GB-1m", label: "1GB - 1 miesiąc", price: 7, storage: "1 GB", duration: "1 miesiąc" },
  { value: "1GB-3m", label: "1GB - 3 miesiące", price: 9, storage: "1 GB", duration: "3 miesiące" },
  { value: "1GB-12m", label: "1GB - 12 miesięcy", price: 15, storage: "1 GB", duration: "12 miesięcy" },
  { value: "3GB-1m", label: "3GB - 1 miesiąc", price: 12, storage: "3 GB", duration: "1 miesiąc" },
  { value: "3GB-3m", label: "3GB - 3 miesiące", price: 14, storage: "3 GB", duration: "3 miesiące" },
  { value: "3GB-12m", label: "3GB - 12 miesięcy", price: 21, storage: "3 GB", duration: "12 miesięcy" },
  { value: "10GB-1m", label: "10GB - 1 miesiąc", price: 14, storage: "10 GB", duration: "1 miesiąc" },
  { value: "10GB-3m", label: "10GB - 3 miesiące", price: 16, storage: "10 GB", duration: "3 miesiące" },
  { value: "10GB-12m", label: "10GB - 12 miesięcy", price: 26, storage: "10 GB", duration: "12 miesięcy" },
];

const CreateGalleryWizard: React.FC<CreateGalleryWizardProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [idToken, setIdToken] = useState("");
  const [existingPackages, setExistingPackages] = useState<any[]>([]);
  const [existingClients, setExistingClients] = useState<any[]>([]);
  const [galleryNameError, setGalleryNameError] = useState("");
  const [totalPriceCents, setTotalPriceCents] = useState(0);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  // Store raw input values to preserve decimal point while typing
  const [extraPriceInput, setExtraPriceInput] = useState<string | null>(null);
  const [packagePriceInput, setPackagePriceInput] = useState<string | null>(null);
  const [paymentAmountInput, setPaymentAmountInput] = useState<string | null>(null);

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
    plan: "1GB-1m",
    hasBackupStorage: false,
    initialPaymentAmountCents: 0,
  });

  useEffect(() => {
    if (isOpen) {
      setApiUrl(process.env.NEXT_PUBLIC_API_URL || "");
      getIdToken()
        .then((token) => {
          setIdToken(token);
          loadExistingPackages(token);
          loadExistingClients(token);
        })
        .catch(() => {
          if (typeof window !== "undefined") {
            window.location.href = `/login?returnUrl=${encodeURIComponent(window.location.pathname)}`;
          }
        });
      setCurrentStep(1);
      setError("");
      setGalleryNameError("");
      // Reset input states
      setExtraPriceInput("");
      setPackagePriceInput("");
      setPaymentAmountInput("");
      // Initialize selectedPlan based on current plan
      const currentPlan = data.plan;
      if (currentPlan.includes("-1m")) {
        setSelectedPlan("1m");
      } else if (currentPlan.includes("-3m")) {
        setSelectedPlan("3m");
      } else if (currentPlan.includes("-12m")) {
        setSelectedPlan("12m");
      } else {
        setSelectedPlan("1m");
      }
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
        plan: "1GB-1m",
        hasBackupStorage: false,
        initialPaymentAmountCents: 0,
      });
    }
  }, [isOpen]);

  useEffect(() => {
    // Calculate total price
    const planData = PRICING_PLANS.find((p) => p.value === data.plan);
    const planPriceCents = planData ? planData.price * 100 : 700;
    const addonPriceCents = data.hasBackupStorage ? Math.round(planPriceCents * 0.3) : 0;
    const packagePriceCents = data.packagePriceCents || 0;
    
    // Total = plan + addon + package
    const subtotal = planPriceCents + addonPriceCents + packagePriceCents;
    // VAT 23%
    const vatCents = Math.round(subtotal * 0.23);
    setTotalPriceCents(subtotal + vatCents);
  }, [data.plan, data.hasBackupStorage, data.packagePriceCents]);

  useEffect(() => {
    // Initialize selectedPlan when reaching step 5
    if (currentStep === 5 && !selectedPlan) {
      if (data.plan.includes("-1m")) {
        setSelectedPlan("1m");
      } else if (data.plan.includes("-3m")) {
        setSelectedPlan("3m");
      } else if (data.plan.includes("-12m")) {
        setSelectedPlan("12m");
      } else {
        setSelectedPlan("1m");
      }
    }
  }, [currentStep, data.plan, selectedPlan]);

  const loadExistingPackages = async (token?: string) => {
    const tokenToUse = token || idToken;
    if (!apiUrl || !tokenToUse) return;
    try {
      const { data } = await apiFetch(`${apiUrl}/packages`, {
        headers: { Authorization: `Bearer ${tokenToUse}` },
      });
      setExistingPackages(data.items || []);
    } catch (err) {
      // Ignore errors
    }
  };

  const loadExistingClients = async (token?: string) => {
    const tokenToUse = token || idToken;
    if (!apiUrl || !tokenToUse) return;
    try {
      const { data } = await apiFetch(`${apiUrl}/clients`, {
        headers: { Authorization: `Bearer ${tokenToUse}` },
      });
      setExistingClients(data.items || []);
    } catch (err) {
      // Ignore errors
    }
  };

  const handlePackageSelect = (packageId: string) => {
    const pkg = existingPackages.find((p) => p.packageId === packageId);
    if (pkg) {
      setData({
        ...data,
        selectedPackageId: packageId,
        packageName: pkg.name,
        includedCount: pkg.includedPhotos || 0,
        extraPriceCents: pkg.pricePerExtraPhoto || 0,
        packagePriceCents: pkg.price || 0,
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
        clientEmail: client.email,
        isCompany: client.isCompany || false,
        isVatRegistered: client.isVatRegistered || false,
        firstName: client.firstName || "",
        lastName: client.lastName || "",
        companyName: client.companyName || "",
        nip: client.nip || "",
        phone: client.phone || "",
      });
    }
  };

  // Helper function to format PLN input (allows only numbers and one decimal point)
  const formatPriceInput = (value: string): string => {
    // Remove any non-digit characters except decimal point
    let cleaned = value.replace(/[^\d.]/g, '');
    
    // Split by decimal point to check
    const parts = cleaned.split('.');
    
    // Ensure only one decimal point
    if (parts.length > 2) {
      cleaned = parts[0] + '.' + parts.slice(1).join('');
    }
    
    // Re-split after potential modification
    const finalParts = cleaned.split('.');
    
    // Limit to 2 decimal places if decimal point exists
    if (finalParts.length === 2 && finalParts[1].length > 2) {
      cleaned = finalParts[0] + '.' + finalParts[1].substring(0, 2);
    }
    
    return cleaned;
  };

  // Helper function to convert PLN string to cents
  const plnToCents = (plnString: string): number => {
    if (!plnString || plnString === '') return 0;
    const value = parseFloat(plnString);
    return isNaN(value) ? 0 : Math.round(value * 100);
  };

  // Helper function to convert cents to PLN string for display
  const centsToPlnString = (cents: number): string => {
    if (cents === 0) return '';
    const value = cents / 100;
    // Preserve 2 decimal places if it's a whole number, otherwise show as is
    return value % 1 === 0 ? value.toFixed(0) : value.toString();
  };

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
        return true;
      case 4:
        if (data.selectedClientId) {
          return true; // Existing client selected
        }
        if (!data.clientEmail.trim()) {
          setError("Email klienta jest wymagany");
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
        return true;
      case 6:
        if (data.initialPaymentAmountCents < 0) {
          setError("Kwota wpłacona nie może być ujemna");
          return false;
        }
        const planData = PRICING_PLANS.find((p) => p.value === data.plan);
        const planPriceCents = planData ? planData.price * 100 : 700;
        const addonPriceCents = data.hasBackupStorage ? Math.round(planPriceCents * 0.3) : 0;
        const packagePriceCents = data.packagePriceCents || 0;
        const subtotal = planPriceCents + addonPriceCents + packagePriceCents;
        const vatCents = Math.round(subtotal * 0.23);
        const maxPrice = subtotal + vatCents;
        if (data.initialPaymentAmountCents > maxPrice) {
          setError("Kwota wpłacona nie może przekraczać całkowitej ceny");
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, 6));
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateStep(6)) return;

    setLoading(true);
    setError("");

    try {
      const requestBody: any = {
        plan: data.plan,
        selectionEnabled: data.selectionEnabled,
        pricingPackage: {
          packageName: data.packageName,
          includedCount: data.includedCount,
          extraPriceCents: data.extraPriceCents,
          packagePriceCents: data.packagePriceCents,
        },
        hasBackupStorage: data.hasBackupStorage,
        galleryName: data.galleryName.trim(),
        initialPaymentAmountCents: data.initialPaymentAmountCents,
      };

      // Add client data
      if (data.selectedClientId) {
        const client = existingClients.find((c) => c.clientId === data.selectedClientId);
        if (client) {
          requestBody.clientEmail = client.email;
        }
      } else {
        requestBody.clientEmail = data.clientEmail.trim();
        if (data.clientPassword.trim()) {
          requestBody.clientPassword = data.clientPassword.trim();
        }
        if (data.isCompany) {
          requestBody.isVatRegistered = data.isVatRegistered;
        }
      }

      const { data: responseData } = await apiFetch(`${apiUrl}/galleries`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(requestBody),
      });

      onSuccess(responseData.galleryId);
      onClose();
    } catch (err: any) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-8 max-w-4xl mx-auto">
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                Typ galerii
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Wybierz czy klient będzie mógł wybierać zdjęcia czy otrzyma wszystkie
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <button
                onClick={() => setData({ ...data, selectionEnabled: true })}
                className={`relative p-8 rounded-2xl border-2 transition-all duration-300 ${
                  data.selectionEnabled
                    ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10 shadow-lg scale-105"
                    : "border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
              >
                <div className="flex flex-col items-center space-y-4">
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
                    data.selectionEnabled ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"
                  }`}>
                    <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <div className={`text-xl font-semibold mb-2 ${
                      data.selectionEnabled ? "text-brand-600 dark:text-brand-400" : "text-gray-900 dark:text-white"
                    }`}>
                      Wybór przez klienta
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Klient wybiera zdjęcia, które chce otrzymać
                    </div>
                  </div>
                </div>
                {data.selectionEnabled && (
                  <div className="absolute top-4 right-4">
                    <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                )}
              </button>
              <button
                onClick={() => setData({ ...data, selectionEnabled: false })}
                className={`relative p-8 rounded-2xl border-2 transition-all duration-300 ${
                  !data.selectionEnabled
                    ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10 shadow-lg scale-105"
                    : "border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
              >
                <div className="flex flex-col items-center space-y-4">
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
                    !data.selectionEnabled ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"
                  }`}>
                    <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <div className={`text-xl font-semibold mb-2 ${
                      !data.selectionEnabled ? "text-brand-600 dark:text-brand-400" : "text-gray-900 dark:text-white"
                    }`}>
                      Wszystkie zdjęcia
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Klient otrzyma wszystkie zdjęcia bez możliwości wyboru
                    </div>
                  </div>
                </div>
                {!data.selectionEnabled && (
                  <div className="absolute top-4 right-4">
                    <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                )}
              </button>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6 max-w-2xl mx-auto">
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                Nazwa galerii
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Podaj unikalną nazwę dla tej galerii
              </p>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Nazwa galerii *
              </label>
              <Input
                type="text"
                placeholder="np. Sesja ślubna - Anna i Jan"
                value={data.galleryName}
                onChange={(e) => {
                  setData({ ...data, galleryName: e.target.value });
                  setGalleryNameError("");
                }}
                error={!!galleryNameError}
                hint={galleryNameError}
              />
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6 max-w-2xl mx-auto">
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                Pakiet cenowy
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Wybierz pakiet lub wprowadź dane ręcznie
              </p>
            </div>
            <div className="space-y-6">
              {existingPackages.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Wybierz pakiet (opcjonalne)
                  </label>
                  <Select
                    options={[
                      { value: "", label: "Wprowadź ręcznie" },
                      ...existingPackages.map((pkg) => ({
                        value: pkg.packageId,
                        label: `${pkg.name} - ${(pkg.price / 100).toFixed(2)} PLN`,
                      }))
                    ]}
                    placeholder="Wybierz pakiet"
                    value={data.selectedPackageId || ""}
                    onChange={(value) => {
                      if (value) {
                        handlePackageSelect(value);
                      } else {
                        setData({ ...data, selectedPackageId: undefined });
                      }
                    }}
                  />
                </div>
              )}

              <div className="space-y-4 p-6 bg-gray-50/50 dark:bg-gray-800/30 rounded-xl border border-gray-200 dark:border-gray-700">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Nazwa pakietu *
                  </label>
                  <Input
                    type="text"
                    placeholder="Nazwa pakietu"
                    value={data.packageName}
                    onChange={(e) => setData({ ...data, packageName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Liczba zdjęć w pakiecie
                  </label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={data.includedCount}
                    onChange={(e) =>
                      setData({ ...data, includedCount: parseInt(e.target.value) || 0 })
                    }
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Cena za dodatkowe zdjęcie (PLN)
                  </label>
                  <Input
                    type="text"
                    placeholder="0.00"
                    value={extraPriceInput !== null ? extraPriceInput : centsToPlnString(data.extraPriceCents)}
                    onChange={(e) => {
                      const formatted = formatPriceInput(e.target.value);
                      setExtraPriceInput(formatted);
                      setData({ ...data, extraPriceCents: plnToCents(formatted) });
                    }}
                    onBlur={() => {
                      // Clear input state on blur if empty, let it use cents value
                      if (!extraPriceInput || extraPriceInput === '') {
                        setExtraPriceInput(null);
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Cena pakietu (PLN)
                  </label>
                  <Input
                    type="text"
                    placeholder="0.00"
                    value={packagePriceInput !== null ? packagePriceInput : centsToPlnString(data.packagePriceCents)}
                    onChange={(e) => {
                      const formatted = formatPriceInput(e.target.value);
                      setPackagePriceInput(formatted);
                      setData({ ...data, packagePriceCents: plnToCents(formatted) });
                    }}
                    onBlur={() => {
                      // Clear input state on blur if empty, let it use cents value
                      if (!packagePriceInput || packagePriceInput === '') {
                        setPackagePriceInput(null);
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6 max-w-2xl mx-auto">
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                Dane klienta
              </h3>
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
                    options={[
                      { value: "", label: "Nowy klient" },
                      ...existingClients.map((client) => ({
                        value: client.clientId,
                        label: client.isCompany
                          ? `${client.companyName} (${client.email})`
                          : `${client.firstName} ${client.lastName} (${client.email})`,
                      }))
                    ]}
                    placeholder="Wybierz klienta"
                    value={data.selectedClientId || ""}
                    onChange={(value) => {
                      if (value) {
                        handleClientSelect(value);
                      } else {
                        setData({
                          ...data,
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

              {!data.selectedClientId && (
                <div className="space-y-4 p-6 bg-gray-50/50 dark:bg-gray-800/30 rounded-xl border border-gray-200 dark:border-gray-700">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Email klienta *
                    </label>
                    <Input
                      type="email"
                      placeholder="email@example.com"
                      value={data.clientEmail}
                      onChange={(e) => setData({ ...data, clientEmail: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Hasło (opcjonalne)
                    </label>
                    <Input
                      type="password"
                      placeholder="Hasło"
                      value={data.clientPassword}
                      onChange={(e) => setData({ ...data, clientPassword: e.target.value })}
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={data.isCompany}
                      onChange={(e) => setData({ ...data, isCompany: e.target.checked, isVatRegistered: e.target.checked ? data.isVatRegistered : false })}
                      className="w-4 h-4 text-brand-500 rounded"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Firma
                    </span>
                  </label>
                  {data.isCompany ? (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Nazwa firmy *
                        </label>
                        <Input
                          type="text"
                          placeholder="Nazwa firmy"
                          value={data.companyName}
                          onChange={(e) => setData({ ...data, companyName: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          NIP *
                        </label>
                        <Input
                          type="text"
                          placeholder="NIP"
                          value={data.nip}
                          onChange={(e) => setData({ ...data, nip: e.target.value })}
                        />
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={data.isVatRegistered}
                          onChange={(e) => setData({ ...data, isVatRegistered: e.target.checked })}
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
                          value={data.firstName}
                          onChange={(e) => setData({ ...data, firstName: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Nazwisko *
                        </label>
                        <Input
                          type="text"
                          placeholder="Nazwisko"
                          value={data.lastName}
                          onChange={(e) => setData({ ...data, lastName: e.target.value })}
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
                      value={data.phone}
                      onChange={(e) => setData({ ...data, phone: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 5:
        const planGroups = {
          "1m": PRICING_PLANS.filter((p) => p.value.includes("-1m")),
          "3m": PRICING_PLANS.filter((p) => p.value.includes("-3m")),
          "12m": PRICING_PLANS.filter((p) => p.value.includes("-12m")),
        };

        // Determine current plan period
        const currentPlanPeriod = selectedPlan || (data.plan.includes("-1m") ? "1m" : data.plan.includes("-3m") ? "3m" : "12m");

        return (
          <div className="space-y-8 max-w-5xl mx-auto">
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                Plan galerii
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Wybierz plan przechowywania dla galerii
              </p>
            </div>

            <div className="flex justify-center gap-2 mb-8">
              {(["1m", "3m", "12m"] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setSelectedPlan(period)}
                  className={`px-6 py-2 rounded-lg font-medium transition-all ${
                    currentPlanPeriod === period
                      ? "bg-brand-500 text-white shadow-lg"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  {period === "1m" ? "1 miesiąc" : period === "3m" ? "3 miesiące" : "12 miesięcy"}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {planGroups[currentPlanPeriod].map((plan) => {
                const isSelected = data.plan === plan.value;
                return (
                  <button
                    key={plan.value}
                    onClick={() => setData({ ...data, plan: plan.value })}
                    className={`relative p-6 rounded-xl border-2 transition-all duration-300 text-left ${
                      isSelected
                        ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10 shadow-lg"
                        : "border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600"
                    }`}
                  >
                    <div className="space-y-4">
                      <div>
                        <div className={`text-2xl font-bold mb-1 ${
                          isSelected ? "text-brand-600 dark:text-brand-400" : "text-gray-900 dark:text-white"
                        }`}>
                          {plan.storage}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {plan.duration}
                        </div>
                      </div>
                      <div className={`text-3xl font-bold ${
                        isSelected ? "text-brand-600 dark:text-brand-400" : "text-gray-900 dark:text-white"
                      }`}>
                        {plan.price} PLN
                      </div>
                      {isSelected && (
                        <div className="absolute top-4 right-4">
                          <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-6">
              <label className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <input
                  type="checkbox"
                  checked={data.hasBackupStorage}
                  onChange={(e) =>
                    setData({ ...data, hasBackupStorage: e.target.checked })
                  }
                  className="w-5 h-5 text-brand-500 rounded"
                />
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    Dodaj backup storage
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    30% ceny planu
                  </div>
                </div>
              </label>
            </div>
          </div>
        );

      case 6:
        const planData = PRICING_PLANS.find((p) => p.value === data.plan);
        const planPriceCents = planData ? planData.price * 100 : 700;
        const addonPriceCents = data.hasBackupStorage ? Math.round(planPriceCents * 0.3) : 0;
        const packagePriceCents = data.packagePriceCents || 0;
        const subtotal = planPriceCents + addonPriceCents + packagePriceCents;
        const vatCents = Math.round(subtotal * 0.23);
        const finalTotal = subtotal + vatCents;
        
        // Payment status based on package price (photography packet)
        const packageTotal = packagePriceCents;
        const paymentStatus =
          data.initialPaymentAmountCents === 0
            ? "UNPAID"
            : data.initialPaymentAmountCents >= packageTotal
            ? "PAID"
            : "PARTIALLY_PAID";

        return (
          <div className="space-y-6 max-w-3xl mx-auto">
            <div className="text-center">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                Podsumowanie
              </h3>
            </div>

            <div className="space-y-4 p-5 bg-gray-50/50 dark:bg-gray-800/30 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="space-y-3">
                <div className="flex justify-between items-center pb-3 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Typ galerii:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {data.selectionEnabled ? "Wybór przez klienta" : "Wszystkie zdjęcia"}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-3 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Nazwa galerii:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{data.galleryName || "Brak"}</span>
                </div>
                <div className="flex justify-between items-center pb-3 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Klient:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {data.selectedClientId
                      ? existingClients.find((c) => c.clientId === data.selectedClientId)?.email || "Nie wybrano"
                      : data.clientEmail || "Nie podano"}
                  </span>
                </div>
                
                <div className="pt-3 space-y-2">
                  <div className="text-xs font-semibold text-gray-900 dark:text-white mb-1.5">
                    Pakiet cenowy:
                  </div>
                  <div className="pl-3 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Nazwa:</span>
                      <span className="font-medium text-gray-900 dark:text-white">{data.packageName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Liczba zdjęć:</span>
                      <span className="font-medium text-gray-900 dark:text-white">{data.includedCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Cena za dodatkowe:</span>
                      <span className="font-medium text-gray-900 dark:text-white">{(data.extraPriceCents / 100).toFixed(2)} PLN</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Cena pakietu:</span>
                      <span className="font-medium text-gray-900 dark:text-white">{(packagePriceCents / 100).toFixed(2)} PLN</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 space-y-2 border-t border-gray-200 dark:border-gray-700">
                  <div className="text-xs font-semibold text-gray-900 dark:text-white mb-1.5">
                    Szczegóły ceny:
                  </div>
                  <div className="pl-3 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Plan {planData?.storage} {planData?.duration}:</span>
                      <span className="font-medium text-gray-900 dark:text-white">{planData?.price.toFixed(2)} PLN</span>
                    </div>
                    {data.hasBackupStorage && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Backup Storage:</span>
                        <span className="font-medium text-gray-900 dark:text-white">{(addonPriceCents / 100).toFixed(2)} PLN</span>
                      </div>
                    )}
                    {packagePriceCents > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Pakiet cenowy:</span>
                        <span className="font-medium text-gray-900 dark:text-white">{(packagePriceCents / 100).toFixed(2)} PLN</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-1.5 border-t border-gray-200 dark:border-gray-700">
                      <span className="text-gray-600 dark:text-gray-400">VAT 23%:</span>
                      <span className="font-medium text-gray-900 dark:text-white">{(vatCents / 100).toFixed(2)} PLN</span>
                    </div>
                    <div className="flex justify-between pt-1.5 border-t-2 border-gray-300 dark:border-gray-600">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">Całkowita cena:</span>
                      <span className="text-sm font-bold text-brand-600 dark:text-brand-400">{(finalTotal / 100).toFixed(2)} PLN</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Kwota wpłacona przez klienta (PLN)
                </label>
                <Input
                  type="text"
                  placeholder="0.00"
                  value={paymentAmountInput !== null ? paymentAmountInput : centsToPlnString(data.initialPaymentAmountCents)}
                  onChange={(e) => {
                    const formatted = formatPriceInput(e.target.value);
                    setPaymentAmountInput(formatted);
                    setData({
                      ...data,
                      initialPaymentAmountCents: plnToCents(formatted),
                    });
                  }}
                  onBlur={() => {
                    // Clear input state on blur if empty, let it use cents value
                    if (!paymentAmountInput || paymentAmountInput === '') {
                      setPaymentAmountInput(null);
                    }
                  }}
                />
              </div>
              <div className="p-4 bg-gray-50/50 dark:bg-gray-800/30 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  Status płatności:
                </p>
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
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="w-full h-[calc(100vh-140px)] flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 flex-shrink-0">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Utwórz galerię
        </h2>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <svg className="w-6 h-6 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Progress Bar */}
      <div className="px-6 py-6 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          {[1, 2, 3, 4, 5, 6].map((step) => (
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
                  {step === 5 && "Plan"}
                  {step === 6 && "Podsumowanie"}
                </div>
              </div>
              {step < 6 && (
                <div
                  className={`flex-1 h-1 mx-2 rounded-full transition-all duration-300 ${
                    step < currentStep
                      ? "bg-brand-500"
                      : "bg-gray-200 dark:bg-gray-700"
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
          <div className="w-full max-w-6xl mx-auto">
            {renderStep()}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm flex-shrink-0">
        <Button
          variant="outline"
          onClick={currentStep === 1 ? onClose : handleBack}
          disabled={loading}
        >
          {currentStep === 1 ? "Anuluj" : "Wstecz"}
        </Button>
        <div className="flex gap-3">
          {currentStep < 6 ? (
            <Button onClick={handleNext} disabled={loading}>
              Dalej
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading} variant="primary">
              {loading ? "Tworzenie..." : "Utwórz galerię"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateGalleryWizard;
