import { Info, Save, AlertTriangle } from "lucide-react";
import { useRouter } from "next/router";
import React, { useState, useEffect } from "react";

import {
  useUpdateGallery,
  useUpdateGalleryName,
  useUpdateGalleryClientPassword,
  useUpdateGalleryPricingPackage,
} from "../../hooks/mutations/useGalleryMutations";
import { useBusinessInfo } from "../../hooks/queries/useAuth";
import { useGallery, useGalleryDeliveredOrders } from "../../hooks/queries/useGalleries";
import { useToast } from "../../hooks/useToast";
import { formatApiError } from "../../lib/api-service";
import { formatCurrencyInput, plnToCents, centsToPlnString } from "../../lib/currency";
import { generatePassword } from "../../lib/password";
import Button from "../ui/button/Button";
import Input from "../ui/input/InputField";

import { LoginPersonalizationOverlay } from "./sidebar/LoginPersonalizationOverlay";
import { WatermarkEditorOverlay } from "./sidebar/WatermarkEditorOverlay";

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
  defaultTab?: "general" | "package" | "personalize";
}

export function GallerySettingsForm({
  galleryId,
  onCancel,
  cancelLabel = "Anuluj",
  cancelHref,
  defaultTab,
}: GallerySettingsFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  
  // Get active tab from URL or defaultTab prop
  const urlTab = router.query.tab as string | undefined;
  const activeTabFromUrl = urlTab as "general" | "package" | "personalize" | undefined;
  const initialTab = activeTabFromUrl || defaultTab || "general";
  // #region agent log
  fetch("http://127.0.0.1:7243/ingest/50d01496-c9df-4121-8d58-8b499aed9e39", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "GallerySettingsForm.tsx:urlTab",
      message: "URL tab and derived state",
      data: { urlTab, activeTabFromUrl, initialTab, pathname: router.pathname, asPath: router.asPath, isReady: router.isReady },
      timestamp: Date.now(),
      sessionId: "debug-session",
      runId: "post-fix",
      hypothesisId: "H2-H4",
    }),
  }).catch(() => {});
  // #endregion

  // Use React Query hooks
  const { data: businessInfo } = useBusinessInfo();
  const galleryQuery = useGallery(galleryId);
  const gallery = galleryQuery.data;
  const galleryLoading = galleryQuery.isLoading;

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
  const [activeTab, setActiveTab] = useState<"general" | "package" | "personalize">(initialTab);
  // Use URL as source of truth for which content to show (avoids stale view on sidebar nav)
  const effectiveTab: "general" | "package" | "personalize" =
    activeTabFromUrl || activeTab || "general";

  // Update activeTab when URL changes
  useEffect(() => {
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/50d01496-c9df-4121-8d58-8b499aed9e39", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "GallerySettingsForm.tsx:useEffect-sync-tab",
        message: "Effect run: sync tab from URL",
        data: { activeTabFromUrl, activeTab, willSet: Boolean(activeTabFromUrl && activeTabFromUrl !== activeTab) },
        timestamp: Date.now(),
        sessionId: "debug-session",
        hypothesisId: "H2-H4",
      }),
    }).catch(() => {});
    // #endregion
    if (activeTabFromUrl && activeTabFromUrl !== activeTab) {
      setActiveTab(activeTabFromUrl);
    }
  }, [activeTabFromUrl, activeTab]);
  
  const [showWatermarkEditorOverlay, setShowWatermarkEditorOverlay] = useState(false);
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
  // #region agent log
  if (typeof window !== "undefined") {
    fetch("http://127.0.0.1:7243/ingest/50d01496-c9df-4121-8d58-8b499aed9e39", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "GallerySettingsForm.tsx:branch",
        message: "Which branch renders",
        data: { hasDeliveredOrders, effectiveTab },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "post-fix",
        hypothesisId: "H1-H5",
      }),
    }).catch(() => {});
  }
  // #endregion
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

      try {
        const currentGalleryName =
          typeof gallery?.galleryName === "string" ? gallery.galleryName : "";
        const galleryNameChanged = settingsForm.galleryName.trim() !== currentGalleryName.trim();

        // Update gallery name if changed
        if (galleryNameChanged) {
          await updateGalleryNameMutation.mutateAsync({
            galleryId,
            galleryName: trimmedName,
          });
        }

        if (galleryNameChanged) {
          showToast("success", "Sukces", "Ustawienia zostały zaktualizowane");
        }
      } catch (err) {
        showToast("error", "Błąd", formatApiError(err));
      }
    };

    const canSaveLockedSettings = (() => {
      const trimmedName = settingsForm.galleryName.trim();
      return trimmedName.length > 0 && trimmedName.length <= 100;
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
              jednak zmienić nazwę galerii w dowolnym momencie.
            </p>
          </div>

          <div className="space-y-2">
            {(effectiveTab === "general" || effectiveTab === "package") && (
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
            )}

            {effectiveTab === "general" && (
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
              </div>
            )}

            {effectiveTab === "package" && (
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
            )}

            {effectiveTab === "personalize" && (
              <p className="text-base text-gray-600 dark:text-gray-400">
                Galeria ma dostarczone zlecenia. Personalizacja (szablon logowania, znak wodny) nie
                jest już edytowalna.
              </p>
            )}
          </div>

          {(effectiveTab === "general" || effectiveTab === "package") && (
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
          )}
        </div>
      </div>
    );
  }

  // Check if any watermark is set (gallery-specific or user default) – show warning only when neither is set
  const hasGalleryWatermark = Boolean(gallery?.watermarkUrl);
  const hasUserDefaultWatermark = Boolean(businessInfo?.defaultWatermarkUrl);
  const hasWatermark = hasGalleryWatermark || hasUserDefaultWatermark;

  const hasCoverPhoto = Boolean(
    gallery?.coverPhotoUrl && typeof gallery.coverPhotoUrl === "string"
  );
  // #region agent log
  if (typeof window !== "undefined") {
    fetch("http://127.0.0.1:7243/ingest/50d01496-c9df-4121-8d58-8b499aed9e39", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "GallerySettingsForm.tsx:main-return",
        message: "Main return: effectiveTab used for content",
        data: { effectiveTab, activeTabFromUrl },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "post-fix",
        hypothesisId: "H2-H4",
      }),
    }).catch(() => {});
  }
  // #endregion

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">Ustawienia galerii</h1>

      <div className="p-8 bg-white border border-gray-400 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
        {effectiveTab === "general" && (
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
        </div>
        )}

        {effectiveTab === "package" && (
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
                    if (errors.packagePriceCents) {
                      setErrors({ ...errors, packagePriceCents: undefined });
                    }
                  }}
                  onBlur={() => {
                    if (!packagePriceInput || packagePriceInput === "") {
                      setPackagePriceInput(null);
                    }
                  }}
                  required
                  error={!!errors.packagePriceCents}
                  errorMessage={errors.packagePriceCents}
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
                    if (errors.extraPriceCents) {
                      setErrors({ ...errors, extraPriceCents: undefined });
                    }
                  }}
                  onBlur={() => {
                    if (!extraPriceInput || extraPriceInput === "") {
                      setExtraPriceInput(null);
                    }
                  }}
                  error={!!errors.extraPriceCents}
                  errorMessage={errors.extraPriceCents}
                />
              </div>
            </div>
          </div>
        </div>
        )}

        {effectiveTab === "personalize" && (
          <div className="space-y-6">
            <p className="text-base text-gray-600 dark:text-gray-400">
              Wybierz, co chcesz spersonalizować:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
              <button
                type="button"
                onClick={() => hasCoverPhoto && setShowLoginPersonalizationOverlay(true)}
                disabled={!hasCoverPhoto}
                className={`relative p-10 md:p-12 rounded-2xl border-2 transition-all duration-300 ${
                  hasCoverPhoto
                    ? "border-gray-400 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 hover:border-photographer-accent dark:hover:border-photographer-accent active:scale-[0.98]"
                    : "border-gray-300 dark:border-gray-600 bg-gray-100/50 dark:bg-gray-800/30 cursor-not-allowed opacity-75"
                }`}
              >
                <div className="flex flex-col items-center space-y-4">
                  <div className="w-20 h-20 rounded-full flex items-center justify-center bg-photographer-muted dark:bg-gray-700">
                    <svg
                      className="w-10 h-10 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
                      Szablon logowania
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {hasCoverPhoto
                        ? "Wybierz układ strony logowania i dostosuj pozycję zdjęcia okładkowego"
                        : "Aby aktywować tę opcję, wgraj okładkę galerii"}
                    </div>
                  </div>
                </div>
              </button>
              <button
                onClick={() => setShowWatermarkEditorOverlay(true)}
                className="relative p-10 md:p-12 rounded-2xl border-2 border-gray-400 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 hover:border-photographer-accent dark:hover:border-photographer-accent transition-all duration-300 active:scale-[0.98]"
              >
                {!hasWatermark && (
                  <div className="absolute top-2 right-2">
                    <AlertTriangle size={20} className="text-orange-500 dark:text-orange-400" />
                  </div>
                )}
                <div className="flex flex-col items-center space-y-4">
                  <div className="w-20 h-20 rounded-full flex items-center justify-center bg-photographer-muted dark:bg-gray-700">
                    <svg
                      className="w-10 h-10 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                      />
                    </svg>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
                      Znak wodny
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {hasWatermark
                        ? "Zarządzaj znakiem wodnym na zdjęciach"
                        : "Dodaj znak wodny, aby zabezpieczyć zdjęcia przed nieautoryzowanym użyciem"}
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}

        {(effectiveTab === "general" || effectiveTab === "package") && (
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

      {/* Watermark Editor Overlay (gallery-specific) */}
      {gallery ? (
        <WatermarkEditorOverlay
          isOpen={showWatermarkEditorOverlay}
          onClose={() => setShowWatermarkEditorOverlay(false)}
          galleryId={galleryId}
          gallery={gallery}
        />
      ) : null}

      {/* Login Personalization Overlay - render when gallery exists so Szablon logowania works */}
      {gallery ? (
        <LoginPersonalizationOverlay
          isOpen={showLoginPersonalizationOverlay}
          onClose={() => setShowLoginPersonalizationOverlay(false)}
          galleryId={galleryId}
          coverPhotoUrl={
            gallery.coverPhotoUrl && typeof gallery.coverPhotoUrl === "string"
              ? gallery.coverPhotoUrl
              : ""
          }
        />
      ) : null}
    </div>
  );
}
