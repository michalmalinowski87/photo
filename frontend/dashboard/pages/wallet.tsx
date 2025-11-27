import { useState, useEffect } from "react";

import Badge from "../components/ui/badge/Badge";
import Button from "../components/ui/button/Button";
import Input from "../components/ui/input/InputField";
import { Loading } from "../components/ui/loading/Loading";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../components/ui/table";
import { useToast } from "../hooks/useToast";
import api, { formatApiError } from "../lib/api-service";
import { initializeAuth, redirectToLandingSignIn } from "../lib/auth-init";
import { formatCurrencyInput } from "../lib/currency";
import { formatPrice } from "../lib/format-price";

interface Transaction {
  transactionId?: string;
  txnId?: string;
  type: string;
  status: string;
  amountCents?: number;
  amount?: number;
  paymentMethod?: string;
  createdAt?: string;
}

interface PageHistoryItem {
  page: number;
  cursor: string | null;
}

export default function Wallet() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState<boolean>(true);
  const [transactionsLoading, setTransactionsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [topUpAmount, setTopUpAmount] = useState<string>("100");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [paginationCursor, setPaginationCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [pageHistory, setPageHistory] = useState<PageHistoryItem[]>([{ page: 1, cursor: null }]);

  useEffect(() => {
    initializeAuth(
      () => {
        void loadBalance();
        void loadTransactions(1, null);
      },
      () => {
        redirectToLandingSignIn("/wallet");
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("payment") === "success") {
        setError("");
        showToast("success", "Sukces", "Portfel został doładowany pomyślnie");
        void loadBalance();
        void loadTransactions(1, null);
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadBalance = async (): Promise<void> => {
    setLoading(true);
    setError("");

    try {
      const data = await api.wallet.getBalance();
      setBalance(data.balanceCents ?? 0);
    } catch (err) {
      setError(formatApiError(err as Error));
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = async (page: number, lastKey: string | null): Promise<void> => {
    setTransactionsLoading(true);
    setError("");

    try {
      const params: Record<string, string> = { limit: "10" };
      if (lastKey) {
        params.lastKey = lastKey;
      }

      const data = await api.wallet.getTransactions(params);
      setTransactions(data.transactions ?? []);
      setHasMore(data.hasMore ?? false);
      const newCursor = data.lastKey ?? null;
      setPaginationCursor(newCursor);
      setCurrentPage(page);

      const historyIndex = pageHistory.findIndex((h) => h.page === page);
      if (historyIndex >= 0) {
        const newHistory = [...pageHistory];
        newHistory[historyIndex] = { page, cursor: lastKey };
        setPageHistory(newHistory);
      } else {
        setPageHistory([...pageHistory, { page, cursor: lastKey }]);
      }
    } catch (err) {
      const errorMsg = formatApiError(err as Error);
      setError(errorMsg);
      showToast("error", "Błąd", errorMsg);
    } finally {
      setTransactionsLoading(false);
    }
  };

  const handleNextPage = (): void => {
    if (hasMore && paginationCursor) {
      const nextPage = currentPage + 1;
      void loadTransactions(nextPage, paginationCursor);
    }
  };

  const handlePreviousPage = (): void => {
    if (currentPage > 1) {
      const previousPage = currentPage - 1;
      const previousPageData = pageHistory.find((h) => h.page === previousPage);
      if (previousPageData) {
        void loadTransactions(previousPage, previousPageData.cursor);
      } else {
        void loadTransactions(1, null);
      }
    }
  };

  const handleTopUp = async (amountCents?: number): Promise<void> => {
    const amount = amountCents ?? Math.round(parseFloat(topUpAmount) * 100);

    if (amount < 2000) {
      const errorMsg = "Minimalna kwota doładowania to 20 PLN";
      setError(errorMsg);
      showToast("error", "Błąd", errorMsg);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const redirectUrl =
        typeof window !== "undefined" ? `${window.location.origin}/wallet?payment=success` : "";

      const data = await api.payments.createCheckout({
        amountCents: amount,
        type: "wallet_topup",
        redirectUrl,
      });

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        const errorMsg = "Nie otrzymano URL do płatności";
        setError(errorMsg);
        showToast("error", "Błąd", errorMsg);
      }
    } catch (err) {
      const errorMsg = formatApiError(err as Error);
      setError(errorMsg);
      showToast("error", "Błąd", errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const getTransactionTypeLabel = (type: string): string => {
    const typeMap: Record<string, string> = {
      WALLET_TOPUP: "Doładowanie portfela",
      WELCOME_BONUS: "Bonus powitalny",
      GALLERY_PLAN: "Plan galerii",
      REFUND: "Zwrot",
      STRIPE_CHECKOUT: "Płatność kartą",
      WALLET_DEBIT: "Płatność z portfela",
      MIXED: "Płatność mieszana",
    };
    return typeMap[type] || type;
  };

  const getTransactionStatusBadge = (status: string) => {
    type BadgeColor = "success" | "error" | "warning" | "info" | "light";
    const statusMap: Record<string, { color: BadgeColor; label: string }> = {
      PAID: { color: "success", label: "Opłacone" },
      UNPAID: { color: "error", label: "Nieopłacone" },
      CANCELED: { color: "error", label: "Anulowane" },
      REFUNDED: { color: "warning", label: "Zwrócone" },
      FAILED: { color: "error", label: "Nieudane" },
    };

    const statusInfo = statusMap[status] ?? { color: "light" as BadgeColor, label: status };
    return (
      <Badge color={statusInfo.color} variant="light">
        {statusInfo.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Portfel</h1>

      {error && (
        <div className="p-4 bg-error-50 border border-error-200 rounded-lg text-error-600 dark:bg-error-500/10 dark:border-error-500/20 dark:text-error-400">
          {error}
        </div>
      )}

      <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Saldo portfela</div>
            <div className="text-4xl font-bold text-gray-900 dark:text-white">
              {balance !== null ? formatPrice(balance) : "0.00 PLN"}
            </div>
          </div>
          <Button variant="outline" onClick={loadBalance} disabled={loading}>
            Odśwież
          </Button>
        </div>

        <div className="mb-6">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Szybkie doładowanie
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="primary"
              onClick={() => handleTopUp(2000)}
              disabled={loading}
            >
              +20 PLN
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => handleTopUp(5000)}
              disabled={loading}
            >
              +50 PLN
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => handleTopUp(10000)}
              disabled={loading}
            >
              +100 PLN
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => handleTopUp(20000)}
              disabled={loading}
            >
              +200 PLN
            </Button>
          </div>
        </div>

        <div>
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Własna kwota
          </div>
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Kwota (min 20 PLN)"
              value={topUpAmount}
              onChange={(e) => {
                const formatted = formatCurrencyInput(e.target.value);
                setTopUpAmount(formatted);
              }}
              className="flex-1"
            />
            <Button variant="primary" onClick={() => handleTopUp()} disabled={loading}>
              Doładuj
            </Button>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Minimalna kwota doładowania: 20 PLN
          </p>
        </div>
      </div>

      <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Historia transakcji
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCurrentPage(1);
              setPageHistory([{ page: 1, cursor: null }]);
              void loadTransactions(1, null);
            }}
            disabled={transactionsLoading}
          >
            Odśwież
          </Button>
        </div>

        {transactionsLoading ? (
          <div className="min-h-[620px] flex items-center justify-center">
            <Loading size="lg" text="Ładowanie transakcji..." />
          </div>
        ) : transactions.length === 0 ? (
          <div className="min-h-[530px] flex items-center justify-center">
            <p className="text-gray-500 dark:text-gray-400">Brak transakcji</p>
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <div className="h-[530px] overflow-y-auto">
              <Table className="table-fixed w-full">
                <TableHeader className="sticky top-0 z-10">
                  <TableRow className="bg-gray-50 dark:bg-gray-900">
                    <TableCell
                      isHeader
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                    >
                      Data
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                    >
                      Typ
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                    >
                      Status
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                    >
                      Kwota
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400"
                    >
                      Metoda płatności
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => {
                    const isCredit = tx.type === "WALLET_TOPUP";
                    const amount = tx.amountCents ?? (tx.amount !== null && tx.amount !== undefined ? tx.amount * 100 : 0);

                    return (
                      <TableRow
                        key={tx.transactionId ?? tx.txnId}
                        className="hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <TableCell className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {tx.createdAt
                            ? new Date(tx.createdAt).toLocaleDateString("pl-PL", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "-"}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                          {getTransactionTypeLabel(tx.type)}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm">
                          {getTransactionStatusBadge(tx.status)}
                        </TableCell>
                        <TableCell
                          className={`px-4 py-3 text-sm text-right font-medium ${
                            isCredit
                              ? "text-success-600 dark:text-success-400"
                              : "text-gray-900 dark:text-white"
                          }`}
                        >
                          {isCredit ? "+" : "-"}
                          {formatPrice(amount)}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {tx.paymentMethod === "WALLET"
                            ? "Portfel"
                            : tx.paymentMethod === "STRIPE"
                              ? "Stripe"
                              : tx.paymentMethod === "MIXED"
                                ? "Mieszana"
                                : (tx.paymentMethod ?? "-")}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {transactions.length < 9 &&
                    Array.from({ length: 9 - transactions.length }).map((_, index) => (
                      <TableRow key={`spacer-${index}`} className="h-[53px]">
                        <TableCell className="px-4 py-3 border-transparent">&nbsp;</TableCell>
                        <TableCell className="px-4 py-3 border-transparent">&nbsp;</TableCell>
                        <TableCell className="px-4 py-3 border-transparent">&nbsp;</TableCell>
                        <TableCell className="px-4 py-3 border-transparent">&nbsp;</TableCell>
                        <TableCell className="px-4 py-3 border-transparent">&nbsp;</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {transactions.length > 0 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Strona {currentPage}
              {transactions.length === 10 && hasMore && " (więcej dostępne)"}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreviousPage}
                disabled={transactionsLoading || currentPage === 1}
              >
                Poprzednia
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={transactionsLoading || !hasMore}
              >
                Następna
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
