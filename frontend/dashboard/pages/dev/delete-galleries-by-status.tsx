"use client";

import type { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import React, { useState, useEffect } from "react";

// Prevent static generation for this dev page
export const getServerSideProps: GetServerSideProps = () => {
  return Promise.resolve({ props: {} });
};

import { useInfiniteGalleries } from "../../hooks/useInfiniteGalleries";
import { useToast } from "../../hooks/useToast";
import api from "../../lib/api-service";
import type { Gallery } from "../../types";

const GALLERY_STATUSES = [
  { value: "unpaid", label: "Nieopłacone (Wersje robocze)" },
  { value: "wyslano", label: "Wysłano do klienta" },
  { value: "wybrano", label: "Wybrano zdjęcia" },
  { value: "prosba-o-zmiany", label: "Prośba o zmiany" },
  { value: "gotowe-do-wysylki", label: "Gotowe do wysyłki" },
  { value: "dostarczone", label: "Dostarczone" },
] as const;

type GalleryStatus = (typeof GALLERY_STATUSES)[number]["value"];

export default function DeleteGalleriesByStatus() {
  const router = useRouter();
  const { showToast } = useToast();
  const [selectedStatus, setSelectedStatus] = useState<GalleryStatus | "">("");
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState({ current: 0, total: 0, message: "" });
  const [deletedGalleries, setDeletedGalleries] = useState<string[]>([]);
  const [failedDeletions, setFailedDeletions] = useState<Array<{ id: string; error: string }>>([]);

  // Fetch galleries for selected status
  const {
    data,
    isLoading: galleriesLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteGalleries({
    filter: selectedStatus || undefined,
    limit: 50,
    options: {
      enabled: !!selectedStatus,
      // getNextPageParam and initialPageParam are handled by the hook itself
    } as NonNullable<Parameters<typeof useInfiniteGalleries>[0]>["options"],
  });

  // Flatten all galleries from pages
  useEffect(() => {
    if (data?.pages) {
      const allGalleries = data.pages.flatMap((page) => {
        if (page && typeof page === "object" && "items" in page && Array.isArray(page.items)) {
          return page.items;
        }
        return [];
      });
      setGalleries(allGalleries);
    } else {
      setGalleries([]);
    }
  }, [data]);

  // Load all pages
  useEffect(() => {
    if (selectedStatus && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [selectedStatus, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleLoadAll = async () => {
    if (!selectedStatus) return;

    setIsLoading(true);
    try {
      // Fetch all pages
      while (hasNextPage && !isFetchingNextPage) {
        await fetchNextPage();
        // Wait a bit for the query to process
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (error) {
      showToast("error", "Błąd", "Nie udało się załadować wszystkich galerii");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!selectedStatus || galleries.length === 0 || isDeleting) return;

    if (
      // eslint-disable-next-line no-alert
      !confirm(
        `Czy na pewno chcesz usunąć wszystkie ${galleries.length} galerie ze statusem "${GALLERY_STATUSES.find((s) => s.value === selectedStatus)?.label}"?\n\nTa operacja jest nieodwracalna!`
      )
    ) {
      return;
    }

    setIsDeleting(true);
    setDeleteProgress({ current: 0, total: galleries.length, message: "Rozpoczynanie..." });
    setDeletedGalleries([]);
    setFailedDeletions([]);

    const deleted: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    try {
      // Delete in batches to avoid overwhelming the API
      const batchSize = 5;
      for (let i = 0; i < galleries.length; i += batchSize) {
        const batch = galleries.slice(i, i + batchSize);
        const batchPromises = batch.map(async (gallery) => {
          try {
            await api.galleries.delete(gallery.galleryId);
            deleted.push(gallery.galleryId);
            setDeletedGalleries([...deleted]);
            setDeleteProgress({
              current: deleted.length + failed.length,
              total: galleries.length,
              message: `Usunięto ${deleted.length}/${galleries.length}`,
            });
          } catch (error: unknown) {
            const errorMsg =
              error && typeof error === "object" && "message" in error
                ? String(error.message)
                : "Nieznany błąd";
            failed.push({ id: gallery.galleryId, error: errorMsg });
            setFailedDeletions([...failed]);
            setDeleteProgress({
              current: deleted.length + failed.length,
              total: galleries.length,
              message: `Błędy: ${failed.length}`,
            });
          }
        });

        await Promise.all(batchPromises);

        // Small delay between batches
        if (i + batchSize < galleries.length) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      const successCount = deleted.length;
      const failCount = failed.length;

      if (failCount === 0) {
        showToast("success", "Sukces", `Usunięto wszystkie ${successCount} galerie!`);
      } else {
        showToast(
          "warning",
          "Częściowy sukces",
          `Usunięto ${successCount} galerii. ${failCount} nie udało się usunąć.`
        );
      }

      setDeleteProgress({
        current: galleries.length,
        total: galleries.length,
        message: `✅ Usunięto ${successCount}, błędów: ${failCount}`,
      });

      // Refresh the list
      if (successCount > 0) {
        setTimeout(() => {
          router.reload();
        }, 2000);
      }
    } catch (error) {
      showToast("error", "Błąd", `Nie udało się usunąć galerii: ${String(error)}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-photographer-background dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
          Usuń galerie według statusu
        </h1>

        <div className="space-y-6">
          {/* Status Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Wybierz status galerii do usunięcia
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value as GalleryStatus);
                setDeletedGalleries([]);
                setFailedDeletions([]);
                setDeleteProgress({ current: 0, total: 0, message: "" });
              }}
              disabled={isDeleting || isLoading}
              className="w-full px-4 py-2 border border-gray-400 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">-- Wybierz status --</option>
              {GALLERY_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>

          {/* Gallery Count */}
          {selectedStatus && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
                  Znalezione galerie:
                </span>
                <span className="text-lg font-bold text-blue-900 dark:text-blue-200">
                  {galleries.length}
                </span>
              </div>
              {galleriesLoading && (
                <div className="text-sm text-blue-700 dark:text-blue-300">Ładowanie galerii...</div>
              )}
              {hasNextPage && !galleriesLoading && (
                <button
                  onClick={handleLoadAll}
                  disabled={isLoading}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
                >
                  {isLoading ? "Ładowanie..." : "Załaduj wszystkie strony"}
                </button>
              )}
            </div>
          )}

          {/* Delete Button */}
          {selectedStatus && galleries.length > 0 && (
            <button
              onClick={handleDeleteAll}
              disabled={isDeleting || isLoading || galleriesLoading}
              className="w-full px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isDeleting ? "Usuwanie..." : `Usuń wszystkie ${galleries.length} galerie`}
            </button>
          )}

          {/* Progress */}
          {isDeleting && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                <span>{deleteProgress.message}</span>
                <span>
                  {deleteProgress.current}/{deleteProgress.total}
                </span>
              </div>
              <div className="w-full bg-photographer-muted dark:bg-gray-700 rounded-full h-2.5">
                <div
                  className="bg-red-600 h-2.5 rounded-full transition-all duration-300"
                  style={{
                    width: `${(deleteProgress.current / deleteProgress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Results */}
          {deletedGalleries.length > 0 && (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <h3 className="font-medium text-green-900 dark:text-green-200 mb-2">
                Usunięte galerie ({deletedGalleries.length}):
              </h3>
              <div className="text-sm text-green-800 dark:text-green-300 max-h-40 overflow-y-auto">
                {deletedGalleries.map((id) => (
                  <div key={id} className="font-mono text-xs">
                    {id}
                  </div>
                ))}
              </div>
            </div>
          )}

          {failedDeletions.length > 0 && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <h3 className="font-medium text-red-900 dark:text-red-200 mb-2">
                Błędy ({failedDeletions.length}):
              </h3>
              <div className="text-sm text-red-800 dark:text-red-300 max-h-40 overflow-y-auto space-y-1">
                {failedDeletions.map(({ id, error }) => (
                  <div key={id} className="font-mono text-xs">
                    <div className="font-semibold">{id}</div>
                    <div className="text-xs opacity-75">{error}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warning */}
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>⚠️ Uwaga:</strong> Usuwanie galerii jest operacją nieodwracalną. Wszystkie
              zdjęcia, zlecenia i dane związane z galerią zostaną trwale usunięte.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
