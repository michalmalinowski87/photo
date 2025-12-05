import {
  Trash2,
  Image,
  Folder,
  Send,
  CheckCircle,
  Edit,
  Package,
  CheckCircle2,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState, useEffect, useCallback } from "react";

import { useToast } from "../../hooks/useToast";
import api, { formatApiError } from "../../lib/api-service";
import { initializeAuth, redirectToLandingSignIn } from "../../lib/auth-init";
import { useGalleryStore, useUserStore } from "../../store";
import Badge from "../ui/badge/Badge";
import Button from "../ui/button/Button";
import { ConfirmDialog } from "../ui/confirm/ConfirmDialog";
import { EmptyState } from "../ui/empty-state/EmptyState";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../ui/table";

import { PublishGalleryWizard } from "./PublishGalleryWizard";

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
  onWizardOpenChange?: (isOpen: boolean) => void;
}

const GalleryList: React.FC<GalleryListProps> = ({
  filter = "unpaid",
  onLoadingChange,
  onWizardOpenChange,
}) => {
  const router = useRouter();
  const publishWizardOpen = useGalleryStore((state) => state.publishWizardOpen);
  const publishWizardGalleryId = useGalleryStore((state) => state.publishWizardGalleryId);
  const publishWizardState = useGalleryStore((state) => state.publishWizardState);
  const setPublishWizardOpen = useGalleryStore((state) => state.setPublishWizardOpen);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState("");

  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [selectedGalleryIdForLoading, setSelectedGalleryIdForLoading] = useState<string | null>(
    null
  );
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [galleryToDelete, setGalleryToDelete] = useState<Gallery | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { showToast } = useToast();
  const { refreshWalletBalance } = useUserStore();

  const loadWalletBalance = useCallback(async () => {
    try {
      await refreshWalletBalance();
    } catch (_err) {
      // Ignore wallet errors, default to 0
    }
  }, [refreshWalletBalance]);

  const loadGalleries = useCallback(async () => {
    if (onLoadingChange && initialLoad) {
      setInitialLoad(false);
      setLoading(false);
      onLoadingChange(false, false);
    }

    setLoading(true);
    setError("");

    if (onLoadingChange && initialLoad) {
      onLoadingChange(true, true);
    }

    try {
      const response = await api.galleries.list();
      const galleriesList = Array.isArray(response) ? response : (response.items ?? []);

      // Apply filter client-side
      let filteredGalleries = galleriesList;
      if (filter) {
        filteredGalleries = galleriesList.filter((gallery: Gallery) => {
          if (filter === "unpaid") {
            return gallery.isPaid === false;
          }
          return true;
        });
      }

      setGalleries(filteredGalleries);

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
  }, [filter, initialLoad, onLoadingChange]);

  useEffect(() => {
    initializeAuth(
      () => {
        // Token is handled by api-service automatically
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
    void loadGalleries();
    void loadWalletBalance();
  }, [filter, loadGalleries, loadWalletBalance]);

  // Close wizard when navigating away
  useEffect(() => {
    if (!publishWizardOpen || !router.events) {
      return;
    }

    const handleRouteChange = () => {
      setPublishWizardOpen(false);
      onWizardOpenChange?.(false);
    };

    router.events.on("routeChangeStart", handleRouteChange);
    return () => {
      router.events.off("routeChangeStart", handleRouteChange);
    };
  }, [publishWizardOpen, router.events, setPublishWizardOpen, onWizardOpenChange]);

  // Notify parent of loading state changes
  useEffect(() => {
    if (onLoadingChange) {
      onLoadingChange(loading, initialLoad);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, initialLoad]);

  const handlePayClick = (galleryId: string) => {
    setSelectedGalleryIdForLoading(galleryId);
    setPublishWizardOpen(true, galleryId);
    onWizardOpenChange?.(true);
  };

  const handlePaymentComplete = async () => {
    // Reload galleries and wallet balance after payment
    await loadGalleries();
    await loadWalletBalance();
  };

  const handleDeleteClick = (gallery: Gallery) => {
    setGalleryToDelete(gallery);
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (!galleryToDelete) {
      return;
    }

    setDeleteLoading(true);

    try {
      await api.galleries.delete(galleryToDelete.galleryId);

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

  const getEmptyStateConfig = () => {
    const handleCreateGallery = () => {
      router.push("/galleries/robocze");
    };

    switch (filter) {
      case "unpaid":
        return {
          icon: <Folder size={64} />,
          title: "Brak wersji roboczych",
          description:
            "Wersje robocze to nieopłacone galerie. Utwórz nową galerię, prześlij zdjęcia i opłać ją, aby przesłać do klienta.",
          actionButton: {
            label: "Utwórz galerię",
            onClick: handleCreateGallery,
            icon: <Plus size={18} />,
          },
        };
      case "wyslano":
        return {
          icon: <Send size={64} />,
          title: "Brak galerii wysłanych do klienta",
          description:
            "Tutaj pojawią się galerie, które zostały wysłane do klientów. Po opłaceniu galerii i wysłaniu linku, galeria automatycznie pojawi się w tej sekcji.",
          processExplanation:
            "Proces: Utwórz galerię → Prześlij zdjęcia → Opłać galerię → Wyślij link do klienta",
        };
      case "wybrano":
        return {
          icon: <CheckCircle size={64} />,
          title: "Brak galerii z wybranymi zdjęciami",
          description:
            "Tutaj pojawią się galerie, w których klient wybrał zdjęcia. Po wyborze zdjęć przez klienta, galeria automatycznie pojawi się tutaj.",
          processExplanation:
            "Proces: Klient otrzymuje link → Przegląda zdjęcia → Wybiera zdjęcia → Galeria pojawia się tutaj",
        };
      case "prosba-o-zmiany":
        return {
          icon: <Edit size={64} />,
          title: "Brak próśb o zmiany",
          description:
            "Tutaj pojawią się galerie, w których klient złożył prośbę o zmiany. Po złożeniu prośby przez klienta, galeria automatycznie pojawi się w tej sekcji.",
          processExplanation:
            "Proces: Klient wybiera zdjęcia → Składa prośbę o zmiany → Galeria pojawia się tutaj",
        };
      case "gotowe-do-wysylki":
        return {
          icon: <Package size={64} />,
          title: "Brak galerii gotowych do wysyłki",
          description:
            "Tutaj pojawią się galerie, które są gotowe do wysłania klientowi. Po zatwierdzeniu zmian i przygotowaniu finalnych zdjęć, galeria automatycznie pojawi się tutaj.",
          processExplanation:
            "Proces: Zatwierdź zmiany → Przygotuj finalne zdjęcia → Galeria pojawia się tutaj",
        };
      case "dostarczone":
        return {
          icon: <CheckCircle2 size={64} />,
          title: "Brak dostarczonych galerii",
          description:
            "Tutaj pojawią się galerie, które zostały dostarczone klientowi. Po wysłaniu finalnych zdjęć klientowi, galeria automatycznie pojawi się w tej sekcji.",
          processExplanation:
            "Proces: Przygotuj finalne zdjęcia → Wyślij do klienta → Galeria pojawia się tutaj",
        };
      default:
        return {
          icon: <Image size={64} />,
          title: "Brak galerii do wyświetlenia",
          description: "Nie znaleziono galerii spełniających kryteria filtrowania.",
        };
    }
  };

  return (
    <>
      {publishWizardOpen && publishWizardGalleryId && (
        <PublishGalleryWizard
          key={publishWizardGalleryId}
          isOpen={publishWizardOpen}
          onClose={() => {
            setPublishWizardOpen(false);
            setPaymentLoading(false);
            onWizardOpenChange?.(false);
          }}
          galleryId={publishWizardGalleryId}
          onSuccess={handlePaymentComplete}
          renderAsModal={false}
          initialState={publishWizardState}
        />
      )}
      {!publishWizardOpen && (
        <div className="space-y-4">
          {error && <div>{error}</div>}

          {galleries.length === 0 ? (
            <EmptyState {...getEmptyStateConfig()} />
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
                                {((gallery.originalsBytesUsed ?? 0) / (1024 * 1024 * 1024)).toFixed(
                                  2
                                )}{" "}
                                GB /{" "}
                                {(gallery.originalsLimitBytes / (1024 * 1024 * 1024)).toFixed(2)} GB
                              </div>
                            )}
                            {gallery.finalsLimitBytes && (
                              <div>
                                Finalne:{" "}
                                {((gallery.finalsBytesUsed ?? 0) / (1024 * 1024 * 1024)).toFixed(2)}{" "}
                                GB / {(gallery.finalsLimitBytes / (1024 * 1024 * 1024)).toFixed(2)}{" "}
                                GB
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
                              {paymentLoading && selectedGalleryIdForLoading === gallery.galleryId
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
                            startIcon={<Trash2 size={16} />}
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
      )}

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
    </>
  );
};

export default GalleryList;
