import { useRouter } from "next/router";
import { useState, useEffect, useCallback } from "react";

import Button from "../../../components/ui/button/Button";
import Input from "../../../components/ui/input/InputField";
import { useGallery } from "../../../context/GalleryContext";
import { useToast } from "../../../hooks/useToast";
import api, { formatApiError } from "../../../lib/api-service";
import { initializeAuth, redirectToLandingSignIn } from "../../../lib/auth-init";
import { formatCurrencyInput, plnToCents, centsToPlnString } from "../../../lib/currency";
import { generatePassword } from "../../../lib/password";

interface SettingsForm {
  galleryName: string;
  clientEmail: string;
  clientPassword: string;
  packageName: string;
  includedCount: number;
  extraPriceCents: number;
  packagePriceCents: number;
}

interface Gallery {
  galleryName?: string;
  clientEmail?: string;
  pricingPackage?: {
    packageName?: string;
    includedCount?: number;
    extraPriceCents?: number;
    packagePriceCents?: number;
  };
  [key: string]: unknown;
}

export default function GallerySettings() {
  const router = useRouter();
  const { id: galleryId } = router.query;
  const { showToast } = useToast();
  const galleryContext = useGallery();
  const gallery = galleryContext.gallery as Gallery | null;
  const galleryLoading = galleryContext.loading;
  const reloadGallery = galleryContext.reloadGallery;
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
      const data = await api.galleries.checkDeliveredOrders(galleryId as string);
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
    initializeAuth(
      () => {
        if (galleryId) {
          void checkDeliveredOrders();
        }
      },
      () => {
        const galleryIdStr = Array.isArray(galleryId) ? (galleryId[0] ?? "") : (galleryId ?? "");
        redirectToLandingSignIn(`/galleries/${galleryIdStr}/settings`);
      }
    );
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
  }, [gallery, galleryId]);

  const handleUpdateSettings = async (): Promise<void> => {
    if (!galleryId) {
      return;
    }

    setSaving(true);

    try {
      // Update client password if provided (requires clientEmail)
      if (settingsForm.clientPassword && settingsForm.clientEmail) {
        await api.galleries.updateClientPassword(
          galleryId as string,
          settingsForm.clientPassword,
          settingsForm.clientEmail
        );
      }

      // Update pricing package if changed
      const pkgChanged =
        settingsForm.packageName !== gallery?.pricingPackage?.packageName ||
        settingsForm.includedCount !== gallery?.pricingPackage?.includedCount ||
        settingsForm.extraPriceCents !== gallery?.pricingPackage?.extraPriceCents ||
        settingsForm.packagePriceCents !== gallery?.pricingPackage?.packagePriceCents;

      if (pkgChanged) {
        await api.galleries.updatePricingPackage(galleryId as string, {
          packageName: settingsForm.packageName,
          includedCount: settingsForm.includedCount,
          extraPriceCents: settingsForm.extraPriceCents,
          packagePriceCents: settingsForm.packagePriceCents,
        });
      }

      showToast("success", "Sukces", "Ustawienia zostały zaktualizowane");
      await reloadGallery();
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    } finally {
      setSaving(false);
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
              <svg
                className="w-6 h-6 text-error-600 dark:text-error-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
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
                    value={settingsForm.packageName}
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
            <Button
              variant="outline"
              onClick={() => {
                const galleryIdStr = Array.isArray(galleryId)
                  ? (galleryId[0] ?? "")
                  : (galleryId ?? "");
                void router.push(`/galleries/${String(galleryIdStr)}`);
              }}
            >
              Powrót do galerii
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
    <>
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
            <Button
              variant="outline"
              onClick={() => {
                const galleryIdStr = Array.isArray(galleryId)
                  ? (galleryId[0] ?? "")
                  : (galleryId ?? "");
                void router.push(`/galleries/${String(galleryIdStr)}`);
              }}
              disabled={saving}
            >
              Anuluj
            </Button>
            <Button variant="primary" onClick={handleUpdateSettings} disabled={saving}>
              {saving ? "Zapisywanie..." : "Zapisz"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
