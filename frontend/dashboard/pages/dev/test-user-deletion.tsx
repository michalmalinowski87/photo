"use client";

import { useState } from "react";

import Button from "../../components/ui/button/Button";
import Input from "../../components/ui/input/InputField";
import { useAuth } from "../../context/AuthProvider";
import { useDeletionStatus } from "../../hooks/queries/useAuth";
import { useToast } from "../../hooks/useToast";
import api, { formatApiError } from "../../lib/api-service";

export default function TestUserDeletion() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { data: deletionStatus, refetch: refetchDeletionStatus } = useDeletionStatus();

  const [lastLoginMonthsAgo, setLastLoginMonthsAgo] = useState<string>("12");
  const [lastLoginDate, setLastLoginDate] = useState<string>("");
  const [useDate, setUseDate] = useState<boolean>(false);
  const [loading, setLoading] = useState<{
    setLastLogin: boolean;
    triggerDeletion: boolean;
    triggerScanner: boolean;
  }>({
    setLastLogin: false,
    triggerDeletion: false,
    triggerScanner: false,
  });

  const handleSetLastLogin = async () => {
    if (!user?.userId) {
      showToast("error", "Błąd", "Brak informacji o użytkowniku");
      return;
    }

    setLoading((prev) => ({ ...prev, setLastLogin: true }));
    try {
      const lastLoginValue = useDate ? lastLoginDate : parseInt(lastLoginMonthsAgo, 10);

      await api.auth.devSetLastLogin(user.userId, lastLoginValue);
      showToast("success", "Sukces", "Data ostatniego logowania została ustawiona");
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err as Error));
    } finally {
      setLoading((prev) => ({ ...prev, setLastLogin: false }));
    }
  };

  const handleTriggerDeletion = async (immediate: boolean = true) => {
    if (!user?.userId) {
      showToast("error", "Błąd", "Brak informacji o użytkowniku");
      return;
    }

    setLoading((prev) => ({ ...prev, triggerDeletion: true }));
    try {
      const result = await api.auth.devTriggerDeletion(user.userId, {
        immediate,
        minutesFromNow: immediate ? 1 : 3 * 24 * 60, // 1 minute if immediate, 3 days otherwise
      });
      showToast("success", "Sukces", result.message);
      await refetchDeletionStatus();
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err as Error));
    } finally {
      setLoading((prev) => ({ ...prev, triggerDeletion: false }));
    }
  };

  const handleTriggerScanner = async () => {
    setLoading((prev) => ({ ...prev, triggerScanner: true }));
    try {
      const result = await api.auth.devTriggerInactivityScanner();
      showToast("success", "Sukces", result.message);
      console.log("Scanner result:", result.result);
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err as Error));
    } finally {
      setLoading((prev) => ({ ...prev, triggerScanner: false }));
    }
  };

  return (
    <div className="min-h-screen bg-photographer-background dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Test usuwania konta
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Narzędzia do testowania funkcjonalności usuwania konta bez czekania dni
          </p>
        </div>

        {/* Current Status */}
        {deletionStatus && (
          <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-400 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Status usuwania konta
            </h2>
            <div className="space-y-1 text-sm">
              <p>
                <strong>Status:</strong> {deletionStatus.status}
              </p>
              {deletionStatus.deletionScheduledAt && (
                <p>
                  <strong>Zaplanowane usunięcie:</strong>{" "}
                  {new Date(deletionStatus.deletionScheduledAt).toLocaleString("pl-PL")}
                </p>
              )}
              {deletionStatus.deletionReason && (
                <p>
                  <strong>Powód:</strong> {deletionStatus.deletionReason}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Set Last Login */}
        <div className="mb-6 p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-400 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            1. Symuluj nieaktywność
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Ustaw datę ostatniego logowania, aby symulować nieaktywność użytkownika
          </p>

          <div className="space-y-4">
            <div>
              <label className="flex items-center gap-2 mb-2">
                <input
                  type="radio"
                  checked={!useDate}
                  onChange={() => setUseDate(false)}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Użyj liczby miesięcy temu
                </span>
              </label>
              {!useDate && (
                <Input
                  type="number"
                  placeholder="12"
                  value={lastLoginMonthsAgo}
                  onChange={(e) => setLastLoginMonthsAgo(e.target.value)}
                  min="0"
                  max="24"
                />
              )}
            </div>

            <div>
              <label className="flex items-center gap-2 mb-2">
                <input
                  type="radio"
                  checked={useDate}
                  onChange={() => setUseDate(true)}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Użyj konkretnej daty
                </span>
              </label>
              {useDate && (
                <Input
                  type="datetime-local"
                  value={lastLoginDate}
                  onChange={(e) => setLastLoginDate(e.target.value)}
                />
              )}
            </div>

            <Button variant="primary" onClick={handleSetLastLogin} disabled={loading.setLastLogin}>
              {loading.setLastLogin ? "Ustawianie..." : "Ustaw datę ostatniego logowania"}
            </Button>
          </div>
        </div>

        {/* Trigger Deletion */}
        <div className="mb-6 p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-400 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            2. Wyzwól usunięcie konta
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Wyzwól usunięcie konta natychmiastowo (1 minuta) lub zaplanuj na przyszłość
          </p>

          <div className="flex gap-3">
            <Button
              variant="danger"
              onClick={() => handleTriggerDeletion(true)}
              disabled={loading.triggerDeletion}
            >
              {loading.triggerDeletion ? "Wyzwalanie..." : "Usuń natychmiast (1 min)"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleTriggerDeletion(false)}
              disabled={loading.triggerDeletion}
            >
              Zaplanuj na 3 dni
            </Button>
          </div>
        </div>

        {/* Trigger Inactivity Scanner */}
        <div className="mb-6 p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-400 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            3. Wyzwól skaner nieaktywności
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Ręcznie wyzwól skaner nieaktywności, który sprawdzi wszystkich użytkowników i wyśle
            powiadomienia
          </p>

          <Button
            variant="primary"
            onClick={handleTriggerScanner}
            disabled={loading.triggerScanner}
          >
            {loading.triggerScanner ? "Wyzwalanie..." : "Wyzwól skaner nieaktywności"}
          </Button>
        </div>

        {/* Info */}
        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            <strong>💡 Wskazówki testowania:</strong>
          </p>
          <ul className="text-sm text-yellow-700 dark:text-yellow-300 mt-2 list-disc list-inside space-y-1">
            <li>
              Ustaw lastLoginAt na 12 miesięcy temu, a następnie wyzwól skaner nieaktywności -
              powinien zaplanować usunięcie za 30 dni
            </li>
            <li>
              Ustaw lastLoginAt na 11 miesięcy temu, a następnie wyzwól skaner - powinien wysłać
              przypomnienie
            </li>
            <li>Użyj "Usuń natychmiast" aby przetestować pełny proces usuwania bez czekania</li>
            <li>Sprawdź status usuwania w ustawieniach konta po wyzwoleniu usunięcia</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

