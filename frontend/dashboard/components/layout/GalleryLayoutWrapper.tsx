import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { apiFetch, formatApiError } from "../../lib/api";
import { getIdToken } from "../../lib/auth";
import { initializeAuth, redirectToLandingSignIn } from "../../lib/auth-init";
import { useToast } from "../../hooks/useToast";
import { GalleryProvider } from "../../context/GalleryContext";
import GalleryLayout from "./GalleryLayout";
import PaymentConfirmationModal from "../galleries/PaymentConfirmationModal";
import { FullPageLoading } from "../ui/loading/Loading";

interface GalleryLayoutWrapperProps {
  children: React.ReactNode;
}

export default function GalleryLayoutWrapper({ children }: GalleryLayoutWrapperProps) {
  const router = useRouter();
  const { id: galleryId } = router.query;
  const { showToast } = useToast();
  const [apiUrl, setApiUrl] = useState("");
  const [idToken, setIdToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [gallery, setGallery] = useState(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [galleryUrl, setGalleryUrl] = useState("");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState({
    totalAmountCents: 0,
    walletAmountCents: 0,
    stripeAmountCents: 0,
    balanceAfterPayment: 0,
  });

  useEffect(() => {
    setApiUrl(process.env.NEXT_PUBLIC_API_URL || "");
    if (router.isReady && galleryId) {
      initializeAuth(
        (token) => {
          setIdToken(token);
        },
        () => {
          redirectToLandingSignIn(router.asPath);
        }
      );
    }
  }, [router.isReady, galleryId, router.asPath]);

  useEffect(() => {
    if (router.isReady && apiUrl && idToken && galleryId) {
      // Only reload if galleryId changed or we don't have gallery data yet
      if (!gallery || gallery.galleryId !== galleryId) {
        loadGalleryData();
      }
      loadWalletBalance();
    }
  }, [router.isReady, apiUrl, idToken, galleryId]);

  const loadGalleryData = async () => {
    if (!apiUrl || !idToken || !galleryId) return;
    
    setLoading(true);
    setLoadError(null);
    
    try {
      const galleryResponse = await apiFetch(`${apiUrl}/galleries/${galleryId}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      
      setGallery(galleryResponse.data);
      setGalleryUrl(
        typeof window !== "undefined"
          ? `${window.location.origin}/gallery/${galleryId}`
          : ""
      );
    } catch (err) {
      const errorMsg = formatApiError(err);
      setLoadError(errorMsg || "Nie udało się załadować danych galerii");
      showToast("error", "Błąd", errorMsg || "Nie udało się załadować danych galerii");
    } finally {
      setLoading(false);
    }
  };

  const loadWalletBalance = async () => {
    if (!apiUrl || !idToken) return;
    try {
      const { data } = await apiFetch(`${apiUrl}/wallet/balance`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      setWalletBalance(data.balanceCents || 0);
    } catch (err) {
      console.error("Failed to load wallet balance:", err);
    }
  };

  const handlePayClick = async () => {
    if (!apiUrl || !idToken || !galleryId) return;
    
    setPaymentLoading(true);

    try {
      const { data } = await apiFetch(`${apiUrl}/galleries/${galleryId}/pay`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ dryRun: true }),
      });

      setPaymentDetails({
        totalAmountCents: data.totalAmountCents,
        walletAmountCents: data.walletAmountCents,
        stripeAmountCents: data.stripeAmountCents,
        balanceAfterPayment: walletBalance - data.walletAmountCents,
      });
      setShowPaymentModal(true);
    } catch (err) {
      const errorMsg = formatApiError(err);
      showToast("error", "Błąd", errorMsg || "Nie udało się przygotować płatności");
    } finally {
      setPaymentLoading(false);
    }
  };

  const confirmPayment = async () => {
    if (!apiUrl || !idToken || !galleryId) return;

    setShowPaymentModal(false);
    setPaymentLoading(true);

    try {
      const { data } = await apiFetch(`${apiUrl}/galleries/${galleryId}/pay`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else if (data.paid) {
        showToast("success", "Sukces", "Galeria została opłacona z portfela!");
        await loadGalleryData();
        await loadWalletBalance();
      }
    } catch (err) {
      const errorMsg = formatApiError(err);
      showToast("error", "Błąd", errorMsg || "Nie udało się opłacić galerii");
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleCopyUrl = () => {
    if (typeof window !== "undefined" && galleryUrl) {
      navigator.clipboard.writeText(galleryUrl);
      showToast("success", "Sukces", "URL skopiowany do schowka");
    }
  };

  const handleSendLink = async () => {
    if (!apiUrl || !idToken || !galleryId) return;
    
    try {
      await apiFetch(`${apiUrl}/galleries/${galleryId}/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      
      showToast("success", "Sukces", "Link do galerii został wysłany do klienta");
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    }
  };

  const handleSettings = () => {
    router.push(`/galleries/${galleryId}/settings`);
  };

  // Show loading only if we don't have gallery data yet
  if (loading && !gallery) {
    return (
      <GalleryLayout
        gallery={null}
        isPaid={false}
        galleryUrl=""
        onPay={() => {}}
        onCopyUrl={() => {}}
        onSendLink={() => {}}
        onSettings={() => {}}
      >
        <FullPageLoading text="Ładowanie galerii..." />
      </GalleryLayout>
    );
  }

  // Only show error if we've tried to load and failed (not during initial load)
  if (!gallery && loadError && !loading) {
    return (
      <GalleryLayout
        gallery={null}
        isPaid={false}
        galleryUrl=""
        onPay={() => {}}
        onCopyUrl={() => {}}
        onSendLink={() => {}}
        onSettings={() => {}}
      >
        <div className="p-6">
          <div className="p-4 bg-error-50 border border-error-200 rounded-lg text-error-600">
            {loadError}
          </div>
        </div>
      </GalleryLayout>
    );
  }

  const isPaid = gallery ? (gallery.isPaid !== false && (gallery.paymentStatus === "PAID" || gallery.state === "PAID_ACTIVE")) : false;

  return (
    <GalleryProvider
      gallery={gallery}
      loading={loading}
      error={loadError}
      galleryId={galleryId as string}
      reloadGallery={loadGalleryData}
    >
      <GalleryLayout
        gallery={gallery}
        isPaid={isPaid}
        galleryUrl={galleryUrl}
        onPay={handlePayClick}
        onCopyUrl={handleCopyUrl}
        onSendLink={handleSendLink}
        onSettings={handleSettings}
      >
        {children}
      </GalleryLayout>

      {showPaymentModal && (
        <PaymentConfirmationModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          onConfirm={confirmPayment}
          totalAmountCents={paymentDetails.totalAmountCents}
          walletBalanceCents={walletBalance}
          walletAmountCents={paymentDetails.walletAmountCents}
          stripeAmountCents={paymentDetails.stripeAmountCents}
          loading={paymentLoading}
        />
      )}
    </GalleryProvider>
  );
}

