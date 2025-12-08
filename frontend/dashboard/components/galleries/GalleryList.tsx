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
  Menu,
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
import { ConfirmDialog } from "../ui/confirm/ConfirmDialog";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
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

// Helper function to format plan display (e.g., "1GB-12m" -> "1GB 12m")
const formatPlanDisplay = (plan: string | undefined | null): string => {
  if (!plan) {return "-";}
  return plan.replace("-", " ");
};

// Helper function to calculate usage percentage based on gallery type
const calculateUsagePercentage = (gallery: Gallery): number => {
  const originalsBytes = gallery.originalsBytesUsed ?? 0;
  const finalsBytes = gallery.finalsBytesUsed ?? 0;
  const originalsLimit = gallery.originalsLimitBytes ?? 0;
  const finalsLimit = gallery.finalsLimitBytes ?? 0;

  // If no limits, return 0
  if (!originalsLimit && !finalsLimit) {return 0;}

  const isSelectionGallery = gallery.selectionEnabled !== false;

  if (isSelectionGallery) {
    // For selection galleries: use MAX(originalsBytesUsed, finalsBytesUsed) / limitBytes
    const maxBytesUsed = Math.max(originalsBytes, finalsBytes);
    const limitBytes = originalsLimit || finalsLimit;
    return limitBytes > 0 ? (maxBytesUsed / limitBytes) * 100 : 0;
  } else {
    // For non-selection galleries: use SUM(originalsBytesUsed, finalsBytesUsed) / limitBytes
    const totalBytesUsed = originalsBytes + finalsBytes;
    const limitBytes = originalsLimit || finalsLimit;
    return limitBytes > 0 ? (totalBytesUsed / limitBytes) * 100 : 0;
  }
};

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
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);
  const [useHamburgerMenu, setUseHamburgerMenu] = useState(false);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const { showToast } = useToast();

  const prefetchGallery = usePrefetchGallery();

  const {
    data: galleries = [],
    isLoading: loading,
    error: queryError,
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

  // Detect if we should use hamburger menu based on viewport width
  useEffect(() => {
    const checkViewport = () => {
      if (typeof window === "undefined") {return;}
      // Use hamburger menu if viewport is narrow (less than 1300px or when table would scroll)
      const shouldUseHamburger = window.innerWidth < 1350;
      setUseHamburgerMenu(shouldUseHamburger);
    };

    checkViewport();
    window.addEventListener("resize", checkViewport);
    return () => window.removeEventListener("resize", checkViewport);
  }, []);

  const deleteGalleryMutation = useDeleteGallery();

  const { startPublishFlow } = usePublishFlow();

  const handlePayClick = (galleryId: string) => {
    // Use centralized publish flow action
    startPublishFlow(galleryId);
    onWizardOpenChange?.(true);
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
            "Proces: Utwórz galerię → Prześlij zdjęcia → Opublikuj galerię → Wyślij link do klienta",
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
        <div className="w-full overflow-visible">
          <Table className="w-full relative">
            <TableHeader>
              <TableRow className="bg-gray-50 dark:bg-gray-900">
                <TableCell
                  isHeader
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400 min-w-[200px]"
                >
                  Nazwa galerii
                </TableCell>
                <TableCell
                  isHeader
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400 whitespace-nowrap w-[1%]"
                >
                  Plan
                </TableCell>
                <TableCell
                  isHeader
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400 whitespace-nowrap w-[1%]"
                >
                  Status
                </TableCell>
                <TableCell
                  isHeader
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400 whitespace-nowrap w-[1%]"
                >
                  Zlecenia
                </TableCell>
                <TableCell
                  isHeader
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400 whitespace-nowrap w-[1%]"
                >
                  Utworzono
                </TableCell>
                <TableCell
                  isHeader
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400 whitespace-nowrap w-[1%]"
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
                      className="font-medium text-brand-500 hover:text-brand-600 truncate block max-w-full"
                      onClick={() => {
                        // Store current page as referrer when navigating to gallery
                        if (typeof window !== "undefined") {
                          const referrerKey = `gallery_referrer_${gallery.galleryId}`;
                          sessionStorage.setItem(referrerKey, window.location.pathname);
                        }
                      }}
                      title={String(gallery.galleryName ?? gallery.galleryId ?? "")}
                    >
                      {String(gallery.galleryName ?? gallery.galleryId ?? "")}
                    </Link>
                    {!gallery.galleryName && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                        {gallery.galleryId}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap">
                    {(() => {
                      // Check if plan exists and is a non-empty string
                      // For non-selective galleries, plan should always be present
                      const planValue = gallery.plan;
                      const hasPlan = planValue && (typeof planValue === "string" ? planValue.trim() !== "" : true);
                      
                      // Check if limit bytes exist (for non-selective galleries, they might only have finalsLimitBytes)
                      const hasLimitBytes = !!(gallery.originalsLimitBytes ?? gallery.finalsLimitBytes);
                      
                      // Show plan if either plan field exists OR limit bytes exist
                      // For non-selective galleries, plan should always be shown if it exists
                      if (hasPlan || hasLimitBytes) {
                        const planDisplay = planValue ? formatPlanDisplay(String(planValue)) : "-";
                        return (
                          <div>
                            <div className="text-sm font-medium">
                              {planDisplay}
                            </div>
                            {hasLimitBytes ? (
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {calculateUsagePercentage(gallery).toFixed(1)}%
                              </div>
                            ) : null}
                          </div>
                        );
                      }
                      return <span className="text-gray-400">-</span>;
                    })()}
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
                    {useHamburgerMenu ? (
                      <div className="relative">
                        <button
                          ref={(el) => {
                            buttonRefs.current[gallery.galleryId] = el;
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            const isCurrentlyOpen = openActionMenu === gallery.galleryId;
                            // Close all menus first, then open this one if it wasn't open
                            setOpenActionMenu(isCurrentlyOpen ? null : gallery.galleryId);
                          }}
                          className="flex items-center justify-center w-8 h-8 text-gray-500 rounded hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 dropdown-toggle"
                          aria-label="Akcje"
                        >
                          <Menu size={16} />
                        </button>
                        <Dropdown
                          isOpen={openActionMenu === gallery.galleryId}
                          onClose={() => setOpenActionMenu(null)}
                          triggerRef={
                            buttonRefs.current[gallery.galleryId]
                              ? { current: buttonRefs.current[gallery.galleryId] }
                              : undefined
                          }
                          className="w-48 bg-white dark:bg-gray-900 shadow-xl"
                        >
                          {!gallery.isPaid && (
                            <DropdownItem
                              onClick={() => {
                                handlePayClick(gallery.galleryId);
                                setOpenActionMenu(null);
                              }}
                              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 first:rounded-t-xl"
                            >
                              Opublikuj
                            </DropdownItem>
                          )}
                          <div
                            onMouseEnter={() => prefetchGallery(gallery.galleryId)}
                          >
                            <DropdownItem
                              tag="a"
                              href={`/galleries/${gallery.galleryId}`}
                              onItemClick={() => {
                                setOpenActionMenu(null);
                                if (typeof window !== "undefined") {
                                  const referrerKey = `gallery_referrer_${gallery.galleryId}`;
                                  sessionStorage.setItem(referrerKey, window.location.pathname);
                                }
                              }}
                              className={`flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 ${
                                gallery.isPaid ? "first:rounded-t-xl" : ""
                              }`}
                            >
                              Szczegóły
                            </DropdownItem>
                          </div>
                          <DropdownItem
                            onClick={() => {
                              if (!deleteGalleryMutation.isPending) {
                                handleDeleteClick(gallery);
                                setOpenActionMenu(null);
                              }
                            }}
                            className={`flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-500/10 last:rounded-b-xl ${
                              deleteGalleryMutation.isPending ? "opacity-50 cursor-not-allowed" : ""
                            }`}
                          >
                            <Trash2 size={16} />
                            Usuń
                          </DropdownItem>
                        </Dropdown>
                      </div>
                    ) : (
                      <div className="flex gap-3 items-center">
                        {!gallery.isPaid && (
                          <button
                            onClick={() => handlePayClick(gallery.galleryId)}
                            className="text-sm text-brand-500 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300 whitespace-nowrap"
                          >
                            Opublikuj
                          </button>
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
                          className="text-sm text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100 whitespace-nowrap"
                        >
                          Szczegóły
                        </Link>
                        <button
                          onClick={() => handleDeleteClick(gallery)}
                          disabled={deleteGalleryMutation.isPending}
                          className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Usuń
                        </button>
                      </div>
                    )}
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
