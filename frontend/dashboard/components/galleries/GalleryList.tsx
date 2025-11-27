import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

import { useToast } from "../../hooks/useToast";
import { apiFetch, formatApiError } from "../../lib/api";
import { initializeAuth, redirectToLandingSignIn } from "../../lib/auth-init";
import Badge from "../ui/badge/Badge";
import Button from "../ui/button/Button";
import { ConfirmDialog } from "../ui/confirm/ConfirmDialog";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../ui/table";

import PaymentConfirmationModal from "./PaymentConfirmationModal";

interface Gallery {
  galleryId: string;
  galleryName?: string;
  state?: string;
  isPaid?: boolean;
  paymentStatus?: string;
  plan?: string;
  priceCents?: number;
  orderCount?: number;
  createdAt?: string;
  originalsLimitBytes?: number;
  finalsLimitBytes?: number;
  originalsBytesUsed?: number;
  finalsBytesUsed?: number;
  [key: string]: unknown;
}

interface GalleryListProps {
  filter?:
    | "unpaid"
    | "wyslano"
    | "wybrano"
    | "prosba-o-zmiany"
    | "gotowe-do-wysylki"
    | "dostarczone";
  onLoadingChange?: (loading: boolean, initialLoad: boolean) => void;
}

const GalleryList: React.FC<GalleryListProps> = ({ filter = "unpaid", onLoadingChange }) => {
  const [apiUrl, setApiUrl] = useState("");
  const [idToken, setIdToken] = useState("");
  const [loading, setLoading] = useState(true); // Start with true to prevent flicker
  const [initialLoad, setInitialLoad] = useState(true); // Track if this is the initial load
  const [error, setError] = useState("");

  interface WalletBalanceResponse {
    balanceCents?: number;
    [key: string]: unknown;
  }

  interface GalleriesResponse {
    items?: Gallery[];
    [key: string]: unknown;
  }

  interface PaymentResponse {
    totalAmountCents?: number;
    walletAmountCents?: number;
    stripeAmountCents?: number;
    paymentMethod?: 'WALLET' | 'STRIPE' | 'MIXED';
    stripeFeeCents?: number;
    checkoutUrl?: string;
    paid?: boolean;
    dryRun?: boolean;
    [key: string]: unknown;
  }

  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedGalleryId, setSelectedGalleryId] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState({
    totalAmountCents: 0,
    walletAmountCents: 0,
    stripeAmountCents: 0,
    paymentMethod: 'STRIPE' as 'WALLET' | 'STRIPE' | 'MIXED',
    stripeFeeCents: 0,
    balanceAfterPayment: 0,
  });
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [galleryToDelete, setGalleryToDelete] = useState<Gallery | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { showToast } = useToast();

  const loadWalletBalance = useCallback(async () => {
    if (!apiUrl || !idToken) {
      return;
    }

    try {
      const { data } = await apiFetch<WalletBalanceResponse>(`${apiUrl}/wallet/balance`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      setWalletBalance(data.balanceCents ?? 0);
    } catch (_err) {
      // Ignore wallet errors, default to 0
      setWalletBalance(0);
    }
  }, [apiUrl, idToken]);

  const loadGalleries = useCallback(async () => {
    if (!apiUrl || !idToken) {
      if (onLoadingChange && initialLoad) {
        setInitialLoad(false);
        setLoading(false);
        onLoadingChange(false, false);
      }
      return;
    }

    setLoading(true);
    setError("");

    if (onLoadingChange && initialLoad) {
      onLoadingChange(true, true);
    }

    try {
      const url = filter ? `${apiUrl}/galleries?filter=${filter}` : `${apiUrl}/galleries`;
      const { data } = await apiFetch<GalleriesResponse>(url, {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      setGalleries(data.items ?? []);

      if (initialLoad) {
        setInitialLoad(false);
      }
    } catch (err) {
      setError(formatApiError(err));
      if (initialLoad) {
        setInitialLoad(false);
      }
    } finally {
      setLoading(false);
      if (onLoadingChange) {
        onLoadingChange(false, false);
      }
    }
  }, [apiUrl, idToken, filter, initialLoad, onLoadingChange]);

  useEffect(() => {
    setApiUrl(process.env.NEXT_PUBLIC_API_URL ?? "");
    initializeAuth(
      (token) => {
        setIdToken(token);
      },
      () => {
        redirectToLandingSignIn(
          typeof window !== "undefined" ? window.location.pathname : "/galleries"
        );
        if (onLoadingChange) {
          setInitialLoad(false);
          setLoading(false);
          onLoadingChange(false, false);
        }
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onLoadingChange is a prop callback that shouldn't change
  }, []);

  useEffect(() => {
    if (apiUrl && idToken) {
      void loadGalleries();
      void loadWalletBalance();
    }
  }, [apiUrl, idToken, filter, loadGalleries, loadWalletBalance]);

  // Notify parent of loading state changes
  useEffect(() => {
    if (onLoadingChange) {
      onLoadingChange(loading, initialLoad);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, initialLoad]);

  const handlePayClick = async (galleryId: string) => {
    if (!apiUrl || !idToken) {
      return;
    }

    setSelectedGalleryId(galleryId);
    setPaymentLoading(true);

    try {
      // First, get payment details using dry run
      const { data } = await apiFetch<PaymentResponse>(`${apiUrl}/galleries/${galleryId}/pay`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ dryRun: true }),
      });

      // Use paymentMethod from response, or calculate from amounts for backward compatibility
      const paymentMethod: 'WALLET' | 'STRIPE' | 'MIXED' = 
        data.paymentMethod ?? 
        (data.walletAmountCents === data.totalAmountCents ? 'WALLET' :
         data.stripeAmountCents === data.totalAmountCents ? 'STRIPE' :
         (data.walletAmountCents && data.walletAmountCents > 0 && data.stripeAmountCents && data.stripeAmountCents > 0) ? 'MIXED' : 'STRIPE');

      setPaymentDetails({
        totalAmountCents: data.totalAmountCents ?? 0,
        walletAmountCents: data.walletAmountCents ?? 0,
        stripeAmountCents: data.stripeAmountCents ?? 0,
        paymentMethod,
        stripeFeeCents: data.stripeFeeCents ?? 0,
        balanceAfterPayment: walletBalance - (data.walletAmountCents ?? 0),
      });
      setShowPaymentModal(true);
    } catch (err) {
      const errorMsg = formatApiError(err);
      showToast("error", "Błąd", errorMsg ?? "Nie udało się przygotować płatności");
    } finally {
      setPaymentLoading(false);
    }
  };

  const handlePaymentConfirm = async () => {
    if (!apiUrl || !idToken || !selectedGalleryId || !paymentDetails) {
      return;
    }

    setShowPaymentModal(false);
    setPaymentLoading(true);

    try {
      // If wallet balance is insufficient (split payment), force full Stripe payment
      const forceStripeOnly =
        paymentDetails.walletAmountCents > 0 && paymentDetails.stripeAmountCents > 0;

      // Call pay endpoint without dryRun to actually process payment
      const { data } = await apiFetch<PaymentResponse>(
        `${apiUrl}/galleries/${selectedGalleryId}/pay`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ forceStripeOnly }),
        }
      );

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else if (data.paid) {
        showToast("success", "Sukces", "Galeria została opłacona z portfela!");
        await loadGalleries();
        await loadWalletBalance();
      }
    } catch (err) {
      const errorMsg = formatApiError(err);
      showToast("error", "Błąd", errorMsg ?? "Nie udało się opłacić galerii");
    } finally {
      setPaymentLoading(false);
      setSelectedGalleryId(null);
    }
  };

  const handleDeleteClick = (gallery: Gallery) => {
    setGalleryToDelete(gallery);
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (!apiUrl || !idToken || !galleryToDelete) {
      return;
    }

    setDeleteLoading(true);

    try {
      await apiFetch(`${apiUrl}/galleries/${galleryToDelete.galleryId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${idToken}` },
      });

      showToast("success", "Sukces", "Galeria została usunięta");
      setShowDeleteDialog(false);
      setGalleryToDelete(null);

      // Reload galleries list
      await loadGalleries();
    } catch (err) {
      const errorMsg = formatApiError(err);
      showToast("error", "Błąd", errorMsg ?? "Nie udało się usunąć galerii");
    } finally {
      setDeleteLoading(false);
    }
  };

  const getStateBadge = (gallery: Gallery) => {
    if (gallery.isPaid === false) {
      return (
        <Badge color="error" variant="light">
          Nieopłacone
        </Badge>
      );
    }
    if (gallery.state === "PAID_ACTIVE") {
      return (
        <Badge color="success" variant="light">
          Aktywne
        </Badge>
      );
    }
    if (gallery.state === "EXPIRED") {
      return (
        <Badge color="error" variant="light">
          Wygasłe
        </Badge>
      );
    }
    return (
      <Badge color="light" variant="light">
        {gallery.state ?? ""}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-4 bg-error-50 border border-error-200 rounded-lg text-error-600 dark:bg-error-500/10 dark:border-error-500/20 dark:text-error-400">
          {error}
        </div>
      )}

      {galleries.length === 0 ? (
        <div className="pt-32 pb-8 text-center text-gray-500 dark:text-gray-400 text-xl">
          Brak galerii do wyświetlenia
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 dark:bg-gray-900">
                <TableCell
                  isHeader
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Nazwa galerii
                </TableCell>
                <TableCell
                  isHeader
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Plan
                </TableCell>
                <TableCell
                  isHeader
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Status
                </TableCell>
                <TableCell
                  isHeader
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Zlecenia
                </TableCell>
                <TableCell
                  isHeader
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Utworzono
                </TableCell>
                <TableCell
                  isHeader
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                >
                  Akcje
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {galleries.map((gallery) => (
                <TableRow
                  key={gallery.galleryId}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <TableCell className="px-4 py-3">
                    <Link
                      href={`/galleries/${gallery.galleryId}`}
                      className="font-medium text-brand-500 hover:text-brand-600"
                      onClick={() => {
                        // Store current page as referrer when navigating to gallery
                        if (typeof window !== "undefined") {
                          const referrerKey = `gallery_referrer_${gallery.galleryId}`;
                          sessionStorage.setItem(referrerKey, window.location.pathname);
                        }
                      }}
                    >
                      {gallery.galleryName ?? gallery.galleryId}
                    </Link>
                    {!gallery.galleryName && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {gallery.galleryId}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-white">

                    {(gallery.originalsLimitBytes ?? gallery.finalsLimitBytes) && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {gallery.originalsLimitBytes && (
                          <div>
                            Oryginały:{" "}
                            {((gallery.originalsBytesUsed ?? 0) / (1024 * 1024 * 1024)).toFixed(2)}{" "}
                            GB / {(gallery.originalsLimitBytes / (1024 * 1024 * 1024)).toFixed(2)}{" "}
                            GB
                          </div>
                        )}
                        {gallery.finalsLimitBytes && (
                          <div>
                            Finalne:{" "}
                            {((gallery.finalsBytesUsed ?? 0) / (1024 * 1024 * 1024)).toFixed(2)} GB
                            / {(gallery.finalsLimitBytes / (1024 * 1024 * 1024)).toFixed(2)} GB
                          </div>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3">{getStateBadge(gallery)}</TableCell>
                  <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                    {gallery.orderCount ?? 0}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {gallery.createdAt
                      ? new Date(gallery.createdAt).toLocaleDateString("pl-PL")
                      : "-"}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="flex gap-2">
                      {!gallery.isPaid && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handlePayClick(gallery.galleryId)}
                          disabled={paymentLoading}
                        >
                          {paymentLoading && selectedGalleryId === gallery.galleryId
                            ? "Przetwarzanie..."
                            : "Opłać galerię"}
                        </Button>
                      )}
                      <Link
                        href={`/galleries/${gallery.galleryId}`}
                        onClick={() => {
                          // Store current page as referrer when navigating to gallery
                          if (typeof window !== "undefined") {
                            const referrerKey = `gallery_referrer_${gallery.galleryId}`;
                            sessionStorage.setItem(referrerKey, window.location.pathname);
                          }
                        }}
                      >
                        <Button size="sm" variant="outline">
                          Szczegóły
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteClick(gallery)}
                        disabled={deleteLoading}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-500/10 border-red-300 dark:border-red-700"
                      >
                        Usuń
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Payment Confirmation Modal */}
      <PaymentConfirmationModal
        isOpen={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false);
          setPaymentLoading(false);
          setSelectedGalleryId(null);
        }}
        onConfirm={handlePaymentConfirm}
        totalAmountCents={paymentDetails.totalAmountCents}
        walletBalanceCents={walletBalance}
        walletAmountCents={paymentDetails.walletAmountCents}
        stripeAmountCents={paymentDetails.stripeAmountCents}
        paymentMethod={paymentDetails.paymentMethod}
        stripeFeeCents={paymentDetails.stripeFeeCents}
        loading={paymentLoading}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          if (!deleteLoading) {
            setShowDeleteDialog(false);
            setGalleryToDelete(null);
          }
        }}
        onConfirm={handleDeleteConfirm}
        title="Usuń galerię"
        message={`Czy na pewno chcesz usunąć galerię "${galleryToDelete?.galleryName ?? galleryToDelete?.galleryId}"?\n\nTa operacja jest nieodwracalna i usunie wszystkie zdjęcia, zlecenia i dane związane z tą galerią.`}
        confirmText="Usuń galerię"
        cancelText="Anuluj"
        variant="danger"
        loading={deleteLoading}
      />
    </div>
  );
};

export default GalleryList;
