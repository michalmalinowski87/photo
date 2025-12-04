import { AlertTriangle, Save } from "lucide-react";
import { useRouter } from "next/router";
import React, { useState, useEffect, useCallback } from "react";

import { useToast } from "../../hooks/useToast";
import api, { formatApiError } from "../../lib/api-service";
import { formatCurrencyInput, plnToCents, centsToPlnString } from "../../lib/currency";
import { generatePassword } from "../../lib/password";
import { useGalleryStore } from "../../store";
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

  // Get gallery from store using selector with cache fallback (same pattern as GalleryLayoutWrapper)
  // This ensures gallery is always available if cached, even during navigation
  const currentGalleryId = useGalleryStore((state) => state.currentGalleryId);
  const isLoading = useGalleryStore((state) => state.isLoading);
  const fetchGallery = useGalleryStore((state) => state.fetchGallery);
  const setCurrentGalleryId = useGalleryStore((state) => state.setCurrentGalleryId);

  // Use selector that includes cache as fallback - same pattern as GalleryLayoutWrapper
  const gallery = useGalleryStore((state) => {
    const storeGallery = state.currentGallery;
    const storeGalleryId = state.currentGalleryId;

    // Determine which galleryId to use - prefer URL, fallback to store
    const targetGalleryId = galleryId ?? storeGalleryId;

    if (targetGalleryId) {
      // If store has gallery and it matches target, use it
      if (storeGallery?.galleryId === targetGalleryId) {
        return storeGallery;
      }

      // Otherwise check cache - subscribe to cache entry to make it reactive
      const cacheEntry = state.galleryCache[targetGalleryId];
      if (cacheEntry) {
        const age = Date.now() - cacheEntry.timestamp;
        if (age < 60000) {
          // Cache TTL: 60 seconds
          const cached = cacheEntry.gallery;
          if (cached?.galleryId === targetGalleryId) {
            return cached;
          }
        }
      }
    }

    // Fallback to store gallery (might be from previous route during navigation)
    return storeGallery;
  });

  // Only show loading if store is actively loading AND we don't have gallery (including cached)
  const galleryLoading = isLoading && !gallery;

  // Only log when state actually changes to reduce spam
  const prevStateRef = React.useRef({
    galleryId,
    currentGalleryId,
    hasGallery: !!gallery,
    isLoading,
  });

  if (
    prevStateRef.current.galleryId !== galleryId ||
    prevStateRef.current.currentGalleryId !== currentGalleryId ||
    prevStateRef.current.hasGallery !== !!gallery ||
    prevStateRef.current.isLoading !== isLoading
  ) {
    prevStateRef.current = {
      galleryId,
      currentGalleryId,
      hasGallery: !!gallery,
      isLoading,
    };
  }

  // Reload gallery function
  const reloadGallery = useCallback(async () => {
    if (galleryId) {
      await fetchGallery(galleryId, true); // Force refresh
    }
  }, [galleryId, fetchGallery]);

  // Only fetch if we truly don't have the gallery and we're not loading
  // This is a last resort - GalleryLayoutWrapper should handle loading
  useEffect(() => {
    if (router.isReady && galleryId && !gallery && !isLoading) {
      // Set currentGalleryId first so fetchGallery will update currentGallery
      setCurrentGalleryId(galleryId);
      void fetchGallery(galleryId, false);
    }
  }, [galleryId, gallery, isLoading, fetchGallery, router.isReady, setCurrentGalleryId]);
  const [saving, setSaving] = useState<boolean>(false);
  const [hasDeliveredOrders, setHasDeliveredOrders] = useState<boolean>(false);
  const [checkingDelivered, setCheckingDelivered] = useState<boolean>(true);
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

  const checkDeliveredOrders = useCallback(async (): Promise<void> => {
    if (!galleryId) {
      return;
    }
    setCheckingDelivered(true);
    try {
      const data = await api.galleries.checkDeliveredOrders(galleryId);
      const items = Array.isArray(data) ? data : (data?.items ?? []);
      const hasDelivered = Array.isArray(items) && items.length > 0;
      setHasDeliveredOrders(hasDelivered);
    } catch (_err) {
      setHasDeliveredOrders(false);
    } finally {
      setCheckingDelivered(false);
    }
  }, [galleryId]);

  useEffect(() => {
    if (galleryId) {
      void checkDeliveredOrders();
    }
  }, [galleryId, checkDeliveredOrders]);

  // Gallery data comes from GalleryContext - initialize form when gallery loads
  useEffect(() => {
    if (gallery) {
      setSettingsForm({
        galleryName: gallery.galleryName ?? "",
        clientEmail: gallery.clientEmail ?? "",
        clientPassword: "",
        packageName: gallery.pricingPackage?.packageName ?? "",
        includedCount: gallery.pricingPackage?.includedCount ?? 0,
        extraPriceCents: gallery.pricingPackage?.extraPriceCents ?? 0,
        packagePriceCents: gallery.pricingPackage?.packagePriceCents ?? 0,
      });
      setExtraPriceInput(null);
      setPackagePriceInput(null);
    }
  }, [gallery]);

  const handleUpdateSettings = async (): Promise<void> => {
    if (!galleryId) {
      return;
    }

    setSaving(true);

    try {
      // Update client password if provided (requires clientEmail)
      if (settingsForm.clientPassword && settingsForm.clientEmail) {
        await api.galleries.updateClientPassword(
          galleryId,
          settingsForm.clientPassword,
          settingsForm.clientEmail
        );

        // Invalidate all caches to ensure fresh data on next fetch
        const { invalidateAllGalleryCaches } = useGalleryStore.getState();
        invalidateAllGalleryCaches(galleryId);
      }

      // Update pricing package if changed
      const pkgChanged =
        settingsForm.packageName !== gallery?.pricingPackage?.packageName ||
        settingsForm.includedCount !== gallery?.pricingPackage?.includedCount ||
        settingsForm.extraPriceCents !== gallery?.pricingPackage?.extraPriceCents ||
        settingsForm.packagePriceCents !== gallery?.pricingPackage?.packagePriceCents;

      if (pkgChanged) {
        // Ensure all required fields are present and valid
        const packageName = settingsForm.packageName?.trim() || undefined;
        const includedCount = Number(settingsForm.includedCount) || 0;
        const extraPriceCents = Number(settingsForm.extraPriceCents) || 0;
        const packagePriceCents = Number(settingsForm.packagePriceCents) || 0;

        await api.galleries.updatePricingPackage(galleryId, {
          packageName,
          includedCount,
          extraPriceCents,
          packagePriceCents,
        });

        // Invalidate all caches to ensure fresh data on next fetch
        const { invalidateAllGalleryCaches } = useGalleryStore.getState();
        invalidateAllGalleryCaches(galleryId);
      }

      showToast("success", "Sukces", "Ustawienia zostały zaktualizowane");
      await reloadGallery();
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else if (cancelHref) {
      void router.push(cancelHref);
    }
  };

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

  // Show locked form if gallery is delivered - show form but disabled
  if (hasDeliveredOrders) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Ustawienia galerii</h1>

        <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
          <div className="p-4 bg-error-50 border border-error-200 rounded-lg dark:bg-error-500/10 dark:border-error-500/20 mb-6">
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle
                size={24}
                className="text-error-600 dark:text-error-400"
                strokeWidth={2}
              />
              <h2 className="text-lg font-semibold text-error-800 dark:text-error-200">
                Ustawienia galerii są zablokowane
              </h2>
            </div>
            <p className="text-sm text-error-700 dark:text-error-300">
              Nie możesz edytować ustawień galerii, która ma dostarczone zlecenia. Ustawienia są
              zablokowane po dostarczeniu zdjęć do klienta.
            </p>
          </div>

          <div className="space-y-4 opacity-60">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Nazwa galerii
              </label>
              <Input
                type="text"
                placeholder="Nazwa galerii"
                value={settingsForm.galleryName}
                disabled={true}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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

            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                Pakiet cenowy
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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

          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={handleCancel}>
              {cancelLabel}
            </Button>
            <Button variant="primary" disabled={true} className="opacity-50 cursor-not-allowed">
              Zapisz
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Ustawienia galerii</h1>

      <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Nazwa galerii
            </label>
            <Input
              type="text"
              placeholder="Nazwa galerii"
              value={settingsForm.galleryName}
              onChange={(e) => setSettingsForm({ ...settingsForm, galleryName: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
              Pakiet cenowy
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={handleCancel} disabled={saving}>
            {cancelLabel}
          </Button>
          <Button
            variant="primary"
            onClick={handleUpdateSettings}
            disabled={saving}
            startIcon={<Save size={16} />}
          >
            {saving ? "Zapisywanie..." : "Zapisz"}
          </Button>
        </div>
      </div>
    </div>
  );
}
