import { AlertTriangle } from "lucide-react";

import Button from "../button/Button";

interface DeletionPendingBannerProps {
  deletionScheduledAt: string;
  deletionReason?: "manual" | "inactivity";
  onUndo: () => void;
  loading?: boolean;
}

export const DeletionPendingBanner = ({
  deletionScheduledAt,
  deletionReason,
  onUndo,
  loading = false,
}: DeletionPendingBannerProps) => {
  const deletionDate = new Date(deletionScheduledAt);
  const daysRemaining = Math.ceil((deletionDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString("pl-PL", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getReasonText = () => {
    if (deletionReason === "inactivity") {
      return "z powodu nieaktywności";
    }
    return "na Twoją prośbę";
  };

  return (
    <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 mt-1">
          <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">
            Usunięcie konta zaplanowane
          </h3>
          <p className="text-base text-red-800 dark:text-red-300 mb-3">
            Twoje konto zostało zaplanowane do usunięcia {getReasonText()}.
          </p>
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 rounded border border-red-200 dark:border-red-700">
            <p className="text-sm font-medium text-red-900 dark:text-red-200 mb-1">
              Data usunięcia: {formatDate(deletionDate)}
            </p>
            <p className="text-sm text-red-800 dark:text-red-300">
              Pozostało dni: <strong>{daysRemaining}</strong>
            </p>
          </div>
          <div className="mb-4">
            <p className="text-sm font-medium text-red-900 dark:text-red-200 mb-2">
              Konsekwencje usunięcia konta:
            </p>
            <ul className="text-sm text-red-800 dark:text-red-300 list-disc list-inside space-y-1">
              <li>Twoje konto, profil, galerie, zdjęcia, klienci i pakiety zostaną trwale usunięte</li>
              <li>Galerie klientów będą zachowane do momentu ich wygaśnięcia</li>
              <li>Dane finansowe (saldo portfela, transakcje i faktury) zostaną zachowane zgodnie z wymogami prawnymi</li>
            </ul>
          </div>
          <div className="flex gap-3">
            <Button
              variant="danger"
              onClick={onUndo}
              disabled={loading}
            >
              {loading ? "Anulowanie..." : "Anuluj usunięcie konta"}
            </Button>
          </div>
          <p className="mt-3 text-xs text-red-700 dark:text-red-400">
            Po anulowaniu zostaniesz wylogowany i będziesz mógł zalogować się ponownie z pełnym dostępem do konta.
          </p>
        </div>
      </div>
    </div>
  );
};

