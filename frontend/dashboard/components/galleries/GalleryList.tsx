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
import { useState, useEffect, useRef } from "react";

import { useDeleteGallery } from "../../hooks/mutations/useGalleryMutations";
import { useGalleries } from "../../hooks/queries/useGalleries";
import { usePageLogger } from "../../hooks/usePageLogger";
import { usePrefetchGallery } from "../../hooks/usePrefetch";
import { usePublishFlow } from "../../hooks/usePublishFlow";
import { useToast } from "../../hooks/useToast";
import { formatApiError } from "../../lib/api-service";
import type { Gallery } from "../../types";
import Badge from "../ui/badge/Badge";
import Button from "../ui/button/Button";
import { ConfirmDialog } from "../ui/confirm/ConfirmDialog";
import { EmptyState } from "../ui/empty-state/EmptyState";
import { InlineLoading } from "../ui/loading/Loading";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../ui/table";


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
  const { logDataLoad, logDataLoaded, logDataError } = usePageLogger({
    pageName: `GalleryList-${filter}`,
    logMount: false,
    logUnmount: false,
  });
  const initialLoadRef = useRef(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [galleryToDelete, setGalleryToDelete] = useState<Gallery | null>(null);
  const { showToast } = useToast();

  const prefetchGallery = usePrefetchGallery();

  const {
    data: galleries = [],
    isLoading: loading,
    error: queryError,
    refetch,
  } = useGalleries(filter);

  const initialLoad = loading && initialLoadRef.current;

  useEffect(() => {
    if (loading) {
      logDataLoad("galleries", { filter });
    }
  }, [loading, filter, logDataLoad]);

  useEffect(() => {
    if (!loading && galleries.length > 0) {
      logDataLoaded("galleries", galleries, {
        count: galleries.length,
        filter,
      });
      if (initialLoadRef.current) {
        initialLoadRef.current = false;
      }
    }
  }, [loading, galleries, filter, logDataLoaded]);

  useEffect(() => {
    if (queryError) {
      logDataError("galleries", queryError);
    }
  }, [queryError, logDataError]);

  useEffect(() => {
    if (onLoadingChange) {
      onLoadingChange(loading, initialLoad);
    }
  }, [loading, initialLoad, onLoadingChange]);

  const deleteGalleryMutation = useDeleteGallery();

  const { startPublishFlow } = usePublishFlow();

  const handlePayClick = (galleryId: string) => {
    // Use centralized publish flow action
    startPublishFlow(galleryId);
    onWizardOpenChange?.(true);
  };

  const handlePaymentComplete = async () => {
    // Reload galleries after payment
    // Wallet balance is refreshed by PublishGalleryWizard (on gallery detail page)
    await refetch();
  };

  const handleDeleteClick = (gallery: Gallery) => {
    setGalleryToDelete(gallery);
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (!galleryToDelete) {
      return;
    }

    try {
      await deleteGalleryMutation.mutateAsync(galleryToDelete.galleryId);

      showToast("success", "Sukces", "Galeria została usunięta");
      setShowDeleteDialog(false);
      setGalleryToDelete(null);
      // React Query will automatically refetch galleries list due to invalidation
    } catch (err) {
      const errorMsg = formatApiError(err);
      showToast("error", "Błąd", errorMsg ?? "Nie udało się usunąć galerii");
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
      void router.push("/galleries/robocze");
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
          // eslint-disable-next-line jsx-a11y/alt-text
          icon: <Image size={64} aria-hidden="true" />,
          title: "Brak galerii do wyświetlenia",
          description: "Nie znaleziono galerii spełniających kryteria filtrowania.",
        };
    }
  };

  return (
    <div className="space-y-4">
          {queryError && (
            <div className="text-red-600 dark:text-red-400">{formatApiError(queryError)}</div>
          )}

          {loading ? (
            <InlineLoading text="Ładowanie galerii..." />
          ) : galleries.length === 0 ? (
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
                        {(gallery.orderCount ?? 0) as number}
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
                            >
                              Opłać galerię
                            </Button>
                          )}
                          <Link
                            href={`/galleries/${gallery.galleryId}`}
                            onMouseEnter={() => prefetchGallery(gallery.galleryId)}
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
                            disabled={deleteGalleryMutation.isPending}
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
          if (!deleteGalleryMutation.isPending) {
            setShowDeleteDialog(false);
            setGalleryToDelete(null);
          }
        }}
        onConfirm={handleDeleteConfirm}
        title="Usuń galerię"
        message={`Czy na pewno chcesz usunąć galerię "${String(galleryToDelete?.galleryName) || String(galleryToDelete?.galleryId) || ""}"?\n\nTa operacja jest nieodwracalna i usunie wszystkie zdjęcia, zlecenia i dane związane z tą galerią.`}
        confirmText="Usuń galerię"
        cancelText="Anuluj"
        variant="danger"
        loading={deleteGalleryMutation.isPending}
      />
    </div>
  );
};

export default GalleryList;
