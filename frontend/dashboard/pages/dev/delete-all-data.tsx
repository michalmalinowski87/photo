"use client";

import { Package as PackageIcon, Users, Trash2 } from "lucide-react";
import type { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import React, { useState, useEffect } from "react";

// Prevent static generation for this dev page
export const getServerSideProps: GetServerSideProps = () => {
  return Promise.resolve({ props: {} });
};

import { useClients } from "../../hooks/queries/useClients";
import { useInfinitePackages } from "../../hooks/useInfinitePackages";
import { useToast } from "../../hooks/useToast";
import api from "../../lib/api-service";
import type { Client, Package } from "../../types";

export default function DeleteAllData() {
  const router = useRouter();
  const { showToast } = useToast();
  const [packages, setPackages] = useState<Package[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoadingPackages, setIsLoadingPackages] = useState(false);
  const [isDeletingPackages, setIsDeletingPackages] = useState(false);
  const [isDeletingClients, setIsDeletingClients] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState({
    current: 0,
    total: 0,
    message: "",
    type: "" as "packages" | "clients" | "",
  });

  // Fetch all packages
  const {
    data: packagesData,
    fetchNextPage: fetchNextPackagesPage,
    hasNextPage: hasNextPackagesPage,
    isFetchingNextPage: isFetchingNextPackagesPage,
  } = useInfinitePackages({
    limit: 50,
  });

  // Fetch all clients
  const { data: clientsData, isLoading: clientsLoading } = useClients({
    limit: "1000", // Large limit to get all clients
  });

  // Flatten packages from pages
  useEffect(() => {
    if (packagesData?.pages) {
      const allPackages = packagesData.pages.flatMap((page) => {
        if (page && typeof page === "object" && "items" in page && Array.isArray(page.items)) {
          return page.items;
        }
        return [];
      });
      setPackages(allPackages as Package[]);
    } else {
      setPackages([]);
    }
  }, [packagesData]);

  // Load all package pages
  useEffect(() => {
    if (hasNextPackagesPage && !isFetchingNextPackagesPage) {
      void fetchNextPackagesPage();
    }
  }, [hasNextPackagesPage, isFetchingNextPackagesPage, fetchNextPackagesPage]);

  // Set clients
  useEffect(() => {
    if (
      clientsData &&
      typeof clientsData === "object" &&
      "items" in clientsData &&
      Array.isArray(clientsData.items)
    ) {
      // Convert API Client type to domain Client type
      setClients(clientsData.items as Client[]);
    } else {
      setClients([]);
    }
  }, [clientsData]);

  const handleLoadAllPackages = async () => {
    setIsLoadingPackages(true);
    try {
      while (hasNextPackagesPage && !isFetchingNextPackagesPage) {
        await fetchNextPackagesPage();
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error("Failed to load all packages:", error);
      showToast("error", "Błąd", "Nie udało się załadować wszystkich pakietów");
    } finally {
      setIsLoadingPackages(false);
    }
  };

  const handleDeleteAllPackages = async () => {
    if (packages.length === 0 || isDeletingPackages) return;

    if (
      // eslint-disable-next-line no-alert
      !confirm(
        `Czy na pewno chcesz usunąć wszystkie ${packages.length} pakiety?\n\nTa operacja jest nieodwracalna!`
      )
    ) {
      return;
    }

    setIsDeletingPackages(true);
    setDeleteProgress({
      current: 0,
      total: packages.length,
      message: "Rozpoczynanie...",
      type: "packages",
    });

    const batchSize = 5;
    let deleted = 0;
    let failed = 0;
    const failedDeletions: Array<{ id: string; error: string }> = [];

    try {
      for (let i = 0; i < packages.length; i += batchSize) {
        const batch = [];
        const batchEnd = Math.min(i + batchSize, packages.length);

        for (let j = i; j < batchEnd; j++) {
          const pkg = packages[j];
          batch.push(
            api.packages.delete(pkg.packageId).catch((error: unknown) => {
              return {
                error: error instanceof Error ? error.message : String(error),
                packageId: pkg.packageId,
              };
            })
          );
        }

        const results = await Promise.allSettled(batch);

        results.forEach((result, index) => {
          if (result.status === "fulfilled") {
            if (result.value && typeof result.value === "object" && "error" in result.value) {
              failed++;
              failedDeletions.push({
                id: packages[i + index].packageId,
                error: String(result.value.error),
              });
            } else {
              deleted++;
            }
          } else {
            failed++;
            failedDeletions.push({
              id: packages[i + index].packageId,
              error: String(result.reason),
            });
          }
        });

        setDeleteProgress({
          current: batchEnd,
          total: packages.length,
          message: `Usunięto ${deleted}/${batchEnd} pakietów${failed > 0 ? `, ${failed} błędów` : ""}`,
          type: "packages",
        });

        if (batchEnd < packages.length) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      showToast(
        "success",
        "Sukces",
        `Usunięto ${deleted} pakietów${failed > 0 ? `, ${failed} błędów` : ""}`
      );

      if (failedDeletions.length > 0) {
        console.error("Failed deletions:", failedDeletions);
      }
    } catch (error) {
      console.error("Error deleting packages:", error);
      showToast("error", "Błąd", "Wystąpił błąd podczas usuwania pakietów");
    } finally {
      setIsDeletingPackages(false);
      setDeleteProgress({ current: 0, total: 0, message: "", type: "" });
      // Reload packages
      window.location.reload();
    }
  };

  const handleDeleteAllClients = async () => {
    if (clients.length === 0 || isDeletingClients) return;

    if (
      // eslint-disable-next-line no-alert
      !confirm(
        `Czy na pewno chcesz usunąć wszystkich ${clients.length} klientów?\n\nTa operacja jest nieodwracalna!`
      )
    ) {
      return;
    }

    setIsDeletingClients(true);
    setDeleteProgress({
      current: 0,
      total: clients.length,
      message: "Rozpoczynanie...",
      type: "clients",
    });

    const batchSize = 5;
    let deleted = 0;
    let failed = 0;
    const failedDeletions: Array<{ id: string; error: string }> = [];

    try {
      for (let i = 0; i < clients.length; i += batchSize) {
        const batch = [];
        const batchEnd = Math.min(i + batchSize, clients.length);

        for (let j = i; j < batchEnd; j++) {
          const client = clients[j];
          batch.push(
            api.clients.delete(client.clientId).catch((error: unknown) => {
              return {
                error: error instanceof Error ? error.message : String(error),
                clientId: client.clientId,
              };
            })
          );
        }

        const results = await Promise.allSettled(batch);

        results.forEach((result, index) => {
          if (result.status === "fulfilled") {
            if (result.value && typeof result.value === "object" && "error" in result.value) {
              failed++;
              failedDeletions.push({
                id: clients[i + index].clientId,
                error: String(result.value.error),
              });
            } else {
              deleted++;
            }
          } else {
            failed++;
            failedDeletions.push({
              id: clients[i + index].clientId,
              error: String(result.reason),
            });
          }
        });

        setDeleteProgress({
          current: batchEnd,
          total: clients.length,
          message: `Usunięto ${deleted}/${batchEnd} klientów${failed > 0 ? `, ${failed} błędów` : ""}`,
          type: "clients",
        });

        if (batchEnd < clients.length) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      showToast(
        "success",
        "Sukces",
        `Usunięto ${deleted} klientów${failed > 0 ? `, ${failed} błędów` : ""}`
      );

      if (failedDeletions.length > 0) {
        console.error("Failed deletions:", failedDeletions);
      }
    } catch (error) {
      console.error("Error deleting clients:", error);
      showToast("error", "Błąd", "Wystąpił błąd podczas usuwania klientów");
    } finally {
      setIsDeletingClients(false);
      setDeleteProgress({ current: 0, total: 0, message: "", type: "" });
      // Reload clients
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push("/dev")}
            className="mb-4 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            ← Powrót do menu deweloperskiego
          </button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Usuń wszystkie dane
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Usuń wszystkie pakiety i/lub klientów z bazy danych
          </p>
        </div>

        {/* Warning */}
        <div className="mb-8 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">
            <strong>⚠️ Uwaga:</strong> Ta operacja jest nieodwracalna! Wszystkie wybrane dane
            zostaną trwale usunięte.
          </p>
        </div>

        {/* Packages Section */}
        <div className="mb-6 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-start gap-4 mb-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
              <PackageIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Pakiety</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Znaleziono <strong>{packages.length}</strong> pakietów.
              </p>
              {isLoadingPackages && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Ładowanie wszystkich pakietów...
                </p>
              )}
              {hasNextPackagesPage && !isLoadingPackages && (
                <button
                  onClick={handleLoadAllPackages}
                  className="mb-4 px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Załaduj wszystkie pakiety
                </button>
              )}
              {deleteProgress.type === "packages" && deleteProgress.total > 0 && (
                <div className="mb-4">
                  <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                    <span>{deleteProgress.message}</span>
                    <span>
                      {deleteProgress.current}/{deleteProgress.total}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-red-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(deleteProgress.current / deleteProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
              <button
                onClick={handleDeleteAllPackages}
                disabled={isDeletingPackages || packages.length === 0 || isLoadingPackages}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                <Trash2 size={16} />
                {isDeletingPackages ? "Usuwanie..." : `Usuń wszystkie pakiety (${packages.length})`}
              </button>
            </div>
          </div>
        </div>

        {/* Clients Section */}
        <div className="mb-6 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-start gap-4 mb-4">
            <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
              <Users className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Klienci</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Znaleziono <strong>{clients.length}</strong> klientów.
                {clientsLoading && " Ładowanie..."}
              </p>
              {deleteProgress.type === "clients" && deleteProgress.total > 0 && (
                <div className="mb-4">
                  <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                    <span>{deleteProgress.message}</span>
                    <span>
                      {deleteProgress.current}/{deleteProgress.total}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-red-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(deleteProgress.current / deleteProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
              <button
                onClick={handleDeleteAllClients}
                disabled={isDeletingClients || clients.length === 0 || clientsLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                <Trash2 size={16} />
                {isDeletingClients ? "Usuwanie..." : `Usuń wszystkich klientów (${clients.length})`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
