import { Copy, ChevronDown } from "lucide-react";
import { useState } from "react";

import { useReferral } from "../../hooks/queries/useAuth";
import { useToast } from "../../hooks/useToast";
import Button from "../ui/button/Button";

const typeLabels: Record<string, string> = {
  "10_percent": "10% zniżki",
  "15_percent": "15% zniżki",
  free_small: "Darmowa galeria 1 GB",
  wallet_20pln: "Doładowanie portfela za 20 PLN",
};

const statusLabels: Record<string, string> = {
  Active: "Aktywny",
  Used: "Wykorzystany",
  Expired: "Wygasły",
};

export default function DiscountCodesSettings() {
  const { showToast } = useToast();
  const { data: referralData, isLoading, error } = useReferral();
  const [rulesOpen, setRulesOpen] = useState(false);

  const handleCopy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    showToast("success", "Skopiowano", label);
  };

  if (isLoading) {
    return (
      <div className="w-full p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full p-6">
        <p className="text-red-600 dark:text-red-400">Nie udało się załadować danych. Odśwież stronę.</p>
      </div>
    );
  }

  if (!referralData) {
    return null;
  }

  return (
    <div className="w-full min-h-full p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-photographer-heading dark:text-white">
          Moje kody rabatowe
        </h1>
        <p className="mt-2 text-sm text-photographer-text dark:text-gray-400">
          Kody działają tylko na plany 1 GB i 3 GB (1 lub 3 miesiące). Wykorzystaj je, kiedy chcesz!
        </p>
      </div>

      {/* Invite banner */}
      <div className="rounded-xl border border-photographer-border dark:border-gray-700 bg-photographer-elevated dark:bg-gray-800/50 p-6">
        <h2 className="text-lg font-semibold text-photographer-heading dark:text-white mb-2">
          Zaproś znajomych i zdobądź kody rabatowe na kolejne galerie!
        </h2>
        {referralData.referralLink ? (
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <input
              type="text"
              readOnly
              value={referralData.referralLink}
              className="flex-1 min-w-[200px] px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
            <Button
              variant="outline"
              onClick={() => handleCopy(referralData.referralLink ?? "", "Link zaproszenia")}
              className="inline-flex items-center gap-2"
            >
              <Copy size={16} />
              Kopiuj link
            </Button>
          </div>
        ) : (
          <p className="text-sm text-photographer-text dark:text-gray-400 mt-2">
            Opłać pierwszą galerię, żeby otrzymać swój link zaproszenia.
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-photographer-border dark:border-gray-700 p-4">
          <p className="text-xs text-photographer-text dark:text-gray-400">Udane zaproszenia</p>
          <p className="text-xl font-semibold text-photographer-heading dark:text-white">
            {referralData.referralCount}
          </p>
        </div>
        {referralData.topInviterBadge && (
          <div className="rounded-lg border border-photographer-accent/30 bg-photographer-accent/5 p-4 col-span-2 sm:col-span-1">
            <p className="text-sm font-medium text-photographer-accent">Odznaka Top Inviter</p>
          </div>
        )}
      </div>

      {/* Earned codes table */}
      <div>
        <h2 className="text-lg font-semibold text-photographer-heading dark:text-white mb-3">
          Zdobyte kody rabatowe
        </h2>
        {referralData.earnedDiscountCodes.length === 0 ? (
          <p className="text-sm text-photographer-text dark:text-gray-400">
            Nie masz jeszcze kodów. Zaproś znajomych – po opłaceniu przez nich pierwszej galerii
            otrzymasz kod rabatowy.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-photographer-border dark:border-gray-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-photographer-border dark:border-gray-700 bg-photographer-elevated dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 font-medium text-photographer-heading dark:text-white">
                    Typ
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-photographer-heading dark:text-white">
                    Ważny do
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-photographer-heading dark:text-white">
                    Status
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-photographer-heading dark:text-white">
                    Akcja
                  </th>
                </tr>
              </thead>
              <tbody>
                {referralData.earnedDiscountCodes.map((code) => (
                  <tr
                    key={code.codeId}
                    className="border-b border-photographer-border dark:border-gray-700 last:border-0"
                  >
                    <td className="px-4 py-3 text-photographer-text dark:text-gray-300">
                      {typeLabels[code.type] ?? code.type}
                    </td>
                    <td className="px-4 py-3 text-photographer-text dark:text-gray-300">
                      {new Date(code.expiresAt).toLocaleDateString("pl-PL")}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          code.status === "Active"
                            ? "text-green-600 dark:text-green-400"
                            : code.status === "Used"
                              ? "text-gray-500 dark:text-gray-400"
                              : "text-gray-400 dark:text-gray-500"
                        }
                      >
                        {statusLabels[code.status] ?? code.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {code.status === "Active" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopy(code.codeId, "Kod rabatowy")}
                          className="inline-flex items-center gap-1"
                        >
                          <Copy size={14} />
                          Kopiuj kod
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rules – collapsible */}
      <div className="rounded-lg border border-photographer-border dark:border-gray-700 overflow-hidden">
        <button
          type="button"
          onClick={() => setRulesOpen((open) => !open)}
          className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-photographer-elevated/50 dark:hover:bg-white/5 transition-colors"
          aria-expanded={rulesOpen}
        >
          <h2 className="text-lg font-semibold text-photographer-heading dark:text-white">
            Zasady programu
          </h2>
          <ChevronDown
            size={20}
            className={`ml-auto flex-shrink-0 text-photographer-text dark:text-gray-400 transition-transform duration-200 ${rulesOpen ? "rotate-180" : ""}`}
          />
        </button>
        {rulesOpen && (
          <div className="px-4 pb-4 pt-4 text-sm text-photographer-text dark:text-gray-400 space-y-3 border-t border-photographer-border dark:border-gray-700">
            <ul className="list-disc list-inside space-y-1">
              <li>Kto może zapraszać: po opłaceniu pierwszej galerii (nie tylko z bonusu powitalnego).</li>
            </ul>
            <div>
              <p className="mb-2 text-photographer-text dark:text-gray-400">Nagrody:</p>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-photographer-border dark:border-gray-600">
                    <th className="text-left py-2 pr-3 font-medium text-photographer-heading dark:text-white">
                      Liczba opłaconych zaproszeń*
                    </th>
                    <th className="text-left py-2 pr-3 font-medium text-photographer-heading dark:text-white">
                      Nagroda dla Ciebie
                    </th>
                    <th className="text-left py-2 font-medium text-photographer-heading dark:text-white">
                      Nagrody dla osoby poleconej
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-photographer-border dark:border-gray-600">
                    <td className="py-2 pr-3">1</td>
                    <td className="py-2 pr-3">Kod rabatowy 10%</td>
                    <td className="py-2">10% zniżki na pierwszą galerię</td>
                  </tr>
                  <tr className="border-b border-photographer-border dark:border-gray-600">
                    <td className="py-2 pr-3">3</td>
                    <td className="py-2 pr-3">Darmowa galeria 1 GB</td>
                    <td className="py-2">10% zniżki na pierwszą galerię</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3">10 lub więcej</td>
                    <td className="py-2 pr-3">Doładowanie portfela za 20 PLN** + odznaka Top Inviter</td>
                    <td className="py-2">15% zniżki na pierwszą galerię</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-xs text-photographer-text/80 dark:text-gray-500">
                * Liczba osób, które zaprosiłeś i które opłaciły swoją pierwszą galerię (płatność realna, nie tylko z bonusu powitalnego).<br />
                ** 20 PLN – jednorazowy bonus; środki do wykorzystania wyłącznie w naszym systemie.
              </p>
            </div>
            <ul className="list-disc list-inside space-y-1">
<li>Kody są ważne na plany 1 GB i 3 GB (1 lub 3 miesiące). Nie na plany 12-miesięczne ani 10 GB.</li>
          <li>Kody są ważne przez 6 miesięcy.</li>
              <li>Kody są jednorazowe.</li>
              <li>Nie można łączyć z innymi promocjami.</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
