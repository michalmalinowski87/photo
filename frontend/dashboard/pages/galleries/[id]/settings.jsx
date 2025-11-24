import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { apiFetch, formatApiError } from "../../../lib/api";
import { initializeAuth, redirectToLandingSignIn } from "../../../lib/auth-init";
import { useGallery } from "../../../context/GalleryContext";
import Button from "../../../components/ui/button/Button";
import Input from "../../../components/ui/input/InputField";
import { FullPageLoading } from "../../../components/ui/loading/Loading";
import { useToast } from "../../../hooks/useToast";

export default function GallerySettings() {
  const router = useRouter();
  const { id: galleryId } = router.query;
  const { showToast } = useToast();
  const { gallery, loading: galleryLoading, reloadGallery } = useGallery();
  const [apiUrl, setApiUrl] = useState("");
  const [idToken, setIdToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    galleryName: "",
    clientEmail: "",
    clientPassword: "",
    packageName: "",
    includedCount: 0,
    extraPriceCents: 0,
    packagePriceCents: 0,
  });
  const [galleryUrl, setGalleryUrl] = useState("");

  useEffect(() => {
    setApiUrl(process.env.NEXT_PUBLIC_API_URL || "");
    initializeAuth(
      (token) => {
        setIdToken(token);
      },
      () => {
        redirectToLandingSignIn(`/galleries/${galleryId}/settings`);
      }
    );
  }, [galleryId]);

  // Gallery data comes from GalleryContext - initialize form when gallery loads
  useEffect(() => {
    if (gallery) {
      setSettingsForm({
        galleryName: gallery.galleryName || "",
        clientEmail: gallery.clientEmail || "",
        clientPassword: "",
        packageName: gallery.pricingPackage?.packageName || "",
        includedCount: gallery.pricingPackage?.includedCount || 0,
        extraPriceCents: gallery.pricingPackage?.extraPriceCents || 0,
        packagePriceCents: gallery.pricingPackage?.packagePriceCents || 0,
      });
      setGalleryUrl(
        typeof window !== "undefined"
          ? `${window.location.origin}/gallery/${galleryId}`
          : ""
      );
    }
  }, [gallery, galleryId]);

  const handleUpdateSettings = async () => {
    if (!apiUrl || !idToken || !galleryId) return;
    
    setSaving(true);
    
    try {
      // Update client password if provided (requires clientEmail)
      if (settingsForm.clientPassword && settingsForm.clientEmail) {
        await apiFetch(`${apiUrl}/galleries/${galleryId}/client-password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            password: settingsForm.clientPassword,
            clientEmail: settingsForm.clientEmail,
          }),
        });
      }
      
      // Update pricing package if changed
      const pkgChanged =
        settingsForm.packageName !== gallery?.pricingPackage?.packageName ||
        settingsForm.includedCount !== gallery?.pricingPackage?.includedCount ||
        settingsForm.extraPriceCents !== gallery?.pricingPackage?.extraPriceCents ||
        settingsForm.packagePriceCents !== gallery?.pricingPackage?.packagePriceCents;
      
      if (pkgChanged) {
        await apiFetch(`${apiUrl}/galleries/${galleryId}/pricing-package`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            pricingPackage: {
              packageName: settingsForm.packageName,
              includedCount: settingsForm.includedCount,
              extraPriceCents: settingsForm.extraPriceCents,
              packagePriceCents: settingsForm.packagePriceCents,
            },
          }),
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

  const handlePay = async () => {
    if (!apiUrl || !idToken || !galleryId) return;
    
    try {
      const { data } = await apiFetch(`${apiUrl}/galleries/${galleryId}/pay`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        showToast("success", "Sukces", "Płatność zrealizowana z portfela");
        await reloadGallery();
      }
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    }
  };

  const handleCopyUrl = () => {
    if (typeof window !== "undefined" && galleryUrl) {
      navigator.clipboard.writeText(galleryUrl);
      showToast("success", "Sukces", "URL skopiowany do schowka");
    }
  };

  // Gallery data comes from GalleryContext (provided by GalleryLayoutWrapper)
  if (!gallery && !galleryLoading) {
    return null; // Error is handled by GalleryLayoutWrapper
  }

  const isPaid = gallery ? (gallery.isPaid !== false && (gallery.paymentStatus === "PAID" || gallery.state === "PAID_ACTIVE")) : false;

  return (
    <>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          Ustawienia galerii
        </h1>
        
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
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, galleryName: e.target.value })
                }
              />
            </div>
            
            <div style={{ minHeight: '88px' }}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email logowania
              </label>
              <Input
                type="email"
                placeholder={galleryLoading ? "Ładowanie danych..." : "Email klienta"}
                value={galleryLoading ? "" : (settingsForm.clientEmail || "")}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, clientEmail: e.target.value })
                }
                disabled={galleryLoading || !isPaid}
                hint={
                  galleryLoading 
                    ? "Ładowanie danych..." 
                    : !isPaid 
                    ? "Opłać galerię aby edytować email klienta" 
                    : ""
                }
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Hasło klienta (opcjonalne)
              </label>
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
                        includedCount: parseInt(e.target.value) || 0,
                      })
                    }
                    min="0"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Cena za dodatkowe zdjęcie (grosze)
                  </label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={settingsForm.extraPriceCents}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        extraPriceCents: parseInt(e.target.value) || 0,
                      })
                    }
                    min="0"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Cena pakietu (grosze)
                  </label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={settingsForm.packagePriceCents}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        packagePriceCents: parseInt(e.target.value) || 0,
                      })
                    }
                    min="0"
                  />
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end gap-3 mt-6">
            <Button 
              variant="outline" 
              onClick={() => router.push(`/galleries/${galleryId}`)}
              disabled={saving}
            >
              Anuluj
            </Button>
            <Button 
              variant="primary" 
              onClick={handleUpdateSettings}
              disabled={saving}
            >
              {saving ? "Zapisywanie..." : "Zapisz"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

