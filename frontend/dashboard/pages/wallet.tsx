import { useQueryClient } from "@tanstack/react-query";
import type { GetServerSideProps } from "next";
import { useState } from "react";

import Badge from "../components/ui/badge/Badge";
import Button from "../components/ui/button/Button";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../components/ui/table";
import { WalletTopUpSection } from "../components/wallet/WalletTopUpSection";
import { useWalletBalance, useWalletTransactions } from "../hooks/queries/useWallet";
import { formatPrice } from "../lib/format-price";
import { queryKeys } from "../lib/react-query";

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

// Prevent static generation - this page uses client hooks
export const getServerSideProps: GetServerSideProps = () => {
  return Promise.resolve({ props: {} });
};

export default function Wallet() {
  const queryClient = useQueryClient();

  // React Query hooks
  const { data: walletBalanceData, isLoading: loading, error: balanceError } = useWalletBalance();

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [paginationCursor, setPaginationCursor] = useState<string | null>(null);
  const [pageHistory, setPageHistory] = useState<PageHistoryItem[]>([{ page: 1, cursor: null }]);

  const {
    data: transactionsData,
    isLoading: transactionsLoading,
    isFetching: transactionsFetching,
    error: transactionsError,
  } = useWalletTransactions(
    paginationCursor ? { limit: "10", lastKey: paginationCursor } : { limit: "10" }
  );

  const transactions = (transactionsData?.transactions ?? []) as unknown as Transaction[];
  const hasMore = transactionsData?.hasMore ?? false;
  const balance = walletBalanceData?.balanceCents ?? 0;
  const error = balanceError ?? transactionsError;

  const handleNextPage = (): void => {
    if (hasMore && transactionsData?.lastKey) {
      const nextPage = currentPage + 1;
      const newCursor = transactionsData.lastKey;
      setPaginationCursor(newCursor);
      setCurrentPage(nextPage);

      // Update page history
      const historyIndex = pageHistory.findIndex((h) => h.page === nextPage);
      if (historyIndex >= 0) {
        const newHistory = [...pageHistory];
        newHistory[historyIndex] = { page: nextPage, cursor: newCursor };
        setPageHistory(newHistory);
      } else {
        setPageHistory([...pageHistory, { page: nextPage, cursor: newCursor }]);
      }
    }
  };

  const handlePreviousPage = (): void => {
    if (currentPage > 1) {
      const previousPage = currentPage - 1;
      const previousPageData = pageHistory.find((h) => h.page === previousPage);
      if (previousPageData) {
        setPaginationCursor(previousPageData.cursor);
        setCurrentPage(previousPage);
      } else {
        setPaginationCursor(null);
        setCurrentPage(1);
      }
    }
  };

  const handleTopUpComplete = (): void => {
    // Invalidate wallet balance and transactions to refetch
    void queryClient.invalidateQueries({ queryKey: queryKeys.wallet.balance() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.wallet.all });
    // Reset to first page
    setCurrentPage(1);
    setPaginationCursor(null);
    setPageHistory([{ page: 1, cursor: null }]);
  };

  const handleRefresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.wallet.balance() });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.wallet.transactions(
        paginationCursor ? { limit: "10", lastKey: paginationCursor } : { limit: "10" }
      ),
    });
  };

  const handleRefreshTransactions = (): void => {
    setCurrentPage(1);
    setPageHistory([{ page: 1, cursor: null }]);
    setPaginationCursor(null);
    void queryClient.invalidateQueries({
      queryKey: queryKeys.wallet.transactions({ limit: "10" }),
    });
  };

  const getTransactionTypeLabel = (type: string): string => {
    const typeMap: Record<string, string> = {
      WALLET_TOPUP: "Doładowanie portfela",
      WELCOME_BONUS: "Bonus powitalny",
      GALLERY_PLAN: "Plan galerii",
      REFUND: "Zwrot",
      STRIPE_CHECKOUT: "Płatność kartą",
      WALLET_DEBIT: "Płatność z portfela",
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
    <div className="space-y-6 pb-8">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Portfel</h1>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          {error instanceof Error ? error.message : "Wystąpił błąd podczas ładowania danych"}
        </div>
      )}

      {loading ? (
        <div className="p-6 bg-white border border-gray-400 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700 h-[325.33px] animate-fade-in-out"></div>
      ) : (
        <div className="p-6 bg-white border border-gray-400 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Saldo portfela</div>
              <div className="text-4xl font-bold text-gray-900 dark:text-white">
                {formatPrice(balance)}
              </div>
            </div>
            <Button variant="outline" onClick={handleRefresh} disabled={loading}>
              Odśwież
            </Button>
          </div>

          <WalletTopUpSection
            onTopUp={handleTopUpComplete}
            isLoading={loading}
            quickAmounts={[2000, 5000, 10000, 20000]}
            showCustomInput={true}
          />
        </div>
      )}

      {transactionsLoading ? (
        <div className="p-6 bg-white border border-gray-400 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700 h-[724px] animate-fade-in-out"></div>
      ) : (
        <div className="p-6 bg-white border border-gray-400 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Historia transakcji
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshTransactions}
              disabled={transactionsFetching}
            >
              Odśwież
            </Button>
          </div>

          {transactions.length === 0 ? (
            <div className="min-h-[530px] flex items-center justify-center">
              <p className="text-gray-500 dark:text-gray-400">Brak transakcji</p>
            </div>
          ) : (
            <div className="w-full">
              <div className="h-[530px] overflow-y-auto">
                <Table className="w-full">
                  <TableHeader className="sticky top-0 z-10 bg-photographer-darkBeige dark:bg-gray-900">
                    <TableRow className="bg-photographer-darkBeige dark:bg-gray-900">
                      <TableCell
                        isHeader
                        className="px-4 py-3 text-left text-xs font-medium text-photographer-mutedText uppercase tracking-wider dark:text-gray-400"
                      >
                        Data
                      </TableCell>
                      <TableCell
                        isHeader
                        className="px-4 py-3 text-left text-xs font-medium text-photographer-mutedText uppercase tracking-wider dark:text-gray-400"
                      >
                        Typ
                      </TableCell>
                      <TableCell
                        isHeader
                        className="px-4 py-3 text-left text-xs font-medium text-photographer-mutedText uppercase tracking-wider dark:text-gray-400"
                      >
                        Status
                      </TableCell>
                      <TableCell
                        isHeader
                        className="px-4 py-3 text-right text-xs font-medium text-photographer-mutedText uppercase tracking-wider dark:text-gray-400"
                      >
                        Kwota
                      </TableCell>
                      <TableCell
                        isHeader
                        className="px-4 py-3 text-left text-xs font-medium text-photographer-mutedText uppercase tracking-wider dark:text-gray-400"
                      >
                        Metoda płatności
                      </TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => {
                      const isCredit = tx.type === "WALLET_TOPUP";
                      const amount =
                        tx.amountCents ??
                        (tx.amount !== null && tx.amount !== undefined ? tx.amount * 100 : 0);

                      return (
                        <TableRow
                          key={tx.transactionId ?? tx.txnId}
                          className="hover:bg-photographer-background dark:hover:bg-gray-800"
                        >
                          <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-white">
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
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-400 dark:border-gray-700">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Strona {currentPage}
                {transactions.length === 10 && hasMore && " (więcej dostępne)"}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreviousPage}
                  disabled={transactionsFetching || currentPage === 1}
                >
                  Poprzednia
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={transactionsFetching || !hasMore}
                >
                  Następna
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
