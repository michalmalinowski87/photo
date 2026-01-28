import { Info, Save, AlertTriangle } from "lucide-react";
import { useRouter } from "next/router";
import React, { useState, useEffect } from "react";

import {
  useUpdateGallery,
  useUpdateGalleryName,
  useUpdateGalleryClientPassword,
  useUpdateGalleryPricingPackage,
} from "../../hooks/mutations/useGalleryMutations";
import { useGallery, useGalleryDeliveredOrders } from "../../hooks/queries/useGalleries";
import { useToast } from "../../hooks/useToast";
import { formatApiError } from "../../lib/api-service";
import { formatCurrencyInput, plnToCents, centsToPlnString } from "../../lib/currency";
import { generatePassword } from "../../lib/password";
import Button from "../ui/button/Button";
import Input from "../ui/input/InputField";
import { WatermarkPersonalizationOverlay } from "./sidebar/WatermarkPersonalizationOverlay";
import { LoginPersonalizationOverlay } from "./sidebar/LoginPersonalizationOverlay";

interface SettingsForm {
  galleryName: string;
  clientEmail: string;
  clientPassword: string;
  packageName?: string;
  includedCount: number;
  extraPriceCents: number;
  packagePriceCents: number;
}

interface GallerySettingsFormProps {
  galleryId: string;
  onCancel?: () => void;
  cancelLabel?: string;
  cancelHref?: string;
}

export function GallerySettingsForm({
  galleryId,
  onCancel,
  cancelLabel = "Anuluj",
  cancelHref,
}: GallerySettingsFormProps) {
  const router = useRouter();
  const { showToast } = useToast();

  // Use React Query hooks
  const { data: gallery, isLoading: galleryLoading } = useGallery(galleryId);

  // Don't fetch gallery here - GalleryLayoutWrapper handles all gallery fetching
  // This component should only read from the store, not trigger fetches
  // The gallery should already be loaded by GalleryLayoutWrapper before this component renders
  const { data: deliveredOrders = [], isLoading: checkingDelivered } =
    useGalleryDeliveredOrders(galleryId);
  const hasDeliveredOrders = deliveredOrders.length > 0;

  // Use React Query mutations for data operations
  const updateGalleryMutation = useUpdateGallery();
  const updateGalleryNameMutation = useUpdateGalleryName();
  const updateClientPasswordMutation = useUpdateGalleryClientPassword();
  const updatePricingPackageMutation = useUpdateGalleryPricingPackage();
  const saving =
    updateGalleryMutation.isPending ||
    updateGalleryNameMutation.isPending ||
    updateClientPasswordMutation.isPending ||
    updatePricingPackageMutation.isPending;
  const [settingsForm, setSettingsForm] = useState<SettingsForm>({
    galleryName: "",
    clientEmail: "",
    clientPassword: "",
    packageName: "",
    includedCount: 0,
    extraPriceCents: 0,
    packagePriceCents: 0,
  });
  const [extraPriceInput, setExtraPriceInput] = useState<string | null>(null);
  const [packagePriceInput, setPackagePriceInput] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"general" | "package" | "personalize">("general");
  const [showWatermarkPersonalizationOverlay, setShowWatermarkPersonalizationOverlay] = useState(false);
  const [showLoginPersonalizationOverlay, setShowLoginPersonalizationOverlay] = useState(false);
  const [errors, setErrors] = useState<{
    galleryName?: string;
    clientEmail?: string;
    packageName?: string;
    includedCount?: string;
    extraPriceCents?: string;
    packagePriceCents?: string;
  }>({});

  // Gallery data comes from GalleryContext - initialize form when gallery loads
  useEffect(() => {
    if (gallery) {
      const pricingPackage = gallery.pricingPackage as
        | {
            packageName?: string;
            includedCount?: number;
            extraPriceCents?: number;
            packagePriceCents?: number;
          }
        | undefined;
      setSettingsForm({
        galleryName: (gallery.galleryName as string | undefined) ?? "",
        clientEmail: (gallery.clientEmail as string | undefined) ?? "",
        clientPassword: "",
        packageName: pricingPackage?.packageName ?? "",
        includedCount: pricingPackage?.includedCount ?? 0,
        extraPriceCents: pricingPackage?.extraPriceCents ?? 0,
        packagePriceCents: pricingPackage?.packagePriceCents ?? 0,
      });
      setExtraPriceInput(null);
      setPackagePriceInput(null);
    }
  }, [gallery]);

  // Validation function
  const validateForm = (): boolean => {
    const newErrors: typeof errors = {};

    // Gallery name validation
    const trimmedGalleryName = settingsForm.galleryName.trim();
    if (!trimmedGalleryName || trimmedGalleryName.length === 0) {
      newErrors.galleryName = "Nazwa galerii jest wymagana";
    } else if (trimmedGalleryName.length > 100) {
      newErrors.galleryName = "Nazwa galerii nie może przekraczać 100 znaków";
    }

    // Client email validation
    const trimmedEmail = settingsForm.clientEmail.trim();
    if (!trimmedEmail || trimmedEmail.length === 0) {
      newErrors.clientEmail = "Email logowania jest wymagany";
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        newErrors.clientEmail = "Podaj prawidłowy adres email";
      }
    }

    // Package validation
    const trimmedPackageName = settingsForm.packageName?.trim() ?? "";
    if (!trimmedPackageName || trimmedPackageName.length === 0) {
      newErrors.packageName = "Nazwa pakietu jest wymagana";
    }

    if (settingsForm.includedCount < 0) {
      newErrors.includedCount = "Liczba zdjęć nie może być ujemna";
    }

    if (settingsForm.extraPriceCents < 0) {
      newErrors.extraPriceCents = "Cena za dodatkowe zdjęcie nie może być ujemna";
    }

    if (settingsForm.packagePriceCents < 0) {
      newErrors.packagePriceCents = "Cena pakietu nie może być ujemna";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Check if form is currently valid (without setting errors)
  const isFormValid = (): boolean => {
    const trimmedGalleryName = settingsForm.galleryName.trim();
    if (!trimmedGalleryName || trimmedGalleryName.length === 0 || trimmedGalleryName.length > 100) {
      return false;
    }

    const trimmedEmail = settingsForm.clientEmail.trim();
    if (!trimmedEmail || trimmedEmail.length === 0) {
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return false;
    }

    const trimmedPackageName = settingsForm.packageName?.trim() ?? "";
    if (!trimmedPackageName || trimmedPackageName.length === 0) {
      return false;
    }

    if (settingsForm.includedCount < 0) {
      return false;
    }

    if (settingsForm.extraPriceCents < 0) {
      return false;
    }

    if (settingsForm.packagePriceCents < 0) {
      return false;
    }

    return true;
  };

  const handleUpdateSettings = async (): Promise<void> => {
    if (!galleryId) {
      return;
    }

    // Validate form before submitting
    if (!validateForm()) {
      showToast("error", "Błąd", "Proszę poprawić błędy w formularzu");
      return;
    }

    try {
      // Check what needs to be updated
      const currentGalleryName =
        typeof gallery?.galleryName === "string" ? gallery.galleryName : "";
      const galleryNameChanged = settingsForm.galleryName.trim() !== currentGalleryName.trim();

      const currentClientEmail =
        typeof gallery?.clientEmail === "string" ? gallery.clientEmail : "";
      const clientEmailChanged = settingsForm.clientEmail.trim() !== currentClientEmail.trim();

      const passwordChanged = Boolean(settingsForm.clientPassword && settingsForm.clientEmail);

      const currentPkg = gallery?.pricingPackage as
        | {
            packageName?: string;
            includedCount?: number;
            extraPriceCents?: number;
            packagePriceCents?: number;
          }
        | undefined;
      const pkgChanged =
        settingsForm.packageName !== currentPkg?.packageName ||
        settingsForm.includedCount !== currentPkg?.includedCount ||
        settingsForm.extraPriceCents !== currentPkg?.extraPriceCents ||
        settingsForm.packagePriceCents !== currentPkg?.packagePriceCents;

      // If only gallery name changed, use the optimistic-only mutation (no refetch)
      // If other fields changed too, use the full mutation (with refetch for consistency)
      const onlyNameChanged =
        galleryNameChanged && !clientEmailChanged && !passwordChanged && !pkgChanged;

      // Update gallery name if changed
      if (galleryNameChanged) {
        const trimmedName = settingsForm.galleryName.trim();

        if (onlyNameChanged) {
          // Use optimistic-only mutation for name-only updates (no refetch)
          await updateGalleryNameMutation.mutateAsync({
            galleryId,
            galleryName: trimmedName,
          });
        } else {
          // Use full mutation when other fields are also being updated
          await updateGalleryMutation.mutateAsync({
            galleryId,
            data: {
              galleryName: trimmedName,
            },
          });
        }
      }

      // Update client email if changed (without password)
      if (clientEmailChanged && !passwordChanged) {
        await updateGalleryMutation.mutateAsync({
          galleryId,
          data: {
            clientEmail: settingsForm.clientEmail.trim(),
          },
        });
      }

      // Update client password if provided (requires clientEmail)
      if (passwordChanged) {
        await updateClientPasswordMutation.mutateAsync({
          galleryId,
          password: settingsForm.clientPassword,
          clientEmail: settingsForm.clientEmail,
        });
      }

      // Update pricing package if changed
      if (pkgChanged) {
        // Ensure all required fields are present and valid
        const trimmedPackageName = settingsForm.packageName?.trim();
        const packageName =
          trimmedPackageName && trimmedPackageName.length > 0 ? trimmedPackageName : undefined;
        const includedCount = Number(settingsForm.includedCount) || 0;
        const extraPriceCents = Number(settingsForm.extraPriceCents) || 0;
        const packagePriceCents = Number(settingsForm.packagePriceCents) || 0;

        await updatePricingPackageMutation.mutateAsync({
          galleryId,
          pricingPackage: {
            packageName,
            includedCount,
            extraPriceCents,
            packagePriceCents,
          },
        });
      }

      // Only show success if at least one change was made
      if (galleryNameChanged || clientEmailChanged || passwordChanged || pkgChanged) {
        showToast("success", "Sukces", "Ustawienia zostały zaktualizowane");
      }
      // React Query mutations will automatically invalidate and refetch gallery data
      // (except for name-only updates which use optimistic-only mutation)
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else if (cancelHref) {
      void router.push(cancelHref);
    }
  };

  // Hide cancel button on order settings page
  const isOrderSettingsPage =
    router.pathname?.includes("/orders/") && router.pathname?.includes("/settings");
  const showCancelButton =
    !isOrderSettingsPage && (onCancel ?? cancelHref ?? cancelLabel !== "Anuluj");

  // Gallery data comes from GalleryContext (provided by GalleryLayoutWrapper)
  if (!gallery && !galleryLoading) {
    return null; // Error is handled by GalleryLayoutWrapper
  }

  // Show loading while checking delivered orders or loading gallery
  if (checkingDelivered || galleryLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Ustawienia galerii</h1>
        <div className="p-6 bg-white border border-gray-400 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
          <div className="text-center py-8">
            <div className="text-gray-500 dark:text-gray-400">
              {galleryLoading ? "Ładowanie danych galerii..." : "Sprawdzanie statusu galerii..."}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show locked form if gallery is delivered - but allow gallery name and extra price editing
  if (hasDeliveredOrders) {
    const handleUpdateLockedSettings = async (): Promise<void> => {
      if (!galleryId) {
        return;
      }

      // Validate gallery name
      const trimmedName = settingsForm.galleryName.trim();
      if (!trimmedName || trimmedName.length === 0) {
        setErrors({ galleryName: "Nazwa galerii jest wymagana" });
        showToast("error", "Błąd", "Nazwa galerii jest wymagana");
        return;
      }
      if (trimmedName.length > 100) {
        setErrors({ galleryName: "Nazwa galerii nie może przekraczać 100 znaków" });
        showToast("error", "Błąd", "Nazwa galerii nie może przekraczać 100 znaków");
        return;
      }

      // Validate extra price
      if (settingsForm.extraPriceCents < 0) {
        setErrors({ extraPriceCents: "Cena za dodatkowe zdjęcie nie może być ujemna" });
        showToast("error", "Błąd", "Cena za dodatkowe zdjęcie nie może być ujemna");
        return;
      }

      try {
        const currentGalleryName =
          typeof gallery?.galleryName === "string" ? gallery.galleryName : "";
        const galleryNameChanged = settingsForm.galleryName.trim() !== currentGalleryName.trim();

        const currentPkg = gallery?.pricingPackage as
          | {
              packageName?: string;
              includedCount?: number;
              extraPriceCents?: number;
              packagePriceCents?: number;
            }
          | undefined;
        const extraPriceChanged =
          settingsForm.extraPriceCents !== (currentPkg?.extraPriceCents ?? 0);

        // Update gallery name if changed
        if (galleryNameChanged) {
          await updateGalleryNameMutation.mutateAsync({
            galleryId,
            galleryName: trimmedName,
          });
        }

        // Update pricing package if extra price changed
        if (extraPriceChanged) {
          const trimmedPackageName = currentPkg?.packageName?.trim();
          const packageName =
            trimmedPackageName && trimmedPackageName.length > 0 ? trimmedPackageName : undefined;
          const includedCount = currentPkg?.includedCount ?? 0;
          const extraPriceCents = Number(settingsForm.extraPriceCents) || 0;
          const packagePriceCents = currentPkg?.packagePriceCents ?? 0;

          await updatePricingPackageMutation.mutateAsync({
            galleryId,
            pricingPackage: {
              packageName,
              includedCount,
              extraPriceCents,
              packagePriceCents,
            },
          });
        }

        // Show success if at least one change was made
        if (galleryNameChanged || extraPriceChanged) {
          showToast("success", "Sukces", "Ustawienia zostały zaktualizowane");
        }
      } catch (err) {
        showToast("error", "Błąd", formatApiError(err));
      }
    };

    const canSaveLockedSettings = (() => {
      const trimmedName = settingsForm.galleryName.trim();
      const nameValid = trimmedName.length > 0 && trimmedName.length <= 100;
      const extraPriceValid = settingsForm.extraPriceCents >= 0;
      return nameValid && extraPriceValid;
    })();

    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">Ustawienia galerii</h1>

        <div className="p-8 bg-white border border-gray-400 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
          <div className="p-4 bg-blue-light-50 border border-blue-light-500 rounded-lg dark:bg-blue-light-500/15 dark:border-blue-light-500/30 mb-4">
            <div className="flex items-center gap-3 mb-2">
              <Info
                size={28}
                className="text-blue-light-500 dark:text-blue-light-400"
                strokeWidth={2}
              />
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">
                Ograniczone edytowanie ustawień
              </h2>
            </div>
            <p className="text-base text-gray-500 dark:text-gray-400">
              Galeria ma dostarczone zlecenia, dlatego większość ustawień jest zablokowana. Możesz
              jednak zmienić nazwę galerii oraz cenę za dodatkowe zdjęcie w dowolnym momencie.
            </p>
          </div>

          <div className="space-y-2">
            <div>
              <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Nazwa galerii <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                placeholder="Nazwa galerii"
                value={settingsForm.galleryName}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.length <= 100) {
                    setSettingsForm({ ...settingsForm, galleryName: value });
                    // Clear error when user starts typing
                    if (errors.galleryName) {
                      setErrors({ ...errors, galleryName: undefined });
                    }
                  }
                }}
                maxLength={100}
                required
                error={!!errors.galleryName}
                errorMessage={errors.galleryName}
              />
            </div>

            <div className="space-y-2 opacity-60">
              <div>
                <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Email logowania
                </label>
                <Input
                  type="email"
                  placeholder={galleryLoading ? "Ładowanie danych..." : "Email klienta"}
                  value={galleryLoading ? "" : (settingsForm.clientEmail ?? "")}
                  disabled={true}
                />
              </div>

              <div>
                <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Hasło klienta (opcjonalne)
                </label>
                <div className="flex gap-2 items-start">
                  <div className="flex-1">
                    <Input type="password" placeholder="Nowe hasło" value="" disabled={true} />
                  </div>
                  <Button
                    type="button"
                    disabled={true}
                    className="bg-gray-400 hover:bg-gray-400 text-white whitespace-nowrap h-11 cursor-not-allowed"
                  >
                    Generuj
                  </Button>
                </div>
              </div>

              <div className="border-t border-gray-400 dark:border-gray-700 pt-3">
                <h3 className="text-base font-medium text-gray-900 dark:text-white mb-2.5">
                  Pakiet cenowy
                </h3>

                <div className="space-y-2">
                  <div>
                    <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Nazwa pakietu
                    </label>
                    <Input
                      type="text"
                      placeholder="Nazwa pakietu"
                      value={settingsForm.packageName ?? ""}
                      disabled={true}
                    />
                  </div>

                  <div>
                    <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Liczba zdjęć w pakiecie
                    </label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={settingsForm.includedCount}
                      disabled={true}
                    />
                  </div>

                  <div>
                    <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Cena pakietu (PLN)
                    </label>
                    <Input
                      type="text"
                      placeholder="0.00"
                      value={centsToPlnString(settingsForm.packagePriceCents)}
                      disabled={true}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Cena za dodatkowe zdjęcie (PLN)
              </label>
              <Input
                type="text"
                placeholder="0.00"
                value={extraPriceInput ?? centsToPlnString(settingsForm.extraPriceCents)}
                onChange={(e) => {
                  const formatted = formatCurrencyInput(e.target.value);
                  setExtraPriceInput(formatted);
                  const cents = plnToCents(formatted);
                  setSettingsForm({
                    ...settingsForm,
                    extraPriceCents: cents,
                  });
                  // Clear error when user starts typing
                  if (errors.extraPriceCents) {
                    setErrors({ ...errors, extraPriceCents: undefined });
                  }
                }}
                onBlur={() => {
                  // Clear input state on blur if empty, let it use cents value
                  if (!extraPriceInput || extraPriceInput === "") {
                    setExtraPriceInput(null);
                  }
                }}
                error={!!errors.extraPriceCents}
                errorMessage={errors.extraPriceCents}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-4">
            {showCancelButton && (
              <Button variant="outline" onClick={handleCancel} disabled={saving}>
                {cancelLabel}
              </Button>
            )}
            <Button
              variant="primary"
              onClick={handleUpdateLockedSettings}
              disabled={!canSaveLockedSettings || saving}
              startIcon={<Save size={20} />}
            >
              {saving ? "Zapisywanie..." : "Zapisz"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Check if watermark is set
  const hasWatermark = Boolean(gallery?.watermarkUrl);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">Ustawienia galerii</h1>

      {/* Sub-settings tabs */}
      <div className="flex gap-2 border-b border-gray-300 dark:border-gray-700">
        <button
          onClick={() => setActiveTab("general")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "general"
              ? "border-b-2 border-photographer-accent text-photographer-accent"
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
          }`}
        >
          Ogólne
        </button>
        <button
          onClick={() => setActiveTab("package")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "package"
              ? "border-b-2 border-photographer-accent text-photographer-accent"
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
          }`}
        >
          Pakiet
        </button>
        <button
          onClick={() => setActiveTab("personalize")}
          className={`px-4 py-2 font-medium transition-colors flex items-center gap-2 ${
            activeTab === "personalize"
              ? "border-b-2 border-photographer-accent text-photographer-accent"
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
          }`}
        >
          Personalizacja
          {!hasWatermark && (
            <AlertTriangle size={18} className="text-orange-500 dark:text-orange-400" />
          )}
        </button>
      </div>

      <div className="p-8 bg-white border border-gray-400 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
        {activeTab === "general" && (
          <div className="space-y-2">
            <div>
              <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Nazwa galerii <span className="text-red-500">*</span>
              </label>
            <Input
              type="text"
              placeholder="Nazwa galerii"
              value={settingsForm.galleryName}
              onChange={(e) => {
                const value = e.target.value;
                if (value.length <= 100) {
                  setSettingsForm({ ...settingsForm, galleryName: value });
                  // Clear error when user starts typing
                  if (errors.galleryName) {
                    setErrors({ ...errors, galleryName: undefined });
                  }
                }
              }}
              maxLength={100}
              required
              error={!!errors.galleryName}
              errorMessage={errors.galleryName}
            />
          </div>

          <div>
            <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Email logowania <span className="text-red-500">*</span>
            </label>
            <Input
              type="email"
              placeholder={galleryLoading ? "Ładowanie danych..." : "Email klienta"}
              value={galleryLoading ? "" : (settingsForm.clientEmail ?? "")}
              onChange={(e) => {
                setSettingsForm({ ...settingsForm, clientEmail: e.target.value });
                // Clear error when user starts typing
                if (errors.clientEmail) {
                  setErrors({ ...errors, clientEmail: undefined });
                }
              }}
              disabled={galleryLoading}
              required
              error={!!errors.clientEmail}
              errorMessage={errors.clientEmail}
            />
          </div>

          <div>
            <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Hasło klienta (opcjonalne)
            </label>
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <Input
                  type="password"
                  placeholder="Nowe hasło"
                  value={settingsForm.clientPassword}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, clientPassword: e.target.value })
                  }
                  hint="Pozostaw puste aby nie zmieniać hasła"
                />
              </div>
              <Button
                type="button"
                onClick={() => {
                  const newPassword = generatePassword();
                  setSettingsForm({ ...settingsForm, clientPassword: newPassword });
                }}
                className="bg-green-600 hover:bg-green-700 text-white whitespace-nowrap h-11"
              >
                Generuj
              </Button>
            </div>
          </div>
        )}

        {activeTab === "package" && (
          <div className="space-y-2">
            <div className="border-b border-gray-400 dark:border-gray-700 pb-3 mb-3">
              <h3 className="text-base font-medium text-gray-900 dark:text-white mb-2.5">
                Pakiet cenowy
              </h3>

            <div className="space-y-2">
              <div>
                <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Nazwa pakietu
                </label>
                <Input
                  type="text"
                  placeholder="Nazwa pakietu"
                  value={settingsForm.packageName}
                  onChange={(e) => {
                    setSettingsForm({ ...settingsForm, packageName: e.target.value });
                    // Clear error when user starts typing
                    if (errors.packageName) {
                      setErrors({ ...errors, packageName: undefined });
                    }
                  }}
                  required
                  error={!!errors.packageName}
                  errorMessage={errors.packageName}
                />
              </div>

              <div>
                <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Liczba zdjęć w pakiecie <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  placeholder="0"
                  value={settingsForm.includedCount}
                  onChange={(e) => {
                    const value = Number.parseInt(e.target.value, 10) || 0;
                    setSettingsForm({
                      ...settingsForm,
                      includedCount: value,
                    });
                    // Clear error when user starts typing
                    if (errors.includedCount) {
                      setErrors({ ...errors, includedCount: undefined });
                    }
                  }}
                  min="0"
                  required
                  error={!!errors.includedCount}
                  errorMessage={errors.includedCount}
                />
              </div>

              <div>
                <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Cena za dodatkowe zdjęcie (PLN)
                </label>
                <Input
                  type="text"
                  placeholder="0.00"
                  value={extraPriceInput ?? centsToPlnString(settingsForm.extraPriceCents)}
                  onChange={(e) => {
                    const formatted = formatCurrencyInput(e.target.value);
                    setExtraPriceInput(formatted);
                    const cents = plnToCents(formatted);
                    setSettingsForm({
                      ...settingsForm,
                      extraPriceCents: cents,
                    });
                    // Clear error when user starts typing
                    if (errors.extraPriceCents) {
                      setErrors({ ...errors, extraPriceCents: undefined });
                    }
                  }}
                  onBlur={() => {
                    // Clear input state on blur if empty, let it use cents value
                    if (!extraPriceInput || extraPriceInput === "") {
                      setExtraPriceInput(null);
                    }
                  }}
                  required
                  error={!!errors.extraPriceCents}
                  errorMessage={errors.extraPriceCents}
                />
              </div>

              <div>
                <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Cena pakietu (PLN) <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  placeholder="0.00"
                  value={packagePriceInput ?? centsToPlnString(settingsForm.packagePriceCents)}
                  onChange={(e) => {
                    const formatted = formatCurrencyInput(e.target.value);
                    setPackagePriceInput(formatted);
                    const cents = plnToCents(formatted);
                    setSettingsForm({
                      ...settingsForm,
                      packagePriceCents: cents,
                    });
                    // Clear error when user starts typing
                    if (errors.packagePriceCents) {
                      setErrors({ ...errors, packagePriceCents: undefined });
                    }
                  }}
                  onBlur={() => {
                    // Clear input state on blur if empty, let it use cents value
                    if (!packagePriceInput || packagePriceInput === "") {
                      setPackagePriceInput(null);
                    }
                  }}
                  required
                  error={!!errors.packagePriceCents}
                  errorMessage={errors.packagePriceCents}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === "personalize" && (
          <div className="space-y-6">
            <p className="text-base text-gray-600 dark:text-gray-400">
              Dostosuj wygląd galerii i zabezpiecz zdjęcia znakiem wodnym.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <button
                onClick={() => setShowLoginPersonalizationOverlay(true)}
                className="p-6 border-2 border-gray-400 dark:border-gray-700 rounded-lg hover:border-photographer-accent dark:hover:border-photographer-accent transition-colors text-left"
              >
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Szablon logowania
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Wybierz układ strony logowania i dostosuj pozycję zdjęcia okładkowego
                </p>
              </button>
              <button
                onClick={() => setShowWatermarkPersonalizationOverlay(true)}
                className="p-6 border-2 border-gray-400 dark:border-gray-700 rounded-lg hover:border-photographer-accent dark:hover:border-photographer-accent transition-colors text-left relative"
              >
                {!hasWatermark && (
                  <div className="absolute top-2 right-2">
                    <AlertTriangle size={20} className="text-orange-500 dark:text-orange-400" />
                  </div>
                )}
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Znak wodny
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {hasWatermark
                    ? "Zarządzaj znakiem wodnym na zdjęciach"
                    : "Dodaj znak wodny, aby zabezpieczyć zdjęcia"}
                </p>
              </button>
            </div>
          </div>
        )}

        {(activeTab === "general" || activeTab === "package") && (
          <div className="flex justify-end gap-3 mt-4">
          {showCancelButton && (
            <Button variant="outline" onClick={handleCancel} disabled={saving}>
              {cancelLabel}
            </Button>
          )}
          <Button
            variant="primary"
            onClick={handleUpdateSettings}
            disabled={saving || !isFormValid()}
            startIcon={<Save size={20} />}
          >
            {saving ? "Zapisywanie..." : "Zapisz"}
          </Button>
        </div>
        )}
      </div>

      {/* Watermark Personalization Overlay */}
      {gallery && (
        <WatermarkPersonalizationOverlay
          isOpen={showWatermarkPersonalizationOverlay}
          onClose={() => setShowWatermarkPersonalizationOverlay(false)}
          galleryId={galleryId}
          gallery={gallery}
          coverPhotoUrl={
            gallery.coverPhotoUrl && typeof gallery.coverPhotoUrl === "string"
              ? gallery.coverPhotoUrl
              : undefined
          }
        />
      )}

      {/* Login Personalization Overlay */}
      {gallery && gallery.coverPhotoUrl && typeof gallery.coverPhotoUrl === "string" && (
        <LoginPersonalizationOverlay
          isOpen={showLoginPersonalizationOverlay}
          onClose={() => setShowLoginPersonalizationOverlay(false)}
          galleryId={galleryId}
          coverPhotoUrl={gallery.coverPhotoUrl}
        />
      )}
    </div>
  );
}
