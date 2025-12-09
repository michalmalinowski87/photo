import { Info, Save } from "lucide-react";
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

  const handleUpdateSettings = async (): Promise<void> => {
    if (!galleryId) {
      return;
    }

    try {
      // Check what needs to be updated
      const currentGalleryName =
        typeof gallery?.galleryName === "string" ? gallery.galleryName : "";
      const galleryNameChanged = settingsForm.galleryName.trim() !== currentGalleryName.trim();

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
      const onlyNameChanged = galleryNameChanged && !passwordChanged && !pkgChanged;

      // Update gallery name if changed
      if (galleryNameChanged) {
        const trimmedName = settingsForm.galleryName.trim();
        if (trimmedName.length > 100) {
          showToast("error", "Błąd", "Nazwa galerii nie może przekraczać 100 znaków");
          return;
        }

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
      if (galleryNameChanged || passwordChanged || pkgChanged) {
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
        <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
          <div className="text-center py-8">
            <div className="text-gray-500 dark:text-gray-400">
              {galleryLoading ? "Ładowanie danych galerii..." : "Sprawdzanie statusu galerii..."}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show locked form if gallery is delivered - but allow gallery name editing
  if (hasDeliveredOrders) {
    const handleUpdateGalleryNameOnly = async (): Promise<void> => {
      if (!galleryId) {
        return;
      }

      try {
        const currentGalleryName =
          typeof gallery?.galleryName === "string" ? gallery.galleryName : "";
        const galleryNameChanged = settingsForm.galleryName.trim() !== currentGalleryName.trim();
        if (galleryNameChanged) {
          const trimmedName = settingsForm.galleryName.trim();
          if (trimmedName.length > 100) {
            showToast("error", "Błąd", "Nazwa galerii nie może przekraczać 100 znaków");
            return;
          }
          await updateGalleryNameMutation.mutateAsync({
            galleryId,
            galleryName: trimmedName,
          });
          showToast("success", "Sukces", "Nazwa galerii została zaktualizowana");
        }
      } catch (err) {
        showToast("error", "Błąd", formatApiError(err));
      }
    };

    const canSaveGalleryName = (() => {
      const isValid =
        settingsForm.galleryName.trim().length > 0 && settingsForm.galleryName.trim().length <= 100;
      return isValid;
    })();

    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">Ustawienia galerii</h1>

        <div className="p-8 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
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

          <div className="space-y-3">
            <div>
              <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Nazwa galerii
              </label>
              <Input
                type="text"
                placeholder="Nazwa galerii"
                value={settingsForm.galleryName}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.length <= 100) {
                    setSettingsForm({ ...settingsForm, galleryName: value });
                  }
                }}
                maxLength={100}
              />
            </div>

            <div className="space-y-3 opacity-60">
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

              <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                <h3 className="text-base font-medium text-gray-900 dark:text-white mb-2.5">
                  Pakiet cenowy
                </h3>

                <div className="space-y-2.5">
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
                      Cena za dodatkowe zdjęcie (PLN)
                    </label>
                    <Input
                      type="text"
                      placeholder="0.00"
                      value={centsToPlnString(settingsForm.extraPriceCents)}
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
          </div>

          <div className="flex justify-end gap-3 mt-4">
            {showCancelButton && (
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={updateGalleryNameMutation.isPending}
              >
                {cancelLabel}
              </Button>
            )}
            <Button
              variant="primary"
              onClick={handleUpdateGalleryNameOnly}
              disabled={!canSaveGalleryName || updateGalleryNameMutation.isPending}
              startIcon={<Save size={20} />}
            >
              {updateGalleryNameMutation.isPending ? "Zapisywanie..." : "Zapisz nazwę"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">Ustawienia galerii</h1>

      <div className="p-8 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <div className="space-y-3">
          <div>
            <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Nazwa galerii
            </label>
            <Input
              type="text"
              placeholder="Nazwa galerii"
              value={settingsForm.galleryName}
              onChange={(e) => {
                const value = e.target.value;
                if (value.length <= 100) {
                  setSettingsForm({ ...settingsForm, galleryName: value });
                }
              }}
              maxLength={100}
            />
          </div>

          <div>
            <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Email logowania
            </label>
            <Input
              type="email"
              placeholder={galleryLoading ? "Ładowanie danych..." : "Email klienta"}
              value={galleryLoading ? "" : (settingsForm.clientEmail ?? "")}
              onChange={(e) => setSettingsForm({ ...settingsForm, clientEmail: e.target.value })}
              disabled={galleryLoading}
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

          <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
            <h3 className="text-base font-medium text-gray-900 dark:text-white mb-2.5">
              Pakiet cenowy
            </h3>

            <div className="space-y-2.5">
              <div>
                <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Nazwa pakietu
                </label>
                <Input
                  type="text"
                  placeholder="Nazwa pakietu"
                  value={settingsForm.packageName}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, packageName: e.target.value })
                  }
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
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      includedCount: Number.parseInt(e.target.value, 10) || 0,
                    })
                  }
                  min="0"
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
                    setSettingsForm({
                      ...settingsForm,
                      extraPriceCents: plnToCents(formatted),
                    });
                  }}
                  onBlur={() => {
                    // Clear input state on blur if empty, let it use cents value
                    if (!extraPriceInput || extraPriceInput === "") {
                      setExtraPriceInput(null);
                    }
                  }}
                />
              </div>

              <div>
                <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Cena pakietu (PLN)
                </label>
                <Input
                  type="text"
                  placeholder="0.00"
                  value={packagePriceInput ?? centsToPlnString(settingsForm.packagePriceCents)}
                  onChange={(e) => {
                    const formatted = formatCurrencyInput(e.target.value);
                    setPackagePriceInput(formatted);
                    setSettingsForm({
                      ...settingsForm,
                      packagePriceCents: plnToCents(formatted),
                    });
                  }}
                  onBlur={() => {
                    // Clear input state on blur if empty, let it use cents value
                    if (!packagePriceInput || packagePriceInput === "") {
                      setPackagePriceInput(null);
                    }
                  }}
                />
              </div>
            </div>
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
            onClick={handleUpdateSettings}
            disabled={saving}
            startIcon={<Save size={20} />}
          >
            {saving ? "Zapisywanie..." : "Zapisz"}
          </Button>
        </div>
      </div>
    </div>
  );
}
