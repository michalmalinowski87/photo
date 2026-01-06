"use client";

import { Package, Users } from "lucide-react";
import type { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import React, { useState } from "react";

// Prevent static generation for this dev page
export const getServerSideProps: GetServerSideProps = () => {
  return Promise.resolve({ props: {} });
};

import { useToast } from "../../hooks/useToast";
import api from "../../lib/api-service";

export default function CreateTestData() {
  const router = useRouter();
  const { showToast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    message: "",
    type: "" as "packages" | "clients" | "",
  });

  // Generate random package data
  const generatePackageData = (index: number) => {
    const names = [
      "Basic",
      "Standard",
      "Premium",
      "Pro",
      "Enterprise",
      "Starter",
      "Advanced",
      "Ultimate",
    ];
    const name = `${names[index % names.length]} ${Math.floor(index / names.length) + 1}`;
    return {
      name,
      includedPhotos: Math.floor(Math.random() * 50) + 10, // 10-60 photos
      pricePerExtraPhoto: Math.floor(Math.random() * 500) + 100, // 100-600 cents (1-6 PLN)
      price: Math.floor(Math.random() * 50000) + 10000, // 100-600 PLN
    };
  };

  // Generate random client data
  const generateClientData = (index: number) => {
    const firstNames = [
      "Jan",
      "Anna",
      "Piotr",
      "Maria",
      "Krzysztof",
      "Katarzyna",
      "Tomasz",
      "Magdalena",
    ];
    const lastNames = [
      "Kowalski",
      "Nowak",
      "Wiśniewski",
      "Wójcik",
      "Kowalczyk",
      "Kamiński",
      "Lewandowski",
      "Zieliński",
    ];
    const domains = ["gmail.com", "wp.pl", "o2.pl", "interia.pl", "example.com"];

    const isCompany = index % 3 === 0; // Every 3rd client is a company
    const firstName = firstNames[index % firstNames.length];
    const lastName = lastNames[Math.floor(index / firstNames.length) % lastNames.length];

    if (isCompany) {
      return {
        email: `firma${index}@${domains[index % domains.length]}`,
        firstName: "",
        lastName: "",
        phone: `+48${Math.floor(Math.random() * 900000000) + 100000000}`,
        isCompany: true,
        companyName: `${firstName} ${lastName} Sp. z o.o.`,
        nip: `${Math.floor(Math.random() * 9000000000) + 1000000000}`,
      };
    } else {
      return {
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${index}@${domains[index % domains.length]}`,
        firstName,
        lastName,
        phone: `+48${Math.floor(Math.random() * 900000000) + 100000000}`,
        isCompany: false,
        companyName: "",
        nip: "",
      };
    }
  };

  const handleCreatePackages = async () => {
    if (isCreating) return;

    setIsCreating(true);
    setProgress({ current: 0, total: 100, message: "Tworzenie pakietów...", type: "packages" });

    const batchSize = 5;
    let created = 0;
    let failed = 0;

    try {
      for (let i = 0; i < 100; i += batchSize) {
        const batch = [];
        const batchEnd = Math.min(i + batchSize, 100);

        for (let j = i; j < batchEnd; j++) {
          const packageData = generatePackageData(j);
          batch.push(api.packages.create(packageData));
        }

        const results = await Promise.allSettled(batch);

        results.forEach((result) => {
          if (result.status === "fulfilled") {
            created++;
          } else {
            failed++;
            console.error("Failed to create package:", result.reason);
          }
        });

        setProgress({
          current: batchEnd,
          total: 100,
          message: `Utworzono ${created}/${batchEnd} pakietów${failed > 0 ? `, ${failed} błędów` : ""}`,
          type: "packages",
        });

        // Small delay between batches
        if (batchEnd < 100) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      showToast(
        "success",
        "Sukces",
        `Utworzono ${created} pakietów${failed > 0 ? `, ${failed} błędów` : ""}`
      );
    } catch (error) {
      console.error("Error creating packages:", error);
      showToast("error", "Błąd", "Wystąpił błąd podczas tworzenia pakietów");
    } finally {
      setIsCreating(false);
      setProgress({ current: 0, total: 0, message: "", type: "" });
    }
  };

  const handleCreateClients = async () => {
    if (isCreating) return;

    setIsCreating(true);
    setProgress({ current: 0, total: 100, message: "Tworzenie klientów...", type: "clients" });

    const batchSize = 5;
    let created = 0;
    let failed = 0;

    try {
      for (let i = 0; i < 100; i += batchSize) {
        const batch = [];
        const batchEnd = Math.min(i + batchSize, 100);

        for (let j = i; j < batchEnd; j++) {
          const clientData = generateClientData(j);
          batch.push(api.clients.create(clientData));
        }

        const results = await Promise.allSettled(batch);

        results.forEach((result) => {
          if (result.status === "fulfilled") {
            created++;
          } else {
            failed++;
            console.error("Failed to create client:", result.reason);
          }
        });

        setProgress({
          current: batchEnd,
          total: 100,
          message: `Utworzono ${created}/${batchEnd} klientów${failed > 0 ? `, ${failed} błędów` : ""}`,
          type: "clients",
        });

        // Small delay between batches
        if (batchEnd < 100) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      showToast(
        "success",
        "Sukces",
        `Utworzono ${created} klientów${failed > 0 ? `, ${failed} błędów` : ""}`
      );
    } catch (error) {
      console.error("Error creating clients:", error);
      showToast("error", "Błąd", "Wystąpił błąd podczas tworzenia klientów");
    } finally {
      setIsCreating(false);
      setProgress({ current: 0, total: 0, message: "", type: "" });
    }
  };

  return (
    <div className="min-h-screen bg-photographer-background dark:bg-gray-900 p-8">
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
            Utwórz dane testowe
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Utwórz 100 pakietów i/lub 100 klientów do testowania
          </p>
        </div>

        {/* Warning */}
        <div className="mb-8 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            <strong>⚠️ Uwaga:</strong> Ta operacja utworzy dużą liczbę rekordów w bazie danych.
          </p>
        </div>

        {/* Packages Section */}
        <div className="mb-6 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-400 dark:border-gray-700">
          <div className="flex items-start gap-4 mb-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
              <Package className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Pakiety</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Utworzy 100 pakietów z losowymi nazwami, cenami i liczbą zdjęć.
              </p>
              {progress.type === "packages" && progress.total > 0 && (
                <div className="mb-4">
                  <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                    <span>{progress.message}</span>
                    <span>
                      {progress.current}/{progress.total}
                    </span>
                  </div>
                  <div className="w-full bg-photographer-muted dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
              <button
                onClick={handleCreatePackages}
                disabled={isCreating}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {isCreating && progress.type === "packages"
                  ? "Tworzenie..."
                  : "Utwórz 100 pakietów"}
              </button>
            </div>
          </div>
        </div>

        {/* Clients Section */}
        <div className="mb-6 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-400 dark:border-gray-700">
          <div className="flex items-start gap-4 mb-4">
            <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
              <Users className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Klienci</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Utworzy 100 klientów (osoby fizyczne i firmy) z losowymi danymi.
              </p>
              {progress.type === "clients" && progress.total > 0 && (
                <div className="mb-4">
                  <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                    <span>{progress.message}</span>
                    <span>
                      {progress.current}/{progress.total}
                    </span>
                  </div>
                  <div className="w-full bg-photographer-muted dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
              <button
                onClick={handleCreateClients}
                disabled={isCreating}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {isCreating && progress.type === "clients" ? "Tworzenie..." : "Utwórz 100 klientów"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
