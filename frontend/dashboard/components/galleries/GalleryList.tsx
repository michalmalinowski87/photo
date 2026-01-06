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
  Rocket,
  Eye,
} from "lucide-react";
import Link from "next/link";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { VirtuosoGrid } from "react-virtuoso";

import { useDeleteGallery } from "../../hooks/mutations/useGalleryMutations";
import { useInfiniteGalleries } from "../../hooks/useInfiniteGalleries";
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
import { Tooltip } from "../ui/tooltip/Tooltip";

import { GalleryCard } from "./GalleryCard";

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
  viewMode?: "list" | "cards";
  onViewModeChange?: (mode: "list" | "cards") => void;
  search?: string;
  sortBy?: "name" | "date" | "expiration";
  sortOrder?: "asc" | "desc";
}

// Helper function to format plan display (e.g., "1GB-12m" -> "1GB 12m")
const formatPlanDisplay = (plan: string | undefined | null): string => {
  if (!plan) {
    return "-";
  }
  return plan.replace("-", " ");
};

// Helper function to break text at full words after 50 characters
// Also truncates to 100 characters max, never returns more than 2 lines
const breakTextAtWords = (text: string, maxLength: number = 50): string[] => {
  // Truncate to 100 characters if longer
  const truncatedText = text.length > 100 ? text.substring(0, 100) : text;

  if (truncatedText.length <= maxLength) {
    return [truncatedText];
  }

  // Find the last space before maxLength
  const firstLine = truncatedText.substring(0, maxLength);
  const lastSpaceIndex = firstLine.lastIndexOf(" ");

  if (lastSpaceIndex > 0) {
    const line1 = truncatedText.substring(0, lastSpaceIndex);
    const remaining = truncatedText.substring(lastSpaceIndex + 1);
    // Ensure second line doesn't exceed remaining characters (max 100 total)
    // If remaining is longer than maxLength, truncate it
    const line2 =
      remaining.length > maxLength ? `${remaining.substring(0, maxLength - 3)}...` : remaining;
    return [line1, line2];
  }

  // If no space found, break at maxLength and truncate second line if needed
  const line1 = truncatedText.substring(0, maxLength);
  const remaining = truncatedText.substring(maxLength);
  const line2 =
    remaining.length > maxLength ? `${remaining.substring(0, maxLength - 3)}...` : remaining;
  return [line1, line2];
};

// Helper function to calculate usage percentage based on gallery type
const calculateUsagePercentage = (gallery: Gallery): number => {
  const originalsBytes = gallery.originalsBytesUsed ?? 0;
  const finalsBytes = gallery.finalsBytesUsed ?? 0;
  const originalsLimit = gallery.originalsLimitBytes ?? 0;
  const finalsLimit = gallery.finalsLimitBytes ?? 0;

  // If no limits, return 0
  if (!originalsLimit && !finalsLimit) {
    return 0;
  }

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

// Cover photo cell component with error handling
const CoverPhotoCell = ({ coverPhotoUrl }: { coverPhotoUrl: string | null | undefined }) => {
  const [imageError, setImageError] = useState(false);

  if (!coverPhotoUrl || imageError) {
    return (
      <div className="flex items-center justify-center w-24 h-24 bg-photographer-elevated dark:bg-gray-700 rounded-lg">
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image className="w-12 h-12 text-gray-400" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={coverPhotoUrl}
        alt="Okładka galerii"
        className="w-24 h-24 object-cover rounded-lg"
        onError={() => setImageError(true)}
      />
    </div>
  );
};

const GalleryList = ({
  filter = "unpaid",
  onLoadingChange,
  onWizardOpenChange,
  viewMode: externalViewMode,
  onViewModeChange: _onViewModeChange,
  search,
  sortBy,
  sortOrder,
}: GalleryListProps) => {
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

  // View toggle state - use external if provided, otherwise manage internally
  const [internalViewMode] = useState<"list" | "cards">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("galleryListViewMode");
      return saved === "list" || saved === "cards" ? saved : "cards";
    }
    return "cards";
  });

  const viewMode = externalViewMode ?? internalViewMode;

  const prefetchGallery = usePrefetchGallery();

  const {
    data,
    isLoading: loading,
    error: queryError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteGalleries({
    filter,
    limit: 20,
    search,
    sortBy,
    sortOrder,
  });

  // Flatten pages into a single array of galleries
  const galleries = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => {
      if (page && typeof page === "object" && "items" in page && Array.isArray(page.items)) {
        return page.items;
      }
      return [];
    });
  }, [data]);

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
      if (typeof window === "undefined") {
        return;
      }
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

  // Save view mode preference (only if managing internally)
  useEffect(() => {
    if (typeof window !== "undefined" && !externalViewMode) {
      localStorage.setItem("galleryListViewMode", internalViewMode);
    }
  }, [internalViewMode, externalViewMode]);

  const getEmptyStateConfig = () => {
    const handleCreateGallery = () => {
      // Dispatch event to open gallery creation wizard
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("openGalleryWizard"));
      }
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
      ) : viewMode === "cards" ? (
        // Cards View with Infinite Scroll - Ultra Smooth with Early Preloading
        <div className="w-full" style={{ height: "calc(100vh - 200px)", minHeight: "900px" }}>
          <VirtuosoGrid
            totalCount={galleries.length}
            data={galleries}
            rangeChanged={(range) => {
              // Trigger prefetch when we're within 25 items of the end
              // This ensures data loads well before user reaches the end, accounting for 1sec API latency
              // Higher threshold accounts for faster scrolling speeds
              const distanceFromEnd = galleries.length - range.endIndex;
              const prefetchThreshold = 25; // Start loading when 25 items away from end

              // Don't fetch if there's an error or already fetching
              if (
                distanceFromEnd <= prefetchThreshold &&
                hasNextPage &&
                !isFetchingNextPage &&
                !queryError
              ) {
                void fetchNextPage();
              }
            }}
            endReached={() => {
              // Fallback: also trigger when actually reaching the end (should rarely be needed)
              // Don't fetch if there's an error or already fetching
              if (hasNextPage && !isFetchingNextPage && !queryError) {
                void fetchNextPage();
              }
            }}
            // Very large overscan to preload items well ahead for ultra-smooth scrolling
            overscan={1200}
            itemContent={(index) => {
              const gallery = galleries[index];
              if (!gallery) return null;
              return (
                <div className="p-2 h-full">
                  <GalleryCard
                    gallery={gallery}
                    onPublish={handlePayClick}
                    onDelete={handleDeleteClick}
                    onPrefetch={prefetchGallery}
                  />
                </div>
              );
            }}
            style={{ height: "100%" }}
            components={{
              List: (() => {
                const VirtuosoGridList = React.forwardRef<
                  HTMLDivElement,
                  { style?: React.CSSProperties; children?: React.ReactNode }
                >(({ style, children }, ref) => (
                  <div
                    ref={ref}
                    style={style}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                  >
                    {children}
                  </div>
                ));
                VirtuosoGridList.displayName = "VirtuosoGridList";
                return VirtuosoGridList;
              })(),
              Footer: () =>
                isFetchingNextPage ? (
                  <div className="flex justify-center py-4 col-span-full opacity-0">
                    <InlineLoading text="Ładowanie więcej galerii..." />
                  </div>
                ) : null,
            }}
          />
        </div>
      ) : (
        // List View with Infinite Scroll - Ultra Smooth with Early Preloading
        <div className="w-full relative">
          <div
            className="w-full overflow-auto"
            style={{
              height: "calc(100vh - 200px)",
              minHeight: "800px",
              overscrollBehavior: "none",
            }}
            onScroll={(e) => {
              const target = e.target as HTMLElement;
              const scrollTop = target.scrollTop;
              const clientHeight = target.clientHeight;

              // Use same item-based prefetching as cards view for consistency
              // Calculate how many items are remaining based on scroll position
              const estimatedItemHeight = 120; // Height of each table row (h-[120px])
              const totalItemsRendered = galleries.length;

              // Calculate which item index is currently at the bottom of viewport
              const scrollBottom = scrollTop + clientHeight;
              const itemsScrolled = Math.floor(scrollBottom / estimatedItemHeight);

              // Calculate distance from end (same logic as cards view)
              const distanceFromEnd = totalItemsRendered - itemsScrolled;
              const prefetchThreshold = 25; // Same threshold as cards view

              // Don't fetch if there's an error or already fetching
              if (
                distanceFromEnd <= prefetchThreshold &&
                hasNextPage &&
                !isFetchingNextPage &&
                !queryError
              ) {
                void fetchNextPage();
              }
            }}
          >
            <Table className="w-full relative">
              <TableHeader className="sticky top-0 z-10 bg-photographer-darkBeige dark:bg-gray-900">
                <TableRow className="bg-photographer-darkBeige dark:bg-gray-900">
                  <TableCell
                    isHeader
                    className="px-3 py-3 h-[68px] text-center text-sm font-medium text-photographer-mutedText uppercase tracking-wider dark:text-gray-400 w-[120px]"
                  >
                    Okładka
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-3 py-3 h-[68px] text-left text-sm font-medium text-photographer-mutedText uppercase tracking-wider dark:text-gray-400 min-w-[400px]"
                  >
                    Nazwa galerii
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-3 py-3 h-[68px] text-center text-sm font-medium text-photographer-mutedText uppercase tracking-wider dark:text-gray-400 whitespace-nowrap w-[1%]"
                  >
                    Plan
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-3 py-3 h-[68px] text-center text-sm font-medium text-photographer-mutedText uppercase tracking-wider dark:text-gray-400 whitespace-nowrap w-[1%]"
                  >
                    Status
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-3 py-3 h-[68px] text-center text-sm font-medium text-photographer-mutedText uppercase tracking-wider dark:text-gray-400 whitespace-nowrap w-[1%]"
                  >
                    Zlecenia
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-3 py-3 h-[68px] text-center text-sm font-medium text-photographer-mutedText uppercase tracking-wider dark:text-gray-400 whitespace-nowrap w-[1%]"
                  >
                    Utworzono
                  </TableCell>
                  <TableCell
                    isHeader
                    className="px-3 py-3 h-[68px] text-center text-sm font-medium text-photographer-mutedText uppercase tracking-wider dark:text-gray-400 whitespace-nowrap w-[1%]"
                  >
                    Akcje
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {galleries.map((gallery, index) => {
                  const galleryName =
                    typeof gallery.galleryName === "string"
                      ? gallery.galleryName
                      : typeof gallery.galleryId === "string"
                        ? gallery.galleryId
                        : "";
                  const nameLines = breakTextAtWords(String(galleryName), 50);
                  // First row (index 0) should be light to contrast with dark header
                  // So even indices get light background, odd indices get striped background
                  const isEvenRow = index % 2 === 0;

                  const coverPhotoUrl = gallery.coverPhotoUrl as string | null | undefined;

                  return (
                    <TableRow
                      key={gallery.galleryId}
                      className={`h-[120px] ${
                        isEvenRow
                          ? "bg-photographer-lightBeige dark:bg-gray-800/50 hover:bg-photographer-muted dark:hover:bg-gray-800/90"
                          : "bg-photographer-muted dark:bg-gray-900/40 hover:bg-photographer-darkBeige dark:hover:bg-gray-800/40"
                      }`}
                    >
                      <TableCell className="px-3 py-5 align-middle text-center w-[120px]">
                        <CoverPhotoCell coverPhotoUrl={coverPhotoUrl} />
                      </TableCell>
                      <TableCell className="px-3 py-5 align-middle min-w-[400px]">
                        <Link
                          href={`/galleries/${String(gallery.galleryId)}`}
                          className="font-medium text-base text-photographer-heading hover:text-photographer-accent dark:text-white dark:hover:text-photographer-accent block max-w-full"
                          onClick={() => {
                            // Store current page as referrer when navigating to gallery
                            if (typeof window !== "undefined") {
                              const referrerKey = `gallery_referrer_${String(gallery.galleryId)}`;
                              sessionStorage.setItem(referrerKey, window.location.pathname);
                            }
                          }}
                          title={galleryName}
                        >
                          {nameLines.map((line, lineIndex) => (
                            <span key={`line-${lineIndex}`} className="block">
                              {line}
                            </span>
                          ))}
                        </Link>
                        {!gallery.galleryName && (
                          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {gallery.galleryId}
                          </div>
                        )}
                        {((typeof gallery.clientFirstName === "string" &&
                          gallery.clientFirstName) ||
                          (typeof gallery.clientLastName === "string" && gallery.clientLastName) ||
                          (typeof gallery.clientEmail === "string" && gallery.clientEmail)) && (
                          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Klient:{" "}
                            {typeof gallery.clientFirstName === "string" &&
                            typeof gallery.clientLastName === "string" &&
                            gallery.clientFirstName &&
                            gallery.clientLastName
                              ? `${gallery.clientFirstName} ${gallery.clientLastName}`
                              : typeof gallery.clientEmail === "string"
                                ? gallery.clientEmail
                                : "-"}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-5 text-base text-gray-900 dark:text-white whitespace-nowrap align-middle text-center">
                        {(() => {
                          // Check if plan exists and is a non-empty string
                          // For non-selective galleries, plan should always be present
                          const planValue = gallery.plan;
                          const hasPlan =
                            planValue &&
                            (typeof planValue === "string" ? planValue.trim() !== "" : true);

                          // Check if limit bytes exist (for non-selective galleries, they might only have finalsLimitBytes)
                          const hasLimitBytes = !!(
                            gallery.originalsLimitBytes ?? gallery.finalsLimitBytes
                          );

                          // Show plan if either plan field exists OR limit bytes exist
                          // For non-selective galleries, plan should always be shown if it exists
                          if (hasPlan || hasLimitBytes) {
                            const planDisplay =
                              planValue && typeof planValue === "string"
                                ? formatPlanDisplay(planValue)
                                : "-";
                            return (
                              <div className="text-center">
                                <div className="text-base font-medium">{planDisplay}</div>
                                {hasLimitBytes ? (
                                  <div className="text-sm text-gray-500 dark:text-gray-400">
                                    {calculateUsagePercentage(gallery).toFixed(1)}%
                                  </div>
                                ) : null}
                              </div>
                            );
                          }
                          return <span className="text-gray-400">-</span>;
                        })()}
                      </TableCell>
                      <TableCell className="px-3 py-5 align-middle text-center">
                        {getStateBadge(gallery)}
                      </TableCell>
                      <TableCell className="px-3 py-5 text-base text-gray-900 dark:text-white align-middle text-center">
                        {(gallery.orderCount ?? 0) as number}
                      </TableCell>
                      <TableCell className="px-3 py-5 text-base text-gray-900 dark:text-white align-middle text-center">
                        {gallery.createdAt
                          ? new Date(gallery.createdAt).toLocaleDateString("pl-PL")
                          : "-"}
                      </TableCell>
                      <TableCell className="px-3 py-5 align-middle text-center">
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
                              className="flex items-center justify-center w-8 h-8 text-gray-500 rounded hover:bg-photographer-elevated dark:text-gray-400 dark:hover:bg-gray-800 dropdown-toggle"
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
                              {!gallery.isPaid &&
                                (() => {
                                  // Check if gallery has photos
                                  // For selective galleries: check originalsBytesUsed
                                  // For non-selective galleries: check both finalsBytesUsed and originalsBytesUsed
                                  // (photos should be in finals, but check both for robustness)
                                  const isSelectionGallery = gallery.selectionEnabled !== false;
                                  const hasPhotos = isSelectionGallery
                                    ? (gallery.originalsBytesUsed ?? 0) > 0
                                    : (gallery.finalsBytesUsed ?? 0) > 0 ||
                                      (gallery.originalsBytesUsed ?? 0) > 0;

                                  return (
                                    <Tooltip
                                      content={!hasPhotos ? "Najpierw prześlij zdjęcia" : ""}
                                      side="left"
                                      align="center"
                                    >
                                      <div>
                                        <DropdownItem
                                          onClick={() => {
                                            if (hasPhotos) {
                                              handlePayClick(gallery.galleryId);
                                              setOpenActionMenu(null);
                                            }
                                          }}
                                          disabled={!hasPhotos}
                                          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-photographer-elevated dark:text-gray-300 dark:hover:bg-gray-800 first:rounded-t-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                        >
                                          <Rocket size={16} />
                                          Opublikuj
                                        </DropdownItem>
                                      </div>
                                    </Tooltip>
                                  );
                                })()}
                              <div onMouseEnter={() => prefetchGallery(gallery.galleryId)}>
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
                                  className={`flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-photographer-elevated dark:text-gray-300 dark:hover:bg-gray-800 ${
                                    gallery.isPaid ? "first:rounded-t-xl" : ""
                                  }`}
                                >
                                  <Eye size={16} />
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
                                  deleteGalleryMutation.isPending
                                    ? "opacity-50 cursor-not-allowed"
                                    : ""
                                }`}
                              >
                                <Trash2 size={16} />
                                Usuń
                              </DropdownItem>
                            </Dropdown>
                          </div>
                        ) : (
                          <div className="flex items-center">
                            {!gallery.isPaid &&
                              (() => {
                                // Check if gallery has photos
                                // For selective galleries: check originalsBytesUsed
                                // For non-selective galleries: check both finalsBytesUsed and originalsBytesUsed
                                // (photos should be in finals, but check both for robustness)
                                const isSelectionGallery = gallery.selectionEnabled !== false;
                                const hasPhotos = isSelectionGallery
                                  ? (gallery.originalsBytesUsed ?? 0) > 0
                                  : (gallery.finalsBytesUsed ?? 0) > 0 ||
                                    (gallery.originalsBytesUsed ?? 0) > 0;

                                return (
                                  <Tooltip
                                    content={!hasPhotos ? "Najpierw prześlij zdjęcia" : "Opublikuj"}
                                    side="top"
                                  >
                                    <button
                                      onClick={() => {
                                        if (hasPhotos) {
                                          handlePayClick(gallery.galleryId);
                                        }
                                      }}
                                      disabled={!hasPhotos}
                                      className="flex items-center justify-center w-8 h-8 text-brand-500 hover:text-brand-600 dark:text-photographer-accent dark:hover:text-photographer-accentHover rounded hover:bg-brand-50 dark:hover:bg-photographer-accent/20 transition-colors mr-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-brand-500"
                                      aria-label="Opublikuj"
                                    >
                                      <Rocket className="w-5 h-5" />
                                    </button>
                                  </Tooltip>
                                );
                              })()}
                            <Tooltip content="Szczegóły" side="top">
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
                                className="flex items-center justify-center w-8 h-8 text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100 rounded hover:bg-photographer-elevated dark:hover:bg-gray-800 transition-colors mr-0.5"
                                aria-label="Szczegóły"
                              >
                                <Eye className="w-5 h-5" />
                              </Link>
                            </Tooltip>
                            <Tooltip content="Usuń" side="top">
                              <button
                                onClick={() => handleDeleteClick(gallery)}
                                disabled={deleteGalleryMutation.isPending}
                                className="flex items-center justify-center w-8 h-8 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 rounded hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label="Usuń"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </Tooltip>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {isFetchingNextPage && (
                  <TableRow>
                    <TableCell colSpan={7} className="px-3 py-5">
                      <div className="flex justify-center py-4">
                        <InlineLoading text="Ładowanie więcej galerii..." />
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
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
