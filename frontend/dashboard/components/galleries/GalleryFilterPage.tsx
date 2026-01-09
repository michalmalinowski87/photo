import { LayoutDashboard, List as ListIcon, Search, ArrowUpDown, X } from "lucide-react";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";

import { usePageLogger } from "../../hooks/usePageLogger";
import { useInfiniteGalleries } from "../../hooks/useInfiniteGalleries";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import Input from "../ui/input/InputField";
import { ContentAreaLoadingOverlay } from "../ui/loading/Loading";

import GalleryList from "./GalleryList";

interface GalleryFilterPageProps {
  title: string;
  filter:
    | "unpaid"
    | "wyslano"
    | "wybrano"
    | "prosba-o-zmiany"
    | "gotowe-do-wysylki"
    | "dostarczone";
  loadingText?: string;
}

/**
 * Reusable component for gallery filter pages
 * Provides consistent UI and loading state management
 */
export default function GalleryFilterPage({
  title,
  filter,
  loadingText = "Ładowanie galerii...",
}: GalleryFilterPageProps) {
  usePageLogger({ pageName: `GalleryFilterPage-${filter}`, logRouteChanges: false });
  const [publishWizardOpen, setPublishWizardOpen] = useState<boolean>(false);
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState<boolean>(false);

  // Use the same infinite query hook as GalleryList to ensure consistent loading state
  // This prevents flickering when cached data appears before component is ready
  const {
    data,
    isLoading: loading,
    isFetching,
  } = useInfiniteGalleries({
    filter,
    limit: 20,
  });

  // Track initial load - only mark as loaded when query has fully completed
  // This ensures overlay stays until we're ready to show either data or empty state
  // CRITICAL: Wait for both isLoading AND isFetching to be false
  // This prevents overlay from hiding when cached placeholder data appears
  useEffect(() => {
    // Only mark as loaded when query has fully completed (not loading AND not fetching)
    // This ensures we wait for actual data, not cached placeholder
    const isReady = !loading && !isFetching;
    if (isReady && !hasInitiallyLoaded) {
      setHasInitiallyLoaded(true);
    }
  }, [loading, isFetching, hasInitiallyLoaded]);

  // Check if URL params indicate wizard should open (prevents showing FullPageLoading)
  const shouldOpenWizardFromUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    const params = new URLSearchParams(window.location.search);
    return params.get("publish") === "true" && params.get("galleryId") !== null;
  }, []);

  // Set wizard state from URL params on mount
  useEffect(() => {
    if (shouldOpenWizardFromUrl && !publishWizardOpen && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const galleryParam = params.get("galleryId");

      if (galleryParam) {
        setPublishWizardOpen(true);

        // Clear URL params after reading them
        setTimeout(() => {
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete("publish");
          newUrl.searchParams.delete("galleryId");
          newUrl.searchParams.delete("duration");
          newUrl.searchParams.delete("planKey");
          window.history.replaceState({}, "", newUrl.toString());
        }, 0);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleWizardOpenChange = useCallback((_isOpen: boolean) => {
    // Store state is managed separately
  }, []);

  // Show content area overlay if:
  // 1. Still loading/fetching OR haven't initially loaded yet
  // 2. Wizard is not open
  // This ensures overlay stays visible until query has fully completed
  // CRITICAL: We hide overlay only when both loading AND fetching are complete
  // This prevents flicker when cached placeholder data appears before real data loads
  const showContentAreaOverlay =
    (loading || isFetching || !hasInitiallyLoaded) &&
    !publishWizardOpen &&
    !shouldOpenWizardFromUrl;

  // View mode state - shared with GalleryList
  const [viewMode, setViewMode] = useState<"list" | "cards">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("galleryListViewMode");
      return saved === "list" || saved === "cards" ? saved : "cards";
    }
    return "cards";
  });

  // Save view mode preference
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("galleryListViewMode", viewMode);
    }
  }, [viewMode]);

  // Search state with debouncing
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>("");
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 600);
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  // Sort state - persisted in localStorage
  const [sortBy, setSortBy] = useState<"name" | "date" | "expiration">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("galleryListSortBy");
      return saved === "name" || saved === "date" || saved === "expiration" ? saved : "date";
    }
    return "date";
  });
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("galleryListSortOrder");
      return saved === "asc" || saved === "desc" ? saved : "desc";
    }
    return "desc";
  });
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const sortButtonRef = useRef<HTMLButtonElement | null>(null);

  // Save sort preferences
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("galleryListSortBy", sortBy);
      localStorage.setItem("galleryListSortOrder", sortOrder);
    }
  }, [sortBy, sortOrder]);

  const getSortLabel = () => {
    const sortLabels: Record<"name" | "date" | "expiration", string> = {
      name: "Nazwa",
      date: "Data",
      expiration: "Data wygaśnięcia",
    };
    const orderLabel = sortOrder === "asc" ? "rosnąco" : "malejąco";
    return `${sortLabels[sortBy]} (${orderLabel})`;
  };

  return (
    <div className="space-y-6">
      {!publishWizardOpen && (
        <div className="flex items-center gap-4 flex-wrap">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{title}</h1>
          {/* Search Input - spans from title to sort dropdown */}
          <div className="relative flex-1 min-w-[200px]">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10">
              <Search size={18} className="text-gray-400 dark:text-gray-500" />
            </div>
            <Input
              type="text"
              placeholder="Szukaj (nazwa, data, email klienta)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`pl-9 ${searchQuery ? "pr-10" : "pr-4"}`}
              hideErrorSpace={true}
              autoComplete="off"
              autoFocus={false}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-5 h-5 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                aria-label="Wyczyść wyszukiwanie"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Sort Dropdown */}
          <div className="relative">
            <button
              ref={sortButtonRef}
              onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
              className="flex items-center gap-2 px-4 py-2.5 h-11 bg-white dark:bg-gray-800 border border-gray-400 dark:border-gray-700 rounded-lg shadow-theme-xs hover:bg-photographer-background dark:hover:bg-gray-700 transition-colors text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap"
            >
              <ArrowUpDown size={16} />
              <span>{getSortLabel()}</span>
            </button>
            <Dropdown
              isOpen={sortDropdownOpen}
              onClose={() => setSortDropdownOpen(false)}
              triggerRef={sortButtonRef}
              className="w-64 bg-white dark:bg-gray-900 shadow-xl rounded-lg border border-gray-400 dark:border-gray-700"
            >
              <div className="p-2">
                <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Sortuj według
                </div>
                <DropdownItem
                  onClick={() => {
                    setSortBy("name");
                    setSortDropdownOpen(false);
                  }}
                  className={`px-3 py-2 text-sm ${
                    sortBy === "name"
                      ? "bg-photographer-accentLight/50 dark:bg-photographer-accent/20 text-photographer-accent dark:text-photographer-accent"
                      : "text-gray-700 dark:text-gray-300 hover:bg-photographer-elevated dark:hover:bg-gray-800"
                  }`}
                >
                  Nazwa {sortBy === "name" && (sortOrder === "asc" ? "↑" : "↓")}
                </DropdownItem>
                <DropdownItem
                  onClick={() => {
                    setSortBy("date");
                    setSortDropdownOpen(false);
                  }}
                  className={`px-3 py-2 text-sm ${
                    sortBy === "date"
                      ? "bg-photographer-accentLight/50 dark:bg-photographer-accent/20 text-photographer-accent dark:text-photographer-accent"
                      : "text-gray-700 dark:text-gray-300 hover:bg-photographer-elevated dark:hover:bg-gray-800"
                  }`}
                >
                  Data {sortBy === "date" && (sortOrder === "asc" ? "↑" : "↓")}
                </DropdownItem>
                <DropdownItem
                  onClick={() => {
                    setSortBy("expiration");
                    setSortDropdownOpen(false);
                  }}
                  className={`px-3 py-2 text-sm ${
                    sortBy === "expiration"
                      ? "bg-photographer-accentLight/50 dark:bg-photographer-accent/20 text-photographer-accent dark:text-photographer-accent"
                      : "text-gray-700 dark:text-gray-300 hover:bg-photographer-elevated dark:hover:bg-gray-800"
                  }`}
                >
                  Data wygaśnięcia {sortBy === "expiration" && (sortOrder === "asc" ? "↑" : "↓")}
                </DropdownItem>
                <div className="border-t border-gray-400 dark:border-gray-700 my-1" />
                <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Kolejność
                </div>
                <DropdownItem
                  onClick={() => {
                    setSortOrder("asc");
                    setSortDropdownOpen(false);
                  }}
                  className={`px-3 py-2 text-sm ${
                    sortOrder === "asc"
                      ? "bg-photographer-accentLight/50 dark:bg-photographer-accent/20 text-photographer-accent dark:text-photographer-accent"
                      : "text-gray-700 dark:text-gray-300 hover:bg-photographer-elevated dark:hover:bg-gray-800"
                  }`}
                >
                  Rosnąco ↑
                </DropdownItem>
                <DropdownItem
                  onClick={() => {
                    setSortOrder("desc");
                    setSortDropdownOpen(false);
                  }}
                  className={`px-3 py-2 text-sm ${
                    sortOrder === "desc"
                      ? "bg-photographer-accentLight/50 dark:bg-photographer-accent/20 text-photographer-accent dark:text-photographer-accent"
                      : "text-gray-700 dark:text-gray-300 hover:bg-photographer-elevated dark:hover:bg-gray-800"
                  }`}
                >
                  Malejąco ↓
                </DropdownItem>
              </div>
            </Dropdown>
          </div>

          {/* View Toggle */}
          <div className="flex items-center gap-2 bg-photographer-elevated dark:bg-gray-800 rounded-lg p-1 h-11">
            <button
              onClick={() => setViewMode("cards")}
              className={`h-11 w-11 rounded-md transition-colors flex items-center justify-center ${
                viewMode === "cards"
                  ? "bg-white dark:bg-gray-700 text-photographer-accent dark:text-photographer-accent shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              }`}
              aria-label="Widok kart"
            >
              <LayoutDashboard size={24} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`h-11 w-11 rounded-md transition-colors flex items-center justify-center ${
                viewMode === "list"
                  ? "bg-white dark:bg-gray-700 text-photographer-accent dark:text-photographer-accent shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              }`}
              aria-label="Widok listy"
            >
              <ListIcon size={24} />
            </button>
          </div>
        </div>
      )}
      <div
        className="relative"
        style={{ minHeight: showContentAreaOverlay ? "calc(100vh - 200px)" : undefined }}
      >
        {showContentAreaOverlay && <ContentAreaLoadingOverlay text={loadingText} />}
        <GalleryList
          filter={filter}
          onWizardOpenChange={handleWizardOpenChange}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          search={debouncedSearchQuery}
          sortBy={sortBy}
          sortOrder={sortOrder}
        />
      </div>
    </div>
  );
}
