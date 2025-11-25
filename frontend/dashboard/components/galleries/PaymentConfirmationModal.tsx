import { Modal } from "../ui/modal";
import Button from "../ui/button/Button";

interface PaymentConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  totalAmountCents: number;
  walletBalanceCents: number;
  walletAmountCents: number;
  stripeAmountCents: number;
  loading?: boolean;
}

export default function PaymentConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  totalAmountCents,
  walletBalanceCents,
  walletAmountCents,
  stripeAmountCents,
  loading = false,
}: PaymentConfirmationModalProps) {
  const totalAmount = (totalAmountCents / 100).toFixed(2);
  const walletBalance = (walletBalanceCents / 100).toFixed(2);
  const walletAmount = (walletAmountCents / 100).toFixed(2);
  const stripeAmount = (stripeAmountCents / 100).toFixed(2);
  
  const isWalletOnly = walletAmountCents === totalAmountCents;
  const isStripeOnly = stripeAmountCents === totalAmountCents;
  const isSplitPayment = walletAmountCents > 0 && stripeAmountCents > 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Potwierdzenie płatności
        </h2>
        
        <div className="space-y-4 mb-6">
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Całkowita kwota do zapłaty:
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {totalAmount} PLN
            </div>
          </div>

          {isWalletOnly && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg">
              <div className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                Płatność z portfela
              </div>
              <div className="text-sm text-blue-900 dark:text-blue-50 font-medium">
                Z Twojego portfela zostanie pobrane {walletAmount} PLN
              </div>
              <div className="text-sm text-blue-800 dark:text-blue-100 mt-2">
                Saldo po płatności: {(walletBalanceCents - walletAmountCents) / 100} PLN
              </div>
            </div>
          )}

          {isStripeOnly && (
            <div className="p-4 bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/20 rounded-lg">
              <div className="text-sm font-medium text-warning-800 dark:text-warning-200 mb-1">
                Płatność przez Stripe
              </div>
              <div className="text-xs text-warning-600 dark:text-warning-400">
                Zostaniesz przekierowany do Stripe aby dokonać płatności {stripeAmount} PLN
              </div>
              {walletBalanceCents > 0 && (
                <div className="text-xs text-warning-600 dark:text-warning-400 mt-1">
                  Uwaga: Masz {walletBalance} PLN w portfelu, ale to nie wystarczy na pełną płatność
                </div>
              )}
            </div>
          )}

          {isSplitPayment && (
            <div className="space-y-2">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg">
                <div className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                  Część z portfela
                </div>
                <div className="text-sm text-blue-900 dark:text-blue-50 font-medium">
                  Z Twojego portfela zostanie pobrane {walletAmount} PLN
                </div>
                <div className="text-sm text-blue-800 dark:text-blue-100 mt-2">
                  Saldo po płatności: {(walletBalanceCents - walletAmountCents) / 100} PLN
                </div>
              </div>
              <div className="p-4 bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/20 rounded-lg">
                <div className="text-sm font-medium text-warning-800 dark:text-warning-200 mb-1">
                  Część przez Stripe
                </div>
                <div className="text-xs text-warning-600 dark:text-warning-400">
                  Zostaniesz przekierowany do Stripe aby dopłacić {stripeAmount} PLN
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Anuluj
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={loading}>
            {loading ? "Przetwarzanie..." : isStripeOnly ? "Przejdź do płatności" : "Potwierdź płatność"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

