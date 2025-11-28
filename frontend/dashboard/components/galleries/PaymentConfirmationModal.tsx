import Link from "next/link";

import { formatPrice, formatPriceNumber } from "../../lib/format-price";
import Button from "../ui/button/Button";
import { Modal } from "../ui/modal";

interface PaymentConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  totalAmountCents: number;
  walletBalanceCents: number;
  walletAmountCents: number;
  stripeAmountCents: number;
  paymentMethod?: "WALLET" | "STRIPE";
  stripeFeeCents?: number;
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
  paymentMethod,
  stripeFeeCents = 0,
  loading = false,
}: PaymentConfirmationModalProps) {
  const totalAmount = formatPriceNumber(totalAmountCents);
  const walletBalance = formatPriceNumber(walletBalanceCents);
  const walletAmount = formatPriceNumber(walletAmountCents);
  const stripeAmount = formatPriceNumber(stripeAmountCents);
  const stripeFee = formatPriceNumber(stripeFeeCents);
  const totalWithFee = totalAmountCents + stripeFeeCents;
  const totalWithFeeFormatted = formatPriceNumber(totalWithFee);

  // Use paymentMethod from props if available, otherwise calculate from amounts (backward compatibility)
  const isWalletOnly =
    paymentMethod === "WALLET" ||
    (paymentMethod === undefined && walletAmountCents === totalAmountCents);
  const isStripeOnly =
    paymentMethod === "STRIPE" ||
    (paymentMethod === undefined && stripeAmountCents === totalAmountCents);

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Potwierdzenie płatności
        </h2>

        <div className="space-y-4 mb-6">
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              {isStripeOnly ? "Kwota do zapłaty (z opłatami):" : "Całkowita kwota do zapłaty:"}
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {isStripeOnly ? totalWithFeeFormatted : totalAmount} PLN
            </div>
            {isStripeOnly && stripeFeeCents > 0 && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                (w tym {stripeFee} PLN opłaty transakcyjnej)
              </div>
            )}
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
                Saldo po płatności: {formatPrice(walletBalanceCents - walletAmountCents)}
              </div>
            </div>
          )}

          {isStripeOnly && (
            <div className="p-4 bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/20 rounded-lg">
              <div className="text-sm font-medium text-warning-800 dark:text-warning-200 mb-1">
                Płatność przez Stripe
              </div>
              <div className="text-xs text-warning-600 dark:text-warning-400">
                Zostaniesz przekierowany do Stripe aby dokonać płatności {totalWithFeeFormatted} PLN
                {stripeFeeCents > 0 && ` (w tym ${stripeFee} PLN opłaty transakcyjnej)`}
              </div>
              {walletBalanceCents > 0 && (
                <div className="text-xs text-warning-600 dark:text-warning-400 mt-1">
                  Uwaga: Masz {walletBalance} PLN w portfelu, ale to nie wystarczy na pełną płatność
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Anuluj
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={loading}>
            {loading
              ? "Przetwarzanie..."
              : isStripeOnly
                ? "Przejdź do płatności"
                : "Potwierdź płatność"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
