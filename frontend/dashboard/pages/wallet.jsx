import { useState, useEffect } from "react";
import { apiFetch, formatApiError } from "../lib/api";
import { getIdToken } from "../lib/auth";
import { initializeAuth, redirectToLandingSignIn } from "../lib/auth-init";
import Button from "../components/ui/button/Button";
import Badge from "../components/ui/badge/Badge";
import Input from "../components/ui/input/InputField";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../components/ui/table";
import { Loading } from "../components/ui/loading/Loading";

export default function Wallet() {
  const [apiUrl, setApiUrl] = useState("");
  const [idToken, setIdToken] = useState("");
  const [loading, setLoading] = useState(true); // Start with true to prevent flicker
  const [error, setError] = useState("");
  const [balance, setBalance] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [topUpAmount, setTopUpAmount] = useState("100");
  const [currentPage, setCurrentPage] = useState(1);
  const [paginationCursor, setPaginationCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [pageHistory, setPageHistory] = useState([{ page: 1, cursor: null }]);

  useEffect(() => {
    setApiUrl(process.env.NEXT_PUBLIC_API_URL || "");
    initializeAuth(
      (token) => {
        setIdToken(token);
      },
      () => {
        redirectToLandingSignIn("/wallet");
      }
    );
  }, []);

  useEffect(() => {
    if (apiUrl && idToken) {
      loadBalance();
      loadTransactions(1, null);
    }
  }, [apiUrl, idToken]);

  // Check for payment success query parameter
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("payment") === "success") {
        setError("");
        loadBalance();
        loadTransactions(1, null);
        // Clean up URL
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, []);

  const loadBalance = async () => {
    if (!apiUrl || !idToken) return;
    
    setLoading(true);
    setError("");
    
    try {
      const { data } = await apiFetch(`${apiUrl}/wallet/balance`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      setBalance(data.balanceCents || 0);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = async (page, lastKey) => {
    if (!apiUrl || !idToken) return;
    
    setLoading(true);
    setError("");
    
    try {
      const params = new URLSearchParams();
      params.append('limit', '10');
      if (lastKey) {
        params.append('lastKey', lastKey);
      }
      
      const { data } = await apiFetch(`${apiUrl}/wallet/transactions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      setTransactions(data.transactions || []);
      setHasMore(data.hasMore || false);
      const newCursor = data.lastKey || null;
      setPaginationCursor(newCursor);
      setCurrentPage(page);
      
      // Update page history - store the cursor that was used to get to this page
      const historyIndex = pageHistory.findIndex(h => h.page === page);
      if (historyIndex >= 0) {
        // Update existing entry
        const newHistory = [...pageHistory];
        newHistory[historyIndex] = { page, cursor: lastKey };
        setPageHistory(newHistory);
      } else {
        // Add new entry
        setPageHistory([...pageHistory, { page, cursor: lastKey }]);
      }
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleNextPage = () => {
    if (hasMore && paginationCursor) {
      const nextPage = currentPage + 1;
      loadTransactions(nextPage, paginationCursor);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      const previousPage = currentPage - 1;
      const previousPageData = pageHistory.find(h => h.page === previousPage);
      if (previousPageData) {
        loadTransactions(previousPage, previousPageData.cursor);
      } else {
        // Fallback: go to page 1
        loadTransactions(1, null);
      }
    }
  };

  const handleTopUp = async (amountCents) => {
    if (!apiUrl || !idToken) return;
    
    const amount = amountCents || Math.round(parseFloat(topUpAmount) * 100);
    
    if (amount < 2000) {
      setError("Minimalna kwota doładowania to 20 PLN");
      return;
    }
    
    setLoading(true);
    setError("");
    
    try {
      const redirectUrl = typeof window !== "undefined"
        ? `${window.location.origin}/wallet?payment=success`
        : "";
      
      const { data } = await apiFetch(`${apiUrl}/payments/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          amountCents: amount,
          type: "wallet_topup",
          redirectUrl,
        }),
      });
      
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        setError("Nie otrzymano URL do płatności");
      }
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const getTransactionTypeLabel = (type) => {
    const typeMap = {
      WALLET_TOPUP: "Doładowanie portfela",
      GALLERY_PLAN: "Plan galerii",
      ADDON_PURCHASE: "Zakup dodatku",
      REFUND: "Zwrot",
    };
    return typeMap[type] || type;
  };

  const getTransactionStatusBadge = (status) => {
    const statusMap = {
      PAID: { color: "success", label: "Opłacone" },
      UNPAID: { color: "error", label: "Nieopłacone" },
      CANCELED: { color: "error", label: "Anulowane" },
      REFUNDED: { color: "warning", label: "Zwrócone" },
      FAILED: { color: "error", label: "Nieudane" },
    };
    
    const statusInfo = statusMap[status] || { color: "light", label: status };
    return (
      <Badge color={statusInfo.color} variant="light">
        {statusInfo.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
        Portfel
      </h1>

      {error && (
        <div className="p-4 bg-error-50 border border-error-200 rounded-lg text-error-600 dark:bg-error-500/10 dark:border-error-500/20 dark:text-error-400">
          {error}
        </div>
      )}

      {/* Balance Card */}
      <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
              Saldo portfela
            </div>
            <div className="text-4xl font-bold text-gray-900 dark:text-white">
              {balance !== null ? (balance / 100).toFixed(2) : "0.00"} PLN
            </div>
          </div>
          <Button variant="outline" onClick={loadBalance} disabled={loading}>
            Odśwież
          </Button>
        </div>

        {/* Quick Top-Up Buttons */}
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

        {/* Custom Top-Up */}
        <div>
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Własna kwota
          </div>
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="Kwota (min 20 PLN)"
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(e.target.value)}
              min="20"
              step="0.01"
              className="flex-1"
            />
            <Button
              variant="primary"
              onClick={() => handleTopUp()}
              disabled={loading}
            >
              Doładuj
            </Button>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Minimalna kwota doładowania: 20 PLN
          </p>
        </div>
      </div>

      {/* Transaction History */}
      <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Historia transakcji
          </h2>
          <Button variant="outline" size="sm" onClick={() => {
            setCurrentPage(1);
            setPageHistory([{ page: 1, cursor: null }]);
            loadTransactions(1, null);
          }} disabled={loading}>
            Odśwież
          </Button>
        </div>

        <div className="min-h-[530px] flex items-center justify-center">
          {loading ? (
            <Loading size="lg" text="Ładowanie transakcji..." />
          ) : transactions.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">
              Brak transakcji
            </p>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 dark:bg-gray-900">
                    <TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                      Data
                    </TableCell>
                    <TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                      Typ
                    </TableCell>
                    <TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                      Status
                    </TableCell>
                    <TableCell isHeader className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                      Kwota
                    </TableCell>
                    <TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                      Metoda płatności
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => {
                    const isCredit = tx.type === "WALLET_TOPUP";
                    const amount = tx.amountCents || tx.amount * 100 || 0;
                    
                    return (
                      <TableRow
                        key={tx.transactionId || tx.txnId}
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
                          {(amount / 100).toFixed(2)} PLN
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {tx.paymentMethod === "WALLET"
                            ? "Portfel"
                            : tx.paymentMethod === "STRIPE"
                            ? "Stripe"
                            : tx.paymentMethod === "MIXED"
                            ? "Mieszana"
                            : tx.paymentMethod || "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Pagination Controls */}
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
                disabled={loading || currentPage === 1}
              >
                Poprzednia
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={loading || !hasMore}
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
